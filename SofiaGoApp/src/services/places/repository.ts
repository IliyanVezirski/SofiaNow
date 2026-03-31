import * as Notifications from 'expo-notifications';
import { cancelCommuteRouteNotification, scheduleCommuteRouteNotification } from '../notifications/commuteRouteNotifications';
import { DEFAULT_COMMUTE_WEEKDAYS, FAVORITE_COMMUTE_NOTIFICATION_SCHEDULE_VERSION } from './constants';
import {
    formatCommuteReminderTimeFromRouteStart,
    normalizeReminderOffsetMinutes,
    resolveFavoriteCommuteNotificationWeekdays,
} from './commute';
import {
    getFavoritePresetLabel,
    normalizeFavoriteCommutePlan,
    normalizeFavoriteLinePreferences,
    normalizeFavoriteNotificationLeadMinutes,
    syncFavoriteLineNotifications,
    toFavoriteId,
} from './normalization';
import {
    loadDeletedPresetKeys,
    loadFavoritePlaces,
    persistDeletedPresetKeys,
    persistFavoritePlaces,
} from './storage';
import type {
    FavoriteCommuteWeekday,
    FavoriteLinePreference,
    FavoritePlace,
    FavoritePresetKey,
    StoredFavoriteCommuteReminder,
} from './types';

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
    const normalizedOffset = normalizeReminderOffsetMinutes(updates.reminderOffsetMinutes);

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
        ? normalizeReminderOffsetMinutes(commutePlan.reminderOffsetMinutes)
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
