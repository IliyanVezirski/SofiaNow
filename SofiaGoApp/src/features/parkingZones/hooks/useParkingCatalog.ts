import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
    fetchRemoteParkingCatalogSnapshot,
    getBundledParkingCatalogSnapshot,
    isParkingCatalogStale,
    loadCachedParkingCatalogSnapshot,
    PARKING_CATALOG_REFRESH_INTERVAL_MS,
    type ParkingCatalogSnapshot,
} from '../../../services/parking';

export function useParkingCatalog() {
    const [snapshot, setSnapshot] = useState<ParkingCatalogSnapshot>(() => getBundledParkingCatalogSnapshot());
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
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

    return {
        ...snapshot,
        loading,
        refreshing,
        refresh,
    };
}
