import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { calculateBearingDegrees, getRouteMetadata, inferLineTypeFromToken, VehicleType } from './transitUtils';
import { MapBounds } from './stopsApi';
import bundledRouteNames from '../data/routeNames.static.json';
import bundledStops from '../data/stops.static.json';
import bundledLinesData from '../data/lines-data.static.json';
import bundledSchedule from '../data/schedule.static.json';

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
    destination?: string;
}

export interface GlobalDeparture extends StopEta {
    stopSequence?: number;
}

const VEHICLE_POSITIONS_URL = 'https://gtfs.sofiatraffic.bg/api/v1/vehicle-positions';
const TRIP_UPDATES_URL = 'https://gtfs.sofiatraffic.bg/api/v1/trip-updates';
const TRIP_UPDATES_CACHE_MS = 15000;
const MAX_STOP_ETA_RESULTS = 12;
const MAX_FULL_SCHEDULE_RESULTS = 200;
const VEHICLE_LAT_DELTA = 0.03;
const VEHICLE_LON_DELTA = 0.03;
const MIN_MOVEMENT_FOR_HEADING_METERS = 8;
const MAX_REPORTED_VS_TRACK_DELTA_DEGREES = 55;
const MIN_DISTANCE_TO_RESOLVE_NEXT_STOP_METERS = 12;

type TripStopTarget = {
    stopId: string;
    stopSequence?: number;
    latitude: number;
    longitude: number;
    arrivalTimestamp?: number;
    departureTimestamp?: number;
};

const previousVehicleSnapshots = new Map<string, {
    latitude: number;
    longitude: number;
    timestamp: number;
    headingDegrees?: number;
}>();

let tripUpdatesCache: {
    fetchedAt: number;
    entities: any[];
} | null = null;

const routeShortNameByRouteId: Record<string, string> = bundledRouteNames;
const stopCoordinatesById = (bundledStops as Array<{ id: string; name: string; latitude: number; longitude: number }>).reduce<Record<string, {
    latitude: number;
    longitude: number;
}>>((result, stop) => {
    result[String(stop.id)] = {
        latitude: Number(stop.latitude),
        longitude: Number(stop.longitude),
    };
    return result;
}, {});

const stopNameById = (bundledStops as Array<{ id: string; name: string }>).reduce<Record<string, string>>((result, stop) => {
    result[String(stop.id)] = stop.name;
    return result;
}, {});

type RouteDirectionInfo = { stopIds: Set<string>; destination: string };
const routeDirections: Record<string, RouteDirectionInfo[]> = {};
(bundledLinesData as Array<{ line: string; [key: string]: any }>).forEach((entry) => {
    const routeId = String(entry.line || '').trim();
    if (!routeId) return;
    const dirs: RouteDirectionInfo[] = [];
    for (const key of ['direction0', 'direction1']) {
        const dir = entry[key];
        if (!dir?.stops?.length) continue;
        const stopIds = new Set<string>(dir.stops.map((s: any) => String(s.id)));
        const destination = String(dir.stops[dir.stops.length - 1]?.name || '').trim();
        dirs.push({ stopIds, destination });
    }
    if (dirs.length) routeDirections[routeId] = dirs;
});

const getStaticDestination = (routeId: string, stopId: string, lastTripStopId?: string): string => {
    const baseId = routeId.split('-')[0];
    const dirs = routeDirections[baseId];
    if (!dirs) return '';
    // If only one direction contains this stop, use it
    const matching = dirs.filter((dir) => dir.stopIds.has(stopId));
    if (matching.length === 1) return matching[0].destination;
    // Multiple directions contain this stop — use the trip's last stop to pick the right one
    if (matching.length > 1 && lastTripStopId) {
        const byLast = matching.find((dir) => dir.stopIds.has(lastTripStopId));
        if (byLast) return byLast.destination;
    }
    // Fallback: return first match
    return matching.length > 0 ? matching[0].destination : '';
};

const normalizeHeading = (heading: number) => ((heading % 360) + 360) % 360;

