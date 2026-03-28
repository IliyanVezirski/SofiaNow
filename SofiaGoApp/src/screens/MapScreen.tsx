import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Linking, StyleSheet, View, Text, TouchableOpacity, LogBox } from 'react-native';
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
import { openExternalDrivingNavigation } from '../services/externalNavigation';
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
import { SettingsModal } from '../features/settings/components/SettingsModal';
import { SupportModal } from '../features/settings/components/SupportModal';
import { useParkingZones } from '../features/parkingZones/hooks/useParkingZones';
import { CATEGORY_META } from '../features/parkingZones/components/ParkingLotsModal';
import { ParkingLotInfoPanel } from '../features/parkingZones/components/ParkingLotInfoPanel';
import { useLiveParkingAvailability } from '../features/parkingZones/hooks/useLiveParkingAvailability';
import type { ParkingLot } from '../features/parkingZones/types/parkingLots';
import type { ParkingZoneId } from '../features/parkingZones/types';
import { MapExperienceMode, MapModeSwitcher } from '../features/map/components/MapModeSwitcher';

import { INITIAL_ZOOM_LEVEL, MAP_STYLE, MAX_RENDERED_STOPS, DEFAULT_CENTER_COORDINATE, createFallbackBounds, getDirectionAccentColor, getDirectionArrowSamples } from '../features/map/constants';

