import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ensureTransitNotificationPermissions } from './transitArrivalNotifications';
import { fetchStopEtas } from '../cgmApi/stopEtas';
import { getEtaScheduleInfo } from '../cgmApi/schedules';
import type { FavoriteCommuteWeekday } from '../places';
import type { StopEta } from '../../types/vehicles';

const TRANSIT_NOTIFICATION_CHANNEL_ID = 'transit-arrivals-v2';
const DEFAULT_NOTIFICATION_SOUND = Platform.OS === 'ios' ? 'default' : undefined;
export const FAVORITE_COMMUTE_ROUTE_NOTIFICATION_CATEGORY_ID = 'favorite-commute-route';
export const FAVORITE_COMMUTE_ROUTE_NOTIFICATION_ACTION_SHOW_ROUTE = 'show-route';

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

const formatDurationMinutes = (seconds: number | null | undefined) => {
    if (!Number.isFinite(seconds) || Number(seconds) <= 0) {
        return null;
    }

    return `${Math.max(1, Math.round(Number(seconds) / 60))} мин`;
};

const formatDistance = (meters: number | null | undefined) => {
    if (!Number.isFinite(meters) || Number(meters) <= 0) {
        return null;
    }

    const normalized = Math.round(Number(meters));
    if (normalized >= 1000) {
        return `${(normalized / 1000).toFixed(normalized >= 10000 ? 0 : 1).replace(/\.0$/, '')} км`;
    }

    return `${normalized} м`;
};

