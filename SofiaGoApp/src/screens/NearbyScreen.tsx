import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    ActivityIndicator, BackHandler, ScrollView, StyleSheet,
    Text, TouchableOpacity, View,
} from 'react-native';
import { useUserLocation } from '../features/map/hooks/useUserLocation';
import { fetchAllStops, Stop } from '../services/stopsApi';
import { haversineDistanceMeters, inferLineTypeFromToken, getVehicleIcon, formatUnixTime, VehicleType } from '../services/transitUtils';
import { fetchStopEtas, StopEta } from '../services/cgmApi';

// ── Walking‑radius config ──
const RADIUS_BUCKETS = [
    { key: '5min',  label: '🟢 5 мин',  maxMeters: 416,  color: '#22C55E' },
    { key: '10min', label: '🟡 10 мин', maxMeters: 833,  color: '#EAB308' },
    { key: '15min', label: '🔴 15 мин', maxMeters: 1250, color: '#EF4444' },
] as const;

// ── Transport‑type helpers (mirrors MapScreen StopDot) ──
const getStopTypeInfo = (type: string): { color: string; text: string } => {
    switch (type) {
        case 'bus':     return { color: '#DC2626', text: 'Б' };
        case 'trolley': return { color: '#2563EB', text: 'ТР' };
        case 'tram':    return { color: '#EA580C', text: 'ТМ' };
        case 'subway':  return { color: '#FFFFFF', text: 'M' };
        default:        return { color: '#9CA3AF', text: '' };
    }
};

const resolveTypes = (stop: Stop): VehicleType[] => {
    if (stop.vehicleTypes && stop.vehicleTypes.length > 0) {
        return [...new Set(stop.vehicleTypes)].sort();
    }
    const tSet = new Set<VehicleType>();
    stop.lines.forEach(l => tSet.add(inferLineTypeFromToken(l)));
    return [...tSet].sort();
};

