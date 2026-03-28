import { useState, useEffect, useRef, useMemo } from 'react';
import { Vehicle } from '../../../types/vehicles';
import { haversineDistanceMeters } from '../../../services/transitUtils';
import { VehicleType } from '../../../services/transitUtils';
import {
    normalizeHeadingDegrees,
    shortestHeadingDelta,
    MAX_HEADING_STEP_DEGREES,
    LOW_SPEED_HEADING_LOCK_KPH,
    OVERLAP_GROUP_DECIMALS,
    OVERLAP_OFFSET_DEGREES,
    MAX_RENDERED_VEHICLES,
    VEHICLE_REFRESH_MS,
} from '../../map/constants';

const VEHICLE_ANIMATION_DURATION_MS = Math.max(900, VEHICLE_REFRESH_MS - 180);
const VEHICLE_TELEPORT_DISTANCE_METERS = 450;

type VehicleAnimationState = {
    vehicle: Vehicle;
    fromLatitude: number;
    fromLongitude: number;
    toLatitude: number;
    toLongitude: number;
    fromHeading: number;
    toHeading: number;
    startedAtMs: number;
    durationMs: number;
};

const interpolateHeading = (from: number, to: number, progress: number) =>
    normalizeHeadingDegrees(from + shortestHeadingDelta(from, to) * progress);

