import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    ensureDefaultFavoritePlaces,
    normalizeFavoritePlace,
    normalizeFavoritePresetKeys,
} from './normalization';
import type { FavoritePlace, FavoritePresetKey } from './types';

const FAVORITE_PLACES_KEY = '@sofiago:favorites:places';
const FAVORITE_DELETED_PRESETS_KEY = '@sofiago:favorites:deleted-presets';

const favoritePlaceListeners = new Set<() => void>();
let deletedPresetKeysCache: FavoritePresetKey[] | null = null;

export const loadDeletedPresetKeys = async () => {
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

export const persistDeletedPresetKeys = async (presetKeys: FavoritePresetKey[]) => {
    const normalized = normalizeFavoritePresetKeys(presetKeys);
    deletedPresetKeysCache = normalized;

    if (!normalized.length) {
        await AsyncStorage.removeItem(FAVORITE_DELETED_PRESETS_KEY);
        return;
    }

    await AsyncStorage.setItem(FAVORITE_DELETED_PRESETS_KEY, JSON.stringify(normalized));
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

export const persistFavoritePlaces = async (places: FavoritePlace[]) => {
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
