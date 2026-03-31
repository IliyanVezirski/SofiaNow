// Mapbox Geocoding Service
// High-quality location search with GPS coordinates

const MAPBOX_ACCESS_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';

const MAPBOX_BASE_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

/** Mapbox geocoding result */
export interface MapboxFeature {
  id: string;
  place_name: string;
  place_type: string[];
  center: [number, number]; // [longitude, latitude]
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  context?: Array<{
    id: string;
    text: string;
  }>;
  properties?: {
    address?: string;
    landmark?: string;
    category?: string;
  };
}

/** Unified location result */
export interface MapboxLocation {
  latitude: number;
  longitude: number;
  name: string;
  type: string;
  address?: string;
  original?: MapboxFeature;
}

/** Search for locations using Mapbox
 * @param query - search text (e.g., "НДК София", "булевард Витоша")
 * @param limit - max results (default 10)
 * @returns Promise<MapboxLocation[]>
 */
export async function searchMapboxLocations(
  query: string,
  limit: number = 10
): Promise<MapboxLocation[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  // Add "София" to query if not present to improve results
  let searchQuery = query.trim();
  if (!searchQuery.toLowerCase().includes('софия') && !searchQuery.toLowerCase().includes('sofia')) {
    searchQuery += ', София';
  }

  const params = new URLSearchParams({
    access_token: MAPBOX_ACCESS_TOKEN,
    limit: limit.toString(),
    country: 'BG',
    language: 'bg',
    types: 'address,poi,place,locality,neighborhood',
  });

  try {
    const res = await fetch(
      `${MAPBOX_BASE_URL}/${encodeURIComponent(searchQuery)}.json?${params}`
    );

    if (!res.ok) {
      throw new Error(`Mapbox search failed: ${res.status}`);
    }

    const data = await res.json();
    const features: MapboxFeature[] = data.features || [];

    return features
      .filter(feature => feature.center)
      .map((feature) => ({
        latitude: feature.center[1],
        longitude: feature.center[0],
        name: formatMapboxName(feature),
        type: feature.place_type[0] || 'unknown',
        address: feature.properties?.address,
        original: feature,
      }));
  } catch (err) {
    console.warn('Mapbox search failed:', err);
    return [];
  }
}

/** Search with bounding box (Sofia region) */
export async function searchMapboxLocationsBounded(
  query: string,
  limit: number = 15
): Promise<MapboxLocation[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  // Sofia region bounding box: [west, south, east, north]
  const sofia_bbox = '22.85,42.45,23.65,42.95';
  
  let searchQuery = query.trim();
  if (!searchQuery.toLowerCase().includes('софия') && !searchQuery.toLowerCase().includes('sofia')) {
    searchQuery += ', София';
  }

  const params = new URLSearchParams({
    access_token: MAPBOX_ACCESS_TOKEN,
    limit: limit.toString(),
    country: 'BG',
    language: 'bg',
    types: 'address,poi,place,locality,neighborhood',
    proximity: '23.3218,42.6977', // Sofia center
  });

  try {
    const res = await fetch(
      `${MAPBOX_BASE_URL}/${encodeURIComponent(searchQuery)}.json?${params}`
    );

    if (!res.ok) {
      throw new Error(`Mapbox search failed: ${res.status}`);
    }

    const data = await res.json();
    const features: MapboxFeature[] = data.features || [];

    return features
      .filter(feature => feature.center && isInSofiaRegion(feature.center[1], feature.center[0]))
      .map((feature) => ({
        latitude: feature.center[1],
        longitude: feature.center[0],
        name: formatMapboxName(feature),
        type: feature.place_type[0] || 'unknown',
        address: feature.properties?.address,
        original: feature,
      }));
  } catch (err) {
    console.warn('Mapbox bounded search failed:', err);
    return [];
  }
}

/** Reverse geocode coordinates to address */
export async function reverseGeocodeMapbox(
  lat: number,
  lon: number
): Promise<string> {
  const params = new URLSearchParams({
    access_token: MAPBOX_ACCESS_TOKEN,
    language: 'bg',
  });

  try {
    const res = await fetch(
      `${MAPBOX_BASE_URL}/${lon},${lat}.json?${params}`
    );

    if (!res.ok) {
      throw new Error(`Mapbox reverse failed: ${res.status}`);
    }

    const data = await res.json();
    const feature = data.features?.[0];
    
    if (feature) {
      return formatMapboxName(feature);
    }
    
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch (err) {
    console.warn('Mapbox reverse geocode failed:', err);
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}

/** Check if coordinates are in Sofia region */
function isInSofiaRegion(lat: number, lon: number): boolean {
  return (
    lat >= 42.45 && lat <= 42.95 &&
    lon >= 22.85 && lon <= 23.65
  );
}

/** Format Mapbox result name in Bulgarian */
function formatMapboxName(feature: MapboxFeature): string {
  // Priority: POI name > address > place name
  const placeName = feature.place_name;
  
  // Split by comma and take first meaningful part
  const parts = placeName.split(',').map(p => p.trim());
  
  // For addresses, include street number
  if (feature.place_type.includes('address') && feature.properties?.address) {
    return `${feature.properties.address}, ${parts[0]}`;
  }
  
  // For POIs, just return the name
  if (feature.place_type.includes('poi')) {
    return parts[0];
  }
  
  // Default: first part of place_name
  return parts[0] || placeName;
}

/**
 * Unified search using Mapbox (replaces OSM + Overpass)
 */
export async function unifiedMapboxSearch(
  query: string,
  limit: number = 15
): Promise<Array<{ latitude: number; longitude: number; name: string; type: string }>> {
  const results = await searchMapboxLocationsBounded(query, limit);
  
  return results.map(loc => ({
    latitude: loc.latitude,
    longitude: loc.longitude,
    name: loc.name,
    type: loc.type,
  }));
}
