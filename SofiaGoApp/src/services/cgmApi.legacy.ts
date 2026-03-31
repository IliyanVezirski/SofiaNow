import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { calculateBearingDegrees, getRouteMetadata, VehicleType } from './transitUtils';
import { MapBounds } from './stopsApi';
import bundledRouteNames from '../data/routeNames.static.json';
import bundledStops from '../data/stops.static.json';
import bundledLinesData from '../data/lines-data.static.json';
import bundledSchedule from '../data/schedule.weekly.static.json';
import bundledStopOrder from '../data/stopOrder.static.json';

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
const VEHICLE_POSITIONS_CACHE_MS = 2000;
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

let vehiclePositionsCache: {
    fetchedAt: number;
    entities: any[];
} | null = null;

let tripUpdatesFetchPromise: Promise<any[]> | null = null;
let vehiclePositionsFetchPromise: Promise<any[]> | null = null;

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

    if (tripUpdatesFetchPromise) {
        return tripUpdatesFetchPromise;
    }

    tripUpdatesFetchPromise = (async () => {
        try {
            const feed = await decodeRealtimeFeed(TRIP_UPDATES_URL);
            tripUpdatesCache = { fetchedAt: Date.now(), entities: feed.entity };
            return feed.entity;
        } finally {
            tripUpdatesFetchPromise = null;
        }
    })();

    return tripUpdatesFetchPromise;
};

const getVehiclePositionEntities = async () => {
    const now = Date.now();
    if (vehiclePositionsCache && now - vehiclePositionsCache.fetchedAt < VEHICLE_POSITIONS_CACHE_MS) {
        return vehiclePositionsCache.entities;
    }

    if (vehiclePositionsFetchPromise) {
        return vehiclePositionsFetchPromise;
    }

    vehiclePositionsFetchPromise = (async () => {
        try {
            const feed = await decodeRealtimeFeed(VEHICLE_POSITIONS_URL);
            vehiclePositionsCache = { fetchedAt: Date.now(), entities: feed.entity };
            return feed.entity;
        } finally {
            vehiclePositionsFetchPromise = null;
        }
    })();

    return vehiclePositionsFetchPromise;
};

