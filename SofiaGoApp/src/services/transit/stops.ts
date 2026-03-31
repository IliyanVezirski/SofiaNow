import { Platform } from 'react-native';
import type { DayType } from '../../types/vehicles';
import bundledRouteNames from '../../data/routeNames.static.json';
import { getRouteMetadata, getGtfsRouteType, haversineDistanceMeters, inferLineTypeFromToken, VehicleType } from './utils';

// ── Lazy JSON loaders (defer parsing of large files) ──
let _bundledStops: any[] | null = null;
const getBundledStops = () => { if (!_bundledStops) _bundledStops = require('../../data/stops.static.json'); return _bundledStops!; };

let _bundledLinesData: any[] | null = null;
const getBundledLinesData = () => { if (!_bundledLinesData) _bundledLinesData = require('../../data/lines-data.static.json'); return _bundledLinesData!; };

let _bundledMetroRoutes: Record<string, any> | null = null;
const getBundledMetroRoutes = () => { if (!_bundledMetroRoutes) _bundledMetroRoutes = require('../../data/metroRoutes.static.json'); return _bundledMetroRoutes!; };

let _bundledRouteGeometries: any[] | null = null;
const getBundledRouteGeometries = () => { if (!_bundledRouteGeometries) _bundledRouteGeometries = require('../../data/routeGeometry.static.json'); return _bundledRouteGeometries!; };

let _displayLineTypeMap: Map<string, VehicleType> | null = null;
const getDisplayLineTypeMap = (): Map<string, VehicleType> => {
    if (_displayLineTypeMap) return _displayLineTypeMap;
    _displayLineTypeMap = new Map();
    getBundledLinesData().forEach((lineData: any) => {
        const routeId = String(lineData.line || '').trim();
        if (!routeId) return;
        const meta = getRouteMetadata(routeId);
        const lineType = lineData.type || meta.type;
        const shortName = routeShortNameByRouteId[routeId.toUpperCase()] || meta.line;
        if (shortName) {
            const normalized = shortName.toUpperCase().replace(/\s+/g, '');
            if (!_displayLineTypeMap!.has(normalized)) {
                _displayLineTypeMap!.set(normalized, lineType);
            }
        }
    });
    return _displayLineTypeMap;
};

const resolveLineTypeByDisplayName = (displayLine: string): VehicleType => {
    const normalized = String(displayLine || '').trim().toUpperCase().replace(/\s+/g, '');
    return getDisplayLineTypeMap().get(normalized) || inferLineTypeFromToken(displayLine);
};

export interface Stop {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    lines: string[];
    directions: string[];
    vehicleTypes?: VehicleType[];
}


const NEARBY_STOP_RADIUS_METERS = 1800;
const MAX_NEARBY_STOPS = 35;
const MAX_VIEWPORT_STOPS = 120;

export interface MapBounds {
    north: number;
    south: number;
    east: number;
    west: number;
}

export interface AvailableLine {
    line: string;
    routeId: string;
    type: VehicleType;
    isNight: boolean;
}

export interface LineRouteDirection {
    id?: string;
    name: string;
    mergedDirectionNames?: string[];
    availableDayTypes?: DayType[];
    coordinates: [number, number][];
    stops: Array<{
        id: string;
        name: string;
        latitude: number;
        longitude: number;
    }>;
}

export interface LineRouteGeometry {
    line: string;
    type: VehicleType;
    isNight: boolean;
    directions: LineRouteDirection[];
}

interface BundledRouteGeometryEntry {
    routeId: string;
    line: string;
    shortName?: string;
    longName?: string;
    type: VehicleType;
    isNight: boolean;
    directions: Array<{
        id?: string;
        name: string;
        coordinates: [number, number][];
        stops: Array<{
            id: string;
            name: string;
            latitude: number;
            longitude: number;
        }>;
    }>;
}

let stopsCachePromise: Promise<Stop[]> | null = null;
let availableLinesCache: AvailableLine[] | null = null;

const routeShortNameByRouteId: Record<string, string> = bundledRouteNames;

const fastNumericCompare = (a: string, b: string): number => {
    const aNum = parseInt(a, 10);
    const bNum = parseInt(b, 10);
    if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) return aNum - bNum;
    return a < b ? -1 : a > b ? 1 : 0;
};

const sortStopLines = (lines: string[]) => lines.sort(fastNumericCompare);
const sortStopDirections = (directions: string[]) => directions.sort();

