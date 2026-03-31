import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ensureTransitNotificationPermissions } from './transitArrivalNotifications';
import type { FavoriteCommuteWeekday } from '../places/types';
import {
    formatWeekdays,
    getNextOccurrenceUnix,
    getNextOccurrenceUnixForWeekday,
    parseReminderTime,
} from './commuteRouteNotification.utils';
import {
    buildCommuteRouteBody,
    ensureFavoriteCommuteRouteCategoryRegistered,
    normalizeCommuteNotificationWeekdays,
} from './commuteRouteNotification.policy';

const TRANSIT_NOTIFICATION_CHANNEL_ID = 'transit-arrivals-v2';
const DEFAULT_NOTIFICATION_SOUND = Platform.OS === 'ios' ? 'default' : undefined;
export const FAVORITE_COMMUTE_ROUTE_NOTIFICATION_CATEGORY_ID = 'favorite-commute-route';
export const FAVORITE_COMMUTE_ROUTE_NOTIFICATION_ACTION_SHOW_ROUTE = 'show-route';

interface CommuteRouteNotificationRequest {
    favoriteId?: string | null;
    sourceName: string;
    destinationName: string;
    routeSummary: string;
    reminderTime: string;
    weekdays: FavoriteCommuteWeekday[];
    existingNotificationIds?: string[] | string | null;
    reminderOffsetMinutes?: number | null;
    firstTransitStopId?: string | null;
    firstTransitStopName?: string | null;
    firstTransitLine?: string | null;
    firstTransitStopOffsetMinutes?: number | null;
    walkDurationSeconds?: number | null;
    walkDistanceMeters?: number | null;
}

interface CommuteRouteNotificationResult {
    ok: boolean;
    message: string;
    notificationIds?: string[];
}

export const cancelCommuteRouteNotification = async (notificationIds?: string[] | string | null) => {
    const normalizedIds = Array.isArray(notificationIds)
        ? notificationIds.map((id) => String(id || '').trim()).filter(Boolean)
        : (notificationIds ? [String(notificationIds).trim()] : []);

    if (!normalizedIds.length) {
        return;
    }

    await Promise.all(normalizedIds.map((notificationId) => Notifications.cancelScheduledNotificationAsync(notificationId)));
};

export const getScheduledCommuteRouteNotificationIds = async () => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return new Set(scheduled.map((entry) => String(entry.identifier || '').trim()).filter(Boolean));
};

export const scheduleCommuteRouteNotification = async ({
    favoriteId,
    sourceName,
    destinationName,
    routeSummary,
    reminderTime,
    weekdays,
    existingNotificationIds,
    reminderOffsetMinutes,
    firstTransitStopId,
    firstTransitStopName,
    firstTransitLine,
    firstTransitStopOffsetMinutes,
    walkDurationSeconds,
    walkDistanceMeters,
}: CommuteRouteNotificationRequest): Promise<CommuteRouteNotificationResult> => {
    const parsedTime = parseReminderTime(reminderTime);
    if (!parsedTime) {
        return {
            ok: false,
            message: 'Часът трябва да е във формат ЧЧ:ММ.',
        };
    }

    const normalizedWeekdays = normalizeCommuteNotificationWeekdays(weekdays);

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

    await ensureFavoriteCommuteRouteCategoryRegistered();

    if (existingNotificationIds) {
        await cancelCommuteRouteNotification(existingNotificationIds);
    }

    const nextReminderUnix = getNextOccurrenceUnix(normalizedWeekdays, parsedTime.hour, parsedTime.minute);
    if (!nextReminderUnix) {
        return {
            ok: false,
            message: 'Не успяхме да изчислим следващото маршрутно известие.',
        };
    }

    let notificationIds: string[] = [];
    try {
        notificationIds = (await Promise.all(normalizedWeekdays.map(async (weekday) => {
            const scheduledReminderUnix = getNextOccurrenceUnixForWeekday(weekday, parsedTime.hour, parsedTime.minute);
            const routeStartUnix = scheduledReminderUnix + ((Number.isFinite(reminderOffsetMinutes) ? Number(reminderOffsetMinutes) : 0) * 60);
            const body = await buildCommuteRouteBody({
                routeSummary,
                routeStartUnix,
                firstTransitStopId,
                firstTransitStopName,
                firstTransitLine,
                firstTransitStopOffsetMinutes,
                walkDurationSeconds,
                walkDistanceMeters,
                reminderOffsetMinutes,
            });

            return Notifications.scheduleNotificationAsync({
                content: {
                    title: `Маршрут ${sourceName} → ${destinationName}`,
                    body,
                    categoryIdentifier: FAVORITE_COMMUTE_ROUTE_NOTIFICATION_CATEGORY_ID,
                    sound: DEFAULT_NOTIFICATION_SOUND,
                    priority: Notifications.AndroidNotificationPriority.MAX,
                    vibrate: [0, 400, 250, 400],
                    color: '#0F766E',
                    data: {
                        type: 'favorite-commute-route',
                        favoriteId,
                        sourceName,
                        destinationName,
                        routeStartUnix,
                        firstTransitStopId,
                        firstTransitLine,
                        weekday,
                        scheduledReminderUnix,
                    },
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.DATE,
                    date: new Date(scheduledReminderUnix * 1000),
                    channelId: TRANSIT_NOTIFICATION_CHANNEL_ID,
                },
            });
        }))).filter(Boolean);
    } catch {
        return {
            ok: false,
            message: 'Не успяхме да планираме маршрутното известие на устройството.',
        };
    }

    if (!notificationIds.length) {
        return {
            ok: false,
            message: 'Не успяхме да планираме маршрутните известия.',
        };
    }

    return {
        ok: true,
        notificationIds,
        message: `Ще получавате напомняне ${formatWeekdays(normalizedWeekdays)} в ${reminderTime}.`,
    };
};
