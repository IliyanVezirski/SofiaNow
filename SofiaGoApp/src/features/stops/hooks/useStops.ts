import { useState, useEffect, useRef, useMemo } from 'react';
import { Stop, fetchStopsInBounds, fetchAllStops } from '../../../services/stopsApi';
import { MapBounds } from '../../../types/map';
import { VehicleType } from '../../../services/transitUtils';
import { MIN_BOUNDS_DELTA_FOR_REFRESH, MAX_RENDERED_STOPS, resolveTransitDataViewportSuppressed } from '../../map/constants';

export const useStops = (
    mapBounds: MapBounds | null,
    hasTripRoute: boolean,
    selectedLines: string[],
    selectedVehicleTypes: VehicleType[],
    isRouteMode: boolean,
    mapCenterCoordinate: [number, number],
    resolvedVehicleTypesByStopId: Record<string, VehicleType[]>,
) => {
    const [stops, setStops] = useState<Stop[]>([]);
    const [searchableStops, setSearchableStops] = useState<Stop[]>([]);
    const visibleStopsRef = useRef<Stop[]>([]);
    const lastStopBoundsRef = useRef<MapBounds | null>(null);
    const viewportSuppressedRef = useRef(false);

    useEffect(() => {
        void fetchAllStops().then(setSearchableStops);
    }, []);

    useEffect(() => {
        const shouldSuppress = resolveTransitDataViewportSuppressed(mapBounds, viewportSuppressedRef.current);
        viewportSuppressedRef.current = shouldSuppress;

        if (!mapBounds || hasTripRoute || shouldSuppress) {
            visibleStopsRef.current = [];
            setStops((current) => (current.length ? [] : current));
            return;
        }
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

    const stopsWithResolvedTypes = useMemo(() => stops.map((stop) => {
        const resolvedTypes = resolvedVehicleTypesByStopId[stop.id] ?? [];

        if (resolvedTypes.length) {
            return {
                ...stop,
                vehicleTypes: resolvedTypes,
            };
        }

        return {
            ...stop,
            vehicleTypes: stop.vehicleTypes?.length ? stop.vehicleTypes : ['bus' as VehicleType],
        };
    }), [resolvedVehicleTypesByStopId, stops]);

    const filteredStops = useMemo(() => {
        if (isRouteMode) return stopsWithResolvedTypes;
        const normalizedSelectedLines = selectedLines.map((l) => String(l || '').trim().toUpperCase());
        return stopsWithResolvedTypes.filter((stop) => {
            const normalizedStopLines = stop.lines.map((l) => String(l || '').trim().toUpperCase()).filter(Boolean);
            const matchesLine = !normalizedSelectedLines.length || normalizedSelectedLines.some((l) => normalizedStopLines.includes(l));
            if (!matchesLine) return false;
            if (!selectedVehicleTypes.length) return true;
            const stopVehicleTypes = stop.vehicleTypes?.length ? stop.vehicleTypes : ['bus' as VehicleType];
            return stopVehicleTypes.some((type) => selectedVehicleTypes.includes(type));
        });
    }, [selectedLines, selectedVehicleTypes, isRouteMode, stopsWithResolvedTypes]);

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

    const stopById = useMemo(() => stopsWithResolvedTypes.reduce<Record<string, Stop>>((r, s) => { r[s.id] = s; return r; }, {}), [stopsWithResolvedTypes]);
    const stopNameByIdMap = useMemo(() => stopsWithResolvedTypes.reduce<Record<string, string>>((r, s) => { r[s.id] = s.name; return r; }, {}), [stopsWithResolvedTypes]);
    const searchableStopNameByIdMap = useMemo(() => searchableStops.reduce<Record<string, string>>((r, s) => { r[s.id] = s.name; return r; }, {}), [searchableStops]);

    return { stops: stopsWithResolvedTypes, searchableStops, filteredStops, renderedStops, visibleStopsRef, stopById, stopNameByIdMap, searchableStopNameByIdMap };
};