const getTerminalDirectionName = (directionLabel: string) => {
    const normalizedLabel = String(directionLabel || '').trim();
    if (!normalizedLabel) {
        return '';
    }

    const extractLastSegment = (value: string) => {
        const segments = value.split(/\s[-–]\s/).map((segment) => segment.trim()).filter(Boolean);
        return segments[segments.length - 1] || value;
    };

    if (normalizedLabel.includes('=>')) {
        const segments = normalizedLabel.split('=>').map((segment) => segment.trim()).filter(Boolean);
        return extractLastSegment(segments[segments.length - 1] || normalizedLabel);
    }

    const towardIndex = normalizedLabel.toLocaleLowerCase('bg-BG').lastIndexOf(' към ');
    if (towardIndex >= 0) {
        return extractLastSegment(normalizedLabel.slice(towardIndex + 5).trim() || normalizedLabel);
    }

    return extractLastSegment(normalizedLabel);
};

const getDirectionLabel = (line: string, direction: any) => {
    const explicitDirectionName = typeof direction?.name === 'string' ? direction.name.trim() : '';
    const destinationStopName = Array.isArray(direction?.stops) && direction.stops.length
        ? String(direction.stops[direction.stops.length - 1]?.name || '').trim()
        : '';
    const destination = explicitDirectionName || destinationStopName;
    return destination ? `${line} към ${destination}` : line;
};

export const summarizeStopDirections = (stop: Stop, maxDirections = 2) => {
    if (!stop.directions.length) {
        return 'Посока: н/д';
    }

    const normalizedDirections = Array.from(new Set(
        stop.directions
            .map((direction) => getTerminalDirectionName(direction))
            .filter(Boolean),
    ));
    const visibleDirections = normalizedDirections.slice(0, maxDirections);
    const remainingCount = normalizedDirections.length - visibleDirections.length;
    const suffix = remainingCount > 0 ? ` +${remainingCount}` : '';
    return `Посока: ${visibleDirections.join(' • ')}${suffix}`;
};

let _cachedMetroStops: Stop[] | null = null;
const extractMetroStops = (): Stop[] => {
    if (_cachedMetroStops) return _cachedMetroStops;
    const stopMap = new Map<string, Stop>();
    Object.values(getBundledMetroRoutes()).forEach((route: any) => {
        route.directions.forEach((dir: any) => {
            dir.stops.forEach((stop: any) => {
                if (!stopMap.has(stop.id)) {
                    stopMap.set(stop.id, {
                        id: stop.id,
                        name: stop.name,
                        latitude: stop.latitude,
                        longitude: stop.longitude,
                        lines: [route.line],
                        directions: [dir.name],
                        vehicleTypes: ['subway']
                    });
                } else {
                    const existing = stopMap.get(stop.id)!;
                    if (!existing.lines.includes(route.line)) existing.lines.push(route.line);
                    if (!existing.directions.includes(dir.name)) existing.directions.push(dir.name);
                }
            });
        });
    });
    _cachedMetroStops = Array.from(stopMap.values());
    return _cachedMetroStops;
};

const groupStops = (stops: Stop[]): Stop[] => {
    type GroupEntry = {
        id: string;
        name: string;
        latitude: number;
        longitude: number;
        lineSet: Set<string>;
        directionSet: Set<string>;
        typeSet: Set<string>;
        idParts: string[];
    };

    const groupMap = new Map<string, GroupEntry>();

    for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        const id = stop.id;

        const isSubway = (stop.vehicleTypes && stop.vehicleTypes.includes('subway')) || id.charCodeAt(0) === 77; // 'M'
        let coreCode: string;
        if (isSubway) {
            coreCode = `S_${id}`;
        } else {
            let numStart = id.length;
            while (numStart > 0 && id.charCodeAt(numStart - 1) >= 48 && id.charCodeAt(numStart - 1) <= 57) numStart--;
            coreCode = numStart < id.length ? id.substring(numStart) : id;
        }

        const existing = groupMap.get(coreCode);
        if (existing) {
            for (const l of stop.lines) existing.lineSet.add(l);
            for (const d of stop.directions) existing.directionSet.add(d);
            if (stop.vehicleTypes) for (const t of stop.vehicleTypes) existing.typeSet.add(t);
            existing.idParts.push(id);
        } else {
            const entry: GroupEntry = {
                id,
                name: stop.name,
                latitude: stop.latitude,
                longitude: stop.longitude,
                lineSet: new Set(stop.lines),
                directionSet: new Set(stop.directions),
                typeSet: new Set(stop.vehicleTypes || []),
                idParts: [id],
            };
            groupMap.set(coreCode, entry);
        }
    }

    const result: Stop[] = [];
    for (const entry of groupMap.values()) {
        result.push({
            id: entry.idParts.join(','),
            name: entry.name,
            latitude: entry.latitude,
            longitude: entry.longitude,
            lines: Array.from(entry.lineSet).sort(fastNumericCompare),
            directions: Array.from(entry.directionSet).sort(),
            vehicleTypes: Array.from(entry.typeSet).sort() as VehicleType[],
        });
    }
    return result;
};

