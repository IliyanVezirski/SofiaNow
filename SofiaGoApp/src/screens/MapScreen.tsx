import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, StatusBar, StyleSheet, View, TouchableOpacity, LogBox, useWindowDimensions } from 'react-native';
import GoogleMapView, { Region } from 'react-native-maps';

import { RouteSelection } from '../types/routes';
import { type Stop, fetchStopById, getVehicleAccentColor, getVehicleIcon, type TripLocation } from '../services/transit';
import { fetchVehiclesInBounds } from '../services/cgmApi/vehiclePositions';
import { fetchStopEtas } from '../services/cgmApi/stopEtas';
import { getEtaScheduleInfo } from '../services/cgmApi/schedules';
import { TripRouteGeoJSON, TripRouteStop } from '../features/tripPlanner/utils/routeGeoJson';

import { useUserLocation } from '../features/map/hooks/useUserLocation';
import { useMapCamera } from '../features/map/hooks/useMapCamera';
import { useMapBounds } from '../features/map/hooks/useMapBounds';
import { useMapFloatingControls } from '../features/map/hooks/useMapFloatingControls';
import { useMapOverlayActions } from '../features/map/hooks/useMapOverlayActions';
import { useMapFocusSync } from '../features/map/hooks/useMapFocusSync';
import { useMapPinParkingActions } from '../features/map/hooks/useMapPinParkingActions';
import { useMapPanelOrchestration } from '../features/map/hooks/useMapPanelOrchestration';
import { useMapSelectionActions } from '../features/map/hooks/useMapSelectionActions';
import { useMapStopVehicleActions } from '../features/map/hooks/useMapStopVehicleActions';
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

import { useParkingZones } from '../features/parkingZones/hooks/useParkingZones';
import { useParkingCars } from '../features/parkingZones/hooks/useParkingCars';
import { useLiveParkingAvailability } from '../features/parkingZones/hooks/useLiveParkingAvailability';
import { ParkingZoneInfoPanel } from '../features/parkingZones/components/ParkingZoneInfoPanel';
import type { ParkingLot } from '../features/parkingZones/types/parkingLots';
import type { ParkingZoneId } from '../features/parkingZones/types';
import { MapClearActions } from '../features/map/components/MapClearActions';
import { GoogleParkingLayers } from '../features/map/components/GoogleParkingLayers';
import { GoogleMapCanvas } from '../features/map/components/GoogleMapCanvas';
import { GoogleTransitLayers } from '../features/map/components/GoogleTransitLayers';
import type { MapExperienceMode } from '../features/map/components/MapModeSwitcher';
import { MapFeaturePanels } from '../features/map/components/MapFeaturePanels';
import { MapFloatingControls } from '../features/map/components/MapFloatingControls';
import { MapboxMapCanvas } from '../features/map/components/MapboxMapCanvas';
import { MapboxParkingLayers } from '../features/map/components/MapboxParkingLayers';
import { MapboxTransitLayers } from '../features/map/components/MapboxTransitLayers';
import {
    createFocusedBounds,
    getBoundsFromRegion,
    getRegionFromCoordinate,
    getRegionFromBounds,
} from '../features/map/utils/mapScreen';
import {
    getGoogleInitialRegion,
    createParkingLotsGeoJSON,
    createUserLocationGeoJSON,
    createWalkingRadiiGeoJSON,
    createGoogleWalkingRadiusLabels,
    getCurrentLocation,
    getDroppedPinFavoriteState,
    getHasActiveRouteOverlay,
    getHasReliableInitialLocation,
    getLiveLines,
    getPreferredInitialCenterCoordinate,
    getSelectedLotLiveData,
    getSelectedParkingLot,
    getSelectedStopLines,
    getSelectedVehicle,
    getSelectedVehicleStopName,
    getVisibleSearchResults,
} from '../features/map/utils/derived';
import {
    buildStableMarkerPool,
    getTransitViewportRenderState,
} from '../features/map/utils/internal';

import { INITIAL_ZOOM_LEVEL, MAP_STYLE, MAX_RENDERED_STOPS, MAX_RENDERED_VEHICLES, DEFAULT_BOUNDS_DELTA, DEFAULT_CENTER_COORDINATE, createFallbackBounds } from '../features/map/constants';

const SUPPORT_REVOLUT_URL = 'https://revolut.me/iliyantyb2';
const GOOGLE_FIT_EDGE_PADDING = { top: 60, right: 60, bottom: 80, left: 60 };
const USER_LOCATION_REGION_DELTA = DEFAULT_BOUNDS_DELTA / 5;

interface MapScreenProps {
    parkingLots?: ParkingLot[];
    preferredMapExperienceMode?: MapExperienceMode;
    highlightedRoute?: RouteSelection | null;
    onClearHighlightedRoute?: () => void;
    isActive?: boolean;
    showReportButton?: boolean;
    filterPanelVisible?: boolean;
    onCloseFilterPanel?: () => void;
    onBuildRouteFromCoordinate?: (dstLat: number, dstLon: number, curLat?: number, curLon?: number) => void;
    onShowTripRoute?: (route: TripRouteGeoJSON, source?: 'planner' | 'favorites') => void;
    searchRequestToken?: number;
    favoritesRequestToken?: number;
    dismissTransientPanelsToken?: number;
    onFilterCountChange?: (count: number) => void;
    focusStopCoordinate?: { latitude: number; longitude: number } | null;
    focusStopId?: string | null;
    focusedParkingZoneFeatureId?: string | null;
    focusParkingZoneBounds?: { ne: [number, number]; sw: [number, number] } | null;
    focusParkingZoneToken?: number;
    onClearFocusedParkingZone?: () => void;
    tripPlannerRoute?: TripRouteGeoJSON | null;
    onClearTripRoute?: () => void;
    onSearchVisibilityChange?: (visible: boolean) => void;
    onFavoritesVisibilityChange?: (visible: boolean) => void;
    onMapExperienceModeChange?: (mode: MapExperienceMode) => void;
    onParkingZoneChange?: (zoneId: ParkingZoneId | null) => void;
    onShowParkingZoneOnMap?: (zoneFeatureId: string) => void;
    onOpenSavedTripRoute?: (routeId: string) => void | Promise<void>;
}

