import { useMemo, useEffect } from 'react';
import { Stop } from '../../../services/stopsApi';
import { TripRouteGeoJSON } from '../utils/routeGeoJson';
import { fetchStopEtas } from '../../../services/cgmApi/stopEtas';

type TripPlannerOverlayStop = { name: string; lat: number; lon: number; stopCode?: string };

export const resolveTripPlannerStopToKnownStop = (
    tripStop: TripPlannerOverlayStop,
    searchableStops: Stop[],
): Stop | null => {
    if (tripStop.stopCode) {
        const byId = searchableStops.find((s) => s.id === tripStop.stopCode);
        if (byId) return byId;
    }
    let best: Stop | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const tripName = tripStop.name.trim().toLowerCase();

    for (const candidate of searchableStops) {
        const dLat = candidate.latitude - tripStop.lat;
        const dLon = candidate.longitude - tripStop.lon;
        const distanceScore = dLat * dLat + dLon * dLon;
        const candidateName = candidate.name.trim().toLowerCase();
        const hasNameHint = tripName && (candidateName.includes(tripName) || tripName.includes(candidateName));
        const score = distanceScore + (hasNameHint ? 0 : 0.000001);
        if (score < bestScore) { bestScore = score; best = candidate; }
    }
    return best && bestScore < 0.00000625 ? best : null;
};

export const useTripOverlay = (
    tripPlannerRoute: TripRouteGeoJSON | null | undefined,
    searchableStops: Stop[],
    setEtasByStopId: (updater: (prev: Record<string, any>) => Record<string, any>) => void,
    setTripCameraBounds: (bounds: { ne: [number, number]; sw: [number, number] } | null) => void,
) => {
    const hasTripRoute = !!(tripPlannerRoute && tripPlannerRoute.features.length > 0);

    useEffect(() => {
        if (!tripPlannerRoute || tripPlannerRoute.features.length === 0) {
            setTripCameraBounds(null);
            return;
        }
        const allCoords = tripPlannerRoute.features.flatMap((f) => f.geometry.coordinates);
        if (allCoords.length === 0) return;
        let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
        for (const [lon, lat] of allCoords) {
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
        }
        const padLat = (maxLat - minLat) * 0.2;
        const padLon = (maxLon - minLon) * 0.2;
        setTripCameraBounds({ ne: [maxLon + padLon, maxLat + padLat], sw: [minLon - padLon, minLat - padLat] });
        setTimeout(() => setTripCameraBounds(null), 1000);
    }, [tripPlannerRoute]);

    useEffect(() => {
        if (!tripPlannerRoute || tripPlannerRoute.transitStops.length === 0) return;
        const stopIds = Array.from(new Set(
            tripPlannerRoute.transitStops
                .map((s) => resolveTripPlannerStopToKnownStop(s, searchableStops)?.id)
                .filter((id): id is string => !!id)
        ));
        if (stopIds.length === 0) return;
        let cancelled = false;
        (async () => {
            try {
                const etas = await fetchStopEtas(stopIds);
                if (!cancelled) setEtasByStopId((prev) => ({ ...prev, ...etas }));
            } catch (err) { console.warn('Failed to fetch trip route stop ETAs:', err); }
        })();
        return () => { cancelled = true; };
    }, [tripPlannerRoute, searchableStops]);

    return { hasTripRoute, resolveTripPlannerStopToKnownStop: (stop: TripPlannerOverlayStop) => resolveTripPlannerStopToKnownStop(stop, searchableStops) };
};
