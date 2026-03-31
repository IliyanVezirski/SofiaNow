import type { Region } from 'react-native-maps';

import type { VehicleType } from '../../../services/transitUtils';
import { DEFAULT_BOUNDS_DELTA, DEFAULT_CENTER_COORDINATE } from '../constants';

export const toMapCoordinate = ([longitude, latitude]: [number, number]) => ({ latitude, longitude });

export const createCirclePolygon = (centerLon: number, centerLat: number, radiusMeters: number, label: string) => {
    const coords: [number, number][] = [];
    const km = radiusMeters / 1000;
    const distanceX = km / (111.32 * Math.cos(centerLat * Math.PI / 180));
    const distanceY = km / 110.574;

    for (let i = 0; i < 64; i++) {
        const theta = (i / 64) * (2 * Math.PI);
        const x = distanceX * Math.cos(theta);
        const y = distanceY * Math.sin(theta);
        coords.push([centerLon + x, centerLat + y]);
    }

    coords.push([...coords[0]]);

    const labelPoints = [
        { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [centerLon, centerLat + distanceY] }, properties: { customType: 'circle_label', label } },
        { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [centerLon, centerLat - distanceY] }, properties: { customType: 'circle_label', label } },
        { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [centerLon + distanceX, centerLat] }, properties: { customType: 'circle_label', label } },
        { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [centerLon - distanceX, centerLat] }, properties: { customType: 'circle_label', label } },
    ];

    return {
        polygon: { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: coords }, properties: { customType: 'circle_line' } },
        labelPoints,
    };
};

export const getRegionFromBounds = (
    bounds: { ne: [number, number]; sw: [number, number] } | null | undefined,
    fallback: [number, number] = DEFAULT_CENTER_COORDINATE,
): Region => {
    if (!bounds) {
        return {
            latitude: fallback[1],
            longitude: fallback[0],
            latitudeDelta: DEFAULT_BOUNDS_DELTA,
            longitudeDelta: DEFAULT_BOUNDS_DELTA,
        };
    }

    const latitudeDelta = Math.max(Math.abs(bounds.ne[1] - bounds.sw[1]), DEFAULT_BOUNDS_DELTA / 3);
    const longitudeDelta = Math.max(Math.abs(bounds.ne[0] - bounds.sw[0]), DEFAULT_BOUNDS_DELTA / 3);

    return {
        latitude: (bounds.ne[1] + bounds.sw[1]) / 2,
        longitude: (bounds.ne[0] + bounds.sw[0]) / 2,
        latitudeDelta,
        longitudeDelta,
    };
};

export const getRegionFromCoordinate = (
    latitude: number,
    longitude: number,
    currentBounds: { north: number; south: number; east: number; west: number } | null,
    preferredDelta?: number,
): Region => ({
    latitude,
    longitude,
    latitudeDelta: preferredDelta ?? (currentBounds ? Math.max(Math.abs(currentBounds.north - currentBounds.south), DEFAULT_BOUNDS_DELTA / 3) : DEFAULT_BOUNDS_DELTA),
    longitudeDelta: preferredDelta ?? (currentBounds ? Math.max(Math.abs(currentBounds.east - currentBounds.west), DEFAULT_BOUNDS_DELTA / 3) : DEFAULT_BOUNDS_DELTA),
});

export const createFocusedBounds = (latitude: number, longitude: number, delta: number) => ({
    north: latitude + delta,
    south: latitude - delta,
    east: longitude + delta,
    west: longitude - delta,
});

export const getBoundsFromRegion = (region: Region) => ({
    north: region.latitude + region.latitudeDelta / 2,
    south: region.latitude - region.latitudeDelta / 2,
    east: region.longitude + region.longitudeDelta / 2,
    west: region.longitude - region.longitudeDelta / 2,
});

export const getPolygonRings = (geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any }) => {
    if (geometry.type === 'Polygon') {
        return Array.isArray(geometry.coordinates?.[0]) ? [geometry.coordinates[0] as [number, number][]] : [];
    }

    if (!Array.isArray(geometry.coordinates)) {
        return [] as [number, number][][];
    }

    return geometry.coordinates
        .map((polygon: any) => (Array.isArray(polygon?.[0]) ? polygon[0] as [number, number][] : null))
        .filter((ring: [number, number][] | null): ring is [number, number][] => !!ring && ring.length >= 3);
};

export const getGeometryCenter = (geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any }) => {
    const rings = getPolygonRings(geometry);
    const coordinates = rings.flat();

    if (!coordinates.length) {
        return null;
    }

    const totals = coordinates.reduce((accumulator, [longitude, latitude]) => ({
        longitude: accumulator.longitude + longitude,
        latitude: accumulator.latitude + latitude,
    }), { longitude: 0, latitude: 0 });

    return {
        longitude: totals.longitude / coordinates.length,
        latitude: totals.latitude / coordinates.length,
    };
};

export const getStopTypeInfo = (type: VehicleType) => {
    switch (type) {
        case 'bus':
            return { color: '#DC2626' };
        case 'trolley':
            return { color: '#2563EB' };
        case 'tram':
            return { color: '#F97316' };
        default:
            return { color: '#94A3B8' };
    }
};
