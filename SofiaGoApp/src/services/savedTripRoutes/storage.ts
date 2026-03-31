import AsyncStorage from '@react-native-async-storage/async-storage';

import { buildRouteGeoJSON } from '../../features/tripPlanner/utils/routeGeoJson';
import type { Itinerary, PlanType, TripLocation } from '../transit';
import type { SavedTripPlannerRoute } from './types';

const SAVED_TRIP_PLANNER_ROUTES_KEY = '@sofiago:saved-trip-planner-routes';

const savedTripRouteListeners = new Set<() => void>();

const fmtTime = (epoch: number) => {
    const date = new Date(epoch);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const fmtDuration = (seconds: number) => {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
        return `${minutes} мин`;
    }

    return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
};

const getLegLabel = (mode: string) => {
    switch (mode) {
        case 'BUS':
            return 'Автобус';
        case 'TRAM':
            return 'Трамвай';
        case 'TROLLEYBUS':
            return 'Тролей';
        case 'SUBWAY':
            return 'Метро';
        case 'RAIL':
            return 'Влак';
        case 'WALK':
            return 'Пеша';
        default:
            return mode;
    }
};

const getTransportLabels = (itinerary: Itinerary) => Array.from(new Set(
    itinerary.legs
        .filter((leg) => leg.mode !== 'WALK')
        .map((leg) => `${getLegLabel(leg.mode)} ${String(leg.route?.shortName || '').trim()}`.trim())
        .filter(Boolean),
));

const buildItinerarySummary = (itinerary: Itinerary) => {
    const routeParts = itinerary.legs
        .map((leg) => (leg.route?.shortName ? leg.route.shortName : (leg.mode === 'WALK' ? 'Пеша' : leg.mode)))
        .join(' • ');

    return `${fmtTime(itinerary.startTime)} → ${fmtTime(itinerary.endTime)} • ${fmtDuration(itinerary.duration)} • ${routeParts}`;
};

const buildRouteLabel = (itinerary: Itinerary) => {
    const transportLabels = getTransportLabels(itinerary);
    if (transportLabels.length) {
        return transportLabels.join(' • ');
    }

    return 'Пешеходен маршрут';
};

export const getSavedTripPlannerRouteId = ({
    from,
    to,
    planType,
    routeDate,
    routeTime,
    arriveBy,
    itinerary,
}: {
    from: TripLocation;
    to: TripLocation;
    planType: PlanType;
    routeDate: string;
    routeTime: string;
    arriveBy: boolean;
    itinerary: Itinerary;
}) => {
    const legsSignature = itinerary.legs
        .map((leg) => [
            leg.mode,
            String(leg.route?.shortName || '').trim().toUpperCase(),
            String(leg.from.name || '').trim().toLowerCase(),
            String(leg.to.name || '').trim().toLowerCase(),
        ].join(':'))
        .join('|');

    return [
        'trip',
        from.latitude.toFixed(5),
        from.longitude.toFixed(5),
        to.latitude.toFixed(5),
        to.longitude.toFixed(5),
        planType,
        routeDate,
        routeTime,
        arriveBy ? '1' : '0',
        String(itinerary.startTime),
        String(itinerary.endTime),
        String(Math.round(itinerary.duration)),
        legsSignature,
    ].join('::');
};

const isValidTripLocation = (value: unknown): value is TripLocation => {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as TripLocation;
    return (
        typeof candidate.name === 'string'
        && Number.isFinite(candidate.latitude)
        && Number.isFinite(candidate.longitude)
    );
};

