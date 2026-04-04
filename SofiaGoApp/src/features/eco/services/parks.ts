import type { MapBounds } from '../../../types/map';
import type { EcoCoordinate, EcoLinearRing, EcoParksFeature, EcoParksFeatureCollection, EcoPolygonGeometry } from '../types';

const PARKS_DATASET_URL = 'https://api.sofiaplan.bg/datasets/235';

let cachedParks: EcoParksFeatureCollection | null = null;
let parksRequest: Promise<EcoParksFeatureCollection> | null = null;

const parseCoordinate = (value: unknown): EcoCoordinate | null => {
    if (Array.isArray(value) && value.length >= 2) {
        const longitude = Number(value[0]);
        const latitude = Number(value[1]);
        if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
            return [longitude, latitude];
        }
        return null;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const [longitude, latitude] = value.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return null;
    }

    return [longitude, latitude];
};

const normalizeRing = (value: unknown): EcoLinearRing => {
    if (!Array.isArray(value)) {
        return [];
    }

    const coordinates = value
        .map(parseCoordinate)
        .filter((coordinate): coordinate is EcoCoordinate => !!coordinate);

    if (coordinates.length < 3) {
        return [];
    }

    const [firstLongitude, firstLatitude] = coordinates[0];
    const [lastLongitude, lastLatitude] = coordinates[coordinates.length - 1];

    if (firstLongitude !== lastLongitude || firstLatitude !== lastLatitude) {
        coordinates.push([firstLongitude, firstLatitude]);
    }

    return coordinates;
};

const normalizePolygonCoordinates = (value: unknown): EcoLinearRing[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map(normalizeRing)
        .filter((ring) => ring.length >= 4);
};

const normalizeGeometry = (geometry: any): EcoPolygonGeometry | null => {
    if (!geometry || typeof geometry !== 'object') {
        return null;
    }

    if (geometry.type === 'Polygon') {
        const coordinates = normalizePolygonCoordinates(geometry.coordinates);
        return coordinates.length ? { type: 'Polygon', coordinates } : null;
    }

    if (geometry.type === 'MultiPolygon') {
        const coordinates = Array.isArray(geometry.coordinates)
            ? geometry.coordinates
                .map(normalizePolygonCoordinates)
                .filter((polygon: EcoLinearRing[]) => polygon.length > 0)
            : [];

        return coordinates.length ? { type: 'MultiPolygon', coordinates } : null;
    }

    return null;
};

const flattenGeometryCoordinates = (geometry: EcoPolygonGeometry): EcoCoordinate[] => {
    if (geometry.type === 'Polygon') {
        return geometry.coordinates.flat();
    }

    return geometry.coordinates.flat(2);
};

const computeBbox = (geometry: EcoPolygonGeometry): [number, number, number, number] => {
    const coordinates = flattenGeometryCoordinates(geometry);
    const longitudes = coordinates.map(([longitude]) => longitude);
    const latitudes = coordinates.map(([, latitude]) => latitude);

    return [
        Math.min(...longitudes),
        Math.min(...latitudes),
        Math.max(...longitudes),
        Math.max(...latitudes),
    ];
};

const computeCenter = (bbox: [number, number, number, number]): EcoCoordinate => ([
    (bbox[0] + bbox[2]) / 2,
    (bbox[1] + bbox[3]) / 2,
]);

const resolvePalette = (category: string) => {
    const normalized = category.toLowerCase();

    if (normalized.includes('градски паркове')) {
        return {
            fillColor: '#4ADE80',
            strokeColor: '#15803D',
        };
    }

    return {
        fillColor: '#86EFAC',
        strokeColor: '#16A34A',
    };
};

const resolveDisplayName = (properties: Record<string, unknown>, category: string, parkId: number) => {
    const candidateKeys = ['name', 'park_name', 'parkName', 'title', 'label', 'ime', 'naimenovanie'];

    for (const key of candidateKeys) {
        const value = properties[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }

    return category.toLowerCase().includes('градски паркове')
        ? `Парк ${parkId}`
        : `Градина ${parkId}`;
};

const normalizeFeature = (feature: any): EcoParksFeature | null => {
    const geometry = normalizeGeometry(feature?.geometry);
    if (!geometry) {
        return null;
    }

    const category = typeof feature?.properties?.type_ === 'string'
        ? feature.properties.type_
        : 'паркове и градини';
    const palette = resolvePalette(category);
    const parkId = Number(feature?.properties?.id ?? 0);
    const bbox = computeBbox(geometry);

    return {
        type: 'Feature',
        id: String(feature?.properties?.id ?? Math.random()),
        geometry,
        properties: {
            parkId,
            displayName: resolveDisplayName(feature?.properties ?? {}, category, parkId),
            zoneCode: String(feature?.properties?.new_end ?? ''),
            category,
            areaSqM: Number(feature?.properties?.area_m ?? 0),
            realization: Number(feature?.properties?.realiz ?? 0),
            hasEntrance: Number(feature?.properties?.entr ?? 0) === 1,
            fillColor: palette.fillColor,
            strokeColor: palette.strokeColor,
            center: computeCenter(bbox),
            bbox,
        },
    };
};

const normalizeCollection = (payload: any): EcoParksFeatureCollection => ({
    type: 'FeatureCollection',
    features: Array.isArray(payload?.features)
        ? payload.features
            .map(normalizeFeature)
            .filter((feature: EcoParksFeature | null): feature is EcoParksFeature => !!feature)
        : [],
});

export const fetchEcoParks = async (): Promise<EcoParksFeatureCollection> => {
    if (cachedParks) {
        return cachedParks;
    }

    if (!parksRequest) {
        parksRequest = fetch(PARKS_DATASET_URL)
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load eco parks dataset: ${response.status}`);
                }

                const payload = await response.json();
                const normalized = normalizeCollection(payload);
                cachedParks = normalized;
                return normalized;
            })
            .finally(() => {
                parksRequest = null;
            });
    }

    return parksRequest;
};

const intersectsBounds = (bbox: [number, number, number, number], bounds: MapBounds) => {
    const [west, south, east, north] = bbox;

    return !(
        east < bounds.west
        || west > bounds.east
        || north < bounds.south
        || south > bounds.north
    );
};

export const filterEcoParksByBounds = (
    collection: EcoParksFeatureCollection | null,
    bounds: MapBounds | null,
): EcoParksFeatureCollection | null => {
    if (!collection) {
        return null;
    }

    if (!bounds) {
        return collection;
    }

    return {
        type: 'FeatureCollection',
        features: collection.features.filter((feature) => intersectsBounds(feature.properties.bbox, bounds)),
    };
};
