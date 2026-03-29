import { useState, useEffect, useRef } from 'react';
import { Vehicle } from '../../../types/vehicles';
import { MapBounds } from '../../../types/map';
import { fetchVehiclesInBounds } from '../../../services/cgmApi/vehiclePositions';
import { VEHICLE_REFRESH_MS, resolveTransitDataViewportSuppressed } from '../../map/constants';

export const useVehicles = (mapBounds: MapBounds | null, hasTripRoute: boolean) => {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const viewportSuppressedRef = useRef(false);

    useEffect(() => {
        const shouldSuppress = resolveTransitDataViewportSuppressed(mapBounds, viewportSuppressedRef.current);
        viewportSuppressedRef.current = shouldSuppress;

        if (!mapBounds || hasTripRoute || shouldSuppress) {
            setVehicles((current) => (current.length ? [] : current));
            setLastUpdated((current) => (current ? null : current));
            return;
        }
        let isMounted = true;
        let fetchInFlight = false;

        const refresh = async () => {
            if (fetchInFlight) return;
            fetchInFlight = true;
            try {
                const result = await fetchVehiclesInBounds(mapBounds);
                if (isMounted) {
                    setVehicles(result);
                    setLastUpdated(new Date());
                }
            } catch (err) {
                console.error('Vehicle refresh failed:', err);
            } finally {
                fetchInFlight = false;
            }
        };

        void refresh();
        const timer = setInterval(() => void refresh(), VEHICLE_REFRESH_MS);
        return () => { isMounted = false; clearInterval(timer); };
    }, [mapBounds, hasTripRoute]);

    return { vehicles, lastUpdated };
};
