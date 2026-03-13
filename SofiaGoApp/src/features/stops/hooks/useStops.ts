import { useState, useEffect, useRef, useMemo } from 'react';
import { Stop, fetchStopsInBounds, fetchAllStops } from '../../../services/stopsApi';
import { MapBounds } from '../../../types/map';
import { VehicleType, inferLineTypeFromToken } from '../../../services/transitUtils';
import { MIN_BOUNDS_DELTA_FOR_REFRESH, MAX_RENDERED_STOPS } from '../../map/constants';

export const useStops = (
    mapBounds: MapBounds | null,
    hasTripRoute: boolean,
    selectedLines: string[],
    selectedVehicleTypes: VehicleType[],
    isRouteMode: boolean,
    mapCenterCoordinate: [number, number],
) => {
    const [stops, setStops] = useState<Stop[]>([]);
    const [searchableStops, setSearchableStops] = useState<Stop[]>([]);
    const visibleStopsRef = useRef<Stop[]>([]);
    const lastStopBoundsRef = useRef<MapBounds | null>(null);

    useEffect(() => {
        void fetchAllStops().then(setSearchableStops);
    }, []);

    useEffect(() => {
        if (!mapBounds || hasTripRoute) return;
        let isMounted = true;

        const boundsChanged = !lastStopBoundsRef.current
            || Math.abs(lastStopBoundsRef.current.north - mapBounds.north) > MIN_BOUNDS_DELTA_FOR_REFRESH
            || Math.abs(lastStopBoundsRef.current.south - mapBounds.south) > MIN_BOUNDS_DELTA_FOR_REFRESH
            || Math.abs(lastStopBoundsRef.current.east - mapBounds.east) > MIN_BOUNDS_DELTA_FOR_REFRESH
            || Math.abs(lastStopBoundsRef.current.west - mapBounds.west) > MIN_BOUNDS_DELTA_FOR_REFRESH;

        if (boundsChanged) {
            lastStopBoundsRef.current = mapBounds;
            void (async () => {
                try {
                    const visibleStops = await fetchStopsInBounds(mapBounds);
                    if (!isMounted) return;
                    visibleStopsRef.current = visibleStops;
                    setStops(visibleStops);
                } catch (err) {
                    console.error('Stop load failed:', err);
                }
            })();
        }
        return () => { isMounted = false; };
    }, [mapBounds, hasTripRoute]);

    const filteredStops = useMemo(() => {
        if (isRouteMode) return stops;
        const normalizedSelectedLines = selectedLines.map((l) => String(l || '').trim().toUpperCase());
        return stops.filter((stop) => {
            const normalizedStopLines = stop.lines.map((l) => String(l || '').trim().toUpperCase()).filter(Boolean);
            const matchesLine = !normalizedSelectedLines.length || normalizedSelectedLines.some((l) => normalizedStopLines.includes(l));
            if (!matchesLine) return false;
            if (!selectedVehicleTypes.length) return true;
            return normalizedStopLines.some((l) => selectedVehicleTypes.includes(inferLineTypeFromToken(l)));
        });
    }, [stops, selectedLines, selectedVehicleTypes, isRouteMode]);

    const renderedStops = useMemo(() => {
        if (isRouteMode) return filteredStops;
        const inBounds = mapBounds
            ? filteredStops.filter((s) =>
                s.latitude <= mapBounds.north && s.latitude >= mapBounds.south &&
                s.longitude <= mapBounds.east && s.longitude >= mapBounds.west
            )
            : filteredStops;
        if (inBounds.length <= MAX_RENDERED_STOPS) return inBounds;

        const [centerLon, centerLat] = mapCenterCoordinate;
        return inBounds.slice().sort((a, b) => {
            const ld = (a.latitude - centerLat) ** 2 + (a.longitude - centerLon) ** 2;
            const rd = (b.latitude - centerLat) ** 2 + (b.longitude - centerLon) ** 2;
            return ld - rd;
        }).slice(0, MAX_RENDERED_STOPS);
    }, [filteredStops, isRouteMode, mapCenterCoordinate, mapBounds]);

    const stopById = useMemo(() => stops.reduce<Record<string, Stop>>((r, s) => { r[s.id] = s; return r; }, {}), [stops]);
    const stopNameByIdMap = useMemo(() => stops.reduce<Record<string, string>>((r, s) => { r[s.id] = s.name; return r; }, {}), [stops]);

    return { stops, searchableStops, filteredStops, renderedStops, visibleStopsRef, stopById, stopNameByIdMap };
};
