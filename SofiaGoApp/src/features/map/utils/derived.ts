import { CATEGORY_META } from '../../parkingZones/components/ParkingLotsModal';
import type { ParkingZoneFeatureCollection } from '../../parkingZones/types';
import type { ParkingLot } from '../../parkingZones/types/parkingLots';
import type { TripRouteGeoJSON } from '../../tripPlanner/utils/routeGeoJson';
import { createCirclePolygon, getRegionFromCoordinate, toMapCoordinate } from './mapScreen';
import { hasFavoriteCoordinates } from '../../../services/places/normalization';
import type { FavoritePlace } from '../../../services/places/types';
import type { LiveParkingLot } from '../../../services/parking';
import type { Stop } from '../../../services/stopsApi';
import type { Vehicle } from '../../../types/vehicles';
import { type VehicleType } from '../../../services/transitUtils';

const PARKING_LOT_LABELS: Record<string, string> = {
    buffer: 'БП',
    underground: 'ПП',
    'multi-storey': 'МП',
    airport: '✈',
    surface: 'П',
    commercial: 'ТП',
    impound: 'НП',
    private: 'ЧП',
};

type LocationLike = {
    coords: {
        latitude: number;
        longitude: number;
        accuracy?: number | null;
    };
    timestamp: number;
} | null | undefined;

type CurrentLocation = { latitude: number; longitude: number } | null;

export interface GoogleWalkingRadiusLabel {
    key: string;
    label: string;
    coordinate: { latitude: number; longitude: number };
}

export type RenderedStopMarkerKind = VehicleType | 'night';

export interface RenderedStopMarker {
    id: string;
    latitude: number;
    longitude: number;
    markerKinds: RenderedStopMarkerKind[];
    sourceStop: Stop;
}

const STOP_MARKER_KIND_ORDER: RenderedStopMarkerKind[] = ['subway', 'tram', 'trolley', 'bus', 'night'];

export const buildRenderedStopMarkers = (
    stops: Stop[],
    stableMarkerKindsByStopId: Record<string, RenderedStopMarkerKind[]>,
): RenderedStopMarker[] => stops.map((stop) => {
    const markerKinds = stableMarkerKindsByStopId[stop.id]?.length
        ? stableMarkerKindsByStopId[stop.id]
        : ((stop.vehicleTypes?.length ? stop.vehicleTypes : ['bus']) as RenderedStopMarkerKind[]);
    const orderedKinds = Array.from(new Set(markerKinds)).sort(
        (left, right) => STOP_MARKER_KIND_ORDER.indexOf(left) - STOP_MARKER_KIND_ORDER.indexOf(right),
    );
    return {
        id: `stop-${stop.id}`,
        latitude: stop.latitude,
        longitude: stop.longitude,
        markerKinds: orderedKinds,
        sourceStop: stop,
    };
});

export const getCurrentLocation = (location: LocationLike): CurrentLocation => (
    location
        ? { latitude: location.coords.latitude, longitude: location.coords.longitude }
        : null
);

export const createUserLocationGeoJSON = (location: LocationLike) => {
    if (!location) {
        return null;
    }

    return {
        type: 'Feature' as const,
        geometry: {
            type: 'Point' as const,
            coordinates: [location.coords.longitude, location.coords.latitude] as [number, number],
        },
        properties: {},
    };
};

export const createWalkingRadiiGeoJSON = (location: LocationLike) => {
    if (!location) {
        return null;
    }

    const longitude = location.coords.longitude;
    const latitude = location.coords.latitude;
    const walk5 = createCirclePolygon(longitude, latitude, 208, '5 мин');
    const walk10 = createCirclePolygon(longitude, latitude, 416, '10 мин');
    const walk15 = createCirclePolygon(longitude, latitude, 625, '15 мин');

    return {
        type: 'FeatureCollection' as const,
        features: [
            walk5.polygon,
            walk10.polygon,
            walk15.polygon,
            ...walk5.labelPoints,
            ...walk10.labelPoints,
            ...walk15.labelPoints,
        ],
    };
};

export const createGoogleWalkingRadiusLabels = (location: LocationLike): GoogleWalkingRadiusLabel[] => {
    if (!location) {
        return [];
    }

    const longitude = location.coords.longitude;
    const latitude = location.coords.latitude;
    const walk5 = createCirclePolygon(longitude, latitude, 208, '5 мин');
    const walk10 = createCirclePolygon(longitude, latitude, 416, '10 мин');
    const walk15 = createCirclePolygon(longitude, latitude, 625, '15 мин');

    return [
        { key: 'walk-label-5', label: '5 мин', coordinate: toMapCoordinate(walk5.labelPoints[0].geometry.coordinates as [number, number]) },
        { key: 'walk-label-10', label: '10 мин', coordinate: toMapCoordinate(walk10.labelPoints[2].geometry.coordinates as [number, number]) },
        { key: 'walk-label-15', label: '15 мин', coordinate: toMapCoordinate(walk15.labelPoints[3].geometry.coordinates as [number, number]) },
    ];
};

