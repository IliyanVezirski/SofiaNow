import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { StopEta } from '../../types/vehicles';
import { fetchStopEtas } from '../cgmApi/stopEtas';
import { getEtaScheduleInfo } from '../cgmApi/schedules';
import {
    buildReminderBody,
    buildReminderKey,
    getScheduledArrivalTimestamp,
    matchesReminderToEta,
    matchesReminderToScheduledEta,
    pickFollowUpEta,
    pickMatchingEta,
} from './transitArrivalNotification.policy';
import {
    ensureReminderHistoryCoverage,
    pruneExpiredReminders,
    readStoredReminderHistory,
    readStoredReminders,
    subscribeToTransitArrivalReminderChanges,
    syncReminderHistoryEntry,
    writeStoredReminderHistory,
    writeStoredReminders,
} from './transitArrivalNotification.storage';
export { subscribeToTransitArrivalReminderChanges } from './transitArrivalNotification.storage';
export {
    DEFAULT_DELAY_FOLLOW_UP_LEAD_MINUTES,
    DEFAULT_DELAY_FOLLOW_UP_THRESHOLD_MINUTES,
    DEFAULT_REMINDER_MINUTES,
    REMINDER_MINUTE_OPTIONS,
    TRANSIT_ARRIVAL_NOTIFICATION_ACTION_REMIND_AGAIN,
    TRANSIT_ARRIVAL_NOTIFICATION_CATEGORY_ID,
    type StoredTransitArrivalReminder,
    type StoredTransitArrivalReminderHistoryEntry,
    type TransitArrivalReminderHistoryState,
    type TransitArrivalReminderRefreshResult,
    type TransitArrivalReminderRequest,
    type TransitArrivalReminderResult,
} from './transitArrivalNotification.types';
import {
    DEFAULT_REMINDER_MINUTES,
    REMINDER_MINUTE_OPTIONS,
    TRANSIT_ARRIVAL_NOTIFICATION_ACTION_REMIND_AGAIN,
    TRANSIT_ARRIVAL_NOTIFICATION_CATEGORY_ID,
    TRANSIT_NOTIFICATION_CHANNEL_ID,
    createReminderHistoryId,
    normalizeReminderMinutes,
    type StoredTransitArrivalReminder,
    type StoredTransitArrivalReminderHistoryEntry,
    type TransitArrivalReminderRefreshResult,
    type TransitArrivalReminderRequest,
    type TransitArrivalReminderResult,
} from './transitArrivalNotification.types';

let notificationsInitialized = false;
const DEFAULT_NOTIFICATION_SOUND = Platform.OS === 'ios' ? 'default' : undefined;
const REMIND_AGAIN_DEFAULT_MINUTES = 2;

let refreshTransitArrivalRemindersPromise: Promise<TransitArrivalReminderRefreshResult> | null = null;

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
    const triggerUnix = effectiveArrivalTimestamp - (minutesBefore * 60);

    if (triggerUnix - nowUnix <= -60) {
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
            categoryIdentifier: TRANSIT_ARRIVAL_NOTIFICATION_CATEGORY_ID,
            data: {
                type: 'transit-arrival-reminder',
                stopName,
                stopId: eta.stopId,
                routeId: eta.routeId,
                tripId: eta.tripId,
                line: eta.line,
                destination: eta.destination ?? null,
                minutesBefore,
                arrivalTimestamp: eta.arrivalTimestamp,
                targetArrivalTimestamp: effectiveArrivalTimestamp,
                delayMinutes: scheduleInfo.delayMinutes,
                isFollowUp,
            },
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(Math.max(triggerUnix, nowUnix + 1) * 1000),
            channelId: TRANSIT_NOTIFICATION_CHANNEL_ID,
        },
    });

    return {
        ok: true as const,
        notificationId,
        delayMinutes: scheduleInfo.delayMinutes,
        remindAtTimestamp: triggerUnix,
    };
};

