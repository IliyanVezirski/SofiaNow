import type { StopEta } from '../../types/vehicles';
import { getEtaScheduleInfo } from '../cgmApi/schedules';
import type { StoredTransitArrivalReminder } from './transitArrivalNotification.types';

export const getScheduledArrivalTimestamp = (eta: Pick<StopEta, 'stopId' | 'routeId' | 'arrivalTimestamp'>) => {
    const scheduleInfo = getEtaScheduleInfo({
        stopId: eta.stopId,
        routeId: eta.routeId,
        arrivalTimestamp: eta.arrivalTimestamp,
    });

    if (scheduleInfo.scheduledMinSinceMidnight == null) {
        return null;
    }

    const arrivalDate = new Date(eta.arrivalTimestamp * 1000);
    const scheduledDate = new Date(arrivalDate);
    const normalizedScheduledMinutes = Math.max(0, Math.round(scheduleInfo.scheduledMinSinceMidnight));
    const dayOffset = Math.floor(normalizedScheduledMinutes / (24 * 60));
    const scheduledHour = Math.floor((normalizedScheduledMinutes % (24 * 60)) / 60);
    const scheduledMinute = normalizedScheduledMinutes % 60;

    scheduledDate.setDate(scheduledDate.getDate() + dayOffset);
    scheduledDate.setHours(scheduledHour, scheduledMinute, 0, 0);

    let scheduledTimestamp = Math.floor(scheduledDate.getTime() / 1000);
    const diffSeconds = scheduledTimestamp - eta.arrivalTimestamp;
    if (diffSeconds > 12 * 3600) {
        scheduledTimestamp -= 24 * 3600;
    } else if (diffSeconds < -12 * 3600) {
        scheduledTimestamp += 24 * 3600;
    }

    return scheduledTimestamp;
};

export const buildReminderKey = ({
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

export const matchesReminderToEta = (reminder: StoredTransitArrivalReminder, eta: Pick<StopEta, 'tripId' | 'stopId' | 'routeId' | 'line'>) => (
    reminder.tripId === eta.tripId
    && reminder.stopId === eta.stopId
    && reminder.routeId === eta.routeId
    && reminder.line === eta.line
);

export const matchesReminderToScheduledEta = (reminder: StoredTransitArrivalReminder, eta: StopEta) => {
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

export const formatClock = (unixSeconds: number) => {
    const date = new Date(unixSeconds * 1000);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export const formatDelayText = (delayMinutes: number | null | undefined) => {
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

export const formatRemainingMinutesText = (remainingMinutes: number) => {
    if (remainingMinutes <= 1) {
        return 'Остава около 1 мин до пристигането';
    }

    return `Остават около ${remainingMinutes} мин до пристигането`;
};

export const buildReminderBody = ({
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
    const remainingMinutesText = formatRemainingMinutesText(Math.max(1, minutesBefore));
    const base = eta.destination
        ? `${eta.line} към ${eta.destination} ще е на ${stopName} около ${arrivalText}`
        : `Линия ${eta.line} ще е на ${stopName} около ${arrivalText}`;

    if (isFollowUp) {
        return delayText
            ? `${base}. ${remainingMinutesText}. Актуализация: ${delayText}.`
            : `${base}. ${remainingMinutesText}. Актуализирано време на пристигане.`;
    }

    return delayText
        ? `${base} и ${delayText}. ${remainingMinutesText}.`
        : `${base}. ${remainingMinutesText}.`;
};

export const pickFollowUpEta = (reminder: StoredTransitArrivalReminder, etas: StopEta[], fallbackEta: StopEta | null) => {
    if (reminder.followUpTripId) {
        return etas.find((eta) => eta.tripId === reminder.followUpTripId && eta.line === reminder.line) ?? null;
    }

    return fallbackEta;
};

export const pickMatchingEta = (reminder: StoredTransitArrivalReminder, etas: StopEta[]) => {
    if (!etas.length) {
        return null;
    }

    const exactTrip = etas.find((eta) => eta.tripId === reminder.tripId && eta.line === reminder.line);
    if (exactTrip) {
        return exactTrip;
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
