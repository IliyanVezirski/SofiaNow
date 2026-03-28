import { useMemo, useState } from 'react';

import { parkingZonesFeatureCollection, PARKING_ZONE_DATA_GUIDANCE, PARKING_ZONE_RULES } from '../data/parkingZones.static';
import { findParkingZoneIdForCoordinate } from '../utils/geometry';
import { GeoCoordinate } from '../types';

type CoordinateLike = {
    latitude: number;
    longitude: number;
} | null | undefined;

const toGeoCoordinate = (coordinate: CoordinateLike): GeoCoordinate | null => {
    if (!coordinate) return null;
    if (!Number.isFinite(coordinate.latitude) || !Number.isFinite(coordinate.longitude)) return null;
    return [coordinate.longitude, coordinate.latitude];
};

export const useParkingZones = (
    userCoordinate: CoordinateLike,
    droppedPinCoordinate: CoordinateLike,
) => {
    const featureCollection = parkingZonesFeatureCollection;
    const featureCount = featureCollection.features.length;
    const hasData = featureCount > 0;
    const [enabled, setEnabled] = useState(hasData);

    const userZoneId = useMemo(
        () => findParkingZoneIdForCoordinate(featureCollection, toGeoCoordinate(userCoordinate)),
        [userCoordinate?.latitude, userCoordinate?.longitude],
    );

    const droppedPinZoneId = useMemo(
        () => findParkingZoneIdForCoordinate(featureCollection, toGeoCoordinate(droppedPinCoordinate)),
        [droppedPinCoordinate?.latitude, droppedPinCoordinate?.longitude],
    );

    const zoneCounts = useMemo(() => ({
        blue: featureCollection.features.filter((feature) => feature.properties.zoneId === 'blue').length,
        green: featureCollection.features.filter((feature) => feature.properties.zoneId === 'green').length,
    }), []);

    return {
        enabled,
        setEnabled,
        toggleEnabled: () => setEnabled((current) => !current),
        hasData,
        featureCount,
        zoneCounts,
        guidance: PARKING_ZONE_DATA_GUIDANCE,
        visibleFeatureCollection: enabled && hasData ? featureCollection : null,
        userZone: userZoneId ? PARKING_ZONE_RULES[userZoneId] : null,
        droppedPinZone: droppedPinZoneId ? PARKING_ZONE_RULES[droppedPinZoneId] : null,
    };
};
