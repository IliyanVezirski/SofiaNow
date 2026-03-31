import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatFavoriteCommuteWeekdays, resolveFavoriteCommuteNotificationWeekdays } from '../../../services/places/commute';
import { FAVORITE_COMMUTE_NOTIFICATION_SCHEDULE_VERSION, FAVORITE_COMMUTE_WEEKDAY_OPTIONS } from '../../../services/places/constants';
import { hasFavoriteCoordinates } from '../../../services/places/normalization';
import type {
    FavoriteCommutePlan,
    FavoriteCommuteRouteLineTab,
    FavoriteCommuteWeekday,
    FavoriteLinePreference,
    FavoritePlace,
} from '../../../services/places/types';
import { type Itinerary, type ItineraryLeg, type PlanType, type TripLocation, planTrip, searchLocations as searchTripLocations, type Stop } from '../../../services/transit';
import { cancelCommuteRouteNotification, scheduleCommuteRouteNotification } from '../../../services/notifications/commuteRouteNotifications';
import { buildRouteGeoJSON, TripRouteGeoJSON } from '../../tripPlanner/utils/routeGeoJson';

interface Props {
    visible?: boolean;
    inline?: boolean;
    sessionKey?: number;
    targetFavorite: FavoritePlace | null;
    openBuilderByDefault?: boolean;
    openSavedDetailsByDefault?: boolean;
    currentLocation?: { latitude: number; longitude: number } | null;
    searchableStops: Stop[];
    onShowOnMap?: (route: TripRouteGeoJSON) => void;
    onOpenPlaceEditor?: (favoriteId: string, prefill?: {
        latitude?: number | null;
        longitude?: number | null;
        selectedStopId?: string | null;
        selectedStopName?: string | null;
        selectedLines?: FavoriteLinePreference[];
    }) => void;
    onClose: () => void;
    onSave: (favoriteId: string, payload: {
        commutePlan: FavoriteCommutePlan | null;
        destinationLatitude: number | null;
        destinationLongitude: number | null;
        selectedStopId?: string | null;
        selectedStopName?: string | null;
        selectedLines?: FavoriteLinePreference[];
        personalNotificationLeadMinutes?: number | null;
    }) => Promise<void> | void;
}

type PlannerPointSearchResult =
    | { kind: 'place'; id: string; name: string; subtitle: string; latitude: number; longitude: number }
    | { kind: 'stop'; id: string; stop: Stop; name: string; subtitle: string; latitude: number; longitude: number };

const PLAN_LABELS: Record<PlanType, string> = {
    '0': 'По-малко чакане',
    '1': 'По-малко ходене',
    '2': 'По-малко прекачвания',
};

const fmtTime = (epoch: number) => {
    const date = new Date(epoch);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const fmtDuration = (secs: number) => {
    const minutes = Math.round(secs / 60);
    if (minutes < 60) return `${minutes} мин`;
    return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
};

const normalizeReminderOffsetInput = (value: string) => value.replace(/[^\d]/g, '').slice(0, 3);

const parseReminderOffsetMinutes = (value: unknown) => {
    const normalized = Math.round(Number(value));
    if (!Number.isFinite(normalized) || normalized < 1 || normalized > 120) {
        return null;
    }

    return normalized;
};

const formatDateForApi = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatDateForInput = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
};

const formatTimeForInput = (date: Date) => (
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
);

const parseInputDate = (value: string) => {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(value || '').trim());
    if (!match) {
        return null;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
        return null;
    }

    return parsed;
};

const normalizeDateInput = (value: string) => value.replace(/[^\d.]/g, '').slice(0, 10);
const normalizeTimeInput = (value: string) => value.replace(/[^\d:]/g, '').slice(0, 5);
const isValidTimeInput = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || '').trim());

const formatReminderTimeFromItineraryStart = (startEpoch: number, minutesBefore: number) => {
    const reminderDate = new Date(startEpoch - (minutesBefore * 60 * 1000));
    return `${String(reminderDate.getHours()).padStart(2, '0')}:${String(reminderDate.getMinutes()).padStart(2, '0')}`;
};

const formatReminderTimeFromClock = (clockValue: string, minutesBefore: number) => {
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(clockValue || '').trim());
    if (!match) {
        return null;
    }

    const reminderDate = new Date(2000, 0, 1, Number(match[1]), Number(match[2]), 0, 0);
    reminderDate.setMinutes(reminderDate.getMinutes() - minutesBefore);
    return `${String(reminderDate.getHours()).padStart(2, '0')}:${String(reminderDate.getMinutes()).padStart(2, '0')}`;
};

const buildTripLocation = (name: string, latitude: number | null, longitude: number | null): TripLocation | null => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    return {
        latitude: latitude as number,
        longitude: longitude as number,
        name,
    };
};

const buildItinerarySummary = (itinerary: Itinerary) => {
    const routeParts = itinerary.legs
        .map((leg) => (leg.route?.shortName ? leg.route.shortName : (leg.mode === 'WALK' ? 'Пеша' : leg.mode)))
        .join(' • ');
    return `${fmtTime(itinerary.startTime)} → ${fmtTime(itinerary.endTime)} • ${fmtDuration(itinerary.duration)} • ${routeParts}`;
};

const getTransitLegs = (itinerary: Itinerary) => itinerary.legs.filter((leg) => leg.mode !== 'WALK' && !!leg.route?.shortName);

const inferSelectedLines = (itinerary: Itinerary): FavoriteLinePreference[] => {
    const uniqueLines = Array.from(new Set(getTransitLegs(itinerary).map((leg) => String(leg.route?.shortName || '').trim().toUpperCase()).filter(Boolean)));
    return uniqueLines.map((line) => ({
        line,
        enabled: true,
        notificationsEnabled: false,
    }));
};

const syncLineNotifications = (lines: FavoriteLinePreference[], enabled: boolean, primaryLine?: string | null): FavoriteLinePreference[] => {
    const normalizedPrimaryLine = String(primaryLine || '').trim().toUpperCase();
    const fallbackPrimaryLine = lines.find((entry) => entry.enabled)?.line || '';
    const effectivePrimaryLine = normalizedPrimaryLine || fallbackPrimaryLine;

    return lines.map((entry) => ({
        ...entry,
        notificationsEnabled: enabled ? !!entry.enabled && entry.line === effectivePrimaryLine : false,
    }));
};

const buildTransportLabels = (itinerary: Itinerary) => Array.from(new Set(
    getTransitLegs(itinerary).map((leg) => `${getLegLabel(leg.mode)} ${String(leg.route?.shortName || '').trim()}`.trim()).filter(Boolean),
));

const buildLegStops = (leg: ItineraryLeg) => {
    const places = [leg.from, ...(leg.intermediatePlaces || []), leg.to];
    return places.filter((place, index) => {
        const stopCode = String(place.stop?.code || '').trim();
        const key = stopCode ? `stop:${stopCode}` : `place:${place.name}-${place.lat}-${place.lon}`;
        return places.findIndex((candidate) => {
            const candidateStopCode = String(candidate.stop?.code || '').trim();
            const candidateKey = candidateStopCode ? `stop:${candidateStopCode}` : `place:${candidate.name}-${candidate.lat}-${candidate.lon}`;
            return candidateKey === key;
        }) === index;
    });
};

