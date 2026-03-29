import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    ActivityIndicator, BackHandler, ScrollView, StyleSheet,
    Text, TouchableOpacity, View, Linking, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUserLocation } from '../features/map/hooks/useUserLocation';
import { fetchAllStops, Stop } from '../services/stopsApi';
import { haversineDistanceMeters, inferLineTypeFromToken, getVehicleAccentColor, getVehicleIconName, formatUnixTime, VehicleType } from '../services/transitUtils';
import { fetchStopEtas, StopEta } from '../services/cgmApi';
import { fetchFullStopSchedule } from '../services/cgmApi/stopEtas';
import { getEtaScheduleInfo } from '../services/cgmApi/schedules';
import { formatMinSinceMidnight } from '../features/map/constants';
import { ArrivalReminderControl } from '../features/notifications/components/ArrivalReminderControl';
import { useFavorites } from '../features/favorites/hooks/useFavorites';

// ── Walking‑radius config ──
const RADIUS_BUCKETS = [
    { key: '5min', label: '5 мин', maxMeters: 208, color: '#22C55E' },
    { key: '10min', label: '10 мин', maxMeters: 416, color: '#EAB308' },
    { key: '15min', label: '15 мин', maxMeters: 625, color: '#EF4444' },
] as const;

// ── Transport‑type helpers (mirrors MapScreen StopDot) ──
const getStopTypeInfo = (type: string): { color: string } => {
    switch (type) {
        case 'bus': return { color: '#DC2626' };
        case 'trolley': return { color: '#2563EB' };
        case 'tram': return { color: '#EA580C' };
        case 'subway': return { color: '#0056A4' };
        default: return { color: '#94A3B8' };
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

const MultiTypeBadge = ({ types }: { types: VehicleType[] }) => {
    const primaryColor = getStopTypeInfo(types[0]).color;
    return (
        <View style={[st.badge, { backgroundColor: primaryColor }]}>
            <Ionicons name="flag-outline" size={12} color="#FFFFFF" />
        </View>
    );
};

// ── Stop type badge ──
const StopTypeBadge = ({ stop }: { stop: Stop }) => {
    const types = resolveTypes(stop);
    if (types.length === 0) return null;

    if (types.length > 1) return <MultiTypeBadge types={types} />;

    const info = getStopTypeInfo(types[0]);
    return (
        <View style={[st.badge, { backgroundColor: info.color }]}>
            <Ionicons name="flag-outline" size={12} color="#FFFFFF" />
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
    const favorites = useFavorites();
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
    const savedStopIds = useMemo(
        () => new Set(favorites.favoritePlaces.map((favorite) => favorite.selectedStopId).filter(Boolean)),
        [favorites.favoritePlaces],
    );

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
            const etas = await fetchFullStopSchedule(stopId);
            setLiveEtas(etas);
        } catch {
            setLiveEtas([]);
        } finally {
            setEtasLoading(false);
        }
    }, [expandedStopId]);

    const formatDist = (m: number) => m < 1000 ? `${Math.round(m)} м` : `${(m / 1000).toFixed(1)} км`;
    const onToggleStopFavorite = useCallback((stop: Stop) => {
        const selectedLines = Array.from(new Set(
            stop.lines
                .map((line) => String(line || '').trim().toUpperCase())
                .filter(Boolean),
        )).map((line) => ({
            line,
            enabled: true,
            notificationsEnabled: false,
        }));

        const existingFavorite = favorites.favoritePlaces.find((favorite) => favorite.selectedStopId === stop.id) ?? null;

        void (async () => {
            if (existingFavorite) {
                await favorites.removeFavorite(existingFavorite.id);
                return;
            }

            await favorites.createFavorite({
                name: stop.name,
                latitude: stop.latitude,
                longitude: stop.longitude,
                selectedStopId: stop.id,
                selectedStopName: stop.name,
                selectedLines,
            });
        })();
    }, [favorites]);

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
                    <View style={st.headerCopy}>
                        <Text style={st.title}>Около мен</Text>
                        <Text style={st.subtitle}>{`${totalNearby} спирки в обхват`}</Text>
                    </View>
                    {onClose && (
                        <TouchableOpacity style={st.closeButton} onPress={onClose}>
                            <Ionicons name="close" size={18} color="#334155" />
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
                                            <View key={stop.id} style={[st.stopWrap, expandedStopId === stop.id && st.stopRowActive]}>
                                                <TouchableOpacity
                                                    style={st.stopRow}
                                                    activeOpacity={0.7}
                                                    onPress={() => { void handleStopPress(stop.id); }}
                                                >
                                                    <StopTypeBadge stop={stop} />
                                                    <View style={st.stopInfo}>
                                                        <Text style={st.stopName}>{stop.name}</Text>
                                                        <Text style={st.stopMeta}>
                                                            {`${formatDist(stop.distanceMeters)} • Линии: ${stop.lines.slice(0, 5).join(', ')}${stop.lines.length > 5 ? '...' : ''}`}
                                                        </Text>
                                                    </View>
                                                    <TouchableOpacity
                                                        style={[st.favoriteBtn, savedStopIds.has(stop.id) && st.favoriteBtnSaved]}
                                                        onPress={() => onToggleStopFavorite(stop)}
                                                    >
                                                        <Ionicons
                                                            name={savedStopIds.has(stop.id) ? 'bookmark' : 'bookmark-outline'}
                                                            size={15}
                                                            color={savedStopIds.has(stop.id) ? '#A16207' : '#64748B'}
                                                        />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={st.routeBtn}
                                                        onPress={() => {
                                                            const url = Platform.OS === 'ios'
                                                                ? `maps://?daddr=${stop.latitude},${stop.longitude}&dirflg=w`
                                                                : `google.navigation:q=${stop.latitude},${stop.longitude}&mode=w`;
                                                            Linking.canOpenURL(url).then(supported => {
                                                                if (supported) Linking.openURL(url);
                                                                else Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}&travelmode=walking`);
                                                            });
                                                        }}
                                                    >
                                                        <Ionicons name="navigate-outline" size={16} color="#0F172A" />
                                                    </TouchableOpacity>
                                                    {onFocusStop && (
                                                        <TouchableOpacity
                                                            style={st.mapBtn}
                                                            onPress={() => onFocusStop(stop.id, stop.latitude, stop.longitude)}
                                                        >
                                                            <Ionicons name="map-outline" size={16} color="#0F172A" />
                                                        </TouchableOpacity>
                                                    )}
                                                </TouchableOpacity>

                                                {expandedStopId === stop.id && (
                                                    <View style={st.etaPanel}>
                                                        {etasLoading ? (
                                                            <ActivityIndicator size="small" color="#1D4ED8" style={{ marginVertical: 8 }} />
                                                        ) : liveEtas.length === 0 ? (
                                                            <Text style={st.emptyText}>Няма живи данни за тази спирка</Text>
                                                        ) : (
                                                            liveEtas.map((eta, idx) => {
                                                                const info = getEtaScheduleInfo(eta);
                                                                const hasDelay = info.delayMinutes != null && info.delayMinutes > 0;
                                                                const isEarly = info.delayMinutes != null && info.delayMinutes < 0;
                                                                const delayText = info.delayMinutes != null
                                                                    ? (info.delayMinutes > 0 ? `+${info.delayMinutes}` : info.delayMinutes < 0 ? `${info.delayMinutes}` : 'навреме')
                                                                    : null;
                                                                const schedText = info.scheduledMinSinceMidnight != null ? formatMinSinceMidnight(info.scheduledMinSinceMidnight) : null;
                                                                const lineLabel = eta.destination ? `${eta.line} → ${eta.destination}` : eta.line;

                                                                return (
                                                                    <View key={`${eta.tripId}-${idx}`} style={st.etaRow}>
                                                                        <View style={[st.etaVehicleBadge, { backgroundColor: getVehicleAccentColor(eta.type) }]}>
                                                                            <Ionicons name={getVehicleIconName(eta.type) as any} size={14} color="#FFFFFF" />
                                                                        </View>
                                                                        <View style={st.etaMainInfo}>
                                                                            <Text style={st.etaLine} numberOfLines={2}>{lineLabel}</Text>
                                                                            {(schedText || delayText) && (
                                                                                <Text style={st.etaStatusText}>
                                                                                    {schedText ? `разп. ${schedText} ` : ''}
                                                                                    {delayText ? (
                                                                                        <Text style={hasDelay ? { color: '#DC2626', fontWeight: 'bold' } : isEarly ? { color: '#2563EB', fontWeight: 'bold' } : undefined}>
                                                                                            {delayText}
                                                                                        </Text>
                                                                                    ) : null}
                                                                                </Text>
                                                                            )}
                                                                        </View>

                                                                        <View style={st.etaTimeWrap}>
                                                                            <Text style={st.etaTime}>{eta.minutesAway} мин</Text>
                                                                            <Text style={st.etaClock}>{formatUnixTime(eta.arrivalTimestamp)}</Text>
                                                                        </View>

                                                                        <ArrivalReminderControl stopName={stop.name} eta={eta} compact />
                                                                    </View>
                                                                );
                                                            })
                                                        )}
                                                    </View>
                                                )}
                                            </View>
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
    page: { flex: 1, backgroundColor: 'transparent', paddingTop: 8 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
    loadingText: { marginTop: 10, color: '#334155', fontSize: 14, fontWeight: '600' },
    header: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10 },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
    headerCopy: { flex: 1, paddingRight: 12 },
    title: { color: '#0F172A', fontSize: 20, fontWeight: '700' },
    subtitle: { marginTop: 3, color: '#475569', fontSize: 12, fontWeight: '600' },
    closeButton: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(248,250,252,0.72)', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)',
    },

    scrollArea: { flex: 1 },
    scrollContent: { paddingHorizontal: 12, paddingBottom: 24 },

    // Bucket card
    bucketCard: {
        backgroundColor: 'rgba(255,255,255,0.74)', borderRadius: 18,
        borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', marginBottom: 12, overflow: 'hidden',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 20,
        elevation: 2,
    },
    bucketHeader: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 12, gap: 8,
        backgroundColor: 'rgba(248,250,252,0.68)',
    },
    bucketLabel: { flex: 1, color: '#1E293B', fontSize: 15, fontWeight: '700' },
    bucketCount: { color: '#64748B', fontSize: 12, fontWeight: '600' },
    accordionArrow: { color: '#64748B', fontSize: 12, fontWeight: '700' },
    bucketBody: { padding: 10 },

    // Stop row
    stopWrap: {
        borderTopWidth: 1, borderTopColor: 'rgba(226,232,240,0.72)', borderRadius: 12,
    },
    stopRow: {
        flexDirection: 'row', alignItems: 'flex-start',
        paddingVertical: 10, paddingHorizontal: 8,
    },
    stopRowActive: { backgroundColor: 'rgba(248,250,252,0.84)' },
    stopInfo: { flex: 1, minWidth: 0, marginLeft: 10 },
    stopName: { color: '#0F172A', fontSize: 13, fontWeight: '700' },
    stopMeta: { color: '#64748B', fontSize: 11, marginTop: 3, lineHeight: 15 },

    // Transport badge
    badge: {
        width: 22, height: 22, borderRadius: 11,
        alignItems: 'center', justifyContent: 'center',
    },

    // Route button
    routeBtn: {
        width: 30, height: 30, borderRadius: 15,
        backgroundColor: 'rgba(248,250,252,0.72)', alignItems: 'center', justifyContent: 'center', marginLeft: 6,
        borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)',
    },
    favoriteBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(248,250,252,0.72)',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 6,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
    },
    favoriteBtnSaved: {
        backgroundColor: 'rgba(254,249,195,0.75)',
        borderColor: 'rgba(217,119,6,0.18)',
    },
    mapBtn: {
        width: 30, height: 30, borderRadius: 15,
        backgroundColor: 'rgba(248,250,252,0.72)', alignItems: 'center', justifyContent: 'center', marginLeft: 6,
        borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)',
    },

    // ETA panel
    etaPanel: {
        marginTop: 4,
        paddingTop: 10,
        paddingHorizontal: 8,
        borderTopWidth: 1,
        borderTopColor: 'rgba(226,232,240,0.72)',
    },
    etaRow: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 6,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(226,232,240,0.72)',
    },
    etaVehicleBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 2 },
    etaMainInfo: { flex: 1, minWidth: 0, paddingRight: 6 },
    etaLine: { color: '#1E293B', fontSize: 13, fontWeight: '800', lineHeight: 17, flexShrink: 1 },
    etaStatusText: { color: '#64748B', fontSize: 10, marginTop: 1 },
    etaTimeWrap: { minWidth: 64, alignItems: 'flex-end', marginLeft: 2, flexShrink: 0 },
    etaTime: { color: '#1D4ED8', fontSize: 13, fontWeight: '800' },
    etaClock: { color: '#94A3B8', fontSize: 11, marginTop: 1, textAlign: 'right' },

    emptyText: { color: '#94A3B8', fontSize: 12, fontStyle: 'italic', padding: 8 },
});
