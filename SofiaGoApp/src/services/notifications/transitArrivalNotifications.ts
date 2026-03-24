import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StopEta } from '../../types/vehicles';
import { fetchStopEtas } from '../cgmApi/stopEtas';
import { getEtaScheduleInfo } from '../cgmApi/schedules';

let notificationsInitialized = false;
const STORAGE_KEY = 'transit-arrival-reminders';
const reminderListeners = new Set<() => void>();
const TRANSIT_NOTIFICATION_CHANNEL_ID = 'transit-arrivals-v2';
const DEFAULT_NOTIFICATION_SOUND = Platform.OS === 'ios' ? 'default' : undefined;

export const DEFAULT_REMINDER_MINUTES = 2;
export const REMINDER_MINUTE_OPTIONS = [1, 2, 5, 10] as const;
export const DEFAULT_DELAY_FOLLOW_UP_THRESHOLD_MINUTES = 6;
export const DEFAULT_DELAY_FOLLOW_UP_LEAD_MINUTES = 1;

export interface TransitArrivalReminderRequest {
    stopName: string;
    eta: StopEta;
    minutesBefore?: number;
    delayFollowUpEnabled?: boolean;
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
    followUpNotificationId?: string | null;
    minuteRepeatNotificationIds?: string[];
    followUpTripId?: string | null;
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
    delayFollowUpEnabled?: boolean;
    followUpDelayThresholdMinutes?: number | null;
}

const normalizeNotificationIds = (notificationIds?: string[] | null) =>
    Array.from(new Set((notificationIds || []).map((item) => String(item || '').trim()).filter(Boolean)));

const cancelNotificationIds = async (notificationIds?: string[] | null) => {
    const normalized = normalizeNotificationIds(notificationIds);
    await Promise.all(normalized.map((notificationId) => Notifications.cancelScheduledNotificationAsync(notificationId)));
};

const getScheduledArrivalTimestamp = (eta: Pick<StopEta, 'stopId' | 'routeId' | 'arrivalTimestamp'>) => {
    const scheduleInfo = getEtaScheduleInfo({
        stopId: eta.stopId,
        routeId: eta.routeId,
        arrivalTimestamp: eta.arrivalTimestamp,
    });

    if (scheduleInfo.scheduledMinSinceMidnight == null) {
        return null;
    }

    const arrivalDate = new Date(eta.arrivalTimestamp * 1000);
    const midnight = new Date(arrivalDate);
    midnight.setHours(0, 0, 0, 0);

    let scheduledTimestamp = Math.floor(midnight.getTime() / 1000) + (scheduleInfo.scheduledMinSinceMidnight * 60);
    const diffSeconds = scheduledTimestamp - eta.arrivalTimestamp;
    if (diffSeconds > 12 * 3600) {
        scheduledTimestamp -= 24 * 3600;
    } else if (diffSeconds < -12 * 3600) {
        scheduledTimestamp += 24 * 3600;
    }

    return scheduledTimestamp;
};

const buildReminderKey = ({
    tripId,
    stopId,
    routeId,
    line,
    destination,
    scheduledArrivalTimestamp,
}: {
    tripId?: string | null;
    stopId: string;
    routeId?: string | null;
    line: string;
    destination?: string | null;
    scheduledArrivalTimestamp?: number | null;
}) => {
    if (scheduledArrivalTimestamp != null) {
        return `schedule:${stopId}:${line}:${destination || ''}:${scheduledArrivalTimestamp}`;
    }

    return `trip:${tripId || ''}:${stopId}:${routeId || ''}:${line}`;
};

const matchesReminderToEta = (reminder: StoredTransitArrivalReminder, eta: Pick<StopEta, 'tripId' | 'stopId' | 'routeId' | 'line'>) => (
    (
        reminder.tripId === eta.tripId &&
        reminder.stopId === eta.stopId &&
        reminder.routeId === eta.routeId &&
        reminder.line === eta.line
    )
);

