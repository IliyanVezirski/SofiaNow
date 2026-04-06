import { MutableRefObject, RefObject, useEffect, useRef } from 'react';
import GoogleMapView, { Region } from 'react-native-maps';

import { fetchStopById } from '../../../services/stopsApi';
import { createFallbackBounds } from '../constants';
import { createFocusedBounds, getRegionFromCoordinate, toMapCoordinate } from '../utils/mapScreen';

interface RouteBounds {
    ne: [number, number];
    sw: [number, number];
}

interface FocusCoordinate {
    latitude: number;
    longitude: number;
}

interface LocationLike {
    coords: {
        latitude: number;
        longitude: number;
    };
}

interface UseMapFocusSyncParams {
    bounds: {
        mapBounds: { north: number; south: number; east: number; west: number } | null;
        setMapBounds: (nextBounds: { north: number; south: number; east: number; west: number }) => void;
    };
    camera: {
        cameraLockedToInitialViewRef: RefObject<boolean>;
        focusOnCoordinate: (latitude: number, longitude: number) => void;
        hasInitialCameraTargetRef: RefObject<boolean>;
        lockCamera: (latitude: number, longitude: number) => void;
        mapCenterCoordinateRef: MutableRefObject<[number, number]>;
        routeCameraBounds: RouteBounds | null;
        setRouteCameraBounds: (bounds: RouteBounds | null) => void;
        setTripCameraBounds: (bounds: RouteBounds | null) => void;
        tripCameraBounds: RouteBounds | null;
        unlockCamera: () => void;
    };
    focusParkingZoneBounds?: RouteBounds | null;
    focusParkingZoneToken?: number;
    focusEcoParkBounds?: RouteBounds | null;
    focusEcoParkToken?: number;
    focusStopCoordinate?: FocusCoordinate | null;
    focusStopId?: string | null;
    onFocusStopHandled?: () => void;
    googleInitialRegion: Region;
    googleMapReady: boolean;
    googleMapRef: MutableRefObject<GoogleMapView | null>;
    handledEcoParkFocusTokenRef: MutableRefObject<number>;
    handledParkingZoneFocusTokenRef: MutableRefObject<number>;
    hasAppliedInitialLocationCameraRef: MutableRefObject<boolean>;
    hasFreshLocation: boolean;
    highlightedRoute: unknown;
    isUserFollowLocked: boolean;
    location: LocationLike | null | undefined;
    parkingZonesEnabled: boolean;
    parkingZonesHasData: boolean;
    platformIsAndroid: boolean;
    suppressMapPressUntilRef: MutableRefObject<number>;
    selectedStopIdRef: MutableRefObject<string | null>;
    selectedVehicleIdRef: MutableRefObject<string | null>;
    setDroppedPin: (pin: FocusCoordinate | null) => void;
    setParkingZonesEnabled: (enabled: boolean) => void;
    setSelectedStop: (stop: { id: string; name: string; latitude: number; longitude: number; lines: string[]; directions: string[] }) => void;
    setSelectedStopAnnotationId: (annotationId: string | null) => void;
    setSelectedVehicleId: (vehicleId: string | null) => void;
    setUserLocationVisible: (visible: boolean) => void;
    suppressUserRecenterRegionSyncUntilRef: MutableRefObject<number>;
    userLocationRegionDelta: number;
    refreshEtasForStop: (stopId: string) => Promise<unknown>;
    closeSelectedStop: () => void;
}

const GOOGLE_FIT_EDGE_PADDING = { top: 60, right: 60, bottom: 80, left: 60 };
const FOLLOW_CAMERA_UPDATE_DISTANCE_METERS = 18;
const GOOGLE_FOLLOW_ANIMATION_MS = 420;

const toRadians = (value: number) => (value * Math.PI) / 180;

