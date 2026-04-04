export type EcoActionKey = 'parks' | 'bike' | 'playgrounds' | 'air' | 'containers';

export type EcoCoordinate = [number, number];
export type EcoLinearRing = EcoCoordinate[];

export type EcoPolygonGeometry =
    | { type: 'Polygon'; coordinates: EcoLinearRing[] }
    | { type: 'MultiPolygon'; coordinates: EcoLinearRing[][] };

export type EcoParksFeature = {
    type: 'Feature';
    id: string;
    geometry: EcoPolygonGeometry;
    properties: {
        parkId: number;
        displayName: string;
        zoneCode: string;
        category: string;
        areaSqM: number;
        realization: number;
        hasEntrance: boolean;
        fillColor: string;
        strokeColor: string;
        center: EcoCoordinate;
        bbox: [number, number, number, number];
    };
};

export type EcoParksFeatureCollection = {
    type: 'FeatureCollection';
    features: EcoParksFeature[];
};
