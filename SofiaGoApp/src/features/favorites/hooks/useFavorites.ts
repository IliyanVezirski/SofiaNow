import { useState, useEffect, useCallback } from 'react';
import {
    FavoriteLinePreference,
    FavoritePlace,
    loadFavoritePlaces,
    addFavoritePlace,
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

    const removeFav = useCallback(async (favoriteId: string) => {
        const next = await removeFavoritePlace(favoriteId);
        setFavoritePlaces(next);
    }, []);

    const updateFav = useCallback(async (
        favoriteId: string,
        updates: Partial<Pick<FavoritePlace, 'latitude' | 'longitude' | 'selectedStopId' | 'selectedStopName' | 'name' | 'defaultCommute'>> & {
            selectedLines?: FavoriteLinePreference[];
        },
    ) => {
        const next = await updateFavoritePlace(favoriteId, updates);
        setFavoritePlaces(next);
    }, []);

    return { favoritePlaces, favoritesVisible, setFavoritesVisible, saveFavorite, removeFavorite: removeFav, updateFavorite: updateFav };
};
