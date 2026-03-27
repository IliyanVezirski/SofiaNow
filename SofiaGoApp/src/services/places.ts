import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { cancelCommuteRouteNotification, scheduleCommuteRouteNotification } from './notifications/commuteRouteNotifications';
import { searchLocations as searchTripPlannerLocations, type TripLocation } from './tripPlanner';
import type { TripRouteGeoJSON } from '../features/tripPlanner/utils/routeGeoJson';

const FAVORITE_PLACES_KEY = '@sofiago:favorites:places';
const FAVORITE_DELETED_PRESETS_KEY = '@sofiago:favorites:deleted-presets';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const favoritePlaceListeners = new Set<() => void>();
let deletedPresetKeysCache: FavoritePresetKey[] | null = null;
// Approximate bounding box covering Sofia city + Sofia Province.
const SOFIA_WEST_LON = 22.35;
const SOFIA_EAST_LON = 24.35;
const SOFIA_NORTH_LAT = 43.25;
const SOFIA_SOUTH_LAT = 42.10;
const STREET_SEGMENT_REGEX = /(ул\.?|улица|бул\.?|булевард|жк\.?|кв\.?|пл\.?|ал\.?)/i;
const DIGIT_REGEX = /\d/;

export interface PlaceSearchResult {
    id: string;
    name: string;
    subtitle: string;
    latitude: number;
    longitude: number;
}

export type FavoritePresetKey = 'home' | 'work';
export type FavoriteCommuteWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface FavoriteLinePreference {
    line: string;
    enabled: boolean;
    notificationsEnabled: boolean;
}

export interface FavoriteCommuteRouteStop {
    name: string;
    stopCode: string | null;
    time: string | null;
}

export interface FavoriteCommuteRouteLineTab {
    id: string;
    line: string;
    label: string;
    mode: string;
    stops: FavoriteCommuteRouteStop[];
}

export interface FavoriteCommutePlan {
    originName: string;
    originLatitude: number | null;
    originLongitude: number | null;
    destinationFavoriteId: string | null;
    destinationFavoriteName: string | null;
    planType: '0' | '1' | '2';
    routeDate: string | null;
    routeTime: string | null;
    arriveBy: boolean;
    routeStartTime: string | null;
    reminderOffsetMinutes: number | null;
    reminderWeekdays: FavoriteCommuteWeekday[];
    notificationWeekdays: FavoriteCommuteWeekday[];
    firstTransitStopId: string | null;
    firstTransitStopName: string | null;
    firstTransitLine: string | null;
    firstTransitStopOffsetMinutes: number | null;
    walkDurationSeconds: number | null;
    walkDistanceMeters: number | null;
    routeGeoJson: TripRouteGeoJSON | null;
    itineraryIndex: number;
    itinerarySummary: string;
    routeLabel: string;
    transportLabels?: string[];
    routeLineTabs?: FavoriteCommuteRouteLineTab[];
    reminderTime: string | null;
    notificationEnabled: boolean;
    notificationIds: string[];
    notificationScheduleVersion: number | null;
    lastPlannedAt: number | null;
}

export interface FavoritePlace {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    createdAtUnix: number;
    presetKey: FavoritePresetKey | null;
    selectedStopId: string | null;
    selectedStopName: string | null;
    selectedLines: FavoriteLinePreference[];
    personalNotificationLeadMinutes: number | null;
    defaultCommute: FavoriteCommutePlan | null;
}

export interface StoredFavoriteCommuteReminder {
    favoriteId: string;
    favoriteName: string;
    routeLabel: string;
    itinerarySummary: string;
    reminderTime: string;
    routeStartTime: string | null;
    reminderOffsetMinutes: number | null;
    arriveBy: boolean;
    reminderWeekdays: FavoriteCommuteWeekday[];
    notificationWeekdays: FavoriteCommuteWeekday[];
    notificationIds: string[];
    lastPlannedAt: number | null;
}

const toFavoriteId = (latitude: number, longitude: number) => `${latitude.toFixed(6)}:${longitude.toFixed(6)}`;
export const FAVORITE_COMMUTE_NOTIFICATION_SCHEDULE_VERSION = 5;
const DEFAULT_PRESET_ORDER: FavoritePresetKey[] = ['home', 'work'];
export const FAVORITE_COMMUTE_WEEKDAY_OPTIONS: Array<{ value: FavoriteCommuteWeekday; shortLabel: string; fullLabel: string }> = [
    { value: 2, shortLabel: 'Пн', fullLabel: 'понеделник' },
    { value: 3, shortLabel: 'Вт', fullLabel: 'вторник' },
    { value: 4, shortLabel: 'Ср', fullLabel: 'сряда' },
    { value: 5, shortLabel: 'Чт', fullLabel: 'четвъртък' },
    { value: 6, shortLabel: 'Пт', fullLabel: 'петък' },
    { value: 7, shortLabel: 'Сб', fullLabel: 'събота' },
    { value: 1, shortLabel: 'Нд', fullLabel: 'неделя' },
];
const DEFAULT_COMMUTE_WEEKDAYS: FavoriteCommuteWeekday[] = FAVORITE_COMMUTE_WEEKDAY_OPTIONS.map((option) => option.value);

const normalizeFavoritePresetKeys = (value: unknown): FavoritePresetKey[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    const unique = new Set(value.map((entry) => String(entry || '').trim()).filter((entry): entry is FavoritePresetKey => entry === 'home' || entry === 'work'));
    return DEFAULT_PRESET_ORDER.filter((presetKey) => unique.has(presetKey));
};

