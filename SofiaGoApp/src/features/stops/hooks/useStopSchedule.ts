import { useState, useCallback, useMemo, useRef } from 'react';
import { StopEta, StaticScheduleEntry, DayType } from '../../../types/vehicles';
import { fetchFullStopSchedule } from '../../../services/cgmApi/stopEtas';
import { getStaticStopSchedule, getDayTypeForDate } from '../../../services/cgmApi/schedules';
import { fetchTripApiAvailableLines, fetchTripApiLineSchedule, getTripApiStopScheduleEntries, TripApiLineSchedule } from '../../../services/cgmApi/tripScheduleApi';
import { AvailableLine, fetchAvailableLines } from '../../../services/stopsApi';

const tripAvailableLinesPromise = fetchTripApiAvailableLines().catch(() => fetchAvailableLines());
const tripLineScheduleCache = new Map<string, Promise<TripApiLineSchedule | null>>();

const getAvailableScheduleLines = async (): Promise<AvailableLine[]> => tripAvailableLinesPromise;

const getLineCacheKey = (line: AvailableLine) => `${line.type}:${line.line}:${String(line.routeId || '').trim().toUpperCase()}`;

const getTripApiLineScheduleCached = async (line: AvailableLine): Promise<TripApiLineSchedule | null> => {
    const cacheKey = getLineCacheKey(line);
    const cached = tripLineScheduleCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const pending = fetchTripApiLineSchedule(line)
        .catch(() => {
            tripLineScheduleCache.delete(cacheKey);
            return null;
        });
    tripLineScheduleCache.set(cacheKey, pending);
    return pending;
};

const mergeScheduleEntries = (entries: StaticScheduleEntry[]) => {
    const mergedEntries = new Map<string, StaticScheduleEntry>();

    entries.forEach((entry) => {
        const entryKey = `${entry.line}|${entry.type}|${entry.destination}|${entry.routeId}`;
        const existing = mergedEntries.get(entryKey);
        if (!existing) {
            mergedEntries.set(entryKey, {
                ...entry,
                times: [...entry.times].sort((left, right) => left - right),
                partialTimeKinds: entry.partialTimeKinds ? { ...entry.partialTimeKinds } : undefined,
            });
            return;
        }

        const mergedTimes = new Set(existing.times);
        entry.times.forEach((time) => mergedTimes.add(time));
        existing.times = Array.from(mergedTimes).sort((left, right) => left - right);
        if (entry.partialTimeKinds) {
            existing.partialTimeKinds = {
                ...(existing.partialTimeKinds || {}),
                ...entry.partialTimeKinds,
            };
        }
    });

    return Array.from(mergedEntries.values())
        .sort((left, right) => (
            left.line.localeCompare(right.line, 'bg-BG', { numeric: true })
            || left.destination.localeCompare(right.destination, 'bg-BG')
        ));
};

export const useStopSchedule = () => {
    const [scheduleStopId, setScheduleStopId] = useState<string | null>(null);
    const [scheduleStopName, setScheduleStopName] = useState('');
    const [scheduleRealtime, setScheduleRealtime] = useState<StopEta[]>([]);
    const [scheduleStatic, setScheduleStatic] = useState<StaticScheduleEntry[]>([]);
    const [scheduleDayType, setScheduleDayType] = useState<DayType>(getDayTypeForDate());
    const [staticLoading, setStaticLoading] = useState(false);
    const [realtimeLoading, setRealtimeLoading] = useState(false);
    const activeStopIdRef = useRef<string | null>(null);
    const staticRequestIdRef = useRef(0);

    const loadStaticSchedule = useCallback(async (stopId: string, dayType: DayType) => {
        const requestId = ++staticRequestIdRef.current;
        const fallbackSchedule = getStaticStopSchedule(stopId, dayType);
        const candidateLineKeys = new Set(
            fallbackSchedule.map((entry) => `${entry.type}:${entry.line}`),
        );

        setStaticLoading(true);
        setScheduleStatic(fallbackSchedule);

        if (candidateLineKeys.size === 0) {
            if (activeStopIdRef.current === stopId && staticRequestIdRef.current === requestId) {
                setStaticLoading(false);
            }
            return;
        }

        try {
            const availableLines = await getAvailableScheduleLines();
            if (activeStopIdRef.current !== stopId || staticRequestIdRef.current !== requestId) {
                return;
            }

            const relevantLines = availableLines.filter((line) => candidateLineKeys.has(`${line.type}:${line.line}`));
            if (!relevantLines.length) {
                return;
            }

            const tripSchedules = await Promise.all(relevantLines.map((line) => getTripApiLineScheduleCached(line)));
            if (activeStopIdRef.current !== stopId || staticRequestIdRef.current !== requestId) {
                return;
            }

            const tripEntries = mergeScheduleEntries(
                tripSchedules.flatMap((lineSchedule) => {
                    if (!lineSchedule) {
                        return [];
                    }

                    return getTripApiStopScheduleEntries(lineSchedule, stopId, null, null, [], dayType) || [];
                }),
            );

            if (tripEntries.length > 0) {
                setScheduleStatic(tripEntries);
            }
        } catch {
            // bundled static schedule remains visible
        } finally {
            if (activeStopIdRef.current === stopId && staticRequestIdRef.current === requestId) {
                setStaticLoading(false);
            }
        }
    }, []);

    const openStopSchedule = useCallback(async (stopId: string, stopName: string) => {
        activeStopIdRef.current = stopId;
        setScheduleStopId(stopId);
        setScheduleStopName(stopName);
        setScheduleRealtime([]);
        void loadStaticSchedule(stopId, scheduleDayType);
        setRealtimeLoading(true);

        try {
            const realtime = await fetchFullStopSchedule(stopId);
            if (activeStopIdRef.current === stopId) {
                setScheduleRealtime(realtime);
            }
        } catch {
            // static schedule is still shown
        } finally {
            if (activeStopIdRef.current === stopId) {
                setRealtimeLoading(false);
            }
        }
    }, [loadStaticSchedule, scheduleDayType]);

    const closeSchedule = useCallback(() => {
        activeStopIdRef.current = null;
        staticRequestIdRef.current += 1;
        setScheduleStopId(null);
        setScheduleRealtime([]);
        setScheduleStatic([]);
        setStaticLoading(false);
        setRealtimeLoading(false);
    }, []);

    const changeDayType = useCallback((dt: DayType) => {
        setScheduleDayType(dt);
        if (scheduleStopId) {
            void loadStaticSchedule(scheduleStopId, dt);
        }
    }, [loadStaticSchedule, scheduleStopId]);

    const scheduleLoading = useMemo(() => staticLoading || realtimeLoading, [realtimeLoading, staticLoading]);

    return {
        scheduleStopId, scheduleStopName, scheduleRealtime, scheduleStatic,
        scheduleDayType, scheduleLoading,
        openStopSchedule, closeSchedule, changeDayType,
    };
};
