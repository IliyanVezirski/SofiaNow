import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

export const useUserLocation = () => {
    const [location, setLocation] = useState<Location.LocationObject | null>(null);

    useEffect(() => {
        let isMounted = true;
        let locationSubscription: Location.LocationSubscription | null = null;

        (async () => {
            try {
                const permission = await Location.getForegroundPermissionsAsync();
                const status = permission.status === 'granted'
                    ? permission.status
                    : (await Location.requestForegroundPermissionsAsync()).status;

                if (status === 'granted') {
                    const lastKnown = await Location.getLastKnownPositionAsync({ requiredAccuracy: 3000, maxAge: 1000 * 60 * 60 * 6 });
                    if (lastKnown && isMounted) setLocation(lastKnown);

                    try {
                        const quickCurrent = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
                        if (quickCurrent && isMounted) {
                            setLocation(quickCurrent);
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
                            if (isMounted) setLocation(nextLocation);
                        },
                    );

                    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                    if (isMounted) setLocation(loc);
                }
            } catch (err) {
                console.warn('Location unavailable:', err);
            }
        })();
        return () => {
            isMounted = false;
            locationSubscription?.remove();
        };
    }, []);

    const refresh = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
            setLocation(loc);
        } catch (err) {
            console.warn('Failed to refresh location:', err);
        }
    };

    return { location, refresh };
};