let _stopVehicleTypes: Map<string, Set<VehicleType>> | null = null;
const getStopVehicleTypesFromLinesData = (): Map<string, Set<VehicleType>> => {
    if (_stopVehicleTypes) return _stopVehicleTypes;
    _stopVehicleTypes = new Map();
    getBundledLinesData().forEach((entry: any) => {
        const type: VehicleType = entry.type || getRouteMetadata(entry.line).type;
        for (const dirKey of ['direction0', 'direction1']) {
            const dir = entry[dirKey];
            if (!dir?.stops) continue;
            dir.stops.forEach((stop: any) => {
                const sid = String(stop.id || '');
                if (!_stopVehicleTypes!.has(sid)) _stopVehicleTypes!.set(sid, new Set());
                _stopVehicleTypes!.get(sid)!.add(type);
            });
        }
    });
    return _stopVehicleTypes;
};

let _cachedBundledStops: Stop[] | null = null;
const normalizeBundledStops = (): Stop[] => {
    if (_cachedBundledStops) return _cachedBundledStops;
    const stopTypeMap = getStopVehicleTypesFromLinesData();
    const raw = (getBundledStops() as Stop[]).map((stop) => {
        const typesFromRoutes = stopTypeMap.get(stop.id);
        return {
            id: stop.id,
            name: stop.name,
            latitude: Number(stop.latitude),
            longitude: Number(stop.longitude),
            lines: [...(stop.lines || [])],
            directions: [...(stop.directions || [])],
            vehicleTypes: typesFromRoutes ? Array.from(typesFromRoutes) : ['bus' as VehicleType],
        };
    });
    _cachedBundledStops = groupStops([...raw, ...extractMetroStops()]);
    return _cachedBundledStops;
};

const buildStopsFromLinesData = (linesData: any[]): Stop[] => {
    const stopIndex = new Map<string, Stop & { lineSet: Set<string>; directionSet: Set<string>; typeSet: Set<VehicleType> }>();

    linesData.forEach((lineData: any) => {
        const routeMetadata = getRouteMetadata(lineData.line);
        const lineType: VehicleType = lineData.type || routeMetadata.type;

        ['direction0', 'direction1'].forEach((directionKey) => {
            const direction = lineData[directionKey];
            if (!direction || !Array.isArray(direction.stops)) {
                return;
            }

            const directionLabel = getDirectionLabel(routeMetadata.line, direction);

            direction.stops.forEach((stop: any) => {
                const existing = stopIndex.get(stop.id);
                if (existing) {
                    existing.lineSet.add(routeMetadata.line);
                    existing.directionSet.add(directionLabel);
                    existing.typeSet.add(lineType);
                    return;
                }

                stopIndex.set(stop.id, {
                    id: stop.id,
                    name: stop.name,
                    latitude: Number(stop.latitude),
                    longitude: Number(stop.longitude),
                    lines: [],
                    lineSet: new Set([routeMetadata.line]),
                    directions: [],
                    directionSet: new Set([directionLabel]),
                    typeSet: new Set([lineType]),
                });
            });
        });
    });

    const raw = Array.from(stopIndex.values()).map((stop) => ({
        id: stop.id,
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        lines: sortStopLines(Array.from(stop.lineSet)),
        directions: sortStopDirections(Array.from(stop.directionSet)),
        vehicleTypes: Array.from(stop.typeSet).sort(),
    }));
    return groupStops([...raw, ...extractMetroStops()]);
};

