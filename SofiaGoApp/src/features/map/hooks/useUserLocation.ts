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
                    const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 1000 * 60 * 10 });
                    if (lastKnown && isMounted) setLocation(lastKnown);

                    locationSubscription = await Location.watchPositionAsync(
                        {
                            accuracy: Location.Accuracy.Balanced,
                            timeInterval: 5000,
                            distanceInterval: 10,
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
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setLocation(loc);
        } catch (err) {
            console.warn('Failed to refresh location:', err);
        }
    };

    return { location, refresh };
};
