import { useMemo } from 'react';

import { buildEcoHomeActionButtons, buildParkingHomeActionButtons, buildTransitHomeActionButtons } from '../homeActions';
import type { HomeActionButton, ParkingActionKey } from '../types';
import type { EcoActionKey } from '../../features/eco/types';
import type { useAppFlow } from './useAppFlow';

type AppFlowState = ReturnType<typeof useAppFlow>;

export const useHomeActions = (appFlow: Pick<
    AppFlowState,
    | 'activeTab'
    | 'allowParkingActionHighlight'
    | 'activeEcoPanel'
    | 'allowEcoActionHighlight'
    | 'dismissTransientPanels'
    | 'mapExperienceMode'
    | 'parkingActionKey'
    | 'requestOpenSearch'
    | 'requestToggleFavorites'
    | 'searchVisible'
    | 'setActiveTab'
    | 'setActiveEcoPanel'
    | 'setMapFiltersVisible'
    | 'setParkingActionKey'
    | 'setParkingCarsVisible'
    | 'setParkingLotsVisible'
    | 'setParkingPaymentVisible'
    | 'setParkingZonesVisible'
>): HomeActionButton[] => {
    const transitHomeActionButtons = useMemo(() => buildTransitHomeActionButtons({
        setActiveTab: appFlow.setActiveTab,
        setMapFiltersVisible: appFlow.setMapFiltersVisible,
        dismissTransientPanels: appFlow.dismissTransientPanels,
        requestOpenSearch: appFlow.requestOpenSearch,
        requestToggleFavorites: appFlow.requestToggleFavorites,
    }), [
        appFlow.dismissTransientPanels,
        appFlow.requestOpenSearch,
        appFlow.requestToggleFavorites,
        appFlow.setActiveTab,
        appFlow.setMapFiltersVisible,
    ]);

    const parkingHomeActionButtons = useMemo(() => buildParkingHomeActionButtons({
        allowParkingActionHighlight: appFlow.allowParkingActionHighlight,
        parkingActionKey: appFlow.parkingActionKey as ParkingActionKey,
        searchVisible: appFlow.searchVisible,
        setActiveTab: appFlow.setActiveTab,
        setParkingActionKey: appFlow.setParkingActionKey,
        setParkingZonesVisible: appFlow.setParkingZonesVisible,
        setParkingPaymentVisible: appFlow.setParkingPaymentVisible,
        setParkingLotsVisible: appFlow.setParkingLotsVisible,
        setParkingCarsVisible: appFlow.setParkingCarsVisible,
        setMapFiltersVisible: appFlow.setMapFiltersVisible,
        dismissTransientPanels: appFlow.dismissTransientPanels,
        requestOpenSearch: appFlow.requestOpenSearch,
    }), [
        appFlow.allowParkingActionHighlight,
        appFlow.dismissTransientPanels,
        appFlow.parkingActionKey,
        appFlow.requestOpenSearch,
        appFlow.searchVisible,
        appFlow.setActiveTab,
        appFlow.setMapFiltersVisible,
        appFlow.setParkingActionKey,
        appFlow.setParkingCarsVisible,
        appFlow.setParkingLotsVisible,
        appFlow.setParkingPaymentVisible,
        appFlow.setParkingZonesVisible,
    ]);

    const ecoHomeActionButtons = useMemo(() => buildEcoHomeActionButtons({
        activeEcoPanel: appFlow.activeEcoPanel as EcoActionKey | null,
        allowEcoActionHighlight: appFlow.allowEcoActionHighlight,
        dismissTransientPanels: appFlow.dismissTransientPanels,
        setActiveEcoPanel: appFlow.setActiveEcoPanel,
        setActiveTab: appFlow.setActiveTab,
        setMapFiltersVisible: appFlow.setMapFiltersVisible,
    }), [
        appFlow.activeEcoPanel,
        appFlow.allowEcoActionHighlight,
        appFlow.dismissTransientPanels,
        appFlow.setActiveEcoPanel,
        appFlow.setActiveTab,
        appFlow.setMapFiltersVisible,
    ]);

    return useMemo(() => (
        appFlow.activeTab === 'map' && appFlow.mapExperienceMode === 'parking'
            ? parkingHomeActionButtons
            : appFlow.activeTab === 'map' && appFlow.mapExperienceMode === 'eco'
                ? ecoHomeActionButtons
                : transitHomeActionButtons
    ), [
        appFlow.activeTab,
        appFlow.mapExperienceMode,
        ecoHomeActionButtons,
        parkingHomeActionButtons,
        transitHomeActionButtons,
    ]);
};
