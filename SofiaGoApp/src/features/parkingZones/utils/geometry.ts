import { GeoCoordinate, ParkingZoneFeature, ParkingZoneFeatureCollection, ParkingZoneId } from '../types';

const isPointInsideRing = (point: GeoCoordinate, ring: GeoCoordinate[]) => {
    if (ring.length < 3) return false;

    const [pointLon, pointLat] = point;
    let isInside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [lonA, latA] = ring[i];
        const [lonB, latB] = ring[j];
        const intersects = ((latA > pointLat) !== (latB > pointLat))
            && (pointLon < ((lonB - lonA) * (pointLat - latA)) / ((latB - latA) || Number.EPSILON) + lonA);

        if (intersects) {
            isInside = !isInside;
        }
    }

    return isInside;
};

const isPointInsidePolygon = (point: GeoCoordinate, coordinates: GeoCoordinate[][]) => {
    if (!coordinates.length) return false;
    if (!isPointInsideRing(point, coordinates[0])) return false;

    for (let holeIndex = 1; holeIndex < coordinates.length; holeIndex += 1) {
        if (isPointInsideRing(point, coordinates[holeIndex])) {
            return false;
        }
    }

    return true;
};

export const doesZoneContainCoordinate = (feature: ParkingZoneFeature, coordinate: GeoCoordinate) => {
    if (feature.geometry.type === 'Polygon') {
        return isPointInsidePolygon(coordinate, feature.geometry.coordinates);
    }

    return feature.geometry.coordinates.some((polygon) => isPointInsidePolygon(coordinate, polygon));
};

export const findParkingZoneIdForCoordinate = (
    collection: ParkingZoneFeatureCollection,
    coordinate: GeoCoordinate | null,
): ParkingZoneId | null => {
    if (!coordinate) return null;

    for (const feature of collection.features) {
        if (doesZoneContainCoordinate(feature, coordinate)) {
            return feature.properties.zoneId;
        }
    }

    return null;
};
