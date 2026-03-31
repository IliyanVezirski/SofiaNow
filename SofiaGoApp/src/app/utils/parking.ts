import type { ParkingZoneGeometry } from '../../features/parkingZones/types';
import type { MapCameraBounds, ParkingActionKey } from '../types';

export const isParkingActionKey = (value: string): value is ParkingActionKey => (
    value === 'zone' || value === 'pay' || value === 'lots' || value === 'search' || value === 'cars'
);

const collectZoneCoordinates = (geometry: ParkingZoneGeometry): [number, number][] => {
    if (geometry.type === 'Polygon') {
        return geometry.coordinates.flatMap((ring) => ring);
    }

    return geometry.coordinates.flatMap((polygon) => polygon.flatMap((ring) => ring));
};

export const buildZoneCameraBounds = (geometry: ParkingZoneGeometry): MapCameraBounds | null => {
    const points = collectZoneCoordinates(geometry).filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
    if (!points.length) {
        return null;
    }

    const longitudes = points.map((point) => point[0]);
    const latitudes = points.map((point) => point[1]);
    const west = Math.min(...longitudes);
    const east = Math.max(...longitudes);
    const south = Math.min(...latitudes);
    const north = Math.max(...latitudes);

    const latPadding = Math.max((north - south) * 0.14, 0.0012);
    const lonPadding = Math.max((east - west) * 0.14, 0.0016);

    return {
        ne: [east + lonPadding, north + latPadding],
        sw: [west - lonPadding, south - latPadding],
    };
};