const formatScheduleClock = (scheduledMinSinceMidnight: number | null | undefined) => {
    if (!Number.isFinite(scheduledMinSinceMidnight)) {
        return null;
    }

    const totalMinutes = Math.max(0, Math.round(Number(scheduledMinSinceMidnight)));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const ensureFavoriteCommuteRouteCategoryRegistered = async () => {
    await Notifications.setNotificationCategoryAsync(FAVORITE_COMMUTE_ROUTE_NOTIFICATION_CATEGORY_ID, [
        {
            identifier: FAVORITE_COMMUTE_ROUTE_NOTIFICATION_ACTION_SHOW_ROUTE,
            buttonTitle: 'Покажи маршрута',
            options: {
                opensAppToForeground: true,
            },
        },
    ]);
};

const weekdayToJsDay = (weekday: FavoriteCommuteWeekday) => (weekday === 1 ? 0 : weekday - 1);

const formatClockFromUnix = (unixSeconds: number) => {
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

const buildPlannedFirstStopText = ({
    routeStartUnix,
    firstTransitStopName,
    firstTransitLine,
    firstTransitStopOffsetMinutes,
}: {
    routeStartUnix: number;
    firstTransitStopName?: string | null;
    firstTransitLine?: string | null;
    firstTransitStopOffsetMinutes?: number | null;
}) => {
    const normalizedLine = String(firstTransitLine || '').trim().toUpperCase();
    if (!normalizedLine || !Number.isFinite(firstTransitStopOffsetMinutes)) {
        return null;
    }

    const stopLabel = firstTransitStopName || 'първата спирка';
    const scheduledUnix = routeStartUnix + (Math.round(Number(firstTransitStopOffsetMinutes)) * 60);
    return {
        normalizedLine,
        stopLabel,
        scheduledClock: formatClockFromUnix(scheduledUnix),
    };
};

const getNextOccurrenceUnixForWeekday = (weekday: FavoriteCommuteWeekday, hour: number, minute: number) => {
    const now = new Date();
    const nowMs = now.getTime();
    const candidate = new Date(now);
    const currentDay = candidate.getDay();
    let dayDelta = weekdayToJsDay(weekday) - currentDay;
    candidate.setHours(hour, minute, 0, 0);

    if (dayDelta < 0 || (dayDelta === 0 && candidate.getTime() <= nowMs + 1000)) {
        dayDelta += 7;
    }

    candidate.setDate(candidate.getDate() + dayDelta);
    return Math.floor(candidate.getTime() / 1000);
};

const getNextOccurrenceUnix = (weekdays: FavoriteCommuteWeekday[], hour: number, minute: number) => {
    let best: number | null = null;

    weekdays.forEach((weekday) => {
        const candidateUnix = getNextOccurrenceUnixForWeekday(weekday, hour, minute);
        if (best == null || candidateUnix < best) {
            best = candidateUnix;
        }
    });

    return best;
};

const pickMatchingFirstStopEta = ({
    etas,
    line,
    targetArrivalUnix,
}: {
    etas: StopEta[];
    line: string;
    targetArrivalUnix: number;
}) => {
    const matchingLine = etas
        .filter((eta) => String(eta.line || '').trim().toUpperCase() === line)
        .sort((left, right) => Math.abs(left.arrivalTimestamp - targetArrivalUnix) - Math.abs(right.arrivalTimestamp - targetArrivalUnix));

    const best = matchingLine[0] ?? null;
    if (!best) {
        return null;
    }

    return Math.abs(best.arrivalTimestamp - targetArrivalUnix) <= (90 * 60) ? best : null;
};

const buildGenericCommuteRouteBody = ({
    routeStartUnix,
    routeSummary,
    firstTransitStopName,
    firstTransitLine,
    firstTransitStopOffsetMinutes,
    walkDurationSeconds,
    walkDistanceMeters,
}: {
    routeStartUnix: number;
    routeSummary: string;
    firstTransitStopName?: string | null;
    firstTransitLine?: string | null;
    firstTransitStopOffsetMinutes?: number | null;
    walkDurationSeconds?: number | null;
    walkDistanceMeters?: number | null;
}) => {
    const walkParts = [formatDurationMinutes(walkDurationSeconds), formatDistance(walkDistanceMeters)].filter(Boolean);
    const plannedFirstStop = buildPlannedFirstStopText({
        routeStartUnix,
        firstTransitStopName,
        firstTransitLine,
        firstTransitStopOffsetMinutes,
    });
    const plannedFirstStopText = plannedFirstStop
        ? `Линия ${plannedFirstStop.normalizedLine} ще бъде на спирка ${plannedFirstStop.stopLabel} по разписание в ${plannedFirstStop.scheduledClock}.`
        : '';
    return `Тръгни в ${formatClockFromUnix(routeStartUnix)}.${walkParts.length ? ` Пеша: ${walkParts.join(' • ')}.` : ''}${plannedFirstStopText} ${routeSummary}`.trim();
};

const buildCommuteRouteBody = async ({
    routeSummary,
    routeStartUnix,
    firstTransitStopId,
    firstTransitStopName,
    firstTransitLine,
    firstTransitStopOffsetMinutes,
    walkDurationSeconds,
    walkDistanceMeters,
}: {
    routeSummary: string;
    routeStartUnix: number;
    firstTransitStopId?: string | null;
    firstTransitStopName?: string | null;
    firstTransitLine?: string | null;
    firstTransitStopOffsetMinutes?: number | null;
    walkDurationSeconds?: number | null;
    walkDistanceMeters?: number | null;
}) => {
    const normalizedLine = String(firstTransitLine || '').trim().toUpperCase();
    const walkParts = [formatDurationMinutes(walkDurationSeconds), formatDistance(walkDistanceMeters)].filter(Boolean);
    const walkText = walkParts.length ? ` Пеша: ${walkParts.join(' • ')}.` : '';
    const plannedFirstStop = buildPlannedFirstStopText({
        routeStartUnix,
        firstTransitStopName,
        firstTransitLine,
        firstTransitStopOffsetMinutes,
    });
    if (!firstTransitStopId || !normalizedLine || !Number.isFinite(firstTransitStopOffsetMinutes)) {
        return buildGenericCommuteRouteBody({
            routeStartUnix,
            routeSummary,
            firstTransitStopName,
            firstTransitLine,
            firstTransitStopOffsetMinutes,
            walkDurationSeconds,
            walkDistanceMeters,
        });
    }

    const firstStopUnix = routeStartUnix + (Math.round(Number(firstTransitStopOffsetMinutes)) * 60);
    const nowUnix = Math.floor(Date.now() / 1000);
    if (firstStopUnix - nowUnix > 6 * 3600) {
        return buildGenericCommuteRouteBody({
            routeStartUnix,
            routeSummary,
            firstTransitStopName,
            firstTransitLine,
            firstTransitStopOffsetMinutes,
            walkDurationSeconds,
            walkDistanceMeters,
        });
    }

    const etasByStopId = await fetchStopEtas([firstTransitStopId]);
    const matchingEta = pickMatchingFirstStopEta({
        etas: etasByStopId[firstTransitStopId] || [],
        line: normalizedLine,
        targetArrivalUnix: firstStopUnix,
    });

    if (!matchingEta) {
        const stopLabel = firstTransitStopName || 'първата спирка';
        if (plannedFirstStop) {
            return `Тръгни в ${formatClockFromUnix(routeStartUnix)}.${walkText} ${plannedFirstStop.normalizedLine} на ${plannedFirstStop.stopLabel} е по разписание в ${plannedFirstStop.scheduledClock}.`;
        }

        return `Тръгни в ${formatClockFromUnix(routeStartUnix)}.${walkText} ${normalizedLine} на ${stopLabel} няма актуални данни.`;
    }

    const scheduleInfo = getEtaScheduleInfo({
        stopId: matchingEta.stopId,
        routeId: matchingEta.routeId,
        arrivalTimestamp: matchingEta.arrivalTimestamp,
    });
    const delayText = formatDelayText(scheduleInfo.delayMinutes);
    const scheduleClock = formatScheduleClock(scheduleInfo.scheduledMinSinceMidnight);
    const stopLabel = firstTransitStopName || 'първата спирка';
    const vehicleText = scheduleClock
        ? `${normalizedLine} на ${stopLabel} е по график в ${scheduleClock} и се очаква в ${formatClockFromUnix(matchingEta.arrivalTimestamp)}`
        : `${normalizedLine} на ${stopLabel} се очаква в ${formatClockFromUnix(matchingEta.arrivalTimestamp)}`;

    return delayText
        ? `Тръгни в ${formatClockFromUnix(routeStartUnix)}.${walkText} ${vehicleText} и ${delayText}.`
        : `Тръгни в ${formatClockFromUnix(routeStartUnix)}.${walkText} ${vehicleText}.`;
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