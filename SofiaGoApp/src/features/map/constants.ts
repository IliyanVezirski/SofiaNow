import { MapBounds } from '../../types/map';

export const VEHICLE_REFRESH_MS = 3000;
export const STOP_ETA_REFRESH_MS = 20000;
export const INITIAL_ZOOM_LEVEL = 16;
export const VEHICLE_ANIMATION_MS = 420;
export const STOP_ETA_PREVIEW_COUNT = 3;
export const MAX_RENDERED_VEHICLES = 40;
export const DEFAULT_CENTER_COORDINATE: [number, number] = [23.3219, 42.6977];
export const DEFAULT_BOUNDS_DELTA = 0.03;
export const MAX_HEADING_STEP_DEGREES = 32;
export const LOW_SPEED_HEADING_LOCK_KPH = 4;
export const OVERLAP_GROUP_DECIMALS = 4;
export const OVERLAP_OFFSET_DEGREES = 0.00008;
export const MAX_RENDERED_STOPS = 30;
export const VIEWPORT_BOUNDS_UPDATE_DEBOUNCE_MS = 300;
export const MIN_BOUNDS_DELTA_FOR_REFRESH = 0.0008;

export const MAP_STYLE = {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
        osm: {
            type: 'raster',
            tiles: [
                'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
                'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
                'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution: '\u00A9 OpenStreetMap contributors \u00A9 CARTO',
        },
    },
    layers: [
        {
            id: 'osm-raster-layer',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 22,
        },
    ],
} as const;

export const createFallbackBounds = (latitude: number, longitude: number): MapBounds => ({
    north: latitude + DEFAULT_BOUNDS_DELTA,
    south: latitude - DEFAULT_BOUNDS_DELTA,
    east: longitude + DEFAULT_BOUNDS_DELTA,
    west: longitude - DEFAULT_BOUNDS_DELTA,
});

export const hasMeaningfulBoundsChange = (previous: MapBounds | null, next: MapBounds) => {
    if (!previous) return true;
    return Math.max(
        Math.abs(previous.north - next.north),
        Math.abs(previous.south - next.south),
        Math.abs(previous.east - next.east),
        Math.abs(previous.west - next.west),
    ) >= MIN_BOUNDS_DELTA_FOR_REFRESH;
};

export const getDirectionAccentColor = (directionIndex: number) =>
    directionIndex % 2 === 0 ? '#1D4ED8' : '#F97316';

export const normalizeHeadingDegrees = (value: number) => ((value % 360) + 360) % 360;

export const shortestHeadingDelta = (from: number, to: number) => {
    let delta = to - from;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return delta;
};

export const interpolateHeadingDegrees = (from: number, to: number, progress: number) =>
    normalizeHeadingDegrees(from + shortestHeadingDelta(from, to) * progress);

export const computeHeadingDegrees = (from: [number, number], to: [number, number]) => {
    const deltaLon = to[0] - from[0];
    const deltaLat = to[1] - from[1];
    const radians = Math.atan2(deltaLon, deltaLat);
    return (radians * 180) / Math.PI;
};

export const getDirectionArrowSamples = (coordinates: [number, number][], maxArrows = 14) => {
    if (coordinates.length < 3) return [] as Array<{ coordinate: [number, number]; headingDegrees: number }>;
    const segmentCount = coordinates.length - 1;
    const step = Math.max(1, Math.floor(segmentCount / maxArrows));
    const samples: Array<{ coordinate: [number, number]; headingDegrees: number }> = [];
    for (let i = step; i < segmentCount; i += step) {
        samples.push({
            coordinate: coordinates[i],
            headingDegrees: computeHeadingDegrees(coordinates[i - 1], coordinates[i]),
        });
    }
    return samples;
};

export const formatMinutesSinceMidnight = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export const formatMinSinceMidnight = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    const min = Math.round(m % 60);
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};
