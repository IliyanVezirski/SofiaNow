import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { cancelCommuteRouteNotification, scheduleCommuteRouteNotification } from './notifications/commuteRouteNotifications';

const FAVORITE_PLACES_KEY = '@sofiago:favorites:places';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const favoritePlaceListeners = new Set<() => void>();
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
    itineraryIndex: number;
    itinerarySummary: string;
    routeLabel: string;
    reminderTime: string | null;
    notificationEnabled: boolean;
    notificationIds: string[];
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
    notificationIds: string[];
    lastPlannedAt: number | null;
}

const toFavoriteId = (latitude: number, longitude: number) => `${latitude.toFixed(6)}:${longitude.toFixed(6)}`;
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
    defaultCommute: null,
});

const normalizeFavoriteCommutePlan = (value: unknown): FavoriteCommutePlan | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const raw = value as Partial<FavoriteCommutePlan> & { notificationId?: unknown; notificationIds?: unknown; reminderWeekdays?: unknown };
    const planType = raw.planType === '1' || raw.planType === '2' ? raw.planType : '0';
    const itineraryIndex = Number.isFinite(raw.itineraryIndex) ? Number(raw.itineraryIndex) : 0;
    const legacyNotificationId = raw.notificationId ? String(raw.notificationId).trim() : null;
    const notificationIds = Array.isArray(raw.notificationIds)
        ? raw.notificationIds.map((id) => String(id || '').trim()).filter(Boolean)
        : (legacyNotificationId ? [legacyNotificationId] : []);

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
        reminderWeekdays: normalizeFavoriteCommuteWeekdays(raw.reminderWeekdays),
        itineraryIndex,
        itinerarySummary: String(raw.itinerarySummary || '').trim(),
        routeLabel: String(raw.routeLabel || '').trim(),
        reminderTime: raw.reminderTime ? String(raw.reminderTime).trim() : null,
        notificationEnabled: !!raw.notificationEnabled,
        notificationIds,
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
        defaultCommute: normalizeFavoriteCommutePlan(raw.defaultCommute),
    };
};

const sortFavoritePlaces = (places: FavoritePlace[]) => {
    const presetOrder = new Map(DEFAULT_PRESET_ORDER.map((key, index) => [key, index]));

    return [...places].sort((left, right) => {
        if (left.presetKey && right.presetKey) {
            return (presetOrder.get(left.presetKey) ?? 99) - (presetOrder.get(right.presetKey) ?? 99);
        }
        if (left.presetKey) {
            return -1;
        }
        if (right.presetKey) {
            return 1;
        }
        return right.createdAtUnix - left.createdAtUnix;
    });
};

const ensureDefaultFavoritePlaces = (places: FavoritePlace[]) => {
    const byId = new Map(places.map((place) => [place.id, place]));

    DEFAULT_PRESET_ORDER.forEach((presetKey) => {
        const preset = createDefaultPresetFavorite(presetKey);
        if (!byId.has(preset.id)) {
            byId.set(preset.id, preset);
        }
    });

    return sortFavoritePlaces(Array.from(byId.values()));
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
    try {
        const raw = await AsyncStorage.getItem(FAVORITE_PLACES_KEY);
        if (!raw) {
            return ensureDefaultFavoritePlaces([]);
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return ensureDefaultFavoritePlaces([]);
        }

        return ensureDefaultFavoritePlaces(
            parsed
                .map(normalizeFavoritePlace)
                .filter((place): place is FavoritePlace => !!place),
        );
    } catch (error) {
        console.warn('Failed to load favorite places:', error);
        return ensureDefaultFavoritePlaces([]);
    }
};

