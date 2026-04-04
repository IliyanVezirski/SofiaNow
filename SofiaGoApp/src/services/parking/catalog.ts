import AsyncStorage from '@react-native-async-storage/async-storage';

import bundledParkingLots from '../../features/parkingZones/data/parkingLots.generated.json';
import type { ParkingLot, ParkingLotCategory } from '../../features/parkingZones/types/parkingLots';

const PARKING_CATALOG_STORAGE_KEY = '@sofiago:parking:catalog:v1';
const DEFAULT_REMOTE_CATALOG_URLS = [
    'https://iliyanvezirski.github.io/SofiaGo/parkingLots.generated.json',
    'https://raw.githubusercontent.com/IliyanVezirski/SofiaGo/main/SofiaGoApp/src/features/parkingZones/data/parkingLots.generated.json',
    'https://cdn.jsdelivr.net/gh/IliyanVezirski/SofiaGo@main/SofiaGoApp/src/features/parkingZones/data/parkingLots.generated.json',
];
export const PARKING_CATALOG_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;

const VALID_CATEGORIES: ParkingLotCategory[] = [
    'buffer',
    'underground',
    'surface',
    'multi-storey',
    'impound',
    'airport',
    'commercial',
    'private',
];

export type ParkingCatalogSource = 'bundled' | 'cache' | 'remote';

export interface ParkingCatalogSnapshot {
    lots: ParkingLot[];
    source: ParkingCatalogSource;
    updatedAt: number | null;
    remoteUrl: string | null;
}

type CachedParkingCatalogPayload = {
    lots: ParkingLot[];
    updatedAt: number | null;
    remoteUrl: string | null;
};

const BUNDLED_PARKING_LOTS = bundledParkingLots as ParkingLot[];

const isNullableString = (value: unknown): value is string | null => value == null || typeof value === 'string';
const isNullableNumber = (value: unknown): value is number | null => value == null || (typeof value === 'number' && Number.isFinite(value));
const uniqueUrls = (urls: string[]) => urls.filter((url, index) => urls.indexOf(url) === index);

const isParkingLotCategory = (value: unknown): value is ParkingLotCategory => (
    typeof value === 'string' && VALID_CATEGORIES.includes(value as ParkingLotCategory)
);

const isParkingLot = (value: unknown): value is ParkingLot => {
    if (!value || typeof value !== 'object') return false;

    const entry = value as Record<string, unknown>;
    return typeof entry.id === 'string'
        && typeof entry.name === 'string'
        && typeof entry.latitude === 'number'
        && Number.isFinite(entry.latitude)
        && typeof entry.longitude === 'number'
        && Number.isFinite(entry.longitude)
        && isParkingLotCategory(entry.category)
        && typeof entry.fee === 'boolean'
        && isNullableString(entry.charge)
        && typeof entry.parkRide === 'boolean'
        && isNullableNumber(entry.capacity)
        && isNullableString(entry.operator)
        && isNullableString(entry.openingHours)
        && isNullableString(entry.website)
        && isNullableString(entry.phone)
        && isNullableNumber(entry.maxheight)
        && isNullableString(entry.surface);
};

const normalizeParkingLots = (value: unknown): ParkingLot[] => {
    if (!Array.isArray(value)) return [];
    return value.filter(isParkingLot);
};

const getConfiguredRemoteUrls = () => {
    const envUrl = String(process.env.EXPO_PUBLIC_PARKING_CATALOG_URL || '').trim();
    return uniqueUrls([
        envUrl,
        ...DEFAULT_REMOTE_CATALOG_URLS,
    ].filter(Boolean));
};

async function fetchCatalogResponse(url: string) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutMs = 10_000;
    const timeoutId = controller
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;

    try {
        return await fetch(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'SofiaNow/1.0 (parking catalog sync; https://github.com/IliyanVezirski/SofiaGo)',
            },
            cache: 'no-store',
            signal: controller?.signal,
        });
    } finally {
        if (timeoutId != null) {
            clearTimeout(timeoutId);
        }
    }
}

export const getBundledParkingCatalogSnapshot = (): ParkingCatalogSnapshot => ({
    lots: BUNDLED_PARKING_LOTS,
    source: 'bundled',
    updatedAt: null,
    remoteUrl: null,
});

export const isParkingCatalogStale = (
    snapshot: Pick<ParkingCatalogSnapshot, 'updatedAt'> | null,
    maxAgeMs = PARKING_CATALOG_REFRESH_INTERVAL_MS,
) => !snapshot?.updatedAt || (Date.now() - snapshot.updatedAt) > maxAgeMs;

export async function loadCachedParkingCatalogSnapshot(): Promise<ParkingCatalogSnapshot | null> {
    try {
        const raw = await AsyncStorage.getItem(PARKING_CATALOG_STORAGE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as CachedParkingCatalogPayload;
        const lots = normalizeParkingLots(parsed?.lots);
        if (!lots.length) return null;

        return {
            lots,
            source: 'cache',
            updatedAt: typeof parsed?.updatedAt === 'number' && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : null,
            remoteUrl: typeof parsed?.remoteUrl === 'string' ? parsed.remoteUrl : null,
        };
    } catch {
        return null;
    }
}

async function saveCachedParkingCatalogSnapshot(snapshot: ParkingCatalogSnapshot) {
    const payload: CachedParkingCatalogPayload = {
        lots: snapshot.lots,
        updatedAt: snapshot.updatedAt,
        remoteUrl: snapshot.remoteUrl,
    };
    await AsyncStorage.setItem(PARKING_CATALOG_STORAGE_KEY, JSON.stringify(payload));
}

export async function fetchRemoteParkingCatalogSnapshot(): Promise<ParkingCatalogSnapshot | null> {
    const urls = getConfiguredRemoteUrls();

    for (const url of urls) {
        try {
            const response = await fetchCatalogResponse(url);

            if (!response.ok) {
                continue;
            }

            const parsed = await response.json();
            const lots = normalizeParkingLots(parsed);
            if (!lots.length) {
                continue;
            }

            const snapshot: ParkingCatalogSnapshot = {
                lots,
                source: 'remote',
                updatedAt: Date.now(),
                remoteUrl: url,
            };

            await saveCachedParkingCatalogSnapshot(snapshot);
            return snapshot;
        } catch {
            continue;
        }
    }

    return null;
}