const loadDeletedPresetKeys = async () => {
    if (deletedPresetKeysCache) {
        return [...deletedPresetKeysCache];
    }

    try {
        const raw = await AsyncStorage.getItem(FAVORITE_DELETED_PRESETS_KEY);
        deletedPresetKeysCache = normalizeFavoritePresetKeys(raw ? JSON.parse(raw) : []);
    } catch (error) {
        console.warn('Failed to load deleted preset favorites:', error);
        deletedPresetKeysCache = [];
    }

    return [...deletedPresetKeysCache];
};

const persistDeletedPresetKeys = async (presetKeys: FavoritePresetKey[]) => {
    const normalized = normalizeFavoritePresetKeys(presetKeys);
    deletedPresetKeysCache = normalized;

    if (!normalized.length) {
        await AsyncStorage.removeItem(FAVORITE_DELETED_PRESETS_KEY);
        return;
    }

    await AsyncStorage.setItem(FAVORITE_DELETED_PRESETS_KEY, JSON.stringify(normalized));
};

const normalizeFavoriteCommuteWeekdays = (value: unknown): FavoriteCommuteWeekday[] => {
    if (!Array.isArray(value)) {
        return [...DEFAULT_COMMUTE_WEEKDAYS];
    }

    const normalized = Array.from(new Set(
        value
            .map((entry) => Number(entry))
            .filter((entry): entry is FavoriteCommuteWeekday => Number.isInteger(entry) && entry >= 1 && entry <= 7),
    ));

    if (!normalized.length) {
        return [...DEFAULT_COMMUTE_WEEKDAYS];
    }

    return FAVORITE_COMMUTE_WEEKDAY_OPTIONS
        .map((option) => option.value)
        .filter((weekday) => normalized.includes(weekday));
};

export const formatFavoriteCommuteWeekdays = (weekdays: FavoriteCommuteWeekday[]) => {
    const normalized = normalizeFavoriteCommuteWeekdays(weekdays);
    if (normalized.length === FAVORITE_COMMUTE_WEEKDAY_OPTIONS.length) {
        return 'всеки ден';
    }

    return normalized
        .map((weekday) => FAVORITE_COMMUTE_WEEKDAY_OPTIONS.find((option) => option.value === weekday)?.shortLabel || String(weekday))
        .join(', ');
};

type FavoriteCommuteScheduleLike = {
    arriveBy?: boolean | null;
    routeStartTime?: string | null;
    reminderTime?: string | null;
    reminderWeekdays?: FavoriteCommuteWeekday[] | null;
    notificationWeekdays?: FavoriteCommuteWeekday[] | null;
};

const parseCommuteClock = (value: unknown) => {
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim());
    if (!match) {
        return null;
    }

    return {
        hour: Number(match[1]),
        minute: Number(match[2]),
    };
};

const formatCommuteReminderTimeFromRouteStart = (routeStartTime: string | null | undefined, minutesBefore: number) => {
    const routeStart = parseCommuteClock(routeStartTime);
    if (!routeStart) {
        return null;
    }

    const reminderDate = new Date(2000, 0, 1, routeStart.hour, routeStart.minute, 0, 0);
    reminderDate.setMinutes(reminderDate.getMinutes() - minutesBefore);
    return `${String(reminderDate.getHours()).padStart(2, '0')}:${String(reminderDate.getMinutes()).padStart(2, '0')}`;
};

const areFavoriteCommuteWeekdaysEqual = (left: FavoriteCommuteWeekday[], right: FavoriteCommuteWeekday[]) => {
    if (left.length !== right.length) {
        return false;
    }

    return left.every((weekday, index) => weekday === right[index]);
};

export const shiftFavoriteCommuteWeekdays = (weekdays: FavoriteCommuteWeekday[], dayShift: number) => {
    const normalized = normalizeFavoriteCommuteWeekdays(weekdays);
    if (!dayShift) {
        return normalized;
    }

    return normalized.map((weekday) => {
        const shifted = (((weekday - 1 + dayShift) % 7) + 7) % 7;
        return (shifted + 1) as FavoriteCommuteWeekday;
    });
};

export const getFavoriteCommuteNotificationDayShift = (plan: FavoriteCommuteScheduleLike | null | undefined) => {
    if (!plan?.arriveBy) {
        return 0;
    }

    const routeStart = parseCommuteClock(plan.routeStartTime);
    const reminder = parseCommuteClock(plan.reminderTime);
    if (!routeStart || !reminder) {
        return 0;
    }

    const routeStartMinutes = (routeStart.hour * 60) + routeStart.minute;
    const reminderMinutes = (reminder.hour * 60) + reminder.minute;
    const diffMinutes = reminderMinutes - routeStartMinutes;

    if (diffMinutes > 12 * 60) {
        return -1;
    }

    if (diffMinutes < -12 * 60) {
        return 1;
    }

    return 0;
};

export const resolveFavoriteCommuteNotificationWeekdays = (plan: FavoriteCommuteScheduleLike | null | undefined) => {
    const explicit = normalizeFavoriteCommuteWeekdays(plan?.notificationWeekdays);
    if (plan?.notificationWeekdays?.length) {
        return explicit;
    }

    const reminderWeekdays = normalizeFavoriteCommuteWeekdays(plan?.reminderWeekdays);
    return shiftFavoriteCommuteWeekdays(reminderWeekdays, getFavoriteCommuteNotificationDayShift(plan));
};

export const getFavoriteCommuteNotificationShiftLabel = (plan: FavoriteCommuteScheduleLike | null | undefined) => {
    const dayShift = getFavoriteCommuteNotificationDayShift(plan);
    if (dayShift < 0) {
        return 'предния ден';
    }

    if (dayShift > 0) {
        return 'следващия ден';
    }

    return null;
};

