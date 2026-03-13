import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

export const useUserLocation = () => {
    const [location, setLocation] = useState<Location.LocationObject | null>(null);

    useEffect(() => {
        let isMounted = true;
        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === 'granted') {
                    const lastKnown = await Location.getLastKnownPositionAsync();
                    if (lastKnown && isMounted) setLocation(lastKnown);
                    const loc = await Location.getCurrentPositionAsync({});
                    if (isMounted) setLocation(loc);
                }
            } catch (err) {
                console.warn('Location unavailable:', err);
            }
        })();
        return () => { isMounted = false; };
    }, []);

    const refresh = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;
            const loc = await Location.getCurrentPositionAsync({});
            setLocation(loc);
        } catch (err) {
            console.warn('Failed to refresh location:', err);
        }
    };

    return { location, refresh };
};
