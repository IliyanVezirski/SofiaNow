import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal, Pressable, ScrollView, TextInput } from 'react-native';
import * as Location from 'expo-location';
import { fetchStopEtas, fetchVehiclesInBounds, StopEta, Vehicle } from '../services/cgmApi';
import { fetchLineRouteGeometry, fetchLineRouteGeometryByRouteId, fetchStopById, fetchStopsInBounds, LineRouteGeometry, MapBounds, Stop, summarizeStopDirections } from '../services/stopsApi';
import { addFavoritePlace, FavoritePlace, loadFavoritePlaces, PlaceSearchResult, removeFavoritePlace, searchLocations } from '../services/places';
import MapboxGL from '@maplibre/maplibre-react-native';
import { VehicleType, formatUnixTime, getVehicleAccentColor, getVehicleIcon, getVehicleTypeLabel, inferLineTypeFromToken, VEHICLE_TYPE_ORDER } from '../services/transitUtils';
import { RouteSelection } from '../types/routes';

const VEHICLE_REFRESH_MS = 500;
const STOP_ETA_REFRESH_MS = 15000;
const INITIAL_ZOOM_LEVEL = 16;
const VEHICLE_ANIMATION_MS = 420;
const STOP_ETA_PREVIEW_COUNT = 3;
const DEFAULT_CENTER_COORDINATE: [number, number] = [23.3219, 42.6977];
const DEFAULT_BOUNDS_DELTA = 0.03;
const MAX_HEADING_STEP_DEGREES = 32;
const LOW_SPEED_HEADING_LOCK_KPH = 4;
const OVERLAP_GROUP_DECIMALS = 4;
const OVERLAP_OFFSET_DEGREES = 0.00008;

const createFallbackBounds = (latitude: number, longitude: number): MapBounds => ({
    north: latitude + DEFAULT_BOUNDS_DELTA,
    south: latitude - DEFAULT_BOUNDS_DELTA,
    east: longitude + DEFAULT_BOUNDS_DELTA,
    west: longitude - DEFAULT_BOUNDS_DELTA,
});

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
}

