import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import {
    HISTORY_STORAGE_KEY,
    MAX_REMINDER_HISTORY_ITEMS,
    STORAGE_KEY,
    createReminderHistoryId,
    type StoredTransitArrivalReminder,
    type StoredTransitArrivalReminderHistoryEntry,
    type TransitArrivalReminderHistoryState,
} from './transitArrivalNotification.types';

const reminderListeners = new Set<() => void>();

export const subscribeToTransitArrivalReminderChanges = (listener: () => void) => {
    reminderListeners.add(listener);
    return () => {
        reminderListeners.delete(listener);
    };
};

export const readStoredReminders = async (): Promise<StoredTransitArrivalReminder[]> => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw) as StoredTransitArrivalReminder[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export const readStoredReminderHistory = async (): Promise<StoredTransitArrivalReminderHistoryEntry[]> => {
    const raw = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw) as StoredTransitArrivalReminderHistoryEntry[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export const writeStoredReminders = async (reminders: StoredTransitArrivalReminder[]) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
    reminderListeners.forEach((listener) => listener());
};

export const writeStoredReminderHistory = async (entries: StoredTransitArrivalReminderHistoryEntry[]) => {
    const nextEntries = [...entries]
        .sort((left, right) => right.updatedAtUnix - left.updatedAtUnix)
        .slice(0, MAX_REMINDER_HISTORY_ITEMS);

    await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextEntries));
    reminderListeners.forEach((listener) => listener());
};

export const syncReminderHistoryEntry = async (
    reminder: StoredTransitArrivalReminder,
    state: TransitArrivalReminderHistoryState,
) => {
    const historyId = reminder.historyId || createReminderHistoryId();
    const history = await readStoredReminderHistory();
    const existingEntry = history.find((entry) => entry.historyId === historyId) ?? null;
    const nowUnix = Math.floor(Date.now() / 1000);
    const nextEntry: StoredTransitArrivalReminderHistoryEntry = {
        historyId,
        stopName: reminder.stopName,
        stopId: reminder.stopId,
        routeId: reminder.routeId,
        tripId: reminder.tripId,
        line: reminder.line,
        destination: reminder.destination,
        arrivalTimestamp: reminder.arrivalTimestamp,
        remindAtTimestamp: reminder.remindAtTimestamp,
        minutesBefore: reminder.minutesBefore,
        scheduledArrivalTimestamp: reminder.scheduledArrivalTimestamp,
        latestDelayMinutes: reminder.latestDelayMinutes,
        lastRefreshUnix: reminder.lastRefreshUnix,
        delayFollowUpEnabled: false,
        followUpDelayThresholdMinutes: null,
        createdAtUnix: existingEntry?.createdAtUnix || nowUnix,
        updatedAtUnix: nowUnix,
        lastState: state,
    };

    await writeStoredReminderHistory([
        nextEntry,
        ...history.filter((entry) => entry.historyId !== historyId),
    ]);

    return historyId;
};

export const ensureReminderHistoryCoverage = async (reminders: StoredTransitArrivalReminder[]) => {
    let changed = false;
    const createdReminders: StoredTransitArrivalReminder[] = [];
    const nextReminders = reminders.map((reminder) => {
        if (reminder.historyId) {
            return reminder;
        }

        changed = true;
        const nextReminder = {
            ...reminder,
            historyId: createReminderHistoryId(),
        } satisfies StoredTransitArrivalReminder;
        createdReminders.push(nextReminder);
        return nextReminder;
    });

    if (changed) {
        await writeStoredReminders(nextReminders);
        await Promise.all(createdReminders.map((reminder) => syncReminderHistoryEntry(reminder, 'active')));
    }

    return nextReminders;
};

export const pruneExpiredReminders = async () => {
    const nowUnix = Math.floor(Date.now() / 1000);
    const reminders = await ensureReminderHistoryCoverage(await readStoredReminders());
    const activeReminders = reminders.filter((item) => item.arrivalTimestamp > nowUnix);
    if (activeReminders.length !== reminders.length) {
        await Promise.all(reminders.filter((item) => item.arrivalTimestamp <= nowUnix).map(async (item) => {
            if (item.followUpNotificationId) {
                await Notifications.cancelScheduledNotificationAsync(item.followUpNotificationId);
            }
            await syncReminderHistoryEntry(item, 'expired');
        }));
        await writeStoredReminders(activeReminders);
    }
    return activeReminders;
};
