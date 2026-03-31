import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLiveParkingAvailability, LiveParkingLot } from '../../../services/parking';

const POLL_INTERVAL_MS = 30_000;

export function useLiveParkingAvailability(enabled: boolean) {
    const [data, setData] = useState<LiveParkingLot[]>([]);
    const [loading, setLoading] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const lots = await fetchLiveParkingAvailability();
            setData(lots);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!enabled) {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }
        void refresh();
        intervalRef.current = setInterval(() => void refresh(), POLL_INTERVAL_MS);
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [enabled, refresh]);

    return { liveLots: data, loading, refresh };
}