const buildAvailableLinesFromLinesData = (linesData: any[]): AvailableLine[] => {
    const lineIndex = new Map<string, AvailableLine>();

    linesData.forEach((lineData: any) => {
        const rawRouteId = String(lineData.line || '').trim();
        const routeMetadata = getRouteMetadata(rawRouteId);
        const displayLine = getDisplayLineFromRouteId(rawRouteId);
        if (!displayLine) {
            return;
        }

        const isNight = displayLine.toUpperCase().startsWith('N');
        const lineType: VehicleType = lineData.type || routeMetadata.type;
        const effectiveType = isNight ? 'bus' : lineType;
        const key = `${isNight ? 'night' : effectiveType}:${displayLine}`;

        const existing = lineIndex.get(key);
        if (!existing) {
            lineIndex.set(key, {
                line: displayLine,
                routeId: rawRouteId.toUpperCase(),
                type: effectiveType,
                isNight,
            });
        } else {
            // Prefer the route whose ID naturally encodes the display line
            // e.g. A111 → "111" is better than A3 → "111" (via routeNames)
            const existingNatural = getRouteMetadata(existing.routeId).line;
            const candidateNatural = routeMetadata.line;
            if (candidateNatural === displayLine && existingNatural !== displayLine) {
                lineIndex.set(key, {
                    line: displayLine,
                    routeId: rawRouteId.toUpperCase(),
                    type: effectiveType,
                    isNight,
                });
            }
        }
    });

    // Metro routes are often incomplete in lines-data; backfill them from static GTFS route short names.
    Object.entries(routeShortNameByRouteId).forEach(([routeId, shortName]) => {
        const displayLine = String(shortName || '').trim().toUpperCase();
        if (!displayLine) {
            return;
        }

        const gtfsType = getGtfsRouteType(routeId);
        if (gtfsType !== 'subway') {
            return;
        }

        const key = `subway:${displayLine}`;
        if (!lineIndex.has(key)) {
            lineIndex.set(key, {
                line: displayLine,
                routeId: String(routeId || '').trim().toUpperCase(),
                type: 'subway',
                isNight: false,
            });
        }
    });

    return Array.from(lineIndex.values()).sort((left, right) => left.line.localeCompare(right.line, 'bg', { numeric: true }));
};

const buildAvailableLinesFromBundledStops = (): AvailableLine[] => {
    const lineIndex = new Map<string, AvailableLine>();

    normalizeBundledStops().forEach((stop) => {
        stop.lines.forEach((lineToken) => {
            const normalizedLine = String(lineToken || '').trim();
            if (!normalizedLine) {
                return;
            }

            const isNight = normalizedLine.toUpperCase().startsWith('N');
            const resolvedType = resolveLineTypeByDisplayName(normalizedLine);
            const key = `${isNight ? 'night' : resolvedType}:${normalizedLine}`;

            if (!lineIndex.has(key)) {
                lineIndex.set(key, {
                    line: normalizedLine,
                    routeId: '',
                    type: resolvedType,
                    isNight,
                });
            }
        });
    });

    // Keep metro lines visible even if bundled stops are incomplete.
    Object.entries(routeShortNameByRouteId).forEach(([routeId, shortName]) => {
        const displayLine = String(shortName || '').trim().toUpperCase();
        if (!displayLine || getGtfsRouteType(routeId) !== 'subway') {
            return;
        }

        const key = `subway:${displayLine}`;
        if (!lineIndex.has(key)) {
            lineIndex.set(key, {
                line: displayLine,
                routeId: String(routeId || '').trim().toUpperCase(),
                type: 'subway',
                isNight: false,
            });
        }
    });

    return Array.from(lineIndex.values()).sort((left, right) => left.line.localeCompare(right.line, 'bg', { numeric: true }));
};

const normalizeRouteLineToken = (lineToken: string | undefined | null, type?: VehicleType) => {
    const normalized = String(lineToken || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!normalized) {
        return '';
    }

    if (type === 'tram') {
        return normalized.replace(/^TM/, '').replace(/TM$/, '');
    }

    if (type === 'trolley') {
        return normalized.replace(/^TB/, '').replace(/TB$/, '');
    }

    if (type === 'subway') {
        return normalized.replace(/^M/, '');
    }

    if (normalized.startsWith('AX')) {
        return normalized.replace(/^AX/, 'X');
    }

    return normalized;
};

const getBundledNonMetroRouteGeometries = (): BundledRouteGeometryEntry[] => (
    (getBundledRouteGeometries() as BundledRouteGeometryEntry[])
        .filter((entry) => entry.type !== 'subway')
);

