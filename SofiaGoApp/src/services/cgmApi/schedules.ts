import { StaticScheduleEntry, DayType, ScheduleBasedStop, ScheduleBasedDirection, LineScheduleDirection } from '../../types/vehicles';
import { getRouteMetadata, inferLineTypeFromToken } from '../transitUtils';
import { resolveLineByRouteShortName, stopCoordinatesById, stopNameById } from './routeResolver';

// ── Lazy schedule data ──
let _scheduleIndex: Record<string, Record<string, { w: number[]; h: number[] }>> | null = null;
const getScheduleIndex = () => {
    if (!_scheduleIndex) _scheduleIndex = require('../../data/schedule.weekly.static.json');
    return _scheduleIndex!;
};

let _stopOrderIndex: Record<string, string[]> | null = null;
const getStopOrderIndex = () => {
    if (!_stopOrderIndex) _stopOrderIndex = require('../../data/stopOrder.static.json');
    return _stopOrderIndex!;
};

export const getDayTypeForDate = (date: Date = new Date()): DayType => {
    const day = date.getDay();
    return (day >= 1 && day <= 5) ? 'w' : 'h';
};

let _routeStopsIndex: Record<string, Map<string, string[]>> | null = null;
const getRouteStopsIndex = () => {
    if (_routeStopsIndex) return _routeStopsIndex;
    _routeStopsIndex = {};
    for (const [stopId, stopData] of Object.entries(getScheduleIndex())) {
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

export const getScheduleBasedDirections = (routeId: string): ScheduleBasedDirection[] => {
    const idx = getRouteStopsIndex();
    const dirMap = idx[routeId];
    if (!dirMap) return [];
    const dt = getDayTypeForDate();
    const directions: ScheduleBasedDirection[] = [];
    for (const [destination, stopIds] of dirMap.entries()) {
        const stopsById = new Map<string, ScheduleBasedStop>();
        for (const sid of stopIds) {
            const coords = stopCoordinatesById[sid];
            if (!coords) continue;
            stopsById.set(sid, { id: sid, name: stopNameById[sid] || sid, latitude: coords.latitude, longitude: coords.longitude });
        }
        if (stopsById.size === 0) continue;

        const canonicalOrder = getStopOrderIndex()[routeId + '|' + destination];
        let ordered: ScheduleBasedStop[];
        if (canonicalOrder) {
            ordered = canonicalOrder.filter((sid) => stopsById.has(sid)).map((sid) => stopsById.get(sid)!);
            const inCanonical = new Set(canonicalOrder);
            for (const [sid, stop] of stopsById) {
                if (!inCanonical.has(sid)) ordered.push(stop);
            }
        } else {
            ordered = [...stopsById.values()].sort((a, b) => {
                const aTime = (getScheduleIndex()[a.id]?.[routeId + '|' + destination]?.[dt] || [])[0] ?? 9999;
                const bTime = (getScheduleIndex()[b.id]?.[routeId + '|' + destination]?.[dt] || [])[0] ?? 9999;
                return aTime - bTime;
            });
        }
        if (ordered.length > 0) directions.push({ name: destination, stops: ordered });
    }
    return directions;
};

let _scheduleRouteIdMap: Map<string, string> | null = null;
const getScheduleRouteIdMap = () => {
    if (_scheduleRouteIdMap) return _scheduleRouteIdMap;
    _scheduleRouteIdMap = new Map();
    const idx = getRouteStopsIndex();
    for (const schedRouteId of Object.keys(idx)) {
        const line = resolveLineByRouteShortName(schedRouteId);
        const meta = getRouteMetadata(schedRouteId);
        const inferredType = inferLineTypeFromToken(line);
        const type = inferredType === 'bus' ? meta.type : inferredType;
        const key = `${type}:${line}`;
        if (!_scheduleRouteIdMap.has(key)) _scheduleRouteIdMap.set(key, schedRouteId);
    }
    return _scheduleRouteIdMap;
};

export const resolveScheduleRouteId = (line: string, type: string, linesDataRouteId: string): string => {
    const idx = getRouteStopsIndex();
    if (idx[linesDataRouteId]) return linesDataRouteId;
    const map = getScheduleRouteIdMap();
    return map.get(`${type}:${line}`) || linesDataRouteId;
};

export const getStaticStopSchedule = (stopId: string, dayType?: DayType): StaticScheduleEntry[] => {
    const dt = dayType ?? getDayTypeForDate();
    const expandedStopIds = stopId.split(',');
    const results: StaticScheduleEntry[] = [];
    
    for (const id of expandedStopIds) {
        const stopData = getScheduleIndex()[id];
        if (!stopData) continue;
        
        for (const [key, dayTimes] of Object.entries(stopData)) {
            const sepIdx = key.indexOf('|');
            const routeId = key.slice(0, sepIdx);
            const destination = key.slice(sepIdx + 1);
            const meta = getRouteMetadata(routeId);
            const line = resolveLineByRouteShortName(routeId);
            const inferredType = inferLineTypeFromToken(line);
            const type = inferredType === 'bus' ? meta.type : inferredType;
            const times = dayTimes[dt] || [];
            if (times.length > 0) results.push({ line, type, destination, times, routeId });
        }
    }
    
    return results.sort((a, b) => {
        const lineCmp = a.line.localeCompare(b.line, 'bg', { numeric: true });
        if (lineCmp !== 0) return lineCmp;
        return a.destination.localeCompare(b.destination, 'bg');
    });
};

export const getStaticLineSchedule = (
    routeId: string,
    stops: { id: string; name: string }[][],
    dayType?: DayType,
): LineScheduleDirection[] => {
    const dt = dayType ?? getDayTypeForDate();
    const results: LineScheduleDirection[] = [];
    for (const dirStops of stops) {
        if (!dirStops.length) continue;
        for (const stop of dirStops.slice(0, 3)) {
            const stopData = getScheduleIndex()[stop.id];
            if (!stopData) continue;
            const matchingKey = Object.keys(stopData).find((k) => k.startsWith(routeId + '|'));
            if (!matchingKey) continue;
            const times = stopData[matchingKey]?.[dt] || [];
            if (!times.length) continue;
            const destination = matchingKey.slice(matchingKey.indexOf('|') + 1);
            results.push({ directionName: destination, firstStopId: stop.id, firstStopName: stop.name, times });
            break;
        }
    }
    return results;
};

export const getEtaScheduleInfo = (eta: { stopId: string; routeId: string; arrivalTimestamp: number }): { scheduledMinSinceMidnight: number | null; delayMinutes: number | null } => {
    const dt = getDayTypeForDate();
    const expandedStopIds = eta.stopId.split(',');
    
    let schedMins: number[] | undefined;
    for (const id of expandedStopIds) {
        const stopSched = getScheduleIndex()[id];
        if (!stopSched) continue;
        const lineKey = Object.keys(stopSched).find((k) => k.startsWith(eta.routeId + '|'));
        if (lineKey && stopSched[lineKey]?.[dt]?.length) {
            schedMins = stopSched[lineKey][dt];
            break;
        }
    }
    
    if (!schedMins?.length) return { scheduledMinSinceMidnight: null, delayMinutes: null };

    const d = new Date(eta.arrivalTimestamp * 1000);
    const predMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    let bestMatch = -1;
    let bestDiff = Infinity;
    for (const sm of schedMins) {
        const diff = predMin - sm;
        if (diff >= -2 && diff <= 20 && diff < bestDiff) { bestDiff = diff; bestMatch = sm; }
    }
    if (bestMatch < 0) return { scheduledMinSinceMidnight: null, delayMinutes: null };
    return { scheduledMinSinceMidnight: bestMatch, delayMinutes: Math.round(predMin - bestMatch) };
};
