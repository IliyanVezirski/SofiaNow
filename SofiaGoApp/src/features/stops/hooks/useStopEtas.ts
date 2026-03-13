import { useState, useCallback } from 'react';
import { StopEta } from '../../../types/vehicles';
import { fetchStopEtas } from '../../../services/cgmApi/stopEtas';
import { MAX_RENDERED_STOPS } from '../../map/constants';
import { Stop } from '../../../services/stopsApi';

export const useStopEtas = () => {
    const [etasByStopId, setEtasByStopId] = useState<Record<string, StopEta[]>>({});

    const refreshEtasForStops = useCallback(async (stops: Stop[]) => {
        if (!stops.length) return;
        try {
            const etas = await fetchStopEtas(stops.slice(0, MAX_RENDERED_STOPS).map((s) => s.id));
            setEtasByStopId((prev) => ({ ...prev, ...etas }));
        } catch (err) {
            console.warn('ETA refresh failed:', err);
        }
    }, []);

    const refreshEtasForStop = useCallback(async (stopId: string) => {
        try {
            const etas = await fetchStopEtas([stopId]);
            setEtasByStopId((prev) => ({ ...prev, ...etas }));
        } catch (err) {
            console.warn('Failed to fetch stop ETA:', err);
        }
    }, []);

    return { etasByStopId, setEtasByStopId, refreshEtasForStops, refreshEtasForStop };
};