const cloneLineRouteGeometry = (geometry: LineRouteGeometry): LineRouteGeometry => ({
    ...geometry,
    directions: geometry.directions.map((direction) => ({
        ...direction,
        coordinates: direction.coordinates.map(([lon, lat]) => [lon, lat] as [number, number]),
        stops: direction.stops.map((stop) => ({ ...stop })),
    })),
});

const toLineRouteGeometry = (entry: BundledRouteGeometryEntry): LineRouteGeometry | null => {
    const directions = (entry.directions || [])
        .map((direction) => {
            const coordinates = (direction.coordinates || [])
                .map((coord) => {
                    const lon = Number(Array.isArray(coord) ? coord[0] : undefined);
                    const lat = Number(Array.isArray(coord) ? coord[1] : undefined);
                    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
                        return null;
                    }

                    return [lon, lat] as [number, number];
                })
                .filter((coord: [number, number] | null): coord is [number, number] => !!coord);

            if (coordinates.length < 2) {
                return null;
            }

            const stops = (direction.stops || [])
                .map((stop) => {
                    const latitude = Number(stop?.latitude);
                    const longitude = Number(stop?.longitude);
                    const id = String(stop?.id || '').trim();
                    const name = String(stop?.name || '').trim();
                    if (!id || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                        return null;
                    }

                    return { id, name, latitude, longitude };
                })
                .filter((stop: {
                    id: string;
                    name: string;
                    latitude: number;
                    longitude: number;
                } | null): stop is {
                    id: string;
                    name: string;
                    latitude: number;
                    longitude: number;
                } => !!stop);

            if (stops.length < 2) {
                return null;
            }

            return {
                id: direction.id,
                name: String(direction.name || '').trim(),
                coordinates,
                stops,
            };
        })
        .filter((direction: LineRouteDirection | null): direction is LineRouteDirection => !!direction);

    if (!directions.length) {
        return null;
    }

    return {
        line: String(entry.line || '').trim(),
        type: entry.type,
        isNight: !!entry.isNight,
        directions,
    };
};

const findBundledRouteGeometryByLine = (
    line: string,
    type: VehicleType,
    isNight: boolean,
): LineRouteGeometry | null => {
    const normalizedTargetLine = normalizeRouteLineToken(line, type);
    if (!normalizedTargetLine) {
        return null;
    }

    const match = getBundledNonMetroRouteGeometries().find((entry) => (
        entry.type === type
        && !!entry.isNight === isNight
        && normalizeRouteLineToken(entry.line, entry.type) === normalizedTargetLine
    ));

    if (!match) {
        return null;
    }

    const geometry = toLineRouteGeometry(match);
    return geometry ? cloneLineRouteGeometry(geometry) : null;
};

const findBundledRouteGeometryByRouteId = (routeId: string): LineRouteGeometry | null => {
    const normalizedRouteId = String(routeId || '').trim().toUpperCase();
    if (!normalizedRouteId) {
        return null;
    }

    const match = getBundledNonMetroRouteGeometries().find((entry) => (
        String(entry.routeId || '').trim().toUpperCase() === normalizedRouteId
    ));

    if (!match) {
        return null;
    }

    const geometry = toLineRouteGeometry(match);
    return geometry ? cloneLineRouteGeometry(geometry) : null;
};

const buildAvailableLinesFromRouteGeometry = (): AvailableLine[] => {
    const lineIndex = new Map<string, AvailableLine>();

    getBundledNonMetroRouteGeometries().forEach((entry) => {
        const line = String(entry.line || '').trim().toUpperCase();
        const routeId = String(entry.routeId || '').trim().toUpperCase();
        if (!line || !routeId) {
            return;
        }

        const key = `${entry.isNight ? 'night' : entry.type}:${line}`;
        if (!lineIndex.has(key)) {
            lineIndex.set(key, {
                line,
                routeId,
                type: entry.type,
                isNight: !!entry.isNight,
            });
        }
    });

    Object.keys(getBundledMetroRoutes()).forEach((line) => {
        const normalizedLine = String(line || '').trim().toUpperCase();
        if (!normalizedLine) {
            return;
        }

        const key = `subway:${normalizedLine}`;
        if (!lineIndex.has(key)) {
            lineIndex.set(key, {
                line: normalizedLine,
                routeId: `M${normalizedLine}`,
                type: 'subway',
                isNight: false,
            });
        }
    });

    return Array.from(lineIndex.values()).sort((left, right) => left.line.localeCompare(right.line, 'bg', { numeric: true }));
};

