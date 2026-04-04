import { Alert } from 'react-native';
import { useCallback, useMemo, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import { fetchTripDelay } from '../../../services/cgmApi/delays';
import type { Vehicle } from '../../../types/vehicles';

type FavoritePlaceLike = {
    id?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    name?: string | null;
    selectedStopId?: string | null;
};

type SelectedStopLike = {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    lines: string[];
};

type Params = {
    favorites: {
        favoritePlaces: FavoritePlaceLike[];
        removeFavorite: (favoriteId: string) => Promise<unknown>;
        createFavorite: (input: {
            name: string;
            latitude: number;
            longitude: number;
            selectedStopId?: string | null;
            selectedStopName?: string | null;
            selectedLines?: Array<{ line: string; enabled: boolean; notificationsEnabled: boolean }>;
        }) => Promise<unknown>;
    };
    selectedStop: {
        selectedStop: SelectedStopLike | null;
        closeSelectedStop: () => void;
        suppressMapPressUntilRef: MutableRefObject<number>;
    };
    selectedVehicle: Vehicle | null;
    selectedVehicleIdRef: MutableRefObject<string | null>;
    setSelectedVehicleId: Dispatch<SetStateAction<string | null>>;
    setVehicleDelays: Dispatch<SetStateAction<Record<string, number | null>>>;
    vehicleRoute: {
        loadVehicleRoute: (vehicle: Vehicle) => Promise<unknown>;
    };
};

export const useMapStopVehicleActions = ({
    favorites,
    selectedStop,
    selectedVehicle,
    selectedVehicleIdRef,
    setSelectedVehicleId,
    setVehicleDelays,
    vehicleRoute,
}: Params) => {
    const parseStopIdParts = (value?: string | null) => (
        String(value || '')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
    );

    const stopIdsMatch = (left?: string | null, right?: string | null) => {
        const leftParts = parseStopIdParts(left);
        const rightParts = parseStopIdParts(right);

        if (!leftParts.length || !rightParts.length) {
            return false;
        }

        const rightSet = new Set(rightParts);
        return leftParts.some((part) => rightSet.has(part));
    };

    const stopCoordinatesMatch = (
        favorite: FavoritePlaceLike,
        stop: SelectedStopLike,
        epsilon = 0.00001,
    ) => (
        Number.isFinite(favorite.latitude)
        && Number.isFinite(favorite.longitude)
        && Math.abs(Number(favorite.latitude) - stop.latitude) <= epsilon
        && Math.abs(Number(favorite.longitude) - stop.longitude) <= epsilon
    );

    const selectedStopMatchingFavorite = useMemo(() => {
        const stop = selectedStop.selectedStop;
        if (!stop) {
            return null;
        }

        return favorites.favoritePlaces.find((favorite) => (
            stopIdsMatch(favorite.selectedStopId, stop.id)
            || stopCoordinatesMatch(favorite, stop)
        )) ?? null;
    }, [favorites.favoritePlaces, selectedStop.selectedStop]);

    const [selectedStopPlaceSubmitting, setSelectedStopPlaceSubmitting] = useState(false);

    const handleSelectedStopPlaceAction = useCallback(() => {
        const stop = selectedStop.selectedStop;
        if (!stop || selectedStopPlaceSubmitting) {
            return;
        }

        const selectedLines = Array.from(new Set(
            stop.lines
                .map((line) => String(line || '').trim().toUpperCase())
                .filter(Boolean),
        )).map((line) => ({
            line,
            enabled: true,
            notificationsEnabled: false,
        }));

        void (async () => {
            setSelectedStopPlaceSubmitting(true);

            try {
                if (selectedStopMatchingFavorite?.id) {
                    await favorites.removeFavorite(selectedStopMatchingFavorite.id);
                    return;
                }

                await favorites.createFavorite({
                    name: stop.name,
                    latitude: stop.latitude,
                    longitude: stop.longitude,
                    selectedStopId: stop.id,
                    selectedStopName: stop.name,
                    selectedLines,
                });
            } catch {
                Alert.alert('Грешка', 'Неуспешно добавяне на спирката в Моите места.');
            } finally {
                setSelectedStopPlaceSubmitting(false);
            }
        })();
    }, [favorites, selectedStop, selectedStopMatchingFavorite, selectedStopPlaceSubmitting]);

    const handleTrackedVehicleSelect = useCallback((vehicle: Vehicle) => {
        selectedStop.suppressMapPressUntilRef.current = Date.now() + 400;
        selectedVehicleIdRef.current = vehicle.id;
        setSelectedVehicleId(vehicle.id);
        selectedStop.closeSelectedStop();
        void fetchTripDelay(vehicle.tripId).then((delay) => {
            setVehicleDelays((previous) => ({ ...previous, [vehicle.id]: delay }));
        });
    }, [selectedStop, selectedVehicleIdRef, setSelectedVehicleId, setVehicleDelays]);

    const handleVehicleSelect = useCallback((vehicle: Vehicle) => {
        selectedStop.suppressMapPressUntilRef.current = Date.now() + 400;
        selectedVehicleIdRef.current = vehicle.id;
        setSelectedVehicleId(vehicle.id);
        void fetchTripDelay(vehicle.tripId).then((delay) => {
            setVehicleDelays((previous) => ({ ...previous, [vehicle.id]: delay }));
        });
    }, [selectedStop, selectedVehicleIdRef, setSelectedVehicleId, setVehicleDelays]);

    const handleVehicleDeselect = useCallback((vehicleId: string) => {
        if (selectedVehicleIdRef.current !== vehicleId) {
            return;
        }

        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
    }, [selectedVehicleIdRef, setSelectedVehicleId]);

    const handleVehiclePanelClose = useCallback(() => {
        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
    }, [selectedVehicleIdRef, setSelectedVehicleId]);

    const handleVehiclePanelLoadRoute = useCallback(() => {
        if (!selectedVehicle) {
            return;
        }

        void vehicleRoute.loadVehicleRoute(selectedVehicle);
    }, [selectedVehicle, vehicleRoute]);

    return {
        handleSelectedStopPlaceAction,
        handleTrackedVehicleSelect,
        handleVehicleDeselect,
        handleVehiclePanelClose,
        handleVehiclePanelLoadRoute,
        handleVehicleSelect,
        selectedStopMatchingFavorite,
        selectedStopPlaceSubmitting,
    };
};
