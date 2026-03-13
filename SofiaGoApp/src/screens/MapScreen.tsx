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
import { VehicleType, getVehicleAccentColor, getVehicleIcon, formatUnixTime, inferLineTypeFromToken } from '../services/transitUtils';
import { TripLocation } from '../services/tripPlanner';
import { TripRouteGeoJSON } from './TripPlannerScreen';

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

import {
    MAP_STYLE, INITIAL_ZOOM_LEVEL, MAX_RENDERED_STOPS,
    createFallbackBounds, getDirectionAccentColor, getDirectionArrowSamples,
} from '../features/map/constants';

LogBox.ignoreLogs(["Can't update annotation"]);

interface MapScreenProps {
    highlightedRoute?: RouteSelection | null;
    onClearHighlightedRoute?: () => void;
    showReportButton?: boolean;
    filterPanelVisible?: boolean;
    onCloseFilterPanel?: () => void;
    onBuildRouteFromCoordinate?: (dstLat: number, dstLon: number, curLat?: number, curLon?: number) => void;
    searchRequestToken?: number;
    favoritesRequestToken?: number;
    recenterRequestToken?: number;
    dismissTransientPanelsToken?: number;
    onFilterCountChange?: (count: number) => void;
    focusStopCoordinate?: { latitude: number; longitude: number } | null;
    focusStopId?: string | null;
    tripPlannerRoute?: TripRouteGeoJSON | null;
    onClearTripRoute?: () => void;
}

