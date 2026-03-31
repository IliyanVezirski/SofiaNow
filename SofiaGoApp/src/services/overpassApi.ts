// Overpass API Service
// Query OSM data directly for POIs, stops, amenities within Sofia region

const OVERPASS_BASE_URL = 'https://overpass-api.de/api/interpreter';

// Sofia region bounding box [south, west, north, east] for Overpass format
const SOFIA_BBOX = '42.45,22.85,42.95,23.65';

function escapeOverpassRegex(input: string): string {
  return input.replace(/[.*+?^${}()|\\[\]"/]/g, '\\$&');
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  nodes?: number[];
  center?: { lat: number; lon: number };
}

export interface OverpassResult {
  elements: OverpassElement[];
}

export interface PoiResult {
  id: string;
  osmId: number;
  osmType: string;
  latitude: number;
  longitude: number;
  name: string;
  type: string;
  amenity?: string;
  shop?: string;
  tags: Record<string, string>;
}

/**
 * Execute Overpass QL query
 */
async function queryOverpass(query: string): Promise<OverpassElement[]> {
  try {
    const res = await fetch(OVERPASS_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!res.ok) {
      throw new Error(`Overpass query failed: ${res.status}`);
    }

    const data: OverpassResult = await res.json();
    return data.elements || [];
  } catch (err) {
    console.warn('Overpass query failed:', err);
    return [];
  }
}

/**
 * Search for POIs by name within Sofia region
 */
export async function searchPoisByName(
  query: string,
  limit: number = 20
): Promise<PoiResult[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const q = `
    [out:json][timeout:25];
    (
      node["name"](${SOFIA_BBOX})["name"~"${escapeOverpassRegex(query.trim())}", i];
      way["name"](${SOFIA_BBOX})["name"~"${escapeOverpassRegex(query.trim())}", i];
      node["name:bg"](${SOFIA_BBOX})["name:bg"~"${escapeOverpassRegex(query.trim())}", i];
      way["name:bg"](${SOFIA_BBOX})["name:bg"~"${escapeOverpassRegex(query.trim())}", i];
    );
    out center ${limit};
  `;

  const elements = await queryOverpass(q);
  
  return elements
    .filter(el => el.lat && el.lon || el.center)
    .slice(0, limit)
    .map(el => {
      const lat = el.lat ?? el.center?.lat ?? 0;
      const lon = el.lon ?? el.center?.lon ?? 0;
      return {
        id: `${el.type}-${el.id}`,
        osmId: el.id,
        osmType: el.type,
        latitude: lat,
        longitude: lon,
        name: el.tags?.['name:bg'] || el.tags?.name || 'Unknown',
        type: el.tags?.amenity || el.tags?.shop || el.tags?.tourism || 'poi',
        amenity: el.tags?.amenity,
        shop: el.tags?.shop,
        tags: el.tags || {},
      };
    });
}

/**
 * Get bus/tram/metro stops within Sofia region
 */
export async function getTransitStops(
  limit: number = 500
): Promise<PoiResult[]> {
  const q = `
    [out:json][timeout:30];
    (
      node["public_transport"="stop_position"](${SOFIA_BBOX});
      node["highway"="bus_stop"](${SOFIA_BBOX});
      node["railway"="tram_stop"](${SOFIA_BBOX});
      node["railway"="station"](${SOFIA_BBOX});
    );
    out ${limit};
  `;

  const elements = await queryOverpass(q);

  return elements
    .filter(el => el.lat && el.lon)
    .map(el => ({
      id: `stop-${el.id}`,
      osmId: el.id,
      osmType: el.type,
      latitude: el.lat!,
      longitude: el.lon!,
      name: el.tags?.['name:bg'] || el.tags?.name || el.tags?.ref || 'Спирка',
      type: 'transit_stop',
      amenity: 'transit',
      tags: el.tags || {},
    }));
}

/**
 * Search for shops, amenities, restaurants by name/type
 */
export async function searchAmenities(
  query: string,
  limit: number = 20
): Promise<PoiResult[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const q = `
    [out:json][timeout:25];
    (
      node["amenity"](${SOFIA_BBOX})["name"~"${escapeOverpassRegex(query.trim())}", i];
      node["shop"](${SOFIA_BBOX})["name"~"${escapeOverpassRegex(query.trim())}", i];
      node["tourism"](${SOFIA_BBOX})["name"~"${escapeOverpassRegex(query.trim())}", i];
      node["leisure"](${SOFIA_BBOX})["name"~"${escapeOverpassRegex(query.trim())}", i];
    );
    out center ${limit};
  `;

  const elements = await queryOverpass(q);

  return elements
    .filter(el => el.lat && el.lon || el.center)
    .slice(0, limit)
    .map(el => {
      const lat = el.lat ?? el.center?.lat ?? 0;
      const lon = el.lon ?? el.center?.lon ?? 0;
      return {
        id: `${el.type}-${el.id}`,
        osmId: el.id,
        osmType: el.type,
        latitude: lat,
        longitude: lon,
        name: el.tags?.['name:bg'] || el.tags?.name || 'Unknown',
        type: el.tags?.amenity || el.tags?.shop || el.tags?.tourism || 'poi',
        amenity: el.tags?.amenity,
        shop: el.tags?.shop,
        tags: el.tags || {},
      };
    });
}

/**
 * Get all POIs within a bounding box
 */
export async function getPoisInBounds(
  bounds: { south: number; west: number; north: number; east: number },
  filters?: { amenity?: string; shop?: string }
): Promise<PoiResult[]> {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  
  let filterStr = '';
  if (filters?.amenity) {
    filterStr = `["amenity"="${filters.amenity}"]`;
  } else if (filters?.shop) {
    filterStr = `["shop"="${filters.shop}"]`;
  }

  const q = `
    [out:json][timeout:20];
    (
      node${filterStr}(${bbox});
      way${filterStr}(${bbox});
    );
    out center 200;
  `;

  const elements = await queryOverpass(q);

  return elements
    .filter(el => el.lat && el.lon || el.center)
    .map(el => {
      const lat = el.lat ?? el.center?.lat ?? 0;
      const lon = el.lon ?? el.center?.lon ?? 0;
      return {
        id: `${el.type}-${el.id}`,
        osmId: el.id,
        osmType: el.type,
        latitude: lat,
        longitude: lon,
        name: el.tags?.['name:bg'] || el.tags?.name || 'POI',
        type: el.tags?.amenity || el.tags?.shop || 'poi',
        amenity: el.tags?.amenity,
        shop: el.tags?.shop,
        tags: el.tags || {},
      };
    });
}

/**
 * Search for banks, ATMs, pharmacies, etc.
 */
export async function searchByAmenityType(
  amenityType: 'bank' | 'atm' | 'pharmacy' | 'hospital' | 'school' | 'cafe' | 'restaurant' | 'fuel',
  limit: number = 50
): Promise<PoiResult[]> {
  const q = `
    [out:json][timeout:25];
    node["amenity"="${amenityType}"](${SOFIA_BBOX});
    out ${limit};
  `;

  const elements = await queryOverpass(q);

  return elements
    .filter(el => el.lat && el.lon)
    .map(el => ({
      id: `${el.type}-${el.id}`,
      osmId: el.id,
      osmType: el.type,
      latitude: el.lat!,
      longitude: el.lon!,
      name: el.tags?.['name:bg'] || el.tags?.name || amenityType,
      type: amenityType,
      amenity: amenityType,
      tags: el.tags || {},
    }));
}

/**
 * Unified search combining Nominatim addresses + Overpass POIs
 */
export async function unifiedSearch(
  query: string,
  limit: number = 30
): Promise<Array<{ latitude: number; longitude: number; name: string; type: string }>> {
  const results: Array<{ latitude: number; longitude: number; name: string; type: string }> = [];

  // Search addresses via Nominatim
  const { searchOsmLocations } = await import('./search');
  const addresses = await searchOsmLocations(query, Math.ceil(limit / 2));
  
  for (const addr of addresses) {
    results.push({
      latitude: addr.latitude,
      longitude: addr.longitude,
      name: addr.name,
      type: 'address',
    });
  }

  // Search POIs via Overpass
  const pois = await searchPoisByName(query, Math.ceil(limit / 2));
  
  for (const poi of pois) {
    results.push({
      latitude: poi.latitude,
      longitude: poi.longitude,
      name: poi.name,
      type: poi.type,
    });
  }

  return results.slice(0, limit);
}
