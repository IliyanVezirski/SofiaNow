import { useCallback, useState } from 'react';

import type { MapExperienceMode } from '../../features/map/components/MapModeSwitcher';
import type { RouteSelection } from '../../types/routes';
import {
    DEFAULT_MAP_EXPERIENCE_MODE,
    type BottomTab,
    type OpenedNotification,
} from '../types';
import { useParkingModals } from './useParkingModals';
import { useTransientPanels } from './useTransientPanels';
import { useTripRouting } from './useTripRouting';

export const useAppFlow = () => {
    const parkingModals = useParkingModals();
    const transientPanels = useTransientPanels();
    const [activeTab, setActiveTab] = useState<BottomTab>('map');
    const [openedNotification, setOpenedNotification] = useState<OpenedNotification | null>(null);
    const [selectedRoute, setSelectedRoute] = useState<RouteSelection | null>(null);
    const [mapFiltersVisible, setMapFiltersVisible] = useState(false);
    const [focusStopCoordinate, setFocusStopCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
    const [focusStopId, setFocusStopId] = useState<string | null>(null);
    const [mapExperienceMode, setMapExperienceMode] = useState<MapExperienceMode>(DEFAULT_MAP_EXPERIENCE_MODE);

    const handleFocusStop = useCallback((stopId: string, latitude: number, longitude: number) => {
        setFocusStopId(stopId);
        setFocusStopCoordinate({ latitude, longitude });
        setActiveTab('map');
    }, []);

    const clearFocusedStop = useCallback(() => {
        setFocusStopId(null);
        setFocusStopCoordinate(null);
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
        focusStopCoordinate,
        focusStopId,
        handleFocusStop,
        mapExperienceMode,
        mapFiltersVisible,
        openedNotification,
        plannerVisible,
        selectedRoute,
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
