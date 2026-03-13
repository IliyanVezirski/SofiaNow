import { useState, useEffect, useCallback } from 'react';
import { FavoritePlace, loadFavoritePlaces, addFavoritePlace, removeFavoritePlace } from '../../../services/places';

export const useFavorites = () => {
    const [favoritePlaces, setFavoritePlaces] = useState<FavoritePlace[]>([]);
    const [favoritesVisible, setFavoritesVisible] = useState(false);

    useEffect(() => {
        void loadFavoritePlaces().then(setFavoritePlaces);
    }, []);

    const saveFavorite = useCallback(async (name: string, latitude: number, longitude: number) => {
        const next = await addFavoritePlace({ name, latitude, longitude });
        setFavoritePlaces(next);
    }, []);

    const removeFav = useCallback(async (favoriteId: string) => {
        const next = await removeFavoritePlace(favoriteId);
        setFavoritePlaces(next);
    }, []);

    return { favoritePlaces, favoritesVisible, setFavoritesVisible, saveFavorite, removeFavorite: removeFav };
};
