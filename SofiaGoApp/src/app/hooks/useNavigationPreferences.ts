import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import type { ParkingActionKey } from '../types';
import { DEFAULT_MAP_EXPERIENCE_MODE, DEFAULT_PARKING_ACTION_KEY } from '../types';
import type { MapExperienceMode } from '../../features/map/components/MapModeSwitcher';
import { isParkingActionKey } from '../utils/parking';

const MAP_EXPERIENCE_MODE_STORAGE_KEY = '@sofiago:map:experience-mode:v1';
const PARKING_ACTION_KEY_STORAGE_KEY = '@sofiago:parking:action:v1';

type Params = {
    mapExperienceMode: MapExperienceMode;
    setMapExperienceMode: Dispatch<SetStateAction<MapExperienceMode>>;
    parkingActionKey: ParkingActionKey;
    setParkingActionKey: Dispatch<SetStateAction<ParkingActionKey>>;
    setParkingLotsVisible: Dispatch<SetStateAction<boolean>>;
};

export const useNavigationPreferences = ({
    mapExperienceMode,
    setMapExperienceMode,
    parkingActionKey,
    setParkingActionKey,
    setParkingLotsVisible,
}: Params) => {
    const [navigationPrefsHydrated, setNavigationPrefsHydrated] = useState(false);

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            try {
                const [storedMode, storedParkingAction] = await Promise.all([
                    AsyncStorage.getItem(MAP_EXPERIENCE_MODE_STORAGE_KEY),
                    AsyncStorage.getItem(PARKING_ACTION_KEY_STORAGE_KEY),
                ]);

                if (cancelled) {
                    return;
                }

                const nextMode = storedMode === 'parking' || storedMode === 'transit' ? storedMode : null;
                const nextParkingAction = storedParkingAction && isParkingActionKey(storedParkingAction) ? storedParkingAction : null;

                setMapExperienceMode(nextMode ?? DEFAULT_MAP_EXPERIENCE_MODE);
                setParkingActionKey(nextParkingAction ?? DEFAULT_PARKING_ACTION_KEY);

                if (nextMode === 'parking' && nextParkingAction === 'lots') {
                    setParkingLotsVisible(true);
                }
            } catch (error) {
                console.warn('Failed to load navigation preferences:', error);
            } finally {
                if (!cancelled) {
                    setNavigationPrefsHydrated(true);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [setMapExperienceMode, setParkingActionKey, setParkingLotsVisible]);

    useEffect(() => {
        if (!navigationPrefsHydrated) {
            return;
        }

        void AsyncStorage.setItem(MAP_EXPERIENCE_MODE_STORAGE_KEY, mapExperienceMode).catch((error) => {
            console.warn('Failed to save map experience mode:', error);
        });
    }, [mapExperienceMode, navigationPrefsHydrated]);

    useEffect(() => {
        if (!navigationPrefsHydrated) {
            return;
        }

        void AsyncStorage.setItem(PARKING_ACTION_KEY_STORAGE_KEY, parkingActionKey).catch((error) => {
            console.warn('Failed to save parking action:', error);
        });
    }, [navigationPrefsHydrated, parkingActionKey]);

    return {
        navigationPrefsHydrated,
    };
};