export const hasFavoriteCommuteNotificationDayShift = (plan: FavoriteCommuteScheduleLike | null | undefined) => {
    const reminderWeekdays = normalizeFavoriteCommuteWeekdays(plan?.reminderWeekdays);
    const notificationWeekdays = resolveFavoriteCommuteNotificationWeekdays(plan);
    return !areFavoriteCommuteWeekdaysEqual(reminderWeekdays, notificationWeekdays);
};

export const getFavoritePresetLabel = (presetKey: FavoritePresetKey) => (
    presetKey === 'home' ? 'Вкъщи' : 'Работа'
);

export const hasFavoriteCoordinates = (favorite: FavoritePlace) => (
    Number.isFinite(favorite.latitude) && Number.isFinite(favorite.longitude)
);

const createDefaultPresetFavorite = (presetKey: FavoritePresetKey): FavoritePlace => ({
    id: `preset-${presetKey}`,
    name: getFavoritePresetLabel(presetKey),
    latitude: null,
    longitude: null,
    createdAtUnix: 0,
    presetKey,
    selectedStopId: null,
    selectedStopName: null,
    selectedLines: [],
    personalNotificationLeadMinutes: 5,
    defaultCommute: null,
});

const normalizeTripRouteGeoJSON = (value: unknown): TripRouteGeoJSON | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const raw = value as Partial<TripRouteGeoJSON>;
    if (raw.type !== 'FeatureCollection' || !Array.isArray(raw.features) || !raw.endpoints || !Array.isArray(raw.transitStops)) {
        return null;
    }

    return raw as TripRouteGeoJSON;
};

const normalizeFavoriteCommuteRouteLineTabs = (value: unknown): FavoriteCommuteRouteLineTab[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry, index) => {
            if (!entry || typeof entry !== 'object') {
                return null;
            }

            const raw = entry as Partial<FavoriteCommuteRouteLineTab>;
            const line = String(raw.line || '').trim().toUpperCase();
            const label = String(raw.label || '').trim();
            if (!line || !label) {
                return null;
            }

            const stops = Array.isArray(raw.stops)
                ? raw.stops
                    .map((stopEntry) => {
                        if (!stopEntry || typeof stopEntry !== 'object') {
                            return null;
                        }

                        const rawStop = stopEntry as Partial<FavoriteCommuteRouteStop>;
                        const name = String(rawStop.name || '').trim();
                        if (!name) {
                            return null;
                        }

                        return {
                            name,
                            stopCode: rawStop.stopCode ? String(rawStop.stopCode).trim() : null,
                            time: rawStop.time ? String(rawStop.time).trim() : null,
                        } satisfies FavoriteCommuteRouteStop;
                    })
                    .filter((stop): stop is FavoriteCommuteRouteStop => !!stop)
                : [];

            return {
                id: raw.id ? String(raw.id).trim() : `${line}-${index}`,
                line,
                label,
                mode: raw.mode ? String(raw.mode).trim().toUpperCase() : '',
                stops,
            } satisfies FavoriteCommuteRouteLineTab;
        })
        .filter((entry): entry is FavoriteCommuteRouteLineTab => !!entry);
};

const normalizeFavoriteCommutePlan = (value: unknown): FavoriteCommutePlan | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const raw = value as Partial<FavoriteCommutePlan> & {
        notificationId?: unknown;
        notificationIds?: unknown;
        reminderWeekdays?: unknown;
        notificationWeekdays?: unknown;
        notificationScheduleVersion?: unknown;
    };
    const planType = raw.planType === '1' || raw.planType === '2' ? raw.planType : '0';
    const itineraryIndex = Number.isFinite(raw.itineraryIndex) ? Number(raw.itineraryIndex) : 0;
    const legacyNotificationId = raw.notificationId ? String(raw.notificationId).trim() : null;
    const notificationIds = Array.isArray(raw.notificationIds)
        ? raw.notificationIds.map((id) => String(id || '').trim()).filter(Boolean)
        : (legacyNotificationId ? [legacyNotificationId] : []);
    const reminderWeekdays = normalizeFavoriteCommuteWeekdays(raw.reminderWeekdays);
    const notificationWeekdays = resolveFavoriteCommuteNotificationWeekdays({
        arriveBy: !!raw.arriveBy,
        routeStartTime: raw.routeStartTime ? String(raw.routeStartTime).trim() : null,
        reminderTime: raw.reminderTime ? String(raw.reminderTime).trim() : null,
        reminderWeekdays,
        notificationWeekdays: Array.isArray(raw.notificationWeekdays) ? (raw.notificationWeekdays as FavoriteCommuteWeekday[]) : null,
    });

    return {
        originName: String(raw.originName || '').trim(),
        originLatitude: Number.isFinite(raw.originLatitude) ? Number(raw.originLatitude) : null,
        originLongitude: Number.isFinite(raw.originLongitude) ? Number(raw.originLongitude) : null,
        destinationFavoriteId: raw.destinationFavoriteId ? String(raw.destinationFavoriteId).trim() : null,
        destinationFavoriteName: raw.destinationFavoriteName ? String(raw.destinationFavoriteName).trim() : null,
        planType,
        routeDate: raw.routeDate ? String(raw.routeDate).trim() : null,
        routeTime: raw.routeTime ? String(raw.routeTime).trim() : null,
        arriveBy: !!raw.arriveBy,
        routeStartTime: raw.routeStartTime ? String(raw.routeStartTime).trim() : null,
        reminderOffsetMinutes: Number.isFinite(raw.reminderOffsetMinutes) ? Number(raw.reminderOffsetMinutes) : null,
        reminderWeekdays,
        notificationWeekdays,
        firstTransitStopId: raw.firstTransitStopId ? String(raw.firstTransitStopId).trim() : null,
        firstTransitStopName: raw.firstTransitStopName ? String(raw.firstTransitStopName).trim() : null,
        firstTransitLine: raw.firstTransitLine ? String(raw.firstTransitLine).trim().toUpperCase() : null,
        firstTransitStopOffsetMinutes: Number.isFinite(raw.firstTransitStopOffsetMinutes) ? Number(raw.firstTransitStopOffsetMinutes) : null,
        walkDurationSeconds: Number.isFinite(raw.walkDurationSeconds) ? Number(raw.walkDurationSeconds) : null,
        walkDistanceMeters: Number.isFinite(raw.walkDistanceMeters) ? Number(raw.walkDistanceMeters) : null,
        routeGeoJson: normalizeTripRouteGeoJSON(raw.routeGeoJson),
        itineraryIndex,
        itinerarySummary: String(raw.itinerarySummary || '').trim(),
        routeLabel: String(raw.routeLabel || '').trim(),
        transportLabels: Array.isArray(raw.transportLabels)
            ? raw.transportLabels.map((entry) => String(entry || '').trim()).filter(Boolean)
            : [],
        routeLineTabs: normalizeFavoriteCommuteRouteLineTabs(raw.routeLineTabs),
        reminderTime: raw.reminderTime ? String(raw.reminderTime).trim() : null,
        notificationEnabled: !!raw.notificationEnabled,
        notificationIds,
        notificationScheduleVersion: Number.isFinite(raw.notificationScheduleVersion) ? Number(raw.notificationScheduleVersion) : null,
        lastPlannedAt: Number.isFinite(raw.lastPlannedAt) ? Number(raw.lastPlannedAt) : null,
    };
};

