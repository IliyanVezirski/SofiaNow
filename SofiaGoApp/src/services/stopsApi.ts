import { Platform } from 'react-native';
import bundledStops from '../data/stops.static.json';
import bundledRouteNames from '../data/routeNames.static.json';
import bundledLinesData from '../data/lines-data.static.json';
import bundledMetroRoutes from '../data/metroRoutes.static.json';
import { getRouteMetadata, haversineDistanceMeters, inferLineTypeFromToken, VehicleType } from './transitUtils';

export interface Stop {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    lines: string[];
    directions: string[];
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
    name: string;
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

let stopsCachePromise: Promise<Stop[]> | null = null;
let availableLinesCache: AvailableLine[] | null = null;

const routeShortNameByRouteId: Record<string, string> = bundledRouteNames;
const metroRoutesByLine = bundledMetroRoutes as unknown as Record<string, any>;

const sortStopLines = (lines: string[]) => lines.sort((left, right) => left.localeCompare(right, 'bg', { numeric: true }));
const sortStopDirections = (directions: string[]) => directions.sort((left, right) => left.localeCompare(right, 'bg'));

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

    const visibleDirections = stop.directions.slice(0, maxDirections);
    const remainingCount = stop.directions.length - visibleDirections.length;
    const suffix = remainingCount > 0 ? ` +${remainingCount}` : '';
    return `Посока: ${visibleDirections.join(' • ')}${suffix}`;
};

const normalizeBundledStops = (): Stop[] => {
    return (bundledStops as Stop[]).map((stop) => ({
        id: stop.id,
        name: stop.name,
        latitude: Number(stop.latitude),
        longitude: Number(stop.longitude),
        lines: sortStopLines([...(stop.lines || [])]),
        directions: sortStopDirections([...(stop.directions || [])]),
    }));
};

const buildStopsFromLinesData = (linesData: any[]): Stop[] => {
    const stopIndex = new Map<string, Stop & { lineSet: Set<string>; directionSet: Set<string> }>();

    linesData.forEach((lineData: any) => {
        const routeMetadata = getRouteMetadata(lineData.line);

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
                });
            });
        });
    });

    return Array.from(stopIndex.values()).map((stop) => ({
        id: stop.id,
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        lines: sortStopLines(Array.from(stop.lineSet)),
        directions: sortStopDirections(Array.from(stop.directionSet)),
    }));
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
        const inferredFromDisplay = inferLineTypeFromToken(displayLine);
        const inferredType = inferredFromDisplay === 'bus' ? routeMetadata.type : inferredFromDisplay;
        const effectiveType = isNight ? 'bus' : inferredType;
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

        const inferredType = inferLineTypeFromToken(displayLine);
        if (inferredType !== 'subway') {
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
            const inferredType = inferLineTypeFromToken(normalizedLine);
            const key = `${isNight ? 'night' : inferredType}:${normalizedLine}`;

            if (!lineIndex.has(key)) {
                lineIndex.set(key, {
                    line: normalizedLine,
                    routeId: '',
                    type: inferredType,
                    isNight,
                });
            }
        });
    });

    // Keep metro lines visible even if bundled stops are incomplete.
    Object.entries(routeShortNameByRouteId).forEach(([routeId, shortName]) => {
        const displayLine = String(shortName || '').trim().toUpperCase();
        if (!displayLine || inferLineTypeFromToken(displayLine) !== 'subway') {
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
                return buildStopsFromLinesData(bundledLinesData as any[]);
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
    return bundledLinesData as any[];
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

    const metro = metroRoutesByLine[normalizedLine];
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

const enrichDirectionWithOsrm = async (direction: LineRouteDirection): Promise<LineRouteDirection> => {
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

    availableLinesCache = buildAvailableLinesFromLinesData(bundledLinesData as any[]);
    return availableLinesCache;
};

export const fetchLineRouteGeometry = async (
    line: string,
    type: VehicleType,
    isNight: boolean
): Promise<LineRouteGeometry | null> => {
    try {
        const linesData = loadRawLinesData();
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

        const matchingEntry = linesData.find((lineData: any) => {
            const displayLine = getDisplayLineFromRouteId(lineData?.line);
            const routeIsNight = displayLine.toUpperCase().startsWith('N');
            const inferredType = inferLineTypeFromToken(displayLine);

            if (routeIsNight !== isNight) {
                return false;
            }

            if (!routeIsNight && inferredType !== type) {
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

        const directions = await Promise.all(rawDirections.map(enrichDirectionWithOsrm));

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

        // Normalize metro route IDs (e.g. A241 -> M3) and always prefer bundled two-way metro geometry.
        const displayLineByRoute = getDisplayLineFromRouteId(normalizedRouteId);
        if (inferLineTypeFromToken(displayLineByRoute) === 'subway') {
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
            if (inferLineTypeFromToken(displayLineByRoute) === 'subway') {
                return getBundledMetroRouteGeometry(displayLineByRoute);
            }
            return null;
        }

        const routeMetadata = getRouteMetadata(normalizedRouteId);
        const displayLine = getDisplayLineFromRouteId(normalizedRouteId);
        const isNight = displayLine.toUpperCase().startsWith('N');

        const rawDirections = [
            parseLineRouteDirection(matchingEntry.direction0),
            parseLineRouteDirection(matchingEntry.direction1),
        ].filter((direction): direction is LineRouteDirection => !!direction);

        if (!rawDirections.length) {
            return null;
        }

        const directions = await Promise.all(rawDirections.map(enrichDirectionWithOsrm));

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