const buildRouteLineTabs = (itinerary: Itinerary): FavoriteCommuteRouteLineTab[] => {
    const tabs = new Map<string, FavoriteCommuteRouteLineTab>();
    const seenStopsByLine = new Map<string, Set<string>>();

    getTransitLegs(itinerary).forEach((leg, index) => {
        const line = String(leg.route?.shortName || '').trim().toUpperCase();
        if (!line) {
            return;
        }

        const existing = tabs.get(line) || {
            id: `${line}-${index}`,
            line,
            label: `${getLegLabel(leg.mode)} ${line}`.trim(),
            mode: leg.mode,
            stops: [],
        };
        const seenStops = seenStopsByLine.get(line) || new Set<string>();

        buildLegStops(leg).forEach((place) => {
            const stopCode = String(place.stop?.code || '').trim() || null;
            const stopKey = stopCode || `${place.name}-${place.lat}-${place.lon}`;
            if (seenStops.has(stopKey)) {
                return;
            }

            seenStops.add(stopKey);
            existing.stops.push({
                name: String(place.name || '').trim(),
                stopCode,
                time: fmtTime(place.arrivalTime ?? place.departureTime),
            });
        });

        tabs.set(line, existing);
        seenStopsByLine.set(line, seenStops);
    });

    return Array.from(tabs.values());
};

const inferSelectedStop = (itinerary: Itinerary, searchableStops: Stop[]) => {
    const firstTransitLeg = getTransitLegs(itinerary)[0];
    if (!firstTransitLeg) {
        return { selectedStopId: null, selectedStopName: null };
    }

    const stopCode = String(firstTransitLeg.from.stop?.code || '').trim();
    if (stopCode) {
        const exactMatch = searchableStops.find((stop) => stop.id === stopCode);
        if (exactMatch) {
            return { selectedStopId: exactMatch.id, selectedStopName: exactMatch.name };
        }
    }

    const byName = searchableStops.find((stop) => stop.name.trim().toLowerCase() === firstTransitLeg.from.name.trim().toLowerCase());
    if (byName) {
        return { selectedStopId: byName.id, selectedStopName: byName.name };
    }

    return {
        selectedStopId: stopCode || null,
        selectedStopName: firstTransitLeg.from.name || null,
    };
};

const inferFirstTransitReminderContext = (itinerary: Itinerary, searchableStops: Stop[]) => {
    const firstTransitLeg = getTransitLegs(itinerary)[0];
    if (!firstTransitLeg) {
        return {
            firstTransitStopId: null,
            firstTransitStopName: null,
            firstTransitLine: null,
            firstTransitStopOffsetMinutes: null,
            walkDurationSeconds: Math.max(0, Math.round(itinerary.walkTime || 0)),
            walkDistanceMeters: Math.max(0, Math.round(itinerary.walkDistance || 0)),
        };
    }

    const inferredStop = inferSelectedStop(itinerary, searchableStops);
    return {
        firstTransitStopId: inferredStop.selectedStopId,
        firstTransitStopName: inferredStop.selectedStopName,
        firstTransitLine: String(firstTransitLeg.route?.shortName || '').trim().toUpperCase() || null,
        firstTransitStopOffsetMinutes: Math.max(0, Math.round((firstTransitLeg.from.departureTime - itinerary.startTime) / 60000)),
        walkDurationSeconds: Math.max(0, Math.round(itinerary.walkTime || 0)),
        walkDistanceMeters: Math.max(0, Math.round(itinerary.walkDistance || 0)),
    };
};

const getLegLabel = (mode: string) => {
    switch (mode) {
        case 'WALK':
            return 'Ходене';
        case 'BUS':
            return 'Автобус';
        case 'TRAM':
            return 'Трамвай';
        case 'TROLLEYBUS':
            return 'Тролей';
        case 'SUBWAY':
            return 'Метро';
        default:
            return mode;
    }
};

const getModeColor = (mode: string): string => {
    switch (mode) {
        case 'WALK': return '#94A3B8';
        case 'BUS': return '#2563EB';
        case 'TRAM': return '#DC2626';
        case 'TROLLEYBUS': return '#7C3AED';
        case 'SUBWAY': return '#059669';
        case 'RAIL': return '#D97706';
        default: return '#64748B';
    }
};

const getModeIconName = (mode: string): string => {
    switch (mode) {
        case 'WALK': return 'footsteps-outline';
        case 'BUS': return 'bus-outline';
        case 'TRAM': return 'train-outline';
        case 'TROLLEYBUS': return 'bus-outline';
        case 'SUBWAY': return 'subway-outline';
        case 'RAIL': return 'train-outline';
        default: return 'bus-outline';
    }
};

const buildStopPointSearchResults = (query: string, searchableStops: Stop[]): PlannerPointSearchResult[] => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
        return [];
    }

    return searchableStops
        .filter((stop) => stop.name.toLowerCase().includes(normalizedQuery) || stop.id.toLowerCase().includes(normalizedQuery))
        .slice(0, 8)
        .map((stop) => ({
            kind: 'stop' as const,
            id: stop.id,
            stop,
            name: stop.name,
            subtitle: `Спирка • ${stop.id}${stop.lines.length ? ` • Линии: ${stop.lines.slice(0, 4).join(', ')}` : ''}`,
            latitude: stop.latitude,
            longitude: stop.longitude,
        }));
};

const mapTripLocationSearchResult = (result: TripLocation): PlannerPointSearchResult => ({
    kind: 'place',
    id: `${result.latitude.toFixed(6)}:${result.longitude.toFixed(6)}:${result.name}`,
    name: result.name,
    subtitle: `${result.latitude.toFixed(5)}, ${result.longitude.toFixed(5)}`,
    latitude: result.latitude,
    longitude: result.longitude,
});

const getSavedItinerarySnapshot = (favorite: FavoritePlace | null) => {
    const commutePlan = favorite?.defaultCommute ?? null;
    if (!commutePlan?.itinerary || !Array.isArray(commutePlan.itinerary.legs)) {
        return null;
    }

    return commutePlan.itinerary;
};

