import { useState, useCallback, useRef } from 'react';
import { DEFAULT_CENTER_COORDINATE, INITIAL_ZOOM_LEVEL, createFallbackBounds } from '../constants';
import { MapBounds } from '../../../types/map';

export const useMapCamera = () => {
    const [mapCenterCoordinate, setMapCenterCoordinate] = useState<[number, number]>(DEFAULT_CENTER_COORDINATE);
    const mapCenterCoordinateRef = useRef<[number, number]>(DEFAULT_CENTER_COORDINATE);
    const cameraLockedToInitialViewRef = useRef(false);
    const hasInitialCameraTargetRef = useRef(false);
    const [tripCameraBounds, setTripCameraBounds] = useState<{ ne: [number, number]; sw: [number, number] } | null>(null);
    const [routeCameraBounds, setRouteCameraBounds] = useState<{ ne: [number, number]; sw: [number, number] } | null>(null);
    const currentZoomRef = useRef<number>(INITIAL_ZOOM_LEVEL);

    // Wrapper that keeps both state and ref in sync
    const updateMapCenterCoordinate = useCallback((coord: [number, number]) => {
        mapCenterCoordinateRef.current = coord;
        setMapCenterCoordinate(coord);
    }, []);

    const focusOnCoordinate = useCallback((latitude: number, longitude: number) => {
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        hasInitialCameraTargetRef.current = true;
        cameraLockedToInitialViewRef.current = true;
        // Update ref immediately so useMapFocusSync reads the correct coordinates;
        // skip setState to avoid a re-render during the imperative camera animation
        mapCenterCoordinateRef.current = [longitude, latitude];
    }, []);

    const lockCamera = useCallback((latitude: number, longitude: number) => {
        hasInitialCameraTargetRef.current = true;
        cameraLockedToInitialViewRef.current = true;
        mapCenterCoordinateRef.current = [longitude, latitude];
        setMapCenterCoordinate([longitude, latitude]);
    }, []);

    const unlockCamera = useCallback(() => {
        cameraLockedToInitialViewRef.current = false;
    }, []);

    return {
        mapCenterCoordinate,
        mapCenterCoordinateRef,
        setMapCenterCoordinate: updateMapCenterCoordinate,
        cameraLockedToInitialViewRef,
        hasInitialCameraTargetRef,
        tripCameraBounds,
        setTripCameraBounds,
        routeCameraBounds,
        setRouteCameraBounds,
        focusOnCoordinate,
        lockCamera,
        unlockCamera,
        currentZoomRef,
    };
};
