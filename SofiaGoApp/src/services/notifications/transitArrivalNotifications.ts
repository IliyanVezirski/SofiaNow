import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StopEta } from '../../types/vehicles';
import { fetchStopEtas } from '../cgmApi/stopEtas';
import { getEtaScheduleInfo } from '../cgmApi/schedules';

let notificationsInitialized = false;
const STORAGE_KEY = 'transit-arrival-reminders';
const reminderListeners = new Set<() => void>();

export const DEFAULT_REMINDER_MINUTES = 2;
export const REMINDER_MINUTE_OPTIONS = [1, 2, 5, 10] as const;

export interface TransitArrivalReminderRequest {
    stopName: string;
    eta: StopEta;
    minutesBefore?: number;
}

export interface TransitArrivalReminderResult {
    ok: boolean;
    message: string;
    notificationId?: string;
}

export interface TransitArrivalReminderRefreshResult {
    ok: boolean;
    checkedCount: number;
    updatedCount: number;
    removedCount: number;
    message: string;
}

export interface StoredTransitArrivalReminder {
    reminderKey: string;
    notificationId: string;
    stopName: string;
    stopId: string;
    routeId: string;
    tripId: string;
    line: string;
    destination?: string;
    arrivalTimestamp: number;
    remindAtTimestamp: number;
    minutesBefore: number;
    scheduledArrivalTimestamp?: number | null;
    latestDelayMinutes?: number | null;
    lastRefreshUnix?: number | null;
}

const buildReminderKey = (eta: Pick<StopEta, 'tripId' | 'stopId' | 'routeId' | 'line'>) => `${eta.tripId}:${eta.stopId}:${eta.routeId}:${eta.line}`;

const matchesReminderToEta = (reminder: StoredTransitArrivalReminder, eta: Pick<StopEta, 'tripId' | 'stopId' | 'routeId' | 'line'>) => (
    reminder.tripId === eta.tripId &&
    reminder.stopId === eta.stopId &&
    reminder.routeId === eta.routeId &&
    reminder.line === eta.line
);

const formatClock = (unixSeconds: number) => {
    const date = new Date(unixSeconds * 1000);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const formatDelayText = (delayMinutes: number | null | undefined) => {
    if (delayMinutes == null) {
        return null;
    }

    if (delayMinutes > 0) {
        return `закъснява с ${delayMinutes} мин`;
    }

    if (delayMinutes < 0) {
        return `идва с ${Math.abs(delayMinutes)} мин по-рано`;
    }

    return 'е по разписание';
};

const buildReminderBody = ({
    stopName,
    eta,
    minutesBefore,
    delayMinutes,
}: {
    stopName: string;
    eta: StopEta;
    minutesBefore: number;
    delayMinutes?: number | null;
}) => {
    const arrivalText = formatClock(eta.arrivalTimestamp);
    const delayText = formatDelayText(delayMinutes);
    const base = eta.destination
        ? `${eta.line} към ${eta.destination} ще е на ${stopName} около ${arrivalText}`
        : `Линия ${eta.line} ще е на ${stopName} около ${arrivalText}`;

    return delayText
        ? `${base} и ${delayText}. Напомнянето е ${minutesBefore} мин по-рано.`
        : `${base}. Напомнянето е ${minutesBefore} мин по-рано.`;
};

const scheduleReminderNotification = async ({
    stopName,
    eta,
    minutesBefore,
    existingNotificationId,
}: {
    stopName: string;
    eta: StopEta;
    minutesBefore: number;
    existingNotificationId?: string | null;
}) => {
    const nowUnix = Math.floor(Date.now() / 1000);
    const triggerSeconds = eta.arrivalTimestamp - nowUnix - (minutesBefore * 60);

    if (triggerSeconds <= -60) {
        return {
            ok: false as const,
            message: `Линия ${eta.line} вече е твърде близо до спирката.`,
        };
    }

    if (existingNotificationId) {
        await Notifications.cancelScheduledNotificationAsync(existingNotificationId);
    }

    const scheduleInfo = getEtaScheduleInfo({
        stopId: eta.stopId,
        routeId: eta.routeId,
        arrivalTimestamp: eta.arrivalTimestamp,
    });

    const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
            title: `Линия ${eta.line} идва скоро`,
            body: buildReminderBody({
                stopName,
                eta,
                minutesBefore,
                delayMinutes: scheduleInfo.delayMinutes,
            }),
            sound: true,
            data: {
                stopId: eta.stopId,
                routeId: eta.routeId,
                tripId: eta.tripId,
                line: eta.line,
                minutesBefore,
                arrivalTimestamp: eta.arrivalTimestamp,
                delayMinutes: scheduleInfo.delayMinutes,
            },
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: Math.max(1, triggerSeconds),
            channelId: 'transit-arrivals',
        },
    });

    return {
        ok: true as const,
        notificationId,
        delayMinutes: scheduleInfo.delayMinutes,
        remindAtTimestamp: eta.arrivalTimestamp - (minutesBefore * 60),
    };
};

