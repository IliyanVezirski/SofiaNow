import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import { openExternalDrivingNavigation } from '../../../services/externalNavigation';

type DroppedPin = { latitude: number; longitude: number } | null;

type Params = {
    droppedPin: DroppedPin;
    droppedPinMatchingFavoriteId: string | null;
    favorites: {
        saveFavorite: (name: string, latitude: number, longitude: number) => Promise<void>;
        setFavoritesVisible: Dispatch<SetStateAction<boolean>>;
    };
    location: { coords: { latitude: number; longitude: number } } | null;
    onBuildRouteFromCoordinate?: (dstLat: number, dstLon: number, curLat?: number, curLon?: number) => void;
    schedule: {
        closeSchedule: () => void;
    };
    search: {
        setSearchModalVisible: Dispatch<SetStateAction<boolean>>;
    };
    selectedStop: {
        closeSelectedStop: () => void;
        suppressMapPressUntilRef: MutableRefObject<number>;
    };
    selectedVehicleIdRef: MutableRefObject<string | null>;
    setActiveParkingOverlay: Dispatch<SetStateAction<'payment' | 'cars' | null>>;
    setDroppedPin: Dispatch<SetStateAction<DroppedPin>>;
    setEditRequestFavoriteId: Dispatch<SetStateAction<string | null>>;
    setSelectedParkingLotId: Dispatch<SetStateAction<string | null>>;
    setSelectedVehicleId: Dispatch<SetStateAction<string | null>>;
};

export const useMapPinParkingActions = ({
    droppedPin,
    droppedPinMatchingFavoriteId,
    favorites,
    location,
    onBuildRouteFromCoordinate,
    schedule,
    search,
    selectedStop,
    selectedVehicleIdRef,
    setActiveParkingOverlay,
    setDroppedPin,
    setEditRequestFavoriteId,
    setSelectedParkingLotId,
    setSelectedVehicleId,
}: Params) => {
    const openParkingPaymentPanel = useCallback(() => {
        selectedStop.suppressMapPressUntilRef.current = Date.now() + 400;
        setSelectedParkingLotId(null);
        setActiveParkingOverlay('payment');
    }, [selectedStop, setActiveParkingOverlay, setSelectedParkingLotId]);

    const openParkingCarsPanel = useCallback(() => {
        selectedStop.suppressMapPressUntilRef.current = Date.now() + 400;
        setSelectedParkingLotId(null);
        setActiveParkingOverlay('cars');
    }, [selectedStop, setActiveParkingOverlay, setSelectedParkingLotId]);

    const openParkingLotPanel = useCallback((lotId: string) => {
        selectedStop.suppressMapPressUntilRef.current = Date.now() + 400;
        setActiveParkingOverlay(null);
        setSelectedParkingLotId(lotId);
    }, [selectedStop, setActiveParkingOverlay, setSelectedParkingLotId]);

    const onMapPress = useCallback(() => {
        if (Date.now() < selectedStop.suppressMapPressUntilRef.current) {
            return;
        }

        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        setActiveParkingOverlay(null);
        setSelectedParkingLotId(null);
        selectedStop.closeSelectedStop();
        setDroppedPin(null);
        search.setSearchModalVisible(false);
        favorites.setFavoritesVisible(false);
        schedule.closeSchedule();
    }, [
        favorites,
        schedule,
        search,
        selectedStop,
        selectedVehicleIdRef,
        setActiveParkingOverlay,
        setDroppedPin,
        setSelectedParkingLotId,
        setSelectedVehicleId,
    ]);

    const onMapLongPress = useCallback((event: any) => {
        const coordinates = event?.geometry?.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length < 2) {
            return;
        }

        const longitude = Number(coordinates[0]);
        const latitude = Number(coordinates[1]);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return;
        }

        setDroppedPin({ latitude, longitude });
        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        setActiveParkingOverlay(null);
        setSelectedParkingLotId(null);
        selectedStop.closeSelectedStop();
    }, [selectedStop, selectedVehicleIdRef, setActiveParkingOverlay, setDroppedPin, setSelectedParkingLotId, setSelectedVehicleId]);

    const onGoogleMapLongPress = useCallback((event: any) => {
        const coordinate = event?.nativeEvent?.coordinate;
        const latitude = Number(coordinate?.latitude);
        const longitude = Number(coordinate?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return;
        }

        setDroppedPin({ latitude, longitude });
        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        setActiveParkingOverlay(null);
        setSelectedParkingLotId(null);
        selectedStop.closeSelectedStop();
    }, [selectedStop, selectedVehicleIdRef, setActiveParkingOverlay, setDroppedPin, setSelectedParkingLotId, setSelectedVehicleId]);

    const onParkingDroppedPinNavigate = useCallback(() => {
        if (!droppedPin) {
            return;
        }

        void openExternalDrivingNavigation(droppedPin.latitude, droppedPin.longitude).then((opened) => {
            if (opened) {
                setDroppedPin(null);
            }
        });
    }, [droppedPin, setDroppedPin]);

    const onTransitDroppedPinBuildRoute = useCallback(() => {
        if (!droppedPin || !onBuildRouteFromCoordinate) {
            return;
        }

        onBuildRouteFromCoordinate(
            droppedPin.latitude,
            droppedPin.longitude,
            location?.coords.latitude,
            location?.coords.longitude,
        );
        setDroppedPin(null);
    }, [droppedPin, location, onBuildRouteFromCoordinate, setDroppedPin]);

    const onTransitDroppedPinEditLocation = useCallback(() => {
        if (!droppedPinMatchingFavoriteId) {
            return;
        }

        setEditRequestFavoriteId(droppedPinMatchingFavoriteId);
        favorites.setFavoritesVisible(true);
    }, [droppedPinMatchingFavoriteId, favorites, setEditRequestFavoriteId]);

    const onTransitDroppedPinSaveFavorite = useCallback(() => {
        if (!droppedPin) {
            return;
        }

        void favorites.saveFavorite(
            `Запазена точка ${droppedPin.latitude.toFixed(4)}, ${droppedPin.longitude.toFixed(4)}`,
            droppedPin.latitude,
            droppedPin.longitude,
        );
        setDroppedPin(null);
    }, [droppedPin, favorites, setDroppedPin]);

    return {
        onGoogleMapLongPress,
        onMapLongPress,
        onMapPress,
        onParkingDroppedPinNavigate,
        onTransitDroppedPinBuildRoute: droppedPin && onBuildRouteFromCoordinate ? onTransitDroppedPinBuildRoute : undefined,
        onTransitDroppedPinEditLocation: droppedPinMatchingFavoriteId ? onTransitDroppedPinEditLocation : undefined,
        onTransitDroppedPinSaveFavorite: droppedPin ? onTransitDroppedPinSaveFavorite : undefined,
        openParkingCarsPanel,
        openParkingLotPanel,
        openParkingPaymentPanel,
    };
};