export const getSelectedStopLines = (selectedStopLines: string[] | null | undefined) => (
    (selectedStopLines ?? [])
        .map((line) => String(line || '').trim().toUpperCase())
        .filter(Boolean)
);

export const getDroppedPinFavoriteState = (
    droppedPin: { latitude: number; longitude: number } | null,
    favoritePlaces: FavoritePlace[],
) => {
    if (!droppedPin) {
        return { alreadySaved: false, matchingFavoriteId: null as string | null };
    }

    const latitude = droppedPin.latitude.toFixed(6);
    const longitude = droppedPin.longitude.toFixed(6);
    const matchingFavorite = favoritePlaces.find((favorite) => (
        hasFavoriteCoordinates(favorite)
        && favorite.latitude!.toFixed(6) === latitude
        && favorite.longitude!.toFixed(6) === longitude
    )) ?? null;

    return {
        alreadySaved: !!matchingFavorite,
        matchingFavoriteId: matchingFavorite?.id ?? null,
    };
};

export const getHasActiveRouteOverlay = (
    routeGeometry: object | null,
    tripPlannerRoute: TripRouteGeoJSON | null | undefined,
    hasVehicleRoute: boolean,
    vehicleRouteStopCount: number,
) => !!routeGeometry || !!(tripPlannerRoute && tripPlannerRoute.features.length > 0) || hasVehicleRoute || vehicleRouteStopCount > 0;

export const getPreferredInitialCenterCoordinate = (
    location: LocationLike,
    fallbackCoordinate: [number, number],
): [number, number] => (
    location
        ? [location.coords.longitude, location.coords.latitude]
        : fallbackCoordinate
);

export const getHasReliableInitialLocation = (location: LocationLike) => {
    if (!location) {
        return false;
    }

    const locationAgeMs = Math.max(0, Date.now() - location.timestamp);
    const locationAccuracy = location.coords.accuracy ?? Number.POSITIVE_INFINITY;

    return locationAgeMs <= 1000 * 60 * 15 || locationAccuracy <= 1500;
};

export const getShouldShowParkingZoneLabels = (collection: ParkingZoneFeatureCollection | null | undefined) => (
    (collection?.features.length ?? 0) <= 1
);

export const getGoogleInitialRegion = (
    preferredInitialCenterCoordinate: [number, number],
    mapBounds: { north: number; south: number; east: number; west: number } | null,
    userLocationRegionDelta: number,
) => getRegionFromCoordinate(
    preferredInitialCenterCoordinate[1],
    preferredInitialCenterCoordinate[0],
    mapBounds,
    userLocationRegionDelta,
);

export const getLiveLines = (vehicles: Vehicle[]) => new Set(vehicles.map((vehicle) => vehicle.line));

export const getVisibleSearchResults = <T extends { kind?: string }>(results: T[], isParkingMode: boolean) => (
    isParkingMode
        ? results.filter((result) => result.kind === 'place')
        : results
);

export const getSelectedParkingLot = (parkingLots: ParkingLot[], selectedParkingLotId: string | null) => (
    selectedParkingLotId
        ? parkingLots.find((lot) => lot.id === selectedParkingLotId) ?? null
        : null
);

export const createParkingLotsGeoJSON = (parkingLots: ParkingLot[], selectedParkingLotId: string | null) => ({
    type: 'FeatureCollection' as const,
    features: parkingLots.map((lot) => ({
        type: 'Feature' as const,
        id: lot.id,
        geometry: {
            type: 'Point' as const,
            coordinates: [lot.longitude, lot.latitude] as [number, number],
        },
        properties: {
            lotId: lot.id,
            label: PARKING_LOT_LABELS[lot.category] ?? 'P',
            color: CATEGORY_META[lot.category]?.color ?? '#64748B',
            isSelected: lot.id === selectedParkingLotId ? 1 : 0,
        },
    })),
});

export const getSelectedLotLiveData = (
    selectedParkingLot: ParkingLot | null,
    liveLots: LiveParkingLot[],
) => {
    if (!selectedParkingLot || !liveLots.length) {
        return null;
    }

    return liveLots.find((lot) =>
        Math.abs(lot.latitude - selectedParkingLot.latitude) < 0.002
        && Math.abs(lot.longitude - selectedParkingLot.longitude) < 0.002,
    ) ?? null;
};

export const getSelectedVehicle = <T extends Vehicle>(
    renderedDisplayVehicles: T[],
    selectedVehicleId: string | null,
) => (
    selectedVehicleId
        ? renderedDisplayVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null
        : null
);

export const getSelectedVehicleStopName = (
    selectedVehicle: Vehicle | null,
    stopNameByIdMap: Record<string, string>,
    searchableStopNameByIdMap: Record<string, string>,
) => {
    if (!selectedVehicle?.stopId) {
        return 'н/д';
    }

    return stopNameByIdMap[selectedVehicle.stopId]
        || searchableStopNameByIdMap[selectedVehicle.stopId]
        || selectedVehicle.stopId;
};
