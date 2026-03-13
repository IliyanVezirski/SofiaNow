import { useState, useEffect, useMemo } from 'react';
import { LineRouteGeometry, fetchLineRouteGeometry, fetchLineRouteGeometryByRouteId } from '../../../services/stopsApi';
import { RouteSelection } from '../../../types/routes';

export const useRouteGeometry = (
    highlightedRoute: RouteSelection | null | undefined,
    onCameraFocus?: (lon: number, lat: number) => void,
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
            return () => { isMounted = false; };
        }

        (async () => {
            const geometry = highlightedRoute.routeId
                ? await fetchLineRouteGeometryByRouteId(highlightedRoute.routeId)
                : await fetchLineRouteGeometry(highlightedRoute.line, highlightedRoute.type, highlightedRoute.isNight);
            if (!isMounted) return;
            setRouteGeometryVersion((v) => v + 1);
            setRouteGeometry(geometry);

            if (!geometry?.directions.length) return;
            const allCoords = geometry.directions.flatMap((d) => d.coordinates);
            if (!allCoords.length) return;
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
