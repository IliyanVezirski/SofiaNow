import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
    fetchLiveParkingAvailability,
    fetchRemoteParkingCatalogSnapshot,
    getBundledParkingCatalogSnapshot,
    isParkingCatalogStale,
    loadCachedParkingCatalogSnapshot,
    PARKING_CATALOG_REFRESH_INTERVAL_MS,
    type LiveParkingLot,
    type ParkingCatalogSnapshot,
} from '../../../services/parking';
import type { ParkingLot } from '../types/parkingLots';
import { haversineDistanceMeters } from '../../../services/transitUtils';

const PARKING_BUFFER_LIVE_REFRESH_INTERVAL_MS = 30_000;
const BUFFER_MATCH_DISTANCE_METERS = 400;

const normalizeParkingName = (value: string) => String(value || '').trim().toLowerCase();

const resolveStaticBufferMatch = (liveLot: LiveParkingLot, bufferLots: ParkingLot[]) => {
    const normalizedLiveName = normalizeParkingName(liveLot.name);
    const sameName = bufferLots.filter((lot) => normalizeParkingName(lot.name) === normalizedLiveName);
    const candidates = sameName.length ? sameName : bufferLots;

    return candidates.slice().sort((left, right) => {
        const leftDistance = haversineDistanceMeters(left.latitude, left.longitude, liveLot.latitude, liveLot.longitude);
        const rightDistance = haversineDistanceMeters(right.latitude, right.longitude, liveLot.latitude, liveLot.longitude);
        return leftDistance - rightDistance;
    })[0] ?? null;
};

const mergeBufferLotsFromLiveData = (catalogLots: ParkingLot[], liveLots: LiveParkingLot[]) => {
    const nonBufferLots = catalogLots.filter((lot) => lot.category !== 'buffer');
    const staticBufferLots = catalogLots.filter((lot) => lot.category === 'buffer');

    if (!liveLots.length) {
        return nonBufferLots;
    }

    const liveBufferLots = liveLots.map<ParkingLot>((liveLot) => {
        const matchedStaticLot = resolveStaticBufferMatch(liveLot, staticBufferLots);
        const matchedDistance = matchedStaticLot
            ? haversineDistanceMeters(matchedStaticLot.latitude, matchedStaticLot.longitude, liveLot.latitude, liveLot.longitude)
            : Number.POSITIVE_INFINITY;
        const canUseStaticMetadata = matchedDistance <= BUFFER_MATCH_DISTANCE_METERS;

        return {
            id: `cgm-buffer-${liveLot.id}`,
            name: canUseStaticMetadata ? matchedStaticLot!.name : liveLot.name,
            latitude: liveLot.latitude,
            longitude: liveLot.longitude,
            category: 'buffer',
            capacity: canUseStaticMetadata ? matchedStaticLot!.capacity : null,
            fee: canUseStaticMetadata ? matchedStaticLot!.fee : true,
            charge: canUseStaticMetadata ? matchedStaticLot!.charge : null,
            operator: canUseStaticMetadata ? matchedStaticLot!.operator : 'Център за градска мобилност',
            parkRide: canUseStaticMetadata ? matchedStaticLot!.parkRide : true,
            openingHours: canUseStaticMetadata ? matchedStaticLot!.openingHours : null,
            website: canUseStaticMetadata ? matchedStaticLot!.website : 'https://www.sofiatraffic.bg/bg/transport/parkirane-v-bufernite-parkingi/p/1',
            phone: canUseStaticMetadata ? matchedStaticLot!.phone : null,
            maxheight: canUseStaticMetadata ? matchedStaticLot!.maxheight : null,
            surface: canUseStaticMetadata ? matchedStaticLot!.surface : null,
        };
    });

    return [...nonBufferLots, ...liveBufferLots];
};

export function useParkingCatalog() {
    const [snapshot, setSnapshot] = useState<ParkingCatalogSnapshot>(() => getBundledParkingCatalogSnapshot());
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [liveBufferLots, setLiveBufferLots] = useState<LiveParkingLot[]>([]);
    const snapshotRef = useRef(snapshot);
    const refreshingRef = useRef(false);

    useEffect(() => {
        snapshotRef.current = snapshot;
    }, [snapshot]);

    useEffect(() => {
        refreshingRef.current = refreshing;
    }, [refreshing]);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            const cachedSnapshot = await loadCachedParkingCatalogSnapshot();
            if (cachedSnapshot && !cancelled) {
                setSnapshot(cachedSnapshot);
            }

            if (!cancelled) {
                setLoading(false);
            }

            if (cachedSnapshot && !isParkingCatalogStale(cachedSnapshot)) {
                return;
            }

            if (!cancelled) {
                setRefreshing(true);
            }

            const remoteSnapshot = await fetchRemoteParkingCatalogSnapshot();
            if (remoteSnapshot && !cancelled) {
                setSnapshot(remoteSnapshot);
            }

            if (!cancelled) {
                setRefreshing(false);
            }
        };

        void load();

        return () => {
            cancelled = true;
        };
    }, []);

    const refresh = useCallback(async () => {
        if (refreshingRef.current) {
            return null;
        }

        setRefreshing(true);
        try {
            const remoteSnapshot = await fetchRemoteParkingCatalogSnapshot();
            if (remoteSnapshot) {
                setSnapshot(remoteSnapshot);
            }
            return remoteSnapshot;
        } finally {
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            if (isParkingCatalogStale(snapshotRef.current, PARKING_CATALOG_REFRESH_INTERVAL_MS)) {
                void refresh();
            }
        }, PARKING_CATALOG_REFRESH_INTERVAL_MS);

        const appStateSubscription = AppState.addEventListener('change', (nextState) => {
            if (nextState !== 'active') {
                return;
            }

            if (isParkingCatalogStale(snapshotRef.current, PARKING_CATALOG_REFRESH_INTERVAL_MS)) {
                void refresh();
            }
        });

        return () => {
            clearInterval(interval);
            appStateSubscription.remove();
        };
    }, [refresh]);

    useEffect(() => {
        let cancelled = false;

        const refreshLiveBufferLots = async () => {
            const nextLiveLots = await fetchLiveParkingAvailability();
            if (!cancelled) {
                setLiveBufferLots(nextLiveLots);
            }
        };

        void refreshLiveBufferLots();
        const interval = setInterval(() => {
            void refreshLiveBufferLots();
        }, PARKING_BUFFER_LIVE_REFRESH_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    const mergedLots = useMemo(
        () => mergeBufferLotsFromLiveData(snapshot.lots, liveBufferLots),
        [liveBufferLots, snapshot.lots],
    );

    return {
        ...snapshot,
        lots: mergedLots,
        loading,
        refreshing,
        refresh,
    };
}
