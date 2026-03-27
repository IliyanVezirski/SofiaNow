import { useState, useEffect, useCallback } from 'react';
import {
    FavoriteLinePreference,
    FavoritePlace,
    loadFavoritePlaces,
    addFavoritePlace,
    reorderFavoritePlaces,
    removeFavoritePlace,
    subscribeToFavoritePlaceChanges,
    updateFavoritePlace,
} from '../../../services/places';

export const useFavorites = () => {
    const [favoritePlaces, setFavoritePlaces] = useState<FavoritePlace[]>([]);
    const [favoritesVisible, setFavoritesVisible] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const loadFavorites = async () => {
            const next = await loadFavoritePlaces();
            if (!cancelled) {
                setFavoritePlaces(next);
            }
        };

        void loadFavorites();
        const unsubscribe = subscribeToFavoritePlaceChanges(() => {
            void loadFavorites();
        });

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, []);

    const saveFavorite = useCallback(async (name: string, latitude: number, longitude: number) => {
        const next = await addFavoritePlace({ name, latitude, longitude });
        setFavoritePlaces(next);
    }, []);

    const createFavorite = useCallback(async (input: {
        name: string;
        latitude: number;
        longitude: number;
        selectedStopId?: string | null;
        selectedStopName?: string | null;
        selectedLines?: FavoriteLinePreference[];
        personalNotificationLeadMinutes?: number | null;
    }) => {
        const next = await addFavoritePlace(input);
        setFavoritePlaces(next);
        return next;
    }, []);

    const removeFav = useCallback(async (favoriteId: string) => {
        const next = await removeFavoritePlace(favoriteId);
        setFavoritePlaces(next);
    }, []);

    const updateFav = useCallback(async (
        favoriteId: string,
        updates: Partial<Pick<FavoritePlace, 'latitude' | 'longitude' | 'selectedStopId' | 'selectedStopName' | 'name' | 'personalNotificationLeadMinutes' | 'defaultCommute'>> & {
            selectedLines?: FavoriteLinePreference[];
        },
    ) => {
        const next = await updateFavoritePlace(favoriteId, updates);
        setFavoritePlaces(next);
    }, []);

    const reorderFavs = useCallback(async (favoriteIds: string[]) => {
        const next = await reorderFavoritePlaces(favoriteIds);
        setFavoritePlaces(next);
    }, []);

    return {
        favoritePlaces,
        favoritesVisible,
        setFavoritesVisible,
        saveFavorite,
        createFavorite,
        removeFavorite: removeFav,
        updateFavorite: updateFav,
        reorderFavorites: reorderFavs,
    };
};
