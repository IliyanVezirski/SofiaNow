import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, LogBox } from 'react-native';
import MapboxGL from '@maplibre/maplibre-react-native';

import { RouteSelection } from '../types/routes';
import { Vehicle } from '../types/vehicles';
import { Stop, fetchStopById, fetchLineRouteGeometryByRouteId, fetchLineRouteGeometry, fetchOsrmRoute, summarizeStopDirections } from '../services/stopsApi';
import { fetchVehiclesInBounds } from '../services/cgmApi/vehiclePositions';
import { fetchStopEtas } from '../services/cgmApi/stopEtas';
import { fetchTripDelay } from '../services/cgmApi/delays';
import { getEtaScheduleInfo } from '../services/cgmApi/schedules';
import { hasFavoriteCoordinates } from '../services/places';
import { VehicleType, getVehicleAccentColor, getVehicleIcon, formatUnixTime, inferLineTypeFromToken } from '../services/transitUtils';
import { TripLocation } from '../services/tripPlanner';
import { TripRouteGeoJSON } from '../features/tripPlanner/utils/routeGeoJson';

import { useUserLocation } from '../features/map/hooks/useUserLocation';
import { useMapCamera } from '../features/map/hooks/useMapCamera';
import { useMapBounds } from '../features/map/hooks/useMapBounds';
import { useVehicles } from '../features/vehicles/hooks/useVehicles';
import { useVehicleAnimation } from '../features/vehicles/hooks/useVehicleAnimation';
import { useVehicleRoute } from '../features/vehicles/hooks/useVehicleRoute';
import { useStops } from '../features/stops/hooks/useStops';
import { useStopEtas } from '../features/stops/hooks/useStopEtas';
import { useStopSchedule } from '../features/stops/hooks/useStopSchedule';
import { useSelectedStop } from '../features/stops/hooks/useSelectedStop';
import { useFilters } from '../features/filters/hooks/useFilters';
import { useSearch } from '../features/search/hooks/useSearch';
import { useFavorites } from '../features/favorites/hooks/useFavorites';
import { useRouteGeometry } from '../features/routing/hooks/useRouteGeometry';
import { useTripOverlay, resolveTripPlannerStopToKnownStop } from '../features/tripPlanner/hooks/useTripOverlay';
import { useReporting } from '../features/reporting/hooks/useReporting';
import { Ionicons } from '@expo/vector-icons';

import { VehicleMarkerContent } from '../features/vehicles/components/VehicleMarker';
import { VehicleInfoPanel } from '../features/vehicles/components/VehicleInfoPanel';
import { StopInfoPanel } from '../features/stops/components/StopInfoPanel';
import { StopScheduleModal } from '../features/stops/components/StopScheduleModal';
import { FilterPanel } from '../features/filters/components/FilterPanel';
import { SearchModal } from '../features/search/components/SearchModal';
import { CentralSearchResult } from '../features/search/hooks/useSearch';
import { FavoritesPanel } from '../features/favorites/components/FavoritesPanel';
import { RouteStopsPanel } from '../features/routing/components/RouteStopsPanel';
import { ReportModal } from '../features/reporting/components/ReportModal';
import { DroppedPinPanel } from '../features/droppedPin/components/DroppedPinPanel';
import { ReminderCenterButton } from '../features/notifications/components/ReminderCenterButton';

import { INITIAL_ZOOM_LEVEL, MAP_STYLE, MAX_RENDERED_STOPS, DEFAULT_CENTER_COORDINATE, createFallbackBounds, getDirectionAccentColor, getDirectionArrowSamples } from '../features/map/constants';

const createCirclePolygon = (centerLon: number, centerLat: number, radiusMeters: number, label: string) => {
    const coords: [number, number][] = [];
    const km = radiusMeters / 1000;
    const distanceX = km / (111.32 * Math.cos(centerLat * Math.PI / 180));
    const distanceY = km / 110.574;
    for (let i = 0; i < 64; i++) {
        const theta = (i / 64) * (2 * Math.PI);
        const x = distanceX * Math.cos(theta);
        const y = distanceY * Math.sin(theta);
        coords.push([centerLon + x, centerLat + y]);
    }
    coords.push([...coords[0]]); // Perfectly close the geometry ring to prevent invalid GeoJSON

    // Multiple label points to ensure visibility at high zoom
    const labelPoints = [
        { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [centerLon, centerLat + distanceY] }, properties: { customType: 'circle_label', label } },
        { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [centerLon, centerLat - distanceY] }, properties: { customType: 'circle_label', label } },
        { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [centerLon + distanceX, centerLat] }, properties: { customType: 'circle_label', label } },
        { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [centerLon - distanceX, centerLat] }, properties: { customType: 'circle_label', label } }
    ];

    return {
        polygon: { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: coords }, properties: { customType: 'circle_line' } },
        labelPoints
    };
};

const getStopTypeInfo = (type: VehicleType) => {
    switch (type) {
        case 'bus':
            return { color: '#DC2626' };
        case 'trolley':
            return { color: '#2563EB' };
        case 'tram':
            return { color: '#F97316' };
        default:
            return { color: '#94A3B8' };
    }
};

const StopDot = ({ stop, selected }: { stop: Stop; selected: boolean }) => {
    const types = useMemo(() => {
        if (stop.vehicleTypes && stop.vehicleTypes.length > 0) {
            const typesSet = new Set(stop.vehicleTypes);
            const sorted = Array.from(typesSet);
            sorted.sort();
            return sorted;
        }

        const tSet = new Set<VehicleType>();
        stop.lines.forEach(l => {
            const t = inferLineTypeFromToken(l);
            tSet.add(t);
        });
        const sorted = Array.from(tSet);
        sorted.sort();
        return sorted;
    }, [stop.lines, stop.vehicleTypes]);

    if (types.length === 0) {
        return <View style={[styles.stopDot, selected && styles.stopDotSelected]} />;
    }

    const hasSubway = types.includes('subway');
    const primaryColor = hasSubway ? '#0056A4' : getStopTypeInfo(types[0]).color;

    if (types.length > 1 && !hasSubway) {
        const colors = types.map(t => getStopTypeInfo(t).color);
        return (
            <View style={[
                styles.stopDotBase,
                selected && styles.stopDotBaseSelected,
            ]}>
                <View style={{ width: 10, height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row' }}>
                    {colors.map((c, i) => (
                        <View key={i} style={{ flex: 1, backgroundColor: c }} />
                    ))}
                </View>
                {selected && (
                    <View style={styles.stopLabelContainer}>
                        <Text style={styles.stopLabelText}>{stop.name}</Text>
                    </View>
                )}
            </View>
        );
    }

    return (
        <View style={[
            styles.stopDotBase,
            selected && styles.stopDotBaseSelected,
        ]}>
            {hasSubway ? (
                <Text style={{ color: '#0056A4', fontWeight: '800', fontSize: 9, lineHeight: 11 }}>M</Text>
            ) : (
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: primaryColor }} />
            )}
            {selected && (
                <View style={styles.stopLabelContainer}>
                    <Text style={styles.stopLabelText}>{stop.name}</Text>
                </View>
            )}
        </View>
    );
};

