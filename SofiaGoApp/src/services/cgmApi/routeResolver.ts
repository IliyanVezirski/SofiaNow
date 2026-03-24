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

const sanitizeToken = (value: string | undefined | null) => String(value || '').trim().toUpperCase();

const buildRouteKeyCandidates = (routeId: string) => {
    const normalizedRouteId = sanitizeToken(routeId);
    const baseId = normalizedRouteId.split('-')[0];
    const metadata = getRouteMetadata(routeId);
    const resolvedShortName = sanitizeToken(
        routeShortNameByRouteId[baseId]
        || routeShortNameByRouteId[normalizedRouteId],
    );
    const normalizedLine = resolvedShortName || sanitizeToken(metadata.line);
    const inferredType = metadata.type || inferLineTypeFromToken(normalizedLine);
    const candidates = new Set<string>();

    if (normalizedLine) {
        switch (inferredType) {
            case 'tram':
                candidates.add(`TM${normalizedLine}`);
                break;
            case 'trolley':
                candidates.add(`TB${normalizedLine}`);
                break;
            case 'subway':
                candidates.add(normalizedLine.startsWith('M') ? normalizedLine : `M${normalizedLine}`);
                break;
            default:
                candidates.add(`A${normalizedLine}`);
                break;
        }

        candidates.add(normalizedLine);
    }

    candidates.add(baseId);
    candidates.add(normalizedRouteId);

    return Array.from(candidates).filter(Boolean);
};

const buildStopIdCandidates = (stopId: string | undefined | null) => {
    const normalized = sanitizeToken(stopId);
    if (!normalized) {
        return [];
    }

    const suffixMatch = normalized.match(/(\d+)$/);
    const suffix = suffixMatch?.[1] || '';
    const candidates = new Set<string>([normalized]);

    if (suffix) {
        candidates.add(`A${suffix}`);
        candidates.add(`TB${suffix}`);
        candidates.add(`TM${suffix}`);
        candidates.add(`M${suffix}`);
        candidates.add(suffix);
    }

    return Array.from(candidates);
};

const resolveStopNameById = (stopId: string | undefined | null) => {
    const stopNames = getStopNameById();
    const candidates = buildStopIdCandidates(stopId);

    for (const candidate of candidates) {
        if (stopNames[candidate]) {
            return stopNames[candidate];
        }
    }

    const suffix = sanitizeToken(stopId).match(/(\d+)$/)?.[1];
    if (!suffix) {
        return '';
    }

    const fallbackId = Object.keys(stopNames).find((key) => key.endsWith(suffix));
    return fallbackId ? stopNames[fallbackId] : '';
};

const normalizeDestinationLabel = (value: string | undefined | null) => sanitizeToken(value).replace(/\s+/g, ' ');

export const getStaticDestination = (routeId: string, stopId: string, lastTripStopId?: string): string => {
    const routeDirections = getRouteDirections();
    const dirs = buildRouteKeyCandidates(routeId)
        .map((candidate) => routeDirections[candidate])
        .find((candidate): candidate is RouteDirectionInfo[] => Array.isArray(candidate) && candidate.length > 0);

    const lastTripStopName = resolveStopNameById(lastTripStopId);
    if (!dirs) {
        return lastTripStopName;
    }

    const stopIdCandidates = buildStopIdCandidates(stopId);
    const matching = dirs.filter((dir) => stopIdCandidates.some((candidate) => dir.stopIds.has(candidate)));
    if (matching.length === 1) return matching[0].destination;
    if (matching.length > 1 && lastTripStopId) {
        const lastTripStopCandidates = buildStopIdCandidates(lastTripStopId);
        const byLast = matching.find((dir) => lastTripStopCandidates.some((candidate) => dir.stopIds.has(candidate)));
        if (byLast) return byLast.destination;

        const normalizedLastTripStopName = normalizeDestinationLabel(lastTripStopName);
        if (normalizedLastTripStopName) {
            const byName = matching.find((dir) => {
                const normalizedDestination = normalizeDestinationLabel(dir.destination);
                return normalizedDestination === normalizedLastTripStopName
                    || normalizedDestination.includes(normalizedLastTripStopName)
                    || normalizedLastTripStopName.includes(normalizedDestination);
            });
            if (byName) return byName.destination;
        }
    }

    if (matching.length > 0) {
        return matching[0].destination;
    }

    return lastTripStopName;
};

export const resolveLineByRouteShortName = (routeId: string | undefined) => {
    const normalizedRouteId = String(routeId || '').trim().toUpperCase();
    const routeToken = normalizedRouteId.split('-')[0];
    const routeShortName = routeShortNameByRouteId[routeToken];
    if (routeShortName) return routeShortName;
    return getRouteMetadata(routeId).line;
};