export const fetchVehiclesNearby = async (lat: number, lon: number): Promise<Vehicle[]> => {
    try {
        const [vpEntities, tripUpdateEntities] = await Promise.all([
            getVehiclePositionEntities(),
            getTripUpdateEntities(),
        ]);

        const vehiclesById = new Map<string, Vehicle>();
        const upcomingStopTargetsByTripId = getUpcomingStopTargetsByTripId(tripUpdateEntities);

        const latDelta = VEHICLE_LAT_DELTA;
        const lonDelta = VEHICLE_LON_DELTA;

        vpEntities.forEach((entity: any) => {
            if (entity.vehicle && entity.vehicle.position) {
                const vLat = entity.vehicle.position.latitude;
                const vLon = entity.vehicle.position.longitude;

                if (vLat > lat - latDelta && vLat < lat + latDelta &&
                    vLon > lon - lonDelta && vLon < lon + lonDelta) {
                    const routeMetadata = getRouteMetadata(entity.vehicle.trip?.routeId);
                    const resolvedLine = resolveLineByRouteShortName(entity.vehicle.trip?.routeId);
                    const resolvedType = routeMetadata.type;
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

                    vehiclesById.set(vehicleId, {
                        id: vehicleId,
                        routeId: routeMetadata.routeId,
                        tripId,
                        line: resolvedLine,
                        type: resolvedType,
                        latitude: vLat,
                        longitude: vLon,
                        speedKph: typeof entity.vehicle.position.speed === 'number'
                            ? entity.vehicle.position.speed
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

        return Array.from(vehiclesById.values());

    } catch (error) {
        console.error('Failed to fetch/decode GTFS:', error);
        return [];
    }
};

export const fetchVehiclesInBounds = async (bounds: MapBounds): Promise<Vehicle[]> => {
    try {
        const [vpEntities, tripUpdateEntities] = await Promise.all([
            getVehiclePositionEntities(),
            getTripUpdateEntities(),
        ]);
        const vehiclesById = new Map<string, Vehicle>();
        const upcomingStopTargetsByTripId = getUpcomingStopTargetsByTripId(tripUpdateEntities);

        vpEntities.forEach((entity: any) => {
            if (entity.vehicle && entity.vehicle.position) {
                const vLat = entity.vehicle.position.latitude;
                const vLon = entity.vehicle.position.longitude;

                if (vLat <= bounds.north && vLat >= bounds.south && vLon <= bounds.east && vLon >= bounds.west) {
                    const routeMetadata = getRouteMetadata(entity.vehicle.trip?.routeId);
                    const resolvedLine = resolveLineByRouteShortName(entity.vehicle.trip?.routeId);
                    const resolvedType = routeMetadata.type;
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

                    vehiclesById.set(vehicleId, {
                        id: vehicleId,
                        routeId: routeMetadata.routeId,
                        tripId,
                        line: resolvedLine,
                        type: resolvedType,
                        latitude: vLat,
                        longitude: vLon,
                        speedKph: typeof entity.vehicle.position.speed === 'number'
                            ? entity.vehicle.position.speed
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

        return Array.from(vehiclesById.values());
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
            const resolvedType = routeMetadata.type;

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
            const resolvedType = routeMetadata.type;

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
    routeId: string;
}

export type DayType = 'w' | 'h';

export const getDayTypeForDate = (date: Date = new Date()): DayType => {
    const day = date.getDay();
    return (day >= 1 && day <= 5) ? 'w' : 'h';
};

const scheduleIndex = bundledSchedule as Record<string, Record<string, { w: number[]; h: number[] }>>;
const stopOrderIndex = bundledStopOrder as Record<string, string[]>;

// Inverse index: routeId → Map<destination, stopId[]> — built lazily
let _routeStopsIndex: Record<string, Map<string, string[]>> | null = null;
const getRouteStopsIndex = () => {
    if (_routeStopsIndex) return _routeStopsIndex;
    _routeStopsIndex = {};
    for (const [stopId, stopData] of Object.entries(scheduleIndex)) {
        for (const key of Object.keys(stopData)) {
            const sepIdx = key.indexOf('|');
            const routeId = key.slice(0, sepIdx);
            const destination = key.slice(sepIdx + 1);
            if (!_routeStopsIndex[routeId]) _routeStopsIndex[routeId] = new Map();
            const map = _routeStopsIndex[routeId];
            if (!map.has(destination)) map.set(destination, []);
            map.get(destination)!.push(stopId);
        }
    }
    return _routeStopsIndex;
};

export interface ScheduleBasedStop {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
}

export interface ScheduleBasedDirection {
    name: string;
    stops: ScheduleBasedStop[];
}

export const getScheduleBasedDirections = (routeId: string): ScheduleBasedDirection[] => {
    const idx = getRouteStopsIndex();
    const dirMap = idx[routeId];
    if (!dirMap) return [];
    const dt = getDayTypeForDate();
    const directions: ScheduleBasedDirection[] = [];
    for (const [destination, stopIds] of dirMap.entries()) {
        const stopSet = new Set(stopIds);
        const stopsById = new Map<string, ScheduleBasedStop>();
        for (const sid of stopIds) {
            const coords = stopCoordinatesById[sid];
            if (!coords) continue;
            stopsById.set(sid, {
                id: sid,
                name: stopNameById[sid] || sid,
                latitude: coords.latitude,
                longitude: coords.longitude,
            });
        }
        if (stopsById.size === 0) continue;

        // Use canonical GTFS stop_sequence order when available
        const canonicalOrder = stopOrderIndex[routeId + '|' + destination];
        let ordered: ScheduleBasedStop[];
        if (canonicalOrder) {
            ordered = canonicalOrder
                .filter((sid) => stopsById.has(sid))
                .map((sid) => stopsById.get(sid)!);
            // Append any stops present in schedule but missing from canonical order
            const inCanonical = new Set(canonicalOrder);
            for (const [sid, stop] of stopsById) {
                if (!inCanonical.has(sid)) ordered.push(stop);
            }
        } else {
            // Fallback: sort by first departure time
            ordered = [...stopsById.values()].sort((a, b) => {
                const aTime = (scheduleIndex[a.id]?.[routeId + '|' + destination]?.[dt] || [])[0] ?? 9999;
                const bTime = (scheduleIndex[b.id]?.[routeId + '|' + destination]?.[dt] || [])[0] ?? 9999;
                return aTime - bTime;
            });
        }

        if (ordered.length > 0) {
            directions.push({ name: destination, stops: ordered });
        }
    }
    return directions;
};

// Resolve a lines-data routeId to the schedule's routeId (they may differ)
let _scheduleRouteIdMap: Map<string, string> | null = null;
const getScheduleRouteIdMap = () => {
    if (_scheduleRouteIdMap) return _scheduleRouteIdMap;
    _scheduleRouteIdMap = new Map();
    const idx = getRouteStopsIndex();
    for (const schedRouteId of Object.keys(idx)) {
        const line = resolveLineByRouteShortName(schedRouteId);
        const meta = getRouteMetadata(schedRouteId);
        const type = meta.type;
        const key = `${type}:${line}`;
        if (!_scheduleRouteIdMap.has(key)) {
            _scheduleRouteIdMap.set(key, schedRouteId);
        }
    }
    return _scheduleRouteIdMap;
};

export const resolveScheduleRouteId = (line: string, type: VehicleType, linesDataRouteId: string): string => {
    const idx = getRouteStopsIndex();
    if (idx[linesDataRouteId]) return linesDataRouteId;
    const map = getScheduleRouteIdMap();
    return map.get(`${type}:${line}`) || linesDataRouteId;
};

export const getStaticStopSchedule = (stopId: string, dayType?: DayType): StaticScheduleEntry[] => {
    const dt = dayType ?? getDayTypeForDate();
    const stopData = scheduleIndex[stopId];
    if (!stopData) return [];
    const results: StaticScheduleEntry[] = [];
    for (const [key, dayTimes] of Object.entries(stopData)) {
        const sepIdx = key.indexOf('|');
        const routeId = key.slice(0, sepIdx);
        const destination = key.slice(sepIdx + 1);
        const meta = getRouteMetadata(routeId);
        const line = resolveLineByRouteShortName(routeId);
        const type = meta.type;
        const times = dayTimes[dt] || [];
        if (times.length > 0) results.push({ line, type, destination, times, routeId });
    }
    return results.sort((a, b) => {
        const lineCmp = a.line.localeCompare(b.line, 'bg', { numeric: true });
        if (lineCmp !== 0) return lineCmp;
        return a.destination.localeCompare(b.destination, 'bg');
    });
};

export interface TripStopInfo {
    stopId: string;
    stopName: string;
    latitude: number;
    longitude: number;
    arrivalTimestamp?: number;
    departureTimestamp?: number;
    stopSequence?: number;
}

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

                const stopSequence = Number(stu.stopSequence || 0) || undefined;
                const nameEntry = stopNameById[stopId];
                stops.push({
                    stopId,
                    stopName: nameEntry || stopId,
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    arrivalTimestamp,
                    departureTimestamp,
                    stopSequence,
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

export interface LineScheduleDirection {
    directionName: string;
    firstStopId: string;
    firstStopName: string;
    times: number[];
}

export const getStaticLineSchedule = (
    routeId: string,
    stops: { id: string; name: string }[][],
    dayType?: DayType,
): LineScheduleDirection[] => {
    const dt = dayType ?? getDayTypeForDate();
    const results: LineScheduleDirection[] = [];

    for (const dirStops of stops) {
        if (!dirStops.length) continue;
        // Try first few stops to find schedule data for this route
        for (const stop of dirStops.slice(0, 3)) {
            const stopData = scheduleIndex[stop.id];
            if (!stopData) continue;
            const matchingKey = Object.keys(stopData).find((k) => k.startsWith(routeId + '|'));
            if (!matchingKey) continue;
            const times = stopData[matchingKey]?.[dt] || [];
            if (!times.length) continue;
            const destination = matchingKey.slice(matchingKey.indexOf('|') + 1);
            results.push({
                directionName: destination,
                firstStopId: stop.id,
                firstStopName: stop.name,
                times,
            });
            break;
        }
    }

    return results;
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
            const resolvedType = routeMetadata.type;

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

/**
 * For a given StopEta, find the closest scheduled time and return delay info.
 */
export const getEtaScheduleInfo = (eta: StopEta): { scheduledMinSinceMidnight: number | null; delayMinutes: number | null } => {
    const dt = getDayTypeForDate();
    const stopSched = scheduleIndex[eta.stopId];
    if (!stopSched) return { scheduledMinSinceMidnight: null, delayMinutes: null };

    const lineKey = Object.keys(stopSched).find((k) => k.startsWith(eta.routeId + '|'));
    if (!lineKey) return { scheduledMinSinceMidnight: null, delayMinutes: null };

    const schedMins = stopSched[lineKey]?.[dt];
    if (!schedMins?.length) return { scheduledMinSinceMidnight: null, delayMinutes: null };

    const d = new Date(eta.arrivalTimestamp * 1000);
    const predMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

    let bestMatch = -1;
    let bestDiff = Infinity;
    for (const sm of schedMins) {
        const diff = predMin - sm;
        if (diff >= -2 && diff <= 20 && diff < bestDiff) {
            bestDiff = diff;
            bestMatch = sm;
        }
    }

    if (bestMatch < 0) return { scheduledMinSinceMidnight: null, delayMinutes: null };
    return { scheduledMinSinceMidnight: bestMatch, delayMinutes: Math.round(predMin - bestMatch) };
};

export const fetchTripDelay = async (tripId: string): Promise<number | null> => {
    if (!tripId) return null;
    try {
        const entities = await getTripUpdateEntities();
        let tripUpdate: any = null;
        for (const entity of entities) {
            const tu = entity.tripUpdate;
            if (!tu?.trip) continue;
            if ((tu.trip.tripId || entity.id) === tripId) {
                tripUpdate = tu;
                break;
            }
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

        const schedule = scheduleIndex;
        const delays: number[] = [];

        const dt = getDayTypeForDate();

        for (const stu of upcoming) {
            const predSec = Number(stu.arrival?.time || stu.departure?.time || 0);
            const d = new Date(predSec * 1000);
            const predMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

            const stopSched = schedule[stu.stopId as string];
            if (!stopSched) continue;

            const lineKey = Object.keys(stopSched).find((k) => k.startsWith(routeId + '|'));
            if (!lineKey) continue;

            const schedMins = stopSched[lineKey]?.[dt];
            if (!schedMins?.length) continue;

            let bestMatch = -1;
            let bestDiff = Infinity;
            for (const sm of schedMins) {
                const diff = predMin - sm;
                if (diff >= -2 && diff <= 20 && diff < bestDiff) {
                    bestDiff = diff;
                    bestMatch = sm;
                }
            }

            if (bestMatch >= 0) {
                delays.push(predMin - bestMatch);
            }
        }

        if (!delays.length) return null;

        delays.sort((a, b) => a - b);
        const medianMinutes = delays[Math.floor(delays.length / 2)];
        return Math.round(medianMinutes * 60);
    } catch {
        return null;
    }
};

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
