import type { Dispatch, SetStateAction } from 'react';

import type { HomeActionButton, ParkingActionKey } from './types';

type TransitHomeActionsParams = {
    setActiveTab: Dispatch<SetStateAction<'map' | 'schedules' | 'planner' | 'nearby'>>;
    setMapFiltersVisible: Dispatch<SetStateAction<boolean>>;
    dismissTransientPanels: () => void;
    requestOpenSearch: () => void;
    requestToggleFavorites: () => void;
};

export const buildTransitHomeActionButtons = ({
    setActiveTab,
    setMapFiltersVisible,
    dismissTransientPanels,
    requestOpenSearch,
    requestToggleFavorites,
}: TransitHomeActionsParams): HomeActionButton[] => [
    {
        key: 'nearby',
        label: 'До мен',
        icon: 'footsteps-outline',
        onPress: () => {
            setActiveTab((prev) => (prev === 'nearby' ? 'map' : 'nearby'));
            setMapFiltersVisible(false);
            dismissTransientPanels();
        },
    },
    {
        key: 'schedules',
        label: 'Разписание',
        icon: 'time-outline',
        onPress: () => {
            setActiveTab((prev) => (prev === 'schedules' ? 'map' : 'schedules'));
            setMapFiltersVisible(false);
            dismissTransientPanels();
        },
    },
    {
        key: 'planner',
        label: 'Маршрут',
        icon: 'navigate-outline',
        onPress: () => {
            setActiveTab((prev) => (prev === 'planner' ? 'map' : 'planner'));
            setMapFiltersVisible(false);
            dismissTransientPanels();
        },
    },
    {
        key: 'search',
        label: 'Търсене',
        icon: 'search-outline',
        onPress: () => {
            setActiveTab('map');
            setMapFiltersVisible(false);
            dismissTransientPanels();
            requestOpenSearch();
        },
    },
    {
        key: 'favorites',
        label: 'Места',
        icon: 'bookmark-outline',
        onPress: () => {
            setActiveTab('map');
            setMapFiltersVisible(false);
            dismissTransientPanels();
            requestToggleFavorites();
        },
    },
];

type ParkingHomeActionsParams = {
    allowParkingActionHighlight: boolean;
    parkingActionKey: ParkingActionKey;
    searchVisible: boolean;
    setActiveTab: Dispatch<SetStateAction<'map' | 'schedules' | 'planner' | 'nearby'>>;
    setParkingActionKey: Dispatch<SetStateAction<ParkingActionKey>>;
    setParkingZonesVisible: Dispatch<SetStateAction<boolean>>;
    setParkingPaymentVisible: Dispatch<SetStateAction<boolean>>;
    setParkingLotsVisible: Dispatch<SetStateAction<boolean>>;
    setParkingCarsVisible: Dispatch<SetStateAction<boolean>>;
    setMapFiltersVisible: Dispatch<SetStateAction<boolean>>;
    dismissTransientPanels: () => void;
    requestOpenSearch: () => void;
};

export const buildParkingHomeActionButtons = ({
    allowParkingActionHighlight,
    parkingActionKey,
    searchVisible,
    setActiveTab,
    setParkingActionKey,
    setParkingZonesVisible,
    setParkingPaymentVisible,
    setParkingLotsVisible,
    setParkingCarsVisible,
    setMapFiltersVisible,
    dismissTransientPanels,
    requestOpenSearch,
}: ParkingHomeActionsParams): HomeActionButton[] => [
    {
        key: 'zone',
        label: 'Зони',
        icon: 'map-outline',
        active: allowParkingActionHighlight && parkingActionKey === 'zone',
        onPress: () => {
            setActiveTab('map');
            setParkingActionKey('zone');
            setParkingCarsVisible(false);
            setParkingPaymentVisible(false);
            setParkingLotsVisible(false);
            dismissTransientPanels();
            setParkingZonesVisible(true);
        },
    },
    {
        key: 'pay',
        label: 'Плати',
        icon: 'card-outline',
        active: allowParkingActionHighlight && parkingActionKey === 'pay',
        onPress: () => {
            setActiveTab('map');
            setParkingActionKey('pay');
            setParkingZonesVisible(false);
            setParkingCarsVisible(false);
            setParkingLotsVisible(false);
            dismissTransientPanels();
            setParkingPaymentVisible(true);
        },
    },
    {
        key: 'lots',
        label: 'Паркинги',
        icon: 'business-outline',
        active: allowParkingActionHighlight && parkingActionKey === 'lots',
        onPress: () => {
            setActiveTab('map');
            setParkingActionKey('lots');
            setParkingZonesVisible(false);
            setParkingCarsVisible(false);
            setParkingPaymentVisible(false);
            dismissTransientPanels();
            setParkingLotsVisible(true);
        },
    },
    {
        key: 'search',
        label: 'Търсене',
        icon: 'search-outline',
        active: searchVisible,
        onPress: () => {
            setActiveTab('map');
            setParkingActionKey('search');
            setParkingZonesVisible(false);
            setParkingCarsVisible(false);
            setParkingLotsVisible(false);
            setParkingPaymentVisible(false);
            setMapFiltersVisible(false);
            dismissTransientPanels();
            requestOpenSearch();
        },
    },
    {
        key: 'cars',
        label: 'Моите коли',
        icon: 'car-outline',
        active: allowParkingActionHighlight && parkingActionKey === 'cars',
        onPress: () => {
            setActiveTab('map');
            setParkingActionKey('cars');
            setParkingZonesVisible(false);
            setParkingLotsVisible(false);
            setParkingPaymentVisible(false);
            dismissTransientPanels();
            setParkingCarsVisible(true);
        },
    },
];
