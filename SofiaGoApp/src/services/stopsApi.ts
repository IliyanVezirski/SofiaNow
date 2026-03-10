import { Platform } from 'react-native';
import bundledStops from '../data/stops.static.json';
import { getRouteMetadata, haversineDistanceMeters } from './transitUtils';

export interface Stop {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    lines: string[];
    directions: string[];
}

const LINES_DATA_URL = 'https://livemap.sofiatraffic.bg/api/lines-data';
const NEARBY_STOP_RADIUS_METERS = 1800;
const MAX_NEARBY_STOPS = 35;

let stopsCachePromise: Promise<Stop[]> | null = null;

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

const loadAllStops = async (): Promise<Stop[]> => {
    if (stopsCachePromise) {
        return stopsCachePromise;
    }

    stopsCachePromise = (async () => {
        if (Platform.OS === 'web') {
            return normalizeBundledStops();
        }

        try {
            const response = await fetch(LINES_DATA_URL);
            if (!response.ok) {
                throw new Error(`Failed to fetch static lines data: ${response.statusText}`);
            }

            const linesData = await response.json();
            return buildStopsFromLinesData(linesData);
        } catch (error) {
            console.warn('Falling back to bundled static stops:', error);
            return normalizeBundledStops();
        }
    })();

    return stopsCachePromise;
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