const pickMatchingEta = (reminder: StoredTransitArrivalReminder, etas: StopEta[]) => {
    if (!etas.length) {
        return null;
    }

    const exactTrip = etas.find((eta) => eta.tripId === reminder.tripId && eta.line === reminder.line);
    if (exactTrip) {
        return exactTrip;
    }

    const sameLineAndDestination = etas
        .filter((eta) => eta.line === reminder.line && (!reminder.destination || eta.destination === reminder.destination))
        .sort((left, right) => Math.abs(left.arrivalTimestamp - reminder.arrivalTimestamp) - Math.abs(right.arrivalTimestamp - reminder.arrivalTimestamp));
    if (sameLineAndDestination.length) {
        return sameLineAndDestination[0];
    }

    const sameLine = etas
        .filter((eta) => eta.line === reminder.line)
        .sort((left, right) => Math.abs(left.arrivalTimestamp - reminder.arrivalTimestamp) - Math.abs(right.arrivalTimestamp - reminder.arrivalTimestamp));
    return sameLine[0] ?? null;
};

const readStoredReminders = async (): Promise<StoredTransitArrivalReminder[]> => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw) as StoredTransitArrivalReminder[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const writeStoredReminders = async (reminders: StoredTransitArrivalReminder[]) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
    reminderListeners.forEach((listener) => listener());
};

export const subscribeToTransitArrivalReminderChanges = (listener: () => void) => {
    reminderListeners.add(listener);
    return () => {
        reminderListeners.delete(listener);
    };
};

const pruneExpiredReminders = async () => {
    const nowUnix = Math.floor(Date.now() / 1000);
    const reminders = await readStoredReminders();
    const activeReminders = reminders.filter((item) => item.arrivalTimestamp > nowUnix);
    if (activeReminders.length !== reminders.length) {
        await writeStoredReminders(activeReminders);
    }
    return activeReminders;
};

export const getTransitArrivalReminder = async (eta: StopEta) => {
    const reminders = await pruneExpiredReminders();
    const reminderKey = buildReminderKey(eta);
    return reminders.find((item) => item.reminderKey === reminderKey || matchesReminderToEta(item, eta)) ?? null;
};

export const listTransitArrivalReminders = async () => {
    const reminders = await pruneExpiredReminders();
    return reminders.sort((left, right) => left.remindAtTimestamp - right.remindAtTimestamp);
};

export const cancelTransitArrivalReminder = async (eta: StopEta) => {
    const reminders = await readStoredReminders();
    const reminderKey = buildReminderKey(eta);
    const existing = reminders.find((item) => item.reminderKey === reminderKey || matchesReminderToEta(item, eta)) ?? null;

    if (!existing) {
        return {
            ok: false,
            message: 'Няма активно напомняне за тази линия.',
        };
    }

    await Notifications.cancelScheduledNotificationAsync(existing.notificationId);
    await writeStoredReminders(reminders.filter((item) => item.reminderKey !== reminderKey));

    return {
        ok: true,
        message: `Напомнянето за линия ${existing.line} е премахнато.`,
    };
};

export const cancelStoredTransitArrivalReminder = async (reminderKey: string) => {
    const reminders = await readStoredReminders();
    const existing = reminders.find((item) => item.reminderKey === reminderKey) ?? null;

    if (!existing) {
        return {
            ok: false,
            message: 'Напомнянето вече не е активно.',
        };
    }

    await Notifications.cancelScheduledNotificationAsync(existing.notificationId);
    await writeStoredReminders(reminders.filter((item) => item.reminderKey !== reminderKey));

    return {
        ok: true,
        message: `Премахнато е напомнянето за линия ${existing.line}.`,
    };
};

export const initializeTransitArrivalNotifications = async () => {
    if (!notificationsInitialized) {
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowBanner: true,
                shouldShowList: true,
                shouldPlaySound: true,
                shouldSetBadge: false,
            }),
        });

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('transit-arrivals', {
                name: 'Transit arrivals',
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#1D4ED8',
            });
        }

        notificationsInitialized = true;
    }
};