const matchesReminderToScheduledEta = (reminder: StoredTransitArrivalReminder, eta: StopEta) => {
    if (reminder.stopId !== eta.stopId || reminder.line !== eta.line) {
        return false;
    }

    if (reminder.destination && eta.destination && reminder.destination !== eta.destination) {
        return false;
    }

    if (reminder.scheduledArrivalTimestamp == null) {
        return false;
    }

    const scheduledArrivalTimestamp = getScheduledArrivalTimestamp(eta);
    return scheduledArrivalTimestamp != null && scheduledArrivalTimestamp === reminder.scheduledArrivalTimestamp;
};

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
    isFollowUp = false,
    targetArrivalTimestamp,
}: {
    stopName: string;
    eta: StopEta;
    minutesBefore: number;
    delayMinutes?: number | null;
    isFollowUp?: boolean;
    targetArrivalTimestamp?: number | null;
}) => {
    const arrivalText = formatClock(targetArrivalTimestamp ?? eta.arrivalTimestamp);
    const delayText = formatDelayText(delayMinutes);
    const base = eta.destination
        ? `${eta.line} към ${eta.destination} ще е на ${stopName} около ${arrivalText}`
        : `Линия ${eta.line} ще е на ${stopName} около ${arrivalText}`;

    if (isFollowUp) {
        return delayText
            ? `${base}. Актуализация: ${delayText}.`
            : `${base}. Актуализирано време на пристигане.`;
    }

    return delayText
        ? `${base} и ${delayText}. Напомнянето е ${minutesBefore} мин по-рано.`
        : `${base}. Напомнянето е ${minutesBefore} мин по-рано.`;
};

const buildMinuteRepeatBody = ({
    reminder,
    eta,
}: {
    reminder: StoredTransitArrivalReminder;
    eta: StopEta;
}) => {
    const arrivalText = formatClock(eta.arrivalTimestamp);
    const delayText = formatDelayText(getEtaScheduleInfo({
        stopId: eta.stopId,
        routeId: eta.routeId,
        arrivalTimestamp: eta.arrivalTimestamp,
    }).delayMinutes);
    const base = eta.destination
        ? `${eta.line} към ${eta.destination} още наближава ${reminder.stopName} около ${arrivalText}`
        : `Линия ${eta.line} още наближава ${reminder.stopName} около ${arrivalText}`;

    return delayText ? `${base} и ${delayText}.` : `${base}.`;
};

const scheduleMinuteRepeatNotifications = async ({
    reminder,
    eta,
}: {
    reminder: StoredTransitArrivalReminder;
    eta: StopEta;
}) => {
    await cancelNotificationIds(reminder.minuteRepeatNotificationIds);

    const nowUnix = Math.floor(Date.now() / 1000);
    const startUnix = Math.max(reminder.remindAtTimestamp + 60, nowUnix + 60);
    const endUnix = eta.arrivalTimestamp;
    const notificationIds: string[] = [];

    for (let triggerUnix = startUnix; triggerUnix < endUnix; triggerUnix += 60) {
        const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
                title: `Линия ${eta.line} наближава`,
                body: buildMinuteRepeatBody({ reminder, eta }),
                sound: DEFAULT_NOTIFICATION_SOUND,
                priority: Notifications.AndroidNotificationPriority.MAX,
                vibrate: [0, 400, 250, 400],
                color: '#0F766E',
                data: {
                    reminderKey: reminder.reminderKey,
                    stopId: eta.stopId,
                    routeId: eta.routeId,
                    tripId: eta.tripId,
                    line: eta.line,
                    arrivalTimestamp: eta.arrivalTimestamp,
                    isMinuteRepeat: true,
                },
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: Math.max(1, triggerUnix - nowUnix),
                channelId: TRANSIT_NOTIFICATION_CHANNEL_ID,
            },
        });

        notificationIds.push(notificationId);
    }

    return notificationIds;
};

const scheduleReminderNotification = async ({
    stopName,
    eta,
    minutesBefore,
    existingNotificationId,
    title,
    isFollowUp = false,
    targetArrivalTimestamp,
}: {
    stopName: string;
    eta: StopEta;
    minutesBefore: number;
    existingNotificationId?: string | null;
    title?: string;
    isFollowUp?: boolean;
    targetArrivalTimestamp?: number | null;
}) => {
    const nowUnix = Math.floor(Date.now() / 1000);
    const effectiveArrivalTimestamp = targetArrivalTimestamp ?? eta.arrivalTimestamp;
    const triggerSeconds = effectiveArrivalTimestamp - nowUnix - (minutesBefore * 60);

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
            title: title || `Линия ${eta.line} идва скоро`,
            body: buildReminderBody({
                stopName,
                eta,
                minutesBefore,
                delayMinutes: scheduleInfo.delayMinutes,
                isFollowUp,
                targetArrivalTimestamp: effectiveArrivalTimestamp,
            }),
            sound: DEFAULT_NOTIFICATION_SOUND,
            priority: Notifications.AndroidNotificationPriority.MAX,
            vibrate: [0, 400, 250, 400],
            color: '#0F766E',
            data: {
                stopId: eta.stopId,
                routeId: eta.routeId,
                tripId: eta.tripId,
                line: eta.line,
                minutesBefore,
                arrivalTimestamp: eta.arrivalTimestamp,
                targetArrivalTimestamp: effectiveArrivalTimestamp,
                delayMinutes: scheduleInfo.delayMinutes,
                isFollowUp,
            },
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: Math.max(1, triggerSeconds),
            channelId: TRANSIT_NOTIFICATION_CHANNEL_ID,
        },
    });

    return {
        ok: true as const,
        notificationId,
        delayMinutes: scheduleInfo.delayMinutes,
        remindAtTimestamp: effectiveArrivalTimestamp - (minutesBefore * 60),
    };
};

