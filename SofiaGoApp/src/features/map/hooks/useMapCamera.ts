import { useState, useCallback } from 'react';
import { DEFAULT_CENTER_COORDINATE, createFallbackBounds } from '../constants';
import { MapBounds } from '../../../types/map';

export const useMapCamera = () => {
    const [mapCenterCoordinate, setMapCenterCoordinate] = useState<[number, number]>(DEFAULT_CENTER_COORDINATE);
    const [cameraLockedToInitialView, setCameraLockedToInitialView] = useState(false);
    const [hasInitialCameraTarget, setHasInitialCameraTarget] = useState(false);
    const [tripCameraBounds, setTripCameraBounds] = useState<{ ne: [number, number]; sw: [number, number] } | null>(null);

    const focusOnCoordinate = useCallback((latitude: number, longitude: number) => {
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        setHasInitialCameraTarget(true);
        setCameraLockedToInitialView(true);
        setMapCenterCoordinate([longitude, latitude]);
    }, []);

    const lockCamera = useCallback((latitude: number, longitude: number) => {
        setHasInitialCameraTarget(true);
        setCameraLockedToInitialView(true);
        setMapCenterCoordinate([longitude, latitude]);
    }, []);

    const unlockCamera = useCallback(() => {
        setCameraLockedToInitialView(false);
    }, []);

    return {
        mapCenterCoordinate,
        setMapCenterCoordinate,
        cameraLockedToInitialView,
        setCameraLockedToInitialView,
        hasInitialCameraTarget,
        setHasInitialCameraTarget,
        tripCameraBounds,
        setTripCameraBounds,
        focusOnCoordinate,
        lockCamera,
        unlockCamera,
    };
};
