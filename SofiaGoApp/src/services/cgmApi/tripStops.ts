import { TripStopInfo } from '../../types/vehicles';
import { getTripUpdateEntities } from './gtfsFeed';
import { stopCoordinatesById, stopNameById } from './routeResolver';

export const fetchTripStops = async (tripId: string): Promise<TripStopInfo[]> => {
    if (!tripId) return [];
    try {
        const entities = await getTripUpdateEntities();
        const nowUnix = Math.floor(Date.now() / 1000);

        for (const entity of entities) {
            if (String(entity?.tripUpdate?.trip?.tripId || '').trim() !== tripId) continue;

            const stops: TripStopInfo[] = [];
            for (const stu of entity.tripUpdate.stopTimeUpdate || []) {
                const stopId = String(stu.stopId || '').trim();
                if (!stopId) continue;
                const coords = stopCoordinatesById[stopId];
                if (!coords) continue;

                const arrivalTimestamp = Number(stu.arrival?.time || 0) || undefined;
                const departureTimestamp = Number(stu.departure?.time || 0) || undefined;
                const effectiveTs = arrivalTimestamp || departureTimestamp || 0;
                if (effectiveTs && effectiveTs < nowUnix - 60) continue;

                stops.push({
                    stopId,
                    stopName: stopNameById[stopId] || stopId,
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    arrivalTimestamp,
                    departureTimestamp,
                    stopSequence: Number(stu.stopSequence || 0) || undefined,
                });
            }

            stops.sort((a, b) => {
                if (a.stopSequence && b.stopSequence) return a.stopSequence - b.stopSequence;
                return (a.arrivalTimestamp || a.departureTimestamp || 0) - (b.arrivalTimestamp || b.departureTimestamp || 0);
            });
            return stops;
        }
        return [];
    } catch (err) {
        console.warn('fetchTripStops failed:', err);
        return [];
    }
};
