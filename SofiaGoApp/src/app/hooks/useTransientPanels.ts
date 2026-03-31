import { useCallback, useState } from 'react';

const queue = (fn: () => void) => {
    setTimeout(fn, 0);
};

export const useTransientPanels = () => {
    const [openSearchToken, setOpenSearchToken] = useState(0);
    const [toggleFavoritesToken, setToggleFavoritesToken] = useState(0);
    const [dismissTransientPanelsToken, setDismissTransientPanelsToken] = useState(0);
    const [searchVisible, setSearchVisible] = useState(false);
    const [favoritesVisible, setFavoritesVisible] = useState(false);

    const dismissTransientPanels = useCallback(() => {
        setDismissTransientPanelsToken((value) => value + 1);
    }, []);

    const requestOpenSearch = useCallback(() => {
        queue(() => setOpenSearchToken((value) => value + 1));
    }, []);

    const requestToggleFavorites = useCallback(() => {
        queue(() => setToggleFavoritesToken((value) => value + 1));
    }, []);

    return {
        dismissTransientPanels,
        dismissTransientPanelsToken,
        favoritesVisible,
        openSearchToken,
        requestOpenSearch,
        requestToggleFavorites,
        searchVisible,
        setFavoritesVisible,
        setSearchVisible,
        toggleFavoritesToken,
    };
};