const normalizeFavoriteLinePreferences = (value: unknown): FavoriteLinePreference[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    const lineMap = new Map<string, FavoriteLinePreference>();
    value.forEach((entry) => {
        const line = String((entry as FavoriteLinePreference | undefined)?.line || '').trim().toUpperCase();
        if (!line) {
            return;
        }

        lineMap.set(line, {
            line,
            enabled: !!(entry as FavoriteLinePreference | undefined)?.enabled,
            notificationsEnabled: !!(entry as FavoriteLinePreference | undefined)?.notificationsEnabled,
        });
    });

    return Array.from(lineMap.values()).sort((left, right) => left.line.localeCompare(right.line, 'bg', { numeric: true }));
};

const normalizeFavoriteNotificationLeadMinutes = (value: unknown) => (Number(value) === 10 ? 10 : 5);

const syncFavoriteLineNotifications = (lines: FavoriteLinePreference[], enabled: boolean, primaryLine?: string | null): FavoriteLinePreference[] => {
    const normalizedPrimaryLine = String(primaryLine || '').trim().toUpperCase();
    const fallbackPrimaryLine = lines.find((entry) => entry.enabled)?.line || '';
    const effectivePrimaryLine = normalizedPrimaryLine || fallbackPrimaryLine;

    return normalizeFavoriteLinePreferences(lines.map((entry) => ({
        ...entry,
        notificationsEnabled: enabled ? !!entry.enabled && entry.line === effectivePrimaryLine : false,
    })));
};

const normalizeFavoritePlace = (value: unknown): FavoritePlace | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const raw = value as Partial<FavoritePlace> & { presetKey?: FavoritePresetKey | null };
    const presetKey = raw.presetKey === 'home' || raw.presetKey === 'work' ? raw.presetKey : null;
    const latitude = Number.isFinite(raw.latitude) ? Number(raw.latitude) : null;
    const longitude = Number.isFinite(raw.longitude) ? Number(raw.longitude) : null;
    const createdAtUnix = Number.isFinite(raw.createdAtUnix) ? Number(raw.createdAtUnix) : Date.now();
    const defaultName = presetKey ? getFavoritePresetLabel(presetKey) : 'Любимо място';
    const id = String(raw.id || (presetKey ? `preset-${presetKey}` : '')).trim();

    if (!id) {
        return null;
    }

    return {
        id,
        name: String(raw.name || defaultName).trim() || defaultName,
        latitude,
        longitude,
        createdAtUnix,
        presetKey,
        selectedStopId: raw.selectedStopId ? String(raw.selectedStopId).trim() : null,
        selectedStopName: raw.selectedStopName ? String(raw.selectedStopName).trim() : null,
        selectedLines: normalizeFavoriteLinePreferences(raw.selectedLines),
        personalNotificationLeadMinutes: normalizeFavoriteNotificationLeadMinutes((raw as Partial<FavoritePlace>).personalNotificationLeadMinutes ?? raw.defaultCommute?.reminderOffsetMinutes),
        defaultCommute: normalizeFavoriteCommutePlan(raw.defaultCommute),
    };
};

const orderFavoritePlaces = (places: FavoritePlace[], deletedPresetKeys: FavoritePresetKey[] = []) => {
    const deduped: FavoritePlace[] = [];
    const seenIds = new Set<string>();

    places.forEach((place) => {
        if (!place?.id || seenIds.has(place.id)) {
            return;
        }

        if (place.presetKey && deletedPresetKeys.includes(place.presetKey)) {
            return;
        }

        seenIds.add(place.id);
        deduped.push(place);
    });

    const missingPresets = DEFAULT_PRESET_ORDER
        .filter((presetKey) => !deletedPresetKeys.includes(presetKey))
        .map((presetKey) => createDefaultPresetFavorite(presetKey))
        .filter((preset) => !seenIds.has(preset.id));

    return [...missingPresets, ...deduped].slice(0, 60);
};

const ensureDefaultFavoritePlaces = (places: FavoritePlace[], deletedPresetKeys: FavoritePresetKey[] = []) => {
    return orderFavoritePlaces(places, deletedPresetKeys);
};

