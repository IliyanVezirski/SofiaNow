import { useEffect, useMemo, useState } from 'react';

import type { MapBounds } from '../../../types/map';
import { fetchEcoParks, filterEcoParksByBounds } from '../services/parks';
import type { EcoParksFeatureCollection } from '../types';

export const useEcoParks = (bounds: MapBounds | null, enabled: boolean) => {
    const [parks, setParks] = useState<EcoParksFeatureCollection | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!enabled || parks) {
            return;
        }

        let cancelled = false;
        setLoading(true);

        void fetchEcoParks()
            .then((collection) => {
                if (!cancelled) {
                    setParks(collection);
                }
            })
            .catch((error) => {
                console.warn('Failed to load eco parks dataset:', error);
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [enabled, parks]);

    const visibleParks = useMemo(
        () => filterEcoParksByBounds(parks, bounds),
        [bounds, parks],
    );

    return {
        loading,
        parks,
        visibleParks,
    };
};