const loadAllStops = async (): Promise<Stop[]> => {
    if (stopsCachePromise) {
        return stopsCachePromise;
    }

    stopsCachePromise = (async () => {
        try {
            const bundled = normalizeBundledStops();

            // Keep the same stop source on web and native to avoid data divergence.
            if (bundled.length) {
                return bundled;
            }

            if (Platform.OS !== 'web') {
                return buildStopsFromLinesData(getBundledLinesData() as any[]);
            }

            return bundled;
        } catch (error) {
            console.warn('Falling back to bundled static stops:', error);
            return normalizeBundledStops();
        }
    })();

    return stopsCachePromise;
};

const loadRawLinesData = (): any[] => {
    return getBundledLinesData() as any[];
};

const getDisplayLineFromRouteId = (routeId: string | undefined) => {
    const routeMetadata = getRouteMetadata(routeId);
    const key = String(routeMetadata.routeId || '').trim().toUpperCase();
    return String(
        routeShortNameByRouteId[key]
        || routeMetadata.line
        || ''
    ).trim();
};

const getBundledMetroRouteGeometry = (lineToken: string | undefined | null): LineRouteGeometry | null => {
    const normalizedLine = String(lineToken || '').trim().toUpperCase();
    if (!normalizedLine) {
        return null;
    }

    const metro = (getBundledMetroRoutes() as any)[normalizedLine];
    if (!metro?.directions?.length) {
        return null;
    }

    const directions: LineRouteDirection[] = metro.directions
        .map((direction: any) => {
            const coordinates = (direction?.coordinates || [])
                .map((coord: any) => {
                    const lon = Number(Array.isArray(coord) ? coord[0] : undefined);
                    const lat = Number(Array.isArray(coord) ? coord[1] : undefined);
                    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
                        return null;
                    }

                    return [lon, lat] as [number, number];
                })
                .filter((coord: [number, number] | null): coord is [number, number] => !!coord);

            if (coordinates.length < 2) {
                return null;
            }

            const stops = (direction?.stops || [])
                .map((stop: any) => {
                    const id = String(stop?.id || '').trim();
                    const name = String(stop?.name || '').trim();
                    const latitude = Number(stop?.latitude);
                    const longitude = Number(stop?.longitude);
                    if (!id || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                        return null;
                    }

                    return { id, name, latitude, longitude };
                })
                .filter((stop: {
                    id: string;
                    name: string;
                    latitude: number;
                    longitude: number;
                } | null): stop is {
                    id: string;
                    name: string;
                    latitude: number;
                    longitude: number;
                } => !!stop);

            return {
                name: String(direction?.name || '').trim(),
                coordinates,
                stops,
            };
        })
        .filter((direction: LineRouteDirection | null): direction is LineRouteDirection => !!direction);

    if (!directions.length) {
        return null;
    }

    return {
        line: String(metro.line || normalizedLine),
        type: 'subway',
        isNight: false,
        directions,
    };
};

const parseLineRouteDirection = (direction: any): LineRouteDirection | null => {
    if (!direction || !Array.isArray(direction.stops) || !direction.stops.length) {
        return null;
    }

    const stops = direction.stops
        .map((stop: any) => {
            const id = String(stop?.id || '').trim();
            const name = String(stop?.name || '').trim();
            const lon = Number(stop?.longitude);
            const lat = Number(stop?.latitude);

            if (!id || !name || !Number.isFinite(lon) || !Number.isFinite(lat)) {
                return null;
            }

            return {
                id,
                name,
                latitude: lat,
                longitude: lon,
            };
        })
        .filter((stop: {
            id: string;
            name: string;
            latitude: number;
            longitude: number;
        } | null): stop is {
            id: string;
            name: string;
            latitude: number;
            longitude: number;
        } => !!stop);

    const coordinates = direction.stops
        .map((stop: any) => {
            const lon = Number(stop?.longitude);
            const lat = Number(stop?.latitude);

            if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
                return null;
            }

            return [lon, lat] as [number, number];
        })
        .filter((coord: [number, number] | null): coord is [number, number] => !!coord);

    if (coordinates.length < 2) {
        return null;
    }

    return {
        name: String(direction.name || ''),
        coordinates,
        stops,
    };
};

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';