const scheduleDelayFollowUpNotification = async ({
    reminder,
    eta: _eta,
}: {
    reminder: StoredTransitArrivalReminder;
    eta: StopEta | null;
}) => {
    if (reminder.followUpNotificationId) {
        await Notifications.cancelScheduledNotificationAsync(reminder.followUpNotificationId);
    }

    return { notificationId: null, delayMinutes: null, followUpTripId: null };
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

export const listTransitArrivalReminderHistory = async () => {
    const history = await readStoredReminderHistory();
    return history.sort((left, right) => right.updatedAtUnix - left.updatedAtUnix);
};

export const deleteTransitArrivalReminderHistoryEntry = async (historyId: string) => {
    const normalizedHistoryId = String(historyId || '').trim();
    if (!normalizedHistoryId) {
        return {
            ok: false,
            message: 'Липсва запис от историята.',
        };
    }

    const history = await readStoredReminderHistory();
    const exists = history.some((entry) => entry.historyId === normalizedHistoryId);
    if (!exists) {
        return {
            ok: false,
            message: 'Записът вече липсва от историята.',
        };
    }

    await writeStoredReminderHistory(history.filter((entry) => entry.historyId !== normalizedHistoryId));

    return {
        ok: true,
        message: 'Записът е премахнат от историята.',
    };
};

export const cancelTransitArrivalReminder = async (eta: StopEta) => {
    const reminders = await ensureReminderHistoryCoverage(await readStoredReminders());
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
    await syncReminderHistoryEntry(existing, 'cancelled');
    await writeStoredReminders(reminders.filter((item) => item.reminderKey !== reminderKey));

    return {
        ok: true,
        message: `Напомнянето за линия ${existing.line} е премахнато.`,
    };
};

export const cancelStoredTransitArrivalReminder = async (reminderKey: string) => {
    const reminders = await ensureReminderHistoryCoverage(await readStoredReminders());
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
    await syncReminderHistoryEntry(existing, 'cancelled');
    await writeStoredReminders(reminders.filter((item) => item.reminderKey !== reminderKey));

    return {
        ok: true,
        message: `Премахнато е напомнянето за линия ${existing.line}.`,
    };
};

export const updateStoredTransitArrivalReminder = async (
    reminderKey: string,
    minutesBefore: number,
): Promise<TransitArrivalReminderResult> => {
    const normalizedReminderKey = String(reminderKey || '').trim();
    if (!normalizedReminderKey) {
        return {
            ok: false,
            message: 'Липсва напомняне за редакция.',
        };
    }

    const reminders = await ensureReminderHistoryCoverage(await readStoredReminders());
    const existing = reminders.find((item) => item.reminderKey === normalizedReminderKey) ?? null;

    if (!existing) {
        return {
            ok: false,
            message: 'Напомнянето вече не е активно.',
        };
    }

    const etasByStopId = await fetchStopEtas([existing.stopId]);
    const stopEtas = etasByStopId[existing.stopId] ?? [];
    const matchingEta = pickMatchingEta(existing, stopEtas);

    if (!matchingEta) {
        return {
            ok: false,
            message: `В момента няма следващ курс за линия ${existing.line} на ${existing.stopName}.`,
        };
    }

    return scheduleTransitArrivalReminder({
        stopName: existing.stopName,
        eta: matchingEta,
        minutesBefore,
        delayFollowUpEnabled: false,
    });
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

        await Notifications.setNotificationCategoryAsync(TRANSIT_ARRIVAL_NOTIFICATION_CATEGORY_ID, [
            {
                identifier: TRANSIT_ARRIVAL_NOTIFICATION_ACTION_REMIND_AGAIN,
                buttonTitle: 'Напомни пак',
                options: {
                    opensAppToForeground: true,
                },
            },
        ]);

        notificationsInitialized = true;
    }
};