const pickBestDisplayAddressSegment = (displayName: string) => {
    const parts = String(displayName || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    if (!parts.length) {
        return '';
    }

    const streetWithNumber = parts.find((part) => STREET_SEGMENT_REGEX.test(part) && DIGIT_REGEX.test(part));
    if (streetWithNumber) {
        return streetWithNumber;
    }

    const anyNumbered = parts.find((part) => DIGIT_REGEX.test(part));
    if (anyNumbered) {
        return anyNumbered;
    }

    return parts[0];
};

export const loadFavoritePlaces = async (): Promise<FavoritePlace[]> => {
    const deletedPresetKeys = await loadDeletedPresetKeys();

    try {
        const raw = await AsyncStorage.getItem(FAVORITE_PLACES_KEY);
        if (!raw) {
            return ensureDefaultFavoritePlaces([], deletedPresetKeys);
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return ensureDefaultFavoritePlaces([], deletedPresetKeys);
        }

        return ensureDefaultFavoritePlaces(
            parsed
                .map(normalizeFavoritePlace)
                .filter((place): place is FavoritePlace => !!place),
            deletedPresetKeys,
        );
    } catch (error) {
        console.warn('Failed to load favorite places:', error);
        return ensureDefaultFavoritePlaces([], deletedPresetKeys);
    }
};

const persistFavoritePlaces = async (places: FavoritePlace[]) => {
    const deletedPresetKeys = await loadDeletedPresetKeys();
    const next = ensureDefaultFavoritePlaces(places, deletedPresetKeys);
    await AsyncStorage.setItem(FAVORITE_PLACES_KEY, JSON.stringify(next));
    favoritePlaceListeners.forEach((listener) => listener());
    return next;
};

export const subscribeToFavoritePlaceChanges = (listener: () => void) => {
    favoritePlaceListeners.add(listener);
    return () => {
        favoritePlaceListeners.delete(listener);
    };
};

export const listFavoriteCommuteReminders = async (): Promise<StoredFavoriteCommuteReminder[]> => {
    const places = await loadFavoritePlaces();

    return places
        .filter((place) => place.defaultCommute?.notificationEnabled && place.defaultCommute.notificationIds.length > 0 && place.defaultCommute.reminderTime)
        .map((place) => ({
            favoriteId: place.id,
            favoriteName: place.name,
            routeLabel: place.defaultCommute?.routeLabel || `${place.defaultCommute?.originName || 'Начална точка'} → ${place.name}`,
            itinerarySummary: place.defaultCommute?.itinerarySummary || '',
            reminderTime: place.defaultCommute?.reminderTime || '',
            routeStartTime: place.defaultCommute?.routeStartTime || null,
            reminderOffsetMinutes: place.defaultCommute?.reminderOffsetMinutes ?? null,
            arriveBy: !!place.defaultCommute?.arriveBy,
            reminderWeekdays: place.defaultCommute?.reminderWeekdays || [...DEFAULT_COMMUTE_WEEKDAYS],
            notificationWeekdays: place.defaultCommute?.notificationWeekdays || resolveFavoriteCommuteNotificationWeekdays(place.defaultCommute),
            notificationIds: place.defaultCommute?.notificationIds || [],
            lastPlannedAt: place.defaultCommute?.lastPlannedAt || null,
        }))
        .sort((left, right) => left.reminderTime.localeCompare(right.reminderTime, 'bg'));
};

export const cancelFavoriteCommuteReminder = async (favoriteId: string) => {
    if (!favoriteId) {
        return {
            ok: false,
            message: 'Липсва място за това уведомление.',
        };
    }

    const places = await loadFavoritePlaces();
    const target = places.find((place) => place.id === favoriteId) ?? null;
    const defaultCommute = target?.defaultCommute ?? null;

    if (!target || !defaultCommute?.notificationEnabled || defaultCommute.notificationIds.length === 0) {
        return {
            ok: false,
            message: 'Уведомлението вече не е активно.',
        };
    }

    await cancelCommuteRouteNotification(defaultCommute.notificationIds);

    const next = places.map((place) => {
        if (place.id !== favoriteId || !place.defaultCommute) {
            return place;
        }

        return {
            ...place,
            selectedLines: syncFavoriteLineNotifications(place.selectedLines, false),
            defaultCommute: {
                ...place.defaultCommute,
                notificationEnabled: false,
                notificationIds: [],
            },
        } satisfies FavoritePlace;
    });

    await persistFavoritePlaces(next);

    return {
        ok: true,
        message: `Уведомлението за ${target.name} е премахнато.`,
    };
};

export const setFavoriteCommuteReminderEnabled = async (favoriteId: string, enabled: boolean) => {
    return updateFavoriteCommuteReminderSettings(favoriteId, { enabled });
};

export const updateFavoriteCommuteReminderSettings = async (
    favoriteId: string,
    updates: {
        enabled?: boolean;
        reminderOffsetMinutes?: number;
    },
) => {
    const normalizedOffset = updates.reminderOffsetMinutes === 10 ? 10 : 5;

    if (!favoriteId) {
        return {
            ok: false,
            message: 'Липсва място за това уведомление.',
        };
    }

    const places = await loadFavoritePlaces();
    const target = places.find((place) => place.id === favoriteId) ?? null;
    const commutePlan = target?.defaultCommute ?? null;

    if (!target || !commutePlan?.itinerarySummary) {
        return {
            ok: false,
            message: 'Първо запази маршрут за това място.',
        };
    }

    const reminderOffsetMinutes = updates.reminderOffsetMinutes == null
        ? (commutePlan.reminderOffsetMinutes === 10 ? 10 : 5)
        : normalizedOffset;
    const reminderTime = formatCommuteReminderTimeFromRouteStart(commutePlan.routeStartTime, reminderOffsetMinutes) || commutePlan.reminderTime;
    if (!reminderTime) {
        return {
            ok: false,
            message: 'Липсва начален час на маршрута за това известие.',
        };
    }

    const nextEnabled = updates.enabled ?? commutePlan.notificationEnabled;
    const notificationWeekdays = resolveFavoriteCommuteNotificationWeekdays({
        ...commutePlan,
        reminderTime,
    });

    let notificationIds = commutePlan.notificationIds || [];
    let successMessage = nextEnabled
        ? `Известието за ${target.name} е обновено.`
        : `Известието за ${target.name} е изключено.`;

    if (nextEnabled) {
        const scheduled = await scheduleCommuteRouteNotification({
            favoriteId: target.id,
            sourceName: commutePlan.originName || 'Начална точка',
            destinationName: commutePlan.destinationFavoriteName || target.name,
            routeSummary: commutePlan.itinerarySummary || commutePlan.routeLabel || `${commutePlan.originName || 'Начална точка'} → ${target.name}`,
            reminderTime,
            weekdays: notificationWeekdays,
            existingNotificationIds: commutePlan.notificationIds,
            reminderOffsetMinutes,
            firstTransitStopId: commutePlan.firstTransitStopId,
            firstTransitStopName: commutePlan.firstTransitStopName,
            firstTransitLine: commutePlan.firstTransitLine,
            firstTransitStopOffsetMinutes: commutePlan.firstTransitStopOffsetMinutes,
            walkDurationSeconds: commutePlan.walkDurationSeconds,
            walkDistanceMeters: commutePlan.walkDistanceMeters,
        });

        if (!scheduled.ok || !scheduled.notificationIds?.length) {
            return {
                ok: false,
                message: scheduled.message || 'Неуспешно обновяване на маршрутното известие.',
            };
        }

        notificationIds = scheduled.notificationIds;
        successMessage = scheduled.message || successMessage;
    } else if (commutePlan.notificationIds.length) {
        await cancelCommuteRouteNotification(commutePlan.notificationIds);
        notificationIds = [];
    }

    const next = places.map((place) => {
        if (place.id !== favoriteId || !place.defaultCommute) {
            return place;
        }

        return {
            ...place,
            selectedLines: syncFavoriteLineNotifications(place.selectedLines, nextEnabled, place.defaultCommute.firstTransitLine),
            personalNotificationLeadMinutes: reminderOffsetMinutes,
            defaultCommute: {
                ...place.defaultCommute,
                reminderOffsetMinutes,
                reminderTime,
                notificationEnabled: nextEnabled,
                notificationWeekdays,
                notificationIds,
                notificationScheduleVersion: FAVORITE_COMMUTE_NOTIFICATION_SCHEDULE_VERSION,
            },
        } satisfies FavoritePlace;
    });

    await persistFavoritePlaces(next);

    return {
        ok: true,
        message: successMessage,
    };
};

export const addFavoritePlace = async (input: {
    name: string;
    latitude: number;
    longitude: number;
    presetKey?: FavoritePresetKey | null;
    selectedStopId?: string | null;
    selectedStopName?: string | null;
    selectedLines?: FavoriteLinePreference[];
    personalNotificationLeadMinutes?: number | null;
}): Promise<FavoritePlace[]> => {
    const normalizedName = String(input.name || '').trim();
    if (!normalizedName || !Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
        return loadFavoritePlaces();
    }

    const presetKey = input.presetKey === 'home' || input.presetKey === 'work' ? input.presetKey : null;
    if (presetKey) {
        const deletedPresetKeys = await loadDeletedPresetKeys();
        if (deletedPresetKeys.includes(presetKey)) {
            await persistDeletedPresetKeys(deletedPresetKeys.filter((entry) => entry !== presetKey));
        }
    }

    const favorite: FavoritePlace = {
        id: presetKey ? `preset-${presetKey}` : toFavoriteId(input.latitude, input.longitude),
        name: presetKey ? getFavoritePresetLabel(presetKey) : normalizedName,
        latitude: input.latitude,
        longitude: input.longitude,
        createdAtUnix: Date.now(),
        presetKey,
        selectedStopId: input.selectedStopId ? String(input.selectedStopId).trim() : null,
        selectedStopName: input.selectedStopName ? String(input.selectedStopName).trim() : null,
        selectedLines: normalizeFavoriteLinePreferences(input.selectedLines),
        personalNotificationLeadMinutes: normalizeFavoriteNotificationLeadMinutes(input.personalNotificationLeadMinutes),
        defaultCommute: null,
    };

    const existing = await loadFavoritePlaces();
    const deduped = existing.filter((place) => place.id !== favorite.id);
    const next = await persistFavoritePlaces([favorite, ...deduped]);
    return next;
};

export const removeFavoritePlace = async (favoriteId: string): Promise<FavoritePlace[]> => {
    const existing = await loadFavoritePlaces();
    const target = existing.find((place) => place.id === favoriteId);
    if (target?.defaultCommute?.notificationIds?.length) {
        await cancelCommuteRouteNotification(target.defaultCommute.notificationIds);
    }
    if (target?.presetKey) {
        const deletedPresetKeys = await loadDeletedPresetKeys();
        await persistDeletedPresetKeys([...deletedPresetKeys, target.presetKey]);
    }

    const next = existing.filter((place) => place.id !== favoriteId);
    return persistFavoritePlaces(next);
};

export const updateFavoritePlace = async (
    favoriteId: string,
    updates: Partial<Pick<FavoritePlace, 'latitude' | 'longitude' | 'selectedStopId' | 'selectedStopName' | 'selectedLines' | 'name' | 'personalNotificationLeadMinutes' | 'defaultCommute'>>,
): Promise<FavoritePlace[]> => {
    if (!favoriteId) {
        return loadFavoritePlaces();
    }

    const existing = await loadFavoritePlaces();
    const target = existing.find((place) => place.id === favoriteId);
    if (updates.defaultCommute === null && target?.defaultCommute?.notificationIds?.length) {
        await cancelCommuteRouteNotification(target.defaultCommute.notificationIds);
    }

    const next = existing.map((place) => {
        if (place.id !== favoriteId) {
            return place;
        }

        const nextLatitude = updates.latitude === undefined ? place.latitude : (Number.isFinite(updates.latitude) ? Number(updates.latitude) : null);
        const nextLongitude = updates.longitude === undefined ? place.longitude : (Number.isFinite(updates.longitude) ? Number(updates.longitude) : null);
        const nextName = typeof updates.name === 'string' && updates.name.trim()
            ? updates.name.trim()
            : place.name;

        return {
            ...place,
            name: nextName,
            latitude: nextLatitude,
            longitude: nextLongitude,
            selectedStopId: updates.selectedStopId === undefined ? place.selectedStopId : (updates.selectedStopId ? String(updates.selectedStopId).trim() : null),
            selectedStopName: updates.selectedStopName === undefined ? place.selectedStopName : (updates.selectedStopName ? String(updates.selectedStopName).trim() : null),
            selectedLines: updates.selectedLines === undefined ? place.selectedLines : normalizeFavoriteLinePreferences(updates.selectedLines),
            personalNotificationLeadMinutes: updates.personalNotificationLeadMinutes === undefined ? place.personalNotificationLeadMinutes : normalizeFavoriteNotificationLeadMinutes(updates.personalNotificationLeadMinutes),
            defaultCommute: updates.defaultCommute === undefined ? place.defaultCommute : normalizeFavoriteCommutePlan(updates.defaultCommute),
        } satisfies FavoritePlace;
    });

    return persistFavoritePlaces(next);
};

export const updateFavoritePlaceName = async (
    favoriteId: string,
    name: string,
): Promise<FavoritePlace[]> => {
    const normalizedName = String(name || '').trim();
    if (!favoriteId || !normalizedName) {
        return loadFavoritePlaces();
    }

    return updateFavoritePlace(favoriteId, { name: normalizedName });
};

export const reorderFavoritePlaces = async (orderedFavoriteIds: string[]): Promise<FavoritePlace[]> => {
    const existing = await loadFavoritePlaces();
    if (!orderedFavoriteIds.length) {
        return existing;
    }

    const byId = new Map(existing.map((place) => [place.id, place]));
    const seenIds = new Set<string>();
    const reordered = orderedFavoriteIds
        .map((favoriteId) => String(favoriteId || '').trim())
        .filter((favoriteId) => favoriteId && !seenIds.has(favoriteId) && byId.has(favoriteId))
        .map((favoriteId) => {
            seenIds.add(favoriteId);
            return byId.get(favoriteId) as FavoritePlace;
        });

    existing.forEach((place) => {
        if (!seenIds.has(place.id)) {
            reordered.push(place);
        }
    });

    return persistFavoritePlaces(reordered);
};

export const reconcileFavoriteCommuteNotifications = async () => {
    const places = await loadFavoritePlaces();
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const scheduledNotificationIds = new Set(
        scheduledNotifications.map((entry) => String(entry.identifier || '').trim()).filter(Boolean),
    );

    let hasChanges = false;
    let repairedCount = 0;

    const next = await Promise.all(places.map(async (place) => {
        const commutePlan = place.defaultCommute;
        if (!commutePlan?.notificationEnabled || !commutePlan.reminderTime || !commutePlan.notificationWeekdays.length) {
            return place;
        }

        const expectedNotificationCount = Array.from(new Set(
            commutePlan.notificationWeekdays
                .map((weekday) => Number(weekday))
                .filter((weekday): weekday is FavoriteCommuteWeekday => Number.isInteger(weekday) && weekday >= 1 && weekday <= 7),
        )).length;
        const scheduledCount = commutePlan.notificationIds.filter((notificationId) => scheduledNotificationIds.has(notificationId)).length;
        const scheduleVersion = commutePlan.notificationScheduleVersion ?? 0;
        if (scheduleVersion >= FAVORITE_COMMUTE_NOTIFICATION_SCHEDULE_VERSION && scheduledCount === expectedNotificationCount) {
            return place;
        }

        const scheduled = await scheduleCommuteRouteNotification({
            favoriteId: place.id,
            sourceName: commutePlan.originName || 'Начална точка',
            destinationName: commutePlan.destinationFavoriteName || place.name,
            routeSummary: commutePlan.itinerarySummary || commutePlan.routeLabel || `${commutePlan.originName || 'Начална точка'} → ${place.name}`,
            reminderTime: commutePlan.reminderTime,
            weekdays: commutePlan.notificationWeekdays,
            existingNotificationIds: commutePlan.notificationIds,
            reminderOffsetMinutes: commutePlan.reminderOffsetMinutes,
            firstTransitStopId: commutePlan.firstTransitStopId,
            firstTransitStopName: commutePlan.firstTransitStopName,
            firstTransitLine: commutePlan.firstTransitLine,
            firstTransitStopOffsetMinutes: commutePlan.firstTransitStopOffsetMinutes,
            walkDurationSeconds: commutePlan.walkDurationSeconds,
            walkDistanceMeters: commutePlan.walkDistanceMeters,
        });

        if (!scheduled.ok || !scheduled.notificationIds?.length) {
            return place;
        }

        hasChanges = true;
        repairedCount += 1;

        return {
            ...place,
            defaultCommute: {
                ...commutePlan,
                notificationIds: scheduled.notificationIds,
                notificationScheduleVersion: FAVORITE_COMMUTE_NOTIFICATION_SCHEDULE_VERSION,
            },
        } satisfies FavoritePlace;
    }));

    if (hasChanges) {
        await persistFavoritePlaces(next);
    }

    return {
        ok: true,
        repairedCount,
    };
};

export const searchCentralLocations = async (query: string, limit = 8): Promise<PlaceSearchResult[]> => {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) {
        return [];
    }

    const normalizedLimit = Math.max(1, Math.min(limit, 12));
    const searchResults = await Promise.allSettled([
        searchTripPlannerLocations(normalizedQuery),
        searchNominatimLocations(normalizedQuery, normalizedLimit),
    ]);

    const tripPlannerResults = searchResults[0].status === 'fulfilled'
        ? searchResults[0].value
            .map(mapTripPlannerLocationToPlaceSearchResult)
            .filter((entry): entry is PlaceSearchResult => !!entry)
        : [];
    const nominatimResults = searchResults[1].status === 'fulfilled' ? searchResults[1].value : [];

    if (!tripPlannerResults.length && !nominatimResults.length) {
        const firstRejected = searchResults.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (firstRejected) {
            throw firstRejected.reason;
        }
        return [];
    }

    return mergePlaceSearchResults(tripPlannerResults, nominatimResults, normalizedLimit);
};

