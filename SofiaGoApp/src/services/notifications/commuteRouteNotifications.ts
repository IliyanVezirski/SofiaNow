import * as Notifications from 'expo-notifications';
import { ensureTransitNotificationPermissions } from './transitArrivalNotifications';
import type { FavoriteCommuteWeekday } from '../places';

const WEEKDAY_LABELS: Record<FavoriteCommuteWeekday, string> = {
    1: 'Нд',
    2: 'Пн',
    3: 'Вт',
    4: 'Ср',
    5: 'Чт',
    6: 'Пт',
    7: 'Сб',
};

const formatWeekdays = (weekdays: FavoriteCommuteWeekday[]) => {
    if (weekdays.length === 7) {
        return 'всеки ден';
    }

    return weekdays.map((weekday) => WEEKDAY_LABELS[weekday]).join(', ');
};

interface CommuteRouteNotificationRequest {
    sourceName: string;
    destinationName: string;
    routeSummary: string;
    reminderTime: string;
    weekdays: FavoriteCommuteWeekday[];
    existingNotificationIds?: string[] | string | null;
}

interface CommuteRouteNotificationResult {
    ok: boolean;
    message: string;
    notificationIds?: string[];
}

const parseReminderTime = (value: string) => {
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim());
    if (!match) {
        return null;
    }

    return {
        hour: Number(match[1]),
        minute: Number(match[2]),
    };
};

export const cancelCommuteRouteNotification = async (notificationIds?: string[] | string | null) => {
    const normalizedIds = Array.isArray(notificationIds)
        ? notificationIds.map((id) => String(id || '').trim()).filter(Boolean)
        : (notificationIds ? [String(notificationIds).trim()] : []);

    if (!normalizedIds.length) {
        return;
    }

    await Promise.all(normalizedIds.map((notificationId) => Notifications.cancelScheduledNotificationAsync(notificationId)));
};

export const scheduleCommuteRouteNotification = async ({
    sourceName,
    destinationName,
    routeSummary,
    reminderTime,
    weekdays,
    existingNotificationIds,
}: CommuteRouteNotificationRequest): Promise<CommuteRouteNotificationResult> => {
    const parsedTime = parseReminderTime(reminderTime);
    if (!parsedTime) {
        return {
            ok: false,
            message: 'Часът трябва да е във формат ЧЧ:ММ.',
        };
    }

    const normalizedWeekdays = Array.from(new Set(
        weekdays
            .map((weekday) => Number(weekday))
            .filter((weekday): weekday is FavoriteCommuteWeekday => Number.isInteger(weekday) && weekday >= 1 && weekday <= 7),
    ));

    if (!normalizedWeekdays.length) {
        return {
            ok: false,
            message: 'Избери поне един ден за повтарящо се уведомление.',
        };
    }

    const granted = await ensureTransitNotificationPermissions();
    if (!granted) {
        return {
            ok: false,
            message: 'Няма разрешение за известия.',
        };
    }

    if (existingNotificationIds) {
        await cancelCommuteRouteNotification(existingNotificationIds);
    }

    const notificationIds = await Promise.all(normalizedWeekdays.map((weekday) => Notifications.scheduleNotificationAsync({
        content: {
            title: `Маршрут ${sourceName} → ${destinationName}`,
            body: routeSummary,
            sound: true,
            data: {
                type: 'favorite-commute-route',
                sourceName,
                destinationName,
                weekday,
            },
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour: parsedTime.hour,
            minute: parsedTime.minute,
            channelId: 'transit-arrivals',
        },
    })));

    return {
        ok: true,
        notificationIds,
        message: `Ще получавате напомняне ${formatWeekdays(normalizedWeekdays)} в ${reminderTime}.`,
    };
};