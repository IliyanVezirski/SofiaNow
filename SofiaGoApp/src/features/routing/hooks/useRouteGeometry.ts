import { useState, useEffect, useMemo } from 'react';
import { LineRouteGeometry, fetchLineRouteGeometry, fetchLineRouteGeometryByRouteId } from '../../../services/stopsApi';
import { getScheduleBasedDirections, resolveScheduleRouteId } from '../../../services/cgmApi';
import { convertTripApiScheduleToRouteGeometry, fetchTripApiLineSchedule } from '../../../services/cgmApi/tripScheduleApi';
import { RouteSelection } from '../../../types/routes';

const applyTripApiStopCoordinates = (
    geometry: LineRouteGeometry,
    tripApiGeometry: LineRouteGeometry | null,
): LineRouteGeometry => {
    if (!tripApiGeometry?.directions.length) {
        return geometry;
    }

    const stopCoordinateById = new Map<string, { latitude: number; longitude: number }>();
    tripApiGeometry.directions.forEach((direction) => {
        direction.stops.forEach((stop) => {
            stopCoordinateById.set(stop.id, {
                latitude: stop.latitude,
                longitude: stop.longitude,
            });
        });
    });

    if (!stopCoordinateById.size) {
        return geometry;
    }

    return {
        ...geometry,
        directions: geometry.directions.map((direction) => ({
            ...direction,
            stops: direction.stops.map((stop) => {
                const tripApiCoordinates = stopCoordinateById.get(stop.id);
                return tripApiCoordinates
                    ? {
                        ...stop,
                        latitude: tripApiCoordinates.latitude,
                        longitude: tripApiCoordinates.longitude,
                    }
                    : stop;
            }),
        })),
    };
};

const getRouteGeometryWithFallback = async (
    highlightedRoute: RouteSelection,
): Promise<LineRouteGeometry | null> => {
    let geometry = highlightedRoute.routeId
        ? await fetchLineRouteGeometryByRouteId(highlightedRoute.routeId)
        : await fetchLineRouteGeometry(highlightedRoute.line, highlightedRoute.type, highlightedRoute.isNight);

    const effectiveScheduleRouteId = resolveScheduleRouteId(
        highlightedRoute.line,
        highlightedRoute.type,
        highlightedRoute.routeId || '',
    );
    const scheduleDirections = effectiveScheduleRouteId
        ? getScheduleBasedDirections(effectiveScheduleRouteId)
        : [];
    const tripApiSchedule = highlightedRoute.routeId
        ? await fetchTripApiLineSchedule({
            line: highlightedRoute.line,
            routeId: highlightedRoute.routeId,
            type: highlightedRoute.type,
            isNight: highlightedRoute.isNight,
        }).catch(() => null)
        : null;
    const tripApiGeometry = tripApiSchedule?.directions.length
        ? convertTripApiScheduleToRouteGeometry(tripApiSchedule)
        : null;

    if (geometry && tripApiGeometry) {
        geometry = applyTripApiStopCoordinates(geometry, tripApiGeometry);
    }

    let needsFallback = !geometry || geometry.directions.every((direction) => direction.stops.length === 0);
    if (!needsFallback && geometry && scheduleDirections.length > 0) {
        const scheduleStopIds = new Set(
            scheduleDirections.flatMap((direction) => direction.stops.map((stop) => stop.id)),
        );
        const sampledStops = geometry.directions.flatMap((direction) => direction.stops.slice(0, 8));
        const matchedStops = sampledStops.filter((stop) => scheduleStopIds.has(stop.id)).length;
        const coverageRatio = sampledStops.length > 0 ? (matchedStops / sampledStops.length) : 0;
        const anyDirectionMissingCoverage = geometry.directions.some((direction) => (
            direction.stops.slice(0, 5).every((stop) => !scheduleStopIds.has(stop.id))
        ));

        if (anyDirectionMissingCoverage || (sampledStops.length > 0 && coverageRatio < 0.35)) {
            needsFallback = true;
        }
    }

    if (!needsFallback) {
        return geometry;
    }

    if (tripApiGeometry?.directions.length) {
        return tripApiGeometry;
    }

    if (scheduleDirections.length > 0) {
        return {
            line: highlightedRoute.line,
            type: highlightedRoute.type,
            isNight: highlightedRoute.isNight,
            directions: scheduleDirections.map((direction) => ({
                id: direction.name,
                name: direction.name,
                mergedDirectionNames: direction.mergedDirectionNames,
                coordinates: direction.stops.map((stop) => [stop.longitude, stop.latitude] as [number, number]),
                stops: direction.stops.map((stop) => ({
                    id: stop.id,
                    name: stop.name,
                    latitude: stop.latitude,
                    longitude: stop.longitude,
                })),
            })),
        };
    }

    return geometry;
};