export default function MapScreen({
    parkingLots = [],
    preferredMapExperienceMode,
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
    focusedParkingZoneFeatureId,
    focusParkingZoneBounds,
    focusParkingZoneToken,
    onClearFocusedParkingZone,
    tripPlannerRoute,
    onClearTripRoute,
    onSearchVisibilityChange,
    onFavoritesVisibilityChange,
    onMapExperienceModeChange,
    onParkingZoneChange,
    onShowParkingZoneOnMap,
    onOpenSavedTripRoute,
}: MapScreenProps) {
    const { height } = useWindowDimensions();
    const googleMapRef = useRef<GoogleMapView | null>(null);
    const stopAnnotationRefs = useRef<Record<string, { refresh: () => void } | null>>({});
    const previousSelectedStopAnnotationIdRef = useRef<string | null>(null);
    const hasAppliedInitialLocationCameraRef = useRef(false);
    const handledParkingZoneFocusTokenRef = useRef(0);
    const suppressUserRecenterRegionSyncUntilRef = useRef(0);
    const tripRouteViewportSnapshotRef = useRef<{
        bounds: { north: number; south: number; east: number; west: number } | null;
        center: [number, number];
        cameraLockedToInitialView: boolean;
        hasInitialCameraTarget: boolean;
        userLocationVisible: boolean;
        isUserFollowLocked: boolean;
    } | null>(null);
    const previousHasTripRouteRef = useRef(false);
    const restoreRouteBoundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Core map hooks ──
    const { location, refresh: refreshLocation } = useUserLocation();
    const camera = useMapCamera();
    const bounds = useMapBounds();

    // ── Smooth user location animation ──
    const animatedLat = useRef(new Animated.Value(0)).current;
    const animatedLon = useRef(new Animated.Value(0)).current;
    const smoothCoord = useRef<[number, number] | null>(null);
    const isFirstLocation = useRef(true);

    useEffect(() => {
        if (!location) return;
        const lat = location.coords.latitude;
        const lon = location.coords.longitude;

        if (isFirstLocation.current) {
            isFirstLocation.current = false;
            animatedLat.setValue(lat);
            animatedLon.setValue(lon);
            smoothCoord.current = [lon, lat];
            return;
        }

        const latListener = animatedLat.addListener(({ value }) => {
            if (smoothCoord.current) smoothCoord.current[1] = value;
        });
        const lonListener = animatedLon.addListener(({ value }) => {
            if (smoothCoord.current) smoothCoord.current[0] = value;
        });

        Animated.parallel([
            Animated.timing(animatedLat, { toValue: lat, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
            Animated.timing(animatedLon, { toValue: lon, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        ]).start(() => {
            animatedLat.removeListener(latListener);
            animatedLon.removeListener(lonListener);
            smoothCoord.current = [lon, lat];
        });

        return () => {
            animatedLat.removeListener(latListener);
            animatedLon.removeListener(lonListener);
        };
    }, [location?.coords.latitude, location?.coords.longitude]);

    const userLocationGeoJSON = useMemo(
        () => createUserLocationGeoJSON(location),
        [location?.coords.latitude, location?.coords.longitude],
    );

    const walkingRadiiGeoJSON = useMemo(
        () => createWalkingRadiiGeoJSON(location),
        [location?.coords.latitude, location?.coords.longitude],
    );

    const googleWalkingRadiusLabels = useMemo(
        () => createGoogleWalkingRadiusLabels(location),
        [location?.coords.latitude, location?.coords.longitude],
    );

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

    const selectedStopLines = useMemo(
        () => getSelectedStopLines(selectedStop.selectedStop?.lines),
        [selectedStop.selectedStop?.lines],
    );

    const animation = useVehicleAnimation(
        vehicles, filters.selectedVehicleTypes, filters.selectedLines,
        filters.isRouteMode, highlightedRoute, selectedStopLines,
    );

    const vehicleRoute = useVehicleRoute();
    const [vehicleDelays, setVehicleDelays] = useState<Record<string, number | null>>({});
    const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
    const selectedVehicleIdRef = useRef<string | null>(null);
    const [droppedPin, setDroppedPin] = useState<{ latitude: number; longitude: number } | null>(null);
    const [editRequestFavoriteId, setEditRequestFavoriteId] = useState<string | null>(null);
    const [userLocationVisible, setUserLocationVisible] = useState(true);
    const [isUserFollowLocked, setIsUserFollowLocked] = useState(false);
    const [activeParkingOverlay, setActiveParkingOverlay] = useState<'payment' | 'cars' | null>(null);
    const [mapExperienceMode, setMapExperienceMode] = useState<MapExperienceMode>(preferredMapExperienceMode ?? 'transit');
    const parkingZones = useParkingZones(
        location ? { latitude: location.coords.latitude, longitude: location.coords.longitude } : null,
        droppedPin,
    );
    const detectedParkingZoneId = parkingZones.userZone?.id ?? null;
    const isTransitMode = mapExperienceMode === 'transit';
    const isParkingMode = mapExperienceMode === 'parking';
    const floatingControls = useMapFloatingControls({
        mapExperienceMode,
        supportUrl: SUPPORT_REVOLUT_URL.trim(),
    });
    const overlayActions = useMapOverlayActions({
        bounds,
        camera,
        onClearFocusedParkingZone,
        onClearTripRoute,
        restoreRouteBoundsTimerRef,
        setIsUserFollowLocked,
        setUserLocationVisible,
        suppressUserRecenterRegionSyncUntilRef,
        tripRouteViewportSnapshotRef,
    });
    const [selectedParkingLotId, setSelectedParkingLotId] = useState<string | null>(null);
    const liveParking = useLiveParkingAvailability(isParkingMode);
    const parkingCars = useParkingCars();
    const [googleMapReady, setGoogleMapReady] = useState(false);

    useEffect(() => {
        if (hasTripRoute && !previousHasTripRouteRef.current) {
            tripRouteViewportSnapshotRef.current = {
                bounds: bounds.mapBounds ? { ...bounds.mapBounds } : null,
                center: [...camera.mapCenterCoordinate] as [number, number],
                cameraLockedToInitialView: camera.cameraLockedToInitialView,
                hasInitialCameraTarget: camera.hasInitialCameraTarget,
                userLocationVisible,
                isUserFollowLocked,
            };
        }

        previousHasTripRouteRef.current = hasTripRoute;
    }, [
        bounds.mapBounds,
        camera.cameraLockedToInitialView,
        camera.hasInitialCameraTarget,
        camera.mapCenterCoordinate,
        hasTripRoute,
        isUserFollowLocked,
        userLocationVisible,
    ]);

    useEffect(() => {
        return () => {
            if (restoreRouteBoundsTimerRef.current) {
                clearTimeout(restoreRouteBoundsTimerRef.current);
                restoreRouteBoundsTimerRef.current = null;
            }
        };
    }, []);
    const topFloatingOffset = Platform.OS === 'android' ? Math.max((StatusBar.currentHeight ?? 24) + 10, 42) : 50;
    const stackedTopFloatingOffset = topFloatingOffset + 50;
    const reportButtonBottomOffset = showReportButton && isTransitMode ? Math.min(Math.max(height * 0.04, 24), 40) : 24;
    const floatingControlBottomOffset = showReportButton && isTransitMode
        ? Math.max(reportButtonBottomOffset + 82, 122)
        : Math.min(Math.max(height * 0.14, 108), 132);
    const droppedPinPanelBottomOffset = isTransitMode && showReportButton
        ? reportButtonBottomOffset + 110
        : Math.min(Math.max(height * 0.12, 84), 124);
    const parkingOverlayStretchDown = Math.min(Math.max(height * 0.1, 72), 104);
    const parkingOverlayBottomOffset = Math.max(Math.min(Math.max(height * 0.38, 200), 300) - parkingOverlayStretchDown, 96);
    const parkingPaymentPanelHeight = Math.min(Math.max(height * 0.62, 420), 620) + parkingOverlayStretchDown;
    const parkingCarsPanelHeight = Math.min(Math.max(height * 0.56, 380), 540) + parkingOverlayStretchDown;

    useEffect(() => {
        onParkingZoneChange?.(detectedParkingZoneId);
    }, [detectedParkingZoneId, onParkingZoneChange]);

    const allParkingLots = parkingLots;
    const selectedParkingLot = useMemo(
        () => getSelectedParkingLot(allParkingLots, selectedParkingLotId),
        [selectedParkingLotId, allParkingLots],
    );

    const parkingLotsGeoJSON = useMemo(
        () => createParkingLotsGeoJSON(allParkingLots, selectedParkingLotId),
        [allParkingLots, selectedParkingLotId],
    );
    const selectedLotLiveData = useMemo(
        () => getSelectedLotLiveData(selectedParkingLot, liveParking.liveLots),
        [selectedParkingLot, liveParking.liveLots],
    );

    const selectedVehicle = useMemo(
        () => getSelectedVehicle(animation.renderedDisplayVehicles, selectedVehicleId),
        [selectedVehicleId, animation.renderedDisplayVehicles],
    );
    const selectedVehicleStopName = useMemo(
        () => getSelectedVehicleStopName(selectedVehicle, stopsHook.stopNameByIdMap, stopsHook.searchableStopNameByIdMap),
        [selectedVehicle, stopsHook.searchableStopNameByIdMap, stopsHook.stopNameByIdMap],
    );

    // ── Google Maps vehicle marker pool (prevents ghost markers on Android) ──
    const googleVehicleSlotMapRef = useRef(new Map<string, number>());
    const googleVehicleSlotReverseRef = useRef(new Map<number, string>());

    const googleVehiclePool = useMemo((): Array<(typeof animation.renderedDisplayVehicles)[0] | null> => {
        if (Platform.OS !== 'android') return [];
        return buildStableMarkerPool(
            animation.renderedDisplayVehicles,
            googleVehicleSlotMapRef.current,
            googleVehicleSlotReverseRef.current,
            MAX_RENDERED_VEHICLES,
        );
    }, [animation.renderedDisplayVehicles]);

    // ── Google Maps stop marker pool (prevents ghost stop markers on Android) ──
    const googleStopSlotMapRef = useRef(new Map<string, number>());
    const googleStopSlotReverseRef = useRef(new Map<number, string>());

    const googleStopPool = useMemo((): Array<Stop | null> => {
        if (Platform.OS !== 'android') return [];
        return buildStableMarkerPool(
            stopsHook.renderedStops,
            googleStopSlotMapRef.current,
            googleStopSlotReverseRef.current,
            MAX_RENDERED_STOPS,
        );
    }, [stopsHook.renderedStops]);

    // ── Search, Favorites, Routing, Reporting ──
    const search = useSearch(stopsHook.searchableStops, filters.staticLines);
    const favorites = useFavorites();
    const droppedPinFavoriteState = useMemo(
        () => getDroppedPinFavoriteState(droppedPin, favorites.favoritePlaces),
        [droppedPin, favorites.favoritePlaces],
    );
    const droppedPinAlreadySaved = droppedPinFavoriteState.alreadySaved;
    const droppedPinMatchingFavoriteId = droppedPinFavoriteState.matchingFavoriteId;
    const stopVehicleActions = useMapStopVehicleActions({
        favorites,
        selectedStop,
        selectedVehicle,
        selectedVehicleIdRef,
        setSelectedVehicleId,
        setVehicleDelays,
        vehicleRoute,
    });
    const routing = useRouteGeometry(
        highlightedRoute,
        (lon, lat) => camera.lockCamera(lat, lon),
        camera.setRouteCameraBounds,
    );
    const selectionActions = useMapSelectionActions({
        camera,
        etasHook,
        favorites,
        filters,
        highlightedRouteLine: highlightedRoute?.line ?? null,
        routeGeometryLine: routing.routeGeometry?.line ?? null,
        search,
        selectedStop,
        selectedVehicleIdRef,
        setActiveParkingOverlay,
        setDroppedPin,
        setSelectedParkingLotId,
        setSelectedVehicleId,
        stopById: stopsHook.stopById,
    });
    const pinParkingActions = useMapPinParkingActions({
        droppedPin,
        droppedPinMatchingFavoriteId,
        favorites,
        location,
        onBuildRouteFromCoordinate,
        schedule,
        search,
        selectedStop,
        selectedVehicleIdRef,
        setActiveParkingOverlay,
        setDroppedPin,
        setEditRequestFavoriteId,
        setSelectedParkingLotId,
        setSelectedVehicleId,
    });
    const reporting = useReporting();
    const hasActiveRouteOverlay = getHasActiveRouteOverlay(
        routing.routeGeometry,
        tripPlannerRoute,
        vehicleRoute.hasVehicleRoute,
        vehicleRoute.vehicleRouteStops.length,
    );
    const transitViewportSuppressedRef = useRef(false);
    const transitViewportRenderState = getTransitViewportRenderState(
        bounds.mapBounds,
        transitViewportSuppressedRef.current,
    );
    transitViewportSuppressedRef.current = transitViewportRenderState.isSuppressed;
    const shouldRenderTransitViewportData = transitViewportRenderState.shouldRenderTransitViewportData;

    const handleMapExperienceModeChange = useCallback((nextMode: MapExperienceMode) => {
        setMapExperienceMode(nextMode);
        onMapExperienceModeChange?.(nextMode);
        if (nextMode === 'parking' && parkingZones.hasData && !parkingZones.enabled) {
            parkingZones.setEnabled(true);
        }
    }, [onMapExperienceModeChange, parkingZones.enabled, parkingZones.hasData, parkingZones.setEnabled]);

    useEffect(() => {
        if (!preferredMapExperienceMode || preferredMapExperienceMode === mapExperienceMode) {
            return;
        }

        setMapExperienceMode(preferredMapExperienceMode);
        if (preferredMapExperienceMode === 'parking' && parkingZones.hasData && !parkingZones.enabled) {
            parkingZones.setEnabled(true);
        }
    }, [mapExperienceMode, parkingZones.enabled, parkingZones.hasData, parkingZones.setEnabled, preferredMapExperienceMode]);

    const preferredInitialCenterCoordinate = useMemo<[number, number]>(
        () => getPreferredInitialCenterCoordinate(location, DEFAULT_CENTER_COORDINATE),
        [location?.coords.latitude, location?.coords.longitude],
    );

    const hasReliableInitialLocation = useMemo(
        () => getHasReliableInitialLocation(location),
        [location?.timestamp, location?.coords.accuracy, location?.coords.latitude, location?.coords.longitude],
    );

    // ── Initialize camera from location ──
    useEffect(() => {
        if (
            !location ||
            !hasReliableInitialLocation ||
            highlightedRoute ||
            hasAppliedInitialLocationCameraRef.current ||
            camera.hasInitialCameraTarget
        ) {
            return;
        }

        hasAppliedInitialLocationCameraRef.current = true;
        suppressUserRecenterRegionSyncUntilRef.current = Date.now() + 1800;
        camera.lockCamera(location.coords.latitude, location.coords.longitude);
        bounds.setMapBounds(createFocusedBounds(location.coords.latitude, location.coords.longitude, USER_LOCATION_REGION_DELTA));
        setUserLocationVisible(true);
    }, [bounds, camera, hasReliableInitialLocation, highlightedRoute, location]);

    // ── Refresh ETAs alongside vehicles ──
    useEffect(() => {
        if (!vehicles.length) return;
        void etasHook.refreshEtasForStops(stopsHook.stops.slice(0, MAX_RENDERED_STOPS));
    }, [vehicles]);

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

    const visibleParkingZonesFeatureCollection = parkingZones.visibleFeatureCollection;

    const googleInitialRegion = useMemo(
        () => getGoogleInitialRegion(preferredInitialCenterCoordinate, bounds.mapBounds, USER_LOCATION_REGION_DELTA),
        [bounds.mapBounds, preferredInitialCenterCoordinate],
    );


    // ── Map event handlers ──
    const recenterToUserLocation = useCallback(async () => {
        if (location) {
            const nextBounds = createFocusedBounds(
                location.coords.latitude,
                location.coords.longitude,
                USER_LOCATION_REGION_DELTA,
            );

            suppressUserRecenterRegionSyncUntilRef.current = Date.now() + 1800;
            camera.setTripCameraBounds(null);
            camera.setRouteCameraBounds(null);
            camera.setCameraLockedToInitialView(false);
            camera.setMapCenterCoordinate([location.coords.longitude, location.coords.latitude]);
            bounds.setMapBounds(nextBounds);

            if (Platform.OS === 'android' && googleMapReady && googleMapRef.current) {
                googleMapRef.current.animateToRegion(
                    getRegionFromCoordinate(
                        location.coords.latitude,
                        location.coords.longitude,
                        bounds.mapBounds,
                        USER_LOCATION_REGION_DELTA,
                    ),
                    550,
                );
            }

            setUserLocationVisible(true);
            return;
        }

        await refreshLocation();
    }, [bounds, camera, googleMapReady, location, refreshLocation]);

    const handleRegionDidChange = useCallback((event: any) => {
        if (Date.now() < suppressUserRecenterRegionSyncUntilRef.current) {
            if (location) {
                setUserLocationVisible(true);
            }
            return;
        }

        if (isUserFollowLocked && location) {
            setUserLocationVisible(true);
            return;
        }

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
                const centerLat = (north + south) / 2;
                const centerLon = (east + west) / 2;
                if (location) {
                    const thresholdLat = (north - south) * 0.2;
                    const thresholdLon = (east - west) * 0.2;
                    setUserLocationVisible(
                        Math.abs(location.coords.latitude - centerLat) < thresholdLat &&
                        Math.abs(location.coords.longitude - centerLon) < thresholdLon
                    );
                }
                camera.setMapCenterCoordinate([centerLon, centerLat]);
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
                    const thresholdLat = (fallbackBounds.north - fallbackBounds.south) * 0.2;
                    const thresholdLon = (fallbackBounds.east - fallbackBounds.west) * 0.2;
                    setUserLocationVisible(
                        Math.abs(location.coords.latitude - lat) < thresholdLat &&
                        Math.abs(location.coords.longitude - lon) < thresholdLon
                    );
                }
                bounds.scheduleBoundsUpdate(fallbackBounds);
            }
        }
    }, [
        bounds,
        camera,
        isUserFollowLocked,
        location,
    ]);

    const handleGoogleRegionChangeComplete = useCallback((region: Region) => {
        if (Date.now() < suppressUserRecenterRegionSyncUntilRef.current) {
            if (location) {
                setUserLocationVisible(true);
            }
            return;
        }

        if (isUserFollowLocked && location) {
            setUserLocationVisible(true);
            return;
        }

        if (camera.cameraLockedToInitialView && camera.hasInitialCameraTarget) {
            camera.unlockCamera();
        }
        if (camera.tripCameraBounds) {
            camera.setTripCameraBounds(null);
        }
        if (camera.routeCameraBounds) {
            camera.setRouteCameraBounds(null);
        }

        const nextBounds = getBoundsFromRegion(region);
        if (location) {
            const thresholdLat = (nextBounds.north - nextBounds.south) * 0.2;
            const thresholdLon = (nextBounds.east - nextBounds.west) * 0.2;
            setUserLocationVisible(
                Math.abs(location.coords.latitude - region.latitude) < thresholdLat
                && Math.abs(location.coords.longitude - region.longitude) < thresholdLon,
            );
        }

        camera.setMapCenterCoordinate([region.longitude, region.latitude]);
        bounds.scheduleBoundsUpdate(nextBounds);
    }, [bounds, camera, isUserFollowLocked, location]);

    // ── Render helpers ──
    const liveLines = useMemo(() => getLiveLines(vehicles), [vehicles]);
    const visibleSearchResults = useMemo(
        () => getVisibleSearchResults(search.centralSearchResults, isParkingMode),
        [isParkingMode, search.centralSearchResults],
    );
    const currentLocation = useMemo(
        () => getCurrentLocation(location),
        [location?.coords.latitude, location?.coords.longitude],
    );
    const activeMapboxBounds = camera.tripCameraBounds || camera.routeCameraBounds;
    const mapboxCameraZoomLevel = activeMapboxBounds
        ? undefined
        : (isUserFollowLocked
            ? INITIAL_ZOOM_LEVEL
            : (camera.cameraLockedToInitialView && camera.hasInitialCameraTarget
                ? INITIAL_ZOOM_LEVEL
                : (!camera.hasInitialCameraTarget ? INITIAL_ZOOM_LEVEL : undefined)));
    const mapboxCameraCenterCoordinate = activeMapboxBounds
        ? undefined
        : (isUserFollowLocked && location
            ? [location.coords.longitude, location.coords.latitude] as [number, number]
            : (camera.cameraLockedToInitialView && camera.hasInitialCameraTarget
                ? camera.mapCenterCoordinate
                : (!camera.hasInitialCameraTarget ? preferredInitialCenterCoordinate : undefined)));
    const mapboxCameraBounds = activeMapboxBounds
        ? {
            ne: activeMapboxBounds.ne,
            sw: activeMapboxBounds.sw,
            paddingTop: 60,
            paddingBottom: 80,
            paddingLeft: 60,
            paddingRight: 60,
        }
        : undefined;

    useMapPanelOrchestration({
        clearVehicleRoute: vehicleRoute.clearVehicleRoute,
        closeSchedule: schedule.closeSchedule,
        closeSelectedStop: selectedStop.closeSelectedStop,
        dismissTransientPanelsToken,
        favoritesRequestToken,
        favoritesVisible: favorites.favoritesVisible,
        filterPanelVisible,
        hasVehicleRoute: vehicleRoute.hasVehicleRoute,
        isParkingMode,
        onCloseFilterPanel,
        onFavoritesVisibilityChange,
        onSearchVisibilityChange,
        searchModalVisible: search.searchModalVisible,
        searchRequestToken,
        selectedVehicleIdRef,
        setFavoritesVisible: favorites.setFavoritesVisible,
        setSearchModalVisible: search.setSearchModalVisible,
        setSelectedVehicleId,
    });

    useMapFocusSync({
        bounds,
        camera,
        closeSelectedStop: selectedStop.closeSelectedStop,
        focusParkingZoneBounds,
        focusParkingZoneToken,
        focusStopCoordinate,
        focusStopId,
        googleInitialRegion,
        googleMapReady,
        googleMapRef,
        handledParkingZoneFocusTokenRef,
        hasAppliedInitialLocationCameraRef,
        hasReliableInitialLocation,
        highlightedRoute,
        isUserFollowLocked,
        location,
        parkingZonesEnabled: parkingZones.enabled,
        parkingZonesHasData: parkingZones.hasData,
        platformIsAndroid: Platform.OS === 'android',
        refreshEtasForStop: etasHook.refreshEtasForStop,
        selectedStopIdRef: selectedStop.selectedStopIdRef,
        selectedVehicleIdRef,
        setDroppedPin,
        setParkingZonesEnabled: parkingZones.setEnabled,
        setSelectedStop: selectedStop.setSelectedStop,
        setSelectedStopAnnotationId: selectedStop.setSelectedStopAnnotationId,
        setSelectedVehicleId,
        setUserLocationVisible,
        suppressMapPressUntilRef: selectedStop.suppressMapPressUntilRef,
        suppressUserRecenterRegionSyncUntilRef,
        userLocationRegionDelta: USER_LOCATION_REGION_DELTA,
    });

    const handleStopPress = useCallback(async (stop: Stop) => {
        selectedStop.selectedStopIdRef.current = stop.id;
        selectedStop.setSelectedStopAnnotationId(`stop-${stop.id}`);
        await selectedStop.openStopDetails(stop);
        await etasHook.refreshEtasForStop(stop.id);
    }, [etasHook, selectedStop]);

    const handleRouteStopPress = useCallback(async (stop: {
        id: string;
        name: string;
        latitude: number;
        longitude: number;
    }, directionName: string, annotationId: string) => {
        await selectedStop.openRouteStopDetails(
            stop,
            directionName,
            annotationId,
            stopsHook.stopById,
            routing.routeGeometry?.line,
            highlightedRoute?.line,
        );
        await etasHook.refreshEtasForStop(stop.id);
    }, [etasHook, highlightedRoute?.line, routing.routeGeometry?.line, selectedStop, stopsHook.stopById]);

    const handleVehicleRouteStopPress = useCallback(async (stop: {
        stopId: string;
        stopName: string;
        latitude: number;
        longitude: number;
    }, annotationId: string) => {
        selectedStop.suppressMapPressUntilRef.current = Date.now() + 400;
        selectedStop.selectedStopIdRef.current = stop.stopId;
        selectedStop.setSelectedStopAnnotationId(annotationId);
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
    }, [etasHook, selectedStop]);

    const handleTripPlannerStopPress = useCallback(async (stop: TripRouteStop, index: number) => {
        selectedStop.suppressMapPressUntilRef.current = Date.now() + 400;
        const resolved = resolveTripPlannerStopToKnownStop(stop, stopsHook.searchableStops);

        if (resolved) {
            selectedStop.selectedStopIdRef.current = resolved.id;
            selectedStop.setSelectedStopAnnotationId(`trip-stop-${index}`);
            selectedStop.setSelectedStop(resolved);
            await etasHook.refreshEtasForStop(resolved.id);
            return;
        }

        selectedStop.selectedStopIdRef.current = stop.stopCode ?? `trip-${index}`;
        selectedStop.setSelectedStopAnnotationId(`trip-stop-${index}`);
        selectedStop.setSelectedStop({
            id: stop.stopCode ?? `trip-${index}`,
            name: stop.name,
            latitude: stop.lat,
            longitude: stop.lon,
            lines: [],
            directions: [],
        });
    }, [etasHook, selectedStop, stopsHook.searchableStops]);

    // ── JSX ──
    return (
        <View style={styles.page}>
            <View style={styles.container}>
                {Platform.OS === 'android' ? (
                    <GoogleMapCanvas
                        googleMapRef={googleMapRef}
                        initialRegion={googleInitialRegion}
                        showsUserLocation={!!location}
                        showsTraffic={floatingControls.googleShowTraffic}
                        style={styles.map}
                        onMapReady={() => setGoogleMapReady(true)}
                        onMapPress={pinParkingActions.onMapPress}
                        onLongPress={pinParkingActions.onGoogleMapLongPress}
                        onRegionChangeComplete={handleGoogleRegionChangeComplete}
                    >
                        <GoogleParkingLayers
                            isParkingMode={isParkingMode}
                            parkingLots={allParkingLots}
                            selectedParkingLotId={selectedParkingLotId}
                            selectedParkingZoneFeatureId={focusedParkingZoneFeatureId}
                            visibleParkingZonesFeatureCollection={visibleParkingZonesFeatureCollection}
                            onParkingZonePress={(zoneFeatureId) => onShowParkingZoneOnMap?.(zoneFeatureId)}
                            onParkingLotPress={pinParkingActions.openParkingLotPanel}
                        />

                        <GoogleTransitLayers
                            currentLocation={currentLocation}
                            droppedPin={droppedPin}
                            googleStopPool={googleStopPool}
                            googleVehiclePool={googleVehiclePool}
                            googleWalkingRadiusLabels={googleWalkingRadiusLabels}
                            hasActiveRouteOverlay={hasActiveRouteOverlay}
                            hasTripRoute={hasTripRoute}
                            isTransitMode={isTransitMode}
                            renderedDisplayVehicles={animation.renderedDisplayVehicles}
                            routeGeometry={routing.routeGeometry}
                            routeGeometryVersion={routing.routeGeometryVersion}
                            selectedStopAnnotationId={selectedStop.selectedStopAnnotationId}
                            shouldRenderTransitViewportData={shouldRenderTransitViewportData}
                            tripPlannerRoute={tripPlannerRoute}
                            vehicleRouteCoords={vehicleRoute.vehicleRouteCoords}
                            vehicleRouteHasRoute={vehicleRoute.hasVehicleRoute}
                            vehicleRouteStops={vehicleRoute.vehicleRouteStops}
                            vehicleRouteVehicleId={vehicleRoute.vehicleRouteVehicleId}
                            onRouteStopPress={handleRouteStopPress}
                            onStopPress={handleStopPress}
                            onTrackedVehiclePress={stopVehicleActions.handleTrackedVehicleSelect}
                            onTripPlannerStopPress={handleTripPlannerStopPress}
                            onVehiclePress={stopVehicleActions.handleVehicleSelect}
                            onVehicleRouteStopPress={handleVehicleRouteStopPress}
                        />
                    </GoogleMapCanvas>
                ) : (
                <MapboxMapCanvas
                    bounds={mapboxCameraBounds}
                    centerCoordinate={mapboxCameraCenterCoordinate}
                    mapStyle={MAP_STYLE}
                    style={styles.map}
                    userLocationGeoJSON={userLocationGeoJSON}
                    zoomLevel={mapboxCameraZoomLevel}
                    onMapPress={pinParkingActions.onMapPress}
                    onRegionDidChange={handleRegionDidChange}
                    onLongPress={pinParkingActions.onMapLongPress}
                >
                    <MapboxParkingLayers
                        isParkingMode={isParkingMode}
                        parkingLotsGeoJSON={parkingLotsGeoJSON}
                        selectedParkingZoneFeatureId={focusedParkingZoneFeatureId}
                        visibleParkingZonesFeatureCollection={visibleParkingZonesFeatureCollection}
                        onParkingZonePress={(zoneFeatureId) => onShowParkingZoneOnMap?.(zoneFeatureId)}
                        onParkingLotPress={pinParkingActions.openParkingLotPanel}
                    />

                    <MapboxTransitLayers
                        droppedPin={droppedPin}
                        hasActiveRouteOverlay={hasActiveRouteOverlay}
                        hasTripRoute={hasTripRoute}
                        isTransitMode={isTransitMode}
                        renderedDisplayVehicles={animation.renderedDisplayVehicles}
                        routeGeometry={routing.routeGeometry}
                        routeGeometryVersion={routing.routeGeometryVersion}
                        selectedStopAnnotationId={selectedStop.selectedStopAnnotationId}
                        selectedStopIdRef={selectedStop.selectedStopIdRef}
                        shouldRenderTransitViewportData={shouldRenderTransitViewportData}
                        stopAnnotationRefs={stopAnnotationRefs}
                        stops={stopsHook.renderedStops}
                        tripPlannerRoute={tripPlannerRoute}
                        vehicleRouteCoords={vehicleRoute.vehicleRouteCoords}
                        vehicleRouteHasRoute={vehicleRoute.hasVehicleRoute}
                        vehicleRouteStops={vehicleRoute.vehicleRouteStops}
                        vehicleRouteVehicleId={vehicleRoute.vehicleRouteVehicleId}
                        walkingRadiiGeoJSON={walkingRadiiGeoJSON}
                        onCloseSelectedStop={selectedStop.closeSelectedStop}
                        onRouteStopPress={handleRouteStopPress}
                        onStopPress={handleStopPress}
                        onTrackedVehiclePress={stopVehicleActions.handleTrackedVehicleSelect}
                        onTripPlannerStopPress={handleTripPlannerStopPress}
                        onVehicleDeselect={stopVehicleActions.handleVehicleDeselect}
                        onVehiclePress={stopVehicleActions.handleVehicleSelect}
                        onVehicleRouteStopPress={handleVehicleRouteStopPress}
                    />
                </MapboxMapCanvas>
                )}

                <MapFloatingControls
                    bottomOffset={floatingControlBottomOffset}
                    filterPanelOpaque={!!selectedStop.selectedStop || search.searchModalVisible || favorites.favoritesVisible || !!filterPanelVisible}
                    googleShowTraffic={floatingControls.googleShowTraffic}
                    isActive={isActive}
                    isParkingMode={isParkingMode}
                    isTransitMode={isTransitMode}
                    mapExperienceMode={mapExperienceMode}
                    mapLayerPillAnim={floatingControls.mapLayerPillAnim}
                    mapLayerPillExpanded={floatingControls.mapLayerPillExpanded}
                    onMapExperienceModeChange={handleMapExperienceModeChange}
                    onMapLayerToggle={floatingControls.handleMapLayerToggle}
                    onRecenterLongPress={() => {
                        if (isUserFollowLocked) {
                            setIsUserFollowLocked(false);
                            camera.unlockCamera();
                            return;
                        }

                        setIsUserFollowLocked(true);
                        void recenterToUserLocation();
                    }}
                    onRecenterPress={() => {
                        if (isUserFollowLocked) {
                            setIsUserFollowLocked(false);
                            camera.unlockCamera();
                            return;
                        }

                        void recenterToUserLocation();
                    }}
                    onScheduledSmsPress={pinParkingActions.openParkingPaymentPanel}
                    onSupportProject={floatingControls.handleSupportProject}
                    onToggleGoogleTraffic={floatingControls.handleGoogleTrafficPress}
                    onToggleSettings={floatingControls.handleSettingsToggle}
                    settingsExpanded={floatingControls.settingsExpanded}
                    settingsSlideAnim={floatingControls.settingsSlideAnim}
                    showMapLayerToggle={Platform.OS === 'android'}
                    onOpenSavedTripRoute={onOpenSavedTripRoute}
                    showReminderButton={!favorites.favoritesVisible}
                    showRecenterButton={!!location}
                    userFollowLocked={isUserFollowLocked}
                />

                <MapClearActions
                    isParkingMode={isParkingMode}
                    isTransitMode={isTransitMode}
                    onClearFocusedParkingZone={overlayActions.handleClearFocusedParkingZone}
                    onClearHighlightedRoute={onClearHighlightedRoute}
                    onClearShownTripRoute={overlayActions.handleClearShownTripRoute}
                    onClearVehicleRoute={vehicleRoute.clearVehicleRoute}
                    showFocusedParkingZoneClear={!!focusedParkingZoneFeatureId && !!onClearFocusedParkingZone}
                    showHighlightedRouteClear={!!highlightedRoute && !!onClearHighlightedRoute && !tripPlannerRoute}
                    showTripRouteClear={!!tripPlannerRoute && !!onClearTripRoute}
                    showVehicleRouteClear={vehicleRoute.hasVehicleRoute}
                    stackedTopOffset={stackedTopFloatingOffset}
                    topOffset={topFloatingOffset}
                />

                <ParkingZoneInfoPanel
                    visible={isParkingMode && !!focusedParkingZoneFeatureId}
                    selectedZoneFeatureId={focusedParkingZoneFeatureId}
                    onClose={overlayActions.handleClearFocusedParkingZone}
                />

                <MapFeaturePanels
                    activeParkingOverlay={activeParkingOverlay}
                    animationFilteredVehiclesCount={animation.filteredVehicles.length}
                    currentLocation={currentLocation}
                    detectedParkingZoneId={detectedParkingZoneId}
                    droppedPin={droppedPin}
                    droppedPinAlreadySaved={droppedPinAlreadySaved}
                    droppedPinMatchingFavoriteId={droppedPinMatchingFavoriteId}
                    droppedPinPanelBottomOffset={droppedPinPanelBottomOffset}
                    editRequestFavoriteId={editRequestFavoriteId}
                    etasBySelectedStopId={selectedStop.selectedStop ? (etasHook.etasByStopId[selectedStop.selectedStop.id] || []) : []}
                    filterPanelVisible={filterPanelVisible}
                    filters={filters}
                    floatingControls={floatingControls}
                    favorites={favorites}
                    isParkingMode={isParkingMode}
                    isTransitMode={isTransitMode}
                    liveLines={liveLines}
                    onBuildRouteFromCoordinate={onBuildRouteFromCoordinate}
                    onCloseFilterPanel={onCloseFilterPanel}
                    onCloseParkingOverlay={() => setActiveParkingOverlay(null)}
                    onCloseSelectedParkingLot={() => setSelectedParkingLotId(null)}
                    onEditRequestHandled={() => setEditRequestFavoriteId(null)}
                    onFilterOpenStopDetails={async (stop) => {
                        await selectedStop.openStopDetails(stop);
                        await etasHook.refreshEtasForStop(stop.id);
                    }}
                    onOpenManageCars={pinParkingActions.openParkingCarsPanel}
                    onParkingDroppedPinNavigate={pinParkingActions.onParkingDroppedPinNavigate}
                    onRouteStopSelect={selectionActions.onRouteStopSelect}
                    onSaveFavoriteFromSearch={selectionActions.onSaveFavoriteFromSearch}
                    onSelectFavorite={selectionActions.onSelectFavorite}
                    onSelectLineResult={selectionActions.onSelectLineResult}
                    onSelectSearchResult={selectionActions.onSelectSearchResult}
                    onSelectStopResult={selectionActions.onSelectStopResult}
                    onShowFavoriteRouteOnMap={(route) => {
                        onShowTripRoute?.(route, 'favorites');
                    }}
                    onSelectedStopPlaceAction={stopVehicleActions.handleSelectedStopPlaceAction}
                    onSelectedVehicleClose={stopVehicleActions.handleVehiclePanelClose}
                    onSelectedVehicleLoadRoute={stopVehicleActions.handleVehiclePanelLoadRoute}
                    onOpenSavedTripRoute={onOpenSavedTripRoute}
                    onTransitDroppedPinBuildRoute={pinParkingActions.onTransitDroppedPinBuildRoute}
                    onTransitDroppedPinEditLocation={pinParkingActions.onTransitDroppedPinEditLocation}
                    onTransitDroppedPinSaveFavorite={pinParkingActions.onTransitDroppedPinSaveFavorite}
                    parkingCars={parkingCars}
                    parkingOverlayBottomOffset={parkingOverlayBottomOffset}
                    parkingPaymentPanelHeight={parkingPaymentPanelHeight}
                    parkingCarsPanelHeight={parkingCarsPanelHeight}
                    parkingZones={parkingZones}
                    reporting={reporting}
                    routeLoading={vehicleRoute.vehicleRouteLoading}
                    reportButtonBottomOffset={reportButtonBottomOffset}
                    routing={routing}
                    schedule={schedule}
                    search={search}
                    searchableStops={stopsHook.searchableStops}
                    selectedLotLiveData={selectedLotLiveData}
                    selectedParkingLot={selectedParkingLot}
                    selectedStop={selectedStop}
                    selectedStopMatchingFavorite={!!stopVehicleActions.selectedStopMatchingFavorite}
                    selectedStopPlaceSubmitting={stopVehicleActions.selectedStopPlaceSubmitting}
                    selectedVehicle={selectedVehicle}
                    selectedVehicleRouteActive={vehicleRoute.vehicleRouteVehicleId === selectedVehicle?.id}
                    selectedVehicleStopName={selectedVehicleStopName}
                    setDroppedPin={setDroppedPin}
                    showReportButton={showReportButton}
                    stopsHook={stopsHook}
                    totalVehiclesCount={vehicles.length}
                    vehicleDelays={vehicleDelays}
                    visibleSearchResults={visibleSearchResults}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    page: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    container: { height: '100%', width: '100%', backgroundColor: '#F8FAFC' },
    map: { flex: 1 },
});
