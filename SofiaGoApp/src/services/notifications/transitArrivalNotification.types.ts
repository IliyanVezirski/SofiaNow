import type { StopEta } from '../../types/vehicles';

export const STORAGE_KEY = 'transit-arrival-reminders';
export const HISTORY_STORAGE_KEY = 'transit-arrival-reminder-history-v1';
export const MAX_REMINDER_HISTORY_ITEMS = 80;
export const TRANSIT_NOTIFICATION_CHANNEL_ID = 'transit-arrivals-v2';
export const TRANSIT_ARRIVAL_NOTIFICATION_CATEGORY_ID = 'transit-arrival-reminder';
export const TRANSIT_ARRIVAL_NOTIFICATION_ACTION_REMIND_AGAIN = 'remind-again';

export const DEFAULT_REMINDER_MINUTES = 5;
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
    historyId?: string;
    notificationId: string;
    followUpNotificationId?: string | null;
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

export type TransitArrivalReminderHistoryState = 'active' | 'cancelled' | 'expired';

export interface StoredTransitArrivalReminderHistoryEntry {
    historyId: string;
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
    createdAtUnix: number;
    updatedAtUnix: number;
    lastState: TransitArrivalReminderHistoryState;
}

export const normalizeReminderMinutes = (value: number | undefined) => {
    const normalized = Number.isFinite(value) ? Math.round(Number(value)) : DEFAULT_REMINDER_MINUTES;
    if (normalized < 1) {
        return 1;
    }

    if (normalized > 120) {
        return 120;
    }

    return normalized;
};

export const createReminderHistoryId = () => `reminder-history-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