const normalizeSavedTripPlannerRoute = (value: unknown): SavedTripPlannerRoute | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const candidate = value as SavedTripPlannerRoute;
    if (
        typeof candidate.id !== 'string'
        || !candidate.id.trim()
        || !isValidTripLocation(candidate.from)
        || !isValidTripLocation(candidate.to)
        || !candidate.itinerary
        || !Array.isArray(candidate.itinerary.legs)
        || !candidate.routeGeoJson
        || !Array.isArray(candidate.routeGeoJson.features)
    ) {
        return null;
    }

    return {
        ...candidate,
        id: candidate.id.trim(),
        createdAtUnix: Number.isFinite(candidate.createdAtUnix) ? Number(candidate.createdAtUnix) : Date.now(),
        updatedAtUnix: Number.isFinite(candidate.updatedAtUnix) ? Number(candidate.updatedAtUnix) : Date.now(),
        itinerarySummary: String(candidate.itinerarySummary || '').trim() || buildItinerarySummary(candidate.itinerary),
        routeLabel: String(candidate.routeLabel || '').trim() || buildRouteLabel(candidate.itinerary),
        transportLabels: Array.isArray(candidate.transportLabels)
            ? candidate.transportLabels.map((entry) => String(entry || '').trim()).filter(Boolean)
            : getTransportLabels(candidate.itinerary),
    };
};

const notifySavedTripRouteListeners = () => {
    savedTripRouteListeners.forEach((listener) => listener());
};

export const listSavedTripPlannerRoutes = async (): Promise<SavedTripPlannerRoute[]> => {
    try {
        const raw = await AsyncStorage.getItem(SAVED_TRIP_PLANNER_ROUTES_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map(normalizeSavedTripPlannerRoute)
            .filter((route): route is SavedTripPlannerRoute => !!route)
            .sort((a, b) => b.updatedAtUnix - a.updatedAtUnix);
    } catch (error) {
        console.warn('Failed to load saved trip planner routes:', error);
        return [];
    }
};

export const getSavedTripPlannerRouteById = async (routeId: string) => {
    const normalizedRouteId = String(routeId || '').trim();
    if (!normalizedRouteId) {
        return null;
    }

    const routes = await listSavedTripPlannerRoutes();
    return routes.find((route) => route.id === normalizedRouteId) ?? null;
};

export const saveTripPlannerRoute = async ({
    from,
    to,
    planType,
    routeDate,
    routeTime,
    arriveBy,
    itinerary,
}: {
    from: TripLocation;
    to: TripLocation;
    planType: PlanType;
    routeDate: string;
    routeTime: string;
    arriveBy: boolean;
    itinerary: Itinerary;
}) => {
    const existing = await listSavedTripPlannerRoutes();
    const id = getSavedTripPlannerRouteId({
        from,
        to,
        planType,
        routeDate,
        routeTime,
        arriveBy,
        itinerary,
    });
    const now = Date.now();
    const existingEntry = existing.find((route) => route.id === id) ?? null;
    const nextEntry: SavedTripPlannerRoute = {
        id,
        createdAtUnix: existingEntry?.createdAtUnix ?? now,
        updatedAtUnix: now,
        from,
        to,
        planType,
        routeDate,
        routeTime,
        arriveBy,
        itinerary,
        routeGeoJson: buildRouteGeoJSON(itinerary),
        itinerarySummary: buildItinerarySummary(itinerary),
        routeLabel: buildRouteLabel(itinerary),
        transportLabels: getTransportLabels(itinerary),
    };

    const nextRoutes = [
        nextEntry,
        ...existing.filter((route) => route.id !== id),
    ];

    await AsyncStorage.setItem(SAVED_TRIP_PLANNER_ROUTES_KEY, JSON.stringify(nextRoutes));
    notifySavedTripRouteListeners();
    return nextEntry;
};

export const removeSavedTripPlannerRoute = async (routeId: string) => {
    const normalizedRouteId = String(routeId || '').trim();
    if (!normalizedRouteId) {
        return [];
    }

    const existing = await listSavedTripPlannerRoutes();
    const nextRoutes = existing.filter((route) => route.id !== normalizedRouteId);

    if (nextRoutes.length) {
        await AsyncStorage.setItem(SAVED_TRIP_PLANNER_ROUTES_KEY, JSON.stringify(nextRoutes));
    } else {
        await AsyncStorage.removeItem(SAVED_TRIP_PLANNER_ROUTES_KEY);
    }

    notifySavedTripRouteListeners();
    return nextRoutes;
};

export const subscribeToSavedTripPlannerRouteChanges = (listener: () => void) => {
    savedTripRouteListeners.add(listener);
    return () => {
        savedTripRouteListeners.delete(listener);
    };
};