const SUPPORT_REVOLUT_URL = 'https://revolut.me/iliyantyb2';

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
    parkingLots?: ParkingLot[];
    preferredMapExperienceMode?: MapExperienceMode;
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
}: MapScreenProps) {
    const stopAnnotationRefs = useRef<Record<string, { refresh: () => void } | null>>({});
    const previousSelectedStopAnnotationIdRef = useRef<string | null>(null);
    const hasAppliedInitialLocationCameraRef = useRef(false);
    const handledParkingZoneFocusTokenRef = useRef(0);

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

    const userLocationGeoJSON = useMemo(() => {
        if (!location) return null;
        return {
            type: 'Feature' as const,
            geometry: {
                type: 'Point' as const,
                coordinates: [location.coords.longitude, location.coords.latitude],
            },
            properties: {},
        };
    }, [location?.coords.latitude, location?.coords.longitude]);

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
    const [editRequestFavoriteId, setEditRequestFavoriteId] = useState<string | null>(null);
    const [userLocationVisible, setUserLocationVisible] = useState(true);
    const [isUserFollowLocked, setIsUserFollowLocked] = useState(false);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [supportVisible, setSupportVisible] = useState(false);
    const [settingsExpanded, setSettingsExpanded] = useState(false);
    const [mapExperienceMode, setMapExperienceMode] = useState<MapExperienceMode>(preferredMapExperienceMode ?? 'transit');
    const settingsSlideAnim = useRef(new Animated.Value(0)).current;
    const settingsAutoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const parkingZones = useParkingZones(
        location ? { latitude: location.coords.latitude, longitude: location.coords.longitude } : null,
        droppedPin,
    );
    const detectedParkingZoneId = parkingZones.userZone?.id ?? null;
    const isTransitMode = mapExperienceMode === 'transit';
    const isParkingMode = mapExperienceMode === 'parking';
    const supportRevolutUrl = SUPPORT_REVOLUT_URL.trim();
    const [selectedParkingLotId, setSelectedParkingLotId] = useState<string | null>(null);
    const liveParking = useLiveParkingAvailability(isParkingMode);

    const clearSettingsAutoHideTimer = useCallback(() => {
        if (!settingsAutoHideTimer.current) {
            return;
        }

        clearTimeout(settingsAutoHideTimer.current);
        settingsAutoHideTimer.current = null;
    }, []);

    const collapseSettingsPill = useCallback(() => {
        clearSettingsAutoHideTimer();
        setSettingsExpanded(false);
        Animated.timing(settingsSlideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }, [clearSettingsAutoHideTimer, settingsSlideAnim]);

    const expandSettingsPill = useCallback(() => {
        clearSettingsAutoHideTimer();
        setSettingsExpanded(true);
        Animated.timing(settingsSlideAnim, {
            toValue: 1,
            duration: 250,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
        settingsAutoHideTimer.current = setTimeout(() => {
            setSettingsExpanded(false);
            Animated.timing(settingsSlideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
            settingsAutoHideTimer.current = null;
        }, 2000);
    }, [clearSettingsAutoHideTimer, settingsSlideAnim]);

    const handleOpenSettings = useCallback(() => {
        collapseSettingsPill();
        setSettingsVisible(true);
    }, [collapseSettingsPill]);

    const handleSettingsToggle = useCallback(() => {
        if (settingsExpanded) {
            handleOpenSettings();
            return;
        }

        expandSettingsPill();
    }, [expandSettingsPill, handleOpenSettings, settingsExpanded]);

    const handleSupportProject = useCallback(() => {
        collapseSettingsPill();
        setSupportVisible(true);
    }, [collapseSettingsPill]);

    const handleOpenSupportLink = useCallback(() => {
        if (!supportRevolutUrl) {
            return;
        }

        void (async () => {
            try {
                const canOpen = await Linking.canOpenURL(supportRevolutUrl);
                if (!canOpen) {
                    return;
                }

                await Linking.openURL(supportRevolutUrl);
                setSupportVisible(false);
            } catch {
                return;
            }
        })();
    }, [supportRevolutUrl]);

    useEffect(() => () => clearSettingsAutoHideTimer(), [clearSettingsAutoHideTimer]);

    useEffect(() => {
        onParkingZoneChange?.(detectedParkingZoneId);
    }, [detectedParkingZoneId, onParkingZoneChange]);

    const allParkingLots = parkingLots;
    const selectedParkingLot = useMemo(
        () => selectedParkingLotId ? allParkingLots.find(l => l.id === selectedParkingLotId) ?? null : null,
        [selectedParkingLotId, allParkingLots],
    );

    const parkingLotsGeoJSON = useMemo(() => ({
        type: 'FeatureCollection' as const,
        features: allParkingLots.map((lot) => ({
            type: 'Feature' as const,
            id: lot.id,
            geometry: { type: 'Point' as const, coordinates: [lot.longitude, lot.latitude] },
            properties: {
                lotId: lot.id,
                label: ({ buffer: 'БП', underground: 'ПП', 'multi-storey': 'МП', airport: '✈', surface: 'П', commercial: 'ТП', impound: 'НП', private: 'ЧП' } as Record<string, string>)[lot.category] ?? 'P',
                color: CATEGORY_META[lot.category]?.color ?? '#64748B',
                isSelected: lot.id === selectedParkingLotId ? 1 : 0,
            },
        })),
    }), [allParkingLots, selectedParkingLotId]);
    const selectedLotLiveData = useMemo(() => {
        if (!selectedParkingLot || !liveParking.liveLots.length) return null;
        return liveParking.liveLots.find(l =>
            Math.abs(l.latitude - selectedParkingLot.latitude) < 0.002 &&
            Math.abs(l.longitude - selectedParkingLot.longitude) < 0.002
        ) ?? null;
    }, [selectedParkingLot, liveParking.liveLots]);

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
    const droppedPinMatchingFavoriteId = useMemo(() => {
        if (!droppedPin) return null;
        const lat = droppedPin.latitude.toFixed(6);
        const lon = droppedPin.longitude.toFixed(6);
        const match = favorites.favoritePlaces.find((f) =>
            hasFavoriteCoordinates(f) && f.latitude!.toFixed(6) === lat && f.longitude!.toFixed(6) === lon,
        );
        return match?.id ?? null;
    }, [droppedPin, favorites.favoritePlaces]);
    const routing = useRouteGeometry(
        highlightedRoute,
        (lon, lat) => camera.lockCamera(lat, lon),
        camera.setRouteCameraBounds,
    );
    const reporting = useReporting();

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

    useEffect(() => {
        if (!isParkingMode) return;
        search.setSearchModalVisible(false);
        favorites.setFavoritesVisible(false);
        selectedStop.closeSelectedStop();
        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        schedule.closeSchedule();
        if (vehicleRoute.hasVehicleRoute) {
            vehicleRoute.clearVehicleRoute();
        }
        if (onCloseFilterPanel) {
            onCloseFilterPanel();
        }
    }, [isParkingMode]);

    useEffect(() => {
        if (!isUserFollowLocked || !location) {
            return;
        }

        camera.lockCamera(location.coords.latitude, location.coords.longitude);
        bounds.setMapBounds(createFallbackBounds(location.coords.latitude, location.coords.longitude));
        setUserLocationVisible(true);
    }, [
        bounds,
        camera,
        isUserFollowLocked,
        location?.coords.latitude,
        location?.coords.longitude,
    ]);

    useEffect(() => {
        if (!focusParkingZoneBounds || typeof focusParkingZoneToken !== 'number' || focusParkingZoneToken <= 0) {
            return;
        }

        if (handledParkingZoneFocusTokenRef.current === focusParkingZoneToken) {
            return;
        }

        handledParkingZoneFocusTokenRef.current = focusParkingZoneToken;

        camera.unlockCamera();
        camera.setTripCameraBounds(null);
        camera.setRouteCameraBounds(focusParkingZoneBounds);
        setUserLocationVisible(false);
        selectedVehicleIdRef.current = null;
        setSelectedVehicleId(null);
        selectedStop.closeSelectedStop();
        setDroppedPin(null);
        if (parkingZones.hasData && !parkingZones.enabled) {
            parkingZones.setEnabled(true);
        }

        const releaseRouteBoundsTimer = setTimeout(() => {
            camera.setRouteCameraBounds(null);
        }, 650);

        return () => {
            clearTimeout(releaseRouteBoundsTimer);
        };
    }, [
        focusParkingZoneBounds,
        focusParkingZoneToken,
        camera.setRouteCameraBounds,
        camera.setTripCameraBounds,
        camera.unlockCamera,
        parkingZones.enabled,
        parkingZones.hasData,
        parkingZones.setEnabled,
        selectedStop.closeSelectedStop,
    ]);

    const visibleParkingZonesFeatureCollection = useMemo(() => {
        const collection = parkingZones.visibleFeatureCollection;
        if (!collection || !focusedParkingZoneFeatureId) {
            return collection;
        }

        const focusedFeature = collection.features.find((feature) => feature.properties.id === focusedParkingZoneFeatureId) ?? null;
        if (!focusedFeature) {
            return collection;
        }

        return {
            type: 'FeatureCollection' as const,
            features: [focusedFeature],
        };
    }, [focusedParkingZoneFeatureId, parkingZones.visibleFeatureCollection]);

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
        setSelectedParkingLotId(null);
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
        setSelectedParkingLotId(null);
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
        if (isUserFollowLocked && location) {
            camera.lockCamera(location.coords.latitude, location.coords.longitude);
            bounds.scheduleBoundsUpdate(createFallbackBounds(location.coords.latitude, location.coords.longitude));
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

    // ── Search callbacks ──
    const onSelectSearchResult = useCallback((result: CentralSearchResult & { kind: 'place' }) => {
        camera.focusOnCoordinate(result.latitude, result.longitude);
        setDroppedPin({ latitude: result.latitude, longitude: result.longitude });
        setSelectedParkingLotId(null);
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

    const onSaveFavoriteFromSearch = useCallback(async (name: string, latitude: number, longitude: number) => {
        await favorites.saveFavorite(name, latitude, longitude);
        search.setSearchModalVisible(false);
        favorites.setFavoritesVisible(true);
    }, [favorites, search]);

    // ── Render helpers ──
    const liveLines = useMemo(() => new Set(vehicles.map((v) => v.line)), [vehicles]);
    const visibleSearchResults = useMemo(
        () => (isParkingMode
            ? search.centralSearchResults.filter((result) => result.kind === 'place')
            : search.centralSearchResults),
        [isParkingMode, search.centralSearchResults],
    );

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
                        zoomLevel={(camera.tripCameraBounds || camera.routeCameraBounds)
                            ? undefined
                            : (isUserFollowLocked
                                ? INITIAL_ZOOM_LEVEL
                                : (camera.cameraLockedToInitialView && camera.hasInitialCameraTarget ? INITIAL_ZOOM_LEVEL : (!camera.hasInitialCameraTarget ? INITIAL_ZOOM_LEVEL : undefined)))}
                        centerCoordinate={(camera.tripCameraBounds || camera.routeCameraBounds)
                            ? undefined
                            : (isUserFollowLocked && location
                                ? [location.coords.longitude, location.coords.latitude]
                                : (camera.cameraLockedToInitialView && camera.hasInitialCameraTarget ? camera.mapCenterCoordinate : (!camera.hasInitialCameraTarget ? preferredInitialCenterCoordinate : undefined)))}
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

                    {userLocationGeoJSON && (
                        <MapboxGL.ShapeSource id="user-location-source" shape={userLocationGeoJSON as any}>
                            <MapboxGL.CircleLayer
                                id="user-location-outer"
                                style={{ circleRadius: 12, circleColor: '#FFFFFF', circleOpacity: 0.9 }}
                            />
                            <MapboxGL.CircleLayer
                                id="user-location-inner"
                                style={{ circleRadius: 10, circleColor: '#007AFF' }}
                            />
                        </MapboxGL.ShapeSource>
                    )}

                    {isTransitMode && walkingRadiiGeoJSON && (
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

                    {isParkingMode && visibleParkingZonesFeatureCollection && (
                        <MapboxGL.ShapeSource id="parking-zones" shape={visibleParkingZonesFeatureCollection as any}>
                            <MapboxGL.FillLayer
                                id="parking-zones-fill"
                                style={{
                                    fillColor: ['get', 'lineColor'],
                                    fillOpacity: 0.34,
                                }}
                            />
                            <MapboxGL.LineLayer
                                id="parking-zones-outline"
                                style={{
                                    lineColor: ['get', 'lineColor'],
                                    lineWidth: 2.4,
                                    lineOpacity: 1,
                                }}
                            />
                            <MapboxGL.SymbolLayer
                                id="parking-zones-labels"
                                style={{
                                    textField: ['get', 'displayName'],
                                    textSize: 12,
                                    textColor: '#0F172A',
                                    textHaloColor: 'rgba(255,255,255,0.98)',
                                    textHaloWidth: 2.4,
                                }}
                            />
                        </MapboxGL.ShapeSource>
                    )}

                    {isParkingMode && (
                        <MapboxGL.ShapeSource
                            id="parking-lots-source"
                            shape={parkingLotsGeoJSON as any}
                            onPress={(e) => {
                                const feature = e.features?.[0];
                                const lotId = feature?.properties?.lotId as string | undefined;
                                if (lotId) setSelectedParkingLotId(lotId);
                            }}
                        >
                            <MapboxGL.CircleLayer
                                id="parking-lots-circle"
                                style={{
                                    circleRadius: ['case', ['==', ['get', 'isSelected'], 1], 16, 13],
                                    circleColor: ['get', 'color'],
                                    circleStrokeWidth: 2.5,
                                    circleStrokeColor: ['case', ['==', ['get', 'isSelected'], 1], '#0F172A', '#FFFFFF'],
                                    circlePitchAlignment: 'map',
                                }}
                            />
                            <MapboxGL.SymbolLayer
                                id="parking-lots-label"
                                style={{
                                    textField: ['get', 'label'],
                                    textSize: ['case', ['==', ['get', 'isSelected'], 1], 10, 8],
                                    textColor: '#FFFFFF',
                                    textAllowOverlap: true,
                                    textIgnorePlacement: true,
                                }}
                            />
                        </MapboxGL.ShapeSource>
                    )}

                    {/* Stops */}
                    {isTransitMode && !routing.routeGeometry && !vehicleRoute.hasVehicleRoute && !hasTripRoute && stopsHook.renderedStops.map((stop) => (
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
                    {isTransitMode && !hasTripRoute && routing.routeGeometry?.directions.map((direction, index) => (
                        <React.Fragment key={`route-group-${routing.routeGeometry!.line}-${index}`}>
                            <MapboxGL.ShapeSource
                                id={`route-outline-${routing.routeGeometry!.line}-${index}`}
                                shape={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: direction.coordinates } }}
                            >
                                <MapboxGL.LineLayer
                                    id={`route-outline-layer-${routing.routeGeometry!.line}-${index}`}
                                    style={{ lineColor: '#FFFFFF', lineWidth: 7, lineOpacity: 0.85, lineCap: 'round', lineJoin: 'round' }}
                                />
                            </MapboxGL.ShapeSource>
                            <MapboxGL.ShapeSource
                                id={`route-source-${routing.routeGeometry!.line}-${index}`}
                                shape={{ type: 'Feature', properties: { routeColor: getDirectionAccentColor(index) }, geometry: { type: 'LineString', coordinates: direction.coordinates } }}
                            >
                                <MapboxGL.LineLayer
                                    id={`route-layer-${routing.routeGeometry!.line}-${index}`}
                                    style={{ lineColor: ['get', 'routeColor'], lineWidth: 4, lineOpacity: 0.9, lineCap: 'round', lineJoin: 'round' }}
                                />
                            </MapboxGL.ShapeSource>
                        </React.Fragment>
                    ))}

                    {/* Route direction arrows */}
                    {isTransitMode && !hasTripRoute && routing.routeGeometry?.directions.map((direction, dirIdx) =>
                        getDirectionArrowSamples(direction.coordinates).map((arrow, aIdx) => (
                            <MapboxGL.PointAnnotation key={`route-arrow-${dirIdx}-${aIdx}`} id={`route-arrow-${dirIdx}-${aIdx}`} coordinate={arrow.coordinate}>
                                <Text style={[styles.routeDirectionArrow, { color: getDirectionAccentColor(dirIdx), transform: [{ rotate: `${arrow.headingDegrees}deg` }] }]}>{'\u25B2'}</Text>
                            </MapboxGL.PointAnnotation>
                        ))
                    )}

                    {/* Route stops */}
                    {isTransitMode && !hasTripRoute && routing.routeGeometry?.directions.map((direction, dirIdx) =>
                        direction.stops.map((stop, stopIdx) => {
                            const annId = `route-stop-v${routing.routeGeometryVersion}-${dirIdx}-${stop.id}-${stopIdx}`;
                            const isSelected = selectedStop.selectedStopAnnotationId === annId;
                            return (
                                <MapboxGL.PointAnnotation
                                    key={`${annId}-${isSelected ? 'selected' : 'idle'}`} id={annId} coordinate={[stop.longitude, stop.latitude]}
                                    ref={(ref) => { stopAnnotationRefs.current[annId] = ref; }}
                                    selected={isSelected}
                                    onSelected={() => {
                                        void (async () => {
                                            await selectedStop.openRouteStopDetails(stop, direction.name || `Посока ${dirIdx + 1}`, annId, stopsHook.stopById, routing.routeGeometry?.line, highlightedRoute?.line);
                                            await etasHook.refreshEtasForStop(stop.id);
                                        })();
                                    }}
                                    onDeselected={() => { if (selectedStop.selectedStopIdRef.current === stop.id) selectedStop.closeSelectedStop(); }}
                                >
                                    <View style={{ alignItems: 'center' }}>
                                        <View style={[styles.routeStopDot, { borderColor: getDirectionAccentColor(dirIdx) }, isSelected && styles.routeStopDotSelected]} />
                                        {isSelected && (
                                            <View style={styles.routeStopLabel}>
                                                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.routeStopName} numberOfLines={1}>{stop.name}</Text>
                                            </View>
                                        )}
                                    </View>
                                </MapboxGL.PointAnnotation>
                            );
                        })
                    )}

                    {/* Vehicle route overlay */}
                    {isTransitMode && !hasTripRoute && vehicleRoute.vehicleRouteStops.length > 0 && (() => {
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
                                    <>
                                    <MapboxGL.ShapeSource
                                        id="vehicle-route-outline"
                                        shape={{
                                            type: 'Feature',
                                            properties: {},
                                            geometry: { type: 'LineString', coordinates: liveCoords },
                                        }}
                                    >
                                        <MapboxGL.LineLayer
                                            id="vehicle-route-outline-layer"
                                            style={{ lineColor: '#FFFFFF', lineWidth: 7, lineOpacity: 0.85, lineCap: 'round', lineJoin: 'round' }}
                                        />
                                    </MapboxGL.ShapeSource>
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
                                            style={{ lineColor: '#059669', lineWidth: 4, lineOpacity: 0.9, lineCap: 'round', lineJoin: 'round' }}
                                        />
                                    </MapboxGL.ShapeSource>
                                    </>
                                )}

                                {vehicleRoute.vehicleRouteStops.map((stop, idx) => {
                                    const annId = `vr-stop-${stop.stopId}-${idx}`;
                                    const isSelected = selectedStop.selectedStopAnnotationId === annId;
                                    return (
                                        <MapboxGL.PointAnnotation
                                            key={`${annId}-${isSelected ? 'selected' : 'idle'}`}
                                            id={annId}
                                            ref={(ref) => { stopAnnotationRefs.current[annId] = ref; }}
                                            coordinate={[stop.longitude, stop.latitude]}
                                            selected={isSelected}
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
                                            <View style={{ alignItems: 'center' }}>
                                                <View style={[styles.vehicleRouteStopDot, isSelected && styles.vehicleRouteStopDotSelected]} />
                                                {isSelected && (
                                                    <View style={styles.vehicleRouteStopLabel}>
                                                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.vehicleRouteStopName} numberOfLines={1}>{stop.stopName}</Text>
                                                        {stop.arrivalTimestamp ? <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.vehicleRouteStopTime}>{formatUnixTime(stop.arrivalTimestamp)}</Text> : null}
                                                    </View>
                                                )}
                                            </View>
                                        </MapboxGL.PointAnnotation>
                                    );
                                })}
                            </>
                        );
                    })()}

                    {/* Tracked vehicle marker when vehicle route is active */}
                    {isTransitMode && !hasTripRoute && vehicleRoute.hasVehicleRoute && (() => {
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
                    {isTransitMode && !hasTripRoute && !vehicleRoute.hasVehicleRoute && animation.renderedDisplayVehicles.map((vehicle) => (
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
                            <View style={styles.droppedPinDot} />
                        </MapboxGL.PointAnnotation>
                    )}

                    {/* Trip planner route overlay */}
                    {isTransitMode && tripPlannerRoute && tripPlannerRoute.features.map((feature, idx) => (
                        <React.Fragment key={`trip-leg-group-${idx}`}>
                            {/* Outline / casing for better visibility */}
                            <MapboxGL.ShapeSource key={`trip-leg-outline-${idx}`} id={`trip-leg-outline-${idx}`} shape={{ type: 'Feature', properties: {}, geometry: feature.geometry }}>
                                <MapboxGL.LineLayer id={`trip-leg-outline-layer-${idx}`} style={{
                                    lineColor: '#FFFFFF',
                                    lineWidth: feature.properties.mode === 'WALK' ? 7 : 8,
                                    lineOpacity: 0.85,
                                    lineCap: 'round',
                                    lineJoin: 'round',
                                }} />
                            </MapboxGL.ShapeSource>
                            {/* Main colored line */}
                            <MapboxGL.ShapeSource key={`trip-leg-${idx}`} id={`trip-leg-${idx}`} shape={{ type: 'Feature', properties: {}, geometry: feature.geometry }}>
                                <MapboxGL.LineLayer id={`trip-leg-layer-${idx}`} style={{
                                    lineColor: feature.properties.color,
                                    lineWidth: feature.properties.mode === 'WALK' ? 4 : 5,
                                    lineOpacity: 1,
                                    lineCap: feature.properties.mode === 'WALK' ? 'butt' : 'round',
                                    lineJoin: 'round',
                                    lineDasharray: feature.properties.mode === 'WALK' ? [0.8, 1.8] : [],
                                }} />
                            </MapboxGL.ShapeSource>
                        </React.Fragment>
                    ))}

                    {/* Trip planner direction arrows */}
                    {isTransitMode && tripPlannerRoute && tripPlannerRoute.features.map((feature, idx) =>
                        getDirectionArrowSamples(feature.geometry.coordinates, feature.properties.mode === 'WALK' ? 6 : 10).map((arrow, aIdx) => (
                            <MapboxGL.PointAnnotation key={`trip-arrow-${idx}-${aIdx}`} id={`trip-arrow-${idx}-${aIdx}`} coordinate={arrow.coordinate}>
                                <Text style={[styles.tripDirectionArrow, { color: feature.properties.mode === 'WALK' ? '#64748B' : feature.properties.color, transform: [{ rotate: `${arrow.headingDegrees}deg` }] }]}>{'\u25B2'}</Text>
                            </MapboxGL.PointAnnotation>
                        ))
                    )}

                    {/* Trip planner mode change markers */}
                    {isTransitMode && tripPlannerRoute && tripPlannerRoute.features.map((feature, idx) => {
                        if (idx === 0) return null;
                        const prevMode = tripPlannerRoute.features[idx - 1].properties.mode;
                        const currMode = feature.properties.mode;
                        if (prevMode === currMode) return null;
                        const coord = feature.geometry.coordinates[0];
                        const modeIcon = currMode === 'WALK' ? 'walk-outline' : currMode === 'BUS' ? 'bus-outline' : currMode === 'TRAM' ? 'train-outline' : currMode === 'TROLLEYBUS' ? 'bus-outline' : currMode === 'SUBWAY' ? 'subway-outline' : currMode === 'RAIL' ? 'train-outline' : 'swap-horizontal-outline';
                        return (
                            <MapboxGL.PointAnnotation key={`trip-mode-${idx}`} id={`trip-mode-${idx}`} coordinate={coord}>
                                <View style={[styles.tripModeMarker, { borderColor: feature.properties.color }]}>
                                    <Ionicons name={modeIcon as any} size={13} color={feature.properties.color} />
                                </View>
                            </MapboxGL.PointAnnotation>
                        );
                    })}

                    {/* Trip planner stops */}
                    {isTransitMode && tripPlannerRoute && tripPlannerRoute.transitStops.map((stop, idx) => (
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
                    {isTransitMode && tripPlannerRoute && (
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

                <MapModeSwitcher activeMode={mapExperienceMode} onSelectMode={handleMapExperienceModeChange} />

                <View style={styles.settingsPillWrap}>
                    <View
                        pointerEvents={settingsExpanded ? 'none' : 'auto'}
                        style={styles.settingsCollapsedTouchAreaWrap}
                    >
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={handleSettingsToggle}
                            style={styles.settingsCollapsedTouchArea}
                        />
                    </View>

                    <Animated.View
                        style={[
                            styles.settingsCombinedPill,
                            {
                                transform: [{ translateX: settingsSlideAnim.interpolate({ inputRange: [0, 1], outputRange: [-76, 0] }) }],
                            },
                        ]}
                    >
                        <Animated.View
                            pointerEvents={settingsExpanded ? 'auto' : 'none'}
                            style={[
                                styles.settingsSupportSlot,
                                {
                                    opacity: settingsSlideAnim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' }),
                                    transform: [{ translateX: settingsSlideAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
                                },
                            ]}
                        >
                            <TouchableOpacity
                                activeOpacity={0.82}
                                disabled={!settingsExpanded}
                                onPress={handleSupportProject}
                                style={styles.settingsSlotButton}
                            >
                                <View style={styles.settingsOptionIconBadge}>
                                    <Ionicons name="heart-outline" size={20} color="#0F172A" />
                                </View>
                            </TouchableOpacity>
                        </Animated.View>

                        <TouchableOpacity
                            activeOpacity={0.82}
                            onPress={handleSettingsToggle}
                            style={styles.settingsTriggerSlot}
                            hitSlop={{ top: 14, bottom: 14, left: 16, right: 28 }}
                            pressRetentionOffset={{ top: 16, bottom: 16, left: 16, right: 30 }}
                        >
                            <Animated.View
                                style={[
                                    styles.settingsOptionLineWrap,
                                    {
                                        opacity: settingsSlideAnim.interpolate({ inputRange: [0, 0.25], outputRange: [1, 0], extrapolate: 'clamp' }),
                                    },
                                ]}
                            >
                                <View style={styles.settingsOptionLine} />
                            </Animated.View>
                            <Animated.View
                                style={[
                                    styles.settingsOptionIconWrap,
                                    {
                                        opacity: settingsSlideAnim.interpolate({ inputRange: [0.25, 0.8], outputRange: [0, 1], extrapolate: 'clamp' }),
                                    },
                                ]}
                            >
                                <View style={styles.settingsOptionIconBadge}>
                                    <Ionicons name="settings-outline" size={20} color="#0F172A" />
                                </View>
                            </Animated.View>
                        </TouchableOpacity>
                    </Animated.View>
                </View>

                <View style={styles.floatingRowWrap}>
                    <ReminderCenterButton inline opaque={!!selectedStop.selectedStop || search.searchModalVisible || favorites.favoritesVisible || !!filterPanelVisible} />
                    {isActive && location && (!userLocationVisible || isUserFollowLocked) && (
                        <TouchableOpacity
                            style={[styles.recenterFloatingButton, isUserFollowLocked && styles.recenterFloatingButtonLocked]}
                            onPress={() => {
                                if (isUserFollowLocked) {
                                    setIsUserFollowLocked(false);
                                    camera.unlockCamera();
                                    return;
                                }

                                void recenterToUserLocation();
                            }}
                            onLongPress={() => {
                                if (isUserFollowLocked) {
                                    setIsUserFollowLocked(false);
                                    camera.unlockCamera();
                                    return;
                                }

                                setIsUserFollowLocked(true);
                                void recenterToUserLocation();
                            }}
                            delayLongPress={280}
                        >
                            <View style={styles.recenterFloatingIconWrap}>
                                <Ionicons name={isUserFollowLocked ? 'locate' : 'locate-outline'} size={18} color={isUserFollowLocked ? '#1D4ED8' : '#0F172A'} />
                            </View>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Clear route buttons */}
                {isTransitMode && vehicleRoute.hasVehicleRoute && (
                    <TouchableOpacity style={styles.clearRouteButton} onPress={vehicleRoute.clearVehicleRoute}>
                        <Ionicons name="close" size={18} color="#334155" />
                    </TouchableOpacity>
                )}
                {isTransitMode && tripPlannerRoute && onClearTripRoute && (
                    <TouchableOpacity style={[styles.clearRouteButton, { top: vehicleRoute.hasVehicleRoute ? 100 : 50 }]} onPress={onClearTripRoute}>
                        <Ionicons name="close" size={18} color="#334155" />
                    </TouchableOpacity>
                )}
                {isTransitMode && !!highlightedRoute && !!onClearHighlightedRoute && !tripPlannerRoute && (
                    <TouchableOpacity style={[styles.clearRouteButton, { top: vehicleRoute.hasVehicleRoute ? 100 : 50 }]} onPress={onClearHighlightedRoute}>
                        <Ionicons name="close" size={18} color="#334155" />
                    </TouchableOpacity>
                )}
                {isParkingMode && !!focusedParkingZoneFeatureId && !!onClearFocusedParkingZone && (
                    <TouchableOpacity
                        style={styles.clearRouteButton}
                        onPress={() => {
                            camera.setRouteCameraBounds(null);
                            camera.setTripCameraBounds(null);
                            camera.unlockCamera();
                            onClearFocusedParkingZone();
                        }}
                    >
                        <Ionicons name="close" size={18} color="#334155" />
                    </TouchableOpacity>
                )}

                {/* Feature panels */}
                <SearchModal
                    visible={search.searchModalVisible}
                    query={search.locationSearchQuery}
                    loading={search.locationSearchLoading}
                    results={visibleSearchResults}
                    placeholder={isParkingMode ? 'Търси адрес или място...' : 'Търси адрес, линия или спирка...'}
                    allowSaveFavorite={!isParkingMode}
                    onChangeQuery={search.setLocationSearchQuery}
                    onClose={() => search.setSearchModalVisible(false)}
                    onSelectPlace={onSelectSearchResult}
                    onSelectLine={onSelectLineResult}
                    onSelectStop={onSelectStopResult}
                    onSaveFavorite={onSaveFavoriteFromSearch}
                />

                <FavoritesPanel
                    visible={isTransitMode && favorites.favoritesVisible}
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
                    editRequestFavoriteId={editRequestFavoriteId}
                    onEditRequestHandled={() => setEditRequestFavoriteId(null)}
                />

                {isTransitMode && filterPanelVisible && !filters.isRouteMode && (
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

                {isTransitMode && filters.isRouteMode && routing.routeGeometry && (
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
                {isTransitMode && droppedPin && !selectedStop.selectedStop && !selectedVehicle && (
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
                        onEditLocation={droppedPinMatchingFavoriteId ? () => {
                            setEditRequestFavoriteId(droppedPinMatchingFavoriteId);
                            favorites.setFavoritesVisible(true);
                        } : undefined}
                    />
                )}

                {isParkingMode && droppedPin && !selectedStop.selectedStop && !selectedVehicle && !selectedParkingLot && (
                    <DroppedPinPanel
                        pin={droppedPin}
                        onClose={() => setDroppedPin(null)}
                        primaryActionLabel="Навигирай ме"
                        onBuildRoute={() => {
                            void openExternalDrivingNavigation(droppedPin.latitude, droppedPin.longitude).then((opened) => {
                                if (opened) {
                                    setDroppedPin(null);
                                }
                            });
                        }}
                    />
                )}

                {isParkingMode && selectedParkingLot && (
                    <ParkingLotInfoPanel
                        lot={selectedParkingLot}
                        liveData={selectedLotLiveData}
                        onClose={() => setSelectedParkingLotId(null)}
                    />
                )}

                {isTransitMode && selectedStop.selectedStop && !selectedVehicle && (
                    <StopInfoPanel
                        stop={selectedStop.selectedStop}
                        etas={etasHook.etasByStopId[selectedStop.selectedStop.id] || []}
                        onClose={selectedStop.closeSelectedStop}
                        onOpenSchedule={schedule.openStopSchedule}
                    />
                )}

                {isTransitMode && selectedVehicle && (
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

                {showReportButton && isTransitMode && (
                    <View style={styles.bottomOverlay}>
                        <TouchableOpacity style={styles.reportButton} onPress={reporting.openReportModal}>
                            <Text style={styles.reportText}>{'\uD83D\uDEA8'} Сигнализирай</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <StopScheduleModal
                    stopId={isTransitMode ? schedule.scheduleStopId : null}
                    stopName={isTransitMode ? schedule.scheduleStopName : ''}
                    realtime={isTransitMode ? schedule.scheduleRealtime : []}
                    staticSchedule={isTransitMode ? schedule.scheduleStatic : []}
                    dayType={schedule.scheduleDayType}
                    loading={isTransitMode ? schedule.scheduleLoading : false}
                    onClose={schedule.closeSchedule}
                    onChangeDayType={schedule.changeDayType}
                />

                <ReportModal visible={reporting.reportModalVisible} onClose={reporting.closeReportModal} />
                <SettingsModal
                    visible={settingsVisible}
                    onClose={() => setSettingsVisible(false)}
                    parkingZonesEnabled={parkingZones.enabled}
                    parkingZonesDataReady={parkingZones.hasData}
                    parkingZoneFeatureCount={parkingZones.featureCount}
                    parkingZoneUserLabel={parkingZones.userZone?.label ?? null}
                    parkingZonePinLabel={parkingZones.droppedPinZone?.label ?? null}
                    parkingZonesGuidance={parkingZones.guidance}
                    onToggleParkingZones={parkingZones.toggleEnabled}
                />
                <SupportModal
                    visible={supportVisible}
                    onClose={() => setSupportVisible(false)}
                    onOpenSupport={handleOpenSupportLink}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    page: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    container: { height: '100%', width: '100%', backgroundColor: '#F8FAFC' },
    map: { flex: 1 },
    vehicleMarkerWrap: { alignItems: 'center', justifyContent: 'center', zIndex: 10, elevation: 10 },
    stopDotBase: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.9)', elevation: 2, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 },
    stopDotBaseSelected: { backgroundColor: '#FFFFFF', transform: [{ scale: 1.35 }], shadowOpacity: 0.18, shadowRadius: 4, zIndex: 10 },
    stopDotText: { color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' },
    stopDot: { backgroundColor: 'rgba(148,163,184,0.35)', borderRadius: 7, width: 14, height: 14 },
    stopDotSelected: { backgroundColor: '#1D4ED8', transform: [{ scale: 1.3 }] },
    stopLabelContainer: { position: 'absolute', bottom: 28, left: -60, width: 140, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center', elevation: 5, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    stopLabelText: { color: '#0F172A', fontSize: 10, fontWeight: '700', textAlign: 'center' },
    routeStopDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF', borderWidth: 2, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 2, elevation: 2 },
    routeStopDotSelected: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, transform: [{ scale: 1.15 }] },
    routeStopLabel: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginTop: 3, maxWidth: 120, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 3 },
    routeStopName: { fontSize: 9, fontWeight: '600', color: '#0F172A', textAlign: 'center' },
    vehicleRouteStopDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#059669', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 2, elevation: 2 },
    vehicleRouteStopDotSelected: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, transform: [{ scale: 1.15 }] },
    vehicleRouteStopLabel: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginTop: 3, maxWidth: 120, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 3 },
    vehicleRouteStopName: { fontSize: 9, fontWeight: '600', color: '#0F172A', textAlign: 'center' },
    vehicleRouteStopTime: { fontSize: 9, fontWeight: '700', color: '#059669', textAlign: 'center' },
    routeDirectionArrow: { fontSize: 16, fontWeight: '900', textShadowColor: 'rgba(255,255,255,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
    tripDirectionArrow: { fontSize: 16, fontWeight: '900', textShadowColor: 'rgba(255,255,255,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
    tripModeMarker: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 3, elevation: 5 },
    droppedPinDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#1D4ED8', borderWidth: 2.5, borderColor: '#FFFFFF', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 4 },
    tripStopDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFFFFF', borderWidth: 2.5, borderColor: '#2563EB', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 3 },
    tripStopDotSelected: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: '#1D4ED8', transform: [{ scale: 1.15 }] },
    tripEndpointMarker: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4, elevation: 6 },
    tripEndpointMarkerEnd: { backgroundColor: '#DC2626' },
    tripEndpointText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
    clearRouteButton: { position: 'absolute', top: 50, left: 16, backgroundColor: 'rgba(255,255,255,0.92)', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 4, zIndex: 30 },
    settingsPillWrap: {
        position: 'absolute',
        left: 0,
        bottom: 106,
        width: 94,
        height: 48,
        zIndex: 2,
        elevation: 2,
    },
    settingsCollapsedTouchAreaWrap: {
        position: 'absolute',
        left: 0,
        top: -10,
        width: 128,
        height: 68,
        zIndex: 3,
        elevation: 3,
    },
    settingsCollapsedTouchArea: {
        width: '100%',
        height: '100%',
    },
    settingsCombinedPill: {
        width: 94,
        height: 48,
        borderTopRightRadius: 24,
        borderBottomRightRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.88)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.78)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 8,
        paddingRight: 8,
        overflow: 'hidden',
    },
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
    settingsSupportSlot: {
        width: 34,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingsTriggerSlot: {
        width: 52,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingsSlotButton: {
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingsOptionLineWrap: {
        position: 'absolute',
        right: 7,
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingsOptionLine: {
        width: 3.5,
        height: 18,
        borderRadius: 2,
        backgroundColor: 'rgba(15,23,42,0.18)',
    },
    settingsOptionIconWrap: {
        position: 'absolute',
    },
    settingsOptionIconBadge: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(248,250,252,0.42)',
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
    recenterFloatingButtonLocked: {
        borderColor: 'rgba(59,130,246,0.7)',
        backgroundColor: 'rgba(239,246,255,0.96)',
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
