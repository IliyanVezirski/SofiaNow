import { calculateBearingDegrees } from '../transitUtils';

const MIN_MOVEMENT_FOR_HEADING_METERS = 8;
const MAX_REPORTED_VS_TRACK_DELTA_DEGREES = 55;
const MIN_DISTANCE_TO_RESOLVE_NEXT_STOP_METERS = 12;

const normalizeHeading = (heading: number) => ((heading % 360) + 360) % 360;

const shortestHeadingDelta = (from: number, to: number) => {
    let delta = to - from;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return delta;
};

const distanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const earthRadiusMeters = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export { distanceMeters };

export interface TripStopTarget {
    stopId: string;
    stopSequence?: number;
    latitude: number;
    longitude: number;
    arrivalTimestamp?: number;
    departureTimestamp?: number;
}

export const getUpcomingStopTargetsByTripId = (entities: any[], stopCoordinatesById: Record<string, { latitude: number; longitude: number }>) => {
    const nowUnix = Math.floor(Date.now() / 1000);
    const targetsByTripId = new Map<string, TripStopTarget[]>();

    entities.forEach((entity: any) => {
        const tripId = String(entity?.tripUpdate?.trip?.tripId || '').trim();
        if (!tripId) return;

        const targets = (entity.tripUpdate.stopTimeUpdate || [])
            .map((stu: any) => {
                const stopId = String(stu.stopId || '').trim();
                const coordinates = stopCoordinatesById[stopId];
                if (!stopId || !coordinates) return null;
                const arrivalTimestamp = Number(stu.arrival?.time || 0) || undefined;
                const departureTimestamp = Number(stu.departure?.time || 0) || undefined;
                const stopSequence = Number(stu.stopSequence || 0) || undefined;
                const effectiveTimestamp = arrivalTimestamp || departureTimestamp || 0;
                if (effectiveTimestamp && effectiveTimestamp < nowUnix - 60) return null;
                return { stopId, stopSequence, latitude: coordinates.latitude, longitude: coordinates.longitude, arrivalTimestamp, departureTimestamp } satisfies TripStopTarget;
            })
            .filter(Boolean) as TripStopTarget[];

        if (!targets.length) return;
        targets.sort((left, right) => {
            if (Number.isFinite(left.stopSequence) && Number.isFinite(right.stopSequence)) {
                return Number(left.stopSequence) - Number(right.stopSequence);
            }
            return Number(left.arrivalTimestamp || left.departureTimestamp || 0) - Number(right.arrivalTimestamp || right.departureTimestamp || 0);
        });
        targetsByTripId.set(tripId, targets);
    });
    return targetsByTripId;
};

export const pickNextStopTarget = ({
    tripStopTargets, latitude, longitude, vehicleStopId, currentStopSequence, currentStatus,
}: {
    tripStopTargets?: TripStopTarget[];
    latitude: number;
    longitude: number;
    vehicleStopId?: string;
    currentStopSequence?: number;
    currentStatus?: string;
}) => {
    if (!tripStopTargets?.length) return undefined;

    const normalizedVehicleStopId = String(vehicleStopId || '').trim();
    let targetIndex = tripStopTargets.findIndex((target) => {
        if (Number.isFinite(currentStopSequence) && Number.isFinite(target.stopSequence)) {
            return Number(target.stopSequence) > Number(currentStopSequence);
        }
        if (normalizedVehicleStopId && currentStatus === 'STOPPED_AT') {
            return target.stopId !== normalizedVehicleStopId;
        }
        return true;
    });

    if (targetIndex < 0) targetIndex = 0;
    if (normalizedVehicleStopId && tripStopTargets[targetIndex]?.stopId === normalizedVehicleStopId && targetIndex < tripStopTargets.length - 1) {
        targetIndex += 1;
    }
    const target = tripStopTargets[targetIndex];
    if (!target) return undefined;
    if (targetIndex < tripStopTargets.length - 1 && distanceMeters(latitude, longitude, target.latitude, target.longitude) < MIN_DISTANCE_TO_RESOLVE_NEXT_STOP_METERS) {
        return tripStopTargets[targetIndex + 1];
    }
    return target;
};

export const resolveVehicleHeading = ({
    previousSnapshot, latitude, longitude, reportedBearing, nextStopTarget,
}: {
    previousSnapshot?: { latitude: number; longitude: number; headingDegrees?: number };
    latitude: number;
    longitude: number;
    reportedBearing?: number;
    nextStopTarget?: { latitude: number; longitude: number };
}) => {
    if (nextStopTarget) {
        return normalizeHeading(calculateBearingDegrees(latitude, longitude, nextStopTarget.latitude, nextStopTarget.longitude));
    }

    const hasReportedBearing = Number.isFinite(reportedBearing);
    const normalizedReported = hasReportedBearing ? normalizeHeading(Number(reportedBearing)) : undefined;
    if (!previousSnapshot) return normalizedReported;

    const movedMeters = distanceMeters(previousSnapshot.latitude, previousSnapshot.longitude, latitude, longitude);
    const trackHeading = movedMeters >= MIN_MOVEMENT_FOR_HEADING_METERS
        ? normalizeHeading(calculateBearingDegrees(previousSnapshot.latitude, previousSnapshot.longitude, latitude, longitude))
        : undefined;

    if (Number.isFinite(trackHeading) && Number.isFinite(normalizedReported)) {
        const delta = Math.abs(shortestHeadingDelta(trackHeading as number, normalizedReported as number));
        return delta <= MAX_REPORTED_VS_TRACK_DELTA_DEGREES ? normalizedReported : trackHeading;
    }
    if (Number.isFinite(trackHeading)) return trackHeading;
    if (Number.isFinite(normalizedReported)) return normalizedReported;
    return previousSnapshot.headingDegrees;
};
