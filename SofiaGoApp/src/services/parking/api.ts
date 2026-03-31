const PARKINGS_UPDATE_URL = 'https://www.sofiatraffic.bg/bg/parking/parkings/update';
const REFRESH_INTERVAL_MS = 30_000;

export interface LiveParkingLot {
    id: number;
    name: string;
    name_english: string;
    spaces: number;
    latitude: number;
    longitude: number;
}

let cachedData: LiveParkingLot[] | null = null;
let lastFetchTimestamp = 0;

export async function fetchLiveParkingAvailability(): Promise<LiveParkingLot[]> {
    const now = Date.now();
    if (cachedData && now - lastFetchTimestamp < REFRESH_INTERVAL_MS) {
        return cachedData;
    }
    try {
        const res = await fetch(PARKINGS_UPDATE_URL, {
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'User-Agent': 'Mozilla/5.0',
            },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: LiveParkingLot[] = await res.json();
        cachedData = data;
        lastFetchTimestamp = now;
        return data;
    } catch (err) {
        console.warn('[parkingApi] Failed to fetch live availability:', err);
        return cachedData ?? [];
    }
}
