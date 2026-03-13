// CGM Trip Planner API service
// Wraps sofiatraffic.bg's OpenTripPlanner-based route planning endpoints

const BASE_URL = 'https://www.sofiatraffic.bg';
const LOCALE = 'bg';
const IS_WEB_RUNTIME = typeof window !== 'undefined' && typeof document !== 'undefined';

// ─── Session management ────────────────────────────────────────────────────────

let cachedCsrf: string | null = null;
let cachedCookies: string | null = null;
let sessionExpiresAt = 0;
const SESSION_TTL_MS = 15 * 60 * 1000; // refresh every 15 min

async function ensureSession(): Promise<{ csrf: string; cookies: string }> {
  if (cachedCsrf && cachedCookies && Date.now() < sessionExpiresAt) {
    return { csrf: cachedCsrf, cookies: cachedCookies };
  }

  const res = await fetch(`${BASE_URL}/${LOCALE}/public-transport`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const html = await res.text();

  const csrfMatch = html.match(/meta name="csrf-token" content="([^"]+)"/);
  if (!csrfMatch) throw new Error('Failed to obtain CSRF token');

  const setCookies: string[] = (res.headers as any).getSetCookie?.() ?? [];
  const cookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');

  cachedCsrf = csrfMatch[1];
  cachedCookies = cookies;
  sessionExpiresAt = Date.now() + SESSION_TTL_MS;

  return { csrf: cachedCsrf, cookies: cachedCookies };
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  if (IS_WEB_RUNTIME) {
    const webRes = await fetch(`/api${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!webRes.ok) {
      const text = await webRes.text();
      throw new Error(`Trip proxy ${path} returned ${webRes.status}: ${text.slice(0, 200)}`);
    }

    return webRes.json();
  }

  const { csrf, cookies } = await ensureSession();

  const xsrfMatch = cookies.match(/XSRF-TOKEN=([^;]+)/);
  const xsrf = xsrfMatch ? decodeURIComponent(xsrfMatch[1]) : '';

  const res = await fetch(`${BASE_URL}/${LOCALE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-CSRF-TOKEN': csrf,
      'X-XSRF-TOKEN': xsrf,
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0',
      'Cookie': cookies,
      'Referer': `${BASE_URL}/${LOCALE}/trip/search`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    // Session may have expired – clear and let caller retry
    if (res.status === 419) {
      cachedCsrf = null;
      cachedCookies = null;
      sessionExpiresAt = 0;
    }
    throw new Error(`CGM API ${path} returned ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TripLocation {
  latitude: number;
  longitude: number;
  name: string;
}

export interface TripStop {
  id: number;
  name: string;
  latitude: string;
  longitude: string;
  code: string;
}

export interface TripLine {
  line_id: number;
  name: string;
  ext_id: string;
  type: number; // 1=bus, 2=tram, 4=trolley, 3=metro(?)
  color: string;
  icon: string;
}

export type PlanType = '0' | '1' | '2'; // 0 = less-waiting, 1 = less-walking, 2 = less-transfers

export interface TripRequest {
  from: TripLocation;
  to: TripLocation;
  date?: string;       // YYYY-MM-DD, defaults to today
  time?: string;       // HH:mm, defaults to now
  arriveBy?: boolean;  // false = depart at, true = arrive by
  type?: PlanType;     // optimization preference
}

export interface ItineraryLegPlace {
  name: string;
  lat: number;
  lon: number;
  departureTime: number; // epoch ms
  arrivalTime: number;
  stop?: { code: string; name?: string };
}

export interface ItineraryLeg {
  mode: 'WALK' | 'BUS' | 'TRAM' | 'SUBWAY' | 'TROLLEYBUS' | 'RAIL' | string;
  from: ItineraryLegPlace;
  to: ItineraryLegPlace;
  route: { shortName: string } | null;
  intermediatePlaces: ItineraryLegPlace[] | null;
  legGeometry: { points: string }; // encoded polyline
}

export interface Itinerary {
  startTime: number;   // epoch ms
  endTime: number;
  duration: number;    // seconds
  walkDistance: number; // meters
  walkTime: number;    // seconds
  legs: ItineraryLeg[];
}

export interface TripPlanResponse {
  data: {
    plan: {
      date: number; // epoch ms
      from: { lat: number; lon: number; name: string };
      to: { lat: number; lon: number; name: string };
      itineraries: Itinerary[];
    };
  };
}

// ─── Polyline decoder ──────────────────────────────────────────────────────────

/** Decode a Google-encoded polyline string into [longitude, latitude][] for GeoJSON. */
export function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    coords.push([lng / 1e5, lat / 1e5]); // [lon, lat] for GeoJSON
  }

  return coords;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Search for locations by address text. */
export async function searchLocations(address: string): Promise<TripLocation[]> {
  return apiPost<TripLocation[]>('/trip/locations', { address });
}

/** Get all transit stops. */
export async function getAllStops(): Promise<TripStop[]> {
  return apiPost<TripStop[]>('/trip/getAllStops', {});
}

/** Get all transit lines. */
export async function getAllLines(): Promise<TripLine[]> {
  return apiPost<TripLine[]>('/trip/getLines', {});
}

/** Reverse-geocode coordinates to an address string. */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  return apiPost<string>('/reverse', { lat, lng });
}

/** Plan a trip between two locations. */
export async function planTrip(req: TripRequest): Promise<Itinerary[]> {
  const now = new Date();
  const payload = {
    type: req.type ?? '0',
    from: req.from,
    to: req.to,
    date: req.date ?? now.toISOString().slice(0, 10),
    time: req.time ?? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    arriveBy: req.arriveBy ?? false,
    locale: LOCALE,
  };

  const resp = await apiPost<TripPlanResponse>('/trip/trip', payload);
  return resp.data.plan.itineraries;
}
