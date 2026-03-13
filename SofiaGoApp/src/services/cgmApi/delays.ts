import { getTripUpdateEntities } from './gtfsFeed';
import { getRouteMetadata } from '../transitUtils';
import { getDayTypeForDate } from './schedules';
import bundledSchedule from '../../data/schedule.weekly.static.json';

const scheduleIndex = bundledSchedule as Record<string, Record<string, { w: number[]; h: number[] }>>;

export const fetchTripDelay = async (tripId: string): Promise<number | null> => {
    if (!tripId) return null;
    try {
        const entities = await getTripUpdateEntities();
        let tripUpdate: any = null;
        for (const entity of entities) {
            const tu = entity.tripUpdate;
            if (!tu?.trip) continue;
            if ((tu.trip.tripId || entity.id) === tripId) { tripUpdate = tu; break; }
        }
        if (!tripUpdate?.stopTimeUpdate?.length) return null;

        const routeId = tripUpdate.trip?.routeId || '';
        if (!routeId) return null;

        const nowSec = Math.floor(Date.now() / 1000);
        const upcoming = tripUpdate.stopTimeUpdate.filter((stu: any) => {
            const t = Number(stu.arrival?.time || stu.departure?.time || 0);
            return t > nowSec;
        }).slice(0, 5);
        if (!upcoming.length) return null;

        const delays: number[] = [];
        const dt = getDayTypeForDate();

        for (const stu of upcoming) {
            const predSec = Number(stu.arrival?.time || stu.departure?.time || 0);
            const d = new Date(predSec * 1000);
            const predMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
            const stopSched = scheduleIndex[stu.stopId as string];
            if (!stopSched) continue;
            const lineKey = Object.keys(stopSched).find((k) => k.startsWith(routeId + '|'));
            if (!lineKey) continue;
            const schedMins = stopSched[lineKey]?.[dt];
            if (!schedMins?.length) continue;

            let bestMatch = -1;
            let bestDiff = Infinity;
            for (const sm of schedMins) {
                const diff = predMin - sm;
                if (diff >= -2 && diff <= 20 && diff < bestDiff) { bestDiff = diff; bestMatch = sm; }
            }
            if (bestMatch >= 0) delays.push(predMin - bestMatch);
        }
        if (!delays.length) return null;
        delays.sort((a, b) => a - b);
        const medianMinutes = delays[Math.floor(delays.length / 2)];
        return Math.round(medianMinutes * 60);
    } catch { return null; }
};
