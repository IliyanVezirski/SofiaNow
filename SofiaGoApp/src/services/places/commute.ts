import { DEFAULT_COMMUTE_WEEKDAYS, FAVORITE_COMMUTE_WEEKDAY_OPTIONS } from './constants';
import type { FavoriteCommuteWeekday } from './types';

export type FavoriteCommuteScheduleLike = {
    arriveBy?: boolean | null;
    routeStartTime?: string | null;
    reminderTime?: string | null;
    reminderWeekdays?: FavoriteCommuteWeekday[] | null;
    notificationWeekdays?: FavoriteCommuteWeekday[] | null;
};

export const normalizeFavoriteCommuteWeekdays = (value: unknown): FavoriteCommuteWeekday[] => {
    if (!Array.isArray(value)) {
        return [...DEFAULT_COMMUTE_WEEKDAYS];
    }

    const normalized = Array.from(new Set(
        value
            .map((entry) => Number(entry))
            .filter((entry): entry is FavoriteCommuteWeekday => Number.isInteger(entry) && entry >= 1 && entry <= 7),
    ));

    if (!normalized.length) {
        return [...DEFAULT_COMMUTE_WEEKDAYS];
    }

    return FAVORITE_COMMUTE_WEEKDAY_OPTIONS
        .map((option) => option.value)
        .filter((weekday) => normalized.includes(weekday));
};

export const formatFavoriteCommuteWeekdays = (weekdays: FavoriteCommuteWeekday[]) => {
    const normalized = normalizeFavoriteCommuteWeekdays(weekdays);
    if (normalized.length === FAVORITE_COMMUTE_WEEKDAY_OPTIONS.length) {
        return 'всеки ден';
    }

    return normalized
        .map((weekday) => FAVORITE_COMMUTE_WEEKDAY_OPTIONS.find((option) => option.value === weekday)?.shortLabel || String(weekday))
        .join(', ');
};

export const parseCommuteClock = (value: unknown) => {
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim());
    if (!match) {
        return null;
    }

    return {
        hour: Number(match[1]),
        minute: Number(match[2]),
    };
};

export const formatCommuteReminderTimeFromRouteStart = (routeStartTime: string | null | undefined, minutesBefore: number) => {
    const routeStart = parseCommuteClock(routeStartTime);
    if (!routeStart) {
        return null;
    }

    const reminderDate = new Date(2000, 0, 1, routeStart.hour, routeStart.minute, 0, 0);
    reminderDate.setMinutes(reminderDate.getMinutes() - minutesBefore);
    return `${String(reminderDate.getHours()).padStart(2, '0')}:${String(reminderDate.getMinutes()).padStart(2, '0')}`;
};

export const normalizeReminderOffsetMinutes = (value: unknown, fallback = 5) => {
    const normalized = Math.round(Number(value));
    if (!Number.isFinite(normalized) || normalized < 1 || normalized > 120) {
        return fallback;
    }

    return normalized;
};

const areFavoriteCommuteWeekdaysEqual = (left: FavoriteCommuteWeekday[], right: FavoriteCommuteWeekday[]) => {
    if (left.length !== right.length) {
        return false;
    }

    return left.every((weekday, index) => weekday === right[index]);
};

export const shiftFavoriteCommuteWeekdays = (weekdays: FavoriteCommuteWeekday[], dayShift: number) => {
    const normalized = normalizeFavoriteCommuteWeekdays(weekdays);
    if (!dayShift) {
        return normalized;
    }

    return normalized.map((weekday) => {
        const shifted = (((weekday - 1 + dayShift) % 7) + 7) % 7;
        return (shifted + 1) as FavoriteCommuteWeekday;
    });
};

export const getFavoriteCommuteNotificationDayShift = (plan: FavoriteCommuteScheduleLike | null | undefined) => {
    if (!plan?.arriveBy) {
        return 0;
    }

    const routeStart = parseCommuteClock(plan.routeStartTime);
    const reminder = parseCommuteClock(plan.reminderTime);
    if (!routeStart || !reminder) {
        return 0;
    }

    const routeStartMinutes = (routeStart.hour * 60) + routeStart.minute;
    const reminderMinutes = (reminder.hour * 60) + reminder.minute;
    const diffMinutes = reminderMinutes - routeStartMinutes;

    if (diffMinutes > 12 * 60) {
        return -1;
    }

    if (diffMinutes < -12 * 60) {
        return 1;
    }

    return 0;
};

export const resolveFavoriteCommuteNotificationWeekdays = (plan: FavoriteCommuteScheduleLike | null | undefined) => {
    const explicit = normalizeFavoriteCommuteWeekdays(plan?.notificationWeekdays);
    if (plan?.notificationWeekdays?.length) {
        return explicit;
    }

    const reminderWeekdays = normalizeFavoriteCommuteWeekdays(plan?.reminderWeekdays);
    return shiftFavoriteCommuteWeekdays(reminderWeekdays, getFavoriteCommuteNotificationDayShift(plan));
};

export const getFavoriteCommuteNotificationShiftLabel = (plan: FavoriteCommuteScheduleLike | null | undefined) => {
    const dayShift = getFavoriteCommuteNotificationDayShift(plan);
    if (dayShift < 0) {
        return 'предния ден';
    }

    if (dayShift > 0) {
        return 'следващия ден';
    }

    return null;
};

export const hasFavoriteCommuteNotificationDayShift = (plan: FavoriteCommuteScheduleLike | null | undefined) => {
    const reminderWeekdays = normalizeFavoriteCommuteWeekdays(plan?.reminderWeekdays);
    const notificationWeekdays = resolveFavoriteCommuteNotificationWeekdays(plan);
    return !areFavoriteCommuteWeekdaysEqual(reminderWeekdays, notificationWeekdays);
};
