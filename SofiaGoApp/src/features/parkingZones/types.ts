export type ParkingZoneId = 'blue' | 'green';

export type GeoCoordinate = [number, number];

export type PolygonCoordinates = GeoCoordinate[][];

export type MultiPolygonCoordinates = GeoCoordinate[][][];

export type ParkingZoneGeometry = {
    type: 'Polygon';
    coordinates: PolygonCoordinates;
} | {
    type: 'MultiPolygon';
    coordinates: MultiPolygonCoordinates;
};

export interface ParkingZoneRule {
    id: ParkingZoneId;
    label: string;
    lineColor: string;
    fillColor: string;
}

export interface ParkingZoneFeatureProperties {
    id: string;
    zoneId: ParkingZoneId;
    name: string;
    displayName: string;
    lineColor: string;
    fillColor: string;
    zoneLabel: string;
}

export interface ParkingZoneFeature {
    type: 'Feature';
    geometry: ParkingZoneGeometry;
    properties: ParkingZoneFeatureProperties;
}

export interface ParkingZoneFeatureCollection {
    type: 'FeatureCollection';
    features: ParkingZoneFeature[];
}

export interface ParkingZoneSourceFeature {
    id: string;
    zoneId: ParkingZoneId;
    name: string;
    geometry: ParkingZoneGeometry;
}