export const useRouteGeometry = (
    highlightedRoute: RouteSelection | null | undefined,
    onCameraFocus?: (lon: number, lat: number) => void,
    onRouteBoundsChange?: (bounds: { ne: [number, number]; sw: [number, number] } | null) => void,
) => {
    const [routeGeometry, setRouteGeometry] = useState<LineRouteGeometry | null>(null);
    const [routeGeometryVersion, setRouteGeometryVersion] = useState(0);
    const [routeStopSearch, setRouteStopSearch] = useState('');
    const [routeStopsPanelVisible, setRouteStopsPanelVisible] = useState(false);

    useEffect(() => {
        let isMounted = true;
        if (!highlightedRoute) {
            setRouteGeometryVersion((v) => v + 1);
            setRouteGeometry(null);
            onRouteBoundsChange?.(null);
            return () => { isMounted = false; };
        }

        (async () => {
            const geometry = await getRouteGeometryWithFallback(highlightedRoute);
            if (!isMounted) return;
            setRouteGeometryVersion((v) => v + 1);
            setRouteGeometry(geometry);

            if (!geometry?.directions.length) return;
            const allCoords = geometry.directions.flatMap((d) => d.coordinates);
            if (!allCoords.length) return;
            let minLon = Infinity;
            let maxLon = -Infinity;
            let minLat = Infinity;
            let maxLat = -Infinity;

            for (const [lon, lat] of allCoords) {
                if (lon < minLon) minLon = lon;
                if (lon > maxLon) maxLon = lon;
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
            }

            const lonSpread = maxLon - minLon;
            const latSpread = maxLat - minLat;
            const lonPad = Math.max(lonSpread * 0.18, 0.0035);
            const latPad = Math.max(latSpread * 0.18, 0.0035);
            onRouteBoundsChange?.({
                ne: [maxLon + lonPad, maxLat + latPad],
                sw: [minLon - lonPad, minLat - latPad],
            });
            const sum = allCoords.reduce((acc, c) => ({ lon: acc.lon + c[0], lat: acc.lat + c[1] }), { lon: 0, lat: 0 });
            onCameraFocus?.(sum.lon / allCoords.length, sum.lat / allCoords.length);
        })();

        return () => { isMounted = false; };
    }, [highlightedRoute]);

    useEffect(() => { setRouteStopsPanelVisible(false); }, [highlightedRoute]);

    const routeStopsFiltered = useMemo(() => {
        if (!routeGeometry) return [];
        const query = routeStopSearch.trim().toLowerCase();
        return routeGeometry.directions.flatMap((direction, dirIndex) =>
            direction.stops.map((stop, stopIndex) => ({
                ...stop, dirIndex, stopIndex,
                directionName: direction.name || `Посока ${dirIndex + 1}`,
            }))
        ).filter((s) => !query || s.name.toLowerCase().includes(query) || s.id.includes(query));
    }, [routeGeometry, routeStopSearch]);

    return {
        routeGeometry, routeGeometryVersion,
        routeStopSearch, setRouteStopSearch,
        routeStopsPanelVisible, setRouteStopsPanelVisible,
        routeStopsFiltered,
    };
};
