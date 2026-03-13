import { GlobalDeparture } from '../../types/vehicles';
import { getRouteMetadata, inferLineTypeFromToken } from '../transitUtils';
import { getTripUpdateEntities } from './gtfsFeed';
import { resolveLineByRouteShortName } from './routeResolver';

export const fetchGlobalDepartures = async (limit = 120): Promise<GlobalDeparture[]> => {
    try {
        const entities = await getTripUpdateEntities();
        const nowUnix = Math.floor(Date.now() / 1000);
        const departures: GlobalDeparture[] = [];

        entities.forEach((entity: any) => {
            const tripUpdate = entity.tripUpdate;
            if (!tripUpdate?.trip) return;

            const routeMetadata = getRouteMetadata(tripUpdate.trip.routeId);
            const resolvedLine = resolveLineByRouteShortName(tripUpdate.trip.routeId);
            const resolvedType = inferLineTypeFromToken(resolvedLine);

            (tripUpdate.stopTimeUpdate || []).forEach((stu: any) => {
                const stopId = String(stu.stopId || '');
                if (!stopId) return;
                const arrivalTimestamp = Number(stu.arrival?.time || stu.departure?.time || 0);
                if (!arrivalTimestamp || arrivalTimestamp < nowUnix) return;

                departures.push({
                    stopId,
                    tripId: tripUpdate.trip.tripId || entity.id,
                    routeId: routeMetadata.routeId,
                    line: resolvedLine,
                    type: resolvedType,
                    arrivalTimestamp,
                    minutesAway: Math.max(0, Math.round((arrivalTimestamp - nowUnix) / 60)),
                    stopSequence: Number(stu.stopSequence || 0) || undefined,
                });
            });
        });

        return departures
            .sort((a, b) => a.arrivalTimestamp - b.arrivalTimestamp)
            .slice(0, limit);
    } catch (error) {
        console.error('Failed to fetch global departures:', error);
        return [];
    }
};
