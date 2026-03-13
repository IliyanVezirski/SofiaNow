import { useState, useRef, useCallback } from 'react';
import { Stop, fetchStopById } from '../../../services/stopsApi';

export const useSelectedStop = () => {
    const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
    const [selectedStopAnnotationId, setSelectedStopAnnotationId] = useState<string | null>(null);
    const selectedStopIdRef = useRef<string | null>(null);
    const suppressMapPressUntilRef = useRef(0);

    const openStopDetails = useCallback(async (stop: Stop) => {
        suppressMapPressUntilRef.current = Date.now() + 400;
        selectedStopIdRef.current = stop.id;
        setSelectedStopAnnotationId(`stop-${stop.id}`);
        setSelectedStop(stop);
    }, []);

    const openRouteStopDetails = useCallback(async (
        routeStop: { id: string; name: string; latitude: number; longitude: number },
        directionName: string,
        annotationId: string,
        stopById: Record<string, Stop>,
        routeGeometryLine?: string,
        highlightedLine?: string,
    ) => {
        suppressMapPressUntilRef.current = Date.now() + 400;
        selectedStopIdRef.current = routeStop.id;
        setSelectedStopAnnotationId(annotationId);
        const existingStop = stopById[routeStop.id];
        if (existingStop) { setSelectedStop(existingStop); return; }

        const resolvedStop = await fetchStopById(routeStop.id);
        if (resolvedStop) { setSelectedStop(resolvedStop); return; }

        const lineLabel = routeGeometryLine || highlightedLine || '';
        setSelectedStop({
            id: routeStop.id,
            name: routeStop.name,
            latitude: routeStop.latitude,
            longitude: routeStop.longitude,
            lines: lineLabel ? [lineLabel] : [],
            directions: directionName ? [directionName] : [],
        });
    }, []);

    const closeSelectedStop = useCallback(() => {
        selectedStopIdRef.current = null;
        setSelectedStop(null);
        setSelectedStopAnnotationId(null);
    }, []);

    return {
        selectedStop, setSelectedStop,
        selectedStopAnnotationId, setSelectedStopAnnotationId,
        selectedStopIdRef, suppressMapPressUntilRef,
        openStopDetails, openRouteStopDetails, closeSelectedStop,
    };
};
