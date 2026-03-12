import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal, Pressable, ScrollView, TextInput, Linking, LogBox } from 'react-native';
import * as Location from 'expo-location';
import { fetchStopEtas, fetchVehiclesInBounds, fetchFullStopSchedule, getStaticStopSchedule, fetchTripDelay, getEtaScheduleInfo, fetchTripStops, TripStopInfo, StopEta, StaticScheduleEntry, Vehicle, DayType, getDayTypeForDate } from '../services/cgmApi';

LogBox.ignoreLogs(["Can't update annotation"]);
import { AvailableLine, fetchAllStops, fetchAvailableLines, fetchLineRouteGeometry, fetchLineRouteGeometryByRouteId, fetchOsrmRoute, fetchStopById, fetchStopsInBounds, LineRouteGeometry, MapBounds, Stop, summarizeStopDirections } from '../services/stopsApi';
import { addFavoritePlace, FavoritePlace, loadFavoritePlaces, PlaceSearchResult, removeFavoritePlace, searchLocations } from '../services/places';
import MapboxGL from '@maplibre/maplibre-react-native';
import { VehicleType, formatUnixTime, getVehicleAccentColor, getVehicleIcon, getVehicleTypeLabel, inferLineTypeFromToken, VEHICLE_TYPE_ORDER } from '../services/transitUtils';
import { RouteSelection } from '../types/routes';

