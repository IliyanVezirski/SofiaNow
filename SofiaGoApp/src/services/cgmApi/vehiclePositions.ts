import { Vehicle } from '../../types/vehicles';
import { MapBounds } from '../../types/map';
import { getRouteMetadata, inferLineTypeFromToken } from '../transitUtils';
import { getVehiclePositionEntities, getTripUpdateEntities } from './gtfsFeed';
import { getUpcomingStopTargetsByTripId, pickNextStopTarget, resolveVehicleHeading } from './headingResolver';
import { resolveLineByRouteShortName, stopCoordinatesById } from './routeResolver';

const VEHICLE_LAT_DELTA = 0.03;
const VEHICLE_LON_DELTA = 0.03;

const previousVehicleSnapshots = new Map<string, {
    latitude: number;
    longitude: number;
    timestamp: number;
    headingDegrees?: number;
}>();

const buildVehicleFromEntity = (
    entity: any,
    upcomingStopTargetsByTripId: Map<string, any[]>,
): Vehicle | null => {
    if (!entity.vehicle?.position) return null;

    const vLat = entity.vehicle.position.latitude;
    const vLon = entity.vehicle.position.longitude;
    const routeMetadata = getRouteMetadata(entity.vehicle.trip?.routeId);
    const resolvedLine = resolveLineByRouteShortName(entity.vehicle.trip?.routeId);
    const inferredType = inferLineTypeFromToken(resolvedLine);
    const resolvedType = inferredType === 'bus' ? routeMetadata.type : inferredType;
    const vehicleId = entity.vehicle.vehicle?.id || entity.id;
    const tripId = entity.vehicle.trip?.tripId || entity.id;
    const lastUpdatedUnix = Number(entity.vehicle.timestamp || 0) || Math.floor(Date.now() / 1000);
    const previousSnapshot = previousVehicleSnapshots.get(vehicleId);
    const reportedBearing = Number(entity.vehicle.position.bearing);
    const nextStopTarget = pickNextStopTarget({
        tripStopTargets: upcomingStopTargetsByTripId.get(tripId),
        latitude: vLat,
        longitude: vLon,
        vehicleStopId: entity.vehicle.stopId,
        currentStopSequence: Number(entity.vehicle.currentStopSequence || 0) || undefined,
        currentStatus: entity.vehicle.currentStatus,
    });
    const headingDegrees = resolveVehicleHeading({
        previousSnapshot, latitude: vLat, longitude: vLon, reportedBearing, nextStopTarget,
    });

    previousVehicleSnapshots.set(vehicleId, {
        latitude: vLat, longitude: vLon, timestamp: lastUpdatedUnix, headingDegrees,
    });

    return {
        id: vehicleId,
        routeId: routeMetadata.routeId,
        tripId,
        line: resolvedLine,
        type: resolvedType,
        latitude: vLat,
        longitude: vLon,
        speedKph: typeof entity.vehicle.position.speed === 'number' ? entity.vehicle.position.speed : undefined,
        stopId: entity.vehicle.stopId,
        currentStatus: entity.vehicle.currentStatus,
        occupancyStatus: entity.vehicle.occupancyStatus,
        lastUpdatedUnix,
        headingDegrees,
    };
};

export const fetchVehiclesNearby = async (lat: number, lon: number): Promise<Vehicle[]> => {
    try {
        const [vpEntities, tripUpdateEntities] = await Promise.all([
            getVehiclePositionEntities(), getTripUpdateEntities(),
        ]);
        const vehiclesById = new Map<string, Vehicle>();
        const upcomingStopTargetsByTripId = getUpcomingStopTargetsByTripId(tripUpdateEntities, stopCoordinatesById);

        vpEntities.forEach((entity: any) => {
            if (!entity.vehicle?.position) return;
            const vLat = entity.vehicle.position.latitude;
            const vLon = entity.vehicle.position.longitude;
            if (vLat > lat - VEHICLE_LAT_DELTA && vLat < lat + VEHICLE_LAT_DELTA &&
                vLon > lon - VEHICLE_LON_DELTA && vLon < lon + VEHICLE_LON_DELTA) {
                const vehicle = buildVehicleFromEntity(entity, upcomingStopTargetsByTripId);
                if (vehicle) vehiclesById.set(vehicle.id, vehicle);
            }
        });
        return Array.from(vehiclesById.values());
    } catch (error) {
        console.error('Failed to fetch/decode GTFS:', error);
        return [];
    }
};

export const fetchVehiclesInBounds = async (bounds: MapBounds): Promise<Vehicle[]> => {
    try {
        const [vpEntities, tripUpdateEntities] = await Promise.all([
            getVehiclePositionEntities(), getTripUpdateEntities(),
        ]);
        const vehiclesById = new Map<string, Vehicle>();
        const upcomingStopTargetsByTripId = getUpcomingStopTargetsByTripId(tripUpdateEntities, stopCoordinatesById);

        vpEntities.forEach((entity: any) => {
            if (!entity.vehicle?.position) return;
            const vLat = entity.vehicle.position.latitude;
            const vLon = entity.vehicle.position.longitude;
            if (vLat <= bounds.north && vLat >= bounds.south && vLon <= bounds.east && vLon >= bounds.west) {
                const vehicle = buildVehicleFromEntity(entity, upcomingStopTargetsByTripId);
                if (vehicle) vehiclesById.set(vehicle.id, vehicle);
            }
        });
        return Array.from(vehiclesById.values());
    } catch (error) {
        console.error('Failed to fetch/decode GTFS in bounds:', error);
        return [];
    }
};
