import type { TripRouteGeoJSON } from '../../features/tripPlanner/utils/routeGeoJson';
import type { Itinerary } from '../transit';
import { DEFAULT_PRESET_ORDER } from './constants';
import {
    normalizeFavoriteCommuteWeekdays,
    normalizeReminderOffsetMinutes,
    resolveFavoriteCommuteNotificationWeekdays,
} from './commute';
import type {
    FavoriteCommutePlan,
    FavoriteCommuteRouteLineTab,
    FavoriteCommuteRouteStop,
    FavoriteCommuteWeekday,
    FavoriteLinePreference,
    FavoritePlace,
    FavoritePresetKey,
} from './types';

export const getFavoritePresetLabel = (presetKey: FavoritePresetKey) => (
    presetKey === 'home' ? 'Вкъщи' : 'Работа'
);

export const hasFavoriteCoordinates = (favorite: FavoritePlace) => (
    Number.isFinite(favorite.latitude) && Number.isFinite(favorite.longitude)
);

export const toFavoriteId = (latitude: number, longitude: number) => `${latitude.toFixed(6)}:${longitude.toFixed(6)}`;

export const normalizeFavoritePresetKeys = (value: unknown): FavoritePresetKey[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    const unique = new Set(
        value
            .map((entry) => String(entry || '').trim())
            .filter((entry): entry is FavoritePresetKey => entry === 'home' || entry === 'work'),
    );

    return DEFAULT_PRESET_ORDER.filter((presetKey) => unique.has(presetKey));
};

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

export const normalizeTripRouteGeoJSON = (value: unknown): TripRouteGeoJSON | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const raw = value as Partial<TripRouteGeoJSON>;
    if (raw.type !== 'FeatureCollection' || !Array.isArray(raw.features) || !raw.endpoints || !Array.isArray(raw.transitStops)) {
        return null;
    }

    return raw as TripRouteGeoJSON;
};

export const normalizeFavoriteCommuteRouteLineTabs = (value: unknown): FavoriteCommuteRouteLineTab[] => {
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

export const normalizeFavoriteCommutePlan = (value: unknown): FavoriteCommutePlan | null => {
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
    const itinerary = raw.itinerary && Array.isArray((raw.itinerary as Partial<Itinerary>).legs)
        ? raw.itinerary as Itinerary
        : null;

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
        itinerary,
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

export const normalizeFavoriteLinePreferences = (value: unknown): FavoriteLinePreference[] => {
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

export const normalizeFavoriteNotificationLeadMinutes = (value: unknown) => normalizeReminderOffsetMinutes(value);

export const syncFavoriteLineNotifications = (
    lines: FavoriteLinePreference[],
    enabled: boolean,
    primaryLine?: string | null,
): FavoriteLinePreference[] => {
    const normalizedPrimaryLine = String(primaryLine || '').trim().toUpperCase();
    const fallbackPrimaryLine = lines.find((entry) => entry.enabled)?.line || '';
    const effectivePrimaryLine = normalizedPrimaryLine || fallbackPrimaryLine;

    return normalizeFavoriteLinePreferences(lines.map((entry) => ({
        ...entry,
        notificationsEnabled: enabled ? !!entry.enabled && entry.line === effectivePrimaryLine : false,
    })));
};

export const normalizeFavoritePlace = (value: unknown): FavoritePlace | null => {
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
        personalNotificationLeadMinutes: normalizeFavoriteNotificationLeadMinutes(
            (raw as Partial<FavoritePlace>).personalNotificationLeadMinutes ?? raw.defaultCommute?.reminderOffsetMinutes,
        ),
        defaultCommute: normalizeFavoriteCommutePlan(raw.defaultCommute),
    };
};

export const orderFavoritePlaces = (
    places: FavoritePlace[],
    deletedPresetKeys: FavoritePresetKey[] = [],
) => {
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

export const ensureDefaultFavoritePlaces = (
    places: FavoritePlace[],
    deletedPresetKeys: FavoritePresetKey[] = [],
) => orderFavoritePlaces(places, deletedPresetKeys);
