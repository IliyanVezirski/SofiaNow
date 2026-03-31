import { searchLocations as searchTripPlannerLocations, type TripLocation } from '../transit';
import type { PlaceSearchResult } from './types';

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
// Approximate bounding box covering Sofia city + Sofia Province.
const SOFIA_WEST_LON = 22.35;
const SOFIA_EAST_LON = 24.35;
const SOFIA_NORTH_LAT = 43.25;
const SOFIA_SOUTH_LAT = 42.10;
const STREET_SEGMENT_REGEX = /(ул\.?|улица|бул\.?|булевард|жк\.?|кв\.?|пл\.?|ал\.?)/i;
const DIGIT_REGEX = /\d/;

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

const buildPlaceSearchResultKey = (entry: Pick<PlaceSearchResult, 'name' | 'latitude' | 'longitude'>) => {
    const normalizedName = String(entry.name || '').trim().toLocaleLowerCase('bg-BG');
    const latitude = Number(entry.latitude).toFixed(5);
    const longitude = Number(entry.longitude).toFixed(5);
    return `${normalizedName}|${latitude}|${longitude}`;
};

const mergePlaceSearchResults = (
    primary: PlaceSearchResult[],
    secondary: PlaceSearchResult[],
    limit: number,
): PlaceSearchResult[] => {
    const seen = new Set<string>();
    const merged: PlaceSearchResult[] = [];

    for (const entry of [...primary, ...secondary]) {
        const key = buildPlaceSearchResultKey(entry);
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        merged.push(entry);

        if (merged.length >= limit) {
            break;
        }
    }

    return merged;
};

const mapTripPlannerLocationToPlaceSearchResult = (location: TripLocation): PlaceSearchResult | null => {
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);
    const name = String(location?.name || '').trim();

    if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    return {
        id: `cgm:${latitude.toFixed(6)}:${longitude.toFixed(6)}:${name}`,
        name,
        subtitle: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        latitude,
        longitude,
    } satisfies PlaceSearchResult;
};

const searchNominatimLocations = async (query: string, limit: number): Promise<PlaceSearchResult[]> => {
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
        limit: String(limit),
        addressdetails: '1',
        'accept-language': 'bg',
        countrycodes: 'bg',
        bounded: '1',
        viewbox: `${SOFIA_WEST_LON},${SOFIA_NORTH_LAT},${SOFIA_EAST_LON},${SOFIA_SOUTH_LAT}`,
    });

    const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
        headers: { 'User-Agent': 'SofiaGo/1.0 (transit app for Sofia; https://github.com/nickkostov/SofiaGo)' },
    });
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

export const searchCentralLocations = async (query: string, limit = 8): Promise<PlaceSearchResult[]> => {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) {
        return [];
    }

    const normalizedLimit = Math.max(1, Math.min(limit, 12));
    const searchResults = await Promise.allSettled([
        searchTripPlannerLocations(normalizedQuery),
        searchNominatimLocations(normalizedQuery, normalizedLimit),
    ]);

    const tripPlannerResults = searchResults[0].status === 'fulfilled'
        ? searchResults[0].value
            .map(mapTripPlannerLocationToPlaceSearchResult)
            .filter((entry): entry is PlaceSearchResult => !!entry)
        : [];
    const nominatimResults = searchResults[1].status === 'fulfilled' ? searchResults[1].value : [];

    if (!tripPlannerResults.length && !nominatimResults.length) {
        const firstRejected = searchResults.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (firstRejected) {
            throw firstRejected.reason;
        }

        return [];
    }

    return mergePlaceSearchResults(tripPlannerResults, nominatimResults, normalizedLimit);
};

export const searchLocations = async (query: string, limit = 8): Promise<PlaceSearchResult[]> => {
    const normalizedLimit = Math.max(1, Math.min(limit, 12));
    return searchNominatimLocations(query, normalizedLimit);
};
