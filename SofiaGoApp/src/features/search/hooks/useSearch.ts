import { useState, useEffect, useMemo } from 'react';
import { PlaceSearchResult, searchLocations } from '../../../services/places';
import { Stop, AvailableLine } from '../../../services/stopsApi';
import { getVehicleIcon } from '../../../services/transitUtils';

export type CentralSearchResult =
    | { kind: 'place'; id: string; name: string; subtitle: string; latitude: number; longitude: number }
    | { kind: 'line'; id: string; lineInfo: AvailableLine; name: string; subtitle: string }
    | { kind: 'stop'; id: string; stop: Stop; name: string; subtitle: string };

export const useSearch = (searchableStops: Stop[], staticLines: AvailableLine[]) => {
    const [searchModalVisible, setSearchModalVisible] = useState(false);
    const [locationSearchQuery, setLocationSearchQuery] = useState('');
    const [locationSearchResults, setLocationSearchResults] = useState<PlaceSearchResult[]>([]);
    const [locationSearchLoading, setLocationSearchLoading] = useState(false);

    useEffect(() => {
        if (searchModalVisible) {
            return;
        }

        setLocationSearchQuery('');
        setLocationSearchResults([]);
        setLocationSearchLoading(false);
    }, [searchModalVisible]);

    useEffect(() => {
        const q = locationSearchQuery.trim();
        if (!q) { setLocationSearchResults([]); setLocationSearchLoading(false); return; }
        let isMounted = true;
        setLocationSearchLoading(true);
        const timer = setTimeout(() => {
            void (async () => {
                try {
                    const results = await searchLocations(q, 6);
                    if (isMounted) setLocationSearchResults(results);
                } catch { if (isMounted) setLocationSearchResults([]); }
                finally { if (isMounted) setLocationSearchLoading(false); }
            })();
        }, 320);
        return () => { isMounted = false; clearTimeout(timer); };
    }, [locationSearchQuery]);

    const centralSearchResults = useMemo(() => {
        const q = locationSearchQuery.trim().toLowerCase();
        if (!q) return [] as CentralSearchResult[];

        const stopResults: CentralSearchResult[] = searchableStops
            .filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
            .slice(0, 8)
            .map((s) => ({
                kind: 'stop', id: s.id, stop: s, name: s.name,
                subtitle: `Спирка \u2022 ${s.id}${s.lines.length ? ` \u2022 Линии: ${s.lines.slice(0, 4).join(', ')}` : ''}`,
            }));

        const lineResults: CentralSearchResult[] = staticLines
            .filter((l) => l.line.toLowerCase().includes(q) || l.routeId.toLowerCase().includes(q))
            .slice(0, 8)
            .map((l) => ({
                kind: 'line', id: `${l.routeId}:${l.line}:${l.type}`, lineInfo: l,
                name: `${getVehicleIcon(l.type)} Линия ${l.line}`,
                subtitle: `${l.isNight ? 'Нощна линия' : l.type} \u2022 routeId: ${l.routeId || 'н/д'}`,
            }));

        const placeResults: CentralSearchResult[] = locationSearchResults
            .slice(0, 8)
            .map((p) => ({ kind: 'place', id: p.id, name: p.name, subtitle: p.subtitle, latitude: p.latitude, longitude: p.longitude }));

        return [...stopResults, ...lineResults, ...placeResults].slice(0, 20);
    }, [locationSearchQuery, searchableStops, staticLines, locationSearchResults]);

    return {
        searchModalVisible, setSearchModalVisible,
        locationSearchQuery, setLocationSearchQuery,
        locationSearchResults, locationSearchLoading,
        centralSearchResults,
    };
};
