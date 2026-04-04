import { haversineDistanceMeters } from '../../../services/transitUtils';
import type { StopEta, Vehicle } from '../../../types/vehicles';

type StopLike = {
    id?: string | null;
    latitude?: number | null;
    longitude?: number | null;
};

const normalizeToken = (value?: string | null) => (
    String(value || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/[^0-9A-ZА-Я]/g, '')
);

const normalizeRouteToken = (value?: string | null) => (
    normalizeToken(String(value || '').split('-')[0] || value)
);

const parseStopIdParts = (value?: string | null) => (
    String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
);

const getVehicleMatchScore = (eta: StopEta, vehicle: Vehicle) => {
    if (vehicle.tripId === eta.tripId) {
        return 1000;
    }

    const etaRouteId = normalizeRouteToken(eta.routeId);
    const vehicleRouteId = normalizeRouteToken(vehicle.routeId);
    const etaLine = normalizeToken(eta.line);
    const vehicleLine = normalizeToken(vehicle.line);
    const etaType = eta.type;
    const vehicleType = vehicle.type;

    const routeMatches = !!etaRouteId && etaRouteId === vehicleRouteId;
    const lineMatches = !!etaLine && etaLine === vehicleLine;
    const typeMatches = !!etaType && etaType === vehicleType;

    if (!routeMatches && !lineMatches) {
        return -1;
    }

    if (routeMatches && lineMatches && typeMatches) {
        return 800;
    }

    if (routeMatches && lineMatches) {
        return typeMatches ? 760 : 700;
    }

    if (routeMatches) {
        return typeMatches ? 620 : 560;
    }

    if (lineMatches && typeMatches) {
        return 520;
    }

    return 420;
};

export const findBestLiveVehicleForEta = (
    eta: StopEta,
    stop: StopLike | null | undefined,
    vehicles: Vehicle[],
) => {
    if (!vehicles.length) {
        return null;
    }

    const stopIdParts = new Set(parseStopIdParts(stop?.id ?? eta.stopId));

    const ranked = vehicles
        .map((vehicle) => ({
            vehicle,
            score: getVehicleMatchScore(eta, vehicle),
        }))
        .filter((entry) => entry.score >= 0);

    if (!ranked.length) {
        return null;
    }

    ranked.sort((left, right) => {
        if (left.score !== right.score) {
            return right.score - left.score;
        }

        const leftStopMatch = stopIdParts.has(String(left.vehicle.stopId || '').trim()) ? 1 : 0;
        const rightStopMatch = stopIdParts.has(String(right.vehicle.stopId || '').trim()) ? 1 : 0;
        if (leftStopMatch !== rightStopMatch) {
            return rightStopMatch - leftStopMatch;
        }

        if (
            Number.isFinite(stop?.latitude)
            && Number.isFinite(stop?.longitude)
            && Number.isFinite(left.vehicle.latitude)
            && Number.isFinite(left.vehicle.longitude)
            && Number.isFinite(right.vehicle.latitude)
            && Number.isFinite(right.vehicle.longitude)
        ) {
            const leftDistance = haversineDistanceMeters(
                left.vehicle.latitude,
                left.vehicle.longitude,
                Number(stop?.latitude),
                Number(stop?.longitude),
            );
            const rightDistance = haversineDistanceMeters(
                right.vehicle.latitude,
                right.vehicle.longitude,
                Number(stop?.latitude),
                Number(stop?.longitude),
            );

            if (leftDistance !== rightDistance) {
                return leftDistance - rightDistance;
            }
        }

        return (right.vehicle.lastUpdatedUnix ?? 0) - (left.vehicle.lastUpdatedUnix ?? 0);
    });

    return ranked[0]?.vehicle ?? null;
};
