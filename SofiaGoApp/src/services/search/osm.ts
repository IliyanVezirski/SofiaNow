// OSM/Nominatim Geocoding Service
// Provides location search with GPS coordinates from OpenStreetMap

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

// Sofia region bounding box (covers Sofia city + Sofia oblast)
// [west, south, east, north] = [22.85, 42.45, 23.65, 42.95]
const SOFIA_VIEWBOX: [number, number, number, number] = [22.85, 42.45, 23.65, 42.95];

/** OSM search result */
export interface OsmSearchResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  namedetails?: {
    name?: string;
    'name:bg'?: string;
    'name:en'?: string;
    [key: string]: string | undefined;
  };
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    country?: string;
    suburb?: string;
    road?: string;
    house_number?: string;
    postcode?: string;
    [key: string]: string | undefined;
  };
}

/** Unified location result compatible with TripLocation */
export interface OsmLocation {
  latitude: number;
  longitude: number;
  name: string;
  original?: OsmSearchResult;
}

/**
 * Search for locations by address text using OSM/Nominatim
 * Limited to Sofia city and Sofia oblast
 * Results in Bulgarian language
 * @param query - search text (e.g., "НДК", "булевард Витоша")
 * @param limit - max results (default 20)
 * @returns Promise<OsmLocation[]>
 */
export async function searchOsmLocations(
  query: string,
  limit: number = 20
): Promise<OsmLocation[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    format: 'json',
    q: query,
    limit: limit.toString(),
    addressdetails: '1',
    namedetails: '1',
    countrycodes: 'bg',
    'accept-language': 'bg',
    viewbox: SOFIA_VIEWBOX.join(','),
    bounded: '1',
  });

  try {
    const res = await fetch(`${NOMINATIM_BASE_URL}/search?${params}`, {
      headers: {
        'User-Agent': 'SofiaGoApp/1.0',
        'Accept-Language': 'bg',
      },
    });

    if (!res.ok) {
      throw new Error(`Nominatim search failed: ${res.status}`);
    }

    const data: OsmSearchResult[] = await res.json();

    return data
      .filter(isInSofiaRegion)
      .map((item) => ({
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        name: formatDisplayNameBg(item),
        original: item,
      }));
  } catch (err) {
    console.warn('OSM search failed:', err);
    return [];
  }
}

/**
 * OSM/Nominatim search with more options
 * Limited to Sofia region by default
 * @param query - search text
 * @param limit - max results
 * @param viewbox - override area [west, south, east, north]
 * @returns Promise<OsmLocation[]>
 */
export async function searchOsmLocationsBounded(
  query: string,
  limit: number = 20,
  viewbox?: [number, number, number, number]
): Promise<OsmLocation[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  // Always use Sofia viewbox unless explicitly overridden
  const effectiveViewbox = viewbox || SOFIA_VIEWBOX;

  const params = new URLSearchParams({
    format: 'json',
    q: query,
    limit: limit.toString(),
    addressdetails: '1',
    namedetails: '1',
    countrycodes: 'bg',
    'accept-language': 'bg',
    viewbox: effectiveViewbox.join(','),
    bounded: '1',
  });

  try {
    const res = await fetch(`${NOMINATIM_BASE_URL}/search?${params}`, {
      headers: {
        'User-Agent': 'SofiaGoApp/1.0',
        'Accept-Language': 'bg',
      },
    });

    if (!res.ok) {
      throw new Error(`Nominatim search failed: ${res.status}`);
    }

    const data: OsmSearchResult[] = await res.json();

    return data
      .filter(isInSofiaRegion)
      .map((item) => ({
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        name: formatDisplayNameBg(item),
        original: item,
      }));
  } catch (err) {
    console.warn('OSM bounded search failed:', err);
    return [];
  }
}

/**
 * Reverse geocode coordinates to address (Bulgarian)
 * @param lat - latitude
 * @param lon - longitude
 * @returns Promise<string> - formatted address in Bulgarian
 */
export async function reverseGeocodeOsm(lat: number, lon: number): Promise<string> {
  try {
    const params = new URLSearchParams({
      format: 'json',
      lat: lat.toString(),
      lon: lon.toString(),
      addressdetails: '1',
      namedetails: '1',
      'accept-language': 'bg',
    });

    const res = await fetch(`${NOMINATIM_BASE_URL}/reverse?${params}`, {
      headers: {
        'User-Agent': 'SofiaGoApp/1.0',
        'Accept-Language': 'bg',
      },
    });

    if (!res.ok) {
      throw new Error(`Nominatim reverse failed: ${res.status}`);
    }

    const data: OsmSearchResult = await res.json();
    return formatDisplayNameBg(data);
  } catch (err) {
    console.warn('OSM reverse geocode failed:', err);
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}

/**
 * Check if result is within Sofia region
 */
function isInSofiaRegion(result: OsmSearchResult): boolean {
  const lat = parseFloat(result.lat);
  const lon = parseFloat(result.lon);
  return (
    lat >= SOFIA_VIEWBOX[1] &&
    lat <= SOFIA_VIEWBOX[3] &&
    lon >= SOFIA_VIEWBOX[0] &&
    lon <= SOFIA_VIEWBOX[2]
  );
}

/**
 * Format OSM display name in Bulgarian
 * Prefers name:bg, then address road/city in Bulgarian
 */
function formatDisplayNameBg(result: OsmSearchResult): string {
  // First try Bulgarian name from namedetails
  if (result.namedetails?.['name:bg']) {
    return result.namedetails['name:bg'];
  }

  const address = result.address;
  if (!address) {
    // Extract first part of display_name as fallback
    const parts = result.display_name.split(',');
    return parts[0]?.trim() || result.display_name;
  }

  // Build address in Bulgarian style
  const parts: string[] = [];

  // Add road with house number
  if (address.road) {
    if (address.house_number) {
      parts.push(`${address.road} ${address.house_number}`);
    } else {
      parts.push(address.road);
    }
  }

  // Add suburb/neighborhood
  if (address.suburb) {
    parts.push(address.suburb);
  }

  // Add city/town/village
  const settlement = address.city || address.town || address.village;
  if (settlement && settlement !== 'София') {
    parts.push(settlement);
  }

  // Add municipality for areas outside Sofia city
  if (address.municipality && !address.city) {
    parts.push(`община ${address.municipality}`);
  }

  if (parts.length > 0) {
    return parts.join(', ');
  }

  // Fallback to first part of display_name
  const displayNameParts = result.display_name.split(',');
  return displayNameParts[0]?.trim() || result.display_name;
}
