import { Alert } from 'react-native';
import { useCallback, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import { fetchTripDelay } from '../../../services/cgmApi/delays';
import { openExternalWalkingNavigation } from '../../../services/externalNavigation';
import type { Vehicle } from '../../../types/vehicles';
import type { StopEta } from '../../../types/vehicles';
import type { RouteSelection } from '../../../types/routes';

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
    focusOnCoordinate?: (latitude: number, longitude: number) => void;
    suppressCameraSyncUntilRef?: React.MutableRefObject<number>;
    currentLocation?: {
        latitude: number;
        longitude: number;
    } | null;
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
    onBuildRouteFromCoordinate?: (dstLat: number, dstLon: number, curLat?: number, curLon?: number) => void;
    onSetHighlightedRoute?: (route: RouteSelection) => void;
    unlockCamera?: () => void;
    allVehicles: Vehicle[];
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
    focusOnCoordinate,
    suppressCameraSyncUntilRef,
    currentLocation,
    favorites,
    onBuildRouteFromCoordinate,
    onSetHighlightedRoute,
    unlockCamera,
    allVehicles,
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

    const selectVehicleCameraTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const selectVehiclePanelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const selectVehicle = useCallback((vehicle: Vehicle, closeSelectedStop = false) => {
        // Cancel any pending timers from a previous rapid tap
        if (selectVehicleCameraTimerRef.current != null) clearTimeout(selectVehicleCameraTimerRef.current);
        if (selectVehiclePanelTimerRef.current != null) clearTimeout(selectVehiclePanelTimerRef.current);

        // Suppress useMapFocusSync BEFORE closeSelectedStop triggers a re-render,
        // otherwise the sync effect animates to the old stop coordinates
        if (suppressCameraSyncUntilRef) {
            suppressCameraSyncUntilRef.current = Date.now() + 1500;
        }

        if (closeSelectedStop) {
            selectedStop.closeSelectedStop();
        }

        selectedStop.suppressMapPressUntilRef.current = Date.now() + 400;
        selectedVehicleIdRef.current = vehicle.id;

        if (closeSelectedStop) {
            // Delay both camera and panel until after modal close animation (~300ms)
            selectVehicleCameraTimerRef.current = setTimeout(() => {
                focusOnCoordinate?.(vehicle.latitude, vehicle.longitude);
                setSelectedVehicleId(vehicle.id);
                void fetchTripDelay(vehicle.tripId).then((delay) => {
                    setVehicleDelays((previous) => ({ ...previous, [vehicle.id]: delay }));
                });
            }, 400);
        } else {
            // Direct tap: start camera animation immediately (lightweight render)
            focusOnCoordinate?.(vehicle.latitude, vehicle.longitude);
            // Defer heavy panel render so the camera animation
            // starts before the JS thread gets busy with the vehicle info panel
            selectVehiclePanelTimerRef.current = setTimeout(() => {
                setSelectedVehicleId(vehicle.id);
                void fetchTripDelay(vehicle.tripId).then((delay) => {
                    setVehicleDelays((previous) => ({ ...previous, [vehicle.id]: delay }));
                });
            }, 350);
        }
    }, [focusOnCoordinate, selectedStop, selectedVehicleIdRef, setSelectedVehicleId, setVehicleDelays]);

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
                Alert.alert('Добавено', 'Спирката е добавена в Места.');
            } catch {
                Alert.alert('Грешка', 'Неуспешно добавяне на спирката в Моите места.');
            } finally {
                setSelectedStopPlaceSubmitting(false);
            }
        })();
    }, [favorites, selectedStop, selectedStopMatchingFavorite, selectedStopPlaceSubmitting]);

    const handleSelectedStopNavigateAction = useCallback(() => {
        const stop = selectedStop.selectedStop;
        if (!stop) {
            return;
        }

        if (onBuildRouteFromCoordinate) {
            onBuildRouteFromCoordinate(
                stop.latitude,
                stop.longitude,
                currentLocation?.latitude,
                currentLocation?.longitude,
            );
            selectedStop.closeSelectedStop();
            return;
        }

        void (async () => {
            const opened = await openExternalWalkingNavigation(stop.latitude, stop.longitude);
            if (!opened) {
                Alert.alert('Грешка', 'Неуспешно отваряне на навигацията.');
            }
        })();
    }, [currentLocation?.latitude, currentLocation?.longitude, onBuildRouteFromCoordinate, selectedStop.selectedStop]);

    const handleSelectedStopEtaVehicleAction = useCallback((eta: StopEta) => {
        const isNight = eta.line.toUpperCase().startsWith('N');
        onSetHighlightedRoute?.({
            line: eta.line,
            type: isNight ? 'bus' : eta.type,
            isNight,
            routeId: eta.routeId || undefined,
        });
        selectedStop.closeSelectedStop();
    }, [onSetHighlightedRoute, selectedStop]);

    const handleTrackedVehicleSelect = useCallback((vehicle: Vehicle) => {
        selectVehicle(vehicle, true);
    }, [selectVehicle]);

    const handleVehicleSelect = useCallback((vehicle: Vehicle) => {
        selectVehicle(vehicle);
    }, [selectVehicle]);

    const handleVehicleDeselect = useCallback((vehicleId: string) => {
        if (selectedVehicleIdRef.current !== vehicleId) {
            return;
        }

        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        unlockCamera?.();
    }, [selectedVehicleIdRef, setSelectedVehicleId, unlockCamera]);

    const handleVehiclePanelClose = useCallback(() => {
        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        unlockCamera?.();
    }, [selectedVehicleIdRef, setSelectedVehicleId, unlockCamera]);

    const handleVehiclePanelLoadRoute = useCallback(() => {
        if (!selectedVehicle) {
            return;
        }

        void vehicleRoute.loadVehicleRoute(selectedVehicle);
    }, [selectedVehicle, vehicleRoute]);

    return {
        handleSelectedStopPlaceAction,
        handleSelectedStopNavigateAction,
        handleSelectedStopEtaVehicleAction,
        handleTrackedVehicleSelect,
        handleVehicleDeselect,
        handleVehiclePanelClose,
        handleVehiclePanelLoadRoute,
        handleVehicleSelect,
        selectedStopMatchingFavorite,
        selectedStopPlaceSubmitting,
    };
};