const getDistanceMeters = (
    leftLatitude: number,
    leftLongitude: number,
    rightLatitude: number,
    rightLongitude: number,
) => {
    const earthRadiusMeters = 6371000;
    const deltaLatitude = toRadians(rightLatitude - leftLatitude);
    const deltaLongitude = toRadians(rightLongitude - leftLongitude);
    const leftLatitudeRadians = toRadians(leftLatitude);
    const rightLatitudeRadians = toRadians(rightLatitude);

    const a = Math.sin(deltaLatitude / 2) ** 2
        + Math.cos(leftLatitudeRadians) * Math.cos(rightLatitudeRadians) * Math.sin(deltaLongitude / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusMeters * c;
};

export const useMapFocusSync = ({
    bounds,
    camera,
    closeSelectedStop,
    focusEcoParkBounds,
    focusEcoParkToken,
    focusParkingZoneBounds,
    focusParkingZoneToken,
    focusStopCoordinate,
    focusStopId,
    onFocusStopHandled,
    googleInitialRegion,
    googleMapReady,
    googleMapRef,
    handledEcoParkFocusTokenRef,
    handledParkingZoneFocusTokenRef,
    hasAppliedInitialLocationCameraRef,
    hasFreshLocation,
    highlightedRoute,
    isUserFollowLocked,
    location,
    parkingZonesEnabled,
    parkingZonesHasData,
    platformIsAndroid,
    refreshEtasForStop,
    suppressMapPressUntilRef,
    selectedStopIdRef,
    selectedVehicleIdRef,
    setDroppedPin,
    setParkingZonesEnabled,
    setSelectedStop,
    setSelectedStopAnnotationId,
    setSelectedVehicleId,
    setUserLocationVisible,
    suppressUserRecenterRegionSyncUntilRef,
    userLocationRegionDelta,
}: UseMapFocusSyncParams) => {
    const lastFollowCameraCoordinateRef = useRef<FocusCoordinate | null>(null);
    const lastAndroidFollowAnimationCoordinateRef = useRef<FocusCoordinate | null>(null);

    useEffect(() => {
        if (
            !location
            || !hasFreshLocation
            || highlightedRoute
            || hasAppliedInitialLocationCameraRef.current
            || camera.hasInitialCameraTargetRef.current
        ) {
            return;
        }

        hasAppliedInitialLocationCameraRef.current = true;
        lastFollowCameraCoordinateRef.current = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
        };
        suppressUserRecenterRegionSyncUntilRef.current = Date.now() + 1800;
        camera.lockCamera(location.coords.latitude, location.coords.longitude);
        bounds.setMapBounds(createFocusedBounds(location.coords.latitude, location.coords.longitude, userLocationRegionDelta));
        setUserLocationVisible(true);
    }, [
        bounds,
        camera,
        hasAppliedInitialLocationCameraRef,
        hasFreshLocation,
        highlightedRoute,
        location,
        setUserLocationVisible,
        suppressUserRecenterRegionSyncUntilRef,
        userLocationRegionDelta,
    ]);

    useEffect(() => {
        if (!isUserFollowLocked || !location) {
            return;
        }

        const nextCoordinate = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
        };
        const lastCoordinate = lastFollowCameraCoordinateRef.current;
        if (
            lastCoordinate
            && getDistanceMeters(
                lastCoordinate.latitude,
                lastCoordinate.longitude,
                nextCoordinate.latitude,
                nextCoordinate.longitude,
            ) < FOLLOW_CAMERA_UPDATE_DISTANCE_METERS
        ) {
            return;
        }

        lastFollowCameraCoordinateRef.current = nextCoordinate;
        camera.lockCamera(location.coords.latitude, location.coords.longitude);
        bounds.setMapBounds(createFocusedBounds(location.coords.latitude, location.coords.longitude, userLocationRegionDelta));
        setUserLocationVisible(true);
    }, [
        bounds,
        camera,
        isUserFollowLocked,
        location?.coords.latitude,
        location?.coords.longitude,
        setUserLocationVisible,
        userLocationRegionDelta,
    ]);

    useEffect(() => {
        if (!focusEcoParkBounds || typeof focusEcoParkToken !== 'number' || focusEcoParkToken <= 0) {
            return;
        }

        if (handledEcoParkFocusTokenRef.current === focusEcoParkToken) {
            return;
        }

        handledEcoParkFocusTokenRef.current = focusEcoParkToken;

        camera.unlockCamera();
        camera.setTripCameraBounds(null);
        camera.setRouteCameraBounds(null);
        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        closeSelectedStop();
        setDroppedPin(null);
        bounds.setMapBounds({
            north: focusEcoParkBounds.ne[1],
            south: focusEcoParkBounds.sw[1],
            east: focusEcoParkBounds.ne[0],
            west: focusEcoParkBounds.sw[0],
        });

        if (platformIsAndroid && googleMapReady && googleMapRef.current) {
            suppressUserRecenterRegionSyncUntilRef.current = Date.now() + 900;
            googleMapRef.current.fitToCoordinates(
                [toMapCoordinate(focusEcoParkBounds.ne), toMapCoordinate(focusEcoParkBounds.sw)],
                { edgePadding: GOOGLE_FIT_EDGE_PADDING, animated: true },
            );
            return;
        }

        camera.setRouteCameraBounds(focusEcoParkBounds);

        const releaseRouteBoundsTimer = setTimeout(() => {
            camera.setRouteCameraBounds(null);
        }, 650);

        return () => {
            clearTimeout(releaseRouteBoundsTimer);
        };
    }, [
        bounds,
        camera,
        closeSelectedStop,
        focusEcoParkBounds,
        focusEcoParkToken,
        googleMapReady,
        googleMapRef,
        handledEcoParkFocusTokenRef,
        platformIsAndroid,
        selectedVehicleIdRef,
        setDroppedPin,
        setSelectedVehicleId,
        suppressUserRecenterRegionSyncUntilRef,
    ]);

    useEffect(() => {
        if (!focusParkingZoneBounds || typeof focusParkingZoneToken !== 'number' || focusParkingZoneToken <= 0) {
            return;
        }

        if (handledParkingZoneFocusTokenRef.current === focusParkingZoneToken) {
            return;
        }

        handledParkingZoneFocusTokenRef.current = focusParkingZoneToken;

        camera.unlockCamera();
        camera.setTripCameraBounds(null);
        camera.setRouteCameraBounds(null);
        setUserLocationVisible(false);
        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        closeSelectedStop();
        setDroppedPin(null);
        bounds.setMapBounds({
            north: focusParkingZoneBounds.ne[1],
            south: focusParkingZoneBounds.sw[1],
            east: focusParkingZoneBounds.ne[0],
            west: focusParkingZoneBounds.sw[0],
        });
        if (parkingZonesHasData && !parkingZonesEnabled) {
            setParkingZonesEnabled(true);
        }

        if (platformIsAndroid && googleMapReady && googleMapRef.current) {
            suppressUserRecenterRegionSyncUntilRef.current = Date.now() + 900;
            googleMapRef.current.fitToCoordinates(
                [toMapCoordinate(focusParkingZoneBounds.ne), toMapCoordinate(focusParkingZoneBounds.sw)],
                { edgePadding: GOOGLE_FIT_EDGE_PADDING, animated: true },
            );
            return;
        }

        camera.setRouteCameraBounds(focusParkingZoneBounds);

        const releaseRouteBoundsTimer = setTimeout(() => {
            camera.setRouteCameraBounds(null);
        }, 650);

        return () => {
            clearTimeout(releaseRouteBoundsTimer);
        };
    }, [
        bounds,
        camera,
        closeSelectedStop,
        focusParkingZoneBounds,
        focusParkingZoneToken,
        googleMapReady,
        googleMapRef,
        handledParkingZoneFocusTokenRef,
        parkingZonesEnabled,
        parkingZonesHasData,
        platformIsAndroid,
        selectedVehicleIdRef,
        setDroppedPin,
        setParkingZonesEnabled,
        setSelectedVehicleId,
        setUserLocationVisible,
        suppressUserRecenterRegionSyncUntilRef,
    ]);

    useEffect(() => {
        if (!platformIsAndroid || !googleMapReady || !googleMapRef.current) {
            return;
        }

        // Skip if another imperative camera action (e.g. focusOnCoordinate) is
        // in progress — prevents fight between two concurrent animateToRegion calls
        if (Date.now() < suppressUserRecenterRegionSyncUntilRef.current) {
            return;
        }

        const activeBounds = camera.tripCameraBounds || camera.routeCameraBounds;
        if (activeBounds) {
            googleMapRef.current.fitToCoordinates(
                [toMapCoordinate(activeBounds.ne), toMapCoordinate(activeBounds.sw)],
                { edgePadding: GOOGLE_FIT_EDGE_PADDING, animated: true },
            );
            return;
        }

        if (isUserFollowLocked && location) {
            const nextCoordinate = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
            };
            const lastAnimatedCoordinate = lastAndroidFollowAnimationCoordinateRef.current;
            if (
                lastAnimatedCoordinate
                && getDistanceMeters(
                    lastAnimatedCoordinate.latitude,
                    lastAnimatedCoordinate.longitude,
                    nextCoordinate.latitude,
                    nextCoordinate.longitude,
                ) < FOLLOW_CAMERA_UPDATE_DISTANCE_METERS
            ) {
                return;
            }

            lastAndroidFollowAnimationCoordinateRef.current = nextCoordinate;
            googleMapRef.current.animateToRegion(
                getRegionFromCoordinate(
                    location.coords.latitude,
                    location.coords.longitude,
                    bounds.mapBounds,
                    userLocationRegionDelta,
                ),
                GOOGLE_FOLLOW_ANIMATION_MS,
            );
            return;
        }

        if (camera.cameraLockedToInitialViewRef.current && camera.hasInitialCameraTargetRef.current) {
            const coord = camera.mapCenterCoordinateRef.current;
            googleMapRef.current.animateToRegion(
                getRegionFromCoordinate(
                    coord[1],
                    coord[0],
                    bounds.mapBounds,
                    userLocationRegionDelta,
                ),
                700,
            );
            return;
        }

        if (!camera.hasInitialCameraTargetRef.current) {
            googleMapRef.current.animateToRegion(googleInitialRegion, 700);
        }
    }, [
        bounds.mapBounds,
        camera,
        googleInitialRegion,
        googleMapReady,
        googleMapRef,
        isUserFollowLocked,
        location?.coords.latitude,
        location?.coords.longitude,
        platformIsAndroid,
        userLocationRegionDelta,
    ]);

    useEffect(() => {
        if (isUserFollowLocked) {
            return;
        }

        lastFollowCameraCoordinateRef.current = null;
        lastAndroidFollowAnimationCoordinateRef.current = null;
    }, [isUserFollowLocked]);

    useEffect(() => {
        if (focusStopCoordinate) {
            camera.focusOnCoordinate(focusStopCoordinate.latitude, focusStopCoordinate.longitude);
            bounds.setMapBounds(createFallbackBounds(focusStopCoordinate.latitude, focusStopCoordinate.longitude));
        }
        if (!focusStopCoordinate || !focusStopId) {
            return;
        }

        let cancelled = false;
        onFocusStopHandled?.();

        void (async () => {
            suppressMapPressUntilRef.current = Date.now() + 400;
            selectedStopIdRef.current = focusStopId;
            setSelectedStopAnnotationId(`stop-${focusStopId}`);
            selectedVehicleIdRef.current = null;
            setSelectedVehicleId(null);
            setDroppedPin(null);

            const resolved = await fetchStopById(focusStopId);
            if (cancelled) {
                return;
            }

            if (resolved) {
                setSelectedStop(resolved);
            } else {
                setSelectedStop({
                    id: focusStopId,
                    name: focusStopId,
                    latitude: focusStopCoordinate.latitude,
                    longitude: focusStopCoordinate.longitude,
                    lines: [],
                    directions: [],
                });
            }
            await refreshEtasForStop(focusStopId);
        })();

        return () => {
            cancelled = true;
        };
    }, [
        bounds,
        camera,
        focusStopCoordinate,
        focusStopId,
        onFocusStopHandled,
        refreshEtasForStop,
        selectedStopIdRef,
        selectedVehicleIdRef,
        setDroppedPin,
        setSelectedStop,
        setSelectedStopAnnotationId,
        setSelectedVehicleId,
        suppressMapPressUntilRef,
    ]);
};