const shortestHeadingDelta = (from: number, to: number) => {
    let delta = to - from;
    if (delta > 180) {
        delta -= 360;
    }
    if (delta < -180) {
        delta += 360;
    }
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

const getUpcomingStopTargetsByTripId = (entities: any[]) => {
    const nowUnix = Math.floor(Date.now() / 1000);
    const targetsByTripId = new Map<string, TripStopTarget[]>();

    entities.forEach((entity: any) => {
        const tripId = String(entity?.tripUpdate?.trip?.tripId || '').trim();
        if (!tripId) {
            return;
        }

        const targets = (entity.tripUpdate.stopTimeUpdate || [])
            .map((stopTimeUpdate: any) => {
                const stopId = String(stopTimeUpdate.stopId || '').trim();
                const coordinates = stopCoordinatesById[stopId];
                if (!stopId || !coordinates) {
                    return null;
                }

                const arrivalTimestamp = Number(stopTimeUpdate.arrival?.time || 0) || undefined;
                const departureTimestamp = Number(stopTimeUpdate.departure?.time || 0) || undefined;
                const stopSequence = Number(stopTimeUpdate.stopSequence || 0) || undefined;
                const effectiveTimestamp = arrivalTimestamp || departureTimestamp || 0;

                if (effectiveTimestamp && effectiveTimestamp < nowUnix - 60) {
                    return null;
                }

                return {
                    stopId,
                    stopSequence,
                    latitude: coordinates.latitude,
                    longitude: coordinates.longitude,
                    arrivalTimestamp,
                    departureTimestamp,
                } satisfies TripStopTarget;
            })
            .filter(Boolean) as TripStopTarget[];

        if (!targets.length) {
            return;
        }

        targets.sort((left, right) => {
            if (Number.isFinite(left.stopSequence) && Number.isFinite(right.stopSequence)) {
                return Number(left.stopSequence) - Number(right.stopSequence);
            }

            return Number(left.arrivalTimestamp || left.departureTimestamp || 0)
                - Number(right.arrivalTimestamp || right.departureTimestamp || 0);
        });
        targetsByTripId.set(tripId, targets);
    });

    return targetsByTripId;
};

const pickNextStopTarget = ({
    tripStopTargets,
    latitude,
    longitude,
    vehicleStopId,
    currentStopSequence,
    currentStatus,
}: {
    tripStopTargets?: TripStopTarget[];
    latitude: number;
    longitude: number;
    vehicleStopId?: string;
    currentStopSequence?: number;
    currentStatus?: string;
}) => {
    if (!tripStopTargets?.length) {
        return undefined;
    }

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

    if (targetIndex < 0) {
        targetIndex = 0;
    }

    if (normalizedVehicleStopId && tripStopTargets[targetIndex]?.stopId === normalizedVehicleStopId && targetIndex < tripStopTargets.length - 1) {
        targetIndex += 1;
    }

    const target = tripStopTargets[targetIndex];
    if (!target) {
        return undefined;
    }

    if (
        targetIndex < tripStopTargets.length - 1
        && distanceMeters(latitude, longitude, target.latitude, target.longitude) < MIN_DISTANCE_TO_RESOLVE_NEXT_STOP_METERS
    ) {
        return tripStopTargets[targetIndex + 1];
    }

    return target;
};

const resolveVehicleHeading = ({
    previousSnapshot,
    latitude,
    longitude,
    reportedBearing,
    nextStopTarget,
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

    if (!previousSnapshot) {
        return normalizedReported;
    }

    const movedMeters = distanceMeters(previousSnapshot.latitude, previousSnapshot.longitude, latitude, longitude);
    const trackHeading = movedMeters >= MIN_MOVEMENT_FOR_HEADING_METERS
        ? normalizeHeading(calculateBearingDegrees(previousSnapshot.latitude, previousSnapshot.longitude, latitude, longitude))
        : undefined;

    if (Number.isFinite(trackHeading) && Number.isFinite(normalizedReported)) {
        const delta = Math.abs(shortestHeadingDelta(trackHeading as number, normalizedReported as number));
        return delta <= MAX_REPORTED_VS_TRACK_DELTA_DEGREES ? normalizedReported : trackHeading;
    }

    if (Number.isFinite(trackHeading)) {
        return trackHeading;
    }

    if (Number.isFinite(normalizedReported)) {
        return normalizedReported;
    }

    return previousSnapshot.headingDegrees;
};

const resolveLineByRouteShortName = (routeId: string | undefined) => {
    const normalizedRouteId = String(routeId || '').trim().toUpperCase();
    const routeToken = normalizedRouteId.split('-')[0];
    const routeShortName = routeShortNameByRouteId[routeToken];

    if (routeShortName) {
        return routeShortName;
    }

    return getRouteMetadata(routeId).line;
};

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
        const [feed, tripUpdateEntities] = await Promise.all([
            decodeRealtimeFeed(VEHICLE_POSITIONS_URL),
            getTripUpdateEntities(),
        ]);

        const vehicles: Vehicle[] = [];
        const upcomingStopTargetsByTripId = getUpcomingStopTargetsByTripId(tripUpdateEntities);

        const latDelta = VEHICLE_LAT_DELTA;
        const lonDelta = VEHICLE_LON_DELTA;

        feed.entity.forEach((entity: any) => {
            if (entity.vehicle && entity.vehicle.position) {
                const vLat = entity.vehicle.position.latitude;
                const vLon = entity.vehicle.position.longitude;

                if (vLat > lat - latDelta && vLat < lat + latDelta &&
                    vLon > lon - lonDelta && vLon < lon + lonDelta) {
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
                        previousSnapshot,
                        latitude: vLat,
                        longitude: vLon,
                        reportedBearing,
                        nextStopTarget,
                    });

                    previousVehicleSnapshots.set(vehicleId, {
                        latitude: vLat,
                        longitude: vLon,
                        timestamp: lastUpdatedUnix,
                        headingDegrees,
                    });

                    vehicles.push({
                        id: vehicleId,
                        routeId: routeMetadata.routeId,
                        tripId,
                        line: resolvedLine,
                        type: resolvedType,
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

export const fetchVehiclesInBounds = async (bounds: MapBounds): Promise<Vehicle[]> => {
    try {
        const [feed, tripUpdateEntities] = await Promise.all([
            decodeRealtimeFeed(VEHICLE_POSITIONS_URL),
            getTripUpdateEntities(),
        ]);
        const vehicles: Vehicle[] = [];
        const upcomingStopTargetsByTripId = getUpcomingStopTargetsByTripId(tripUpdateEntities);

        feed.entity.forEach((entity: any) => {
            if (entity.vehicle && entity.vehicle.position) {
                const vLat = entity.vehicle.position.latitude;
                const vLon = entity.vehicle.position.longitude;

                if (vLat <= bounds.north && vLat >= bounds.south && vLon <= bounds.east && vLon >= bounds.west) {
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
                        previousSnapshot,
                        latitude: vLat,
                        longitude: vLon,
                        reportedBearing,
                        nextStopTarget,
                    });

                    previousVehicleSnapshots.set(vehicleId, {
                        latitude: vLat,
                        longitude: vLon,
                        timestamp: lastUpdatedUnix,
                        headingDegrees,
                    });

                    vehicles.push({
                        id: vehicleId,
                        routeId: routeMetadata.routeId,
                        tripId,
                        line: resolvedLine,
                        type: resolvedType,
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
        console.error('Failed to fetch/decode GTFS in bounds:', error);
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
            const resolvedLine = resolveLineByRouteShortName(tripUpdate.trip.routeId);
            const resolvedType = inferLineTypeFromToken(resolvedLine);

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
                    line: resolvedLine,
                    type: resolvedType,
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

            stopTimeUpdates.forEach((stopTimeUpdate: any) => {
                if (stopTimeUpdate.stopId !== stopId) return;
                const arrivalTimestamp = Number(stopTimeUpdate.arrival?.time || stopTimeUpdate.departure?.time || 0);
                if (!arrivalTimestamp) return;

                results.push({
                    stopId,
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

export interface StaticScheduleEntry {
    line: string;
    type: VehicleType;
    destination: string;
    times: number[];  // minutes since midnight
}

const scheduleIndex = bundledSchedule as Record<string, Record<string, number[]>>;

export const getStaticStopSchedule = (stopId: string): StaticScheduleEntry[] => {
    const stopData = scheduleIndex[stopId];
    if (!stopData) return [];
    const results: StaticScheduleEntry[] = [];
    for (const [key, times] of Object.entries(stopData)) {
        const sepIdx = key.indexOf('|');
        const routeId = key.slice(0, sepIdx);
        const destination = key.slice(sepIdx + 1);
        const meta = getRouteMetadata(routeId);
        const line = resolveLineByRouteShortName(routeId);
        const type = inferLineTypeFromToken(line);
        results.push({ line, type, destination, times });
    }
    return results.sort((a, b) => {
        const lineCmp = a.line.localeCompare(b.line, 'bg', { numeric: true });
        if (lineCmp !== 0) return lineCmp;
        return a.destination.localeCompare(b.destination, 'bg');
    });
};

export const fetchGlobalDepartures = async (limit = 120): Promise<GlobalDeparture[]> => {
    try {
        const entities = await getTripUpdateEntities();
        const nowUnix = Math.floor(Date.now() / 1000);
        const departures: GlobalDeparture[] = [];

        entities.forEach((entity: any) => {
            const tripUpdate = entity.tripUpdate;
            if (!tripUpdate?.trip) {
                return;
            }

            const routeMetadata = getRouteMetadata(tripUpdate.trip.routeId);
            const resolvedLine = resolveLineByRouteShortName(tripUpdate.trip.routeId);
            const resolvedType = inferLineTypeFromToken(resolvedLine);

            (tripUpdate.stopTimeUpdate || []).forEach((stopTimeUpdate: any) => {
                const stopId = String(stopTimeUpdate.stopId || '');
                if (!stopId) {
                    return;
                }

                const arrivalTimestamp = Number(stopTimeUpdate.arrival?.time || stopTimeUpdate.departure?.time || 0);
                if (!arrivalTimestamp || arrivalTimestamp < nowUnix) {
                    return;
                }

                departures.push({
                    stopId,
                    tripId: tripUpdate.trip.tripId || entity.id,
                    routeId: routeMetadata.routeId,
                    line: resolvedLine,
                    type: resolvedType,
                    arrivalTimestamp,
                    minutesAway: Math.max(0, Math.round((arrivalTimestamp - nowUnix) / 60)),
                    stopSequence: Number(stopTimeUpdate.stopSequence || 0) || undefined,
                });
            });
        });

        return departures
            .sort((left, right) => left.arrivalTimestamp - right.arrivalTimestamp)
            .slice(0, limit);
    } catch (error) {
        console.error('Failed to fetch global departures:', error);
        return [];
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