interface MapScreenProps {
    highlightedRoute?: RouteSelection | null;
    onClearHighlightedRoute?: () => void;
    isActive?: boolean;
    showReportButton?: boolean;
    filterPanelVisible?: boolean;
    onCloseFilterPanel?: () => void;
    onBuildRouteFromCoordinate?: (dstLat: number, dstLon: number, curLat?: number, curLon?: number) => void;
    onShowTripRoute?: (route: TripRouteGeoJSON) => void;
    searchRequestToken?: number;
    favoritesRequestToken?: number;
    dismissTransientPanelsToken?: number;
    onFilterCountChange?: (count: number) => void;
    focusStopCoordinate?: { latitude: number; longitude: number } | null;
    focusStopId?: string | null;
    tripPlannerRoute?: TripRouteGeoJSON | null;
    onClearTripRoute?: () => void;
    onSearchVisibilityChange?: (visible: boolean) => void;
    onFavoritesVisibilityChange?: (visible: boolean) => void;
}

export default function MapScreen({
    highlightedRoute,
    onClearHighlightedRoute,
    isActive = true,
    showReportButton = true,
    filterPanelVisible = true,
    onCloseFilterPanel,
    onBuildRouteFromCoordinate,
    onShowTripRoute,
    searchRequestToken,
    favoritesRequestToken,
    dismissTransientPanelsToken,
    onFilterCountChange,
    focusStopCoordinate,
    focusStopId,
    tripPlannerRoute,
    onClearTripRoute,
    onSearchVisibilityChange,
    onFavoritesVisibilityChange,
}: MapScreenProps) {
    const stopAnnotationRefs = useRef<Record<string, { refresh: () => void } | null>>({});
    const previousSelectedStopAnnotationIdRef = useRef<string | null>(null);
    const hasAppliedInitialLocationCameraRef = useRef(false);

    // ── Core map hooks ──
    const { location, refresh: refreshLocation } = useUserLocation();
    const camera = useMapCamera();
    const bounds = useMapBounds();

    const walkingRadiiGeoJSON = useMemo(() => {
        if (!location) return null;
        const lon = location.coords.longitude;
        const lat = location.coords.latitude;
        // Radii match NearbyScreen: 5min=208m, 10min=416m, 15min=625m
        const walk5 = createCirclePolygon(lon, lat, 208, '5 мин');
        const walk10 = createCirclePolygon(lon, lat, 416, '10 мин');
        const walk15 = createCirclePolygon(lon, lat, 625, '15 мин');
        return {
            type: 'FeatureCollection' as const,
            features: [
                walk5.polygon, walk10.polygon, walk15.polygon,
                ...walk5.labelPoints, ...walk10.labelPoints, ...walk15.labelPoints
            ]
        };
    }, [location]);

    // ── Filters ──
    const filters = useFilters(highlightedRoute, onFilterCountChange);

    const hasTripRoute = !!(tripPlannerRoute && tripPlannerRoute.features.length > 0);

    // ── Stops & ETAs (needed by trip overlay) ──
    const stopsHook = useStops(
        bounds.mapBounds, hasTripRoute, filters.selectedLines, filters.selectedVehicleTypes,
        filters.isRouteMode, camera.mapCenterCoordinate,
    );
    const etasHook = useStopEtas();
    const schedule = useStopSchedule();
    const selectedStop = useSelectedStop();

    // ── Trip overlay (depends on stops + etas) ──
    const tripOverlay = useTripOverlay(tripPlannerRoute, stopsHook.searchableStops, etasHook.setEtasByStopId, camera.setTripCameraBounds);

    // ── Vehicles ──
    const { vehicles, lastUpdated } = useVehicles(bounds.mapBounds, hasTripRoute);

    const selectedStopLines = useMemo(() => {
        if (!selectedStop.selectedStop?.lines?.length) return [] as string[];
        return selectedStop.selectedStop.lines.map((l) => String(l || '').trim().toUpperCase()).filter(Boolean);
    }, [selectedStop.selectedStop]);

    const animation = useVehicleAnimation(
        vehicles, filters.selectedVehicleTypes, filters.selectedLines,
        filters.isRouteMode, highlightedRoute, selectedStopLines,
    );

    const vehicleRoute = useVehicleRoute();
    const [vehicleDelays, setVehicleDelays] = useState<Record<string, number | null>>({});
    const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
    const selectedVehicleIdRef = useRef<string | null>(null);
    const [droppedPin, setDroppedPin] = useState<{ latitude: number; longitude: number } | null>(null);
    const [userLocationVisible, setUserLocationVisible] = useState(true);

    const selectedVehicle = useMemo(() => {
        if (!selectedVehicleId) return null;
        return animation.renderedDisplayVehicles.find((v) => v.id === selectedVehicleId) ?? null;
    }, [selectedVehicleId, animation.renderedDisplayVehicles]);

    // ── Search, Favorites, Routing, Reporting ──
    const search = useSearch(stopsHook.searchableStops, filters.staticLines);
    const favorites = useFavorites();
    const droppedPinAlreadySaved = useMemo(() => {
        if (!droppedPin) {
            return false;
        }

        const normalizedLatitude = droppedPin.latitude.toFixed(6);
        const normalizedLongitude = droppedPin.longitude.toFixed(6);

        return favorites.favoritePlaces.some((favorite) => (
            hasFavoriteCoordinates(favorite)
            && favorite.latitude!.toFixed(6) === normalizedLatitude
            && favorite.longitude!.toFixed(6) === normalizedLongitude
        ));
    }, [droppedPin, favorites.favoritePlaces]);
    const routing = useRouteGeometry(
        highlightedRoute,
        (lon, lat) => camera.lockCamera(lat, lon),
        camera.setRouteCameraBounds,
    );
    const reporting = useReporting();

    const preferredInitialCenterCoordinate = useMemo<[number, number]>(() => {
        if (location) {
            return [location.coords.longitude, location.coords.latitude];
        }

        return DEFAULT_CENTER_COORDINATE;
    }, [location]);

    // ── Initialize camera from location ──
    useEffect(() => {
        if (!location || highlightedRoute || hasAppliedInitialLocationCameraRef.current || camera.hasInitialCameraTarget) {
            return;
        }

        hasAppliedInitialLocationCameraRef.current = true;
        camera.lockCamera(location.coords.latitude, location.coords.longitude);
        bounds.setMapBounds(createFallbackBounds(location.coords.latitude, location.coords.longitude));
        setUserLocationVisible(true);
    }, [bounds, camera, highlightedRoute, location]);

    // ── Refresh ETAs alongside vehicles ──
    useEffect(() => {
        if (!vehicles.length) return;
        void etasHook.refreshEtasForStops(stopsHook.stops.slice(0, MAX_RENDERED_STOPS));
    }, [vehicles]);

    // ── Token-driven actions ──
    useEffect(() => {
        if (typeof searchRequestToken === 'number' && searchRequestToken > 0) {
            search.setSearchModalVisible((prev) => {
                const next = !prev;
                if (next) favorites.setFavoritesVisible(false);
                return next;
            });
        }
    }, [searchRequestToken]);

    useEffect(() => {
        if (typeof favoritesRequestToken === 'number' && favoritesRequestToken > 0) {
            search.setSearchModalVisible(false);
            favorites.setFavoritesVisible((prev) => !prev);
        }
    }, [favoritesRequestToken]);

    useEffect(() => {
        if (typeof dismissTransientPanelsToken === 'number' && dismissTransientPanelsToken > 0) {
            search.setSearchModalVisible(false);
            favorites.setFavoritesVisible(false);
        }
    }, [dismissTransientPanelsToken]);

    useEffect(() => {
        onSearchVisibilityChange?.(search.searchModalVisible);
    }, [search.searchModalVisible]);

    useEffect(() => {
        onFavoritesVisibilityChange?.(favorites.favoritesVisible);
    }, [favorites.favoritesVisible]);

    useEffect(() => {
        const previousAnnotationId = previousSelectedStopAnnotationIdRef.current;
        if (previousAnnotationId && previousAnnotationId !== selectedStop.selectedStopAnnotationId) {
            stopAnnotationRefs.current[previousAnnotationId]?.refresh();
        }
        if (selectedStop.selectedStopAnnotationId) {
            stopAnnotationRefs.current[selectedStop.selectedStopAnnotationId]?.refresh();
        }
        previousSelectedStopAnnotationIdRef.current = selectedStop.selectedStopAnnotationId;
    }, [selectedStop.selectedStopAnnotationId]);

    useEffect(() => {
        if (filterPanelVisible) {
            search.setSearchModalVisible(false);
            favorites.setFavoritesVisible(false);
        }
    }, [filterPanelVisible]);

    // ── Focus stop from outside ──
    useEffect(() => {
        if (focusStopCoordinate) {
            camera.focusOnCoordinate(focusStopCoordinate.latitude, focusStopCoordinate.longitude);
            bounds.setMapBounds(createFallbackBounds(focusStopCoordinate.latitude, focusStopCoordinate.longitude));
        }
        if (!focusStopCoordinate || !focusStopId) return;
        let cancelled = false;
        (async () => {
            selectedStop.suppressMapPressUntilRef.current = Date.now() + 400;
            selectedStop.selectedStopIdRef.current = focusStopId;
            selectedStop.setSelectedStopAnnotationId(`stop-${focusStopId}`);
            selectedVehicleIdRef.current = null;
            setSelectedVehicleId(null);
            setDroppedPin(null);
            const resolved = await fetchStopById(focusStopId);
            if (cancelled) return;
            if (resolved) selectedStop.setSelectedStop(resolved);
            else selectedStop.setSelectedStop({ id: focusStopId, name: focusStopId, latitude: focusStopCoordinate.latitude, longitude: focusStopCoordinate.longitude, lines: [], directions: [] });
            await etasHook.refreshEtasForStop(focusStopId);
        })();
        return () => { cancelled = true; };
    }, [focusStopCoordinate, focusStopId]);

    // ── Map event handlers ──
    const onMapPress = useCallback(() => {
        if (Date.now() < selectedStop.suppressMapPressUntilRef.current) return;
        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        selectedStop.closeSelectedStop();
        setDroppedPin(null);
        search.setSearchModalVisible(false);
        favorites.setFavoritesVisible(false);
        schedule.closeSchedule();
    }, []);

    const onMapLongPress = useCallback((event: any) => {
        const coords = event?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return;
        const [longitude, latitude] = [Number(coords[0]), Number(coords[1])];
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        setDroppedPin({ latitude, longitude });
        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        selectedStop.closeSelectedStop();
    }, []);

    const recenterToUserLocation = useCallback(async () => {
        if (location) {
            camera.focusOnCoordinate(location.coords.latitude, location.coords.longitude);
            bounds.setMapBounds(createFallbackBounds(location.coords.latitude, location.coords.longitude));
            setUserLocationVisible(true);
            return;
        }

        await refreshLocation();
    }, [bounds, camera, location, refreshLocation]);

    const handleRegionDidChange = useCallback((event: any) => {
        if (camera.cameraLockedToInitialView && camera.hasInitialCameraTarget) camera.unlockCamera();
        if (camera.tripCameraBounds) camera.setTripCameraBounds(null);
        if (camera.routeCameraBounds) camera.setRouteCameraBounds(null);

        const visibleBounds = event?.properties?.visibleBounds;
        if (Array.isArray(visibleBounds) && visibleBounds.length === 2 && Array.isArray(visibleBounds[0]) && Array.isArray(visibleBounds[1]) && visibleBounds[0].length >= 2 && visibleBounds[1].length >= 2) {
            const east = Math.max(Number(visibleBounds[0][0]), Number(visibleBounds[1][0]));
            const west = Math.min(Number(visibleBounds[0][0]), Number(visibleBounds[1][0]));
            const north = Math.max(Number(visibleBounds[0][1]), Number(visibleBounds[1][1]));
            const south = Math.min(Number(visibleBounds[0][1]), Number(visibleBounds[1][1]));
            if ([north, south, east, west].every(Number.isFinite)) {
                if (location) {
                    setUserLocationVisible(
                        location.coords.latitude <= north &&
                        location.coords.latitude >= south &&
                        location.coords.longitude <= east &&
                        location.coords.longitude >= west
                    );
                }
                camera.setMapCenterCoordinate([(east + west) / 2, (north + south) / 2]);
                bounds.scheduleBoundsUpdate({ north, south, east, west });
                return;
            }
        }
        const center = event?.geometry?.coordinates;
        if (Array.isArray(center) && center.length >= 2) {
            const [lon, lat] = [Number(center[0]), Number(center[1])];
            if (Number.isFinite(lon) && Number.isFinite(lat)) {
                const fallbackBounds = createFallbackBounds(lat, lon);
                if (location) {
                    setUserLocationVisible(
                        location.coords.latitude <= fallbackBounds.north &&
                        location.coords.latitude >= fallbackBounds.south &&
                        location.coords.longitude <= fallbackBounds.east &&
                        location.coords.longitude >= fallbackBounds.west
                    );
                }
                bounds.scheduleBoundsUpdate(fallbackBounds);
            }
        }
    }, [camera.cameraLockedToInitialView, camera.hasInitialCameraTarget, camera.routeCameraBounds, camera.setRouteCameraBounds, camera.setTripCameraBounds, camera.tripCameraBounds, location]);

    // ── Search callbacks ──
    const onSelectSearchResult = useCallback((result: CentralSearchResult & { kind: 'place' }) => {
        camera.focusOnCoordinate(result.latitude, result.longitude);
        setDroppedPin({ latitude: result.latitude, longitude: result.longitude });
        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        selectedStop.closeSelectedStop();
        search.setLocationSearchQuery(result.name);
        search.setSearchModalVisible(false);
    }, []);

    const onSelectLineResult = useCallback(async (result: CentralSearchResult & { kind: 'line' }) => {
        const line = result.lineInfo;
        filters.setSelectedLines([line.line]);
        filters.setSelectedVehicleTypes([line.isNight ? 'bus' : line.type]);
        const geo = line.routeId
            ? await fetchLineRouteGeometryByRouteId(line.routeId)
            : await fetchLineRouteGeometry(line.line, line.type, line.isNight);
        const fc = geo?.directions?.[0]?.coordinates?.[0];
        if (fc && fc.length >= 2) camera.focusOnCoordinate(fc[1], fc[0]);
        search.setLocationSearchQuery(line.line);
        search.setSearchModalVisible(false);
    }, []);

    const onSelectStopResult = useCallback(async (result: CentralSearchResult & { kind: 'stop' }) => {
        camera.focusOnCoordinate(result.stop.latitude, result.stop.longitude);
        setDroppedPin(null);
        search.setLocationSearchQuery(result.stop.name);
        search.setSearchModalVisible(false);
        await selectedStop.openStopDetails(result.stop);
        await etasHook.refreshEtasForStop(result.stop.id);
    }, []);

    // ── Render helpers ──
    const liveLines = useMemo(() => new Set(vehicles.map((v) => v.line)), [vehicles]);

    // ── JSX ──
    return (
        <View style={styles.page}>
            <View style={styles.container}>
                <MapboxGL.MapView
                    style={styles.map}
                    mapStyle={MAP_STYLE}
                    surfaceView={false}
                    logoEnabled={false}
                    compassEnabled={false}
                    onPress={onMapPress}
                    onRegionDidChange={handleRegionDidChange}
                    onLongPress={onMapLongPress}

                >
                    <MapboxGL.Camera
                        zoomLevel={(camera.tripCameraBounds || camera.routeCameraBounds) ? undefined : (camera.cameraLockedToInitialView && camera.hasInitialCameraTarget ? INITIAL_ZOOM_LEVEL : (!camera.hasInitialCameraTarget ? INITIAL_ZOOM_LEVEL : undefined))}
                        centerCoordinate={(camera.tripCameraBounds || camera.routeCameraBounds) ? undefined : (camera.cameraLockedToInitialView && camera.hasInitialCameraTarget ? camera.mapCenterCoordinate : (!camera.hasInitialCameraTarget ? preferredInitialCenterCoordinate : undefined))}
                        bounds={(camera.tripCameraBounds || camera.routeCameraBounds)
                            ? {
                                ne: (camera.tripCameraBounds || camera.routeCameraBounds)!.ne,
                                sw: (camera.tripCameraBounds || camera.routeCameraBounds)!.sw,
                                paddingTop: 60,
                                paddingBottom: 80,
                                paddingLeft: 60,
                                paddingRight: 60,
                            }
                            : undefined}
                        animationDuration={(camera.tripCameraBounds || camera.routeCameraBounds) ? 800 : 0}
                    />

                    {location && (
                        <MapboxGL.PointAnnotation
                            id="user-location"
                            key={`user-${location.coords.latitude}-${location.coords.longitude}`}
                            coordinate={[location.coords.longitude, location.coords.latitude]}
                        >
                            <View style={styles.userDot} />
                        </MapboxGL.PointAnnotation>
                    )}

                    {walkingRadiiGeoJSON && (
                        <MapboxGL.ShapeSource id="walking-radii" shape={walkingRadiiGeoJSON as any}>
                            <MapboxGL.LineLayer id="walking-radii-line" filter={['==', ['get', 'customType'], 'circle_line']} style={{ lineColor: '#9CA3AF', lineWidth: 1.5, lineOpacity: 0.8 }} />
                            <MapboxGL.SymbolLayer id="walking-radii-label" filter={['==', ['get', 'customType'], 'circle_label']} style={{
                                textField: ['get', 'label'],
                                textSize: 10,
                                textColor: '#4B5563',
                                textHaloColor: 'rgba(255,255,255,0.85)',
                                textHaloWidth: 1.5,
                                textAnchor: 'center',
                            }} />
                        </MapboxGL.ShapeSource>
                    )}

                    {/* Stops */}
                    {!routing.routeGeometry && !vehicleRoute.hasVehicleRoute && !hasTripRoute && stopsHook.renderedStops.map((stop) => (
                        <MapboxGL.PointAnnotation
                            key={`stop-${stop.id}-${selectedStop.selectedStopAnnotationId === `stop-${stop.id}` ? 'selected' : 'idle'}`}
                            id={`stop-${stop.id}`}
                            ref={(ref) => { stopAnnotationRefs.current[`stop-${stop.id}`] = ref; }}
                            coordinate={[stop.longitude, stop.latitude]}
                            selected={selectedStop.selectedStopAnnotationId === `stop-${stop.id}`}
                            onSelected={() => {
                                void (async () => {
                                    await selectedStop.openStopDetails(stop);
                                    await etasHook.refreshEtasForStop(stop.id);
                                })();
                            }}
                            onDeselected={() => {
                                if (selectedStop.selectedStopIdRef.current === stop.id) selectedStop.closeSelectedStop();
                            }}
                        >
                            <StopDot stop={stop} selected={selectedStop.selectedStopAnnotationId === `stop-${stop.id}`} />
                        </MapboxGL.PointAnnotation>
                    ))}

                    {/* Route geometry lines */}
                    {!hasTripRoute && routing.routeGeometry?.directions.map((direction, index) => (
                        <MapboxGL.ShapeSource
                            id={`route-source-${routing.routeGeometry!.line}-${index}`}
                            key={`route-source-${routing.routeGeometry!.line}-${index}`}
                            shape={{ type: 'Feature', properties: { routeColor: getDirectionAccentColor(index) }, geometry: { type: 'LineString', coordinates: direction.coordinates } }}
                        >
                            <MapboxGL.LineLayer
                                id={`route-layer-${routing.routeGeometry!.line}-${index}`}
                                style={{ lineColor: ['get', 'routeColor'], lineWidth: 4, lineOpacity: 0.9 }}
                            />
                        </MapboxGL.ShapeSource>
                    ))}

                    {/* Route direction arrows */}
                    {!hasTripRoute && routing.routeGeometry?.directions.map((direction, dirIdx) =>
                        getDirectionArrowSamples(direction.coordinates).map((arrow, aIdx) => (
                            <MapboxGL.PointAnnotation key={`route-arrow-${dirIdx}-${aIdx}`} id={`route-arrow-${dirIdx}-${aIdx}`} coordinate={arrow.coordinate}>
                                <Text style={[styles.routeDirectionArrow, { color: getDirectionAccentColor(dirIdx), transform: [{ rotate: `${arrow.headingDegrees}deg` }] }]}>{'\u25B2'}</Text>
                            </MapboxGL.PointAnnotation>
                        ))
                    )}

                    {/* Route stops */}
                    {!hasTripRoute && routing.routeGeometry?.directions.map((direction, dirIdx) =>
                        direction.stops.map((stop, stopIdx) => {
                            const annId = `route-stop-v${routing.routeGeometryVersion}-${dirIdx}-${stop.id}-${stopIdx}`;
                            return (
                                <MapboxGL.PointAnnotation
                                    key={`${annId}-${selectedStop.selectedStopAnnotationId === annId ? 'selected' : 'idle'}`} id={annId} coordinate={[stop.longitude, stop.latitude]}
                                    ref={(ref) => { stopAnnotationRefs.current[annId] = ref; }}
                                    selected={selectedStop.selectedStopAnnotationId === annId}
                                    onSelected={() => {
                                        void (async () => {
                                            await selectedStop.openRouteStopDetails(stop, direction.name || `Посока ${dirIdx + 1}`, annId, stopsHook.stopById, routing.routeGeometry?.line, highlightedRoute?.line);
                                            await etasHook.refreshEtasForStop(stop.id);
                                        })();
                                    }}
                                    onDeselected={() => { if (selectedStop.selectedStopIdRef.current === stop.id) selectedStop.closeSelectedStop(); }}
                                >
                                    <View style={{ alignItems: 'center', zIndex: 20, elevation: 20 }}>
                                        <View style={[styles.routeStopDot, { backgroundColor: getDirectionAccentColor(dirIdx), borderColor: getDirectionAccentColor(dirIdx) }, selectedStop.selectedStopAnnotationId === annId && styles.routeStopDotSelected]}>
                                            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.routeStopText}>{stopIdx + 1}</Text>
                                        </View>
                                        <View style={[styles.routeStopLabel, selectedStop.selectedStopAnnotationId === annId && styles.routeStopLabelSelected]}>
                                            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.routeStopName} numberOfLines={1}>{stop.name}</Text>
                                        </View>
                                    </View>
                                </MapboxGL.PointAnnotation>
                            );
                        })
                    )}

                    {/* Vehicle route overlay */}
                    {!hasTripRoute && vehicleRoute.vehicleRouteStops.length > 0 && (() => {
                        const trackedVehicle = animation.renderedDisplayVehicles.find((v) => v.id === vehicleRoute.vehicleRouteVehicleId);
                        let liveCoords: [number, number][] = vehicleRoute.vehicleRouteCoords;
                        if (trackedVehicle && vehicleRoute.vehicleRouteCoords.length >= 2) {
                            const vLon = trackedVehicle.longitude;
                            const vLat = trackedVehicle.latitude;
                            let bestIdx = 0;
                            let bestDist = Infinity;
                            for (let i = 0; i < vehicleRoute.vehicleRouteCoords.length; i += 1) {
                                const dx = vehicleRoute.vehicleRouteCoords[i][0] - vLon;
                                const dy = vehicleRoute.vehicleRouteCoords[i][1] - vLat;
                                const d = dx * dx + dy * dy;
                                if (d < bestDist) {
                                    bestDist = d;
                                    bestIdx = i;
                                }
                            }
                            liveCoords = [[vLon, vLat], ...vehicleRoute.vehicleRouteCoords.slice(bestIdx + 1)];
                            if (liveCoords.length < 2) {
                                liveCoords = [[vLon, vLat], vehicleRoute.vehicleRouteCoords[vehicleRoute.vehicleRouteCoords.length - 1]];
                            }
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

                                {vehicleRoute.vehicleRouteStops.map((stop, idx) => {
                                    const annId = `vr-stop-${stop.stopId}-${idx}`;
                                    return (
                                        <MapboxGL.PointAnnotation
                                            key={`${annId}-${selectedStop.selectedStopAnnotationId === annId ? 'selected' : 'idle'}`}
                                            id={annId}
                                            ref={(ref) => { stopAnnotationRefs.current[annId] = ref; }}
                                            coordinate={[stop.longitude, stop.latitude]}
                                            selected={selectedStop.selectedStopAnnotationId === annId}
                                            onSelected={async () => {
                                                selectedStop.suppressMapPressUntilRef.current = Date.now() + 400;
                                                selectedStop.selectedStopIdRef.current = stop.stopId;
                                                selectedStop.setSelectedStopAnnotationId(annId);
                                                selectedVehicleIdRef.current = null;
                                                setSelectedVehicleId(null);

                                                const resolved = await fetchStopById(stop.stopId);
                                                if (resolved) {
                                                    selectedStop.setSelectedStop(resolved);
                                                } else {
                                                    selectedStop.setSelectedStop({
                                                        id: stop.stopId,
                                                        name: stop.stopName,
                                                        latitude: stop.latitude,
                                                        longitude: stop.longitude,
                                                        lines: [],
                                                        directions: [],
                                                    });
                                                }
                                                await etasHook.refreshEtasForStop(stop.stopId);
                                            }}
                                            onDeselected={() => {
                                                if (selectedStop.selectedStopIdRef.current === stop.stopId) selectedStop.closeSelectedStop();
                                            }}
                                        >
                                            <View style={{ alignItems: 'center', zIndex: 20, elevation: 20 }}>
                                                <View style={[styles.vehicleRouteStopDot, selectedStop.selectedStopAnnotationId === annId && styles.vehicleRouteStopDotSelected]}>
                                                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.vehicleRouteStopText}>{idx + 1}</Text>
                                                </View>
                                                <View style={styles.vehicleRouteStopLabel}>
                                                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.vehicleRouteStopName} numberOfLines={1}>{stop.stopName}</Text>
                                                    {stop.arrivalTimestamp ? <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.vehicleRouteStopTime}>{formatUnixTime(stop.arrivalTimestamp)}</Text> : null}
                                                </View>
                                            </View>
                                        </MapboxGL.PointAnnotation>
                                    );
                                })}
                            </>
                        );
                    })()}

                    {/* Tracked vehicle marker when vehicle route is active */}
                    {!hasTripRoute && vehicleRoute.hasVehicleRoute && (() => {
                        const trackedVehicle = animation.renderedDisplayVehicles.find((v) => v.id === vehicleRoute.vehicleRouteVehicleId);
                        if (!trackedVehicle) return null;
                        return (
                            <MapboxGL.PointAnnotation
                                key={`tracked-${trackedVehicle.renderId}`}
                                id={`tracked-${trackedVehicle.renderId}`}
                                coordinate={[trackedVehicle.longitude, trackedVehicle.latitude]}
                                onSelected={() => {
                                    selectedStop.suppressMapPressUntilRef.current = Date.now() + 400;
                                    selectedVehicleIdRef.current = trackedVehicle.id;
                                    setSelectedVehicleId(trackedVehicle.id);
                                    selectedStop.closeSelectedStop();
                                    void fetchTripDelay(trackedVehicle.tripId).then((d) => setVehicleDelays((p) => ({ ...p, [trackedVehicle.id]: d })));
                                }}
                            >
                                <View style={styles.vehicleMarkerWrap}><VehicleMarkerContent vehicle={trackedVehicle} /></View>
                            </MapboxGL.PointAnnotation>
                        );
                    })()}

                    {/* Vehicles */}
                    {!hasTripRoute && !vehicleRoute.hasVehicleRoute && animation.renderedDisplayVehicles.map((vehicle) => (
                        <MapboxGL.PointAnnotation
                            key={vehicle.renderId} id={vehicle.renderId}
                            coordinate={[vehicle.longitude, vehicle.latitude]}
                            onSelected={() => {
                                selectedStop.suppressMapPressUntilRef.current = Date.now() + 400;
                                selectedVehicleIdRef.current = vehicle.id;
                                setSelectedVehicleId(vehicle.id);
                                void fetchTripDelay(vehicle.tripId).then((d) => setVehicleDelays((p) => ({ ...p, [vehicle.id]: d })));
                            }}
                            onDeselected={() => { if (selectedVehicleIdRef.current === vehicle.id) { selectedVehicleIdRef.current = null; setSelectedVehicleId(null); } }}
                        >
                            <View style={styles.vehicleMarkerWrap}><VehicleMarkerContent vehicle={vehicle} /></View>
                        </MapboxGL.PointAnnotation>
                    ))}

                    {/* Dropped pin */}
                    {!hasTripRoute && droppedPin && (
                        <MapboxGL.PointAnnotation key="dropped-pin" id="dropped-pin" coordinate={[droppedPin.longitude, droppedPin.latitude]}>
                            <Text style={styles.droppedPinIcon}>{'\uD83D\uDCCD'}</Text>
                        </MapboxGL.PointAnnotation>
                    )}

                    {/* Trip planner route overlay */}
                    {tripPlannerRoute && tripPlannerRoute.features.map((feature, idx) => (
                        <MapboxGL.ShapeSource key={`trip-leg-${idx}`} id={`trip-leg-${idx}`} shape={{ type: 'Feature', properties: {}, geometry: feature.geometry }}>
                            <MapboxGL.LineLayer id={`trip-leg-layer-${idx}`} style={{
                                lineColor: feature.properties.color,
                                lineWidth: feature.properties.mode === 'WALK' ? 3 : 5,
                                lineOpacity: 0.9,
                                lineDasharray: feature.properties.mode === 'WALK' ? [2, 3] : [],
                            }} />
                        </MapboxGL.ShapeSource>
                    ))}

                    {/* Trip planner stops */}
                    {tripPlannerRoute && tripPlannerRoute.transitStops.map((stop, idx) => (
                        <MapboxGL.PointAnnotation
                            key={`trip-stop-${idx}-${stop.stopCode ?? stop.lat}-${selectedStop.selectedStopAnnotationId === `trip-stop-${idx}` ? 'selected' : 'idle'}`} id={`trip-stop-${idx}`}
                            ref={(ref) => { stopAnnotationRefs.current[`trip-stop-${idx}`] = ref; }}
                            coordinate={[stop.lon, stop.lat]}
                            selected={selectedStop.selectedStopAnnotationId === `trip-stop-${idx}`}
                            onSelected={async () => {
                                selectedStop.suppressMapPressUntilRef.current = Date.now() + 400;
                                const resolved = resolveTripPlannerStopToKnownStop(stop, stopsHook.searchableStops);
                                if (resolved) {
                                    selectedStop.selectedStopIdRef.current = resolved.id;
                                    selectedStop.setSelectedStopAnnotationId(`trip-stop-${idx}`);
                                    selectedStop.setSelectedStop(resolved);
                                    await etasHook.refreshEtasForStop(resolved.id);
                                } else {
                                    selectedStop.selectedStopIdRef.current = stop.stopCode ?? `trip-${idx}`;
                                    selectedStop.setSelectedStopAnnotationId(`trip-stop-${idx}`);
                                    selectedStop.setSelectedStop({ id: stop.stopCode ?? `trip-${idx}`, name: stop.name, latitude: stop.lat, longitude: stop.lon, lines: [], directions: [] });
                                }
                            }}
                            onDeselected={() => { if (selectedStop.selectedStopIdRef.current === (stop.stopCode ?? `trip-${idx}`)) selectedStop.closeSelectedStop(); }}
                        >
                            <View style={[styles.tripStopDot, selectedStop.selectedStopAnnotationId === `trip-stop-${idx}` && styles.tripStopDotSelected]} />
                        </MapboxGL.PointAnnotation>
                    ))}

                    {/* Trip planner endpoints */}
                    {tripPlannerRoute && (
                        <>
                            <MapboxGL.PointAnnotation key="trip-start" id="trip-start" coordinate={[tripPlannerRoute.endpoints.from.lon, tripPlannerRoute.endpoints.from.lat]}>
                                <View style={styles.tripEndpointMarker}><Text style={styles.tripEndpointText}>А</Text></View>
                            </MapboxGL.PointAnnotation>
                            <MapboxGL.PointAnnotation key="trip-end" id="trip-end" coordinate={[tripPlannerRoute.endpoints.to.lon, tripPlannerRoute.endpoints.to.lat]}>
                                <View style={[styles.tripEndpointMarker, styles.tripEndpointMarkerEnd]}><Text style={styles.tripEndpointText}>Б</Text></View>
                            </MapboxGL.PointAnnotation>
                        </>
                    )}
                </MapboxGL.MapView>

                <View style={styles.floatingRowWrap}>
                    <ReminderCenterButton inline opaque={!!selectedStop.selectedStop || search.searchModalVisible || favorites.favoritesVisible || !!filterPanelVisible} />
                    {isActive && location && !userLocationVisible && (
                        <TouchableOpacity style={styles.recenterFloatingButton} onPress={() => void recenterToUserLocation()}>
                            <View style={styles.recenterFloatingIconWrap}>
                                <Ionicons name="locate" size={18} color="#0F172A" />
                            </View>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Clear route buttons */}
                {vehicleRoute.hasVehicleRoute && (
                    <TouchableOpacity style={styles.clearRouteButton} onPress={vehicleRoute.clearVehicleRoute}>
                        <Text style={styles.clearRouteButtonText}>{'\u2715'}</Text>
                    </TouchableOpacity>
                )}
                {tripPlannerRoute && onClearTripRoute && (
                    <TouchableOpacity style={[styles.clearRouteButton, { top: vehicleRoute.hasVehicleRoute ? 100 : 50 }]} onPress={onClearTripRoute}>
                        <Text style={styles.clearRouteButtonText}>{'\u2715'}</Text>
                    </TouchableOpacity>
                )}
                {!!highlightedRoute && !!onClearHighlightedRoute && !tripPlannerRoute && (
                    <TouchableOpacity style={[styles.clearRouteButton, { top: vehicleRoute.hasVehicleRoute ? 100 : 50 }]} onPress={onClearHighlightedRoute}>
                        <Text style={styles.clearRouteButtonText}>{'\u2715'}</Text>
                    </TouchableOpacity>
                )}

                {/* Feature panels */}
                <SearchModal
                    visible={search.searchModalVisible}
                    query={search.locationSearchQuery}
                    loading={search.locationSearchLoading}
                    results={search.centralSearchResults}
                    onChangeQuery={search.setLocationSearchQuery}
                    onClose={() => search.setSearchModalVisible(false)}
                    onSelectPlace={onSelectSearchResult}
                    onSelectLine={onSelectLineResult}
                    onSelectStop={onSelectStopResult}
                    onSaveFavorite={favorites.saveFavorite}
                />

                <FavoritesPanel
                    visible={favorites.favoritesVisible}
                    places={favorites.favoritePlaces}
                    searchableStops={stopsHook.searchableStops}
                    currentPin={droppedPin}
                    currentLocation={location ? { latitude: location.coords.latitude, longitude: location.coords.longitude } : null}
                    onOpenCentralPlanner={(fav) => {
                        if (!Number.isFinite(fav.latitude) || !Number.isFinite(fav.longitude)) {
                            return;
                        }
                        onBuildRouteFromCoordinate?.(
                            fav.latitude,
                            fav.longitude,
                            location?.coords.latitude,
                            location?.coords.longitude,
                        );
                        favorites.setFavoritesVisible(false);
                    }}
                    onShowRouteOnMap={(route) => {
                        onShowTripRoute?.(route);
                        favorites.setFavoritesVisible(false);
                    }}
                    onReorder={favorites.reorderFavorites}
                    onSelect={(fav) => {
                        if (!Number.isFinite(fav.latitude) || !Number.isFinite(fav.longitude)) {
                            return;
                        }
                        camera.focusOnCoordinate(fav.latitude, fav.longitude);
                        setDroppedPin({ latitude: fav.latitude, longitude: fav.longitude });
                        selectedVehicleIdRef.current = null;
                        setSelectedVehicleId(null);
                        selectedStop.closeSelectedStop();
                        favorites.setFavoritesVisible(false);
                    }}
                    onUpdate={favorites.updateFavorite}
                    onCreate={favorites.createFavorite}
                    onRemove={favorites.removeFavorite}
                    onClose={() => favorites.setFavoritesVisible(false)}
                />

                {filterPanelVisible && !filters.isRouteMode && (
                    <FilterPanel
                        visible={true}
                        selectedVehicleTypes={filters.selectedVehicleTypes}
                        selectedLines={filters.selectedLines}
                        availableLines={filters.availableLines}
                        liveLineSet={liveLines}
                        filteredVehiclesCount={animation.filteredVehicles.length}
                        totalVehiclesCount={vehicles.length}
                        filteredStops={stopsHook.filteredStops}
                        totalStopsCount={stopsHook.stops.length}
                        onToggleVehicleType={filters.toggleVehicleTypeFilter}
                        onToggleLine={filters.toggleLineFilter}
                        onClearVehicleTypes={() => filters.setSelectedVehicleTypes([])}
                        onClearLines={() => filters.setSelectedLines([])}
                        onClose={onCloseFilterPanel}
                        onOpenStopDetails={async (stop) => {
                            await selectedStop.openStopDetails(stop);
                            await etasHook.refreshEtasForStop(stop.id);
                        }}
                    />
                )}

                {filters.isRouteMode && routing.routeGeometry && (
                    <RouteStopsPanel
                        visible={routing.routeStopsPanelVisible}
                        lineName={routing.routeGeometry.line}
                        searchQuery={routing.routeStopSearch}
                        onSearchChange={routing.setRouteStopSearch}
                        stops={routing.routeStopsFiltered}
                        selectedStopId={selectedStop.selectedStop?.id ?? null}
                        onSelectStop={(stop) => {
                            const annId = `route-stop-${stop.dirIndex}-${stop.id}-${stop.stopIndex}`;
                            void (async () => {
                                await selectedStop.openRouteStopDetails(stop, stop.directionName, annId, stopsHook.stopById, routing.routeGeometry?.line, highlightedRoute?.line);
                                await etasHook.refreshEtasForStop(stop.id);
                            })();
                        }}
                        onClose={() => routing.setRouteStopsPanelVisible(false)}
                        onToggleOpen={() => routing.setRouteStopsPanelVisible(true)}
                    />
                )}

                {/* Bottom floating panels */}
                {droppedPin && !selectedStop.selectedStop && !selectedVehicle && (
                    <DroppedPinPanel
                        pin={droppedPin}
                        onClose={() => setDroppedPin(null)}
                        onSaveFavorite={droppedPinAlreadySaved ? undefined : () => {
                            void favorites.saveFavorite(
                                `Запазена точка ${droppedPin.latitude.toFixed(4)}, ${droppedPin.longitude.toFixed(4)}`,
                                droppedPin.latitude, droppedPin.longitude,
                            );
                            setDroppedPin(null);
                        }}
                        onBuildRoute={onBuildRouteFromCoordinate ? () => {
                            onBuildRouteFromCoordinate(droppedPin.latitude, droppedPin.longitude, location?.coords.latitude, location?.coords.longitude);
                            setDroppedPin(null);
                        } : undefined}
                    />
                )}

                {selectedStop.selectedStop && !selectedVehicle && (
                    <StopInfoPanel
                        stop={selectedStop.selectedStop}
                        etas={etasHook.etasByStopId[selectedStop.selectedStop.id] || []}
                        onClose={selectedStop.closeSelectedStop}
                        onOpenSchedule={schedule.openStopSchedule}
                    />
                )}

                {selectedVehicle && (
                    <VehicleInfoPanel
                        vehicle={selectedVehicle}
                        delay={vehicleDelays[selectedVehicle.id]}
                        stopName={selectedVehicle.stopId ? (stopsHook.stopNameByIdMap[selectedVehicle.stopId] || stopsHook.searchableStopNameByIdMap[selectedVehicle.stopId] || selectedVehicle.stopId) : 'н/д'}
                        onClose={() => { selectedVehicleIdRef.current = null; setSelectedVehicleId(null); }}
                        onLoadRoute={() => void vehicleRoute.loadVehicleRoute(selectedVehicle.id, selectedVehicle.tripId, selectedVehicle.latitude, selectedVehicle.longitude)}
                        routeLoading={vehicleRoute.vehicleRouteLoading}
                        isRouteActive={vehicleRoute.vehicleRouteVehicleId === selectedVehicle.id}
                    />
                )}

                {showReportButton && (
                    <View style={styles.bottomOverlay}>
                        <TouchableOpacity style={styles.reportButton} onPress={reporting.openReportModal}>
                            <Text style={styles.reportText}>{'\uD83D\uDEA8'} Сигнализирай</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <StopScheduleModal
                    stopId={schedule.scheduleStopId}
                    stopName={schedule.scheduleStopName}
                    realtime={schedule.scheduleRealtime}
                    staticSchedule={schedule.scheduleStatic}
                    dayType={schedule.scheduleDayType}
                    loading={schedule.scheduleLoading}
                    onClose={schedule.closeSchedule}
                    onChangeDayType={schedule.changeDayType}
                />

                <ReportModal visible={reporting.reportModalVisible} onClose={reporting.closeReportModal} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    page: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    container: { height: '100%', width: '100%', backgroundColor: '#F8FAFC' },
    map: { flex: 1 },
    userDot: { width: 20, height: 20, backgroundColor: '#007AFF', borderRadius: 10, borderWidth: 3, borderColor: 'white' },
    vehicleMarkerWrap: { alignItems: 'center', justifyContent: 'center', zIndex: 10, elevation: 10 },
    stopDotBase: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.9)', elevation: 2, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 },
    stopDotBaseSelected: { backgroundColor: '#FFFFFF', transform: [{ scale: 1.35 }], shadowOpacity: 0.18, shadowRadius: 4, zIndex: 10 },
    stopDotText: { color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' },
    stopDot: { backgroundColor: 'rgba(148,163,184,0.35)', borderRadius: 7, width: 14, height: 14 },
    stopDotSelected: { backgroundColor: '#1D4ED8', transform: [{ scale: 1.3 }] },
    stopLabelContainer: { position: 'absolute', bottom: 28, left: -60, width: 140, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center', elevation: 5, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    stopLabelText: { color: '#0F172A', fontSize: 10, fontWeight: '700', textAlign: 'center' },
    routeStopDot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.9)' },
    routeStopDotSelected: { backgroundColor: '#FFFFFF', transform: [{ scale: 1.3 }] },
    routeStopText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
    routeStopLabel: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2, maxWidth: 120, elevation: 3, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    routeStopLabelSelected: { borderWidth: 1.5, borderColor: '#1D4ED8' },
    routeStopName: { fontSize: 9, fontWeight: '600', color: '#0F172A', textAlign: 'center' },
    vehicleRouteStopDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
    vehicleRouteStopDotSelected: { backgroundColor: '#FFFFFF', transform: [{ scale: 1.3 }] },
    vehicleRouteStopText: { color: '#059669', fontSize: 8, fontWeight: '700' },
    vehicleRouteStopLabel: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2, maxWidth: 120, elevation: 3, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    vehicleRouteStopName: { fontSize: 9, fontWeight: '600', color: '#0F172A', textAlign: 'center' },
    vehicleRouteStopTime: { fontSize: 9, fontWeight: '700', color: '#059669', textAlign: 'center' },
    routeDirectionArrow: { fontSize: 22, fontWeight: '900', textShadowColor: 'rgba(255,255,255,0.95)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
    droppedPinIcon: { fontSize: 28, lineHeight: 28, textShadowColor: 'rgba(220,38,38,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
    tripStopDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.9)' },
    tripStopDotSelected: { backgroundColor: '#FFFFFF', transform: [{ scale: 1.3 }] },
    tripEndpointMarker: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5 },
    tripEndpointMarkerEnd: { backgroundColor: '#DC2626' },
    tripEndpointText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
    clearRouteButton: { position: 'absolute', top: 50, left: 16, backgroundColor: 'white', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 10, zIndex: 30 },
    clearRouteButtonText: { fontSize: 20, color: '#E63946', fontWeight: '700' },
    floatingRowWrap: {
        position: 'absolute',
        right: 16,
        bottom: 110,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        zIndex: 0,
        elevation: 0,
    },
    recenterFloatingButton: {
        height: 48,
        borderRadius: 24,
        paddingHorizontal: 8,
        backgroundColor: 'rgba(255,255,255,0.78)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
        elevation: 1,
        zIndex: 1,
    },
    recenterFloatingIconWrap: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(248,250,252,0.42)',
    },
    recenterFloatingLabel: {
        marginLeft: 8,
        marginRight: 4,
        color: '#475569',
        fontSize: 12,
        fontWeight: '600',
    },
    bottomOverlay: { position: 'absolute', bottom: 40, width: '100%', alignItems: 'center', zIndex: 5, elevation: 5 },
    reportButton: { backgroundColor: '#E63946', paddingHorizontal: 25, paddingVertical: 15, borderRadius: 30, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 6 },
    reportText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});