const persistFavoritePlaces = async (places: FavoritePlace[]) => {
    await AsyncStorage.setItem(FAVORITE_PLACES_KEY, JSON.stringify(ensureDefaultFavoritePlaces(places)));
    favoritePlaceListeners.forEach((listener) => listener());
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

export const addFavoritePlace = async (input: {
    name: string;
    latitude: number;
    longitude: number;
    presetKey?: FavoritePresetKey | null;
    selectedStopId?: string | null;
    selectedStopName?: string | null;
    selectedLines?: FavoriteLinePreference[];
}): Promise<FavoritePlace[]> => {
    const normalizedName = String(input.name || '').trim();
    if (!normalizedName || !Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
        return loadFavoritePlaces();
    }

    const presetKey = input.presetKey === 'home' || input.presetKey === 'work' ? input.presetKey : null;

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
    };

    const existing = await loadFavoritePlaces();
    const deduped = existing.filter((place) => place.id !== favorite.id);
    const next = sortFavoritePlaces([favorite, ...deduped].slice(0, 60));
    await persistFavoritePlaces(next);
    return next;
};

export const removeFavoritePlace = async (favoriteId: string): Promise<FavoritePlace[]> => {
    const existing = await loadFavoritePlaces();
    const target = existing.find((place) => place.id === favoriteId);
    if (target?.defaultCommute?.notificationIds?.length) {
        await cancelCommuteRouteNotification(target.defaultCommute.notificationIds);
    }
    const next = target?.presetKey
        ? existing.map((place) => (place.id === favoriteId ? createDefaultPresetFavorite(target.presetKey as FavoritePresetKey) : place))
        : existing.filter((place) => place.id !== favoriteId);
    await persistFavoritePlaces(next);
    return next;
};

export const updateFavoritePlace = async (
    favoriteId: string,
    updates: Partial<Pick<FavoritePlace, 'latitude' | 'longitude' | 'selectedStopId' | 'selectedStopName' | 'selectedLines' | 'name' | 'defaultCommute'>>,
): Promise<FavoritePlace[]> => {
    if (!favoriteId) {
        return loadFavoritePlaces();
    }

    const existing = await loadFavoritePlaces();
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
            defaultCommute: updates.defaultCommute === undefined ? place.defaultCommute : normalizeFavoriteCommutePlan(updates.defaultCommute),
        } satisfies FavoritePlace;
    });

    await persistFavoritePlaces(next);
    return next;
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

export const reconcileFavoriteCommuteNotifications = async () => {
    const places = await loadFavoritePlaces();
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const scheduledIds = new Set(scheduledNotifications.map((item) => String(item.identifier || '').trim()).filter(Boolean));

    let hasChanges = false;
    let repairedCount = 0;

    const next = await Promise.all(places.map(async (place) => {
        const commutePlan = place.defaultCommute;
        if (!commutePlan?.notificationEnabled || !commutePlan.reminderTime || !commutePlan.reminderWeekdays.length) {
            return place;
        }

        const activeNotificationIds = commutePlan.notificationIds.filter((id) => scheduledIds.has(String(id || '').trim()));
        const expectedCount = commutePlan.reminderWeekdays.length;

        if (activeNotificationIds.length === expectedCount && activeNotificationIds.length > 0) {
            if (activeNotificationIds.length !== commutePlan.notificationIds.length) {
                hasChanges = true;
                return {
                    ...place,
                    defaultCommute: {
                        ...commutePlan,
                        notificationIds: activeNotificationIds,
                    },
                } satisfies FavoritePlace;
            }

            return place;
        }

        const scheduled = await scheduleCommuteRouteNotification({
            sourceName: commutePlan.originName || 'Начална точка',
            destinationName: commutePlan.destinationFavoriteName || place.name,
            routeSummary: commutePlan.itinerarySummary || commutePlan.routeLabel || `${commutePlan.originName || 'Начална точка'} → ${place.name}`,
            reminderTime: commutePlan.reminderTime,
            weekdays: commutePlan.reminderWeekdays,
            existingNotificationIds: commutePlan.notificationIds,
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

export const searchLocations = async (query: string, limit = 8): Promise<PlaceSearchResult[]> => {
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
        limit: String(Math.max(1, Math.min(limit, 12))),
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
