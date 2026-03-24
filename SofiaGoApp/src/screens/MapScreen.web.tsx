import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal, Pressable, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import L from 'leaflet';
import * as Location from 'expo-location';
import { MapContainer, Popup, TileLayer, CircleMarker, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import { fetchStopEtas, fetchVehiclesInBounds, StopEta, Vehicle } from '../services/cgmApi';
import { fetchLineRouteGeometry, fetchLineRouteGeometryByRouteId, fetchStopById, fetchStopsInBounds, LineRouteGeometry, MapBounds, Stop, summarizeStopDirections } from '../services/stopsApi';
import { addFavoritePlace, FavoritePlace, loadFavoritePlaces, PlaceSearchResult, removeFavoritePlace, searchLocations, updateFavoritePlace, updateFavoritePlaceName } from '../services/places';
import 'leaflet/dist/leaflet.css';
import { VehicleType, formatUnixTime, getVehicleAccentColor, getVehicleIcon, getVehicleTypeLabel, inferLineTypeFromToken, VEHICLE_TYPE_ORDER } from '../services/transitUtils';
import { RouteSelection } from '../types/routes';
import { FavoritesPanel } from '../features/favorites/components/FavoritesPanel';

type LatLngTuple = [number, number];

const VEHICLE_REFRESH_MS = 1500;
const STOP_ETA_REFRESH_MS = 15000;
const INITIAL_ZOOM_LEVEL = 16;
const VEHICLE_ANIMATION_MS = 450;

const WebMapContainer = MapContainer as any;
const WebTileLayer = TileLayer as any;
const WebCircleMarker = CircleMarker as any;
const WebPopup = Popup as any;
const WebMarker = Marker as any;
const WebPolyline = Polyline as any;

const DEFAULT_CENTER: LatLngTuple = [42.6977, 23.3219];
const DEFAULT_BOUNDS_DELTA = 0.03;
const STOP_ETA_PREVIEW_COUNT = 3;
const MAX_HEADING_STEP_DEGREES = 32;
const LOW_SPEED_HEADING_LOCK_KPH = 4;
const OVERLAP_GROUP_DECIMALS = 4;
const OVERLAP_OFFSET_DEGREES = 0.00008;
const MAX_RENDERED_STOPS = 40;

const createFallbackBounds = (latitude: number, longitude: number): MapBounds => ({
    north: latitude + DEFAULT_BOUNDS_DELTA,
    south: latitude - DEFAULT_BOUNDS_DELTA,
    east: longitude + DEFAULT_BOUNDS_DELTA,
    west: longitude - DEFAULT_BOUNDS_DELTA,
});

function ViewportTracker({
    onViewportChanged,
    onMapLongPress,
}: {
    onViewportChanged: (center: LatLngTuple, bounds: MapBounds) => void;
    onMapLongPress: (latitude: number, longitude: number) => void;
}) {
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearLongPressTimer = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    useMapEvents({
        moveend: (event: any) => {
            const center = event.target.getCenter();
            const bounds = event.target.getBounds();
            onViewportChanged(
                [center.lat, center.lng],
                {
                    north: bounds.getNorth(),
                    south: bounds.getSouth(),
                    east: bounds.getEast(),
                    west: bounds.getWest(),
                }
            );
        },
        zoomend: (event: any) => {
            const center = event.target.getCenter();
            const bounds = event.target.getBounds();
            onViewportChanged(
                [center.lat, center.lng],
                {
                    north: bounds.getNorth(),
                    south: bounds.getSouth(),
                    east: bounds.getEast(),
                    west: bounds.getWest(),
                }
            );
        },
        mousedown: (event: any) => {
            clearLongPressTimer();
            longPressTimerRef.current = setTimeout(() => {
                onMapLongPress(event.latlng?.lat, event.latlng?.lng);
            }, 650);
        },
        touchstart: (event: any) => {
            clearLongPressTimer();
            longPressTimerRef.current = setTimeout(() => {
                onMapLongPress(event.latlng?.lat, event.latlng?.lng);
            }, 650);
        },
        mouseup: clearLongPressTimer,
        touchend: clearLongPressTimer,
        dragstart: clearLongPressTimer,
        zoomstart: clearLongPressTimer,
    } as any);

    useEffect(() => clearLongPressTimer, []);

    return null;
}

function RecenterMap({
    center,
    zoom,
    enabled,
    onApplied,
}: {
    center: LatLngTuple;
    zoom: number;
    enabled: boolean;
    onApplied: () => void;
}) {
    const map = useMap();

    useEffect(() => {
        if (!enabled) {
            return;
        }

        map.setView(center, zoom, { animate: true });
        onApplied();
    }, [center, zoom, enabled, map, onApplied]);

    return null;
}

function FitRouteBounds({ routeGeometry }: { routeGeometry: LineRouteGeometry | null }) {
    const map = useMap();

    useEffect(() => {
        if (!routeGeometry) {
            return;
        }

        const allPoints = routeGeometry.directions.flatMap((direction) =>
            direction.coordinates.map((coord) => [coord[1], coord[0]] as [number, number])
        );

        if (allPoints.length < 2) {
            return;
        }

        map.fitBounds(allPoints, { padding: [40, 40] });
    }, [map, routeGeometry]);

    return null;
}

const getVehicleSvgIcon = (type: VehicleType) => {
    if (type === 'bus') {
        return '<svg width="38" height="38" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="16" width="56" height="28" rx="6" fill="#FF525D"/><rect x="10" y="22" width="44" height="10" rx="2" fill="#1F1B24"/><rect x="12" y="24" width="9" height="6" fill="#58A9C2"/><rect x="23" y="24" width="9" height="6" fill="#84BAD1"/><rect x="34" y="24" width="9" height="6" fill="#58A9C2"/><rect x="25" y="32" width="14" height="12" fill="#E33441"/><circle cx="20" cy="45" r="6" fill="#2F2D33"/><circle cx="44" cy="45" r="6" fill="#2F2D33"/><circle cx="20" cy="45" r="2" fill="#E8EDF4"/><circle cx="44" cy="45" r="2" fill="#E8EDF4"/></svg>';
    }

    if (type === 'tram') {
        return '<svg width="38" height="38" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="20" width="56" height="24" rx="3" fill="#F97316"/><rect x="8" y="24" width="40" height="10" rx="2" fill="#131218"/><rect x="10" y="25" width="9" height="7" fill="#B7C4D8"/><rect x="21" y="25" width="9" height="7" fill="#B7C4D8"/><rect x="32" y="25" width="9" height="7" fill="#B7C4D8"/><rect x="26" y="34" width="12" height="10" fill="#FED7AA"/><rect x="28" y="14" width="8" height="4" fill="#9A3412"/><circle cx="20" cy="46" r="6" fill="#34313C"/><circle cx="44" cy="46" r="6" fill="#34313C"/><circle cx="20" cy="46" r="2" fill="#E8EDF4"/><circle cx="44" cy="46" r="2" fill="#E8EDF4"/></svg>';
    }

    if (type === 'trolley') {
        return '<svg width="38" height="38" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="20" width="56" height="22" rx="3" fill="#2563EB"/><rect x="4" y="18" width="56" height="4" fill="#1D4ED8"/><rect x="6" y="24" width="52" height="10" fill="#93C5FD"/><rect x="12" y="24" width="2" height="10" fill="#1E40AF"/><rect x="24" y="24" width="2" height="10" fill="#1E40AF"/><rect x="36" y="24" width="2" height="10" fill="#1E40AF"/><rect x="48" y="24" width="2" height="10" fill="#1E40AF"/><path d="M32 8L25 12L32 16L39 12L32 8Z" stroke="#6E656B" stroke-width="2" fill="none"/><rect x="30" y="16" width="4" height="4" fill="#2563EB"/><circle cx="20" cy="46" r="5" fill="#5D5A63"/><circle cx="32" cy="46" r="5" fill="#5D5A63"/><circle cx="44" cy="46" r="5" fill="#5D5A63"/></svg>';
    }

    if (type === 'subway') {
        return '<svg width="38" height="38" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="20" width="52" height="24" rx="4" fill="#D67A80"/><rect x="10" y="24" width="44" height="10" rx="2" fill="#121218"/><rect x="12" y="25" width="8" height="7" fill="#B6C3D7"/><rect x="22" y="25" width="8" height="7" fill="#B6C3D7"/><rect x="32" y="25" width="8" height="7" fill="#B6C3D7"/><rect x="42" y="25" width="12" height="7" fill="#B6C3D7"/><rect x="27" y="34" width="10" height="10" fill="#C3CFDF"/><circle cx="20" cy="46" r="6" fill="#33313D"/><circle cx="44" cy="46" r="6" fill="#33313D"/><circle cx="20" cy="46" r="2" fill="#E8EDF4"/><circle cx="44" cy="46" r="2" fill="#E8EDF4"/></svg>';
    }

    return '<svg width="38" height="38" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="20" width="52" height="24" rx="4" fill="#D67A80"/><rect x="10" y="24" width="44" height="10" rx="2" fill="#121218"/><rect x="12" y="25" width="8" height="7" fill="#B6C3D7"/><rect x="22" y="25" width="8" height="7" fill="#B6C3D7"/><rect x="32" y="25" width="8" height="7" fill="#B6C3D7"/><rect x="42" y="25" width="12" height="7" fill="#B6C3D7"/><rect x="27" y="34" width="10" height="10" fill="#C3CFDF"/><circle cx="20" cy="46" r="6" fill="#33313D"/><circle cx="44" cy="46" r="6" fill="#33313D"/><circle cx="20" cy="46" r="2" fill="#E8EDF4"/><circle cx="44" cy="46" r="2" fill="#E8EDF4"/></svg>';
};

const createVehicleMarkerIcon = (vehicle: Vehicle) => L.divIcon({
    className: 'sofiago-vehicle-marker',
    html: `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:78px;height:80px;">
            <div style="margin-bottom:2px;color:#111827;font-size:15px;font-weight:900;line-height:15px;text-shadow:-1px -1px 0 rgba(255,255,255,0.96), 1px -1px 0 rgba(255,255,255,0.96), -1px 1px 0 rgba(255,255,255,0.96), 1px 1px 0 rgba(255,255,255,0.96);">${vehicle.line}</div>
            <div style="transform:rotate(${(vehicle.headingDegrees || 0) - 90}deg);transform-origin:center center;display:flex;align-items:center;justify-content:center;width:56px;height:56px;filter:drop-shadow(0 2px 6px rgba(17,24,39,0.45));">
                <div style="position:relative;display:flex;align-items:center;justify-content:center;">
                    ${getVehicleSvgIcon(vehicle.type)}
                </div>
            </div>
        </div>
    `,
    iconSize: [78, 80],
    iconAnchor: [39, 40],
});

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

const createStopMarkerIcon = (stop: Stop) => L.divIcon({
    className: 'sofiago-stop-marker',
    html: `
        <div title="${stop.name} | ${summarizeStopDirections(stop, 1).replace('Посока: ', '')}" style="display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:12px;background:transparent;">
            <div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:7px;border:2px solid #2563EB;background:#FFFFFF;box-shadow:0 2px 8px rgba(37,99,235,0.34);font-size:16px;line-height:16px;">🚏</div>
        </div>
    `,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
});

const createRouteStopMarkerIcon = (name: string, index: number, accentColor: string) => L.divIcon({
    className: 'sofiago-route-stop-marker',
    html: `
        <div title="${name}" style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:13px;border:2.5px solid ${accentColor};background:${accentColor};box-shadow:0 2px 8px rgba(17,24,39,0.28);font-size:11px;font-weight:700;line-height:11px;color:#FFFFFF;">
            ${index + 1}
        </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
});

const getDirectionAccentColor = (directionIndex: number) => {
    return directionIndex % 2 === 0 ? '#1D4ED8' : '#F97316';
};

const computeHeadingDegrees = (from: [number, number], to: [number, number]) => {
    const deltaLon = to[0] - from[0];
    const deltaLat = to[1] - from[1];
    const radians = Math.atan2(deltaLon, deltaLat);
    return (radians * 180) / Math.PI;
};

const getDirectionArrowSamples = (coordinates: [number, number][], maxArrows = 14) => {
    if (coordinates.length < 3) {
        return [] as Array<{ position: LatLngTuple; headingDegrees: number }>;
    }

    const segmentCount = coordinates.length - 1;
    const step = Math.max(1, Math.floor(segmentCount / maxArrows));
    const samples: Array<{ position: LatLngTuple; headingDegrees: number }> = [];

    for (let i = step; i < segmentCount; i += step) {
        const from = coordinates[i - 1];
        const to = coordinates[i];
        samples.push({
            position: [to[1], to[0]],
            headingDegrees: computeHeadingDegrees(from, to),
        });
    }

    return samples;
};

const createDirectionArrowIcon = (accentColor: string, headingDegrees: number) => L.divIcon({
    className: 'sofiago-direction-arrow',
    html: `
        <div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;transform:rotate(${headingDegrees}deg);">
            <div style="font-size:18px;line-height:18px;color:${accentColor};font-weight:900;text-shadow:-1px -1px 0 rgba(255,255,255,0.95), 1px -1px 0 rgba(255,255,255,0.95), -1px 1px 0 rgba(255,255,255,0.95), 1px 1px 0 rgba(255,255,255,0.95);">▲</div>
        </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
});

const createSavedPinIcon = () => L.divIcon({
    className: 'sofiago-saved-pin',
    html: `
        <div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:17px;background:#FFFFFF;border:2px solid #DC2626;box-shadow:0 2px 8px rgba(220,38,38,0.35);font-size:18px;line-height:18px;">📍</div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 30],
});

interface MapScreenProps {
    highlightedRoute?: RouteSelection | null;
    filterPanelVisible?: boolean;
    searchRequestToken?: number;
    favoritesRequestToken?: number;
    dismissTransientPanelsToken?: number;
    onBuildRouteFromCoordinate?: (dstLat: number, dstLon: number, curLat?: number, curLon?: number) => void;
}

export default function MapScreen({
    highlightedRoute,
    filterPanelVisible = true,
    searchRequestToken,
    favoritesRequestToken,
    dismissTransientPanelsToken,
    onBuildRouteFromCoordinate,
}: MapScreenProps) {
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [animatedVehicles, setAnimatedVehicles] = useState<Vehicle[]>([]);
    const [stops, setStops] = useState<Stop[]>([]);
    const [reportModalVisible, setReportModalVisible] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [selectedVehicleTypes, setSelectedVehicleTypes] = useState<VehicleType[]>([]);
    const [selectedLines, setSelectedLines] = useState<string[]>([]);
    const [etasByStopId, setEtasByStopId] = useState<Record<string, StopEta[]>>({});
    const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
    const [mapCenter, setMapCenter] = useState<LatLngTuple>(DEFAULT_CENTER);
    const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
    const [applyInitialRecenter, setApplyInitialRecenter] = useState(false);
    const [routeGeometry, setRouteGeometry] = useState<LineRouteGeometry | null>(null);
    const [routeStopSearch, setRouteStopSearch] = useState('');
    const [locationSearchQuery, setLocationSearchQuery] = useState('');
    const [locationSearchResults, setLocationSearchResults] = useState<PlaceSearchResult[]>([]);
    const [locationSearchLoading, setLocationSearchLoading] = useState(false);
    const [favoritePlaces, setFavoritePlaces] = useState<FavoritePlace[]>([]);
    const [favoritesVisible, setFavoritesVisible] = useState(false);
    const [searchModalVisible, setSearchModalVisible] = useState(false);
    const [pendingFavoritePoint, setPendingFavoritePoint] = useState<{ latitude: number; longitude: number } | null>(null);
    const [pendingFavoriteName, setPendingFavoriteName] = useState('');
    const [savedPinCoordinate, setSavedPinCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
    const [userLocationVisible, setUserLocationVisible] = useState(true);
    const [editingFavoriteId, setEditingFavoriteId] = useState<string | null>(null);
    const [editingFavoriteName, setEditingFavoriteName] = useState('');
    const lastHeadingByVehicleRef = useRef<Record<string, number>>({});
    const animatedVehiclesRef = useRef<Vehicle[]>([]);
    const vehicleAnimationFrameRef = useRef<number | null>(null);
    const isRouteMode = !!highlightedRoute;
    const visibleStopsRef = useRef<Stop[]>([]);
    const routeAccentColor = useMemo(() => {
        if (highlightedRoute) {
            return getVehicleAccentColor(highlightedRoute.type);
        }

        if (routeGeometry) {
            return getVehicleAccentColor(routeGeometry.type);
        }

        return '#1D4ED8';
    }, [highlightedRoute, routeGeometry]);

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
    const renderedDisplayVehicles = useMemo(() => {
        const idCounts = new Map<string, number>();
        return displayVehicles.map((vehicle) => {
            const seen = idCounts.get(vehicle.id) || 0;
            const nextSeen = seen + 1;
            idCounts.set(vehicle.id, nextSeen);
            const uniqueSuffix = nextSeen === 1 ? '' : `-${nextSeen}`;

            return {
                ...vehicle,
                renderKey: `${vehicle.id}${uniqueSuffix}`,
            };
        });
    }, [displayVehicles]);
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
        if (isRouteMode || filteredStops.length <= MAX_RENDERED_STOPS) {
            return filteredStops;
        }

        const [centerLatitude, centerLongitude] = mapCenter;
        return filteredStops
            .slice()
            .sort((left, right) => {
                const leftDeltaLat = left.latitude - centerLatitude;
                const leftDeltaLon = left.longitude - centerLongitude;
                const rightDeltaLat = right.latitude - centerLatitude;
                const rightDeltaLon = right.longitude - centerLongitude;
                const leftDistanceScore = (leftDeltaLat * leftDeltaLat) + (leftDeltaLon * leftDeltaLon);
                const rightDistanceScore = (rightDeltaLat * rightDeltaLat) + (rightDeltaLon * rightDeltaLon);
                return leftDistanceScore - rightDistanceScore;
            })
            .slice(0, MAX_RENDERED_STOPS);
    }, [filteredStops, isRouteMode, mapCenter]);
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

    const openPopupFromEvent = (event: any) => {
        event?.originalEvent?.preventDefault?.();
        event?.originalEvent?.stopPropagation?.();
        event?.target?.openPopup?.();
    };

    useEffect(() => {
        let isMounted = true;
        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === 'granted') {
                    const loc = await Location.getCurrentPositionAsync({});
                    setLocation(loc);
                    if (isMounted) {
                        const initialCenter: LatLngTuple = [loc.coords.latitude, loc.coords.longitude];
                        setMapCenter(initialCenter);
                        setMapBounds(createFallbackBounds(loc.coords.latitude, loc.coords.longitude));
                        if (!highlightedRoute) {
                            setApplyInitialRecenter(true);
                        }
                        return;
                    }
                }
            } catch (err) {
                console.warn('Location unavailable, using default center:', err);
            }

            if (isMounted) {
                setMapBounds(createFallbackBounds(DEFAULT_CENTER[0], DEFAULT_CENTER[1]));
                if (!highlightedRoute) {
                    setApplyInitialRecenter(true);
                }
            }
        })();

        return () => {
            isMounted = false;
        };
    }, []);

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
                    fetchStopEtas(visibleStops.slice(0, MAX_RENDERED_STOPS).map((stop) => stop.id)),
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
                const etasByStop = await fetchStopEtas(
                    visibleStopsRef.current.slice(0, MAX_RENDERED_STOPS).map((stop) => stop.id)
                );
                if (!isMounted) {
                    return;
                }

                setEtasByStopId(etasByStop);
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
        })();

        return () => {
            isMounted = false;
        };
    }, [highlightedRoute]);

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

            const nextCenter: LatLngTuple = [nextLocation.coords.latitude, nextLocation.coords.longitude];
            setMapCenter(nextCenter);
            setMapBounds(createFallbackBounds(nextLocation.coords.latitude, nextLocation.coords.longitude));
            setApplyInitialRecenter(true);
            setUserLocationVisible(true);
        } catch (error) {
            console.warn('Failed to recenter to user location:', error);
        }
    };

    const focusMapOnCoordinate = (latitude: number, longitude: number) => {
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return;
        }

        setMapCenter([latitude, longitude]);
        setMapBounds(createFallbackBounds(latitude, longitude));
        setApplyInitialRecenter(true);
    };

    const saveFavorite = async (name: string, latitude: number, longitude: number) => {
        const nextFavorites = await addFavoritePlace({ name, latitude, longitude });
        setFavoritePlaces(nextFavorites);
    };

    const onSelectSearchResult = (result: PlaceSearchResult) => {
        focusMapOnCoordinate(result.latitude, result.longitude);
        setLocationSearchQuery(result.name);
        setLocationSearchResults([]);
        setSavedPinCoordinate({ latitude: result.latitude, longitude: result.longitude });
    };

    const onRemoveFavorite = async (favoriteId: string) => {
        const nextFavorites = await removeFavoritePlace(favoriteId);
        setFavoritePlaces(nextFavorites);
    };

    const onMapLongPress = (latitude: number, longitude: number) => {
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return;
        }

        setSavedPinCoordinate({ latitude, longitude });
        setPendingFavoritePoint({ latitude, longitude });
        setPendingFavoriteName(`Запазена точка ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        setSearchModalVisible(true);
    };

    const onSavePendingFavorite = async () => {
        if (!pendingFavoritePoint) {
            return;
        }

        await saveFavorite(pendingFavoriteName, pendingFavoritePoint.latitude, pendingFavoritePoint.longitude);
        setPendingFavoritePoint(null);
        setPendingFavoriteName('');
    };

    const onStartRenameFavorite = (favorite: FavoritePlace) => {
        setEditingFavoriteId(favorite.id);
        setEditingFavoriteName(favorite.name);
    };

    const onCancelRenameFavorite = () => {
        setEditingFavoriteId(null);
        setEditingFavoriteName('');
    };

    const onConfirmRenameFavorite = async () => {
        if (!editingFavoriteId) {
            return;
        }

        const nextFavorites = await updateFavoritePlaceName(editingFavoriteId, editingFavoriteName);
        setFavoritePlaces(nextFavorites);
        onCancelRenameFavorite();
    };

    const onUpdateFavorite = async (
        favoriteId: string,
        updates: {
            name?: string;
            latitude: number | null;
            longitude: number | null;
            selectedStopId: string | null;
            selectedStopName: string | null;
            selectedLines: FavoritePlace['selectedLines'];
        },
    ) => {
        const nextFavorites = await updateFavoritePlace(favoriteId, updates);
        setFavoritePlaces(nextFavorites);
    };

    const renderStopEtaSummary = (stopId: string, textStyle: any = styles.popupSecondary, maxItems?: number) => {
        const stopEtas = etasByStopId[stopId] || [];
        if (!stopEtas.length) {
            return <Text style={textStyle}>Няма налични ETA в момента</Text>;
        }

        const visibleEtas = typeof maxItems === 'number' ? stopEtas.slice(0, maxItems) : stopEtas;

        return visibleEtas.map((eta) => (
            <Text key={`${eta.tripId}-${eta.stopId}-${eta.arrivalTimestamp}`} style={textStyle}>
                {`${getVehicleIcon(eta.type)} ${eta.destination ? `${eta.line} → ${eta.destination}` : eta.line} • ${eta.minutesAway} мин • ${formatUnixTime(eta.arrivalTimestamp)}`}
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
            const destination = lineEtas.find((eta) => eta.destination)?.destination;

            return (
                <View key={`${stop.id}-${line}`} style={styles.stopLineBoardRow}>
                    <Text style={styles.stopLineBoardLine}>{destination ? `${line} → ${destination}` : line}</Text>
                    <Text style={styles.stopLineBoardEta}>
                        {lineEtas.length
                            ? lineEtas.map((eta) => `${eta.minutesAway} мин (${formatUnixTime(eta.arrivalTimestamp)})`).join(' · ')
                            : 'Няма live ETA в момента'}
                    </Text>
                </View>
            );
        });
    };

    return (
        <View style={styles.page}>
            <View style={styles.container}>
                <WebMapContainer center={mapCenter} zoom={INITIAL_ZOOM_LEVEL} style={styles.webMap} zoomControl={false} attributionControl={false}>
                    <RecenterMap
                        center={mapCenter}
                        zoom={INITIAL_ZOOM_LEVEL}
                        enabled={applyInitialRecenter}
                        onApplied={() => setApplyInitialRecenter(false)}
                    />
                    <ViewportTracker
                        onViewportChanged={(center, bounds) => {
                            void center;
                            setMapBounds(bounds);
                            if (location) {
                                setUserLocationVisible(
                                    location.coords.latitude <= bounds.north &&
                                    location.coords.latitude >= bounds.south &&
                                    location.coords.longitude <= bounds.east &&
                                    location.coords.longitude >= bounds.west
                                );
                            }
                        }}
                        onMapLongPress={onMapLongPress}
                    />
                    <FitRouteBounds routeGeometry={routeGeometry} />
                    <WebTileLayer
                        attribution='&copy; OpenStreetMap contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {location && (
                        <WebCircleMarker
                            center={[location.coords.latitude, location.coords.longitude]}
                            radius={10}
                            pathOptions={{ color: '#007AFF', fillColor: '#007AFF' }}
                        >
                            <WebPopup>Вашата локация</WebPopup>
                        </WebCircleMarker>
                    )}

                    {savedPinCoordinate && (
                        <WebMarker
                            position={[savedPinCoordinate.latitude, savedPinCoordinate.longitude]}
                            icon={createSavedPinIcon()}
                            zIndexOffset={2000}
                        >
                            <WebPopup>
                                <Text>Запазена/избрана точка</Text>
                            </WebPopup>
                        </WebMarker>
                    )}

                    {!routeGeometry && renderedStops.map((stop) => (
                        <WebMarker
                            key={stop.id}
                            position={[stop.latitude, stop.longitude]}
                            icon={createStopMarkerIcon(stop)}
                            zIndexOffset={700}
                            eventHandlers={{
                                click: (event: any) => {
                                    openStopPopupOnly(stop);
                                    openPopupFromEvent(event);
                                },
                                mousedown: (event: any) => {
                                    openStopPopupOnly(stop);
                                    openPopupFromEvent(event);
                                },
                                touchstart: (event: any) => {
                                    openStopPopupOnly(stop);
                                    openPopupFromEvent(event);
                                },
                            }}
                        >
                            <WebPopup>
                                <View style={styles.popupCard}>
                                    <Text style={styles.popupTitle}>{stop.name}</Text>
                                    <Text style={styles.popupSecondary}>{`Спирка: ${stop.id}`}</Text>
                                    <Text style={styles.popupSecondary}>{`Линии: ${stop.lines.slice(0, 8).join(', ') || 'н/д'}`}</Text>
                                    {renderStopEtaSummary(stop.id, styles.popupSecondary, STOP_ETA_PREVIEW_COUNT)}
                                </View>
                            </WebPopup>
                        </WebMarker>
                    ))}

                    {renderedDisplayVehicles.map((vehicle) => (
                        <WebMarker
                            key={vehicle.renderKey}
                            position={[vehicle.latitude, vehicle.longitude]}
                            icon={createVehicleMarkerIcon(vehicle)}
                            zIndexOffset={1500}
                            eventHandlers={{
                                click: (event: any) => {
                                    openPopupFromEvent(event);
                                },
                                mousedown: (event: any) => {
                                    openPopupFromEvent(event);
                                },
                                touchstart: (event: any) => {
                                    openPopupFromEvent(event);
                                },
                            }}
                        >
                            <WebPopup>
                                <View style={styles.popupCard}>
                                    <Text style={styles.popupTitle}>{`${getVehicleIcon(vehicle.type)} Линия ${vehicle.line}`}</Text>
                                    <Text style={styles.popupSecondary}>{`Vehicle ID: ${vehicle.id}`}</Text>
                                    <Text style={styles.popupSecondary}>{`Последен update: ${formatUnixTime(vehicle.lastUpdatedUnix)}`}</Text>
                                    <Text style={styles.popupSecondary}>{`Скорост: ${Number.isFinite(vehicle.speedKph) ? Math.round(vehicle.speedKph as number) : 'н/д'} км/ч`}</Text>
                                    <Text style={styles.popupSecondary}>{`Спирка: ${vehicle.stopId ? (stopNameById[vehicle.stopId] || vehicle.stopId) : 'н/д'}`}</Text>
                                </View>
                            </WebPopup>
                        </WebMarker>
                    ))}

                    {routeGeometry?.directions.map((direction, index) => (
                        <WebPolyline
                            key={`route-${routeGeometry.line}-${index}`}
                            positions={direction.coordinates.map((coord) => [coord[1], coord[0]])}
                            pathOptions={{
                                color: getDirectionAccentColor(index),
                                weight: 5,
                                opacity: 0.9,
                            }}
                        />
                    ))}

                    {routeGeometry?.directions.map((direction, dirIndex) =>
                        getDirectionArrowSamples(direction.coordinates).map((arrow, arrowIndex) => (
                            <WebMarker
                                key={`dir-arrow-${dirIndex}-${arrowIndex}`}
                                position={arrow.position}
                                icon={createDirectionArrowIcon(getDirectionAccentColor(dirIndex), arrow.headingDegrees)}
                            />
                        ))
                    )}

                    {routeGeometry?.directions.map((direction, dirIndex) =>
                        direction.stops.map((stop, stopIndex) => (
                            <WebMarker
                                key={`rstop-${dirIndex}-${stop.id}-${stopIndex}`}
                                position={[stop.latitude, stop.longitude]}
                                icon={createRouteStopMarkerIcon(stop.name, stopIndex, getDirectionAccentColor(dirIndex))}
                                eventHandlers={{
                                    click: (event: any) => {
                                        openRouteStopPopupOnly(stop.id);
                                        openPopupFromEvent(event);
                                    },
                                    mousedown: (event: any) => {
                                        openRouteStopPopupOnly(stop.id);
                                        openPopupFromEvent(event);
                                    },
                                    touchstart: (event: any) => {
                                        openRouteStopPopupOnly(stop.id);
                                        openPopupFromEvent(event);
                                    },
                                }}
                            >
                                <WebPopup>
                                    <View style={styles.popupCard}>
                                        <Text style={styles.popupTitle}>{`${stopIndex + 1}. ${stop.name}`}</Text>
                                        <Text style={styles.popupSecondary}>{`Спирка ID: ${stop.id}`}</Text>
                                        <Text style={styles.popupSecondary}>{`Линия: ${routeGeometry?.line || highlightedRoute?.line || 'н/д'}`}</Text>
                                        <Text style={styles.popupSecondary}>{`Посока: ${direction.name || `Посока ${dirIndex + 1}`}`}</Text>
                                        {renderStopEtaSummary(stop.id, styles.popupSecondary, STOP_ETA_PREVIEW_COUNT)}
                                    </View>
                                </WebPopup>
                            </WebMarker>
                        ))
                    )}
                </WebMapContainer>

                <FavoritesPanel
                    visible={favoritesVisible}
                    places={favoritePlaces}
                    searchableStops={stops}
                    currentPin={savedPinCoordinate}
                    currentLocation={location ? { latitude: location.coords.latitude, longitude: location.coords.longitude } : null}
                    onOpenCentralPlanner={(favorite) => {
                        if (!Number.isFinite(favorite.latitude) || !Number.isFinite(favorite.longitude)) {
                            return;
                        }
                        onBuildRouteFromCoordinate?.(
                            favorite.latitude,
                            favorite.longitude,
                            location?.coords.latitude,
                            location?.coords.longitude,
                        );
                        setFavoritesVisible(false);
                    }}
                    onSelect={(favorite) => {
                        if (!Number.isFinite(favorite.latitude) || !Number.isFinite(favorite.longitude)) {
                            return;
                        }

                        focusMapOnCoordinate(favorite.latitude, favorite.longitude);
                        setSavedPinCoordinate({ latitude: favorite.latitude, longitude: favorite.longitude });
                        setFavoritesVisible(false);
                    }}
                    onUpdate={onUpdateFavorite}
                    onRemove={onRemoveFavorite}
                    onClose={() => setFavoritesVisible(false)}
                />

                <Modal
                    animationType="fade"
                    transparent
                    visible={searchModalVisible}
                    onRequestClose={() => setSearchModalVisible(false)}
                >
                    <View style={styles.searchModalOverlay}>
                        <View style={styles.searchModalCard}>
                            <View style={styles.searchModalHeader}>
                                <Text style={styles.searchModalTitle}>Търсене и любими места</Text>
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

                            {pendingFavoritePoint && (
                                <View style={styles.pendingFavoriteBox}>
                                    <Text style={styles.pendingFavoriteTitle}>Запази pin от картата</Text>
                                    <TextInput
                                        style={styles.pendingFavoriteInput}
                                        value={pendingFavoriteName}
                                        onChangeText={setPendingFavoriteName}
                                        placeholder="Име на мястото"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                    <Text style={styles.pendingFavoriteCoords}>{`${pendingFavoritePoint.latitude.toFixed(5)}, ${pendingFavoritePoint.longitude.toFixed(5)}`}</Text>
                                    <View style={styles.pendingFavoriteActions}>
                                        <TouchableOpacity style={styles.pendingFavoriteSave} onPress={() => { void onSavePendingFavorite(); }}>
                                            <Text style={styles.pendingFavoriteSaveText}>Запази</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.pendingFavoriteCancel} onPress={() => setPendingFavoritePoint(null)}>
                                            <Text style={styles.pendingFavoriteCancelText}>Откажи</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}

                            <Text style={styles.favoritesPanelTitle}>Любими места</Text>
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
                                                setSavedPinCoordinate({ latitude: favorite.latitude, longitude: favorite.longitude });
                                            }}
                                        >
                                            {editingFavoriteId === favorite.id ? (
                                                <TextInput
                                                    style={styles.favoriteRenameInput}
                                                    value={editingFavoriteName}
                                                    onChangeText={setEditingFavoriteName}
                                                    placeholder="Ново име"
                                                    placeholderTextColor="#9CA3AF"
                                                />
                                            ) : (
                                                <Text style={styles.favoriteRowName} numberOfLines={1}>{favorite.name}</Text>
                                            )}
                                            <Text style={styles.favoriteRowCoords} numberOfLines={1}>{`${favorite.latitude.toFixed(5)}, ${favorite.longitude.toFixed(5)}`}</Text>
                                        </TouchableOpacity>

                                        {editingFavoriteId === favorite.id ? (
                                            <View style={styles.favoriteEditActions}>
                                                <TouchableOpacity style={styles.favoriteEditSave} onPress={() => { void onConfirmRenameFavorite(); }}>
                                                    <Text style={styles.favoriteEditSaveText}>✓</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity style={styles.favoriteEditCancel} onPress={onCancelRenameFavorite}>
                                                    <Text style={styles.favoriteEditCancelText}>✕</Text>
                                                </TouchableOpacity>
                                            </View>
                                        ) : (
                                            <View style={styles.favoriteEditActions}>
                                                <TouchableOpacity
                                                    style={styles.favoriteRenameButton}
                                                    onPress={() => onStartRenameFavorite(favorite)}
                                                >
                                                    <Text style={styles.favoriteRenameButtonText}>✎</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={styles.favoriteRemoveButton}
                                                    onPress={() => { void onRemoveFavorite(favorite.id); }}
                                                >
                                                    <Text style={styles.favoriteRemoveButtonText}>✕</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

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
                    <Text style={styles.filterHint}>{`Видими спирки: ${renderedStops.length}/${filteredStops.length}`}</Text>
                    <View style={styles.nearbyStopsList}>
                        {filteredStops.slice(0, 6).map((stop) => (
                            <TouchableOpacity
                                key={stop.id}
                                style={styles.nearbyStopButton}
                                onPress={() => { void openStopDetails(stop); }}
                            >
                                <Text style={styles.nearbyStopButtonText} numberOfLines={1}>{stop.name}</Text>
                                <Text style={styles.nearbyStopDirectionText} numberOfLines={2}>{`Линии: ${stop.lines.slice(0, 5).join(', ')}${stop.lines.length > 5 ? '...' : ''}`}</Text>
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

                {location && !userLocationVisible && (
                    <TouchableOpacity style={styles.locationButton} onPress={() => { void recenterToUserLocation(); }}>
                        <Ionicons name="locate" size={24} color="#0F172A" />
                    </TouchableOpacity>
                )}

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
    webMap: {
        height: '100%',
        width: '100%',
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
        zIndex: 1000,
        elevation: 20,
    },
    filtersPanelContent: {
        paddingBottom: 8,
    },
    quickFavoritesPanel: {
        position: 'absolute',
        right: 70,
        top: 96,
        width: 290,
        maxHeight: 270,
        backgroundColor: 'rgba(255,255,255,0.97)',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        padding: 10,
        zIndex: 1090,
    },
    quickFavoritesTitle: {
        color: '#111827',
        fontSize: 14,
        fontWeight: '700',
    },
    quickFavoritesHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    quickFavoritesCloseButton: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F3F4F6',
    },
    quickFavoritesCloseButtonText: {
        color: '#374151',
        fontSize: 13,
        fontWeight: '700',
    },
    quickFavoritesList: {
        maxHeight: 220,
    },
    quickFavoriteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        backgroundColor: '#F9FAFB',
        borderRadius: 10,
        padding: 8,
    },
    quickFavoriteMain: {
        flex: 1,
    },
    searchModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(17,24,39,0.35)',
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingTop: 24,
        paddingHorizontal: 14,
    },
    searchModalCard: {
        width: '100%',
        maxWidth: 720,
        maxHeight: '86%',
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
    pendingFavoriteBox: {
        marginTop: 8,
        marginBottom: 8,
        backgroundColor: '#EFF6FF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#BFDBFE',
        padding: 10,
    },
    pendingFavoriteTitle: {
        color: '#1E3A8A',
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 6,
    },
    pendingFavoriteInput: {
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#D1D5DB',
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 13,
        color: '#111827',
    },
    pendingFavoriteCoords: {
        marginTop: 6,
        color: '#4B5563',
        fontSize: 12,
    },
    pendingFavoriteActions: {
        marginTop: 8,
        flexDirection: 'row',
        gap: 8,
    },
    pendingFavoriteSave: {
        backgroundColor: '#1D4ED8',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    pendingFavoriteSaveText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    pendingFavoriteCancel: {
        backgroundColor: '#E5E7EB',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    pendingFavoriteCancelText: {
        color: '#374151',
        fontSize: 12,
        fontWeight: '700',
    },
    favoriteRenameInput: {
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#CBD5E1',
        color: '#0F172A',
        fontSize: 12,
        paddingHorizontal: 8,
        paddingVertical: 6,
    },
    favoriteEditActions: {
        gap: 6,
        justifyContent: 'center',
    },
    favoriteRenameButton: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#DBEAFE',
    },
    favoriteRenameButtonText: {
        color: '#1D4ED8',
        fontSize: 12,
        fontWeight: '700',
    },
    favoriteEditSave: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#DCFCE7',
    },
    favoriteEditSaveText: {
        color: '#166534',
        fontSize: 12,
        fontWeight: '700',
    },
    favoriteEditCancel: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FEE2E2',
    },
    favoriteEditCancelText: {
        color: '#B91C1C',
        fontSize: 12,
        fontWeight: '700',
    },
    locationSearchPanel: {
        position: 'absolute',
        top: 12,
        left: 12,
        right: 76,
        zIndex: 1100,
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
        zIndex: 1000,
    },
    locationButton: {
        position: 'absolute',
        right: 8,
        bottom: 44,
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(255,255,255,0.95)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        zIndex: 1000,
    },
    favoritesButton: {
        position: 'absolute',
        right: 8,
        bottom: 104,
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(255,255,255,0.95)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        zIndex: 1000,
    },
    locationButtonIcon: {
        fontSize: 24,
        lineHeight: 24,
    },
    favoritesPanel: {
        position: 'absolute',
        right: 12,
        top: 72,
        width: 280,
        maxHeight: 320,
        backgroundColor: 'rgba(255,255,255,0.97)',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        padding: 10,
        zIndex: 1100,
    },
    favoritesPanelTitle: {
        color: '#111827',
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 8,
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
    popupCard: {
        minWidth: 220,
        gap: 4,
    },
    popupTitle: {
        color: '#111827',
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 2,
    },
    popupSecondary: {
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
        zIndex: 1200,
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
        maxHeight: 160,
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
        zIndex: 1000,
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
        maxHeight: 420,
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
});