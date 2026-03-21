import { StopEta } from '../../types/vehicles';
import { getRouteMetadata, inferLineTypeFromToken } from '../transitUtils';
import { getTripUpdateEntities } from './gtfsFeed';
import { resolveLineByRouteShortName, getStaticDestination } from './routeResolver';

const MAX_STOP_ETA_RESULTS = 12;
const MAX_FULL_SCHEDULE_RESULTS = 200;

export const fetchStopEtas = async (stopIds: string[]): Promise<Record<string, StopEta[]>> => {
    if (!stopIds.length) return {};

    try {
        const entities = await getTripUpdateEntities();
        const expandedStopIds = new Set<string>();
        const originalIdMap = new Map<string, string>();

        stopIds.forEach(compoundId => {
            compoundId.split(',').forEach(id => {
                expandedStopIds.add(id);
                originalIdMap.set(id, compoundId);
            });
        });

        const etasByStopId: Record<string, StopEta[]> = {};
        const nowUnix = Math.floor(Date.now() / 1000);

        entities.forEach((entity: any) => {
            const tripUpdate = entity.tripUpdate;
            if (!tripUpdate?.trip) return;

            const routeMetadata = getRouteMetadata(tripUpdate.trip.routeId);
            const resolvedLine = resolveLineByRouteShortName(tripUpdate.trip.routeId);
            const resolvedType = inferLineTypeFromToken(resolvedLine);

            (tripUpdate.stopTimeUpdate || []).forEach((stu: any) => {
                const gtfsStopId = stu.stopId;
                if (!expandedStopIds.has(gtfsStopId)) return;
                const arrivalTimestamp = Number(stu.arrival?.time || stu.departure?.time || 0);
                if (!arrivalTimestamp || arrivalTimestamp < nowUnix) return;

                const compoundId = originalIdMap.get(gtfsStopId)!;

                const eta: StopEta = {
                    stopId: compoundId, // Present the ETA associated with the unified stop
                    tripId: tripUpdate.trip.tripId || entity.id,
                    routeId: routeMetadata.routeId,
                    line: resolvedLine,
                    type: resolvedType,
                    arrivalTimestamp,
                    minutesAway: Math.max(0, Math.round((arrivalTimestamp - nowUnix) / 60)),
                };

                if (!etasByStopId[compoundId]) etasByStopId[compoundId] = [];
                etasByStopId[compoundId].push(eta);
            });
        });

        Object.keys(etasByStopId).forEach((stopId) => {
            etasByStopId[stopId] = etasByStopId[stopId]
                .sort((a, b) => a.arrivalTimestamp - b.arrivalTimestamp)
                .slice(0, MAX_STOP_ETA_RESULTS);
        });
        return etasByStopId;
    } catch (error) {
        console.error('Failed to fetch stop ETAs:', error);
        return {};
    }
};

export const fetchFullStopSchedule = async (stopId: string): Promise<StopEta[]> => {
    if (!stopId) return [];
    try {
        const entities = await getTripUpdateEntities();
        const nowUnix = Math.floor(Date.now() / 1000);
        const results: StopEta[] = [];
        const expandedStopIds = new Set(stopId.split(','));

        entities.forEach((entity: any) => {
            const tripUpdate = entity.tripUpdate;
            if (!tripUpdate?.trip) return;

            const routeMetadata = getRouteMetadata(tripUpdate.trip.routeId);
            const resolvedLine = resolveLineByRouteShortName(tripUpdate.trip.routeId);
            const resolvedType = inferLineTypeFromToken(resolvedLine);

            const stopTimeUpdates = tripUpdate.stopTimeUpdate || [];
            const lastTripStopUpdate = stopTimeUpdates.length > 0
                ? stopTimeUpdates.reduce((max: any, s: any) => (s.stopSequence ?? 0) > (max.stopSequence ?? 0) ? s : max, stopTimeUpdates[0])
                : null;
            const lastTripStopId = lastTripStopUpdate?.stopId || '';

            stopTimeUpdates.forEach((stu: any) => {
                if (!expandedStopIds.has(stu.stopId)) return;
                const arrivalTimestamp = Number(stu.arrival?.time || stu.departure?.time || 0);
                if (!arrivalTimestamp) return;

                results.push({
                    stopId, // Preserve the compound ID 
                    tripId: tripUpdate.trip.tripId || entity.id,
                    routeId: routeMetadata.routeId,
                    line: resolvedLine,
                    type: resolvedType,
                    arrivalTimestamp,
                    minutesAway: Math.max(0, Math.round((arrivalTimestamp - nowUnix) / 60)),
                    destination: getStaticDestination(routeMetadata.routeId, stopId, lastTripStopId),
                });
            });
        });

        return results
            .sort((a, b) => {
                const lineCmp = a.line.localeCompare(b.line, 'bg', { numeric: true });
                if (lineCmp !== 0) return lineCmp;
                return a.arrivalTimestamp - b.arrivalTimestamp;
            })
            .slice(0, MAX_FULL_SCHEDULE_RESULTS);
    } catch (error) {
        console.error('Failed to fetch full stop schedule:', error);
        return [];
    }
};