export const handleRemindAgainFromNotification = async (
    data: Record<string, unknown>,
): Promise<TransitArrivalReminderResult> => {
    const stopName = String(data.stopName || '').trim();
    const stopId = String(data.stopId || '').trim();
    const line = String(data.line || '').trim();
    const destination = data.destination ? String(data.destination).trim() : undefined;

    if (!stopId || !line) {
        return { ok: false, message: 'Липсват данни за напомнянето.' };
    }

    const etasByStopId = await fetchStopEtas([stopId]);
    const stopEtas = etasByStopId[stopId] ?? [];
    const matchingEta = stopEtas
        .filter((eta) => eta.line === line && (!destination || eta.destination === destination))
        .sort((a, b) => a.arrivalTimestamp - b.arrivalTimestamp)[0] ?? null;

    if (!matchingEta) {
        return { ok: false, message: `В момента няма следващ курс за линия ${line} на ${stopName || 'спирката'}.` };
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    const secondsUntilArrival = matchingEta.arrivalTimestamp - nowUnix;
    const remindAgainMinutes = secondsUntilArrival <= 90
        ? 1
        : REMIND_AGAIN_DEFAULT_MINUTES;

    return scheduleTransitArrivalReminder({
        stopName: stopName || matchingEta.stopId,
        eta: matchingEta,
        minutesBefore: remindAgainMinutes,
        delayFollowUpEnabled: false,
    });
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
    const normalizedMinutesBefore = normalizeReminderMinutes(minutesBefore);
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
        minutesBefore: normalizedMinutesBefore,
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
    const reminders = await ensureReminderHistoryCoverage(await readStoredReminders());
    const nextReminder: StoredTransitArrivalReminder = {
        reminderKey,
        historyId: existingReminder?.historyId || createReminderHistoryId(),
        notificationId: scheduled.notificationId,
        followUpNotificationId: existingReminder?.followUpNotificationId || null,
        followUpTripId: existingReminder?.followUpTripId || null,
        stopName,
        stopId: eta.stopId,
        routeId: eta.routeId,
        tripId: eta.tripId,
        line: eta.line,
        destination: eta.destination,
        arrivalTimestamp: eta.arrivalTimestamp,
        remindAtTimestamp: scheduled.remindAtTimestamp,
        minutesBefore: normalizedMinutesBefore,
        scheduledArrivalTimestamp,
        latestDelayMinutes: scheduled.delayMinutes,
        lastRefreshUnix: Math.floor(Date.now() / 1000),
        delayFollowUpEnabled: false,
        followUpDelayThresholdMinutes: null,
    };

    const followUp = await scheduleDelayFollowUpNotification({
        reminder: nextReminder,
        eta,
    });
    nextReminder.followUpNotificationId = followUp.notificationId;
    nextReminder.followUpTripId = followUp.followUpTripId;
    await writeStoredReminders([
        ...reminders.filter((item) => item.reminderKey !== reminderKey && !matchesReminderToScheduledEta(item, eta) && !matchesReminderToEta(item, eta)),
        nextReminder,
    ]);
    await syncReminderHistoryEntry(nextReminder, 'active');

    return {
        ok: true,
        notificationId: scheduled.notificationId,
        message: `Ще получите известие ${normalizedMinutesBefore} мин преди линия ${eta.line}.`,
    };
};

export const rescheduleTransitArrivalReminderFromHistory = async (historyId: string, minutesBefore?: number): Promise<TransitArrivalReminderResult> => {
    const history = await listTransitArrivalReminderHistory();
    const entry = history.find((item) => item.historyId === historyId) ?? null;

    if (!entry) {
        return {
            ok: false,
            message: 'Записът в историята не е намерен.',
        };
    }

    const etasByStopId = await fetchStopEtas([entry.stopId]);
    const stopEtas = etasByStopId[entry.stopId] ?? [];
    const matchingEta = pickMatchingEta(
        {
            reminderKey: entry.historyId,
            historyId: entry.historyId,
            notificationId: '',
            stopName: entry.stopName,
            stopId: entry.stopId,
            routeId: entry.routeId,
            tripId: entry.tripId,
            line: entry.line,
            destination: entry.destination,
            arrivalTimestamp: entry.arrivalTimestamp,
            remindAtTimestamp: entry.remindAtTimestamp,
            minutesBefore: entry.minutesBefore,
            scheduledArrivalTimestamp: entry.scheduledArrivalTimestamp,
            latestDelayMinutes: entry.latestDelayMinutes,
            lastRefreshUnix: entry.lastRefreshUnix,
            delayFollowUpEnabled: entry.delayFollowUpEnabled,
            followUpDelayThresholdMinutes: entry.followUpDelayThresholdMinutes,
        },
        stopEtas,
    );

    if (!matchingEta) {
        return {
            ok: false,
            message: `В момента няма следващ курс за линия ${entry.line} на ${entry.stopName}.`,
        };
    }

    return scheduleTransitArrivalReminder({
        stopName: entry.stopName,
        eta: matchingEta,
        minutesBefore: minutesBefore ?? entry.minutesBefore,
        delayFollowUpEnabled: false,
    });
};

export const refreshTransitArrivalReminders = async (): Promise<TransitArrivalReminderRefreshResult> => {
    if (refreshTransitArrivalRemindersPromise) {
        return refreshTransitArrivalRemindersPromise;
    }

    refreshTransitArrivalRemindersPromise = (async () => {
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
            const primaryAlreadyDue = reminder.remindAtTimestamp <= nowUnix;
            if (primaryAlreadyDue) {
                await Notifications.cancelScheduledNotificationAsync(reminder.notificationId);
                if (reminder.followUpNotificationId) {
                    await Notifications.cancelScheduledNotificationAsync(reminder.followUpNotificationId);
                }
                await syncReminderHistoryEntry(reminder, 'expired');
                removedCount += 1;
                continue;
            }

            const stopEtas = etasByStopId[reminder.stopId] ?? [];
            const matchingEta = pickMatchingEta(reminder, stopEtas);
            if (!matchingEta) {
                nextReminders.push(reminder);
                continue;
            }

            const refreshedScheduledArrivalTimestamp = getScheduledArrivalTimestamp(matchingEta) ?? reminder.scheduledArrivalTimestamp ?? null;
            const primaryTargetArrivalTimestamp = refreshedScheduledArrivalTimestamp ?? matchingEta.arrivalTimestamp;

            let nextNotificationId = reminder.notificationId;
            let nextRemindAtTimestamp = reminder.remindAtTimestamp;
            let nextDelayMinutes = reminder.latestDelayMinutes ?? null;

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
                await syncReminderHistoryEntry(reminder, 'expired');
                removedCount += 1;
                continue;
            }

            nextNotificationId = scheduled.notificationId;
            nextRemindAtTimestamp = scheduled.remindAtTimestamp;
            nextDelayMinutes = scheduled.delayMinutes;

            const followUp = await scheduleDelayFollowUpNotification({
                reminder,
                eta: pickFollowUpEta(reminder, stopEtas, matchingEta),
            });

            const changed =
                reminder.arrivalTimestamp !== matchingEta.arrivalTimestamp ||
                reminder.notificationId !== nextNotificationId ||
                reminder.latestDelayMinutes !== nextDelayMinutes ||
                reminder.followUpNotificationId !== followUp.notificationId;

            if (changed) {
                updatedCount += 1;
            }

            const nextScheduledArrivalTimestamp = refreshedScheduledArrivalTimestamp;

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
            });
        }

        await writeStoredReminders(nextReminders);
        await Promise.all(nextReminders.map((reminder) => syncReminderHistoryEntry(reminder, 'active')));

        return {
            ok: true,
            checkedCount: reminders.length,
            updatedCount,
            removedCount,
            message: `Проверени ${reminders.length} напомняния, обновени ${updatedCount}.`,
        };
    })();

    try {
        return await refreshTransitArrivalRemindersPromise;
    } finally {
        refreshTransitArrivalRemindersPromise = null;
    }
};