export const fetchOsrmRoute = async (stops: Array<{ latitude: number; longitude: number }>): Promise<[number, number][]> => {
    if (stops.length < 2) {
        return stops.map((s) => [s.longitude, s.latitude]);
    }

    const coords = stops.map((s) => `${s.longitude},${s.latitude}`).join(';');
    const url = `${OSRM_BASE_URL}/${coords}?overview=full&geometries=geojson`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`OSRM request failed: ${response.status}`);
    }

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes?.length) {
        throw new Error(`OSRM returned no routes: ${data.code}`);
    }

    return data.routes[0].geometry.coordinates as [number, number][];
};

const enrichDirectionWithOsrm = async (direction: LineRouteDirection, vehicleType?: string): Promise<LineRouteDirection> => {
    if (vehicleType && vehicleType !== 'bus') {
        return direction;
    }
    try {
        const osrmCoords = await fetchOsrmRoute(direction.stops);
        return { ...direction, coordinates: osrmCoords };
    } catch (error) {
        console.warn('OSRM enrichment failed, using stop coordinates:', error);
        return direction;
    }
};

const isStopInsideBounds = (stop: Stop, bounds: MapBounds) => {
    return stop.latitude <= bounds.north
        && stop.latitude >= bounds.south
        && stop.longitude <= bounds.east
        && stop.longitude >= bounds.west;
};

export const fetchStopsInBounds = async (bounds: MapBounds, maxStops = MAX_VIEWPORT_STOPS): Promise<Stop[]> => {
    try {
        const stops = await loadAllStops();
        const centerLat = (bounds.north + bounds.south) / 2;
        const centerLon = (bounds.east + bounds.west) / 2;

        const stopsInBounds = stops
            .filter((stop) => isStopInsideBounds(stop, bounds))
            .map((stop) => ({
                stop,
                distanceMeters: haversineDistanceMeters(centerLat, centerLon, stop.latitude, stop.longitude),
            }))
            .sort((left, right) => left.distanceMeters - right.distanceMeters)
            .slice(0, maxStops)
            .map((entry) => entry.stop);

        if (stopsInBounds.length >= 8) {
            return stopsInBounds;
        }

        return stops
            .map((stop) => ({
                stop,
                distanceMeters: haversineDistanceMeters(centerLat, centerLon, stop.latitude, stop.longitude),
            }))
            .sort((left, right) => left.distanceMeters - right.distanceMeters)
            .slice(0, maxStops)
            .map((entry) => entry.stop);
    } catch (error) {
        console.error('Failed to fetch stops in bounds:', error);
        return [];
    }
};

export const fetchStopsNearby = async (lat: number, lon: number): Promise<Stop[]> => {
    try {
        const stops = await loadAllStops();

        const nearbyStops = stops
            .map((stop) => ({
                stop,
                distanceMeters: haversineDistanceMeters(lat, lon, stop.latitude, stop.longitude),
            }))
            .filter((entry) => entry.distanceMeters <= NEARBY_STOP_RADIUS_METERS)
            .sort((left, right) => left.distanceMeters - right.distanceMeters)
            .slice(0, MAX_NEARBY_STOPS)
            .map((entry) => entry.stop);

        if (nearbyStops.length >= 8) {
            return nearbyStops;
        }

        return stops
            .map((stop) => ({
                stop,
                distanceMeters: haversineDistanceMeters(lat, lon, stop.latitude, stop.longitude),
            }))
            .sort((left, right) => left.distanceMeters - right.distanceMeters)
            .slice(0, MAX_NEARBY_STOPS)
            .map((entry) => entry.stop);
    } catch (error) {
        console.error('Failed to fetch real stops:', error);
        return [];
    }
};

export const fetchAllStops = async (): Promise<Stop[]> => {
    return loadAllStops();
};

export const fetchStopById = async (stopId: string): Promise<Stop | null> => {
    const normalizedStopId = String(stopId || '').trim();
    if (!normalizedStopId) {
        return null;
    }

    try {
        const stops = await loadAllStops();
        return stops.find((stop) => stop.id === normalizedStopId) || null;
    } catch (error) {
        console.error('Failed to fetch stop by id:', error);
        return null;
    }
};

export const fetchAvailableLines = async (): Promise<AvailableLine[]> => {
    if (availableLinesCache) {
        return availableLinesCache;
    }

    availableLinesCache = buildAvailableLinesFromRouteGeometry();
    return availableLinesCache;
};