const scheduleDelayFollowUpNotification = async ({
    reminder,
    eta,
}: {
    reminder: StoredTransitArrivalReminder;
    eta: StopEta | null;
}) => {
    if (!reminder.delayFollowUpEnabled) {
        if (reminder.followUpNotificationId) {
            await Notifications.cancelScheduledNotificationAsync(reminder.followUpNotificationId);
        }
        return { notificationId: null, delayMinutes: null, followUpTripId: null };
    }

    if (!eta) {
        if (reminder.followUpNotificationId) {
            await Notifications.cancelScheduledNotificationAsync(reminder.followUpNotificationId);
        }
        return { notificationId: null, delayMinutes: null, followUpTripId: null };
    }

    const scheduleInfo = getEtaScheduleInfo({
        stopId: eta.stopId,
        routeId: eta.routeId,
        arrivalTimestamp: eta.arrivalTimestamp,
    });
    const threshold = reminder.followUpDelayThresholdMinutes ?? DEFAULT_DELAY_FOLLOW_UP_THRESHOLD_MINUTES;

    if (scheduleInfo.delayMinutes == null || scheduleInfo.delayMinutes < threshold) {
        if (reminder.followUpNotificationId) {
            await Notifications.cancelScheduledNotificationAsync(reminder.followUpNotificationId);
        }
        return { notificationId: null, delayMinutes: scheduleInfo.delayMinutes, followUpTripId: null };
    }

    const existingNotificationId = reminder.followUpNotificationId || null;
    const scheduled = await scheduleReminderNotification({
        stopName: reminder.stopName,
        eta,
        minutesBefore: DEFAULT_DELAY_FOLLOW_UP_LEAD_MINUTES,
        existingNotificationId,
        title: `Линия ${eta.line} още закъснява`,
        isFollowUp: true,
    });

    if (!scheduled.ok) {
        return { notificationId: null, delayMinutes: scheduleInfo.delayMinutes, followUpTripId: reminder.followUpTripId || eta.tripId };
    }

    return {
        notificationId: scheduled.notificationId,
        delayMinutes: scheduled.delayMinutes,
        followUpTripId: reminder.followUpTripId || eta.tripId,
    };
};

const pickFollowUpEta = (reminder: StoredTransitArrivalReminder, etas: StopEta[], fallbackEta: StopEta | null) => {
    if (reminder.followUpTripId) {
        return etas.find((eta) => eta.tripId === reminder.followUpTripId && eta.line === reminder.line) ?? null;
    }

    return fallbackEta;
};

const pickMatchingEta = (reminder: StoredTransitArrivalReminder, etas: StopEta[]) => {
    if (!etas.length) {
        return null;
    }

    if (reminder.scheduledArrivalTimestamp != null) {
        const byScheduledTime = etas
            .filter((eta) => eta.line === reminder.line && (!reminder.destination || eta.destination === reminder.destination))
            .sort((left, right) => {
                const leftScheduled = getScheduledArrivalTimestamp(left) ?? left.arrivalTimestamp;
                const rightScheduled = getScheduledArrivalTimestamp(right) ?? right.arrivalTimestamp;
                return Math.abs(leftScheduled - reminder.scheduledArrivalTimestamp!) - Math.abs(rightScheduled - reminder.scheduledArrivalTimestamp!);
            });

        if (byScheduledTime.length) {
            return byScheduledTime[0];
        }
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
        await Promise.all(reminders.filter((item) => item.arrivalTimestamp <= nowUnix).map(async (item) => {
            if (item.followUpNotificationId) {
                await Notifications.cancelScheduledNotificationAsync(item.followUpNotificationId);
            }
            await cancelNotificationIds(item.minuteRepeatNotificationIds);
        }));
        await writeStoredReminders(activeReminders);
    }
    return activeReminders;
};

