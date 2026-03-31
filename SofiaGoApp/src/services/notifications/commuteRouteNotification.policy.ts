import * as Notifications from 'expo-notifications';

import { fetchStopEtas } from '../cgmApi/stopEtas';
import { getEtaScheduleInfo } from '../cgmApi/schedules';
import type { FavoriteCommuteWeekday } from '../places/types';
import {
    formatClockFromUnix,
    formatCountdownText,
    formatDelayText,
    formatDistance,
    formatDurationMinutes,
    formatScheduleClock,
    pickMatchingFirstStopEta,
} from './commuteRouteNotification.utils';

const FAVORITE_COMMUTE_ROUTE_NOTIFICATION_CATEGORY_ID = 'favorite-commute-route';
const FAVORITE_COMMUTE_ROUTE_NOTIFICATION_ACTION_SHOW_ROUTE = 'show-route';

export const ensureFavoriteCommuteRouteCategoryRegistered = async () => {
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

const buildGenericCommuteRouteBody = ({
    routeStartUnix,
    routeSummary,
    firstTransitStopName,
    firstTransitLine,
    firstTransitStopOffsetMinutes,
    walkDurationSeconds,
    walkDistanceMeters,
    reminderOffsetMinutes,
}: {
    routeStartUnix: number;
    routeSummary: string;
    firstTransitStopName?: string | null;
    firstTransitLine?: string | null;
    firstTransitStopOffsetMinutes?: number | null;
    walkDurationSeconds?: number | null;
    walkDistanceMeters?: number | null;
    reminderOffsetMinutes?: number | null;
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
    const countdown = formatCountdownText(reminderOffsetMinutes);
    return `${countdown}Тръгни в ${formatClockFromUnix(routeStartUnix)}.${walkParts.length ? ` Пеша: ${walkParts.join(' • ')}.` : ''}${plannedFirstStopText} ${routeSummary}`.trim();
};

export const buildCommuteRouteBody = async ({
    routeSummary,
    routeStartUnix,
    firstTransitStopId,
    firstTransitStopName,
    firstTransitLine,
    firstTransitStopOffsetMinutes,
    walkDurationSeconds,
    walkDistanceMeters,
    reminderOffsetMinutes,
}: {
    routeSummary: string;
    routeStartUnix: number;
    firstTransitStopId?: string | null;
    firstTransitStopName?: string | null;
    firstTransitLine?: string | null;
    firstTransitStopOffsetMinutes?: number | null;
    walkDurationSeconds?: number | null;
    walkDistanceMeters?: number | null;
    reminderOffsetMinutes?: number | null;
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
            reminderOffsetMinutes,
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
            reminderOffsetMinutes,
        });
    }

    const etasByStopId = await fetchStopEtas([firstTransitStopId]);
    const matchingEta = pickMatchingFirstStopEta({
        etas: etasByStopId[firstTransitStopId] || [],
        line: normalizedLine,
        targetArrivalUnix: firstStopUnix,
    });

    const countdown = formatCountdownText(reminderOffsetMinutes);

    if (!matchingEta) {
        const stopLabel = firstTransitStopName || 'първата спирка';
        if (plannedFirstStop) {
            return `${countdown}Тръгни в ${formatClockFromUnix(routeStartUnix)}.${walkText} ${plannedFirstStop.normalizedLine} на ${plannedFirstStop.stopLabel} е по разписание в ${plannedFirstStop.scheduledClock}.`;
        }

        return `${countdown}Тръгни в ${formatClockFromUnix(routeStartUnix)}.${walkText} ${normalizedLine} на ${stopLabel} няма актуални данни.`;
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
        ? `${countdown}Тръгни в ${formatClockFromUnix(routeStartUnix)}.${walkText} ${vehicleText} и ${delayText}.`
        : `${countdown}Тръгни в ${formatClockFromUnix(routeStartUnix)}.${walkText} ${vehicleText}.`;
};

export const normalizeCommuteNotificationWeekdays = (weekdays: FavoriteCommuteWeekday[]) => (
    Array.from(new Set(
        weekdays
            .map((weekday) => Number(weekday))
            .filter((weekday): weekday is FavoriteCommuteWeekday => Number.isInteger(weekday) && weekday >= 1 && weekday <= 7),
    ))
);
