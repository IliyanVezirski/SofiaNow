import { useState, useMemo, useEffect, useCallback } from 'react';
import { VehicleType } from '../../../services/transitUtils';
import { Vehicle } from '../../../types/vehicles';
import { AvailableLine, fetchAvailableLines } from '../../../services/stopsApi';
import { RouteSelection } from '../../../types/routes';

export const useFilters = (
    highlightedRoute: RouteSelection | null | undefined,
    onFilterCountChange?: (count: number) => void,
) => {
    const [selectedVehicleTypes, setSelectedVehicleTypes] = useState<VehicleType[]>([]);
    const [selectedLines, setSelectedLines] = useState<string[]>([]);
    const [staticLines, setStaticLines] = useState<AvailableLine[]>([]);

    useEffect(() => {
        void fetchAvailableLines().then(setStaticLines);
    }, []);

    useEffect(() => {
        onFilterCountChange?.(selectedVehicleTypes.length + selectedLines.length);
    }, [selectedVehicleTypes.length, selectedLines.length, onFilterCountChange]);

    const isRouteMode = !!highlightedRoute;

    useEffect(() => {
        if (!highlightedRoute) {
            setSelectedVehicleTypes([]);
            setSelectedLines([]);
            return;
        }
        setSelectedVehicleTypes([highlightedRoute.type]);
        setSelectedLines([highlightedRoute.line]);
    }, [highlightedRoute]);

    const toggleVehicleTypeFilter = useCallback((vehicleType: VehicleType) => {
        setSelectedVehicleTypes((prev) =>
            prev.includes(vehicleType) ? prev.filter((t) => t !== vehicleType) : [...prev, vehicleType]
        );
    }, []);

    const toggleLineFilter = useCallback((line: string) => {
        setSelectedLines((prev) =>
            prev.includes(line) ? prev.filter((l) => l !== line) : [...prev, line]
        );
    }, []);

    const liveLineSet = useCallback((vehicles: Vehicle[]) => new Set(vehicles.map((v) => v.line)), []);

    const availableLines = useMemo(() => {
        if (isRouteMode && highlightedRoute?.line) return [highlightedRoute.line];
        let filtered = staticLines;
        if (selectedVehicleTypes.length) {
            filtered = filtered.filter((l) => selectedVehicleTypes.includes(l.isNight ? 'bus' : l.type));
        }
        return Array.from(new Set(filtered.map((l) => l.line)))
            .sort((a, b) => a.localeCompare(b, 'bg', { numeric: true }));
    }, [staticLines, isRouteMode, highlightedRoute, selectedVehicleTypes]);

    return {
        selectedVehicleTypes, setSelectedVehicleTypes,
        selectedLines, setSelectedLines,
        staticLines,
        isRouteMode,
        availableLines,
        toggleVehicleTypeFilter, toggleLineFilter,
        liveLineSet,
    };
};
