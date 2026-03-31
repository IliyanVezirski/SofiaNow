import type { FavoriteCommuteWeekday } from '../places/types';
import type { StopEta } from '../../types/vehicles';

const WEEKDAY_LABELS: Record<FavoriteCommuteWeekday, string> = {
    1: 'Нд',
    2: 'Пн',
    3: 'Вт',
    4: 'Ср',
    5: 'Чт',
    6: 'Пт',
    7: 'Сб',
};

export const formatWeekdays = (weekdays: FavoriteCommuteWeekday[]) => {
    if (weekdays.length === 7) {
        return 'всеки ден';
    }

    return weekdays.map((weekday) => WEEKDAY_LABELS[weekday]).join(', ');
};

export const parseReminderTime = (value: string) => {
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim());
    if (!match) {
        return null;
    }

    return {
        hour: Number(match[1]),
        minute: Number(match[2]),
    };
};

export const formatDurationMinutes = (seconds: number | null | undefined) => {
    if (!Number.isFinite(seconds) || Number(seconds) <= 0) {
        return null;
    }

    return `${Math.max(1, Math.round(Number(seconds) / 60))} мин`;
};

export const formatDistance = (meters: number | null | undefined) => {
    if (!Number.isFinite(meters) || Number(meters) <= 0) {
        return null;
    }

    const normalized = Math.round(Number(meters));
    if (normalized >= 1000) {
        return `${(normalized / 1000).toFixed(normalized >= 10000 ? 0 : 1).replace(/\.0$/, '')} км`;
    }

    return `${normalized} м`;
};

export const formatScheduleClock = (scheduledMinSinceMidnight: number | null | undefined) => {
    if (!Number.isFinite(scheduledMinSinceMidnight)) {
        return null;
    }

    const totalMinutes = Math.max(0, Math.round(Number(scheduledMinSinceMidnight)));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const weekdayToJsDay = (weekday: FavoriteCommuteWeekday) => (weekday === 1 ? 0 : weekday - 1);

export const formatClockFromUnix = (unixSeconds: number) => {
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

export const getNextOccurrenceUnixForWeekday = (weekday: FavoriteCommuteWeekday, hour: number, minute: number) => {
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

export const getNextOccurrenceUnix = (weekdays: FavoriteCommuteWeekday[], hour: number, minute: number) => {
    let best: number | null = null;

    weekdays.forEach((weekday) => {
        const candidateUnix = getNextOccurrenceUnixForWeekday(weekday, hour, minute);
        if (best == null || candidateUnix < best) {
            best = candidateUnix;
        }
    });

    return best;
};

export const pickMatchingFirstStopEta = ({
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

export const formatCountdownText = (reminderOffsetMinutes: number | null | undefined) => {
    if (!Number.isFinite(reminderOffsetMinutes) || Number(reminderOffsetMinutes) <= 0) {
        return '';
    }

    const minutes = Math.round(Number(reminderOffsetMinutes));
    return minutes === 1
        ? 'Остава 1 мин до тръгване за да си навреме на спирката. '
        : `Остават ${minutes} мин до тръгване за да си навреме на спирката. `;
};
