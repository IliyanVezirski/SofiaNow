import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';

export const useUserLocation = () => {
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [hasFreshLocation, setHasFreshLocation] = useState(false);

    const ensurePermission = useCallback(async () => {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status === 'granted') {
            return permission.status;
        }

        return (await Location.requestForegroundPermissionsAsync()).status;
    }, []);

    const updateCurrentLocation = useCallback(async (accuracy: Location.Accuracy = Location.Accuracy.Balanced) => {
        const status = await ensurePermission();
        if (status !== 'granted') {
            return null;
        }

        const nextLocation = await Location.getCurrentPositionAsync({ accuracy });
        setLocation(nextLocation);
        setHasFreshLocation(true);
        return nextLocation;
    }, [ensurePermission]);

    useEffect(() => {
        let isMounted = true;
        let locationSubscription: Location.LocationSubscription | null = null;
        const appStateSubscription = AppState.addEventListener('change', (nextState) => {
            if (nextState !== 'active') {
                return;
            }

            void updateCurrentLocation(Location.Accuracy.Balanced).catch((error) => {
                console.warn('Failed to refresh location on app resume:', error);
            });
        });

        (async () => {
            try {
                const status = await ensurePermission();

                if (status === 'granted') {
                    const lastKnown = await Location.getLastKnownPositionAsync({ requiredAccuracy: 3000, maxAge: 1000 * 60 * 60 * 6 });
                    if (lastKnown && isMounted) {
                        setLocation(lastKnown);
                    }

                    try {
                        const quickCurrent = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
                        if (quickCurrent && isMounted) {
                            setLocation(quickCurrent);
                            setHasFreshLocation(true);
                        }
                    } catch (err) {
                        console.warn('Quick location unavailable:', err);
                    }

                    locationSubscription = await Location.watchPositionAsync(
                        {
                            accuracy: Location.Accuracy.High,
                            timeInterval: 2000,
                            distanceInterval: 3,
                        },
                        (nextLocation) => {
                            if (isMounted) {
                                setLocation(nextLocation);
                                setHasFreshLocation(true);
                            }
                        },
                    );

                    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                    if (isMounted) {
                        setLocation(loc);
                        setHasFreshLocation(true);
                    }
                }
            } catch (err) {
                console.warn('Location unavailable:', err);
            }
        })();
        return () => {
            isMounted = false;
            locationSubscription?.remove();
            appStateSubscription.remove();
        };
    }, [ensurePermission, updateCurrentLocation]);

    const refresh = async () => {
        try {
            await updateCurrentLocation(Location.Accuracy.Low);
        } catch (err) {
            console.warn('Failed to refresh location:', err);
        }
    };

    return { hasFreshLocation, location, refresh };
};