export default function MapScreen({
    highlightedRoute,
    filterPanelVisible = true,
    searchRequestToken,
    favoritesRequestToken,
    recenterRequestToken,
    dismissTransientPanelsToken,
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
    const [etasByStopId, setEtasByStopId] = useState<Record<string, StopEta[]>>({});
    const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
    const [mapCenterCoordinate, setMapCenterCoordinate] = useState<[number, number]>(DEFAULT_CENTER_COORDINATE);
    const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
    const [cameraLockedToInitialView, setCameraLockedToInitialView] = useState(false);
    const [hasInitialCameraTarget, setHasInitialCameraTarget] = useState(false);
    const [routeGeometry, setRouteGeometry] = useState<LineRouteGeometry | null>(null);
    const [routeStopSearch, setRouteStopSearch] = useState('');
    const [locationSearchQuery, setLocationSearchQuery] = useState('');
    const [locationSearchResults, setLocationSearchResults] = useState<PlaceSearchResult[]>([]);
    const [locationSearchLoading, setLocationSearchLoading] = useState(false);
    const [favoritePlaces, setFavoritePlaces] = useState<FavoritePlace[]>([]);
    const [favoritesVisible, setFavoritesVisible] = useState(false);
    const [searchModalVisible, setSearchModalVisible] = useState(false);
    const lastHeadingByVehicleRef = useRef<Record<string, number>>({});
    const animatedVehiclesRef = useRef<Vehicle[]>([]);
    const vehicleAnimationFrameRef = useRef<number | null>(null);
    const isRouteMode = !!highlightedRoute;
    const visibleStopsRef = useRef<Stop[]>([]);

    useEffect(() => {
        void (async () => {
            const favorites = await loadFavoritePlaces();
            setFavoritePlaces(favorites);
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
    const availableLines = useMemo(() => {
        if (isRouteMode && highlightedRoute?.line) {
            return [highlightedRoute.line];
        }

        const lineSet = new Set(vehicles.map((vehicle) => vehicle.line));
        selectedLines.forEach((line) => lineSet.add(line));

        return Array.from(lineSet)
            .sort((left, right) => left.localeCompare(right, 'bg', { numeric: true }));
    }, [vehicles, isRouteMode, highlightedRoute, selectedLines]);
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
        if (vehicleAnimationFrameRef.current !== null) {
            cancelAnimationFrame(vehicleAnimationFrameRef.current);
            vehicleAnimationFrameRef.current = null;
        }

        if (!vehicles.length) {
            setAnimatedVehicles([]);
            return;
        }

        const previousVehiclesById = new Map(animatedVehiclesRef.current.map((vehicle) => [vehicle.id, vehicle]));
        const targetVehicles = vehicles.map((vehicle) => {
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
                return {
                    ...vehicle,
                    headingDegrees: normalizedNext,
                };
            }

            if ((vehicle.speedKph || 0) < LOW_SPEED_HEADING_LOCK_KPH) {
                return {
                    ...vehicle,
                    headingDegrees: previousHeading,
                };
            }

            const delta = shortestHeadingDelta(previousHeading, normalizedNext);
            const clampedDelta = Math.max(-MAX_HEADING_STEP_DEGREES, Math.min(MAX_HEADING_STEP_DEGREES, delta));
            const stabilizedHeading = normalizeHeadingDegrees(previousHeading + clampedDelta);
            lastHeadingByVehicleRef.current[vehicle.id] = stabilizedHeading;

            return {
                ...vehicle,
                headingDegrees: stabilizedHeading,
            };
        });
        const animationStart = Date.now();

        const tick = () => {
            const elapsed = Date.now() - animationStart;
            const rawProgress = Math.min(1, elapsed / VEHICLE_ANIMATION_MS);
            const easedProgress = rawProgress;

            setAnimatedVehicles(targetVehicles.map((vehicle) => {
                const previousVehicle = previousVehiclesById.get(vehicle.id);
                if (!previousVehicle) {
                    return vehicle;
                }

                return {
                    ...vehicle,
                    latitude: previousVehicle.latitude + ((vehicle.latitude - previousVehicle.latitude) * easedProgress),
                    longitude: previousVehicle.longitude + ((vehicle.longitude - previousVehicle.longitude) * easedProgress),
                    headingDegrees: interpolateHeadingDegrees(
                        Number.isFinite(previousVehicle.headingDegrees) ? previousVehicle.headingDegrees as number : (vehicle.headingDegrees || 0),
                        vehicle.headingDegrees || 0,
                        easedProgress,
                    ),
                };
            }));

            if (rawProgress < 1) {
                vehicleAnimationFrameRef.current = requestAnimationFrame(tick);
                return;
            }

            vehicleAnimationFrameRef.current = null;
        };

        tick();

        return () => {
            if (vehicleAnimationFrameRef.current !== null) {
                cancelAnimationFrame(vehicleAnimationFrameRef.current);
                vehicleAnimationFrameRef.current = null;
            }
        };
    }, [vehicles]);

    useEffect(() => {
        let isMounted = true;
        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === 'granted') {
                    const loc = await Location.getCurrentPositionAsync({});
                    setLocation(loc);
                    if (isMounted) {
                        if (!highlightedRoute) {
                            setHasInitialCameraTarget(true);
                            setCameraLockedToInitialView(true);
                        }
                        setMapCenterCoordinate([loc.coords.longitude, loc.coords.latitude]);
                        setMapBounds(createFallbackBounds(loc.coords.latitude, loc.coords.longitude));
                        return;
                    }
                }
            } catch (err) {
                console.warn('Location unavailable, using default center:', err);
            }

            if (isMounted) {
                if (!highlightedRoute) {
                    setHasInitialCameraTarget(true);
                    setCameraLockedToInitialView(true);
                }
                setMapCenterCoordinate(DEFAULT_CENTER_COORDINATE);
                setMapBounds(createFallbackBounds(DEFAULT_CENTER_COORDINATE[1], DEFAULT_CENTER_COORDINATE[0]));
            }
        })();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (!mapBounds) {
            return;
        }

        let isMounted = true;

        const refreshViewportData = async () => {
            try {
                const visibleStops = await fetchStopsInBounds(mapBounds);
                if (!isMounted) {
                    return;
                }

                visibleStopsRef.current = visibleStops;
                setStops(visibleStops);

                const [visibleVehicles, etasByStop] = await Promise.all([
                    fetchVehiclesInBounds(mapBounds),
                    fetchStopEtas(visibleStops.map((stop) => stop.id)),
                ]);

                if (!isMounted) {
                    return;
                }

                setVehicles(visibleVehicles);
                setEtasByStopId(etasByStop);
                setLastUpdated(new Date());
            } catch (apiErr) {
                console.error('Viewport refresh failed:', apiErr);
            }
        };

        const refreshVehiclesOnly = async () => {
            try {
                const visibleVehicles = await fetchVehiclesInBounds(mapBounds);
                if (!isMounted) {
                    return;
                }

                setVehicles(visibleVehicles);
                setLastUpdated(new Date());
            } catch (apiErr) {
                console.error('Vehicle refresh failed:', apiErr);
            }
        };

        const refreshEtasOnly = async () => {
            try {
                const nextEtasByStopId = await fetchStopEtas(visibleStopsRef.current.map((stop) => stop.id));
                if (!isMounted) {
                    return;
                }

                setEtasByStopId(nextEtasByStopId);
            } catch (apiErr) {
                console.error('Stop ETA refresh failed:', apiErr);
            }
        };

        void refreshViewportData();

        const vehicleRefreshTimer = setInterval(() => {
            void refreshVehiclesOnly();
        }, VEHICLE_REFRESH_MS);

        const stopEtaRefreshTimer = setInterval(() => {
            void refreshEtasOnly();
        }, STOP_ETA_REFRESH_MS);

        return () => {
            isMounted = false;
            clearInterval(vehicleRefreshTimer);
            clearInterval(stopEtaRefreshTimer);
        };
    }, [mapBounds]);

    useEffect(() => {
        let isMounted = true;

        if (!highlightedRoute) {
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
    }, directionName: string) => {
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
        setSelectedStop(stop);
        await refreshStopEtas(stop.id);
    };

    const openStopPopupOnly = (stop: Stop) => {
        void refreshStopEtas(stop.id);
    };

    const openRouteStopPopupOnly = (stopId: string) => {
        void refreshStopEtas(stopId);
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
        setLocationSearchQuery(result.name);
        setLocationSearchResults([]);
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

        void saveFavorite(`Запазена точка ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, latitude, longitude);
    };

    const handleRegionDidChange = (event: any) => {
        if (cameraLockedToInitialView && hasInitialCameraTarget) {
            setCameraLockedToInitialView(false);
        }

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
                setMapBounds({ north, south, east, west });
                return;
            }
        }

        const center = event?.geometry?.coordinates;
        if (Array.isArray(center) && center.length >= 2) {
            const longitude = Number(center[0]);
            const latitude = Number(center[1]);

            if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
                setMapBounds(createFallbackBounds(latitude, longitude));
            }
        }
    };

    const renderStopEtaSummary = (stopId: string, textStyle: any = styles.calloutSecondary, maxItems?: number) => {
        const stopEtas = etasByStopId[stopId] || [];
        if (!stopEtas.length) {
            return <Text style={textStyle}>Няма налични ETA в момента</Text>;
        }

        const visibleEtas = typeof maxItems === 'number' ? stopEtas.slice(0, maxItems) : stopEtas;

        return visibleEtas.map((eta) => (
            <Text key={`${eta.tripId}-${eta.stopId}-${eta.arrivalTimestamp}`} style={textStyle}>
                {`${getVehicleIcon(eta.type)} ${eta.line} • ${eta.minutesAway} мин • ${formatUnixTime(eta.arrivalTimestamp)}`}
            </Text>
        ));
    };

    const renderStopEtaByLine = (stop: Stop) => {
        const stopEtas = etasByStopId[stop.id] || [];
        const etasByLine = new Map<string, StopEta[]>();

        stopEtas.forEach((eta) => {
            const key = String(eta.line || '').trim();
            if (!key) {
                return;
            }

            const existing = etasByLine.get(key) || [];
            existing.push(eta);
            etasByLine.set(key, existing);
        });

        const uniqueLines = Array.from(new Set([
            ...stop.lines.map((line) => String(line || '').trim()).filter(Boolean),
            ...Array.from(etasByLine.keys()),
        ])).sort((left, right) => left.localeCompare(right, 'bg', { numeric: true }));

        if (!uniqueLines.length) {
            return <Text style={styles.stopScheduleEta}>Няма налични линии за тази спирка</Text>;
        }

        return uniqueLines.map((line) => {
            const lineEtas = (etasByLine.get(line) || [])
                .slice()
                .sort((left, right) => left.arrivalTimestamp - right.arrivalTimestamp)
                .slice(0, 3);

            return (
                <View key={`${stop.id}-${line}`} style={styles.stopLineBoardRow}>
                    <Text style={styles.stopLineBoardLine}>{line}</Text>
                    <Text style={styles.stopLineBoardEta}>
                        {lineEtas.length
                            ? lineEtas.map((eta) => `${eta.minutesAway} мин (${formatUnixTime(eta.arrivalTimestamp)})`).join(' · ')
                            : 'Няма live ETA в момента'}
                    </Text>
                </View>
            );
        });
    };

    const renderLiveVehicleMarker = (vehicle: Vehicle) => (
        <View style={styles.liveVehicleContainer}>
            <Text style={[styles.liveVehicleLineText, { color: getVehicleAccentColor(vehicle.type) }]}>{vehicle.line}</Text>
            <View style={[styles.liveVehicleWrap, { transform: [{ rotate: `${(vehicle.headingDegrees || 0) - 90}deg` }] }]}>
                <View style={[styles.liveVehicleAccentPlate, { backgroundColor: getVehicleAccentColor(vehicle.type) }]} />
                <Text style={styles.liveVehicleIcon}>{getVehicleIcon(vehicle.type)}</Text>
            </View>
        </View>
    );

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
                    mapStyle="https://demotiles.maplibre.org/style.json"
                    logoEnabled={false}
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

                    {!routeGeometry && filteredStops.map((stop) => (
                        <MapboxGL.PointAnnotation
                            key={`stop-${stop.id}`}
                            id={`stop-${stop.id}`}
                            coordinate={[stop.longitude, stop.latitude]}
                            onSelected={() => openStopPopupOnly(stop)}
                        >
                            <View style={styles.stopDot}>
                                <Text style={styles.stopIcon}>🚏</Text>
                            </View>
                            <MapboxGL.Callout>
                                <View style={styles.calloutCard}>
                                    <Text style={styles.calloutTitle}>{stop.name}</Text>
                                    <Text style={styles.calloutSecondary}>{`Спирка: ${stop.id}`}</Text>
                                    <Text style={styles.calloutSecondary}>{summarizeStopDirections(stop, 1)}</Text>
                                    <Text style={styles.calloutSecondary}>{`Линии: ${stop.lines.slice(0, 8).join(', ') || 'н/д'}`}</Text>
                                    {renderStopEtaSummary(stop.id, styles.calloutSecondary, STOP_ETA_PREVIEW_COUNT)}
                                </View>
                            </MapboxGL.Callout>
                        </MapboxGL.PointAnnotation>
                    ))}

                    {displayVehicles.map((vehicle) => (
                        <MapboxGL.PointAnnotation
                            key={`vehicle-${vehicle.id}`}
                            id={`vehicle-${vehicle.id}`}
                            coordinate={[vehicle.longitude, vehicle.latitude]}
                        >
                            <View style={styles.vehicleMarkerWrap}>
                                {renderLiveVehicleMarker(vehicle)}
                            </View>
                            <MapboxGL.Callout>
                                <View style={styles.calloutCard}>
                                    <Text style={styles.calloutTitle}>{`${getVehicleIcon(vehicle.type)} Линия ${vehicle.line}`}</Text>
                                    <Text style={styles.calloutSecondary}>{`Vehicle ID: ${vehicle.id}`}</Text>
                                    <Text style={styles.calloutSecondary}>{`Последен update: ${formatUnixTime(vehicle.lastUpdatedUnix)}`}</Text>
                                    <Text style={styles.calloutSecondary}>{`Скорост: ${Number.isFinite(vehicle.speedKph) ? Math.round(vehicle.speedKph as number) : 'н/д'} км/ч`}</Text>
                                    <Text style={styles.calloutSecondary}>{`Спирка: ${vehicle.stopId ? (stopNameById[vehicle.stopId] || vehicle.stopId) : 'н/д'}`}</Text>
                                </View>
                            </MapboxGL.Callout>
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
                            <MapboxGL.PointAnnotation
                                key={`route-stop-${dirIndex}-${stop.id}-${stopIndex}`}
                                id={`route-stop-${dirIndex}-${stop.id}-${stopIndex}`}
                                coordinate={[stop.longitude, stop.latitude]}
                                onSelected={() => openRouteStopPopupOnly(stop.id)}
                            >
                                <View
                                    style={[
                                        styles.routeStopDot,
                                        { backgroundColor: getDirectionAccentColor(dirIndex), borderColor: getDirectionAccentColor(dirIndex) },
                                    ]}
                                >
                                    <Text style={styles.routeStopText}>{stopIndex + 1}</Text>
                                </View>
                                <MapboxGL.Callout>
                                    <View style={styles.calloutCard}>
                                        <Text style={styles.calloutTitle}>{`${stopIndex + 1}. ${stop.name}`}</Text>
                                        <Text style={styles.calloutSecondary}>{`Спирка ID: ${stop.id}`}</Text>
                                        <Text style={styles.calloutSecondary}>{`Линия: ${routeGeometry?.line || highlightedRoute?.line || 'н/д'}`}</Text>
                                        <Text style={styles.calloutSecondary}>{`Посока: ${direction.name || `Посока ${dirIndex + 1}`}`}</Text>
                                        {renderStopEtaSummary(stop.id, styles.calloutSecondary, STOP_ETA_PREVIEW_COUNT)}
                                    </View>
                                </MapboxGL.Callout>
                            </MapboxGL.PointAnnotation>
                        ))
                    )}
                </MapboxGL.MapView>

                <Modal
                    animationType="fade"
                    transparent
                    visible={searchModalVisible}
                    onRequestClose={() => setSearchModalVisible(false)}
                >
                    <View style={styles.searchModalOverlay}>
                        <View style={styles.searchModalCard}>
                            <View style={styles.searchModalHeader}>
                                <Text style={styles.searchModalTitle}>Търсене на места</Text>
                                <Pressable onPress={() => setSearchModalVisible(false)} style={styles.searchModalClose}>
                                    <Text style={styles.searchModalCloseText}>✕</Text>
                                </Pressable>
                            </View>
                            <TextInput
                                style={styles.locationSearchInput}
                                placeholder="Търси адрес или място..."
                                placeholderTextColor="#6B7280"
                                value={locationSearchQuery}
                                onChangeText={setLocationSearchQuery}
                            />
                            {(locationSearchLoading || locationSearchResults.length > 0) && (
                                <ScrollView
                                    style={styles.locationSearchResults}
                                    showsVerticalScrollIndicator
                                    nestedScrollEnabled
                                >
                                    {locationSearchLoading && (
                                        <Text style={styles.locationSearchStatus}>Търсене...</Text>
                                    )}
                                    {!locationSearchLoading && locationSearchResults.map((result) => (
                                        <View key={result.id} style={styles.locationSearchResultRow}>
                                            <TouchableOpacity style={styles.locationSearchResultPress} onPress={() => onSelectSearchResult(result)}>
                                                <Text style={styles.locationSearchResultTitle} numberOfLines={1}>{result.name}</Text>
                                                <Text style={styles.locationSearchResultSubtitle} numberOfLines={1}>{result.subtitle}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.favoriteInlineButton}
                                                onPress={() => { void saveFavorite(result.name, result.latitude, result.longitude); }}
                                            >
                                                <Text style={styles.favoriteInlineButtonText}>☆</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ))}
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
                                <Text style={styles.favoritesPanelCloseButtonText}>✕</Text>
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
                                        onPress={() => focusMapOnCoordinate(favorite.latitude, favorite.longitude)}
                                    >
                                        <Text style={styles.favoriteRowName} numberOfLines={1}>{favorite.name}</Text>
                                        <Text style={styles.favoriteRowCoords} numberOfLines={1}>{`${favorite.latitude.toFixed(5)}, ${favorite.longitude.toFixed(5)}`}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.favoriteRemoveButton}
                                        onPress={() => { void onRemoveFavorite(favorite.id); }}
                                    >
                                        <Text style={styles.favoriteRemoveButtonText}>✕</Text>
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
                    <ScrollView style={styles.linesScroll} showsVerticalScrollIndicator={false}>
                        <View style={styles.chipRow}>
                            <TouchableOpacity
                                style={[styles.filterChip, !selectedLines.length && styles.filterChipActive]}
                                onPress={() => setSelectedLines([])}
                            >
                                <Text style={[styles.filterChipText, !selectedLines.length && styles.filterChipTextActive]}>Всички</Text>
                            </TouchableOpacity>
                            {availableLines.map((line) => (
                                <TouchableOpacity
                                    key={line}
                                    style={[styles.filterChip, selectedLines.includes(line) && styles.filterChipActive]}
                                    onPress={() => toggleLineFilter(line)}
                                >
                                    <Text style={[styles.filterChipText, selectedLines.includes(line) && styles.filterChipTextActive]}>{line}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>
                    <Text style={styles.filterHint}>{`Показани превозни средства: ${filteredVehicles.length}/${vehicles.length}`}</Text>
                    <Text style={styles.filterHint}>{`Видими спирки: ${filteredStops.length}/${stops.length}`}</Text>
                    <View style={styles.nearbyStopsList}>
                        {filteredStops.slice(0, 6).map((stop) => (
                            <TouchableOpacity
                                key={stop.id}
                                style={styles.nearbyStopButton}
                                onPress={() => { void openStopDetails(stop); }}
                            >
                                <Text style={styles.nearbyStopButtonText} numberOfLines={1}>{stop.name}</Text>
                                <Text style={styles.nearbyStopDirectionText} numberOfLines={2}>{summarizeStopDirections(stop, 1)}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
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
                                onPress={() => { void openRouteStopDetails(stop, stop.directionName); }}
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

                {selectedStop && (
                    <View style={styles.stopSchedulePanel}>
                        <View style={styles.stopScheduleHeader}>
                            <View style={styles.stopScheduleTitleWrap}>
                                <Text style={styles.stopScheduleTitle}>{selectedStop.name}</Text>
                                <Text style={styles.stopScheduleMeta}>{`Спирка: ${selectedStop.id}`}</Text>
                                <Text style={styles.stopScheduleMeta}>{summarizeStopDirections(selectedStop, 2)}</Text>
                                <Text style={styles.stopScheduleMeta}>{`Линии: ${selectedStop.lines.slice(0, 10).join(', ') || 'н/д'}`}</Text>
                            </View>
                            <Pressable onPress={() => setSelectedStop(null)} style={styles.stopScheduleClose}>
                                <Text style={styles.stopScheduleCloseText}>Затвори</Text>
                            </Pressable>
                        </View>
                        <ScrollView style={styles.stopScheduleList} showsVerticalScrollIndicator={false}>
                            <Text style={styles.stopLineBoardTitle}>Live ETA по линии</Text>
                            {renderStopEtaByLine(selectedStop)}
                        </ScrollView>
                    </View>
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
        maxHeight: 112,
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
        gap: 6,
    },
    nearbyStopButton: {
        backgroundColor: '#DBEAFE',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
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
        backgroundColor: 'white',
        borderWidth: 2,
        borderColor: '#007AFF',
        borderRadius: 6,
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#111827',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.16,
        shadowRadius: 4,
        elevation: 3,
    },
    stopIcon: {
        fontSize: 15,
        fontWeight: '700',
    },
    routeStopDot: {
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 2.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    routeStopText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '700',
    },
    calloutCard: {
        minWidth: 220,
        padding: 8,
        gap: 4,
    },
    calloutTitle: {
        color: '#111827',
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 2,
    },
    calloutSecondary: {
        color: '#374151',
        fontSize: 12,
        marginBottom: 2,
    },
    stopSchedulePanel: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 110,
        backgroundColor: 'rgba(255,255,255,0.97)',
        borderRadius: 18,
        padding: 14,
        zIndex: 25,
        elevation: 25,
    },
    stopScheduleHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 10,
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
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: '#E5E7EB',
    },
    stopScheduleCloseText: {
        color: '#111827',
        fontSize: 12,
        fontWeight: '600',
    },
    stopScheduleList: {
        maxHeight: 180,
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
    }
});