export const getTransitArrivalReminder = async (eta: StopEta) => {
    const reminders = await pruneExpiredReminders();
    const scheduledArrivalTimestamp = getScheduledArrivalTimestamp(eta);
    const reminderKey = buildReminderKey({
        tripId: eta.tripId,
        stopId: eta.stopId,
        routeId: eta.routeId,
        line: eta.line,
        destination: eta.destination,
        scheduledArrivalTimestamp,
    });
    return reminders.find((item) => item.reminderKey === reminderKey || matchesReminderToScheduledEta(item, eta) || matchesReminderToEta(item, eta)) ?? null;
};

export const listTransitArrivalReminders = async () => {
    const reminders = await pruneExpiredReminders();
    return reminders.sort((left, right) => left.remindAtTimestamp - right.remindAtTimestamp);
};

export const cancelTransitArrivalReminder = async (eta: StopEta) => {
    const reminders = await readStoredReminders();
    const scheduledArrivalTimestamp = getScheduledArrivalTimestamp(eta);
    const reminderKey = buildReminderKey({
        tripId: eta.tripId,
        stopId: eta.stopId,
        routeId: eta.routeId,
        line: eta.line,
        destination: eta.destination,
        scheduledArrivalTimestamp,
    });
    const existing = reminders.find((item) => item.reminderKey === reminderKey || matchesReminderToScheduledEta(item, eta) || matchesReminderToEta(item, eta)) ?? null;

    if (!existing) {
        return {
            ok: false,
            message: 'Няма активно напомняне за тази линия.',
        };
    }

    await Notifications.cancelScheduledNotificationAsync(existing.notificationId);
    if (existing.followUpNotificationId) {
        await Notifications.cancelScheduledNotificationAsync(existing.followUpNotificationId);
    }
    await cancelNotificationIds(existing.minuteRepeatNotificationIds);
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
    if (existing.followUpNotificationId) {
        await Notifications.cancelScheduledNotificationAsync(existing.followUpNotificationId);
    }
    await cancelNotificationIds(existing.minuteRepeatNotificationIds);
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
                priority: Notifications.AndroidNotificationPriority.MAX,
            }),
        });

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync(TRANSIT_NOTIFICATION_CHANNEL_ID, {
                name: 'Transit arrivals',
                importance: Notifications.AndroidImportance.MAX,
                enableLights: true,
                enableVibrate: true,
                vibrationPattern: [0, 400, 250, 400],
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
    delayFollowUpEnabled = false,
}: TransitArrivalReminderRequest): Promise<TransitArrivalReminderResult> => {
    const granted = await ensureTransitNotificationPermissions();
    if (!granted) {
        return {
            ok: false,
            message: 'Няма разрешение за известия.',
        };
    }

    const existingReminder = await getTransitArrivalReminder(eta);
    const scheduledArrivalTimestamp = getScheduledArrivalTimestamp(eta);
    const scheduled = await scheduleReminderNotification({
        stopName,
        eta,
        minutesBefore,
        existingNotificationId: existingReminder?.notificationId || null,
        targetArrivalTimestamp: scheduledArrivalTimestamp ?? eta.arrivalTimestamp,
    });

    if (!scheduled.ok) {
        return {
            ok: false,
            message: scheduled.message,
        };
    }

    const reminderKey = buildReminderKey({
        tripId: eta.tripId,
        stopId: eta.stopId,
        routeId: eta.routeId,
        line: eta.line,
        destination: eta.destination,
        scheduledArrivalTimestamp,
    });
    const reminders = await readStoredReminders();
    const nextReminder: StoredTransitArrivalReminder = {
        reminderKey,
        notificationId: scheduled.notificationId,
        followUpNotificationId: existingReminder?.followUpNotificationId || null,
        minuteRepeatNotificationIds: existingReminder?.minuteRepeatNotificationIds || [],
        followUpTripId: existingReminder?.followUpTripId || null,
        stopName,
        stopId: eta.stopId,
        routeId: eta.routeId,
        tripId: eta.tripId,
        line: eta.line,
        destination: eta.destination,
        arrivalTimestamp: eta.arrivalTimestamp,
        remindAtTimestamp: scheduled.remindAtTimestamp,
        minutesBefore,
        scheduledArrivalTimestamp,
        latestDelayMinutes: scheduled.delayMinutes,
        lastRefreshUnix: Math.floor(Date.now() / 1000),
        delayFollowUpEnabled,
        followUpDelayThresholdMinutes: DEFAULT_DELAY_FOLLOW_UP_THRESHOLD_MINUTES,
    };

    const followUp = await scheduleDelayFollowUpNotification({
        reminder: nextReminder,
        eta,
    });
    nextReminder.followUpNotificationId = followUp.notificationId;
    nextReminder.followUpTripId = followUp.followUpTripId;
    nextReminder.minuteRepeatNotificationIds = await scheduleMinuteRepeatNotifications({
        reminder: nextReminder,
        eta,
    });
    await writeStoredReminders([
        ...reminders.filter((item) => item.reminderKey !== reminderKey && !matchesReminderToScheduledEta(item, eta) && !matchesReminderToEta(item, eta)),
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
    const nowUnix = Math.floor(Date.now() / 1000);

    for (const reminder of reminders) {
        const stopEtas = etasByStopId[reminder.stopId] ?? [];
        const matchingEta = pickMatchingEta(reminder, stopEtas);
        if (!matchingEta) {
            nextReminders.push(reminder);
            continue;
        }

        const primaryTargetArrivalTimestamp = reminder.scheduledArrivalTimestamp ?? getScheduledArrivalTimestamp(matchingEta) ?? matchingEta.arrivalTimestamp;
        const primaryAlreadyDue = reminder.remindAtTimestamp <= nowUnix;

        let nextNotificationId = reminder.notificationId;
        let nextRemindAtTimestamp = reminder.remindAtTimestamp;
        let nextDelayMinutes = reminder.latestDelayMinutes ?? null;

        if (!primaryAlreadyDue) {
            const scheduled = await scheduleReminderNotification({
                stopName: reminder.stopName,
                eta: matchingEta,
                minutesBefore: reminder.minutesBefore,
                existingNotificationId: reminder.notificationId,
                targetArrivalTimestamp: primaryTargetArrivalTimestamp,
            });

            if (!scheduled.ok) {
                await Notifications.cancelScheduledNotificationAsync(reminder.notificationId);
                if (reminder.followUpNotificationId) {
                    await Notifications.cancelScheduledNotificationAsync(reminder.followUpNotificationId);
                }
                await cancelNotificationIds(reminder.minuteRepeatNotificationIds);
                removedCount += 1;
                continue;
            }

            nextNotificationId = scheduled.notificationId;
            nextRemindAtTimestamp = scheduled.remindAtTimestamp;
            nextDelayMinutes = scheduled.delayMinutes;
        }

        const followUp = await scheduleDelayFollowUpNotification({
            reminder,
            eta: pickFollowUpEta(reminder, stopEtas, matchingEta),
        });

        const minuteRepeatNotificationIds = await scheduleMinuteRepeatNotifications({
            reminder: {
                ...reminder,
                tripId: matchingEta.tripId,
                routeId: matchingEta.routeId,
                line: matchingEta.line,
                destination: matchingEta.destination,
                arrivalTimestamp: matchingEta.arrivalTimestamp,
                latestDelayMinutes: nextDelayMinutes,
            },
            eta: matchingEta,
        });

        const changed =
            reminder.arrivalTimestamp !== matchingEta.arrivalTimestamp ||
            reminder.notificationId !== nextNotificationId ||
            reminder.latestDelayMinutes !== nextDelayMinutes ||
            reminder.followUpNotificationId !== followUp.notificationId ||
            JSON.stringify(normalizeNotificationIds(reminder.minuteRepeatNotificationIds)) !== JSON.stringify(normalizeNotificationIds(minuteRepeatNotificationIds));

        if (changed) {
            updatedCount += 1;
        }

        const nextScheduledArrivalTimestamp = reminder.scheduledArrivalTimestamp ?? getScheduledArrivalTimestamp(matchingEta) ?? null;

        nextReminders.push({
            ...reminder,
            reminderKey: buildReminderKey({
                tripId: matchingEta.tripId,
                stopId: matchingEta.stopId,
                routeId: matchingEta.routeId,
                line: matchingEta.line,
                destination: matchingEta.destination,
                scheduledArrivalTimestamp: nextScheduledArrivalTimestamp,
            }),
            notificationId: nextNotificationId,
            tripId: matchingEta.tripId,
            routeId: matchingEta.routeId,
            line: matchingEta.line,
            destination: matchingEta.destination,
            arrivalTimestamp: matchingEta.arrivalTimestamp,
            remindAtTimestamp: nextRemindAtTimestamp,
            scheduledArrivalTimestamp: nextScheduledArrivalTimestamp,
            latestDelayMinutes: nextDelayMinutes,
            lastRefreshUnix: Math.floor(Date.now() / 1000),
            followUpNotificationId: followUp.notificationId,
            followUpTripId: followUp.followUpTripId,
            minuteRepeatNotificationIds,
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