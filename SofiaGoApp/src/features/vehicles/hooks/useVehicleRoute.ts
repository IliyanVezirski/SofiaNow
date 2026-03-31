import { useState, useCallback } from 'react';
import { TripStopInfo, Vehicle } from '../../../types/vehicles';
import { fetchTripStops } from '../../../services/cgmApi/tripStops';
import { fetchLineRouteGeometry, fetchLineRouteGeometryByRouteId, fetchOsrmRoute } from '../../../services/stopsApi';

const getDirectionMatchScore = (
    directionStops: Array<{ id: string }>,
    tripStops: TripStopInfo[],
) => {
    if (!directionStops.length || !tripStops.length) {
        return 0;
    }

    const directionStopIndex = new Map(directionStops.map((stop, index) => [String(stop.id || '').trim(), index]));
    let matches = 0;
    let lastMatchedIndex = -1;

    tripStops.forEach((stop) => {
        const stopId = String(stop.stopId || '').trim();
        const directionIndex = directionStopIndex.get(stopId);
        if (directionIndex == null || directionIndex < lastMatchedIndex) {
            return;
        }

        matches += 1;
        lastMatchedIndex = directionIndex;
    });

    return matches;
};

export const useVehicleRoute = () => {
    const [vehicleRouteStops, setVehicleRouteStops] = useState<TripStopInfo[]>([]);
    const [vehicleRouteCoords, setVehicleRouteCoords] = useState<[number, number][]>([]);
    const [vehicleRouteVehicleId, setVehicleRouteVehicleId] = useState<string | null>(null);
    const [vehicleRouteLoading, setVehicleRouteLoading] = useState(false);

    const hasVehicleRoute = vehicleRouteStops.length > 0;

    const loadVehicleRoute = useCallback(async (vehicle: Vehicle) => {
        if (vehicleRouteVehicleId === vehicle.id) {
            setVehicleRouteStops([]);
            setVehicleRouteCoords([]);
            setVehicleRouteVehicleId(null);
            return;
        }

        setVehicleRouteLoading(true);
        try {
            const stops = await fetchTripStops(vehicle.tripId);
            setVehicleRouteStops(stops);
            setVehicleRouteVehicleId(vehicle.id);

            const routeGeometry = vehicle.routeId
                ? await fetchLineRouteGeometryByRouteId(vehicle.routeId)
                : await fetchLineRouteGeometry(
                    vehicle.line,
                    vehicle.type,
                    String(vehicle.line || '').trim().toUpperCase().startsWith('N'),
                );

            const bestDirection = routeGeometry?.directions
                ?.map((direction) => ({
                    direction,
                    score: getDirectionMatchScore(direction.stops, stops),
                }))
                .sort((left, right) => right.score - left.score)[0];

            if (bestDirection?.direction?.coordinates?.length) {
                setVehicleRouteCoords(bestDirection.direction.coordinates);
                return;
            }

            const waypoints = [
                { latitude: vehicle.latitude, longitude: vehicle.longitude },
                ...stops.map((stop) => ({ latitude: stop.latitude, longitude: stop.longitude })),
            ];
            if (waypoints.length >= 2) {
                try {
                    const osrmCoords = await fetchOsrmRoute(waypoints);
                    setVehicleRouteCoords(osrmCoords);
                } catch {
                    setVehicleRouteCoords(waypoints.map((waypoint) => [waypoint.longitude, waypoint.latitude]));
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
