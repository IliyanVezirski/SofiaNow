import { Dispatch, MutableRefObject, SetStateAction, useEffect, useRef } from 'react';

interface UseMapPanelOrchestrationParams {
    dismissTransientPanelsToken?: number;
    favoritesRequestToken?: number;
    favoritesVisible: boolean;
    filterPanelVisible?: boolean;
    hasVehicleRoute: boolean;
    isParkingMode: boolean;
    onCloseFilterPanel?: () => void;
    onFavoritesVisibilityChange?: (visible: boolean) => void;
    onSearchVisibilityChange?: (visible: boolean) => void;
    searchModalVisible: boolean;
    searchRequestToken?: number;
    selectedVehicleIdRef: MutableRefObject<string | null>;
    setFavoritesVisible: Dispatch<SetStateAction<boolean>>;
    setSearchModalVisible: Dispatch<SetStateAction<boolean>>;
    setSelectedVehicleId: Dispatch<SetStateAction<string | null>>;
    clearVehicleRoute: () => void;
    closeSchedule: () => void;
    closeSelectedStop: () => void;
}

export const useMapPanelOrchestration = ({
    dismissTransientPanelsToken,
    favoritesRequestToken,
    favoritesVisible,
    filterPanelVisible,
    hasVehicleRoute,
    isParkingMode,
    onCloseFilterPanel,
    onFavoritesVisibilityChange,
    onSearchVisibilityChange,
    searchModalVisible,
    searchRequestToken,
    selectedVehicleIdRef,
    setFavoritesVisible,
    setSearchModalVisible,
    setSelectedVehicleId,
    clearVehicleRoute,
    closeSchedule,
    closeSelectedStop,
}: UseMapPanelOrchestrationParams) => {
    const wasParkingModeRef = useRef(isParkingMode);

    useEffect(() => {
        if (typeof searchRequestToken === 'number' && searchRequestToken > 0) {
            setSearchModalVisible((previous) => {
                const next = !previous;
                if (next) {
                    setFavoritesVisible(false);
                }
                return next;
            });
        }
    }, [searchRequestToken, setFavoritesVisible, setSearchModalVisible]);

    useEffect(() => {
        if (typeof favoritesRequestToken === 'number' && favoritesRequestToken > 0) {
            setSearchModalVisible(false);
            setFavoritesVisible((previous) => !previous);
        }
    }, [favoritesRequestToken, setFavoritesVisible, setSearchModalVisible]);

    useEffect(() => {
        if (typeof dismissTransientPanelsToken === 'number' && dismissTransientPanelsToken > 0) {
            setSearchModalVisible(false);
            setFavoritesVisible(false);
        }
    }, [dismissTransientPanelsToken, setFavoritesVisible, setSearchModalVisible]);

    useEffect(() => {
        onSearchVisibilityChange?.(searchModalVisible);
    }, [onSearchVisibilityChange, searchModalVisible]);

    useEffect(() => {
        onFavoritesVisibilityChange?.(favoritesVisible);
    }, [favoritesVisible, onFavoritesVisibilityChange]);

    useEffect(() => {
        if (filterPanelVisible) {
            setSearchModalVisible(false);
            setFavoritesVisible(false);
        }
    }, [filterPanelVisible, setFavoritesVisible, setSearchModalVisible]);

    useEffect(() => {
        const wasParkingMode = wasParkingModeRef.current;
        wasParkingModeRef.current = isParkingMode;

        if (!isParkingMode || wasParkingMode) {
            return;
        }

        setSearchModalVisible(false);
        setFavoritesVisible(false);
        closeSelectedStop();
        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        closeSchedule();
        if (hasVehicleRoute) {
            clearVehicleRoute();
        }
        onCloseFilterPanel?.();
    }, [
        clearVehicleRoute,
        closeSchedule,
        closeSelectedStop,
        hasVehicleRoute,
        isParkingMode,
        onCloseFilterPanel,
        selectedVehicleIdRef,
        setFavoritesVisible,
        setSearchModalVisible,
        setSelectedVehicleId,
    ]);
};
