import { getRouteMetadata, inferLineTypeFromToken, VehicleType } from '../transitUtils';
import bundledRouteNames from '../../data/routeNames.static.json';

export const routeShortNameByRouteId: Record<string, string> = bundledRouteNames;

// ── Lazy: stop coordinates ──
let _stopCoordinatesById: Record<string, { latitude: number; longitude: number }> | null = null;
export const getStopCoordinatesById = (): Record<string, { latitude: number; longitude: number }> => {
    if (_stopCoordinatesById) return _stopCoordinatesById;
    const bundledStops = require('../../data/stops.static.json') as Array<{ id: string; latitude: number; longitude: number }>;
    _stopCoordinatesById = {};
    for (let i = 0; i < bundledStops.length; i++) {
        const s = bundledStops[i];
        _stopCoordinatesById[String(s.id)] = { latitude: Number(s.latitude), longitude: Number(s.longitude) };
    }
    return _stopCoordinatesById;
};
// Keep the old export name as a getter for backwards compatibility
export const stopCoordinatesById = new Proxy({} as Record<string, { latitude: number; longitude: number }>, {
    get(_target, prop: string) { return getStopCoordinatesById()[prop]; },
    has(_target, prop: string) { return prop in getStopCoordinatesById(); },
    ownKeys() { return Object.keys(getStopCoordinatesById()); },
    getOwnPropertyDescriptor(_target, prop: string) {
        const val = getStopCoordinatesById()[prop];
        if (val !== undefined) return { configurable: true, enumerable: true, value: val };
        return undefined;
    },
});

// ── Lazy: stop names ──
let _stopNameById: Record<string, string> | null = null;
export const getStopNameById = (): Record<string, string> => {
    if (_stopNameById) return _stopNameById;
    const bundledStops = require('../../data/stops.static.json') as Array<{ id: string; name: string }>;
    _stopNameById = {};
    for (let i = 0; i < bundledStops.length; i++) {
        const s = bundledStops[i];
        _stopNameById[String(s.id)] = s.name;
    }
    return _stopNameById;
};
export const stopNameById = new Proxy({} as Record<string, string>, {
    get(_target, prop: string) { return getStopNameById()[prop]; },
    has(_target, prop: string) { return prop in getStopNameById(); },
    ownKeys() { return Object.keys(getStopNameById()); },
    getOwnPropertyDescriptor(_target, prop: string) {
        const val = getStopNameById()[prop];
        if (val !== undefined) return { configurable: true, enumerable: true, value: val };
        return undefined;
    },
});

// ── Lazy: route directions ──
type RouteDirectionInfo = { stopIds: Set<string>; destination: string };
let _routeDirections: Record<string, RouteDirectionInfo[]> | null = null;
const getRouteDirections = (): Record<string, RouteDirectionInfo[]> => {
    if (_routeDirections) return _routeDirections;
    const bundledLinesData = require('../../data/lines-data.static.json') as Array<{ line: string; [key: string]: any }>;
    _routeDirections = {};
    bundledLinesData.forEach((entry) => {
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
        if (dirs.length) _routeDirections![routeId] = dirs;
    });
    return _routeDirections;
};

export const getStaticDestination = (routeId: string, stopId: string, lastTripStopId?: string): string => {
    const baseId = routeId.split('-')[0];
    const dirs = getRouteDirections()[baseId];
    if (!dirs) return '';
    const matching = dirs.filter((dir) => dir.stopIds.has(stopId));
    if (matching.length === 1) return matching[0].destination;
    if (matching.length > 1 && lastTripStopId) {
        const byLast = matching.find((dir) => dir.stopIds.has(lastTripStopId));
        if (byLast) return byLast.destination;
    }
    return matching.length > 0 ? matching[0].destination : '';
};

export const resolveLineByRouteShortName = (routeId: string | undefined) => {
    const normalizedRouteId = String(routeId || '').trim().toUpperCase();
    const routeToken = normalizedRouteId.split('-')[0];
    const routeShortName = routeShortNameByRouteId[routeToken];
    if (routeShortName) return routeShortName;
    return getRouteMetadata(routeId).line;
};