const VEHICLE_REFRESH_MS = 3000;
const STOP_ETA_REFRESH_MS = 20000;
const INITIAL_ZOOM_LEVEL = 16;
const VEHICLE_ANIMATION_MS = 420;
const STOP_ETA_PREVIEW_COUNT = 3;
const MAX_RENDERED_VEHICLES = 40;
const DEFAULT_CENTER_COORDINATE: [number, number] = [23.3219, 42.6977];
const DEFAULT_BOUNDS_DELTA = 0.03;
const MAX_HEADING_STEP_DEGREES = 32;
const LOW_SPEED_HEADING_LOCK_KPH = 4;
const OVERLAP_GROUP_DECIMALS = 4;
const OVERLAP_OFFSET_DEGREES = 0.00008;
const MAX_RENDERED_STOPS = 30;
const VIEWPORT_BOUNDS_UPDATE_DEBOUNCE_MS = 300;
const MIN_BOUNDS_DELTA_FOR_REFRESH = 0.0008;
const MAP_STYLE = {
    version: 8,
    sources: {
        osm: {
            type: 'raster',
            tiles: [
                'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution: '© OpenStreetMap contributors',
        },
    },
    layers: [
        {
            id: 'osm-raster-layer',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 22,
        },
    ],
} as const;

const createFallbackBounds = (latitude: number, longitude: number): MapBounds => ({
    north: latitude + DEFAULT_BOUNDS_DELTA,
    south: latitude - DEFAULT_BOUNDS_DELTA,
    east: longitude + DEFAULT_BOUNDS_DELTA,
    west: longitude - DEFAULT_BOUNDS_DELTA,
});

const hasMeaningfulBoundsChange = (previous: MapBounds | null, next: MapBounds) => {
    if (!previous) {
        return true;
    }

    return Math.max(
        Math.abs(previous.north - next.north),
        Math.abs(previous.south - next.south),
        Math.abs(previous.east - next.east),
        Math.abs(previous.west - next.west),
    ) >= MIN_BOUNDS_DELTA_FOR_REFRESH;
};

const getDirectionAccentColor = (directionIndex: number) => {
    return directionIndex % 2 === 0 ? '#1D4ED8' : '#F97316';
};

const normalizeHeadingDegrees = (value: number) => ((value % 360) + 360) % 360;

const shortestHeadingDelta = (from: number, to: number) => {
    let delta = to - from;
    if (delta > 180) {
        delta -= 360;
    }
    if (delta < -180) {
        delta += 360;
    }
    return delta;
};

const interpolateHeadingDegrees = (from: number, to: number, progress: number) => {
    return normalizeHeadingDegrees(from + (shortestHeadingDelta(from, to) * progress));
};

const computeHeadingDegrees = (from: [number, number], to: [number, number]) => {
    const deltaLon = to[0] - from[0];
    const deltaLat = to[1] - from[1];
    const radians = Math.atan2(deltaLon, deltaLat);
    return (radians * 180) / Math.PI;
};

const getDirectionArrowSamples = (coordinates: [number, number][], maxArrows = 14) => {
    if (coordinates.length < 3) {
        return [] as Array<{ coordinate: [number, number]; headingDegrees: number }>;
    }

    const segmentCount = coordinates.length - 1;
    const step = Math.max(1, Math.floor(segmentCount / maxArrows));
    const samples: Array<{ coordinate: [number, number]; headingDegrees: number }> = [];

    for (let i = step; i < segmentCount; i += step) {
        const from = coordinates[i - 1];
        const to = coordinates[i];
        samples.push({
            coordinate: to,
            headingDegrees: computeHeadingDegrees(from, to),
        });
    }

    return samples;
};

interface MapScreenProps {
    highlightedRoute?: RouteSelection | null;
    filterPanelVisible?: boolean;
    searchRequestToken?: number;
    favoritesRequestToken?: number;
    recenterRequestToken?: number;
    dismissTransientPanelsToken?: number;
    onFilterCountChange?: (count: number) => void;
    focusStopCoordinate?: { latitude: number; longitude: number } | null;
    focusStopId?: string | null;
}

type CentralSearchResult =
    | { kind: 'place'; id: string; name: string; subtitle: string; latitude: number; longitude: number }
    | { kind: 'line'; id: string; lineInfo: AvailableLine; name: string; subtitle: string }
    | { kind: 'stop'; id: string; stop: Stop; name: string; subtitle: string };

export default function MapScreen({
    highlightedRoute,
    filterPanelVisible = true,
    searchRequestToken,
    favoritesRequestToken,
    recenterRequestToken,
    dismissTransientPanelsToken,
    onFilterCountChange,
    focusStopCoordinate,
    focusStopId,
}: MapScreenProps) {
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [animatedVehicles, setAnimatedVehicles] = useState<Vehicle[]>([]);
    const [stops, setStops] = useState<Stop[]>([]);
    const [reportModalVisible, setReportModalVisible] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [selectedVehicleTypes, setSelectedVehicleTypes] = useState<VehicleType[]>([]);
    const [selectedLines, setSelectedLines] = useState<string[]>([]);
    const [staticLines, setStaticLines] = useState<AvailableLine[]>([]);

    useEffect(() => {
        onFilterCountChange?.(selectedVehicleTypes.length + selectedLines.length);
    }, [selectedVehicleTypes.length, selectedLines.length, onFilterCountChange]);

    const [etasByStopId, setEtasByStopId] = useState<Record<string, StopEta[]>>({});
    const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
    const [selectedStopAnnotationId, setSelectedStopAnnotationId] = useState<string | null>(null);
    const [mapCenterCoordinate, setMapCenterCoordinate] = useState<[number, number]>(DEFAULT_CENTER_COORDINATE);
    const [mapBounds, setMapBounds] = useState<MapBounds | null>(createFallbackBounds(DEFAULT_CENTER_COORDINATE[1], DEFAULT_CENTER_COORDINATE[0]));
    const [cameraLockedToInitialView, setCameraLockedToInitialView] = useState(false);
    const [hasInitialCameraTarget, setHasInitialCameraTarget] = useState(false);
    const [routeGeometry, setRouteGeometry] = useState<LineRouteGeometry | null>(null);
    const [routeGeometryVersion, setRouteGeometryVersion] = useState(0);
    const [routeStopSearch, setRouteStopSearch] = useState('');
    const [locationSearchQuery, setLocationSearchQuery] = useState('');
    const [locationSearchResults, setLocationSearchResults] = useState<PlaceSearchResult[]>([]);
    const [locationSearchLoading, setLocationSearchLoading] = useState(false);
    const [searchableStops, setSearchableStops] = useState<Stop[]>([]);
    const [favoritePlaces, setFavoritePlaces] = useState<FavoritePlace[]>([]);
    const [favoritesVisible, setFavoritesVisible] = useState(false);
    const [searchModalVisible, setSearchModalVisible] = useState(false);
    const [scheduleStopId, setScheduleStopId] = useState<string | null>(null);
    const [scheduleStopName, setScheduleStopName] = useState('');
    const [scheduleRealtime, setScheduleRealtime] = useState<StopEta[]>([]);
    const [scheduleStatic, setScheduleStatic] = useState<StaticScheduleEntry[]>([]);
    const [scheduleDayType, setScheduleDayType] = useState<DayType>(getDayTypeForDate());
    const [scheduleLoading, setScheduleLoading] = useState(false);
    const [vehicleDelays, setVehicleDelays] = useState<Record<string, number | null>>({});
    const [droppedPin, setDroppedPin] = useState<{ latitude: number; longitude: number } | null>(null);
    const [vehicleRouteStops, setVehicleRouteStops] = useState<TripStopInfo[]>([]);
    const [vehicleRouteLoading, setVehicleRouteLoading] = useState(false);
    const [vehicleRouteVehicleId, setVehicleRouteVehicleId] = useState<string | null>(null);
    const [vehicleRouteCoords, setVehicleRouteCoords] = useState<[number, number][]>([]);
    const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
    const selectedVehicleIdRef = useRef<string | null>(null);
    const lastHeadingByVehicleRef = useRef<Record<string, number>>({});
    const previousPositionsRef = useRef<Record<string, { lat: number; lon: number; heading: number }>>({});
    const animatedVehiclesRef = useRef<Vehicle[]>([]);
    const vehicleAnimationFrameRef = useRef<number | null>(null);
    const isRouteMode = !!highlightedRoute;
    const hasVehicleRoute = vehicleRouteStops.length > 0;
    const visibleStopsRef = useRef<Stop[]>([]);
    const mapBoundsRef = useRef<MapBounds | null>(null);
    const boundsDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suppressMapPressUntilRef = useRef(0);
    const selectedStopIdRef = useRef<string | null>(null);

    useEffect(() => {
        mapBoundsRef.current = mapBounds;
    }, [mapBounds]);

    useEffect(() => {
        return () => {
            if (boundsDebounceTimerRef.current) {
                clearTimeout(boundsDebounceTimerRef.current);
                boundsDebounceTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        void (async () => {
            const [favorites, lines, allStops] = await Promise.all([loadFavoritePlaces(), fetchAvailableLines(), fetchAllStops()]);
            setFavoritePlaces(favorites);
            setStaticLines(lines);
            setSearchableStops(allStops);
        })();
    }, []);

    useEffect(() => {
        const normalizedQuery = locationSearchQuery.trim();
        if (!normalizedQuery) {
            setLocationSearchResults([]);
            setLocationSearchLoading(false);
            return;
        }

        let isMounted = true;
        setLocationSearchLoading(true);
        const timer = setTimeout(() => {
            void (async () => {
                try {
                    const results = await searchLocations(normalizedQuery, 6);
                    if (isMounted) {
                        setLocationSearchResults(results);
                    }
                } catch (error) {
                    console.warn('Location search failed:', error);
                    if (isMounted) {
                        setLocationSearchResults([]);
                    }
                } finally {
                    if (isMounted) {
                        setLocationSearchLoading(false);
                    }
                }
            })();
        }, 320);

        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [locationSearchQuery]);

    useEffect(() => {
        if (typeof searchRequestToken === 'number' && searchRequestToken > 0) {
            setSearchModalVisible((prev) => {
                const next = !prev;
                if (next) {
                    setFavoritesVisible(false);
                }
                return next;
            });
        }
    }, [searchRequestToken]);

    useEffect(() => {
        if (typeof favoritesRequestToken === 'number' && favoritesRequestToken > 0) {
            setSearchModalVisible(false);
            setFavoritesVisible((prev) => !prev);
        }
    }, [favoritesRequestToken]);

    useEffect(() => {
        if (typeof recenterRequestToken === 'number' && recenterRequestToken > 0) {
            void recenterToUserLocation();
        }
    }, [recenterRequestToken]);

    useEffect(() => {
        if (focusStopCoordinate) {
            focusMapOnCoordinate(focusStopCoordinate.latitude, focusStopCoordinate.longitude);
        }

        if (!focusStopCoordinate || !focusStopId) {
            return;
        }

        let cancelled = false;

        (async () => {
            suppressMapPressUntilRef.current = Date.now() + 400;
            selectedStopIdRef.current = focusStopId;
            setSelectedStopAnnotationId(`stop-${focusStopId}`);
            selectedVehicleIdRef.current = null;
            setSelectedVehicleId(null);
            setDroppedPin(null);

            const resolvedStop = await fetchStopById(focusStopId);
            if (cancelled) return;

            if (resolvedStop) {
                setSelectedStop(resolvedStop);
            } else {
                setSelectedStop({
                    id: focusStopId,
                    name: focusStopId,
                    latitude: focusStopCoordinate.latitude,
                    longitude: focusStopCoordinate.longitude,
                    lines: [],
                    directions: [],
                });
            }

            await refreshStopEtas(focusStopId);
        })();

        return () => {
            cancelled = true;
        };
    }, [focusStopCoordinate, focusStopId]);

    useEffect(() => {
        if (typeof dismissTransientPanelsToken === 'number' && dismissTransientPanelsToken > 0) {
            setSearchModalVisible(false);
            setFavoritesVisible(false);
        }
    }, [dismissTransientPanelsToken]);

    useEffect(() => {
        if (filterPanelVisible) {
            setSearchModalVisible(false);
            setFavoritesVisible(false);
        }
    }, [filterPanelVisible]);

    useEffect(() => {
        animatedVehiclesRef.current = animatedVehicles;
    }, [animatedVehicles]);

    const vehiclesByType = useMemo(() => {
        if (!selectedVehicleTypes.length) {
            return animatedVehicles;
        }

        return animatedVehicles.filter((vehicle) => selectedVehicleTypes.includes(vehicle.type));
    }, [selectedVehicleTypes, animatedVehicles]);
    const liveLineSet = useMemo(() => {
        return new Set(vehicles.map((v) => v.line));
    }, [vehicles]);

    const availableLines = useMemo(() => {
        if (isRouteMode && highlightedRoute?.line) {
            return [highlightedRoute.line];
        }

        let filtered = staticLines;
        if (selectedVehicleTypes.length) {
            filtered = filtered.filter((l) => selectedVehicleTypes.includes(l.isNight ? 'bus' : l.type));
        }

        return Array.from(new Set(filtered.map((l) => l.line)))
            .sort((left, right) => left.localeCompare(right, 'bg', { numeric: true }));
    }, [staticLines, isRouteMode, highlightedRoute, selectedVehicleTypes]);

    const centralSearchResults = useMemo(() => {
        const q = locationSearchQuery.trim().toLowerCase();
        if (!q) return [] as CentralSearchResult[];

        const stopResults: CentralSearchResult[] = searchableStops
            .filter((stop) => stop.name.toLowerCase().includes(q) || stop.id.toLowerCase().includes(q))
            .slice(0, 8)
            .map((stop) => ({
                kind: 'stop',
                id: stop.id,
                stop,
                name: stop.name,
                subtitle: `Спирка • ${stop.id}${stop.lines.length ? ` • Линии: ${stop.lines.slice(0, 4).join(', ')}` : ''}`,
            }));

        const lineResults: CentralSearchResult[] = staticLines
            .filter((line) => line.line.toLowerCase().includes(q) || line.routeId.toLowerCase().includes(q))
            .slice(0, 8)
            .map((line) => ({
                kind: 'line',
                id: `${line.routeId}:${line.line}:${line.type}`,
                lineInfo: line,
                name: `${getVehicleIcon(line.type)} Линия ${line.line}`,
                subtitle: `${line.isNight ? 'Нощна линия' : line.type} • routeId: ${line.routeId || 'н/д'}`,
            }));

        const placeResults: CentralSearchResult[] = locationSearchResults
            .slice(0, 8)
            .map((place) => ({
                kind: 'place',
                id: place.id,
                name: place.name,
                subtitle: place.subtitle,
                latitude: place.latitude,
                longitude: place.longitude,
            }));

        return [...stopResults, ...lineResults, ...placeResults].slice(0, 20);
    }, [locationSearchQuery, searchableStops, staticLines, locationSearchResults]);
    const selectedStopLines = useMemo(() => {
        if (!selectedStop?.lines?.length) {
            return [] as string[];
        }

        return selectedStop.lines
            .map((line) => String(line || '').trim().toUpperCase())
            .filter(Boolean);
    }, [selectedStop]);
    const filteredVehicles = useMemo(() => {
        const matchesSelectedStop = (vehicle: Vehicle) => {
            if (!selectedStopLines.length) {
                return true;
            }

            return selectedStopLines.includes(String(vehicle.line || '').trim().toUpperCase());
        };

        if (isRouteMode && highlightedRoute) {
            return animatedVehicles.filter((vehicle) => (
                vehicle.type === highlightedRoute.type
                && vehicle.line === highlightedRoute.line
                && matchesSelectedStop(vehicle)
            ));
        }

        if (!selectedLines.length) {
            return vehiclesByType.filter(matchesSelectedStop);
        }

        return vehiclesByType.filter((vehicle) => selectedLines.includes(vehicle.line) && matchesSelectedStop(vehicle));
    }, [selectedLines, vehiclesByType, isRouteMode, highlightedRoute, animatedVehicles, selectedStopLines]);
    const displayVehicles = useMemo(() => {
        const groupedVehicles = new Map<string, Vehicle[]>();

        filteredVehicles.forEach((vehicle) => {
            const key = `${vehicle.latitude.toFixed(OVERLAP_GROUP_DECIMALS)}:${vehicle.longitude.toFixed(OVERLAP_GROUP_DECIMALS)}`;
            const existingGroup = groupedVehicles.get(key) || [];
            existingGroup.push(vehicle);
            groupedVehicles.set(key, existingGroup);
        });

        return Array.from(groupedVehicles.values()).flatMap((group) => {
            if (group.length === 1) {
                return group;
            }

            const stableGroup = group.slice().sort((left, right) => left.id.localeCompare(right.id));
            return stableGroup.map((vehicle, index) => {
                const angle = (Math.PI * 2 * index) / group.length;
                return {
                    ...vehicle,
                    latitude: vehicle.latitude + (Math.sin(angle) * OVERLAP_OFFSET_DEGREES),
                    longitude: vehicle.longitude + (Math.cos(angle) * OVERLAP_OFFSET_DEGREES),
                };
            });
        });
    }, [filteredVehicles]);
    const renderedDisplayVehicles = useMemo(() => {
        const uniqueByVehicleId = new Map<string, Vehicle>();
        displayVehicles.forEach((vehicle) => {
            if (!uniqueByVehicleId.has(vehicle.id)) {
                uniqueByVehicleId.set(vehicle.id, vehicle);
            }
        });

        return Array.from(uniqueByVehicleId.values())
            .slice(0, MAX_RENDERED_VEHICLES)
            .map((vehicle) => ({
                ...vehicle,
                renderId: `vehicle-${vehicle.id}`,
            }));
    }, [displayVehicles]);

    const selectedVehicle = useMemo(() => {
        if (!selectedVehicleId) return null;
        return renderedDisplayVehicles.find((v) => v.id === selectedVehicleId) ?? null;
    }, [selectedVehicleId, renderedDisplayVehicles]);

    const filteredStops = useMemo(() => {
        if (isRouteMode) {
            return stops;
        }

        const normalizedSelectedLines = selectedLines.map((line) => String(line || '').trim().toUpperCase());
        return stops.filter((stop) => {
            const normalizedStopLines = stop.lines.map((line) => String(line || '').trim().toUpperCase()).filter(Boolean);
            const matchesLine = !normalizedSelectedLines.length || normalizedSelectedLines.some((line) => normalizedStopLines.includes(line));
            if (!matchesLine) {
                return false;
            }

            if (!selectedVehicleTypes.length) {
                return true;
            }

            return normalizedStopLines.some((line) => selectedVehicleTypes.includes(inferLineTypeFromToken(line)));
        });
    }, [stops, selectedLines, selectedVehicleTypes, isRouteMode]);
    const renderedStops = useMemo(() => {
        if (isRouteMode) {
            return filteredStops;
        }

        // First keep only stops inside visible bounds
        const inBounds = mapBounds
            ? filteredStops.filter((stop) =>
                stop.latitude <= mapBounds.north
                && stop.latitude >= mapBounds.south
                && stop.longitude <= mapBounds.east
                && stop.longitude >= mapBounds.west
            )
            : filteredStops;

        if (inBounds.length <= MAX_RENDERED_STOPS) {
            return inBounds;
        }

        // Over the limit — keep closest to center
        const [centerLongitude, centerLatitude] = mapCenterCoordinate;
        return inBounds
            .slice()
            .sort((left, right) => {
                const ld = (left.latitude - centerLatitude) ** 2 + (left.longitude - centerLongitude) ** 2;
                const rd = (right.latitude - centerLatitude) ** 2 + (right.longitude - centerLongitude) ** 2;
                return ld - rd;
            })
            .slice(0, MAX_RENDERED_STOPS);
    }, [filteredStops, isRouteMode, mapCenterCoordinate, mapBounds]);
    const stopNameById = useMemo(() => {
        return stops.reduce<Record<string, string>>((result, stop) => {
            result[stop.id] = stop.name;
            return result;
        }, {});
    }, [stops]);
    const stopById = useMemo(() => {
        return stops.reduce<Record<string, Stop>>((result, stop) => {
            result[stop.id] = stop;
            return result;
        }, {});
    }, [stops]);
    const routeStopsFiltered = useMemo(() => {
        if (!routeGeometry) return [];
        const query = routeStopSearch.trim().toLowerCase();
        return routeGeometry.directions.flatMap((direction, dirIndex) =>
            direction.stops.map((stop, stopIndex) => ({
                ...stop,
                dirIndex,
                stopIndex,
                directionName: direction.name || `Посока ${dirIndex + 1}`,
            }))
        ).filter((stop) => !query || stop.name.toLowerCase().includes(query) || stop.id.includes(query));
    }, [routeGeometry, routeStopSearch]);

    const toggleVehicleTypeFilter = (vehicleType: VehicleType) => {
        setSelectedVehicleTypes((prev) => (
            prev.includes(vehicleType)
                ? prev.filter((type) => type !== vehicleType)
                : [...prev, vehicleType]
        ));
    };

    const toggleLineFilter = (line: string) => {
        setSelectedLines((prev) => (
            prev.includes(line)
                ? prev.filter((entry) => entry !== line)
                : [...prev, line]
        ));
    };

    useEffect(() => {
        if (!vehicles.length) {
            setAnimatedVehicles([]);
            return;
        }

        const stabilizedVehicles = vehicles.map((vehicle) => {
            const previousHeading = lastHeadingByVehicleRef.current[vehicle.id];
            const nextHeading = Number(vehicle.headingDegrees);
            const hasNextHeading = Number.isFinite(nextHeading);

            if (!hasNextHeading) {
                return {
                    ...vehicle,
                    headingDegrees: Number.isFinite(previousHeading) ? previousHeading : 0,
                };
            }

            const normalizedNext = normalizeHeadingDegrees(nextHeading);
            if (!Number.isFinite(previousHeading)) {
                lastHeadingByVehicleRef.current[vehicle.id] = normalizedNext;
                return { ...vehicle, headingDegrees: normalizedNext };
            }

            if ((vehicle.speedKph || 0) < LOW_SPEED_HEADING_LOCK_KPH) {
                return { ...vehicle, headingDegrees: previousHeading };
            }

            const delta = shortestHeadingDelta(previousHeading, normalizedNext);
            const clampedDelta = Math.max(-MAX_HEADING_STEP_DEGREES, Math.min(MAX_HEADING_STEP_DEGREES, delta));
            const stabilizedHeading = normalizeHeadingDegrees(previousHeading + clampedDelta);
            lastHeadingByVehicleRef.current[vehicle.id] = stabilizedHeading;

            return { ...vehicle, headingDegrees: stabilizedHeading };
        });

        setAnimatedVehicles(stabilizedVehicles);
    }, [vehicles]);

    useEffect(() => {
        let isMounted = true;
        (async () => {
            const applyLocation = (loc: Location.LocationObject) => {
                if (!isMounted) return;
                setLocation(loc);
                if (!highlightedRoute) {
                    setHasInitialCameraTarget(true);
                    setCameraLockedToInitialView(true);
                }
                setMapCenterCoordinate([loc.coords.longitude, loc.coords.latitude]);
                setMapBounds(createFallbackBounds(loc.coords.latitude, loc.coords.longitude));
            };

            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === 'granted') {
                    // Try last known position first (instant, no GPS wait)
                    const lastKnown = await Location.getLastKnownPositionAsync();
                    if (lastKnown && isMounted) {
                        applyLocation(lastKnown);
                    }
                    // Then get accurate position (may take seconds)
                    const loc = await Location.getCurrentPositionAsync({});
                    applyLocation(loc);
                    return;
                }
            } catch (err) {
                console.warn('Location unavailable, using default center:', err);
            }

            if (isMounted && !highlightedRoute) {
                setHasInitialCameraTarget(true);
                setCameraLockedToInitialView(true);
            }
        })();

        return () => {
            isMounted = false;
        };
    }, []);

    const lastStopBoundsRef = useRef<MapBounds | null>(null);

    useEffect(() => {
        if (!mapBounds) {
            return;
        }

        let isMounted = true;

        // Load stops once per new viewport (not on every poll cycle)
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
                    if (!isMounted) {
                        return;
                    }

                    visibleStopsRef.current = visibleStops;
                    setStops(visibleStops);

                    const etasByStop = await fetchStopEtas(
                        visibleStops.slice(0, MAX_RENDERED_STOPS).map((stop) => stop.id)
                    );
                    if (isMounted) {
                        setEtasByStopId(etasByStop);
                    }
                } catch (apiErr) {
                    console.error('Stop load failed:', apiErr);
                }
            })();
        }

        let fetchInFlight = false;

        const refreshVehiclesOnly = async () => {
            if (fetchInFlight) {
                return;
            }

            fetchInFlight = true;
            try {
                const visibleVehicles = await fetchVehiclesInBounds(mapBounds);
                if (!isMounted) {
                    return;
                }

                setVehicles(visibleVehicles);
                setLastUpdated(new Date());

                // Refresh ETAs piggyback — trip updates are already cached, so this is cheap
                const currentStops = visibleStopsRef.current;
                if (currentStops.length) {
                    const etasByStop = await fetchStopEtas(
                        currentStops.slice(0, MAX_RENDERED_STOPS).map((s) => s.id)
                    );
                    if (isMounted) {
                        setEtasByStopId(etasByStop);
                    }
                }
            } catch (apiErr) {
                console.error('Vehicle refresh failed:', apiErr);
            } finally {
                fetchInFlight = false;
            }
        };

        void refreshVehiclesOnly();

        const vehicleRefreshTimer = setInterval(() => {
            void refreshVehiclesOnly();
        }, VEHICLE_REFRESH_MS);

        return () => {
            isMounted = false;
            clearInterval(vehicleRefreshTimer);
        };
    }, [mapBounds]);

    useEffect(() => {
        let isMounted = true;

        if (!highlightedRoute) {
            setRouteGeometryVersion((v) => v + 1);
            setRouteGeometry(null);
            setSelectedVehicleTypes([]);
            setSelectedLines([]);
            return () => {
                isMounted = false;
            };
        }

        setSelectedVehicleTypes([highlightedRoute.type]);
        setSelectedLines([highlightedRoute.line]);

        (async () => {
            const geometry = highlightedRoute.routeId
                ? await fetchLineRouteGeometryByRouteId(highlightedRoute.routeId)
                : await fetchLineRouteGeometry(
                    highlightedRoute.line,
                    highlightedRoute.type,
                    highlightedRoute.isNight
                );

            if (!isMounted) {
                return;
            }

            setRouteGeometryVersion((v) => v + 1);
            setRouteGeometry(geometry);

            if (!geometry?.directions.length) {
                return;
            }

            const allCoordinates = geometry.directions.flatMap((direction) => direction.coordinates);
            if (!allCoordinates.length) {
                return;
            }

            const sum = allCoordinates.reduce(
                (acc, coord) => ({ lon: acc.lon + coord[0], lat: acc.lat + coord[1] }),
                { lon: 0, lat: 0 }
            );
            const centerLon = sum.lon / allCoordinates.length;
            const centerLat = sum.lat / allCoordinates.length;

            setHasInitialCameraTarget(true);
            setCameraLockedToInitialView(true);
            setMapCenterCoordinate([centerLon, centerLat]);
        })();

        return () => {
            isMounted = false;
        };
    }, [highlightedRoute]);

    const refreshStopEtas = async (stopId: string) => {
        try {
            const etas = await fetchStopEtas([stopId]);
            setEtasByStopId((prev) => ({ ...prev, ...etas }));
        } catch (error) {
            console.warn('Failed to fetch stop ETA details:', error);
        }
    };

    const openRouteStopDetails = async (routeStop: {
        id: string;
        name: string;
        latitude: number;
        longitude: number;
    }, directionName: string, annotationId: string) => {
        suppressMapPressUntilRef.current = Date.now() + 400;
        selectedStopIdRef.current = routeStop.id;
        setSelectedStopAnnotationId(annotationId);
        const existingStop = stopById[routeStop.id];
        if (existingStop) {
            setSelectedStop(existingStop);
        } else {
            const resolvedStop = await fetchStopById(routeStop.id);
            if (resolvedStop) {
                setSelectedStop(resolvedStop);
            } else {
                const lineLabel = routeGeometry?.line || highlightedRoute?.line || '';
                setSelectedStop({
                    id: routeStop.id,
                    name: routeStop.name,
                    latitude: routeStop.latitude,
                    longitude: routeStop.longitude,
                    lines: lineLabel ? [lineLabel] : [],
                    directions: directionName ? [directionName] : [],
                });
            }
        }

        await refreshStopEtas(routeStop.id);
    };

    const openStopDetails = async (stop: Stop) => {
        suppressMapPressUntilRef.current = Date.now() + 400;
        selectedStopIdRef.current = stop.id;
        setSelectedStopAnnotationId(`stop-${stop.id}`);
        setSelectedStop(stop);
        await refreshStopEtas(stop.id);
    };

    const closeSelectedStop = () => {
        selectedStopIdRef.current = null;
        setSelectedStop(null);
        setSelectedStopAnnotationId(null);
    };

    const focusMapOnCoordinate = (latitude: number, longitude: number) => {
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return;
        }

        setHasInitialCameraTarget(true);
        setCameraLockedToInitialView(true);
        setMapCenterCoordinate([longitude, latitude]);
        setMapBounds(createFallbackBounds(latitude, longitude));
    };

    const recenterToUserLocation = async () => {
        try {
            let nextLocation = location;
            if (!nextLocation) {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    return;
                }

                nextLocation = await Location.getCurrentPositionAsync({});
                setLocation(nextLocation);
            }

            focusMapOnCoordinate(nextLocation.coords.latitude, nextLocation.coords.longitude);
        } catch (error) {
            console.warn('Failed to recenter to user location:', error);
        }
    };

    const saveFavorite = async (name: string, latitude: number, longitude: number) => {
        const nextFavorites = await addFavoritePlace({ name, latitude, longitude });
        setFavoritePlaces(nextFavorites);
    };

    const onSelectSearchResult = (result: PlaceSearchResult) => {
        focusMapOnCoordinate(result.latitude, result.longitude);
        setDroppedPin({ latitude: result.latitude, longitude: result.longitude });
        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        closeSelectedStop();
        setLocationSearchQuery(result.name);
        setLocationSearchResults([]);
        setSearchModalVisible(false);
    };

    const onSelectLineSearchResult = async (line: AvailableLine) => {
        setSelectedLines([line.line]);
        setSelectedVehicleTypes([line.isNight ? 'bus' : line.type]);

        const geometry = line.routeId
            ? await fetchLineRouteGeometryByRouteId(line.routeId)
            : await fetchLineRouteGeometry(line.line, line.type, line.isNight);

        const firstCoordinate = geometry?.directions?.[0]?.coordinates?.[0];
        if (firstCoordinate && firstCoordinate.length >= 2) {
            focusMapOnCoordinate(firstCoordinate[1], firstCoordinate[0]);
        }

        setLocationSearchQuery(line.line);
        setLocationSearchResults([]);
        setSearchModalVisible(false);
    };

    const onSelectStopSearchResult = async (stop: Stop) => {
        focusMapOnCoordinate(stop.latitude, stop.longitude);
        setDroppedPin(null);
        setLocationSearchQuery(stop.name);
        setLocationSearchResults([]);
        setSearchModalVisible(false);
        await openStopDetails(stop);
    };

    const onRemoveFavorite = async (favoriteId: string) => {
        const nextFavorites = await removeFavoritePlace(favoriteId);
        setFavoritePlaces(nextFavorites);
    };

    const onMapLongPress = (event: any) => {
        const coords = event?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) {
            return;
        }

        const longitude = Number(coords[0]);
        const latitude = Number(coords[1]);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return;
        }

        setDroppedPin({ latitude, longitude });
        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        closeSelectedStop();
    };

    const onMapPress = (_event: any) => {
        if (Date.now() < suppressMapPressUntilRef.current) {
            return;
        }

        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        closeSelectedStop();
        setDroppedPin(null);
    };

    const handleRegionDidChange = (event: any) => {
        if (cameraLockedToInitialView && hasInitialCameraTarget) {
            setCameraLockedToInitialView(false);
        }

        const scheduleBoundsUpdate = (nextBounds: MapBounds) => {
            if (!hasMeaningfulBoundsChange(mapBoundsRef.current, nextBounds)) {
                return;
            }

            if (boundsDebounceTimerRef.current) {
                clearTimeout(boundsDebounceTimerRef.current);
            }

            boundsDebounceTimerRef.current = setTimeout(() => {
                mapBoundsRef.current = nextBounds;
                setMapBounds(nextBounds);
            }, VIEWPORT_BOUNDS_UPDATE_DEBOUNCE_MS);
        };

        const visibleBounds = event?.properties?.visibleBounds;

        if (
            Array.isArray(visibleBounds)
            && visibleBounds.length === 2
            && Array.isArray(visibleBounds[0])
            && Array.isArray(visibleBounds[1])
            && visibleBounds[0].length >= 2
            && visibleBounds[1].length >= 2
        ) {
            const first = visibleBounds[0];
            const second = visibleBounds[1];
            const east = Math.max(Number(first[0]), Number(second[0]));
            const west = Math.min(Number(first[0]), Number(second[0]));
            const north = Math.max(Number(first[1]), Number(second[1]));
            const south = Math.min(Number(first[1]), Number(second[1]));

            if ([north, south, east, west].every((value) => Number.isFinite(value))) {
                setMapCenterCoordinate([(east + west) / 2, (north + south) / 2]);
                scheduleBoundsUpdate({ north, south, east, west });
                return;
            }
        }

        const center = event?.geometry?.coordinates;
        if (Array.isArray(center) && center.length >= 2) {
            const longitude = Number(center[0]);
            const latitude = Number(center[1]);

            if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
                scheduleBoundsUpdate(createFallbackBounds(latitude, longitude));
            }
        }
    };

    const openStopSchedule = async (stopId: string, stopName: string) => {
        setScheduleStopId(stopId);
        setScheduleStopName(stopName);
        setScheduleLoading(true);
        setScheduleRealtime([]);
        setScheduleStatic(getStaticStopSchedule(stopId, scheduleDayType));
        try {
            const realtime = await fetchFullStopSchedule(stopId);
            setScheduleRealtime(realtime);
        } catch (_err) {
            // static schedule is still shown
        } finally {
            setScheduleLoading(false);
        }
    };

    const closeSchedule = () => {
        setScheduleStopId(null);
        setScheduleRealtime([]);
        setScheduleStatic([]);
    };

    const formatMinutesSinceMidnight = (minutes: number) => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const formatMinSinceMidnight = (m: number) => {
        const h = Math.floor(m / 60) % 24;
        const min = Math.round(m % 60);
        return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    };

    const renderStopEtaSummary = (stopId: string, textStyle: any = styles.calloutSecondary, maxItems?: number) => {
        const stopEtas = etasByStopId[stopId] || [];
        if (!stopEtas.length) {
            return <Text style={textStyle}>Няма налични ETA в момента</Text>;
        }

        const visibleEtas = typeof maxItems === 'number' ? stopEtas.slice(0, maxItems) : stopEtas;

        return visibleEtas.map((eta) => {
            const info = getEtaScheduleInfo(eta);
            const hasDelay = info.delayMinutes != null && info.delayMinutes > 0;
            const isEarly = info.delayMinutes != null && info.delayMinutes < 0;
            const delayText = info.delayMinutes != null
                ? (info.delayMinutes > 0 ? `+${info.delayMinutes} мин` : info.delayMinutes < 0 ? `${info.delayMinutes} мин (по-рано)` : 'навреме')
                : null;
            const schedText = info.scheduledMinSinceMidnight != null
                ? formatMinSinceMidnight(info.scheduledMinSinceMidnight)
                : null;

            return (
                <Text key={`${eta.tripId}-${eta.stopId}-${eta.arrivalTimestamp}`} style={textStyle}>
                    {`${getVehicleIcon(eta.type)} ${eta.line} • ${eta.minutesAway} мин • ${formatUnixTime(eta.arrivalTimestamp)}`}
                    {schedText ? ` (разп. ${schedText})` : ''}
                    {delayText ? ' ' : ''}
                    {delayText ? (
                        <Text style={hasDelay ? { color: '#DC2626', fontWeight: 'bold' } : isEarly ? { color: '#2563EB', fontWeight: 'bold' } : undefined}>
                            {delayText}
                        </Text>
                    ) : null}
                </Text>
            );
        });
    };

    const renderLiveVehicleMarker = useCallback((vehicle: Vehicle) => {
        const heading = vehicle.headingDegrees || 0;
        return (
            <View style={styles.liveVehicleContainer}>
                <Text style={[styles.liveVehicleLineText, { color: getVehicleAccentColor(vehicle.type) }]}>{vehicle.line}</Text>
                <View style={styles.liveVehicleWrap}>
                    <View style={[styles.liveVehicleAccentPlate, { backgroundColor: getVehicleAccentColor(vehicle.type) }]} />
                    <Text style={styles.liveVehicleIcon}>{getVehicleIcon(vehicle.type)}</Text>
                    <View style={[styles.liveVehicleArrow, { transform: [{ rotate: `${heading}deg` }] }]}>
                        <View style={[styles.liveVehicleArrowHead, { borderBottomColor: getVehicleAccentColor(vehicle.type) }]} />
                    </View>
                </View>
            </View>
        );
    }, []);

    if (errorMsg) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
        );
    }

    return (
        <View style={styles.page}>
            <View style={styles.container}>
                <MapboxGL.MapView
                    style={styles.map}
                    mapStyle={MAP_STYLE}
                    surfaceView={false}
                    logoEnabled={false}
                    onPress={onMapPress}
                    onRegionDidChange={handleRegionDidChange}
                    onLongPress={onMapLongPress}
                >
                    <MapboxGL.Camera
                        zoomLevel={cameraLockedToInitialView && hasInitialCameraTarget ? INITIAL_ZOOM_LEVEL : undefined}
                        centerCoordinate={cameraLockedToInitialView && hasInitialCameraTarget ? mapCenterCoordinate : undefined}
                    />

                    {location && (
                        <MapboxGL.PointAnnotation
                            id="user-location"
                            coordinate={[location.coords.longitude, location.coords.latitude]}
                        >
                            <View style={styles.userDot} />
                        </MapboxGL.PointAnnotation>
                    )}

                    {!routeGeometry && !hasVehicleRoute && renderedStops.map((stop) => (
                        <MapboxGL.PointAnnotation
                            key={`stop-${stop.id}`}
                            id={`stop-${stop.id}`}
                            coordinate={[stop.longitude, stop.latitude]}
                            onSelected={() => { void openStopDetails(stop); }}
                            onDeselected={() => {
                                if (selectedStopIdRef.current === stop.id) {
                                    closeSelectedStop();
                                }
                            }}
                        >
                            <View
                                style={[
                                    styles.stopDot,
                                    selectedStopAnnotationId === `stop-${stop.id}` && styles.stopDotSelected,
                                ]}
                            />
                        </MapboxGL.PointAnnotation>
                    ))}

                    {routeGeometry?.directions.map((direction, index) => (
                        <MapboxGL.ShapeSource
                            id={`route-source-${routeGeometry.line}-${index}`}
                            key={`route-source-${routeGeometry.line}-${index}`}
                            shape={{
                                type: 'Feature',
                                properties: {
                                    routeColor: getDirectionAccentColor(index),
                                },
                                geometry: {
                                    type: 'LineString',
                                    coordinates: direction.coordinates,
                                },
                            }}
                        >
                            <MapboxGL.LineLayer
                                id={`route-layer-${routeGeometry.line}-${index}`}
                                style={{
                                    lineColor: ['get', 'routeColor'],
                                    lineWidth: 4,
                                    lineOpacity: 0.9,
                                }}
                            />
                        </MapboxGL.ShapeSource>
                    ))}

                    {routeGeometry?.directions.map((direction, dirIndex) =>
                        getDirectionArrowSamples(direction.coordinates).map((arrow, arrowIndex) => (
                            <MapboxGL.PointAnnotation
                                key={`route-arrow-${dirIndex}-${arrowIndex}`}
                                id={`route-arrow-${dirIndex}-${arrowIndex}`}
                                coordinate={arrow.coordinate}
                            >
                                <Text
                                    style={[
                                        styles.routeDirectionArrow,
                                        {
                                            color: getDirectionAccentColor(dirIndex),
                                            transform: [{ rotate: `${arrow.headingDegrees}deg` }],
                                        },
                                    ]}
                                >
                                    ▲
                                </Text>
                            </MapboxGL.PointAnnotation>
                        ))
                    )}

                    {routeGeometry?.directions.map((direction, dirIndex) =>
                        direction.stops.map((stop, stopIndex) => (
                            (() => {
                                const routeStopAnnotationId = `route-stop-v${routeGeometryVersion}-${dirIndex}-${stop.id}-${stopIndex}`;
                                return (
                            <MapboxGL.PointAnnotation
                                key={routeStopAnnotationId}
                                id={routeStopAnnotationId}
                                coordinate={[stop.longitude, stop.latitude]}
                                onSelected={() => {
                                    const directionLabel = direction.name || `Посока ${dirIndex + 1}`;
                                    void openRouteStopDetails(stop, directionLabel, routeStopAnnotationId);
                                }}
                                onDeselected={() => {
                                    if (selectedStopIdRef.current === stop.id) {
                                        closeSelectedStop();
                                    }
                                }}
                            >
                                <View
                                    style={[
                                        styles.routeStopDot,
                                        { backgroundColor: getDirectionAccentColor(dirIndex), borderColor: getDirectionAccentColor(dirIndex) },
                                        selectedStopAnnotationId === routeStopAnnotationId && styles.routeStopDotSelected,
                                    ]}
                                >
                                    <Text style={styles.routeStopText}>{stopIndex + 1}</Text>
                                </View>
                            </MapboxGL.PointAnnotation>
                                );
                            })()
                        ))
                    )}

                    {vehicleRouteStops.length > 0 && (() => {
                        const trackedVehicle = renderedDisplayVehicles.find((v) => v.id === vehicleRouteVehicleId);
                        let liveCoords: [number, number][] = vehicleRouteCoords;
                        if (trackedVehicle && vehicleRouteCoords.length >= 2) {
                            const vLon = trackedVehicle.longitude;
                            const vLat = trackedVehicle.latitude;
                            // Find closest segment on polyline
                            let bestIdx = 0;
                            let bestDist = Infinity;
                            for (let i = 0; i < vehicleRouteCoords.length; i++) {
                                const dx = vehicleRouteCoords[i][0] - vLon;
                                const dy = vehicleRouteCoords[i][1] - vLat;
                                const d = dx * dx + dy * dy;
                                if (d < bestDist) { bestDist = d; bestIdx = i; }
                            }
                            liveCoords = [[vLon, vLat], ...vehicleRouteCoords.slice(bestIdx + 1)];
                            if (liveCoords.length < 2) liveCoords = [[vLon, vLat], vehicleRouteCoords[vehicleRouteCoords.length - 1]];
                        }
                        return (
                            <>
                                {liveCoords.length >= 2 && (
                                    <MapboxGL.ShapeSource
                                        id="vehicle-route-line"
                                        shape={{
                                            type: 'Feature',
                                            properties: {},
                                            geometry: { type: 'LineString', coordinates: liveCoords },
                                        }}
                                    >
                                        <MapboxGL.LineLayer
                                            id="vehicle-route-layer"
                                            style={{
                                                lineColor: '#059669',
                                                lineWidth: 4,
                                                lineOpacity: 0.85,
                                            }}
                                        />
                                    </MapboxGL.ShapeSource>
                                )}
                                {vehicleRouteStops.map((stop, idx) => (
                                    <MapboxGL.PointAnnotation
                                        key={`vr-stop-${stop.stopId}-${idx}`}
                                        id={`vr-stop-${stop.stopId}-${idx}`}
                                        coordinate={[stop.longitude, stop.latitude]}
                                        onSelected={async () => {
                                            suppressMapPressUntilRef.current = Date.now() + 400;
                                            selectedStopIdRef.current = stop.stopId;
                                            setSelectedStopAnnotationId(`vr-stop-${stop.stopId}-${idx}`);
                                            selectedVehicleIdRef.current = null;
                                            setSelectedVehicleId(null);
                                            const resolved = await fetchStopById(stop.stopId);
                                            if (resolved) {
                                                setSelectedStop(resolved);
                                            } else {
                                                setSelectedStop({
                                                    id: stop.stopId,
                                                    name: stop.stopName,
                                                    latitude: stop.latitude,
                                                    longitude: stop.longitude,
                                                    lines: [],
                                                    directions: [],
                                                });
                                            }
                                            await refreshStopEtas(stop.stopId);
                                        }}
                                        onDeselected={() => {
                                            if (selectedStopIdRef.current === stop.stopId) {
                                                closeSelectedStop();
                                            }
                                        }}
                                    >
                                        <View style={{ alignItems: 'center', zIndex: 20, elevation: 20 }}>
                                            <View
                                                style={[
                                                    styles.vehicleRouteStopDot,
                                                    selectedStopAnnotationId === `vr-stop-${stop.stopId}-${idx}` && {
                                                        borderColor: '#F59E0B',
                                                        borderWidth: 4,
                                                        transform: [{ scale: 1.15 }],
                                                    },
                                                ]}
                                            >
                                                <Text style={styles.vehicleRouteStopText}>{idx + 1}</Text>
                                            </View>
                                            <View style={styles.vehicleRouteStopLabel}>
                                                <Text style={styles.vehicleRouteStopName} numberOfLines={1}>{stop.stopName}</Text>
                                                {stop.arrivalTimestamp ? (
                                                    <Text style={styles.vehicleRouteStopTime}>{formatUnixTime(stop.arrivalTimestamp)}</Text>
                                                ) : null}
                                            </View>
                                        </View>
                                    </MapboxGL.PointAnnotation>
                                ))}
                            </>
                        );
                    })()}

                    {hasVehicleRoute && (() => {
                        const trackedVehicle = renderedDisplayVehicles.find((v) => v.id === vehicleRouteVehicleId);
                        if (!trackedVehicle) return null;
                        return (
                            <MapboxGL.PointAnnotation
                                key={`tracked-${trackedVehicle.renderId}`}
                                id={`tracked-${trackedVehicle.renderId}`}
                                coordinate={[trackedVehicle.longitude, trackedVehicle.latitude]}
                                onSelected={() => {
                                    suppressMapPressUntilRef.current = Date.now() + 400;
                                    selectedVehicleIdRef.current = trackedVehicle.id;
                                    setSelectedVehicleId(trackedVehicle.id);
                                    closeSelectedStop();
                                    void fetchTripDelay(trackedVehicle.tripId).then((delay) => {
                                        setVehicleDelays((prev) => ({ ...prev, [trackedVehicle.id]: delay }));
                                    });
                                }}
                            >
                                <View style={styles.vehicleMarkerWrap}>
                                    {renderLiveVehicleMarker(trackedVehicle)}
                                </View>
                            </MapboxGL.PointAnnotation>
                        );
                    })()}

                    {!hasVehicleRoute && renderedDisplayVehicles.map((vehicle) => (
                        <MapboxGL.PointAnnotation
                            key={vehicle.renderId}
                            id={vehicle.renderId}
                            coordinate={[vehicle.longitude, vehicle.latitude]}
                            onSelected={() => {
                                suppressMapPressUntilRef.current = Date.now() + 400;
                                selectedVehicleIdRef.current = vehicle.id;
                                setSelectedVehicleId(vehicle.id);
                                void fetchTripDelay(vehicle.tripId).then((delay) => {
                                    setVehicleDelays((prev) => ({ ...prev, [vehicle.id]: delay }));
                                });
                            }}
                            onDeselected={() => {
                                if (selectedVehicleIdRef.current === vehicle.id) {
                                    selectedVehicleIdRef.current = null;
                                    setSelectedVehicleId(null);
                                }
                            }}
                        >
                            <View style={styles.vehicleMarkerWrap}>
                                {renderLiveVehicleMarker(vehicle)}
                            </View>
                        </MapboxGL.PointAnnotation>
                    ))}

                    {droppedPin && (
                        <MapboxGL.PointAnnotation
                            key="dropped-pin"
                            id="dropped-pin"
                            coordinate={[droppedPin.longitude, droppedPin.latitude]}
                        >
                            <Text
                                style={{
                                    fontSize: 28,
                                    lineHeight: 28,
                                    textShadowColor: 'rgba(220, 38, 38, 0.35)',
                                    textShadowOffset: { width: 0, height: 2 },
                                    textShadowRadius: 4,
                                }}
                            >
                                {"\uD83D\uDCCD"}
                            </Text>
                        </MapboxGL.PointAnnotation>
                    )}
                </MapboxGL.MapView>

                {hasVehicleRoute && (
                    <TouchableOpacity
                        style={styles.clearRouteButton}
                        onPress={() => {
                            setVehicleRouteStops([]);
                            setVehicleRouteCoords([]);
                            setVehicleRouteVehicleId(null);
                        }}
                    >
                        <Text style={styles.clearRouteButtonText}>✕</Text>
                    </TouchableOpacity>
                )}

                <Modal
                    animationType="fade"
                    transparent
                    visible={searchModalVisible}
                    onRequestClose={() => setSearchModalVisible(false)}
                >
                    <View style={styles.searchModalOverlay}>
                        <View style={styles.searchModalCard}>
                            <View style={styles.searchModalHeader}>
                                <Text style={styles.searchModalTitle}>Търсене: места, линии, спирки</Text>
                                <Pressable onPress={() => setSearchModalVisible(false)} style={styles.searchModalClose}>
                                    <Text style={styles.searchModalCloseText}>{"\u00D7"}</Text>
                                </Pressable>
                            </View>
                            <TextInput
                                style={styles.locationSearchInput}
                                placeholder="Търси адрес, линия или спирка..."
                                placeholderTextColor="#6B7280"
                                value={locationSearchQuery}
                                onChangeText={setLocationSearchQuery}
                            />
                            {(locationSearchLoading || centralSearchResults.length > 0) && (
                                <ScrollView
                                    style={styles.locationSearchResults}
                                    showsVerticalScrollIndicator
                                    nestedScrollEnabled
                                >
                                    {locationSearchLoading && (
                                        <Text style={styles.locationSearchStatus}>Търсене...</Text>
                                    )}
                                    {!locationSearchLoading && centralSearchResults.map((result, idx) => {
                                        if (result.kind === 'place') {
                                            return (
                                                <View key={`search-${result.kind}-${result.id}-${idx}`} style={styles.locationSearchResultRow}>
                                                    <TouchableOpacity style={styles.locationSearchResultPress} onPress={() => onSelectSearchResult(result)}>
                                                        <Text style={styles.locationSearchResultTitle} numberOfLines={1}>{`📍 ${result.name}`}</Text>
                                                        <Text style={styles.locationSearchResultSubtitle} numberOfLines={1}>{result.subtitle}</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={styles.favoriteInlineButton}
                                                        onPress={() => { void saveFavorite(result.name, result.latitude, result.longitude); }}
                                                    >
                                                        <Text style={styles.favoriteInlineButtonText}>☆</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            );
                                        }

                                        if (result.kind === 'line') {
                                            return (
                                                <View key={`search-${result.kind}-${result.id}-${idx}`} style={styles.locationSearchResultRow}>
                                                    <TouchableOpacity style={styles.locationSearchResultPress} onPress={() => { void onSelectLineSearchResult(result.lineInfo); }}>
                                                        <Text style={styles.locationSearchResultTitle} numberOfLines={1}>{`🚌 ${result.name}`}</Text>
                                                        <Text style={styles.locationSearchResultSubtitle} numberOfLines={1}>{result.subtitle}</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            );
                                        }

                                        return (
                                            <View key={`search-${result.kind}-${result.id}-${idx}`} style={styles.locationSearchResultRow}>
                                                <TouchableOpacity style={styles.locationSearchResultPress} onPress={() => { void onSelectStopSearchResult(result.stop); }}>
                                                    <Text style={styles.locationSearchResultTitle} numberOfLines={1}>{`🚏 ${result.name}`}</Text>
                                                    <Text style={styles.locationSearchResultSubtitle} numberOfLines={1}>{result.subtitle}</Text>
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })}
                                </ScrollView>
                            )}
                        </View>
                    </View>
                </Modal>

                {favoritesVisible && (
                    <View style={styles.favoritesPanel}>
                        <View style={styles.favoritesPanelHeader}>
                            <Text style={styles.favoritesPanelTitle}>Любими места</Text>
                            <TouchableOpacity
                                style={styles.favoritesPanelCloseButton}
                                onPress={() => setFavoritesVisible(false)}
                            >
                                <Text style={styles.favoritesPanelCloseButtonText}>{"\u00D7"}</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.favoritesPanelList} showsVerticalScrollIndicator={false}>
                            {!favoritePlaces.length && (
                                <Text style={styles.favoritesEmptyText}>Няма запазени места. Задръж на картата или запази от търсачката.</Text>
                            )}
                            {favoritePlaces.map((favorite) => (
                                <View key={favorite.id} style={styles.favoriteRow}>
                                    <TouchableOpacity
                                        style={styles.favoriteRowMain}
                                        onPress={() => {
                                            focusMapOnCoordinate(favorite.latitude, favorite.longitude);
                                            setDroppedPin({ latitude: favorite.latitude, longitude: favorite.longitude });
                                            selectedVehicleIdRef.current = null;
                                            setSelectedVehicleId(null);
                                            closeSelectedStop();
                                            setFavoritesVisible(false);
                                        }}
                                    >
                                        <Text style={styles.favoriteRowName} numberOfLines={1}>{favorite.name}</Text>
                                        <Text style={styles.favoriteRowCoords} numberOfLines={1}>{`${favorite.latitude.toFixed(5)}, ${favorite.longitude.toFixed(5)}`}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.favoriteRemoveButton}
                                        onPress={() => { void onRemoveFavorite(favorite.id); }}
                                    >
                                        <Text style={styles.favoriteRemoveButtonText}>{"\u00D7"}</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {filterPanelVisible && !isRouteMode && (
                <ScrollView
                    style={styles.filtersPanel}
                    contentContainerStyle={styles.filtersPanelContent}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                >
                    <Text style={styles.filterTitle}>1. Филтър по вид</Text>
                    <View style={styles.chipRow}>
                        <TouchableOpacity
                            style={[styles.filterChip, !selectedVehicleTypes.length && styles.filterChipActive]}
                            onPress={() => setSelectedVehicleTypes([])}
                        >
                            <Text style={[styles.filterChipText, !selectedVehicleTypes.length && styles.filterChipTextActive]}>Всички</Text>
                        </TouchableOpacity>
                        {VEHICLE_TYPE_ORDER.map((vehicleType) => (
                            <TouchableOpacity
                                key={vehicleType}
                                style={[styles.filterChip, selectedVehicleTypes.includes(vehicleType) && styles.filterChipActive]}
                                onPress={() => toggleVehicleTypeFilter(vehicleType)}
                            >
                                <Text style={[styles.filterChipText, selectedVehicleTypes.includes(vehicleType) && styles.filterChipTextActive]}>
                                    {getVehicleIcon(vehicleType)} {getVehicleTypeLabel(vehicleType)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <Text style={[styles.filterTitle, styles.secondaryFilterTitle]}>2. Филтър по линия</Text>
                    <ScrollView style={styles.linesScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                        <View style={styles.chipRow}>
                            <TouchableOpacity
                                style={[styles.filterChip, !selectedLines.length && styles.filterChipActive]}
                                onPress={() => setSelectedLines([])}
                            >
                                <Text style={[styles.filterChipText, !selectedLines.length && styles.filterChipTextActive]}>Всички</Text>
                            </TouchableOpacity>
                            {availableLines.map((line, index) => {
                                const isLive = liveLineSet.has(line);
                                const isSelected = selectedLines.includes(line);
                                return (
                                    <TouchableOpacity
                                        key={`line-filter-${line}-${index}`}
                                        style={[styles.filterChip, isSelected && styles.filterChipActive, !isLive && styles.filterChipDimmed]}
                                        onPress={() => toggleLineFilter(line)}
                                    >
                                        <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                                            {isLive ? `● ${line}` : line}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </ScrollView>
                    <Text style={styles.filterHint}>{`Показани превозни средства: ${filteredVehicles.length}/${vehicles.length}`}</Text>
                    <Text style={styles.filterHint}>{`Видими спирки: ${filteredStops.length}/${stops.length}`}</Text>
                    <ScrollView style={styles.nearbyStopsList} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                        {filteredStops.map((stop) => (
                            <TouchableOpacity
                                key={stop.id}
                                style={styles.nearbyStopButton}
                                onPress={() => { void openStopDetails(stop); }}
                            >
                                <Text style={styles.nearbyStopButtonText} numberOfLines={1}>{stop.name}</Text>
                                <Text style={styles.nearbyStopDirectionText} numberOfLines={2}>{summarizeStopDirections(stop, 1)}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </ScrollView>
                )}

                {isRouteMode && routeGeometry && (
                <View style={styles.routeStopsPanel}>
                    <Text style={styles.routeStopsPanelTitle}>{`🚏 Спирки — ${routeGeometry.line}`}</Text>
                    <TextInput
                        style={styles.routeStopSearchInput}
                        placeholder="Търси спирка по име..."
                        placeholderTextColor="#9CA3AF"
                        value={routeStopSearch}
                        onChangeText={setRouteStopSearch}
                    />
                    <ScrollView style={styles.routeStopSearchList} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                        {routeStopsFiltered.map((stop) => (
                            <TouchableOpacity
                                key={`rs-${stop.dirIndex}-${stop.id}-${stop.stopIndex}`}
                                style={[
                                    styles.routeStopSearchItem,
                                    selectedStop?.id === stop.id && styles.routeStopSearchItemActive,
                                ]}
                                onPress={() => {
                                    const annotationId = `route-stop-${stop.dirIndex}-${stop.id}-${stop.stopIndex}`;
                                    void openRouteStopDetails(stop, stop.directionName, annotationId);
                                }}
                            >
                                <View style={[styles.routeStopSearchBadge, { backgroundColor: getDirectionAccentColor(stop.dirIndex) }]}>
                                    <Text style={styles.routeStopSearchBadgeText}>{stop.stopIndex + 1}</Text>
                                </View>
                                <View style={styles.routeStopSearchInfo}>
                                    <Text style={styles.routeStopSearchName} numberOfLines={1}>{stop.name}</Text>
                                    <Text style={styles.routeStopSearchDir} numberOfLines={1}>{stop.directionName}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                        {routeStopsFiltered.length === 0 && (
                            <Text style={styles.routeStopSearchEmpty}>Няма намерени спирки</Text>
                        )}
                    </ScrollView>
                </View>
                )}

                <View style={styles.bottomOverlay}>
                    <TouchableOpacity
                        style={styles.reportButton}
                        onPress={() => setReportModalVisible(true)}
                    >
                        <Text style={styles.reportText}>🚨 Сигнализирай</Text>
                    </TouchableOpacity>
                </View>

                {droppedPin && !selectedStop && !selectedVehicle && (
                    <View style={styles.floatingPinPanel}>
                        <View style={styles.floatingVehicleHeader}>
                            <Text style={styles.floatingVehicleTitle}>{`📍 ${droppedPin.latitude.toFixed(5)}, ${droppedPin.longitude.toFixed(5)}`}</Text>
                            <Pressable style={styles.floatingVehicleClose} onPress={() => setDroppedPin(null)}>
                                <Text style={styles.floatingVehicleCloseText}>{"\u00D7"}</Text>
                            </Pressable>
                        </View>
                        <TouchableOpacity
                            style={styles.floatingStopScheduleBtn}
                            onPress={() => {
                                void saveFavorite(
                                    `Запазена точка ${droppedPin.latitude.toFixed(4)}, ${droppedPin.longitude.toFixed(4)}`,
                                    droppedPin.latitude,
                                    droppedPin.longitude,
                                );
                                setDroppedPin(null);
                            }}
                        >
                            <Text style={styles.floatingStopScheduleBtnText}>{"\u2B50"} Добави в любими</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {selectedStop && !selectedVehicle && (
                    <View style={styles.floatingStopPanel}>
                        <View style={styles.floatingVehicleHeader}>
                            <Text style={styles.floatingVehicleTitle}>{`🚏 ${selectedStop.name}`}</Text>
                            <Pressable style={styles.floatingVehicleClose} onPress={() => closeSelectedStop()}>
                                <Text style={styles.floatingVehicleCloseText}>{"\u00D7"}</Text>
                            </Pressable>
                        </View>
                        <Text style={styles.floatingVehicleInfo}>{summarizeStopDirections(selectedStop, 2)}</Text>
                        <Text style={styles.floatingVehicleInfo}>{`Линии: ${selectedStop.lines.slice(0, 8).join(', ') || 'н/д'}`}</Text>
                        {renderStopEtaSummary(selectedStop.id, styles.floatingVehicleInfo, STOP_ETA_PREVIEW_COUNT)}
                        <TouchableOpacity
                            style={styles.floatingStopScheduleBtn}
                            onPress={() => openStopSchedule(selectedStop.id, selectedStop.name)}
                        >
                            <Text style={styles.floatingStopScheduleBtnText}>📅 Разписание</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {selectedVehicle && (
                    <View style={styles.floatingVehiclePanel}>
                        <View style={styles.floatingVehicleHeader}>
                            <Text style={styles.floatingVehicleTitle}>{`${getVehicleIcon(selectedVehicle.type)} Линия ${selectedVehicle.line}`}</Text>
                            <Pressable style={styles.floatingVehicleClose} onPress={() => { selectedVehicleIdRef.current = null; setSelectedVehicleId(null); }}>
                                <Text style={styles.floatingVehicleCloseText}>{"\u00D7"}</Text>
                            </Pressable>
                        </View>
                        <Text style={styles.floatingVehicleInfo}>{`Последен update: ${formatUnixTime(selectedVehicle.lastUpdatedUnix)}`}</Text>
                        <Text style={styles.floatingVehicleInfo}>{`Скорост: ${Number.isFinite(selectedVehicle.speedKph) ? Math.round(selectedVehicle.speedKph as number) : 'н/д'} км/ч`}</Text>
                        <Text style={styles.floatingVehicleInfo}>{`Спирка: ${selectedVehicle.stopId ? (stopNameById[selectedVehicle.stopId] || selectedVehicle.stopId) : 'н/д'}`}</Text>
                        <Text style={[
                            styles.floatingVehicleInfo,
                            vehicleDelays[selectedVehicle.id] != null && vehicleDelays[selectedVehicle.id]! > 0
                                ? { color: '#DC2626', fontWeight: '700' }
                                : vehicleDelays[selectedVehicle.id] != null && vehicleDelays[selectedVehicle.id]! < 0
                                    ? { color: '#2563EB', fontWeight: '700' }
                                    : undefined,
                        ]}>
                            {`Закъснение: ${vehicleDelays[selectedVehicle.id] != null
                                ? (vehicleDelays[selectedVehicle.id]! > 0
                                    ? `+${Math.round(vehicleDelays[selectedVehicle.id]! / 60)} мин`
                                    : vehicleDelays[selectedVehicle.id]! < 0
                                        ? `${Math.round(vehicleDelays[selectedVehicle.id]! / 60)} мин (по-рано)`
                                        : 'навреме')
                                : 'зареждане...'}`}
                        </Text>
                        <TouchableOpacity
                            style={styles.vehicleRouteBtn}
                            disabled={vehicleRouteLoading}
                            onPress={async () => {
                                if (vehicleRouteVehicleId === selectedVehicle.id) {
                                    setVehicleRouteStops([]);
                                    setVehicleRouteCoords([]);
                                    setVehicleRouteVehicleId(null);
                                    return;
                                }
                                setVehicleRouteLoading(true);
                                try {
                                    const stops = await fetchTripStops(selectedVehicle.tripId);
                                    setVehicleRouteStops(stops);
                                    setVehicleRouteVehicleId(selectedVehicle.id);
                                    // Build OSRM route through vehicle position + stops
                                    const waypoints = [
                                        { latitude: selectedVehicle.latitude, longitude: selectedVehicle.longitude },
                                        ...stops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
                                    ];
                                    if (waypoints.length >= 2) {
                                        try {
                                            const osrmCoords = await fetchOsrmRoute(waypoints);
                                            setVehicleRouteCoords(osrmCoords);
                                        } catch {
                                            // Fallback: straight lines
                                            setVehicleRouteCoords(waypoints.map((w) => [w.longitude, w.latitude]));
                                        }
                                    }
                                } finally {
                                    setVehicleRouteLoading(false);
                                }
                            }}
                        >
                            <Text style={styles.vehicleRouteBtnText}>
                                {vehicleRouteLoading ? 'Зареждане...' : vehicleRouteVehicleId === selectedVehicle.id ? 'Скрий маршрута' : '🗺️ Продължи маршрута'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {scheduleStopId && (
                    <Modal
                        animationType="slide"
                        transparent={false}
                        visible={!!scheduleStopId}
                        onRequestClose={closeSchedule}
                    >
                        <View style={styles.stopScheduleFullScreen}>
                            <View style={styles.stopScheduleHeader}>
                                <View style={styles.stopScheduleTitleWrap}>
                                    <Text style={styles.stopScheduleTitle}>{`📅 ${scheduleStopName}`}</Text>
                                    <Text style={styles.stopScheduleMeta}>{`Спирка ${scheduleStopId}`}</Text>
                                </View>
                                <Pressable style={styles.stopScheduleClose} onPress={closeSchedule}>
                                    <Text style={styles.stopScheduleCloseText}>{"\u00D7"}</Text>
                                </Pressable>
                            </View>

                            {scheduleLoading && <Text style={styles.stopScheduleEta}>Зареждане...</Text>}

                                <ScrollView style={styles.stopScheduleList} showsVerticalScrollIndicator nestedScrollEnabled>
                                    {scheduleRealtime.length > 0 && (
                                        <>
                                            <Text style={styles.stopLineBoardTitle}>🔴 В реално време</Text>
                                            {scheduleRealtime.map((eta) => {
                                                const info = getEtaScheduleInfo(eta);
                                                const hasDelay = info.delayMinutes != null && info.delayMinutes > 0;
                                                const isEarly = info.delayMinutes != null && info.delayMinutes < 0;
                                                const delayText = info.delayMinutes != null
                                                    ? (info.delayMinutes > 0 ? `+${info.delayMinutes} мин` : info.delayMinutes < 0 ? `${info.delayMinutes} мин (по-рано)` : 'навреме')
                                                    : null;
                                                const schedText = info.scheduledMinSinceMidnight != null
                                                    ? formatMinSinceMidnight(info.scheduledMinSinceMidnight)
                                                    : null;
                                                return (
                                                <View key={`rt-${eta.tripId}-${eta.arrivalTimestamp}`} style={styles.stopLineBoardRow}>
                                                    <Text style={styles.stopScheduleEta}>
                                                        {`${getVehicleIcon(eta.type)} ${eta.line} → ${eta.destination || 'н/д'} • ${eta.minutesAway} мин • ${formatUnixTime(eta.arrivalTimestamp)}`}
                                                        {schedText ? ` (разп. ${schedText})` : ''}
                                                        {delayText ? ' ' : ''}
                                                        {delayText ? (
                                                            <Text style={hasDelay ? { color: '#DC2626', fontWeight: 'bold' } : isEarly ? { color: '#2563EB', fontWeight: 'bold' } : undefined}>
                                                                {delayText}
                                                            </Text>
                                                        ) : null}
                                                    </Text>
                                                </View>
                                                );
                                            })}
                                        </>
                                    )}

                                    {scheduleStatic.length > 0 && (
                                        <>
                                            <Text style={[styles.stopLineBoardTitle, { marginTop: scheduleRealtime.length > 0 ? 12 : 0 }]}>📋 Статично разписание</Text>
                                            <View style={styles.dayTypeRow}>
                                                <TouchableOpacity
                                                    style={[styles.dayTypeChip, scheduleDayType === 'w' && styles.dayTypeChipActive]}
                                                    onPress={() => {
                                                        setScheduleDayType('w');
                                                        if (scheduleStopId) setScheduleStatic(getStaticStopSchedule(scheduleStopId, 'w'));
                                                    }}
                                                >
                                                    <Text style={[styles.dayTypeChipText, scheduleDayType === 'w' && styles.dayTypeChipTextActive]}>Делник</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.dayTypeChip, scheduleDayType === 'h' && styles.dayTypeChipActive]}
                                                    onPress={() => {
                                                        setScheduleDayType('h');
                                                        if (scheduleStopId) setScheduleStatic(getStaticStopSchedule(scheduleStopId, 'h'));
                                                    }}
                                                >
                                                    <Text style={[styles.dayTypeChipText, scheduleDayType === 'h' && styles.dayTypeChipTextActive]}>Празник</Text>
                                                </TouchableOpacity>
                                            </View>
                                            {scheduleStatic.map((entry) => (
                                                <View key={`st-${entry.line}-${entry.destination}`} style={styles.stopLineBoardRow}>
                                                    <Text style={styles.stopScheduleEta}>
                                                        {`${getVehicleIcon(entry.type)} ${entry.line} → ${entry.destination}`}
                                                    </Text>
                                                    <Text style={styles.stopScheduleMeta}>
                                                        {entry.times.map(formatMinutesSinceMidnight).join(', ')}
                                                    </Text>
                                                </View>
                                            ))}
                                        </>
                                    )}

                                    {!scheduleLoading && !scheduleRealtime.length && !scheduleStatic.length && (
                                        <Text style={styles.stopScheduleEta}>Няма налично разписание за тази спирка</Text>
                                    )}
                                </ScrollView>
                        </View>
                    </Modal>
                )}

                {/* Report Modal */}
                <Modal
                    animationType="slide"
                    transparent={true}
                    visible={reportModalVisible}
                    onRequestClose={() => setReportModalVisible(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Какво искате да репортнете?</Text>

                            <View style={styles.reportOptions}>
                                <TouchableOpacity style={styles.option} onPress={() => setReportModalVisible(false)}>
                                    <View style={[styles.optionIcon, { backgroundColor: '#E63946' }]}>
                                        <Text style={styles.iconLarge}>👮</Text>
                                    </View>
                                    <Text style={styles.optionLabel}>Контрола</Text>
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.option} onPress={() => setReportModalVisible(false)}>
                                    <View style={[styles.optionIcon, { backgroundColor: '#F4A261' }]}>
                                        <Text style={styles.iconLarge}>👨‍👩‍👧‍👦</Text>
                                    </View>
                                    <Text style={styles.optionLabel}>Претъпкано</Text>
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.option} onPress={() => setReportModalVisible(false)}>
                                    <View style={[styles.optionIcon, { backgroundColor: '#2A9D8F' }]}>
                                        <Text style={styles.iconLarge}>⏳</Text>
                                    </View>
                                    <Text style={styles.optionLabel}>Закъснение</Text>
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.option} onPress={() => setReportModalVisible(false)}>
                                    <View style={[styles.optionIcon, { backgroundColor: '#264653' }]}>
                                        <Text style={styles.iconLarge}>⚠️</Text>
                                    </View>
                                    <Text style={styles.optionLabel}>Опасност</Text>
                                </TouchableOpacity>
                            </View>

                            <Pressable
                                style={styles.closeButton}
                                onPress={() => setReportModalVisible(false)}
                            >
                                <Text style={styles.closeText}>Затвори</Text>
                            </Pressable>
                        </View>
                    </View>
                </Modal>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    page: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        height: '100%',
        width: '100%',
        backgroundColor: 'tomato',
    },
    map: {
        flex: 1,
    },
    filtersPanel: {
        position: 'absolute',
        top: 62,
        right: 76,
        width: 248,
        maxHeight: '72%',
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: 14,
        padding: 12,
        zIndex: 20,
        elevation: 20,
    },
    filtersPanelContent: {
        paddingBottom: 8,
    },
    searchModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(17,24,39,0.35)',
        justifyContent: 'flex-start',
        paddingTop: 28,
        paddingHorizontal: 12,
    },
    searchModalCard: {
        backgroundColor: 'rgba(255,255,255,0.98)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        padding: 12,
    },
    searchModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    searchModalTitle: {
        color: '#111827',
        fontSize: 15,
        fontWeight: '700',
    },
    searchModalClose: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F3F4F6',
    },
    searchModalCloseText: {
        color: '#374151',
        fontSize: 14,
        fontWeight: '700',
    },
    locationSearchInput: {
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 9,
        fontSize: 14,
        color: '#111827',
        borderWidth: 1,
        borderColor: '#D1D5DB',
    },
    locationSearchResults: {
        marginTop: 6,
        maxHeight: 220,
        backgroundColor: 'rgba(255,255,255,0.97)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        paddingVertical: 6,
        paddingHorizontal: 8,
    },
    locationSearchStatus: {
        color: '#4B5563',
        fontSize: 13,
        paddingVertical: 8,
        textAlign: 'center',
    },
    locationSearchResultRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 6,
    },
    locationSearchResultPress: {
        flex: 1,
    },
    locationSearchResultTitle: {
        color: '#111827',
        fontSize: 13,
        fontWeight: '700',
    },
    locationSearchResultSubtitle: {
        color: '#6B7280',
        fontSize: 11,
        marginTop: 1,
    },
    favoriteInlineButton: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EEF2FF',
        borderWidth: 1,
        borderColor: '#C7D2FE',
    },
    favoriteInlineButtonText: {
        color: '#1D4ED8',
        fontSize: 16,
        fontWeight: '700',
    },
    filterTitle: {
        color: '#264653',
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 8,
    },
    secondaryFilterTitle: {
        marginTop: 10,
    },
    filterHint: {
        marginTop: 8,
        color: '#4B5563',
        fontSize: 12,
        fontWeight: '600',
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginRight: -6,
        marginBottom: -6,
    },
    linesScroll: {
        marginTop: 2,
        maxHeight: 140,
    },
    filterChip: {
        backgroundColor: '#EEF2FF',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderWidth: 1,
        borderColor: '#C7D2FE',
        marginRight: 6,
        marginBottom: 6,
    },
    filterChipActive: {
        backgroundColor: '#1D4ED8',
        borderColor: '#1D4ED8',
    },
    filterChipDimmed: {
        opacity: 0.45,
    },
    filterChipText: {
        color: '#1E3A8A',
        fontSize: 12,
        fontWeight: '700',
    },
    filterChipTextActive: {
        color: '#FFFFFF',
    },
    nearbyStopsList: {
        marginTop: 10,
        maxHeight: 200,
    },
    nearbyStopButton: {
        backgroundColor: '#DBEAFE',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 6,
    },
    nearbyStopButtonText: {
        color: '#1D4ED8',
        fontSize: 12,
        fontWeight: '600',
    },
    nearbyStopDirectionText: {
        marginTop: 3,
        color: '#4B5563',
        fontSize: 11,
        lineHeight: 14,
    },
    userDot: {
        width: 20,
        height: 20,
        backgroundColor: '#007AFF',
        borderRadius: 10,
        borderWidth: 3,
        borderColor: 'white',
    },
    vehicleMarkerWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        elevation: 10,
    },
    liveVehicleContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    liveVehicleLineText: {
        marginBottom: 2,
        fontSize: 15,
        fontWeight: '900',
        textShadowColor: 'rgba(255,255,255,0.96)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 1,
    },
    liveVehicleWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 56,
        height: 56,
    },
    liveVehicleArrow: {
        position: 'absolute',
        width: 56,
        height: 56,
        alignItems: 'center',
    },
    liveVehicleArrowHead: {
        width: 0,
        height: 0,
        borderLeftWidth: 6,
        borderRightWidth: 6,
        borderBottomWidth: 10,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: '#1D4ED8',
        top: -2,
    },
    liveVehicleAccentPlate: {
        position: 'absolute',
        width: 30,
        height: 30,
        borderRadius: 9,
        opacity: 0.22,
    },
    liveVehicleIcon: {
        fontSize: 36,
        lineHeight: 36,
        textShadowColor: 'rgba(17,24,39,0.24)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 6,
    },
    routeDirectionArrow: {
        fontSize: 22,
        fontWeight: '900',
        textShadowColor: 'rgba(255,255,255,0.95)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 2,
    },
    stopDot: {
        backgroundColor: 'rgba(0, 122, 255, 0.35)',
        borderWidth: 2,
        borderColor: 'rgba(0, 122, 255, 0.6)',
        borderRadius: 12,
        width: 24,
        height: 24,
    },
    stopDotSelected: {
        backgroundColor: '#F59E0B',
        borderColor: '#D97706',
        borderWidth: 3,
        transform: [{ scale: 1.2 }],
    },
    routeStopDot: {
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 2.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    routeStopDotSelected: {
        borderColor: '#F59E0B',
        borderWidth: 4,
        transform: [{ scale: 1.18 }],
    },
    routeStopText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '700',
    },
    calloutCard: {
        minWidth: 220,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 10,
        gap: 4,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    calloutTitle: {
        color: '#111827',
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 2,
    },
    calloutHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 8,
    },
    calloutCloseButton: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#E5E7EB',
        alignItems: 'center',
        justifyContent: 'center',
    },
    calloutCloseText: {
        color: '#111827',
        fontSize: 13,
        fontWeight: '700',
    },
    calloutSecondary: {
        color: '#374151',
        fontSize: 12,
        marginBottom: 2,
    },
    calloutBodyScroll: {
        maxHeight: 140,
    },
    stopScheduleFullScreen: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        paddingTop: 50,
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    stopScheduleHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    stopScheduleTitleWrap: {
        flex: 1,
    },
    stopScheduleTitle: {
        color: '#111827',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 4,
    },
    stopScheduleMeta: {
        color: '#4B5563',
        fontSize: 12,
        marginBottom: 2,
    },
    stopScheduleClose: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#E5E7EB',
        alignItems: 'center',
        justifyContent: 'center',
    },
    stopScheduleCloseText: {
        color: '#111827',
        fontSize: 20,
        fontWeight: '700',
        lineHeight: 22,
    },
    stopScheduleList: {
        flexGrow: 1,
        gap: 6,
    },
    stopScheduleEta: {
        color: '#1F2937',
        fontSize: 13,
        marginBottom: 8,
    },
    stopLineBoardTitle: {
        color: '#1F2937',
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 8,
    },
    dayTypeRow: {
        flexDirection: 'row',
        gap: 6,
        marginBottom: 10,
    },
    dayTypeChip: {
        backgroundColor: '#F1F5F9',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    dayTypeChipActive: {
        backgroundColor: '#1E293B',
        borderColor: '#1E293B',
    },
    dayTypeChipText: {
        color: '#475569',
        fontSize: 12,
        fontWeight: '700',
    },
    dayTypeChipTextActive: {
        color: '#FFFFFF',
    },
    stopLineBoardRow: {
        backgroundColor: '#F3F4F6',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 8,
    },
    stopLineBoardLine: {
        color: '#111827',
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 3,
    },
    stopLineBoardEta: {
        color: '#374151',
        fontSize: 12,
        lineHeight: 16,
    },
    routeStopsPanel: {
        position: 'absolute',
        top: 62,
        right: 76,
        width: 268,
        maxHeight: '72%',
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderRadius: 14,
        padding: 12,
        zIndex: 20,
        elevation: 20,
    },
    routeStopsPanelTitle: {
        color: '#111827',
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 8,
    },
    routeStopSearchInput: {
        backgroundColor: '#F3F4F6',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 13,
        color: '#111827',
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    routeStopSearchList: {
        maxHeight: 320,
    },
    routeStopSearchItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 7,
        paddingHorizontal: 6,
        borderRadius: 10,
        gap: 10,
    },
    routeStopSearchItemActive: {
        backgroundColor: '#DBEAFE',
    },
    routeStopSearchBadge: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    routeStopSearchBadgeText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '700',
    },
    routeStopSearchInfo: {
        flex: 1,
    },
    routeStopSearchName: {
        color: '#111827',
        fontSize: 13,
        fontWeight: '600',
    },
    routeStopSearchDir: {
        color: '#6B7280',
        fontSize: 11,
        marginTop: 1,
    },
    routeStopSearchEmpty: {
        color: '#9CA3AF',
        fontSize: 13,
        textAlign: 'center',
        paddingVertical: 16,
    },
    iconButton: {
        backgroundColor: 'white',
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 5,
        marginBottom: 10,
    },
    clearRouteButton: {
        position: 'absolute',
        top: 50,
        left: 16,
        backgroundColor: 'white',
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 10,
        zIndex: 30,
    },
    clearRouteButtonText: {
        fontSize: 20,
        color: '#E63946',
        fontWeight: '700',
    },
    iconText: {
        fontSize: 20,
    },
    bottomOverlay: {
        position: 'absolute',
        bottom: 40,
        width: '100%',
        alignItems: 'center',
        zIndex: 20,
        elevation: 20,
    },
    locationButtonIcon: {
        fontSize: 24,
        lineHeight: 24,
    },
    favoritesPanel: {
        position: 'absolute',
        right: 70,
        top: 128,
        width: 280,
        maxHeight: 320,
        backgroundColor: 'rgba(255,255,255,0.97)',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        padding: 10,
        zIndex: 30,
        elevation: 30,
    },
    favoritesPanelTitle: {
        color: '#111827',
        fontSize: 14,
        fontWeight: '700',
    },
    favoritesPanelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    favoritesPanelCloseButton: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F3F4F6',
    },
    favoritesPanelCloseButtonText: {
        color: '#374151',
        fontSize: 13,
        fontWeight: '700',
    },
    favoritesPanelList: {
        maxHeight: 262,
    },
    favoritesEmptyText: {
        color: '#6B7280',
        fontSize: 12,
        lineHeight: 16,
        paddingVertical: 8,
    },
    favoriteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        backgroundColor: '#F9FAFB',
        borderRadius: 10,
        padding: 8,
    },
    favoriteRowMain: {
        flex: 1,
    },
    favoriteRowName: {
        color: '#111827',
        fontSize: 12,
        fontWeight: '700',
    },
    favoriteRowCoords: {
        color: '#6B7280',
        fontSize: 11,
        marginTop: 2,
    },
    favoriteRemoveButton: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FEE2E2',
    },
    favoriteRemoveButtonText: {
        color: '#B91C1C',
        fontSize: 13,
        fontWeight: '700',
    },
    reportButton: {
        backgroundColor: '#E63946',
        paddingHorizontal: 25,
        paddingVertical: 15,
        borderRadius: 30,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 6,
    },
    reportText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: 'white',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        padding: 25,
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 20,
        color: '#264653',
    },
    reportOptions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 20,
    },
    option: {
        width: '45%',
        alignItems: 'center',
        marginBottom: 20,
    },
    optionIcon: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    iconLarge: {
        fontSize: 28,
    },
    optionLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#264653',
    },
    closeButton: {
        marginTop: 10,
        padding: 10,
    },
    closeText: {
        color: '#E63946',
        fontWeight: 'bold',
        fontSize: 16,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorText: {
        fontSize: 16,
        color: '#E63946',
        textAlign: 'center',
    },
    calloutScheduleButton: {
        marginTop: 6,
        backgroundColor: '#EEF2FF',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: '#C7D2FE',
    },
    calloutScheduleButtonText: {
        color: '#1D4ED8',
        fontSize: 12,
        fontWeight: '700',
    },
    floatingScheduleButton: {
        position: 'absolute',
        bottom: 70,
        left: 16,
        right: 16,
        backgroundColor: '#1D4ED8',
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: 'center',
        zIndex: 20,
        elevation: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    floatingScheduleButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    floatingVehiclePanel: {
        position: 'absolute',
        bottom: 70,
        left: 16,
        right: 16,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 14,
        zIndex: 30,
        elevation: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    floatingVehicleHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    floatingVehicleTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1F2937',
    },
    floatingVehicleClose: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    floatingVehicleCloseText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#6B7280',
    },
    floatingVehicleInfo: {
        fontSize: 13,
        color: '#374151',
        marginBottom: 2,
    },
    floatingPinPanel: {
        position: 'absolute',
        bottom: 70,
        left: 16,
        right: 16,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 14,
        zIndex: 25,
        elevation: 25,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    floatingStopPanel: {
        position: 'absolute',
        bottom: 70,
        left: 16,
        right: 16,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 14,
        zIndex: 25,
        elevation: 25,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    floatingStopScheduleBtn: {
        marginTop: 8,
        backgroundColor: '#1D4ED8',
        borderRadius: 10,
        paddingVertical: 8,
        alignItems: 'center',
    },
    floatingStopScheduleBtnText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    vehicleRouteBtn: {
        marginTop: 8,
        backgroundColor: '#059669',
        borderRadius: 10,
        paddingVertical: 8,
        alignItems: 'center',
    },
    vehicleRouteBtnText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    vehicleRouteStopDot: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#059669',
        borderWidth: 2,
        borderColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
        elevation: 20,
    },
    vehicleRouteStopDotSelected: {
        borderColor: '#F59E0B',
        borderWidth: 4,
        transform: [{ scale: 1.15 }],
    },
    vehicleRouteStopText: {
        color: '#FFFFFF',
        fontSize: 9,
        fontWeight: '700',
    },
    vehicleRouteStopLabel: {
        backgroundColor: '#FFFFFF',
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginTop: 2,
        maxWidth: 120,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
    },
    vehicleRouteStopName: {
        fontSize: 9,
        fontWeight: '600',
        color: '#1F2937',
        textAlign: 'center',
    },
    vehicleRouteStopTime: {
        fontSize: 9,
        fontWeight: '700',
        color: '#059669',
        textAlign: 'center',
    },
});
