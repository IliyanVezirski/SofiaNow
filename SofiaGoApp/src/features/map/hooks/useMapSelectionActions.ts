import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import { fetchLineRouteGeometry, fetchLineRouteGeometryByRouteId, type Stop } from '../../../services/stopsApi';
import type { CentralSearchResult } from '../../search/hooks/useSearch';

type Params = {
    camera: {
        focusOnCoordinate: (latitude: number, longitude: number) => void;
    };
    etasHook: {
        refreshEtasForStop: (stopId: string) => Promise<void>;
    };
    favorites: {
        favoritePlaces: Array<{ id?: string | null; latitude?: number | null; longitude?: number | null }>;
        saveFavorite: (name: string, latitude: number, longitude: number) => Promise<void>;
        setFavoritesVisible: Dispatch<SetStateAction<boolean>>;
    };
    filters: {
        setSelectedLines: Dispatch<SetStateAction<string[]>>;
        setSelectedVehicleTypes: Dispatch<SetStateAction<Array<'bus' | 'tram' | 'trolley' | 'subway'>>>;
    };
    highlightedRouteLine?: string | null;
    routeGeometryLine?: string | null;
    search: {
        setLocationSearchQuery: Dispatch<SetStateAction<string>>;
        setSearchModalVisible: Dispatch<SetStateAction<boolean>>;
    };
    selectedStop: {
        closeSelectedStop: () => void;
        openStopDetails: (stop: Stop) => Promise<void>;
        openRouteStopDetails: (
            routeStop: { id: string; name: string; latitude: number; longitude: number },
            directionName: string,
            annotationId: string,
            stopById: Record<string, Stop>,
            routeGeometryLine?: string,
            highlightedLine?: string,
        ) => Promise<void>;
    };
    selectedVehicleIdRef: MutableRefObject<string | null>;
    setActiveParkingOverlay: Dispatch<SetStateAction<'payment' | 'cars' | null>>;
    setDroppedPin: Dispatch<SetStateAction<{ latitude: number; longitude: number } | null>>;
    setSelectedParkingLotId: Dispatch<SetStateAction<string | null>>;
    setSelectedVehicleId: Dispatch<SetStateAction<string | null>>;
    stopById: Record<string, Stop>;
};

export const useMapSelectionActions = ({
    camera,
    etasHook,
    favorites,
    filters,
    highlightedRouteLine = null,
    routeGeometryLine = null,
    search,
    selectedStop,
    selectedVehicleIdRef,
    setActiveParkingOverlay,
    setDroppedPin,
    setSelectedParkingLotId,
    setSelectedVehicleId,
    stopById,
}: Params) => {
    const onSelectSearchResult = useCallback((result: CentralSearchResult & { kind: 'place' }) => {
        camera.focusOnCoordinate(result.latitude, result.longitude);
        setDroppedPin({ latitude: result.latitude, longitude: result.longitude });
        setActiveParkingOverlay(null);
        setSelectedParkingLotId(null);
        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        selectedStop.closeSelectedStop();
        search.setLocationSearchQuery(result.name);
        search.setSearchModalVisible(false);
    }, [
        camera,
        search,
        selectedStop,
        selectedVehicleIdRef,
        setActiveParkingOverlay,
        setDroppedPin,
        setSelectedParkingLotId,
        setSelectedVehicleId,
    ]);

    const onSelectLineResult = useCallback(async (result: CentralSearchResult & { kind: 'line' }) => {
        const line = result.lineInfo;
        filters.setSelectedLines([line.line]);
        filters.setSelectedVehicleTypes([line.isNight ? 'bus' : line.type]);
        const geometry = line.routeId
            ? await fetchLineRouteGeometryByRouteId(line.routeId)
            : await fetchLineRouteGeometry(line.line, line.type, line.isNight);
        const firstCoordinate = geometry?.directions?.[0]?.coordinates?.[0];
        if (firstCoordinate && firstCoordinate.length >= 2) {
            camera.focusOnCoordinate(firstCoordinate[1], firstCoordinate[0]);
        }
        search.setLocationSearchQuery(line.line);
        search.setSearchModalVisible(false);
    }, [camera, filters, search]);

    const onSelectStopResult = useCallback(async (result: CentralSearchResult & { kind: 'stop' }) => {
        camera.focusOnCoordinate(result.stop.latitude, result.stop.longitude);
        setDroppedPin(null);
        search.setLocationSearchQuery(result.stop.name);
        search.setSearchModalVisible(false);
        await selectedStop.openStopDetails(result.stop);
        await etasHook.refreshEtasForStop(result.stop.id);
    }, [camera, etasHook, search, selectedStop, setDroppedPin]);

    const onSaveFavoriteFromSearch = useCallback(async (name: string, latitude: number, longitude: number) => {
        await favorites.saveFavorite(name, latitude, longitude);
        search.setSearchModalVisible(false);
        favorites.setFavoritesVisible(true);
    }, [favorites, search]);

    const onSelectFavorite = useCallback((favorite: { latitude?: number | null; longitude?: number | null }) => {
        if (!Number.isFinite(favorite.latitude) || !Number.isFinite(favorite.longitude)) {
            return;
        }

        camera.focusOnCoordinate(favorite.latitude, favorite.longitude);
        setDroppedPin({ latitude: favorite.latitude, longitude: favorite.longitude });
        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        selectedStop.closeSelectedStop();
        favorites.setFavoritesVisible(false);
    }, [camera, favorites, selectedStop, selectedVehicleIdRef, setDroppedPin, setSelectedVehicleId]);

    const onRouteStopSelect = useCallback((stop: {
        dirIndex: number;
        id: string;
        stopIndex: number;
        directionName: string;
        latitude: number;
        longitude: number;
        name: string;
    }) => {
        const annotationId = `route-stop-${stop.dirIndex}-${stop.id}-${stop.stopIndex}`;
        void (async () => {
            await selectedStop.openRouteStopDetails(
                stop,
                stop.directionName,
                annotationId,
                stopById,
                routeGeometryLine ?? undefined,
                highlightedRouteLine ?? undefined,
            );
            await etasHook.refreshEtasForStop(stop.id);
        })();
    }, [etasHook, highlightedRouteLine, routeGeometryLine, selectedStop, stopById]);

    return {
        onRouteStopSelect,
        onSaveFavoriteFromSearch,
        onSelectFavorite,
        onSelectLineResult,
        onSelectSearchResult,
        onSelectStopResult,
    };
};
