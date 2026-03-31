import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

type PreviousViewport = {
    bounds: { north: number; south: number; east: number; west: number } | null;
    center: [number, number];
    cameraLockedToInitialView: boolean;
    hasInitialCameraTarget: boolean;
    userLocationVisible: boolean;
    isUserFollowLocked: boolean;
};

type Params = {
    bounds: {
        setMapBounds: (bounds: { north: number; south: number; east: number; west: number }) => void;
    };
    camera: {
        setTripCameraBounds: (value: { ne: [number, number]; sw: [number, number] } | null) => void;
        setRouteCameraBounds: (value: { ne: [number, number]; sw: [number, number] } | null) => void;
        setHasInitialCameraTarget: (value: boolean) => void;
        setCameraLockedToInitialView: (value: boolean) => void;
        setMapCenterCoordinate: (value: [number, number]) => void;
        unlockCamera: () => void;
    };
    onClearFocusedParkingZone?: () => void;
    onClearTripRoute?: () => void;
    restoreRouteBoundsTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
    setIsUserFollowLocked: Dispatch<SetStateAction<boolean>>;
    setUserLocationVisible: Dispatch<SetStateAction<boolean>>;
    suppressUserRecenterRegionSyncUntilRef: MutableRefObject<number>;
    tripRouteViewportSnapshotRef: MutableRefObject<PreviousViewport | null>;
};

export const useMapOverlayActions = ({
    bounds,
    camera,
    onClearFocusedParkingZone,
    onClearTripRoute,
    restoreRouteBoundsTimerRef,
    setIsUserFollowLocked,
    setUserLocationVisible,
    suppressUserRecenterRegionSyncUntilRef,
    tripRouteViewportSnapshotRef,
}: Params) => {
    const handleClearShownTripRoute = useCallback(() => {
        const previousViewport = tripRouteViewportSnapshotRef.current;

        camera.setTripCameraBounds(null);

        if (restoreRouteBoundsTimerRef.current) {
            clearTimeout(restoreRouteBoundsTimerRef.current);
            restoreRouteBoundsTimerRef.current = null;
        }

        if (previousViewport) {
            suppressUserRecenterRegionSyncUntilRef.current = Date.now() + 900;
            camera.setHasInitialCameraTarget(previousViewport.hasInitialCameraTarget);
            camera.setCameraLockedToInitialView(previousViewport.cameraLockedToInitialView);
            camera.setMapCenterCoordinate(previousViewport.center);
            setUserLocationVisible(previousViewport.userLocationVisible);
            setIsUserFollowLocked(previousViewport.isUserFollowLocked);

            if (previousViewport.bounds) {
                bounds.setMapBounds(previousViewport.bounds);
                camera.setRouteCameraBounds({
                    ne: [previousViewport.bounds.east, previousViewport.bounds.north],
                    sw: [previousViewport.bounds.west, previousViewport.bounds.south],
                });
                restoreRouteBoundsTimerRef.current = setTimeout(() => {
                    camera.setRouteCameraBounds(null);
                    restoreRouteBoundsTimerRef.current = null;
                }, 650);
            } else if (!previousViewport.cameraLockedToInitialView) {
                camera.unlockCamera();
            }
        }

        tripRouteViewportSnapshotRef.current = null;
        onClearTripRoute?.();
    }, [
        bounds,
        camera,
        onClearTripRoute,
        restoreRouteBoundsTimerRef,
        setIsUserFollowLocked,
        setUserLocationVisible,
        suppressUserRecenterRegionSyncUntilRef,
        tripRouteViewportSnapshotRef,
    ]);

    const handleClearFocusedParkingZone = useCallback(() => {
        camera.setRouteCameraBounds(null);
        camera.setTripCameraBounds(null);
        camera.unlockCamera();
        onClearFocusedParkingZone?.();
    }, [camera, onClearFocusedParkingZone]);

    return {
        handleClearFocusedParkingZone,
        handleClearShownTripRoute,
    };
};