export const FavoriteRoutePlannerModal: React.FC<Props> = ({
    visible = true,
    inline = false,
    sessionKey = 0,
    targetFavorite,
    openBuilderByDefault = false,
    openSavedDetailsByDefault = false,
    currentLocation,
    searchableStops,
    onShowOnMap,
    onOpenPlaceEditor,
    onClose,
    onSave,
}) => {
    const initialNow = new Date();
    const [originName, setOriginName] = useState('');
    const [originLatitude, setOriginLatitude] = useState<number | null>(null);
    const [originLongitude, setOriginLongitude] = useState<number | null>(null);
    const [originQuery, setOriginQuery] = useState('');
    const [originSearchResults, setOriginSearchResults] = useState<TripLocation[]>([]);
    const [originSearchLoading, setOriginSearchLoading] = useState(false);
    const [destinationLatitude, setDestinationLatitude] = useState<number | null>(null);
    const [destinationLongitude, setDestinationLongitude] = useState<number | null>(null);
    const [destinationQuery, setDestinationQuery] = useState('');
    const [destinationSearchResults, setDestinationSearchResults] = useState<TripLocation[]>([]);
    const [destinationSearchLoading, setDestinationSearchLoading] = useState(false);
    const [isEditingDestination, setIsEditingDestination] = useState(false);
    const [planType, setPlanType] = useState<PlanType>('0');
    const [routeDateInput, setRouteDateInput] = useState(formatDateForInput(initialNow));
    const [routeTimeInput, setRouteTimeInput] = useState(formatTimeForInput(initialNow));
    const [arriveBy, setArriveBy] = useState(true);
    const [reminderOffsetMinutes, setReminderOffsetMinutes] = useState<number>(5);
    const [reminderOffsetInput, setReminderOffsetInput] = useState('5');
    const [reminderWeekdays, setReminderWeekdays] = useState<FavoriteCommuteWeekday[]>(FAVORITE_COMMUTE_WEEKDAY_OPTIONS.map((option) => option.value));
    const [itineraries, setItineraries] = useState<Itinerary[]>([]);
    const [selectedItineraryIndex, setSelectedItineraryIndex] = useState<number | null>(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notificationEnabled, setNotificationEnabled] = useState(false);
    const [expandedLegKey, setExpandedLegKey] = useState<string | null>(null);
    const [showSavedRouteDetails, setShowSavedRouteDetails] = useState(false);
    const [showPlannerBuilder, setShowPlannerBuilder] = useState(false);

    const originStopResults = useMemo(() => buildStopPointSearchResults(originQuery, searchableStops), [originQuery, searchableStops]);
    const destinationStopResults = useMemo(() => buildStopPointSearchResults(destinationQuery, searchableStops), [destinationQuery, searchableStops]);
    const originCombinedResults = useMemo<PlannerPointSearchResult[]>(() => ([
        ...originStopResults,
        ...originSearchResults.slice(0, 8).map(mapTripLocationSearchResult),
    ]).slice(0, 20), [originSearchResults, originStopResults]);
    const destinationCombinedResults = useMemo<PlannerPointSearchResult[]>(() => ([
        ...destinationStopResults,
        ...destinationSearchResults.slice(0, 8).map(mapTripLocationSearchResult),
    ]).slice(0, 20), [destinationSearchResults, destinationStopResults]);

    useEffect(() => {
        const normalizedQuery = originQuery.trim();
        if (!visible || !normalizedQuery || normalizedQuery === originName.trim()) {
            setOriginSearchResults([]);
            setOriginSearchLoading(false);
            return;
        }

        let isMounted = true;
        setOriginSearchLoading(true);
        const timer = setTimeout(() => {
            void (async () => {
                try {
                    const results = await searchTripLocations(normalizedQuery);
                    if (isMounted) {
                        setOriginSearchResults(results);
                    }
                } catch {
                    if (isMounted) {
                        setOriginSearchResults([]);
                    }
                } finally {
                    if (isMounted) {
                        setOriginSearchLoading(false);
                    }
                }
            })();
        }, 320);

        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [originName, originQuery, visible]);

    useEffect(() => {
        const normalizedQuery = destinationQuery.trim();
        if (!visible || !isEditingDestination || !normalizedQuery) {
            setDestinationSearchResults([]);
            setDestinationSearchLoading(false);
            return;
        }

        let isMounted = true;
        setDestinationSearchLoading(true);
        const timer = setTimeout(() => {
            void (async () => {
                try {
                    const results = await searchTripLocations(normalizedQuery);
                    if (isMounted) {
                        setDestinationSearchResults(results);
                    }
                } catch {
                    if (isMounted) {
                        setDestinationSearchResults([]);
                    }
                } finally {
                    if (isMounted) {
                        setDestinationSearchLoading(false);
                    }
                }
            })();
        }, 320);

        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [destinationQuery, isEditingDestination, visible]);

    useEffect(() => {
        let cancelled = false;

        if (!targetFavorite) {
            return;
        }

        const existingPlan = targetFavorite.defaultCommute;
        const savedItinerarySnapshot = getSavedItinerarySnapshot(targetFavorite);
        const nextRouteDateInput = existingPlan?.routeDate || formatDateForInput(new Date());
        const nextRouteTimeInput = existingPlan?.routeTime || formatTimeForInput(new Date());
        const nextArriveBy = existingPlan?.arriveBy ?? true;
        if (existingPlan?.originName && Number.isFinite(existingPlan.originLatitude) && Number.isFinite(existingPlan.originLongitude)) {
            setOriginName(existingPlan.originName);
            setOriginLatitude(existingPlan.originLatitude);
            setOriginLongitude(existingPlan.originLongitude);
            setOriginQuery(existingPlan.originName);
        } else if (currentLocation) {
            setOriginName('Моята локация');
            setOriginLatitude(currentLocation.latitude);
            setOriginLongitude(currentLocation.longitude);
            setOriginQuery('Моята локация');
        } else {
            setOriginName('');
            setOriginLatitude(null);
            setOriginLongitude(null);
            setOriginQuery('');
        }

        setDestinationLatitude(targetFavorite.latitude);
        setDestinationLongitude(targetFavorite.longitude);
        setDestinationQuery('');
        setDestinationSearchResults([]);
        setDestinationSearchLoading(false);
        setIsEditingDestination(!hasFavoriteCoordinates(targetFavorite));
        setOriginSearchResults([]);
        setOriginSearchLoading(false);
        setPlanType(existingPlan?.planType || '0');
        setRouteDateInput(nextRouteDateInput);
        setRouteTimeInput(nextRouteTimeInput);
        setArriveBy(nextArriveBy);
        const normalizedReminderOffsetMinutes = parseReminderOffsetMinutes(existingPlan?.reminderOffsetMinutes) ?? 5;
        setReminderOffsetMinutes(normalizedReminderOffsetMinutes);
        setReminderOffsetInput(String(normalizedReminderOffsetMinutes));
        setReminderWeekdays(existingPlan?.reminderWeekdays?.length ? existingPlan.reminderWeekdays : FAVORITE_COMMUTE_WEEKDAY_OPTIONS.map((option) => option.value));
        setSelectedItineraryIndex(existingPlan?.itineraryIndex || 0);
        setNotificationEnabled(existingPlan?.notificationEnabled || false);
        setItineraries(savedItinerarySnapshot && openSavedDetailsByDefault ? [savedItinerarySnapshot] : []);
        setError(null);
        setExpandedLegKey(null);
        setShowSavedRouteDetails(openSavedDetailsByDefault && !!existingPlan?.itinerarySummary);
        setShowPlannerBuilder((openBuilderByDefault || !existingPlan?.itinerarySummary) && !openSavedDetailsByDefault);
        setSelectedItineraryIndex(savedItinerarySnapshot && openSavedDetailsByDefault ? 0 : (existingPlan?.itineraryIndex || 0));

        if (!visible || !openSavedDetailsByDefault || !existingPlan?.itinerarySummary || savedItinerarySnapshot) {
            return () => {
                cancelled = true;
            };
        }

        if (visible && openSavedDetailsByDefault && existingPlan?.itinerarySummary) {
            const from = buildTripLocation(
                existingPlan.originName || (currentLocation ? 'Моята локация' : 'Начална точка'),
                Number.isFinite(existingPlan.originLatitude) ? existingPlan.originLatitude : (currentLocation?.latitude ?? null),
                Number.isFinite(existingPlan.originLongitude) ? existingPlan.originLongitude : (currentLocation?.longitude ?? null),
            );
            const to = buildTripLocation(targetFavorite.name, targetFavorite.latitude, targetFavorite.longitude);
            const parsedDate = parseInputDate(nextRouteDateInput);

            if (!from || !to || !parsedDate || !isValidTimeInput(nextRouteTimeInput)) {
                return () => {
                    cancelled = true;
                };
            }

            setLoading(true);
            void (async () => {
                try {
                    const result = await planTrip({
                        from,
                        to,
                        type: existingPlan.planType || '0',
                        date: formatDateForApi(parsedDate),
                        time: nextRouteTimeInput.trim(),
                        arriveBy: nextArriveBy,
                    });

                    if (cancelled) {
                        return;
                    }

                    if (!result.length) {
                        setError('Не е намерен маршрут.');
                        return;
                    }

                    const preferredItineraryIndex = typeof existingPlan.itineraryIndex === 'number'
                        && existingPlan.itineraryIndex >= 0
                        && existingPlan.itineraryIndex < result.length
                        ? existingPlan.itineraryIndex
                        : 0;

                    setItineraries(result);
                    setSelectedItineraryIndex(preferredItineraryIndex);
                    setExpandedLegKey(null);
                } catch (routeError: any) {
                    if (!cancelled) {
                        setError(routeError?.message || 'Грешка при изчисляване на маршрут.');
                    }
                } finally {
                    if (!cancelled) {
                        setLoading(false);
                    }
                }
            })();
        }

        return () => {
            cancelled = true;
        };
    }, [sessionKey, targetFavorite?.id]);

    if (!targetFavorite || (!inline && !visible)) {
        return null;
    }

    const existingPlan = targetFavorite.defaultCommute;
    const savedItinerarySnapshot = getSavedItinerarySnapshot(targetFavorite);
    const canPlanRoute = Number.isFinite(originLatitude) && Number.isFinite(originLongitude) && Number.isFinite(destinationLatitude) && Number.isFinite(destinationLongitude);
    const isOriginAtCurrentLocation = !!currentLocation
        && Number.isFinite(originLatitude)
        && Number.isFinite(originLongitude)
        && Math.abs((originLatitude as number) - currentLocation.latitude) < 0.000001
        && Math.abs((originLongitude as number) - currentLocation.longitude) < 0.000001;
    const showResetToCurrentLocationButton = !!currentLocation && (!isOriginAtCurrentLocation || originName !== 'Моята локация');
    const selectedItinerary = selectedItineraryIndex == null ? null : (itineraries[selectedItineraryIndex] ?? null);
    const hasSavedRoute = !!existingPlan?.itinerarySummary;
    const effectiveRouteStartTime = selectedItinerary
        ? fmtTime(selectedItinerary.startTime)
        : (existingPlan?.routeStartTime || null);
    const effectiveReminderTime = selectedItinerary
        ? formatReminderTimeFromItineraryStart(selectedItinerary.startTime, reminderOffsetMinutes)
        : (effectiveRouteStartTime ? formatReminderTimeFromClock(effectiveRouteStartTime, reminderOffsetMinutes) : (existingPlan?.reminderTime || null));
    const effectiveNotificationWeekdays = resolveFavoriteCommuteNotificationWeekdays({
        arriveBy,
        routeStartTime: effectiveRouteStartTime,
        reminderTime: effectiveReminderTime,
        reminderWeekdays,
    });
    const toggleReminderWeekday = (weekday: FavoriteCommuteWeekday) => {
        setReminderWeekdays((previous) => {
            const exists = previous.includes(weekday);
            if (exists) {
                const next = previous.filter((candidate) => candidate !== weekday);
                return next.length ? next : previous;
            }

            return FAVORITE_COMMUTE_WEEKDAY_OPTIONS
                .map((option) => option.value)
                .filter((candidate) => previous.includes(candidate) || candidate === weekday);
        });
    };

    const commitReminderOffsetInput = () => {
        const parsed = parseReminderOffsetMinutes(reminderOffsetInput);
        if (parsed == null) {
            Alert.alert('Невалидни минути', 'Въведи стойност между 1 и 120 минути.');
            setReminderOffsetInput(String(reminderOffsetMinutes));
            return;
        }

        setReminderOffsetMinutes(parsed);
        setReminderOffsetInput(String(parsed));
    };

    const doPlanRoute = async () => {
        await fetchPlannedRoutes();
    };

    const fetchPlannedRoutes = async () => {
        const from = buildTripLocation(originName || 'Начална точка', originLatitude, originLongitude);
        const to = buildTripLocation(targetFavorite.name, destinationLatitude, destinationLongitude);
        if (!from || !to) {
            setError('Задай начална точка и крайна точка с локация.');
            return;
        }

        const parsedDate = parseInputDate(routeDateInput);
        if (!parsedDate) {
            setError('Датата трябва да е във формат ДД.ММ.ГГГГ');
            return;
        }

        if (!isValidTimeInput(routeTimeInput)) {
            setError('Часът трябва да е във формат ЧЧ:ММ');
            return;
        }

        setLoading(true);
        setError(null);
        setItineraries([]);
        try {
            const result = await planTrip({
                from,
                to,
                type: planType,
                date: formatDateForApi(parsedDate),
                time: routeTimeInput.trim(),
                arriveBy,
            });
            if (!result.length) {
                setError('Не е намерен маршрут.');
            } else {
                const preferredItineraryIndex = typeof existingPlan?.itineraryIndex === 'number'
                    && existingPlan.itineraryIndex >= 0
                    && existingPlan.itineraryIndex < result.length
                    ? existingPlan.itineraryIndex
                    : 0;
                setItineraries(result);
                setSelectedItineraryIndex(preferredItineraryIndex);
                setExpandedLegKey(null);
            }
        } catch (routeError: any) {
            setError(routeError?.message || 'Грешка при изчисляване на маршрут.');
        } finally {
            setLoading(false);
        }
    };

    const savePlan = async () => {
        if (!selectedItinerary && !existingPlan?.itinerarySummary) {
            setError('Избери маршрут, който да запазим.');
            return;
        }

        const commuteItinerary = selectedItinerary;
        const inferredStop = commuteItinerary ? inferSelectedStop(commuteItinerary, searchableStops) : null;
        const inferredLines = commuteItinerary ? inferSelectedLines(commuteItinerary) : null;
        const firstTransitReminderContext = commuteItinerary
            ? inferFirstTransitReminderContext(commuteItinerary, searchableStops)
            : {
                firstTransitStopId: existingPlan?.firstTransitStopId || null,
                firstTransitStopName: existingPlan?.firstTransitStopName || null,
                firstTransitLine: existingPlan?.firstTransitLine || null,
                firstTransitStopOffsetMinutes: existingPlan?.firstTransitStopOffsetMinutes ?? null,
                walkDurationSeconds: existingPlan?.walkDurationSeconds ?? null,
                walkDistanceMeters: existingPlan?.walkDistanceMeters ?? null,
            };
        const routeGeoJson = commuteItinerary ? buildRouteGeoJSON(commuteItinerary) : (existingPlan?.routeGeoJson || null);
        const routeSummary = commuteItinerary ? buildItinerarySummary(commuteItinerary) : (existingPlan?.itinerarySummary || '');
        const routeLabel = commuteItinerary
            ? `${originName || 'Начална точка'} → ${targetFavorite.name}`
            : (existingPlan?.routeLabel || `${originName || 'Начална точка'} → ${targetFavorite.name}`);
        const transportLabels = commuteItinerary ? buildTransportLabels(commuteItinerary) : (existingPlan?.transportLabels || []);
        const routeLineTabs = commuteItinerary ? buildRouteLineTabs(commuteItinerary) : (existingPlan?.routeLineTabs || []);

        let notificationIds = existingPlan?.notificationIds || [];
        let scheduleSuccessMessage: string | null = null;
        if (notificationEnabled) {
            if (!effectiveReminderTime) {
                setError('Липсва час за уведомление.');
                return;
            }
            if (!reminderWeekdays.length) {
                setError('Избери поне един ден за повтарящо се уведомление.');
                return;
            }

            const scheduled = await scheduleCommuteRouteNotification({
                favoriteId: targetFavorite.id,
                sourceName: originName || 'Начална точка',
                destinationName: targetFavorite.name,
                routeSummary,
                reminderTime: effectiveReminderTime,
                weekdays: effectiveNotificationWeekdays,
                existingNotificationIds: existingPlan?.notificationIds || [],
                reminderOffsetMinutes: reminderOffsetMinutes,
                firstTransitStopId: firstTransitReminderContext.firstTransitStopId,
                firstTransitStopName: firstTransitReminderContext.firstTransitStopName,
                firstTransitLine: firstTransitReminderContext.firstTransitLine,
                firstTransitStopOffsetMinutes: firstTransitReminderContext.firstTransitStopOffsetMinutes,
                walkDurationSeconds: firstTransitReminderContext.walkDurationSeconds,
                walkDistanceMeters: firstTransitReminderContext.walkDistanceMeters,
            });

            if (!scheduled.ok) {
                setError(scheduled.message);
                return;
            }

            notificationIds = scheduled.notificationIds || [];
            scheduleSuccessMessage = scheduled.message || null;
        } else if (existingPlan?.notificationIds?.length) {
            await cancelCommuteRouteNotification(existingPlan.notificationIds);
            notificationIds = [];
        }

        await onSave(targetFavorite.id, {
            commutePlan: {
                originName: originName || 'Начална точка',
                originLatitude,
                originLongitude,
                destinationFavoriteId: targetFavorite.id,
                destinationFavoriteName: targetFavorite.name,
                planType,
                routeDate: routeDateInput.trim(),
                routeTime: routeTimeInput.trim(),
                arriveBy,
                routeStartTime: effectiveRouteStartTime,
                reminderOffsetMinutes: reminderOffsetMinutes,
                reminderWeekdays,
                notificationWeekdays: effectiveNotificationWeekdays,
                firstTransitStopId: firstTransitReminderContext.firstTransitStopId,
                firstTransitStopName: firstTransitReminderContext.firstTransitStopName,
                firstTransitLine: firstTransitReminderContext.firstTransitLine,
                firstTransitStopOffsetMinutes: firstTransitReminderContext.firstTransitStopOffsetMinutes,
                walkDurationSeconds: firstTransitReminderContext.walkDurationSeconds,
                walkDistanceMeters: firstTransitReminderContext.walkDistanceMeters,
                itinerary: commuteItinerary || existingPlan?.itinerary || null,
                routeGeoJson,
                itineraryIndex: commuteItinerary ? selectedItineraryIndex : (existingPlan?.itineraryIndex || 0),
                itinerarySummary: routeSummary,
                routeLabel,
                transportLabels,
                routeLineTabs,
                reminderTime: effectiveReminderTime,
                notificationEnabled,
                notificationIds,
                notificationScheduleVersion: FAVORITE_COMMUTE_NOTIFICATION_SCHEDULE_VERSION,
                lastPlannedAt: Date.now(),
            },
            destinationLatitude,
            destinationLongitude,
            selectedStopId: inferredStop?.selectedStopId ?? targetFavorite.selectedStopId ?? null,
            selectedStopName: inferredStop?.selectedStopName ?? targetFavorite.selectedStopName ?? null,
            selectedLines: syncLineNotifications(inferredLines ?? targetFavorite.selectedLines ?? [], notificationEnabled, firstTransitReminderContext.firstTransitLine),
            personalNotificationLeadMinutes: reminderOffsetMinutes,
        });
        if (scheduleSuccessMessage) {
            Alert.alert('Маршрутът е запазен', scheduleSuccessMessage);
        }
        onClose();
    };

    const buildEditorPrefill = () => {
        if (!selectedItinerary) {
            return {
                latitude: destinationLatitude,
                longitude: destinationLongitude,
            };
        }

        const inferredStop = inferSelectedStop(selectedItinerary, searchableStops);
        const inferredLines = inferSelectedLines(selectedItinerary);

        return {
            latitude: destinationLatitude,
            longitude: destinationLongitude,
            selectedStopId: inferredStop.selectedStopId,
            selectedStopName: inferredStop.selectedStopName,
            selectedLines: inferredLines,
        };
    };

    const selectedTransportLabels = selectedItinerary ? buildTransportLabels(selectedItinerary) : [];

    const openSavedRouteDetails = async () => {
        if (!existingPlan?.itinerarySummary) {
            return;
        }

        setShowSavedRouteDetails(true);
        setShowPlannerBuilder(false);
        setError(null);
        setExpandedLegKey(null);

        if (savedItinerarySnapshot) {
            setItineraries([savedItinerarySnapshot]);
            setSelectedItineraryIndex(0);
            return;
        }

        await fetchPlannedRoutes();
    };

    const content = (
        <View style={[styles.card, inline && styles.inlineCard]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        <View style={styles.header}>
                            <Text style={styles.title}>Маршрут до {targetFavorite.name}</Text>
                            <Pressable onPress={onClose} style={styles.closeButton}>
                                <Ionicons name="close" size={16} color="#334155" />
                            </Pressable>
                        </View>

                        {!existingPlan?.itinerarySummary || showPlannerBuilder ? (
                            <>
                        {/* Origin — compact inline row */}
                        <View style={styles.pointRow}>
                            <Ionicons name="navigate-circle-outline" size={18} color="#1D4ED8" />
                            <TextInput
                                style={styles.pointInput}
                                value={originQuery}
                                onChangeText={setOriginQuery}
                                placeholder="Откъде тръгваш?"
                                placeholderTextColor="#94A3B8"
                            />
                            {showResetToCurrentLocationButton ? (
                                <TouchableOpacity
                                    style={styles.pointResetBtn}
                                    onPress={() => {
                                        setOriginName('Моята локация');
                                        setOriginLatitude(currentLocation?.latitude ?? null);
                                        setOriginLongitude(currentLocation?.longitude ?? null);
                                        setOriginQuery('Моята локация');
                                        setOriginSearchResults([]);
                                        setOriginSearchLoading(false);
                                    }}
                                >
                                    <Ionicons name="locate" size={16} color="#1D4ED8" />
                                </TouchableOpacity>
                            ) : null}
                        </View>
                        {(originSearchLoading || originCombinedResults.length > 0) && (
                            <ScrollView style={styles.resultsList} nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                {originCombinedResults.map((result) => (
                                    <TouchableOpacity
                                        key={`${result.kind}-${result.id}`}
                                        style={styles.resultRow}
                                        onPress={() => {
                                            setOriginName(result.name);
                                            setOriginLatitude(result.latitude);
                                            setOriginLongitude(result.longitude);
                                            setOriginQuery(result.name);
                                            setOriginSearchResults([]);
                                        }}
                                    >
                                        <Text style={styles.resultTitle}>{result.name}</Text>
                                        <Text style={styles.resultSubtitle}>{result.subtitle}</Text>
                                    </TouchableOpacity>
                                ))}
                                {originSearchLoading && <Text style={styles.resultStatus}>Търсене...</Text>}
                            </ScrollView>
                        )}

                        {/* Destination — tap to edit */}
                        <TouchableOpacity
                            style={[styles.pointRow, isEditingDestination && styles.pointRowActive]}
                            onPress={() => setIsEditingDestination((previous) => !previous)}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="location" size={18} color="#EF4444" />
                            <Text style={styles.pointLabel} numberOfLines={1}>{targetFavorite.name}</Text>
                            <Ionicons name={isEditingDestination ? 'chevron-up' : 'pencil-outline'} size={14} color="#94A3B8" />
                        </TouchableOpacity>
                        {isEditingDestination && (
                            <>
                                <TextInput
                                    style={styles.originInput}
                                    value={destinationQuery}
                                    onChangeText={setDestinationQuery}
                                    placeholder="Търси нов адрес"
                                    placeholderTextColor="#94A3B8"
                                />
                                {(destinationSearchLoading || destinationCombinedResults.length > 0) && (
                                    <ScrollView style={styles.resultsList} nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                        {destinationCombinedResults.map((result) => (
                                            <TouchableOpacity
                                                key={`${result.kind}-${result.id}`}
                                                style={styles.resultRow}
                                                onPress={() => {
                                                    setDestinationLatitude(result.latitude);
                                                    setDestinationLongitude(result.longitude);
                                                    setDestinationQuery(result.name);
                                                    setDestinationSearchResults([]);
                                                    setIsEditingDestination(false);
                                                }}
                                            >
                                                <Text style={styles.resultTitle}>{result.name}</Text>
                                                <Text style={styles.resultSubtitle}>{result.subtitle}</Text>
                                            </TouchableOpacity>
                                        ))}
                                        {destinationSearchLoading && <Text style={styles.resultStatus}>Търсене...</Text>}
                                    </ScrollView>
                                )}
                            </>
                        )}

                        {/* Options — single row, no section titles */}
                        <View style={styles.optionsRow}>
                            {(['0', '1', '2'] as PlanType[]).map((type) => (
                                <TouchableOpacity key={type} style={[styles.optionChip, planType === type && styles.optionChipActive]} onPress={() => setPlanType(type)}>
                                    <Text style={[styles.optionChipText, planType === type && styles.optionChipTextActive]}>{PLAN_LABELS[type]}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Arrive by / Depart at */}
                        <View style={styles.arriveByRow}>
                            <TouchableOpacity
                                style={[styles.arriveByChip, !arriveBy && styles.arriveByChipActive]}
                                onPress={() => setArriveBy(false)}
                            >
                                <Ionicons name="arrow-forward-outline" size={13} color={!arriveBy ? '#FFFFFF' : '#475569'} />
                                <Text style={[styles.arriveByChipText, !arriveBy && styles.arriveByChipTextActive]}>Тръгване в</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.arriveByChip, arriveBy && styles.arriveByChipActive]}
                                onPress={() => setArriveBy(true)}
                            >
                                <Ionicons name="flag-outline" size={13} color={arriveBy ? '#FFFFFF' : '#475569'} />
                                <Text style={[styles.arriveByChipText, arriveBy && styles.arriveByChipTextActive]}>Пристигане до</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Date & Time — inline with quick actions */}
                        <View style={styles.dateTimeRow}>
                            <View style={styles.dateTimeInputWrap}>
                                <TextInput
                                    style={styles.dateTimeInput}
                                    value={routeDateInput}
                                    onChangeText={(value) => setRouteDateInput(normalizeDateInput(value))}
                                    placeholder="ДД.ММ.ГГГГ"
                                    placeholderTextColor="#94A3B8"
                                    keyboardType="number-pad"
                                />
                            </View>
                            <View style={styles.dateTimeSep} />
                            <View style={styles.timeInputWrap}>
                                <TextInput
                                    style={styles.dateTimeInput}
                                    value={routeTimeInput}
                                    onChangeText={(value) => setRouteTimeInput(normalizeTimeInput(value))}
                                    placeholder="ЧЧ:ММ"
                                    placeholderTextColor="#94A3B8"
                                    keyboardType="numbers-and-punctuation"
                                />
                            </View>
                            <TouchableOpacity
                                style={styles.quickChip}
                                onPress={() => {
                                    const now = new Date();
                                    setRouteDateInput(formatDateForInput(now));
                                    setRouteTimeInput(formatTimeForInput(now));
                                }}
                            >
                                <Text style={styles.quickChipText}>Сега</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity style={[styles.searchButton, !canPlanRoute && styles.searchButtonDisabled]} disabled={!canPlanRoute || loading} onPress={doPlanRoute}>
                            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.searchButtonText}>Изчисли маршрут</Text>}
                        </TouchableOpacity>

                        {error ? <Text style={styles.errorText}>{error}</Text> : null}
                            </>
                        ) : null}

                        {!!itineraries.length && (showPlannerBuilder || showSavedRouteDetails) && (
                            <>
                                <Text style={styles.sectionTitle}>{itineraries.length > 1 ? 'Избери вариант' : 'Намерен маршрут'}</Text>
                                {itineraries.map((itinerary, index) => {
                                    const active = index === selectedItineraryIndex;
                                    return (
                                        <View key={`${itinerary.startTime}-${index}`}>
                                            <TouchableOpacity
                                                style={[styles.routeCard, active && styles.routeCardActive]}
                                                onPress={() => {
                                                    setSelectedItineraryIndex((previous) => previous === index ? null : index);
                                                    setExpandedLegKey(null);
                                                }}
                                            >
                                                <View style={styles.cardSummary}>
                                                    <Text style={styles.cardTime}>{fmtTime(itinerary.startTime)} → {fmtTime(itinerary.endTime)}</Text>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <Text style={styles.cardDuration}>{fmtDuration(itinerary.duration)}</Text>
                                                        {active && <Ionicons name="checkmark-circle" size={16} color="#059669" />}
                                                    </View>
                                                </View>
                                                <View style={styles.cardModes}>
                                                    {itinerary.legs.map((leg, legIdx) => (
                                                        <React.Fragment key={legIdx}>
                                                            {legIdx > 0 && <Ionicons name="chevron-forward" size={12} color="#94A3B8" />}
                                                            <View style={[styles.legBadge, { borderLeftWidth: 3, borderLeftColor: getModeColor(leg.mode) }]}>
                                                                <Ionicons name={getModeIconName(leg.mode) as any} size={14} color={getModeColor(leg.mode)} />
                                                                {leg.route ? (
                                                                    <Text style={styles.legRoute}>{leg.route.shortName}</Text>
                                                                ) : leg.mode === 'WALK' ? (
                                                                    <Text style={styles.legWalkLabel}>{fmtDuration(Math.round((leg.to.arrivalTime - leg.from.departureTime) / 1000))}</Text>
                                                                ) : null}
                                                            </View>
                                                        </React.Fragment>
                                                    ))}
                                                </View>
                                            </TouchableOpacity>
                                            {active && (
                                                <View style={styles.routeDetailsBox}>
                                                    {itinerary.legs.map((leg, legIndex) => {
                                                        const legKey = `${itinerary.startTime}-${index}-${legIndex}`;
                                                        const hasVehicle = !!leg.route?.shortName;
                                                        const legStops = buildLegStops(leg);
                                                        const isExpanded = expandedLegKey === legKey;
                                                        const isWalk = leg.mode === 'WALK';
                                                        const hasStops = leg.intermediatePlaces && leg.intermediatePlaces.length > 0;

                                                        return (
                                                            <View key={legKey} style={[styles.legRow, isWalk && styles.legRowWalk]}>
                                                                <View style={styles.legTimeCol}>
                                                                    <Text style={styles.legTime}>{fmtTime(leg.from.departureTime)}</Text>
                                                                    <Text style={styles.legTime}>{fmtTime(leg.to.arrivalTime)}</Text>
                                                                </View>
                                                                <View style={styles.legTimeline}>
                                                                    <View style={[styles.legDot, { backgroundColor: getModeColor(leg.mode) }]} />
                                                                    <View style={[styles.legLine, isWalk ? styles.legLineWalk : { backgroundColor: getModeColor(leg.mode) }]} />
                                                                    <View style={[styles.legDot, { backgroundColor: getModeColor(leg.mode) }]} />
                                                                </View>
                                                                <View style={styles.legInfo}>
                                                                    <View style={styles.legHeaderRow}>
                                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                                            <Ionicons name={getModeIconName(leg.mode) as any} size={14} color={getModeColor(leg.mode)} />
                                                                            <Text style={[styles.legMode, { color: getModeColor(leg.mode) }]}>
                                                                                {leg.route?.shortName ? `${getLegLabel(leg.mode)} ${leg.route.shortName}` : getLegLabel(leg.mode)}
                                                                            </Text>
                                                                        </View>
                                                                        {hasVehicle ? (
                                                                            <TouchableOpacity onPress={() => setExpandedLegKey((previous) => previous === legKey ? null : legKey)}>
                                                                                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#1E3A8A" />
                                                                            </TouchableOpacity>
                                                                        ) : null}
                                                                    </View>
                                                                    {isWalk && (
                                                                        <View style={styles.walkInfoRow}>
                                                                            <Ionicons name="walk-outline" size={13} color="#64748B" />
                                                                            <Text style={styles.walkInfoText}>
                                                                                {fmtDuration(Math.round((leg.to.arrivalTime - leg.from.departureTime) / 1000))}
                                                                            </Text>
                                                                        </View>
                                                                    )}
                                                                    <View style={styles.legPlaceRow}>
                                                                        <Ionicons name="ellipse" size={7} color="#22C55E" />
                                                                        <Text style={styles.legPlace}>{leg.from.name}</Text>
                                                                    </View>
                                                                    {hasStops && (
                                                                        <TouchableOpacity onPress={() => setExpandedLegKey((previous) => previous === legKey ? null : legKey)}>
                                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 11 }}>
                                                                                <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={13} color="#1D4ED8" />
                                                                                <Text style={styles.legStopsToggle}>{leg.intermediatePlaces!.length} спирки</Text>
                                                                            </View>
                                                                        </TouchableOpacity>
                                                                    )}
                                                                    {hasStops && isExpanded && (
                                                                        <View style={styles.intermediateStops}>
                                                                            {leg.intermediatePlaces!.map((place, idx) => (
                                                                                <View key={idx} style={styles.intermediateRow}>
                                                                                    <Text style={styles.intermediateTime}>{fmtTime(place.arrivalTime)}</Text>
                                                                                    <View style={styles.intermediateDot} />
                                                                                    <Text style={styles.intermediateName}>{place.name}</Text>
                                                                                </View>
                                                                            ))}
                                                                        </View>
                                                                    )}
                                                                    <View style={styles.legPlaceRow}>
                                                                        <Ionicons name="location" size={8} color="#EF4444" />
                                                                        <Text style={styles.legPlace}>{leg.to.name}</Text>
                                                                    </View>
                                                                </View>
                                                            </View>
                                                        );
                                                    })}
                                                    {onShowOnMap ? (
                                                        <TouchableOpacity
                                                            style={styles.showOnMapButton}
                                                            onPress={() => {
                                                                onShowOnMap(buildRouteGeoJSON(itinerary));
                                                            }}
                                                        >
                                                            <Ionicons name="map-outline" size={14} color="#FFFFFF" />
                                                            <Text style={styles.showOnMapButtonText}>Покажи на картата</Text>
                                                        </TouchableOpacity>
                                                    ) : null}
                                                </View>
                                            )}
                                        </View>
                                    );
                                })}
                            </>
                        )}

                        {(showPlannerBuilder || !existingPlan?.itinerarySummary || showSavedRouteDetails) ? (
                            <>
                        <View style={styles.notifyRow}>
                            <Ionicons name={notificationEnabled ? 'notifications' : 'notifications-outline'} size={16} color={notificationEnabled ? '#0F766E' : '#94A3B8'} />
                            <Text style={styles.notifyLabel}>Известие</Text>
                            <Switch value={notificationEnabled} onValueChange={setNotificationEnabled} />
                        </View>
                        {notificationEnabled && arriveBy ? (
                            <>
                                <View style={styles.weekdayGrid}>
                                    {FAVORITE_COMMUTE_WEEKDAY_OPTIONS.map((option) => {
                                        const active = reminderWeekdays.includes(option.value);
                                        return (
                                            <TouchableOpacity
                                                key={option.value}
                                                style={[styles.weekdayChip, active && styles.weekdayChipActive]}
                                                onPress={() => toggleReminderWeekday(option.value)}
                                            >
                                                <Text style={[styles.weekdayChipText, active && styles.weekdayChipTextActive]}>{option.shortLabel}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                                <View style={styles.reminderMinutesRow}>
                                    <Text style={styles.reminderMinutesLabel}>Извести ме</Text>
                                    <TextInput
                                        style={styles.reminderMinutesInput}
                                        value={reminderOffsetInput}
                                        onChangeText={(value) => setReminderOffsetInput(normalizeReminderOffsetInput(value))}
                                        onBlur={commitReminderOffsetInput}
                                        onSubmitEditing={commitReminderOffsetInput}
                                        keyboardType="number-pad"
                                        returnKeyType="done"
                                        placeholder="5"
                                        placeholderTextColor="#94A3B8"
                                    />
                                    <Text style={styles.reminderMinutesSuffix}>мин по-рано</Text>
                                </View>
                                {effectiveReminderTime ? (
                                    <Text style={styles.reminderHint}>{`Известие в ${effectiveReminderTime} • ${formatFavoriteCommuteWeekdays(effectiveNotificationWeekdays)}`}</Text>
                                ) : null}
                            </>
                        ) : null}
                            </>
                        ) : null}

                        {existingPlan?.itinerarySummary && !showPlannerBuilder && !showSavedRouteDetails ? (
                            <View style={styles.currentPlanBox}>
                                <Text style={styles.currentPlanText}>{existingPlan.itinerarySummary}</Text>
                                {existingPlan.notificationEnabled && existingPlan.reminderTime ? (
                                    <Text style={styles.currentPlanMeta}>{`${formatFavoriteCommuteWeekdays(existingPlan.notificationWeekdays)} • ${existingPlan.reminderTime}`}</Text>
                                ) : null}
                                <View style={styles.currentPlanActions}>
                                    <TouchableOpacity style={styles.currentPlanBtn} onPress={() => void openSavedRouteDetails()}>
                                        <Ionicons name="search-outline" size={13} color="#1D4ED8" />
                                        <Text style={styles.currentPlanBtnText}>Детайли</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.currentPlanBtn} onPress={() => setShowPlannerBuilder(true)}>
                                        <Ionicons name="refresh-outline" size={13} color="#1D4ED8" />
                                        <Text style={styles.currentPlanBtnText}>Нов маршрут</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.currentPlanBtn}
                                        onPress={() => {
                                            Alert.alert('Изчисти маршрута', 'Сигурен ли си?', [
                                                { text: 'Отказ', style: 'cancel' },
                                                {
                                                    text: 'Изчисти',
                                                    style: 'destructive',
                                                    onPress: async () => {
                                                        await cancelCommuteRouteNotification(targetFavorite.id);
                                                        await onSave(targetFavorite.id, {
                                                            commutePlan: null,
                                                            destinationLatitude: targetFavorite.latitude,
                                                            destinationLongitude: targetFavorite.longitude,
                                                        });
                                                        onClose();
                                                    },
                                                },
                                            ]);
                                        }}
                                    >
                                        <Ionicons name="trash-outline" size={13} color="#94A3B8" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : null}



                        <TouchableOpacity style={[styles.saveButton, !selectedItinerary && styles.saveButtonDisabled]} disabled={!selectedItinerary} onPress={savePlan}>
                            <Text style={styles.saveButtonText}>Запази маршрут</Text>
                        </TouchableOpacity>
            </ScrollView>
        </View>
    );

    if (inline) {
        return content;
    }

    return (
        <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
            <View style={styles.overlay}>
                {content}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.18)', justifyContent: 'flex-start', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 56) + 22 : 78, paddingHorizontal: 12 },
    card: { backgroundColor: '#FFFFFF', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', maxHeight: '92%', padding: 14, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 28 },
    inlineCard: { maxHeight: undefined, marginTop: 8, paddingHorizontal: 10, paddingVertical: 10 },
    content: { paddingBottom: 8, gap: 8 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    title: { color: '#0F172A', fontSize: 16, fontWeight: '700', flex: 1 },
    closeButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(248,250,252,0.72)', borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', flexShrink: 0 },
    sectionTitle: { color: '#0F172A', fontSize: 13, fontWeight: '700', marginTop: 4 },

    /* Origin / Destination rows */
    pointRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(248,250,252,0.72)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', paddingHorizontal: 10, paddingVertical: 2 },
    pointRowActive: { backgroundColor: 'rgba(239,246,255,0.82)', borderColor: 'rgba(147,197,253,0.72)' },
    pointInput: { flex: 1, color: '#0F172A', fontSize: 13, paddingVertical: 10 },
    pointLabel: { flex: 1, color: '#0F172A', fontSize: 13, fontWeight: '600', paddingVertical: 10 },
    pointResetBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    originInput: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', paddingHorizontal: 12, paddingVertical: 10, color: '#0F172A', fontSize: 13 },

    /* Search results */
    resultsList: { maxHeight: 160, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', backgroundColor: 'rgba(248,250,252,0.72)', padding: 6 },
    resultRow: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FFFFFF', marginBottom: 4 },
    resultTitle: { color: '#0F172A', fontSize: 12, fontWeight: '700' },
    resultSubtitle: { color: '#64748B', fontSize: 11, marginTop: 2 },
    resultStatus: { color: '#475569', fontSize: 12, textAlign: 'center', paddingVertical: 8 },

    /* Options chips */
    optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    optionChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(226,232,240,0.72)' },
    optionChipActive: { backgroundColor: '#1E3A8A' },
    optionChipText: { color: '#475569', fontSize: 11, fontWeight: '600' },
    optionChipTextActive: { color: '#FFFFFF' },

    /* Date/Time */
    arriveByRow: { flexDirection: 'row', gap: 6, marginBottom: 2, flexWrap: 'wrap' },
    arriveByChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(241,245,249,0.8)' },
    arriveByChipActive: { backgroundColor: '#1D4ED8' },
    arriveByChipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
    arriveByChipTextActive: { color: '#FFFFFF' },
    dateTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dateTimeInputWrap: { flex: 1 },
    timeInputWrap: { minWidth: 80, maxWidth: 112, flexShrink: 1 },
    dateTimeSep: { width: 1, height: 20, backgroundColor: 'rgba(226,232,240,0.72)' },
    dateTimeInput: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', paddingHorizontal: 10, paddingVertical: 9, color: '#0F172A', fontSize: 13, textAlign: 'center' },
    quickChip: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(239,246,255,0.82)', borderWidth: 1, borderColor: 'rgba(191,219,254,0.72)' },
    quickChipText: { color: '#1D4ED8', fontSize: 11, fontWeight: '700' },

    /* Search action */
    searchButton: { minHeight: 44, backgroundColor: '#1D4ED8', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    searchButtonDisabled: { backgroundColor: '#93C5FD' },
    searchButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    errorText: { color: '#B91C1C', fontSize: 12 },

    /* Route cards */
    routeCard: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.6)' },
    routeCardActive: { borderColor: 'rgba(29,78,216,0.6)', backgroundColor: 'rgba(239,246,255,0.82)' },
    cardSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    cardTime: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
    cardDuration: { fontSize: 13, color: '#64748B', fontWeight: '600' },
    cardModes: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
    legBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(248,250,252,0.82)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
    legRoute: { fontSize: 12, fontWeight: '700', color: '#1D4ED8', marginLeft: 4 },
    legWalkLabel: { fontSize: 11, fontWeight: '600', color: '#64748B', marginLeft: 3 },

    /* Route details */
    routeDetailsBox: { marginTop: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.6)' },
    legRow: { flexDirection: 'row', marginBottom: 12 },
    legRowWalk: { backgroundColor: 'rgba(248,250,252,0.82)', borderRadius: 10, padding: 8, marginHorizontal: -4 },
    legTimeCol: { minWidth: 42, justifyContent: 'space-between' },
    legTime: { fontSize: 11, color: '#64748B', fontWeight: '600' },
    legTimeline: { width: 14, alignItems: 'center', marginHorizontal: 2 },
    legDot: { width: 8, height: 8, borderRadius: 4 },
    legLine: { flex: 1, width: 2.5, borderRadius: 1.5 },
    legLineWalk: { borderWidth: 1, borderColor: '#94A3B8', borderStyle: 'dashed', backgroundColor: 'transparent', width: 0 },
    legInfo: { flex: 1 },
    legHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
    legMode: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
    legPlaceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginVertical: 1 },
    legPlace: { fontSize: 12, color: '#334155', flex: 1 },
    walkInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
    walkInfoText: { fontSize: 11, color: '#64748B', fontWeight: '600' },
    legStopsToggle: { fontSize: 12, color: '#1D4ED8', fontWeight: '600', paddingVertical: 2 },
    intermediateStops: { marginLeft: 4, marginBottom: 4, marginTop: 2, borderLeftWidth: 2, borderLeftColor: 'rgba(203,213,225,0.72)', paddingLeft: 10 },
    intermediateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
    intermediateTime: { fontSize: 11, color: '#64748B', minWidth: 36, fontWeight: '600' },
    intermediateDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#94A3B8' },
    intermediateName: { fontSize: 11, color: '#475569', flex: 1 },
    showOnMapButton: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'rgba(29,78,216,0.82)', borderRadius: 12, paddingVertical: 8 },
    showOnMapButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

    /* Notification */
    notifyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
    notifyLabel: { flex: 1, color: '#334155', fontSize: 13, fontWeight: '600' },
    reminderHint: { color: '#475569', fontSize: 11, lineHeight: 16 },
    weekdayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    weekdayChip: { minWidth: 40, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(226,232,240,0.72)', alignItems: 'center', justifyContent: 'center' },
    weekdayChipActive: { backgroundColor: '#0F766E' },
    weekdayChipText: { color: '#475569', fontSize: 11, fontWeight: '700' },
    weekdayChipTextActive: { color: '#FFFFFF' },
    offsetOptionsRow: { flexDirection: 'row', gap: 6 },
    reminderMinutesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    reminderMinutesLabel: { color: '#475569', fontSize: 11, fontWeight: '600' },
    reminderMinutesInput: { minWidth: 56, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(226,232,240,0.9)', paddingHorizontal: 10, paddingVertical: 8, color: '#0F172A', fontSize: 12, fontWeight: '700', backgroundColor: 'rgba(248,250,252,0.72)', textAlign: 'center' },
    reminderMinutesSuffix: { color: '#475569', fontSize: 11, fontWeight: '600' },

    /* Saved plan */
    currentPlanBox: { backgroundColor: 'rgba(248,250,252,0.72)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', padding: 10, gap: 6 },
    currentPlanText: { color: '#0F172A', fontSize: 12, fontWeight: '600' },
    currentPlanMeta: { color: '#0F766E', fontSize: 11 },
    currentPlanActions: { flexDirection: 'row', gap: 6, marginTop: 2 },
    currentPlanBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    currentPlanBtnText: { color: '#1D4ED8', fontSize: 10, fontWeight: '700' },

    /* Save */
    saveButton: { minHeight: 46, backgroundColor: '#1D4ED8', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    saveButtonDisabled: { backgroundColor: '#93C5FD' },
    saveButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
