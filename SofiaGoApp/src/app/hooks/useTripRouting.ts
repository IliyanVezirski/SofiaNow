import { useCallback, useState } from 'react';

import { loadFavoritePlaces } from '../../services/places/storage';
import { getSavedTripPlannerRouteById, type SavedTripPlannerRoute } from '../../services/savedTripRoutes';
import type { TripLocation } from '../../services/transit';
import type { TripRouteGeoJSON } from '../../features/tripPlanner/utils/routeGeoJson';
import { createTripLocation, formatCoordinateLocationName, hasFiniteCoordinates } from '../utils/tripPlanner';

type TripRouteSource = 'planner' | 'favorites' | null;

type Params = {
    favoritesVisible: boolean;
    onActivateMap: () => void;
    onActivatePlanner: () => void;
    onDismissTransientPanels: () => void;
    onHideMapFilters: () => void;
    onToggleFavorites: () => void;
};

export const useTripRouting = ({
    favoritesVisible,
    onActivateMap,
    onActivatePlanner,
    onDismissTransientPanels,
    onHideMapFilters,
    onToggleFavorites,
}: Params) => {
    const [tripPlannerRoute, setTripPlannerRoute] = useState<TripRouteGeoJSON | null>(null);
    const [tripRouteSource, setTripRouteSource] = useState<TripRouteSource>(null);
    const [plannerInitialFrom, setPlannerInitialFrom] = useState<TripLocation | null>(null);
    const [plannerInitialTo, setPlannerInitialTo] = useState<TripLocation | null>(null);
    const [plannerInitialFromToken, setPlannerInitialFromToken] = useState(0);
    const [plannerSavedRoute, setPlannerSavedRoute] = useState<SavedTripPlannerRoute | null>(null);
    const [plannerSavedRouteToken, setPlannerSavedRouteToken] = useState(0);

    const showFavoriteRouteFromNotification = useCallback(async (favoriteId: string | null | undefined) => {
        const normalizedFavoriteId = String(favoriteId || '').trim();
        if (!normalizedFavoriteId) {
            return false;
        }

        const favorites = await loadFavoritePlaces();
        const favorite = favorites.find((item) => item.id === normalizedFavoriteId) ?? null;
        const commutePlan = favorite?.defaultCommute ?? null;
        if (!favorite || !commutePlan) {
            return false;
        }

        if (commutePlan.routeGeoJson) {
            setTripPlannerRoute(commutePlan.routeGeoJson);
            setTripRouteSource('favorites');
            onHideMapFilters();
            onDismissTransientPanels();
            onActivateMap();
            return true;
        }

        if (
            Number.isFinite(commutePlan.originLatitude)
            && Number.isFinite(commutePlan.originLongitude)
            && Number.isFinite(favorite.latitude)
            && Number.isFinite(favorite.longitude)
        ) {
            setTripPlannerRoute(null);
            setPlannerSavedRoute(null);
            setPlannerSavedRouteToken((value) => value + 1);
            setPlannerInitialFrom({
                latitude: commutePlan.originLatitude as number,
                longitude: commutePlan.originLongitude as number,
                name: commutePlan.originName || 'Начална точка',
            });
            setPlannerInitialTo({
                latitude: favorite.latitude as number,
                longitude: favorite.longitude as number,
                name: favorite.name,
            });
            setPlannerInitialFromToken((value) => value + 1);
            onHideMapFilters();
            onDismissTransientPanels();
            onActivatePlanner();
            return true;
        }

        return false;
    }, [onActivateMap, onActivatePlanner, onDismissTransientPanels, onHideMapFilters]);

    const showSavedTripRouteFromReminder = useCallback(async (savedRouteId: string | null | undefined) => {
        const normalizedRouteId = String(savedRouteId || '').trim();
        if (!normalizedRouteId) {
            return false;
        }

        const savedRoute = await getSavedTripPlannerRouteById(normalizedRouteId);
        if (!savedRoute) {
            return false;
        }

        setTripPlannerRoute(null);
        setTripRouteSource(null);
        setPlannerInitialFrom(savedRoute.from);
        setPlannerInitialTo(savedRoute.to);
        setPlannerSavedRoute(savedRoute);
        setPlannerInitialFromToken((value) => value + 1);
        setPlannerSavedRouteToken((value) => value + 1);
        onHideMapFilters();
        onDismissTransientPanels();
        onActivatePlanner();
        return true;
    }, [onActivatePlanner, onDismissTransientPanels, onHideMapFilters]);

    const handleShowTripRouteOnMap = useCallback((route: TripRouteGeoJSON, source: Exclude<TripRouteSource, null>) => {
        setTripPlannerRoute(route);
        setTripRouteSource(source);
        onHideMapFilters();
        onDismissTransientPanels();
        onActivateMap();
    }, [onActivateMap, onDismissTransientPanels, onHideMapFilters]);

    const handleOpenPlannerWithCoordinates = useCallback((
        destinationLatitude: number,
        destinationLongitude: number,
        currentLatitude?: number | null,
        currentLongitude?: number | null,
    ) => {
        if (hasFiniteCoordinates(currentLatitude, currentLongitude)) {
            setPlannerInitialFrom(createTripLocation(currentLatitude as number, currentLongitude as number, 'Моята локация'));
        }

        setPlannerInitialTo(
            createTripLocation(
                destinationLatitude,
                destinationLongitude,
                formatCoordinateLocationName(destinationLatitude, destinationLongitude),
            ),
        );
        setPlannerSavedRoute(null);
        setPlannerSavedRouteToken((value) => value + 1);
        setPlannerInitialFromToken((value) => value + 1);
        onHideMapFilters();
        onDismissTransientPanels();
        onActivatePlanner();
    }, [onActivatePlanner, onDismissTransientPanels, onHideMapFilters]);

    const handleCloseShownTripRoute = useCallback(() => {
        setTripPlannerRoute(null);
        if (tripRouteSource === 'favorites') {
            setTripRouteSource(null);
            onActivateMap();
            if (!favoritesVisible) {
                onToggleFavorites();
            }
            return;
        }

        setTripRouteSource(null);
        onActivatePlanner();
    }, [favoritesVisible, onActivateMap, onActivatePlanner, onToggleFavorites, tripRouteSource]);

    return {
        handleCloseShownTripRoute,
        handleOpenPlannerWithCoordinates,
        handleShowTripRouteOnMap,
        plannerInitialFrom,
        plannerInitialFromToken,
        plannerInitialTo,
        plannerSavedRoute,
        plannerSavedRouteToken,
        showFavoriteRouteFromNotification,
        showSavedTripRouteFromReminder,
        tripPlannerRoute,
    };
};
