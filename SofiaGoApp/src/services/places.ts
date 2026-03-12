import AsyncStorage from '@react-native-async-storage/async-storage';

const FAVORITE_PLACES_KEY = '@sofiago:favorites:places';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
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

export interface FavoritePlace {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    createdAtUnix: number;
}

const toFavoriteId = (latitude: number, longitude: number) => `${latitude.toFixed(6)}:${longitude.toFixed(6)}`;

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
            return [];
        }

        const parsed = JSON.parse(raw) as FavoritePlace[];
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude))
            .sort((left, right) => right.createdAtUnix - left.createdAtUnix);
    } catch (error) {
        console.warn('Failed to load favorite places:', error);
        return [];
    }
};

const persistFavoritePlaces = async (places: FavoritePlace[]) => {
    await AsyncStorage.setItem(FAVORITE_PLACES_KEY, JSON.stringify(places));
};

export const addFavoritePlace = async (input: {
    name: string;
    latitude: number;
    longitude: number;
}): Promise<FavoritePlace[]> => {
    const normalizedName = String(input.name || '').trim();
    if (!normalizedName || !Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
        return loadFavoritePlaces();
    }

    const favorite: FavoritePlace = {
        id: toFavoriteId(input.latitude, input.longitude),
        name: normalizedName,
        latitude: input.latitude,
        longitude: input.longitude,
        createdAtUnix: Date.now(),
    };

    const existing = await loadFavoritePlaces();
    const deduped = existing.filter((place) => place.id !== favorite.id);
    const next = [favorite, ...deduped].slice(0, 60);
    await persistFavoritePlaces(next);
    return next;
};

export const removeFavoritePlace = async (favoriteId: string): Promise<FavoritePlace[]> => {
    const existing = await loadFavoritePlaces();
    const next = existing.filter((place) => place.id !== favoriteId);
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

    const existing = await loadFavoritePlaces();
    const next = existing.map((place) => (
        place.id === favoriteId
            ? { ...place, name: normalizedName }
            : place
    ));

    await persistFavoritePlaces(next);
    return next;
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

    const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`);
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
