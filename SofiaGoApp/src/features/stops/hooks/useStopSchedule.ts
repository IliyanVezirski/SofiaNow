import { useState, useCallback } from 'react';
import { StopEta, StaticScheduleEntry, DayType } from '../../../types/vehicles';
import { fetchFullStopSchedule } from '../../../services/cgmApi/stopEtas';
import { getStaticStopSchedule, getDayTypeForDate } from '../../../services/cgmApi/schedules';

export const useStopSchedule = () => {
    const [scheduleStopId, setScheduleStopId] = useState<string | null>(null);
    const [scheduleStopName, setScheduleStopName] = useState('');
    const [scheduleRealtime, setScheduleRealtime] = useState<StopEta[]>([]);
    const [scheduleStatic, setScheduleStatic] = useState<StaticScheduleEntry[]>([]);
    const [scheduleDayType, setScheduleDayType] = useState<DayType>(getDayTypeForDate());
    const [scheduleLoading, setScheduleLoading] = useState(false);

    const openStopSchedule = useCallback(async (stopId: string, stopName: string) => {
        setScheduleStopId(stopId);
        setScheduleStopName(stopName);
        setScheduleLoading(true);
        setScheduleRealtime([]);
        setScheduleStatic(getStaticStopSchedule(stopId, scheduleDayType));
        try {
            const realtime = await fetchFullStopSchedule(stopId);
            setScheduleRealtime(realtime);
        } catch {
            // static schedule is still shown
        } finally {
            setScheduleLoading(false);
        }
    }, [scheduleDayType]);

    const closeSchedule = useCallback(() => {
        setScheduleStopId(null);
        setScheduleRealtime([]);
        setScheduleStatic([]);
    }, []);

    const changeDayType = useCallback((dt: DayType) => {
        setScheduleDayType(dt);
        if (scheduleStopId) setScheduleStatic(getStaticStopSchedule(scheduleStopId, dt));
    }, [scheduleStopId]);

    return {
        scheduleStopId, scheduleStopName, scheduleRealtime, scheduleStatic,
        scheduleDayType, scheduleLoading,
        openStopSchedule, closeSchedule, changeDayType,
    };
};