export const ensureTransitNotificationPermissions = async () => {
    await initializeTransitArrivalNotifications();

    const current = await Notifications.getPermissionsAsync();
    if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
        return true;
    }

    const requested = await Notifications.requestPermissionsAsync({
        ios: {
            allowAlert: true,
            allowBadge: false,
            allowSound: true,
        },
    });

    return requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
};

export const scheduleTransitArrivalReminder = async ({
    stopName,
    eta,
    minutesBefore = DEFAULT_REMINDER_MINUTES,
}: TransitArrivalReminderRequest): Promise<TransitArrivalReminderResult> => {
    const granted = await ensureTransitNotificationPermissions();
    if (!granted) {
        return {
            ok: false,
            message: 'Няма разрешение за известия.',
        };
    }

    const existingReminder = await getTransitArrivalReminder(eta);
    const scheduled = await scheduleReminderNotification({
        stopName,
        eta,
        minutesBefore,
        existingNotificationId: existingReminder?.notificationId || null,
    });

    if (!scheduled.ok) {
        return {
            ok: false,
            message: scheduled.message,
        };
    }

    const reminderKey = buildReminderKey(eta);
    const reminders = await readStoredReminders();
    const nextReminder: StoredTransitArrivalReminder = {
        reminderKey,
        notificationId: scheduled.notificationId,
        stopName,
        stopId: eta.stopId,
        routeId: eta.routeId,
        tripId: eta.tripId,
        line: eta.line,
        destination: eta.destination,
        arrivalTimestamp: eta.arrivalTimestamp,
        remindAtTimestamp: scheduled.remindAtTimestamp,
        minutesBefore,
        scheduledArrivalTimestamp: eta.arrivalTimestamp,
        latestDelayMinutes: scheduled.delayMinutes,
        lastRefreshUnix: Math.floor(Date.now() / 1000),
    };
    await writeStoredReminders([
        ...reminders.filter((item) => item.reminderKey !== reminderKey && !matchesReminderToEta(item, eta)),
        nextReminder,
    ]);

    return {
        ok: true,
        notificationId: scheduled.notificationId,
        message: `Ще получите известие ${minutesBefore} мин преди линия ${eta.line}.`,
    };
};

export const refreshTransitArrivalReminders = async (): Promise<TransitArrivalReminderRefreshResult> => {
    const reminders = await pruneExpiredReminders();
    if (!reminders.length) {
        return {
            ok: true,
            checkedCount: 0,
            updatedCount: 0,
            removedCount: 0,
            message: 'Няма активни напомняния за обновяване.',
        };
    }

    const etasByStopId = await fetchStopEtas(Array.from(new Set(reminders.map((item) => item.stopId))));
    const nextReminders: StoredTransitArrivalReminder[] = [];
    let updatedCount = 0;
    let removedCount = 0;

    for (const reminder of reminders) {
        const matchingEta = pickMatchingEta(reminder, etasByStopId[reminder.stopId] ?? []);
        if (!matchingEta) {
            nextReminders.push(reminder);
            continue;
        }

        const scheduled = await scheduleReminderNotification({
            stopName: reminder.stopName,
            eta: matchingEta,
            minutesBefore: reminder.minutesBefore,
            existingNotificationId: reminder.notificationId,
        });

        if (!scheduled.ok) {
            await Notifications.cancelScheduledNotificationAsync(reminder.notificationId);
            removedCount += 1;
            continue;
        }

        const changed =
            reminder.arrivalTimestamp !== matchingEta.arrivalTimestamp ||
            reminder.notificationId !== scheduled.notificationId ||
            reminder.latestDelayMinutes !== scheduled.delayMinutes;

        if (changed) {
            updatedCount += 1;
        }

        nextReminders.push({
            ...reminder,
            reminderKey: buildReminderKey(matchingEta),
            notificationId: scheduled.notificationId,
            tripId: matchingEta.tripId,
            routeId: matchingEta.routeId,
            line: matchingEta.line,
            destination: matchingEta.destination,
            arrivalTimestamp: matchingEta.arrivalTimestamp,
            remindAtTimestamp: scheduled.remindAtTimestamp,
            scheduledArrivalTimestamp: reminder.scheduledArrivalTimestamp ?? matchingEta.arrivalTimestamp,
            latestDelayMinutes: scheduled.delayMinutes,
            lastRefreshUnix: Math.floor(Date.now() / 1000),
        });
    }

    await writeStoredReminders(nextReminders);

    return {
        ok: true,
        checkedCount: reminders.length,
        updatedCount,
        removedCount,
        message: `Проверени ${reminders.length} напомняния, обновени ${updatedCount}.`,
    };
};