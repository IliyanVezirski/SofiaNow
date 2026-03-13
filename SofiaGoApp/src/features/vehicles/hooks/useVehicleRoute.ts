import { useState, useCallback } from 'react';
import { TripStopInfo } from '../../../types/vehicles';
import { fetchTripStops } from '../../../services/cgmApi/tripStops';
import { fetchOsrmRoute } from '../../../services/stopsApi';

export const useVehicleRoute = () => {
    const [vehicleRouteStops, setVehicleRouteStops] = useState<TripStopInfo[]>([]);
    const [vehicleRouteCoords, setVehicleRouteCoords] = useState<[number, number][]>([]);
    const [vehicleRouteVehicleId, setVehicleRouteVehicleId] = useState<string | null>(null);
    const [vehicleRouteLoading, setVehicleRouteLoading] = useState(false);

    const hasVehicleRoute = vehicleRouteStops.length > 0;

    const loadVehicleRoute = useCallback(async (vehicleId: string, tripId: string, vehicleLat: number, vehicleLon: number) => {
        if (vehicleRouteVehicleId === vehicleId) {
            setVehicleRouteStops([]);
            setVehicleRouteCoords([]);
            setVehicleRouteVehicleId(null);
            return;
        }
        setVehicleRouteLoading(true);
        try {
            const stops = await fetchTripStops(tripId);
            setVehicleRouteStops(stops);
            setVehicleRouteVehicleId(vehicleId);
            const waypoints = [
                { latitude: vehicleLat, longitude: vehicleLon },
                ...stops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
            ];
            if (waypoints.length >= 2) {
                try {
                    const osrmCoords = await fetchOsrmRoute(waypoints);
                    setVehicleRouteCoords(osrmCoords);
                } catch {
                    setVehicleRouteCoords(waypoints.map((w) => [w.longitude, w.latitude]));
                }
            }
        } finally {
            setVehicleRouteLoading(false);
        }
    }, [vehicleRouteVehicleId]);

    const clearVehicleRoute = useCallback(() => {
        setVehicleRouteStops([]);
        setVehicleRouteCoords([]);
        setVehicleRouteVehicleId(null);
    }, []);

    return {
        vehicleRouteStops,
        vehicleRouteCoords,
        vehicleRouteVehicleId,
        vehicleRouteLoading,
        hasVehicleRoute,
        loadVehicleRoute,
        clearVehicleRoute,
    };
};