export const searchLocations = async (query: string, limit = 8): Promise<PlaceSearchResult[]> => {
    const normalizedLimit = Math.max(1, Math.min(limit, 12));
    return searchNominatimLocations(query, normalizedLimit);
};

const buildPlaceSearchResultKey = (entry: Pick<PlaceSearchResult, 'name' | 'latitude' | 'longitude'>) => {
    const normalizedName = String(entry.name || '').trim().toLocaleLowerCase('bg-BG');
    const latitude = Number(entry.latitude).toFixed(5);
    const longitude = Number(entry.longitude).toFixed(5);
    return `${normalizedName}|${latitude}|${longitude}`;
};

const mergePlaceSearchResults = (
    primary: PlaceSearchResult[],
    secondary: PlaceSearchResult[],
    limit: number,
): PlaceSearchResult[] => {
    const seen = new Set<string>();
    const merged: PlaceSearchResult[] = [];

    for (const entry of [...primary, ...secondary]) {
        const key = buildPlaceSearchResultKey(entry);
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        merged.push(entry);

        if (merged.length >= limit) {
            break;
        }
    }

    return merged;
};

const mapTripPlannerLocationToPlaceSearchResult = (location: TripLocation): PlaceSearchResult | null => {
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);
    const name = String(location?.name || '').trim();

    if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    return {
        id: `cgm:${latitude.toFixed(6)}:${longitude.toFixed(6)}:${name}`,
        name,
        subtitle: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        latitude,
        longitude,
    } satisfies PlaceSearchResult;
};

