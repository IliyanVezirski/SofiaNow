import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { calculateBearingDegrees, getRouteMetadata, VehicleType } from './transitUtils';

export interface Vehicle {
    id: string;
    line: string;
    routeId: string;
    tripId: string;
    type: VehicleType;
    latitude: number;
    longitude: number;
    speedKph?: number;
    stopId?: string;
    currentStatus?: string;
    occupancyStatus?: string;
    lastUpdatedUnix?: number;
    headingDegrees?: number;
}

export interface StopEta {
    stopId: string;
    tripId: string;
    routeId: string;
    line: string;
    type: VehicleType;
    arrivalTimestamp: number;
    minutesAway: number;
}

const VEHICLE_POSITIONS_URL = 'https://gtfs.sofiatraffic.bg/api/v1/vehicle-positions';
const TRIP_UPDATES_URL = 'https://gtfs.sofiatraffic.bg/api/v1/trip-updates';
const TRIP_UPDATES_CACHE_MS = 15000;
const VEHICLE_LAT_DELTA = 0.03;
const VEHICLE_LON_DELTA = 0.03;

const previousVehicleSnapshots = new Map<string, {
    latitude: number;
    longitude: number;
    timestamp: number;
}>();

let tripUpdatesCache: {
    fetchedAt: number;
    entities: any[];
} | null = null;

const decodeRealtimeFeed = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch GTFS feed from ${url}: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
};

const getTripUpdateEntities = async () => {
    const now = Date.now();
    if (tripUpdatesCache && now - tripUpdatesCache.fetchedAt < TRIP_UPDATES_CACHE_MS) {
        return tripUpdatesCache.entities;
    }

    const feed = await decodeRealtimeFeed(TRIP_UPDATES_URL);
    tripUpdatesCache = {
        fetchedAt: now,
        entities: feed.entity,
    };

    return feed.entity;
};

export const fetchVehiclesNearby = async (lat: number, lon: number): Promise<Vehicle[]> => {
    try {
        const feed = await decodeRealtimeFeed(VEHICLE_POSITIONS_URL);

        const vehicles: Vehicle[] = [];

        const latDelta = VEHICLE_LAT_DELTA;
        const lonDelta = VEHICLE_LON_DELTA;

        feed.entity.forEach((entity: any) => {
            if (entity.vehicle && entity.vehicle.position) {
                const vLat = entity.vehicle.position.latitude;
                const vLon = entity.vehicle.position.longitude;

                if (vLat > lat - latDelta && vLat < lat + latDelta &&
                    vLon > lon - lonDelta && vLon < lon + lonDelta) {
                    const routeMetadata = getRouteMetadata(entity.vehicle.trip?.routeId);
                    const vehicleId = entity.vehicle.vehicle?.id || entity.id;
                    const lastUpdatedUnix = Number(entity.vehicle.timestamp || 0) || Math.floor(Date.now() / 1000);
                    const previousSnapshot = previousVehicleSnapshots.get(vehicleId);
                    const headingDegrees = previousSnapshot
                        ? calculateBearingDegrees(previousSnapshot.latitude, previousSnapshot.longitude, vLat, vLon)
                        : undefined;

                    previousVehicleSnapshots.set(vehicleId, {
                        latitude: vLat,
                        longitude: vLon,
                        timestamp: lastUpdatedUnix,
                    });

                    vehicles.push({
                        id: vehicleId,
                        routeId: routeMetadata.routeId,
                        tripId: entity.vehicle.trip?.tripId || entity.id,
                        line: routeMetadata.line,
                        type: routeMetadata.type,
                        latitude: vLat,
                        longitude: vLon,
                        speedKph: typeof entity.vehicle.position.speed === 'number'
                            ? entity.vehicle.position.speed * 3.6
                            : undefined,
                        stopId: entity.vehicle.stopId,
                        currentStatus: entity.vehicle.currentStatus,
                        occupancyStatus: entity.vehicle.occupancyStatus,
                        lastUpdatedUnix,
                        headingDegrees,
                    });
                }
            }
        });

        return vehicles;

    } catch (error) {
        console.error('Failed to fetch/decode GTFS:', error);
        return [];
    }
};

export const fetchStopEtas = async (stopIds: string[]): Promise<Record<string, StopEta[]>> => {
    if (!stopIds.length) {
        return {};
    }

    try {
        const entities = await getTripUpdateEntities();
        const relevantStopIds = new Set(stopIds);
        const etasByStopId: Record<string, StopEta[]> = {};
        const nowUnix = Math.floor(Date.now() / 1000);

        entities.forEach((entity: any) => {
            const tripUpdate = entity.tripUpdate;
            if (!tripUpdate?.trip) {
                return;
            }

            const routeMetadata = getRouteMetadata(tripUpdate.trip.routeId);

            (tripUpdate.stopTimeUpdate || []).forEach((stopTimeUpdate: any) => {
                const stopId = stopTimeUpdate.stopId;
                if (!relevantStopIds.has(stopId)) {
                    return;
                }

                const arrivalTimestamp = Number(stopTimeUpdate.arrival?.time || stopTimeUpdate.departure?.time || 0);
                if (!arrivalTimestamp || arrivalTimestamp < nowUnix) {
                    return;
                }

                const eta: StopEta = {
                    stopId,
                    tripId: tripUpdate.trip.tripId || entity.id,
                    routeId: routeMetadata.routeId,
                    line: routeMetadata.line,
                    type: routeMetadata.type,
                    arrivalTimestamp,
                    minutesAway: Math.max(0, Math.round((arrivalTimestamp - nowUnix) / 60)),
                };

                if (!etasByStopId[stopId]) {
                    etasByStopId[stopId] = [];
                }

                etasByStopId[stopId].push(eta);
            });
        });

        Object.keys(etasByStopId).forEach((stopId) => {
            etasByStopId[stopId] = etasByStopId[stopId]
                .sort((left, right) => left.arrivalTimestamp - right.arrivalTimestamp)
                .slice(0, 5);
        });

        return etasByStopId;
    } catch (error) {
        console.error('Failed to fetch stop ETAs:', error);
        return {};
    }
};

export interface StopTime {
    time: string;
    realTime: boolean;
}

// Since real-time GTFS for virtual boards requires matching trip updates to stop schedules (which requires parsing static GTFS),
// we will keep the Virtual Board mocked for now as it's considerably more complex without a backend wrapper.
export const fetchVirtualBoard = async (stopId: string): Promise<StopTime[]> => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return [
        { time: '12:05', realTime: true },
        { time: '12:15', realTime: false },
        { time: '12:25', realTime: true },
    ];
};
