import { useState, useCallback } from 'react';
import { StopEta } from '../../../types/vehicles';
import { fetchFullStopSchedule, fetchStopEtas } from '../../../services/cgmApi/stopEtas';
import { MAX_RENDERED_STOPS } from '../../map/constants';
import { Stop } from '../../../services/stopsApi';
import { resolveDisplayLineType, type VehicleType } from '../../../services/transitUtils';

type StopMarkerKind = VehicleType | 'night';

const NIGHT_LINE_RE = /^N\d+/i;
const STOP_MARKER_KIND_ORDER: StopMarkerKind[] = ['subway', 'tram', 'trolley', 'bus', 'night'];

const arraysEqual = <T extends string>(left: T[] | undefined, right: T[] | undefined) => (
    left === right || (!!left && !!right && left.length === right.length && left.every((value, index) => value === right[index]))
);

const areEtasEqual = (left: StopEta[] | undefined, right: StopEta[] | undefined) => {
    if (left === right) {
        return true;
    }

    if (!left || !right || left.length !== right.length) {
        return false;
    }

    return left.every((eta, index) => {
        const candidate = right[index];
        return eta.tripId === candidate.tripId
            && eta.routeId === candidate.routeId
            && eta.stopId === candidate.stopId
            && eta.line === candidate.line
            && eta.type === candidate.type
            && eta.destination === candidate.destination
            && eta.arrivalTimestamp === candidate.arrivalTimestamp
            && eta.minutesAway === candidate.minutesAway;
    });
};

const deriveMarkerKindsFromEtas = (etas: StopEta[]): StopMarkerKind[] => {
    const markerKinds = new Set<StopMarkerKind>();

    etas.forEach((eta) => {
        const normalizedLine = String(eta.line || '').trim().toUpperCase();
        if (NIGHT_LINE_RE.test(normalizedLine)) {
            markerKinds.add('night');
            return;
        }

        markerKinds.add(eta.type || resolveDisplayLineType(normalizedLine));
    });

    return Array.from(markerKinds).sort(
        (left, right) => STOP_MARKER_KIND_ORDER.indexOf(left) - STOP_MARKER_KIND_ORDER.indexOf(right),
    );
};

const deriveVehicleTypesFromEtas = (etas: StopEta[]): VehicleType[] => (
    Array.from(new Set(
        etas
            .map((eta) => eta.type || resolveDisplayLineType(eta.line))
            .filter(Boolean),
    )).sort() as VehicleType[]
);

export const useStopEtas = () => {
    const [etasByStopId, setEtasByStopId] = useState<Record<string, StopEta[]>>({});
    const [resolvedVehicleTypesByStopId, setResolvedVehicleTypesByStopId] = useState<Record<string, VehicleType[]>>({});
    const [stableMarkerKindsByStopId, setStableMarkerKindsByStopId] = useState<Record<string, StopMarkerKind[]>>({});

    const mergeIncomingEtas = useCallback((incomingEtasByStopId: Record<string, StopEta[]>) => {
        const nonEmptyEntries = Object.entries(incomingEtasByStopId).filter(([, etas]) => etas.length > 0);

        if (nonEmptyEntries.length) {
            setResolvedVehicleTypesByStopId((previous) => {
                let changed = false;
                const next = { ...previous };

                nonEmptyEntries.forEach(([stopId, etas]) => {
                    const resolvedTypes = deriveVehicleTypesFromEtas(etas);
                    if (!resolvedTypes.length || arraysEqual(previous[stopId], resolvedTypes)) {
                        return;
                    }

                    next[stopId] = resolvedTypes;
                    changed = true;
                });

                return changed ? next : previous;
            });

            setStableMarkerKindsByStopId((previous) => {
                let changed = false;
                const next = { ...previous };

                nonEmptyEntries.forEach(([stopId, etas]) => {
                    const markerKinds = deriveMarkerKindsFromEtas(etas);
                    if (!markerKinds.length || arraysEqual(previous[stopId], markerKinds)) {
                        return;
                    }

                    next[stopId] = markerKinds;
                    changed = true;
                });

                return changed ? next : previous;
            });
        }

        setEtasByStopId((previous) => {
            const incomingEntries = Object.entries(incomingEtasByStopId);
            if (!incomingEntries.length) {
                return previous;
            }

            let changed = false;
            const next = { ...previous };

            incomingEntries.forEach(([stopId, etas]) => {
                if (areEtasEqual(previous[stopId], etas)) {
                    return;
                }

                next[stopId] = etas;
                changed = true;
            });

            return changed ? next : previous;
        });
    }, []);

    const refreshEtasForStops = useCallback(async (stops: Stop[]) => {
        if (!stops.length) return;
        try {
            const etas = await fetchStopEtas(stops.slice(0, MAX_RENDERED_STOPS).map((s) => s.id));
            mergeIncomingEtas(etas);
        } catch (err) {
            console.warn('ETA refresh failed:', err);
        }
    }, [mergeIncomingEtas]);

    const refreshEtasForStop = useCallback(async (stopId: string) => {
        try {
            const fullEtas = await fetchFullStopSchedule(stopId);
            mergeIncomingEtas({ [stopId]: fullEtas });
        } catch (err) {
            console.warn('Failed to fetch stop ETA:', err);
        }
    }, [mergeIncomingEtas]);

    return {
        etasByStopId,
        resolvedVehicleTypesByStopId,
        setEtasByStopId,
        stableMarkerKindsByStopId,
        refreshEtasForStops,
        refreshEtasForStop,
    };
};
