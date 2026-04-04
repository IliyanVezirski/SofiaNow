import { useCallback, useEffect, useState } from 'react';

import type { MapExperienceMode } from '../../features/map/components/MapModeSwitcher';
import { useEcoPanels } from './useEcoPanels';
import type { RouteSelection } from '../../types/routes';
import {
    DEFAULT_MAP_EXPERIENCE_MODE,
    type MapCameraBounds,
    type BottomTab,
    type OpenedNotification,
} from '../types';
import { useParkingModals } from './useParkingModals';
import { useTransientPanels } from './useTransientPanels';
import { useTripRouting } from './useTripRouting';

export const useAppFlow = () => {
    const parkingModals = useParkingModals();
    const ecoPanels = useEcoPanels();
    const transientPanels = useTransientPanels();
    const [activeTab, setActiveTab] = useState<BottomTab>('map');
    const [openedNotification, setOpenedNotification] = useState<OpenedNotification | null>(null);
    const [selectedRoute, setSelectedRoute] = useState<RouteSelection | null>(null);
    const [mapFiltersVisible, setMapFiltersVisible] = useState(false);
    const [focusStopCoordinate, setFocusStopCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
    const [focusStopId, setFocusStopId] = useState<string | null>(null);
    const [mapExperienceMode, setMapExperienceMode] = useState<MapExperienceMode>(DEFAULT_MAP_EXPERIENCE_MODE);
    const [focusedEcoParkId, setFocusedEcoParkId] = useState<string | null>(null);
    const [focusEcoParkBounds, setFocusEcoParkBounds] = useState<MapCameraBounds | null>(null);
    const [focusEcoParkToken, setFocusEcoParkToken] = useState(0);
    const { activeEcoPanel, setActiveEcoPanel } = ecoPanels;

    useEffect(() => {
        if (mapExperienceMode !== 'eco' && activeEcoPanel) {
            setActiveEcoPanel(null);
        }
    }, [activeEcoPanel, mapExperienceMode, setActiveEcoPanel]);

    useEffect(() => {
        if (activeTab !== 'map' && activeEcoPanel) {
            setActiveEcoPanel(null);
        }
    }, [activeEcoPanel, activeTab, setActiveEcoPanel]);

    useEffect(() => {
        if (mapExperienceMode === 'eco') {
            return;
        }

        setFocusedEcoParkId(null);
        setFocusEcoParkBounds(null);
    }, [mapExperienceMode]);

    const handleFocusStop = useCallback((stopId: string, latitude: number, longitude: number) => {
        setFocusStopId(stopId);
        setFocusStopCoordinate({ latitude, longitude });
        setActiveTab('map');
    }, []);

    const clearFocusedStop = useCallback(() => {
        setFocusStopId(null);
        setFocusStopCoordinate(null);
    }, []);

    const handleShowEcoParkOnMap = useCallback((
        parkId: string,
        bbox: [number, number, number, number],
    ) => {
        setFocusedEcoParkId(parkId);
        setFocusEcoParkBounds({
            ne: [bbox[2], bbox[3]],
            sw: [bbox[0], bbox[1]],
        });
        setFocusEcoParkToken((value) => value + 1);
        setMapExperienceMode('eco');
        setActiveTab('map');
        setMapFiltersVisible(false);
        transientPanels.dismissTransientPanels();
        setActiveEcoPanel(null);
    }, [setActiveEcoPanel, transientPanels]);

    const handleClearFocusedEcoPark = useCallback(() => {
        setFocusedEcoParkId(null);
        setFocusEcoParkBounds(null);
    }, []);

    const tripRouting = useTripRouting({
        favoritesVisible: transientPanels.favoritesVisible,
        onActivateMap: () => setActiveTab('map'),
        onActivatePlanner: () => setActiveTab('planner'),
        onDismissTransientPanels: transientPanels.dismissTransientPanels,
        onHideMapFilters: () => setMapFiltersVisible(false),
        onToggleFavorites: transientPanels.requestToggleFavorites,
    });

    const plannerVisible = activeTab === 'planner';

    return {
        activeTab,
        clearFocusedStop,
        focusEcoParkBounds,
        focusEcoParkToken,
        focusStopCoordinate,
        focusStopId,
        focusedEcoParkId,
        handleClearFocusedEcoPark,
        handleFocusStop,
        handleShowEcoParkOnMap,
        mapExperienceMode,
        mapFiltersVisible,
        openedNotification,
        plannerVisible,
        selectedRoute,
        ...ecoPanels,
        setActiveTab,
        setMapExperienceMode,
        setMapFiltersVisible,
        setOpenedNotification,
        setSelectedRoute,
        ...tripRouting,
        ...parkingModals,
        ...transientPanels,
        handleOpenManageCars: parkingModals.handleOpenManageCars,
        handleShowParkingZoneOnMap: (zoneFeatureId: string) => parkingModals.handleShowParkingZoneOnMap(zoneFeatureId, () => setActiveTab('map')),
    };
};