export default function MapScreen({
    highlightedRoute,
    onClearHighlightedRoute,
    showReportButton = true,
    filterPanelVisible = true,
    onCloseFilterPanel,
    onBuildRouteFromCoordinate,
    searchRequestToken,
    favoritesRequestToken,
    recenterRequestToken,
    dismissTransientPanelsToken,
    onFilterCountChange,
    focusStopCoordinate,
    focusStopId,
    tripPlannerRoute,
    onClearTripRoute,
}: MapScreenProps) {
    // ── Core map hooks ──
    const { location, refresh: refreshLocation } = useUserLocation();
    const camera = useMapCamera();
    const bounds = useMapBounds();

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

    const selectedVehicle = useMemo(() => {
        if (!selectedVehicleId) return null;
        return animation.renderedDisplayVehicles.find((v) => v.id === selectedVehicleId) ?? null;
    }, [selectedVehicleId, animation.renderedDisplayVehicles]);

    // ── Search, Favorites, Routing, Reporting ──
    const search = useSearch(stopsHook.searchableStops, filters.staticLines);
    const favorites = useFavorites();
    const routing = useRouteGeometry(highlightedRoute, (lon, lat) => camera.lockCamera(lat, lon));
    const reporting = useReporting();

    // ── Initialize camera from location ──
    useEffect(() => {
        if (location && !highlightedRoute) {
            camera.lockCamera(location.coords.latitude, location.coords.longitude);
            bounds.setMapBounds(createFallbackBounds(location.coords.latitude, location.coords.longitude));
        }
    }, [location]);

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
        if (typeof recenterRequestToken === 'number' && recenterRequestToken > 0) {
            if (location) camera.focusOnCoordinate(location.coords.latitude, location.coords.longitude);
            else void refreshLocation();
        }
    }, [recenterRequestToken]);

    useEffect(() => {
        if (typeof dismissTransientPanelsToken === 'number' && dismissTransientPanelsToken > 0) {
            search.setSearchModalVisible(false);
            favorites.setFavoritesVisible(false);
        }
    }, [dismissTransientPanelsToken]);

    useEffect(() => {
        if (filterPanelVisible) {
            search.setSearchModalVisible(false);
            favorites.setFavoritesVisible(false);
        }
    }, [filterPanelVisible]);

    // ── Focus stop from outside ──
    useEffect(() => {
        if (focusStopCoordinate) camera.focusOnCoordinate(focusStopCoordinate.latitude, focusStopCoordinate.longitude);
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

    const handleRegionDidChange = useCallback((event: any) => {
        if (camera.cameraLockedToInitialView && camera.hasInitialCameraTarget) camera.unlockCamera();

        const visibleBounds = event?.properties?.visibleBounds;
        if (Array.isArray(visibleBounds) && visibleBounds.length === 2 && Array.isArray(visibleBounds[0]) && Array.isArray(visibleBounds[1]) && visibleBounds[0].length >= 2 && visibleBounds[1].length >= 2) {
            const east = Math.max(Number(visibleBounds[0][0]), Number(visibleBounds[1][0]));
            const west = Math.min(Number(visibleBounds[0][0]), Number(visibleBounds[1][0]));
            const north = Math.max(Number(visibleBounds[0][1]), Number(visibleBounds[1][1]));
            const south = Math.min(Number(visibleBounds[0][1]), Number(visibleBounds[1][1]));
            if ([north, south, east, west].every(Number.isFinite)) {
                camera.setMapCenterCoordinate([(east + west) / 2, (north + south) / 2]);
                bounds.scheduleBoundsUpdate({ north, south, east, west });
                return;
            }
        }
        const center = event?.geometry?.coordinates;
        if (Array.isArray(center) && center.length >= 2) {
            const [lon, lat] = [Number(center[0]), Number(center[1])];
            if (Number.isFinite(lon) && Number.isFinite(lat)) bounds.scheduleBoundsUpdate(createFallbackBounds(lat, lon));
        }
    }, [camera.cameraLockedToInitialView, camera.hasInitialCameraTarget]);

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
                        zoomLevel={!camera.tripCameraBounds && camera.cameraLockedToInitialView && camera.hasInitialCameraTarget ? INITIAL_ZOOM_LEVEL : undefined}
                        centerCoordinate={!camera.tripCameraBounds && camera.cameraLockedToInitialView && camera.hasInitialCameraTarget ? camera.mapCenterCoordinate : undefined}
                        bounds={camera.tripCameraBounds ? { ne: camera.tripCameraBounds.ne, sw: camera.tripCameraBounds.sw, paddingTop: 60, paddingBottom: 80, paddingLeft: 60, paddingRight: 60 } : undefined}
                        animationDuration={camera.tripCameraBounds ? 800 : 0}
                    />

                    {location && (
                        <MapboxGL.PointAnnotation id="user-location" coordinate={[location.coords.longitude, location.coords.latitude]}>
                            <View style={styles.userDot} />
                        </MapboxGL.PointAnnotation>
                    )}

                    {/* Stops */}
                    {!routing.routeGeometry && !vehicleRoute.hasVehicleRoute && !hasTripRoute && stopsHook.renderedStops.map((stop) => (
                        <MapboxGL.PointAnnotation
                            key={`stop-${stop.id}`}
                            id={`stop-${stop.id}`}
                            coordinate={[stop.longitude, stop.latitude]}
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
                            <View style={[styles.stopDot, selectedStop.selectedStopAnnotationId === `stop-${stop.id}` && styles.stopDotSelected]} />
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
                                    key={annId} id={annId} coordinate={[stop.longitude, stop.latitude]}
                                    onSelected={() => {
                                        void (async () => {
                                            await selectedStop.openRouteStopDetails(stop, direction.name || `Посока ${dirIdx + 1}`, annId, stopsHook.stopById, routing.routeGeometry?.line, highlightedRoute?.line);
                                            await etasHook.refreshEtasForStop(stop.id);
                                        })();
                                    }}
                                    onDeselected={() => { if (selectedStop.selectedStopIdRef.current === stop.id) selectedStop.closeSelectedStop(); }}
                                >
                                    <View style={[styles.routeStopDot, { backgroundColor: getDirectionAccentColor(dirIdx), borderColor: getDirectionAccentColor(dirIdx) }, selectedStop.selectedStopAnnotationId === annId && styles.routeStopDotSelected]}>
                                        <Text style={styles.routeStopText}>{stopIdx + 1}</Text>
                                    </View>
                                </MapboxGL.PointAnnotation>
                            );
                        })
                    )}

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
                            key={`trip-stop-${idx}-${stop.stopCode ?? stop.lat}`} id={`trip-stop-${idx}`}
                            coordinate={[stop.lon, stop.lat]}
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
                    onSelect={(fav) => {
                        camera.focusOnCoordinate(fav.latitude, fav.longitude);
                        setDroppedPin({ latitude: fav.latitude, longitude: fav.longitude });
                        selectedVehicleIdRef.current = null;
                        setSelectedVehicleId(null);
                        selectedStop.closeSelectedStop();
                        favorites.setFavoritesVisible(false);
                    }}
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
                        onSaveFavorite={() => {
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
                        stopName={selectedVehicle.stopId ? (stopsHook.stopNameByIdMap[selectedVehicle.stopId] || selectedVehicle.stopId) : 'н/д'}
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
    container: { height: '100%', width: '100%', backgroundColor: 'tomato' },
    map: { flex: 1 },
    userDot: { width: 20, height: 20, backgroundColor: '#007AFF', borderRadius: 10, borderWidth: 3, borderColor: 'white' },
    vehicleMarkerWrap: { alignItems: 'center', justifyContent: 'center', zIndex: 10, elevation: 10 },
    stopDot: { backgroundColor: 'rgba(0, 122, 255, 0.35)', borderWidth: 2, borderColor: 'rgba(0, 122, 255, 0.6)', borderRadius: 12, width: 24, height: 24 },
    stopDotSelected: { backgroundColor: '#F59E0B', borderColor: '#D97706', borderWidth: 3, transform: [{ scale: 1.2 }] },
    routeStopDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
    routeStopDotSelected: { borderColor: '#F59E0B', borderWidth: 4, transform: [{ scale: 1.18 }] },
    routeStopText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
    routeDirectionArrow: { fontSize: 22, fontWeight: '900', textShadowColor: 'rgba(255,255,255,0.95)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
    droppedPinIcon: { fontSize: 28, lineHeight: 28, textShadowColor: 'rgba(220,38,38,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
    tripStopDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: '#1E3A8A' },
    tripStopDotSelected: { borderColor: '#F59E0B', borderWidth: 3.5, transform: [{ scale: 1.2 }] },
    tripEndpointMarker: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5 },
    tripEndpointMarkerEnd: { backgroundColor: '#DC2626' },
    tripEndpointText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
    clearRouteButton: { position: 'absolute', top: 50, left: 16, backgroundColor: 'white', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 10, zIndex: 30 },
    clearRouteButtonText: { fontSize: 20, color: '#E63946', fontWeight: '700' },
    bottomOverlay: { position: 'absolute', bottom: 40, width: '100%', alignItems: 'center', zIndex: 5, elevation: 5 },
    reportButton: { backgroundColor: '#E63946', paddingHorizontal: 25, paddingVertical: 15, borderRadius: 30, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 6 },
    reportText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});