// ── Stop type badge ──
const StopTypeBadge = ({ stop }: { stop: Stop }) => {
    const types = resolveTypes(stop);
    if (types.length === 0) return null;

    if (types.length === 1 && types[0] === 'subway') {
        return (
            <View style={[st.badge, { backgroundColor: '#FFF', borderColor: '#0056A4', borderWidth: 1.5 }]}>
                <Text style={{ color: '#0056A4', fontWeight: '900', fontSize: 10 }}>M</Text>
            </View>
        );
    }

    if (types.length === 1) {
        const info = getStopTypeInfo(types[0]);
        return (
            <View style={[st.badge, { backgroundColor: info.color }]}>
                <Text style={st.badgeText}>{info.text}</Text>
            </View>
        );
    }

    return (
        <View style={[st.badge, { flexDirection: 'row', overflow: 'hidden', padding: 0 }]}>
            {types.map(t => {
                const info = getStopTypeInfo(t);
                return (
                    <View key={t} style={{ flex: 1, backgroundColor: info.color, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={[st.badgeText, { fontSize: 7 }]}>{info.text}</Text>
                    </View>
                );
            })}
        </View>
    );
};

// ── Props ──
interface NearbyScreenProps {
    onClose?: () => void;
    onFocusStop?: (stopId: string, latitude: number, longitude: number) => void;
    onBuildRoute?: (dstLat: number, dstLon: number, curLat?: number, curLon?: number) => void;
}

type BucketedStop = Stop & { distanceMeters: number };

export default function NearbyScreen({ onClose, onFocusStop, onBuildRoute }: NearbyScreenProps) {
    const { location } = useUserLocation();
    const [allStops, setAllStops] = useState<Stop[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedBucket, setExpandedBucket] = useState<string>('5min');
    const [expandedStopId, setExpandedStopId] = useState<string | null>(null);
    const [liveEtas, setLiveEtas] = useState<StopEta[]>([]);
    const [etasLoading, setEtasLoading] = useState(false);

    // ── Load stops ──
    useEffect(() => {
        void fetchAllStops().then((stops) => { setAllStops(stops); setLoading(false); });
    }, []);

    // ── Back handler ──
    useEffect(() => {
        if (!onClose) return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
        return () => sub.remove();
    }, [onClose]);

    // ── Bucket stops by distance ──
    const buckets = useMemo(() => {
        if (!location || !allStops.length) return RADIUS_BUCKETS.map(b => ({ ...b, stops: [] as BucketedStop[] }));

        const lat = location.coords.latitude;
        const lon = location.coords.longitude;

        const withDist: BucketedStop[] = allStops.map(stop => ({
            ...stop,
            distanceMeters: haversineDistanceMeters(lat, lon, stop.latitude, stop.longitude),
        })).filter(s => s.distanceMeters <= RADIUS_BUCKETS[RADIUS_BUCKETS.length - 1].maxMeters);

        withDist.sort((a, b) => a.distanceMeters - b.distanceMeters);

        let prevMax = 0;
        return RADIUS_BUCKETS.map(bucket => {
            const stops = withDist.filter(s => s.distanceMeters > prevMax && s.distanceMeters <= bucket.maxMeters);
            prevMax = bucket.maxMeters;
            return { ...bucket, stops };
        });
    }, [location, allStops]);

    const totalNearby = useMemo(() => buckets.reduce((sum, b) => sum + b.stops.length, 0), [buckets]);

    // ── Fetch live ETAs when a stop is expanded ──
    const handleStopPress = useCallback(async (stopId: string) => {
        if (expandedStopId === stopId) {
            setExpandedStopId(null);
            setLiveEtas([]);
            return;
        }
        setExpandedStopId(stopId);
        setEtasLoading(true);
        try {
            const etaMap = await fetchStopEtas([stopId]);
            setLiveEtas(etaMap[stopId] || []);
        } catch {
            setLiveEtas([]);
        } finally {
            setEtasLoading(false);
        }
    }, [expandedStopId]);

    const formatDist = (m: number) => m < 1000 ? `${Math.round(m)} м` : `${(m / 1000).toFixed(1)} км`;

    // ── Render ──
    if (loading || !location) {
        return (
            <View style={st.centered}>
                <ActivityIndicator size="large" color="#1D4ED8" />
                <Text style={st.loadingText}>{!location ? 'Очакване на GPS...' : 'Зареждам спирки...'}</Text>
            </View>
        );
    }

    return (
        <View style={st.page}>
            <View style={st.header}>
                <View style={st.headerRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={st.title}>Около мен</Text>
                        <Text style={st.subtitle}>{`${totalNearby} спирки в обхват`}</Text>
                    </View>
                    {onClose && (
                        <TouchableOpacity style={st.closeButton} onPress={onClose}>
                            <Text style={st.closeButtonText}>{"\u00D7"}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <ScrollView style={st.scrollArea} contentContainerStyle={st.scrollContent}>
                {buckets.map(bucket => {
                    const isOpen = expandedBucket === bucket.key;
                    return (
                        <View key={bucket.key} style={st.bucketCard}>
                            <TouchableOpacity
                                style={st.bucketHeader}
                                activeOpacity={0.7}
                                onPress={() => setExpandedBucket(isOpen ? '' : bucket.key)}
                            >
                                <View style={[st.bucketDot, { backgroundColor: bucket.color }]} />
                                <Text style={st.bucketLabel}>{bucket.label}</Text>
                                <Text style={st.bucketCount}>{bucket.stops.length} спирки</Text>
                                <Text style={st.accordionArrow}>{isOpen ? '▲' : '▼'}</Text>
                            </TouchableOpacity>

                            {isOpen && (
                                <View style={st.bucketBody}>
                                    {bucket.stops.length === 0 ? (
                                        <Text style={st.emptyText}>Няма спирки в тази зона</Text>
                                    ) : (
                                        bucket.stops.map((stop) => (
                                            <TouchableOpacity
                                                key={stop.id}
                                                style={[st.stopRow, expandedStopId === stop.id && st.stopRowActive]}
                                                activeOpacity={0.7}
                                                onPress={() => { void handleStopPress(stop.id); }}
                                            >
                                                <StopTypeBadge stop={stop} />
                                                <View style={st.stopInfo}>
                                                    <Text style={st.stopName}>{stop.name}</Text>
                                                    <Text style={st.stopMeta}>
                                                        {`${formatDist(stop.distanceMeters)} • Линии: ${stop.lines.slice(0, 5).join(', ')}${stop.lines.length > 5 ? '...' : ''}`}
                                                    </Text>

                                                    {expandedStopId === stop.id && (
                                                        <View style={st.etaPanel}>
                                                            {etasLoading ? (
                                                                <ActivityIndicator size="small" color="#1D4ED8" style={{ marginVertical: 8 }} />
                                                            ) : liveEtas.length === 0 ? (
                                                                <Text style={st.emptyText}>Няма живи данни за тази спирка</Text>
                                                            ) : (
                                                                liveEtas.map((eta, idx) => (
                                                                    <View key={`${eta.tripId}-${idx}`} style={st.etaRow}>
                                                                        <Text style={st.etaIcon}>{getVehicleIcon(eta.type)}</Text>
                                                                        <Text style={st.etaLine}>{eta.line}</Text>
                                                                        {eta.destination ? (
                                                                            <Text style={st.etaDest} numberOfLines={1}>→ {eta.destination}</Text>
                                                                        ) : null}
                                                                        <View style={{ flex: 1 }} />
                                                                        <Text style={st.etaTime}>{eta.minutesAway} мин</Text>
                                                                        <Text style={st.etaClock}>{formatUnixTime(eta.arrivalTimestamp)}</Text>
                                                                    </View>
                                                                ))
                                                            )}
                                                        </View>
                                                    )}
                                                </View>
                                                {onBuildRoute && (
                                                    <TouchableOpacity
                                                        style={st.routeBtn}
                                                        onPress={() => onBuildRoute(
                                                            stop.latitude,
                                                            stop.longitude,
                                                            location?.coords.latitude,
                                                            location?.coords.longitude,
                                                        )}
                                                    >
                                                        <Text style={st.routeBtnText}>🧭</Text>
                                                    </TouchableOpacity>
                                                )}
                                            </TouchableOpacity>
                                        ))
                                    )}
                                </View>
                            )}
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
}

// ── Styles ──
const st = StyleSheet.create({
    page: { flex: 1, backgroundColor: '#F8FAFC', paddingTop: 16 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
    loadingText: { marginTop: 10, color: '#334155', fontSize: 14, fontWeight: '600' },
    header: { paddingHorizontal: 16, marginBottom: 12 },
    headerRow: { flexDirection: 'row', alignItems: 'center' },
    title: { color: '#0F172A', fontSize: 22, fontWeight: '700' },
    subtitle: { marginTop: 2, color: '#475569', fontSize: 12, fontWeight: '600' },
    closeButton: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    closeButtonText: { fontSize: 22, color: '#334155', fontWeight: '600', lineHeight: 24 },

    scrollArea: { flex: 1 },
    scrollContent: { paddingHorizontal: 12, paddingBottom: 120 },

    // Bucket card
    bucketCard: {
        backgroundColor: '#FFFFFF', borderRadius: 14,
        borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 10, overflow: 'hidden',
    },
    bucketHeader: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 12, gap: 8,
        backgroundColor: '#EFF6FF',
    },
    bucketDot: { width: 12, height: 12, borderRadius: 6 },
    bucketLabel: { flex: 1, color: '#1E293B', fontSize: 15, fontWeight: '700' },
    bucketCount: { color: '#64748B', fontSize: 12, fontWeight: '600' },
    accordionArrow: { color: '#64748B', fontSize: 12, fontWeight: '700' },
    bucketBody: { padding: 8 },

    // Stop row
    stopRow: {
        flexDirection: 'row', alignItems: 'flex-start',
        paddingVertical: 8, paddingHorizontal: 6,
        borderTopWidth: 1, borderTopColor: '#EDF2F7', borderRadius: 8,
    },
    stopRowActive: { backgroundColor: '#EFF6FF' },
    stopInfo: { flex: 1, marginLeft: 8 },
    stopName: { color: '#0F172A', fontSize: 13, fontWeight: '700' },
    stopMeta: { color: '#64748B', fontSize: 11, marginTop: 1 },

    // Transport badge
    badge: {
        width: 26, height: 26, borderRadius: 13,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#000',
    },
    badgeText: { color: '#FFF', fontSize: 8, fontWeight: '900' },

    // Route button
    routeBtn: {
        width: 30, height: 30, borderRadius: 15,
        backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center', marginLeft: 4,
        borderWidth: 1, borderColor: '#93C5FD',
    },
    routeBtnText: { fontSize: 14 },

    // ETA panel
    etaPanel: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
    etaRow: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EDF2F7',
    },
    etaIcon: { fontSize: 14, width: 20 },
    etaLine: { color: '#1E293B', fontSize: 13, fontWeight: '800', minWidth: 30 },
    etaDest: { color: '#64748B', fontSize: 11, maxWidth: 120 },
    etaTime: { color: '#1D4ED8', fontSize: 13, fontWeight: '800' },
    etaClock: { color: '#94A3B8', fontSize: 11, marginLeft: 4, minWidth: 38, textAlign: 'right' },

    emptyText: { color: '#94A3B8', fontSize: 12, fontStyle: 'italic', padding: 8 },
});