const searchNominatimLocations = async (query: string, limit: number): Promise<PlaceSearchResult[]> => {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) {
        return [];
    }

    // Bias all free-text queries to Sofia so house-number lookups resolve consistently.
    const normalizedForLookup = /софия/i.test(normalizedQuery)
        ? normalizedQuery
        : `${normalizedQuery}, София`;

    const params = new URLSearchParams({
        q: normalizedForLookup,
        format: 'jsonv2',
        limit: String(limit),
        addressdetails: '1',
        'accept-language': 'bg',
        countrycodes: 'bg',
        bounded: '1',
        viewbox: `${SOFIA_WEST_LON},${SOFIA_NORTH_LAT},${SOFIA_EAST_LON},${SOFIA_SOUTH_LAT}`,
    });

    const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
        headers: { 'User-Agent': 'SofiaGo/1.0 (transit app for Sofia; https://github.com/nickkostov/SofiaGo)' },
    });
    if (!response.ok) {
        throw new Error(`Location search failed with status ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
        return [];
    }

    return data
        .map((item: any) => {
            const latitude = Number(item?.lat);
            const longitude = Number(item?.lon);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                return null;
            }

            const displayName = String(item?.display_name || '').trim();
            const displayParts = displayName.split(',').map((entry) => entry.trim()).filter(Boolean);
            const address = item?.address || {};
            const streetName = String(
                address.road
                || address.pedestrian
                || address.footway
                || address.path
                || address.cycleway
                || address.residential
                || ''
            ).trim();
            const houseNumber = String(address.house_number || '').trim();
            const suburb = String(address.suburb || address.neighbourhood || address.quarter || '').trim();
            const city = String(address.city || address.town || address.village || address.county || '').trim();

            const explicitTitle = [streetName, houseNumber].filter(Boolean).join(' ').trim();
            const bestDisplaySegment = pickBestDisplayAddressSegment(displayName);
            const fallbackTitle = bestDisplaySegment || displayParts[0] || String(item?.name || '').trim() || normalizedQuery;
            const subtitleParts = [suburb, city].filter(Boolean);
            const fallbackSubtitle = displayParts.filter((part) => part !== fallbackTitle).slice(0, 3).join(', ');

            return {
                id: String(item?.place_id || `${latitude}:${longitude}`),
                name: explicitTitle || fallbackTitle,
                subtitle: subtitleParts.length ? subtitleParts.join(', ') : fallbackSubtitle,
                latitude,
                longitude,
            } satisfies PlaceSearchResult;
        })
        .filter((entry: PlaceSearchResult | null): entry is PlaceSearchResult => !!entry);
};