export const fetchLineRouteGeometry = async (
    line: string,
    type: VehicleType,
    isNight: boolean
): Promise<LineRouteGeometry | null> => {
    try {
        const normalizedTargetLine = String(line || '').trim();
        if (!normalizedTargetLine) {
            return null;
        }

        // Use bundled metro geometry for all subway lines to ensure complete two-way routes.
        if (type === 'subway') {
            const metroGeometry = getBundledMetroRouteGeometry(normalizedTargetLine);
            if (metroGeometry) {
                return metroGeometry;
            }
        }

        const bundledGeometry = findBundledRouteGeometryByLine(normalizedTargetLine, type, isNight);
        if (bundledGeometry) {
            return bundledGeometry;
        }

        const linesData = loadRawLinesData();

        const matchingEntry = linesData.find((lineData: any) => {
            const displayLine = getDisplayLineFromRouteId(lineData?.line);
            const routeIsNight = displayLine.toUpperCase().startsWith('N');
            const routeTypeMeta = getRouteMetadata(lineData?.line);

            if (routeIsNight !== isNight) {
                return false;
            }

            if (!routeIsNight && routeTypeMeta.type !== type) {
                return false;
            }

            return displayLine === normalizedTargetLine;
        });

        if (!matchingEntry) {
            if (type === 'subway') {
                return getBundledMetroRouteGeometry(normalizedTargetLine);
            }
            return null;
        }

        const displayLine = getDisplayLineFromRouteId(matchingEntry?.line);

        const rawDirections = [
            parseLineRouteDirection(matchingEntry.direction0),
            parseLineRouteDirection(matchingEntry.direction1),
        ].filter((direction): direction is LineRouteDirection => !!direction);

        if (!rawDirections.length) {
            return null;
        }

        const directions = await Promise.all(rawDirections.map((d) => enrichDirectionWithOsrm(d, type)));

        return {
            line: displayLine || normalizedTargetLine,
            type,
            isNight,
            directions,
        };
    } catch (error) {
        console.error('Failed to fetch line route geometry:', error);
        return null;
    }
};

export const fetchLineRouteGeometryByRouteId = async (routeId: string): Promise<LineRouteGeometry | null> => {
    try {
        const normalizedRouteId = String(routeId || '').trim().toUpperCase();
        if (!normalizedRouteId) {
            return null;
        }

        const bundledGeometry = findBundledRouteGeometryByRouteId(normalizedRouteId);
        if (bundledGeometry) {
            return bundledGeometry;
        }

        // Normalize metro route IDs (e.g. A241 -> M3) and always prefer bundled two-way metro geometry.
        const displayLineByRoute = getDisplayLineFromRouteId(normalizedRouteId);
        const routeMetadata = getRouteMetadata(normalizedRouteId);
        const fallbackLine = displayLineByRoute || routeMetadata.line;
        const fallbackType = routeMetadata.type;
        const fallbackIsNight = fallbackLine.toUpperCase().startsWith('N');
        if (routeMetadata.type === 'subway') {
            const metroGeometry = getBundledMetroRouteGeometry(displayLineByRoute);
            if (metroGeometry) {
                return metroGeometry;
            }
        }

        const linesData = loadRawLinesData();

        const matchingEntry = linesData.find((lineData: any) => {
            return String(lineData?.line || '').trim().toUpperCase() === normalizedRouteId;
        });

        if (!matchingEntry) {
            const displayLineByRoute = getDisplayLineFromRouteId(normalizedRouteId);
            if (routeMetadata.type === 'subway') {
                return getBundledMetroRouteGeometry(displayLineByRoute);
            }
            return fallbackLine
                ? fetchLineRouteGeometry(fallbackLine, fallbackType, fallbackIsNight)
                : null;
        }

        const displayLine = getDisplayLineFromRouteId(normalizedRouteId);
        const isNight = displayLine.toUpperCase().startsWith('N');

        const rawDirections = [
            parseLineRouteDirection(matchingEntry.direction0),
            parseLineRouteDirection(matchingEntry.direction1),
        ].filter((direction): direction is LineRouteDirection => !!direction);

        if (!rawDirections.length) {
            return fallbackLine
                ? fetchLineRouteGeometry(fallbackLine, fallbackType, fallbackIsNight)
                : null;
        }

        const directions = await Promise.all(rawDirections.map((d) => enrichDirectionWithOsrm(d, routeMetadata.type)));

        return {
            line: displayLine || routeMetadata.line,
            type: routeMetadata.type,
            isNight,
            directions,
        };
    } catch (error) {
        console.error('Failed to fetch line route geometry by routeId:', error);
        return null;
    }
};
