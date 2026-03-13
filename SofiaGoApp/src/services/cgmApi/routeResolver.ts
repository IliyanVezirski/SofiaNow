import { getRouteMetadata, inferLineTypeFromToken, VehicleType } from '../transitUtils';
import bundledRouteNames from '../../data/routeNames.static.json';
import bundledStops from '../../data/stops.static.json';
import bundledLinesData from '../../data/lines-data.static.json';

export const routeShortNameByRouteId: Record<string, string> = bundledRouteNames;

export const stopCoordinatesById = (bundledStops as Array<{ id: string; name: string; latitude: number; longitude: number }>).reduce<Record<string, { latitude: number; longitude: number }>>((result, stop) => {
    result[String(stop.id)] = { latitude: Number(stop.latitude), longitude: Number(stop.longitude) };
    return result;
}, {});

export const stopNameById = (bundledStops as Array<{ id: string; name: string }>).reduce<Record<string, string>>((result, stop) => {
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

export const getStaticDestination = (routeId: string, stopId: string, lastTripStopId?: string): string => {
    const baseId = routeId.split('-')[0];
    const dirs = routeDirections[baseId];
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
