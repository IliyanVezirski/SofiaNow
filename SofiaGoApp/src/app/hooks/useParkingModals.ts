import { useCallback, useMemo, useState } from 'react';

import { parkingZonesFeatureCollection } from '../../features/parkingZones/data/parkingZones.static';
import type { ParkingZoneId } from '../../features/parkingZones/types';
import type { MapCameraBounds, ParkingActionKey } from '../types';
import { DEFAULT_PARKING_ACTION_KEY } from '../types';
import { buildZoneCameraBounds } from '../utils/parking';

export const useParkingModals = () => {
    const [parkingActionKey, setParkingActionKey] = useState<ParkingActionKey>(DEFAULT_PARKING_ACTION_KEY);
    const [parkingZonesVisible, setParkingZonesVisible] = useState(false);
    const [parkingPaymentVisible, setParkingPaymentVisible] = useState(false);
    const [parkingLotsVisible, setParkingLotsVisible] = useState(false);
    const [parkingCarsVisible, setParkingCarsVisible] = useState(false);
    const [parkingDetectedZoneId, setParkingDetectedZoneId] = useState<ParkingZoneId | null>(null);
    const [focusedParkingZoneFeatureId, setFocusedParkingZoneFeatureId] = useState<string | null>(null);
    const [focusParkingZoneBounds, setFocusParkingZoneBounds] = useState<MapCameraBounds | null>(null);
    const [focusParkingZoneToken, setFocusParkingZoneToken] = useState(0);

    const handleShowParkingZoneOnMap = useCallback((zoneFeatureId: string, onActivateMap: () => void) => {
        const selectedZone = parkingZonesFeatureCollection.features.find((feature) => feature.properties.id === zoneFeatureId) ?? null;
        const nextBounds = selectedZone ? buildZoneCameraBounds(selectedZone.geometry) : null;

        if (!nextBounds) {
            return;
        }

        setFocusedParkingZoneFeatureId(zoneFeatureId);
        setFocusParkingZoneBounds(nextBounds);
        setFocusParkingZoneToken((value) => value + 1);
        setParkingActionKey('zone');
        onActivateMap();
        setParkingZonesVisible(false);
    }, []);

    const handleOpenManageCars = useCallback(() => {
        setParkingPaymentVisible(false);
        setParkingActionKey('cars');
        setParkingCarsVisible(true);
    }, []);

    const handleClearFocusedParkingZone = useCallback(() => {
        setFocusedParkingZoneFeatureId(null);
        setFocusParkingZoneBounds(null);
    }, []);

    const hasDetectedParkingZone = !!parkingDetectedZoneId;
    const hasOpenParkingPanel = parkingZonesVisible || parkingPaymentVisible || parkingLotsVisible || parkingCarsVisible;
    const allowParkingActionHighlight = useMemo(
        () => hasDetectedParkingZone || hasOpenParkingPanel,
        [hasDetectedParkingZone, hasOpenParkingPanel],
    );

    return {
        allowParkingActionHighlight,
        focusParkingZoneBounds,
        focusParkingZoneToken,
        focusedParkingZoneFeatureId,
        handleClearFocusedParkingZone,
        handleOpenManageCars,
        handleShowParkingZoneOnMap,
        parkingActionKey,
        parkingCarsVisible,
        parkingDetectedZoneId,
        parkingLotsVisible,
        parkingPaymentVisible,
        parkingZonesVisible,
        setParkingActionKey,
        setParkingCarsVisible,
        setParkingDetectedZoneId,
        setParkingLotsVisible,
        setParkingPaymentVisible,
        setParkingZonesVisible,
    };
};