export const useVehicleAnimation = (
    vehicles: Vehicle[],
    selectedVehicleTypes: VehicleType[],
    selectedLines: string[],
    isRouteMode: boolean,
    highlightedRoute: { type: VehicleType; line: string } | null | undefined,
    selectedStopLines: string[],
) => {
    const [animatedVehicles, setAnimatedVehicles] = useState<Vehicle[]>([]);
    const lastHeadingByVehicleRef = useRef<Record<string, number>>({});
    const animatedVehiclesRef = useRef<Vehicle[]>([]);
    const animationFrameRef = useRef<number | null>(null);
    const animationStatesRef = useRef<Record<string, VehicleAnimationState>>({});

    useEffect(() => { animatedVehiclesRef.current = animatedVehicles; }, [animatedVehicles]);

    useEffect(() => () => {
        if (animationFrameRef.current != null) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!vehicles.length) {
            if (animationFrameRef.current != null) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            animationStatesRef.current = {};
            setAnimatedVehicles([]);
            return;
        }

        const stabilized = vehicles.map((vehicle) => {
            const previousHeading = lastHeadingByVehicleRef.current[vehicle.id];
            const nextHeading = Number(vehicle.headingDegrees);
            const hasNext = Number.isFinite(nextHeading);
            if (!hasNext) return { ...vehicle, headingDegrees: Number.isFinite(previousHeading) ? previousHeading : 0 };

            const normalizedNext = normalizeHeadingDegrees(nextHeading);
            if (!Number.isFinite(previousHeading)) {
                lastHeadingByVehicleRef.current[vehicle.id] = normalizedNext;
                return { ...vehicle, headingDegrees: normalizedNext };
            }
            if ((vehicle.speedKph || 0) < LOW_SPEED_HEADING_LOCK_KPH) {
                return { ...vehicle, headingDegrees: previousHeading };
            }
            const delta = shortestHeadingDelta(previousHeading, normalizedNext);
            const clamped = Math.max(-MAX_HEADING_STEP_DEGREES, Math.min(MAX_HEADING_STEP_DEGREES, delta));
            const stabilizedHeading = normalizeHeadingDegrees(previousHeading + clamped);
            lastHeadingByVehicleRef.current[vehicle.id] = stabilizedHeading;
            return { ...vehicle, headingDegrees: stabilizedHeading };
        });

        const currentAnimatedById = new Map(animatedVehiclesRef.current.map((vehicle) => [vehicle.id, vehicle]));
        const now = Date.now();

        animationStatesRef.current = stabilized.reduce<Record<string, VehicleAnimationState>>((accumulator, vehicle) => {
            const currentAnimated = currentAnimatedById.get(vehicle.id);
            const currentHeading = Number.isFinite(currentAnimated?.headingDegrees)
                ? Number(currentAnimated?.headingDegrees)
                : Number(vehicle.headingDegrees ?? 0);
            const nextHeading = Number.isFinite(vehicle.headingDegrees)
                ? Number(vehicle.headingDegrees)
                : currentHeading;
            const movedDistanceMeters = currentAnimated
                ? haversineDistanceMeters(
                    currentAnimated.latitude,
                    currentAnimated.longitude,
                    vehicle.latitude,
                    vehicle.longitude,
                )
                : 0;
            const shouldSnapToTarget = !currentAnimated || movedDistanceMeters >= VEHICLE_TELEPORT_DISTANCE_METERS;

            accumulator[vehicle.id] = {
                vehicle,
                fromLatitude: shouldSnapToTarget ? vehicle.latitude : currentAnimated.latitude,
                fromLongitude: shouldSnapToTarget ? vehicle.longitude : currentAnimated.longitude,
                toLatitude: vehicle.latitude,
                toLongitude: vehicle.longitude,
                fromHeading: shouldSnapToTarget ? nextHeading : currentHeading,
                toHeading: nextHeading,
                startedAtMs: now,
                durationMs: shouldSnapToTarget ? 0 : VEHICLE_ANIMATION_DURATION_MS,
            };

            return accumulator;
        }, {});

        if (animationFrameRef.current != null) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        const renderAnimationFrame = () => {
            const currentTime = Date.now();
            const states = Object.values(animationStatesRef.current);

            if (!states.length) {
                setAnimatedVehicles([]);
                animationFrameRef.current = null;
                return;
            }

            let hasActiveAnimations = false;
            const nextAnimatedVehicles = states.map((state) => {
                const progress = state.durationMs <= 0
                    ? 1
                    : Math.min(1, Math.max(0, (currentTime - state.startedAtMs) / state.durationMs));

                if (progress < 1) {
                    hasActiveAnimations = true;
                }

                return {
                    ...state.vehicle,
                    latitude: state.fromLatitude + (state.toLatitude - state.fromLatitude) * progress,
                    longitude: state.fromLongitude + (state.toLongitude - state.fromLongitude) * progress,
                    headingDegrees: interpolateHeading(state.fromHeading, state.toHeading, progress),
                };
            });

            setAnimatedVehicles(nextAnimatedVehicles);

            if (hasActiveAnimations) {
                animationFrameRef.current = requestAnimationFrame(renderAnimationFrame);
                return;
            }

            animationFrameRef.current = null;
        };

        renderAnimationFrame();
    }, [vehicles]);

    const vehiclesByType = useMemo(() => {
        if (!selectedVehicleTypes.length) return animatedVehicles;
        return animatedVehicles.filter((v) => selectedVehicleTypes.includes(v.type));
    }, [selectedVehicleTypes, animatedVehicles]);

    const filteredVehicles = useMemo(() => {
        const matchesStop = (vehicle: Vehicle) => {
            if (!selectedStopLines.length) return true;
            return selectedStopLines.includes(String(vehicle.line || '').trim().toUpperCase());
        };

        if (isRouteMode && highlightedRoute) {
            return animatedVehicles.filter((v) =>
                v.type === highlightedRoute.type && v.line === highlightedRoute.line && matchesStop(v)
            );
        }
        if (!selectedLines.length) return vehiclesByType.filter(matchesStop);
        return vehiclesByType.filter((v) => selectedLines.includes(v.line) && matchesStop(v));
    }, [selectedLines, vehiclesByType, isRouteMode, highlightedRoute, animatedVehicles, selectedStopLines]);

    const displayVehicles = useMemo(() => {
        const grouped = new Map<string, Vehicle[]>();
        filteredVehicles.forEach((v) => {
            const key = `${v.latitude.toFixed(OVERLAP_GROUP_DECIMALS)}:${v.longitude.toFixed(OVERLAP_GROUP_DECIMALS)}`;
            const existing = grouped.get(key) || [];
            existing.push(v);
            grouped.set(key, existing);
        });
        return Array.from(grouped.values()).flatMap((group) => {
            if (group.length === 1) return group;
            const stable = group.slice().sort((a, b) => a.id.localeCompare(b.id));
            return stable.map((v, i) => {
                const angle = (Math.PI * 2 * i) / group.length;
                return { ...v, latitude: v.latitude + Math.sin(angle) * OVERLAP_OFFSET_DEGREES, longitude: v.longitude + Math.cos(angle) * OVERLAP_OFFSET_DEGREES };
            });
        });
    }, [filteredVehicles]);

    const renderedDisplayVehicles = useMemo(() => {
        const unique = new Map<string, Vehicle>();
        displayVehicles.forEach((v) => { if (!unique.has(v.id)) unique.set(v.id, v); });
        return Array.from(unique.values()).slice(0, MAX_RENDERED_VEHICLES).map((v) => ({ ...v, renderId: `vehicle-${v.id}` }));
    }, [displayVehicles]);

    return { animatedVehicles, filteredVehicles, displayVehicles, renderedDisplayVehicles };
};
