import { useState, useRef, useCallback, useEffect } from 'react';
import { MapBounds } from '../../../types/map';
import {
    DEFAULT_CENTER_COORDINATE,
    DEFAULT_BOUNDS_DELTA,
    VIEWPORT_BOUNDS_UPDATE_DEBOUNCE_MS,
    hasMeaningfulBoundsChange,
    createFallbackBounds,
} from '../constants';

export const useMapBounds = () => {
    const [mapBounds, setMapBounds] = useState<MapBounds | null>(
        createFallbackBounds(DEFAULT_CENTER_COORDINATE[1], DEFAULT_CENTER_COORDINATE[0])
    );
    const mapBoundsRef = useRef<MapBounds | null>(null);
    const boundsDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { mapBoundsRef.current = mapBounds; }, [mapBounds]);

    useEffect(() => {
        return () => {
            if (boundsDebounceTimerRef.current) {
                clearTimeout(boundsDebounceTimerRef.current);
                boundsDebounceTimerRef.current = null;
            }
        };
    }, []);

    const scheduleBoundsUpdate = useCallback((nextBounds: MapBounds) => {
        if (!hasMeaningfulBoundsChange(mapBoundsRef.current, nextBounds)) return;
        if (boundsDebounceTimerRef.current) clearTimeout(boundsDebounceTimerRef.current);
        boundsDebounceTimerRef.current = setTimeout(() => {
            mapBoundsRef.current = nextBounds;
            setMapBounds(nextBounds);
        }, VIEWPORT_BOUNDS_UPDATE_DEBOUNCE_MS);
    }, []);

    return { mapBounds, setMapBounds, scheduleBoundsUpdate };
};
