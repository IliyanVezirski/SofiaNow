import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const VEHICLE_POSITIONS_URL = 'https://gtfs.sofiatraffic.bg/api/v1/vehicle-positions';
const TRIP_UPDATES_URL = 'https://gtfs.sofiatraffic.bg/api/v1/trip-updates';
const TRIP_UPDATES_CACHE_MS = 15000;
const VEHICLE_POSITIONS_CACHE_MS = 2000;

let tripUpdatesCache: { fetchedAt: number; entities: any[] } | null = null;
let vehiclePositionsCache: { fetchedAt: number; entities: any[] } | null = null;
let tripUpdatesFetchPromise: Promise<any[]> | null = null;
let vehiclePositionsFetchPromise: Promise<any[]> | null = null;

const decodeRealtimeFeed = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch GTFS feed from ${url}: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
};

export const getTripUpdateEntities = async () => {
    const now = Date.now();
    if (tripUpdatesCache && now - tripUpdatesCache.fetchedAt < TRIP_UPDATES_CACHE_MS) {
        return tripUpdatesCache.entities;
    }
    if (tripUpdatesFetchPromise) return tripUpdatesFetchPromise;

    tripUpdatesFetchPromise = (async () => {
        try {
            const feed = await decodeRealtimeFeed(TRIP_UPDATES_URL);
            tripUpdatesCache = { fetchedAt: Date.now(), entities: feed.entity };
            return feed.entity;
        } finally {
            tripUpdatesFetchPromise = null;
        }
    })();
    return tripUpdatesFetchPromise;
};

export const getVehiclePositionEntities = async () => {
    const now = Date.now();
    if (vehiclePositionsCache && now - vehiclePositionsCache.fetchedAt < VEHICLE_POSITIONS_CACHE_MS) {
        return vehiclePositionsCache.entities;
    }
    if (vehiclePositionsFetchPromise) return vehiclePositionsFetchPromise;

    vehiclePositionsFetchPromise = (async () => {
        try {
            const feed = await decodeRealtimeFeed(VEHICLE_POSITIONS_URL);
            vehiclePositionsCache = { fetchedAt: Date.now(), entities: feed.entity };
            return feed.entity;
        } finally {
            vehiclePositionsFetchPromise = null;
        }
    })();
    return vehiclePositionsFetchPromise;
};
