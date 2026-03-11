import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getVehicleIcon, VehicleType } from '../services/transitUtils';
import { AvailableLine, fetchAvailableLines, fetchLineRouteGeometryByRouteId, fetchLineRouteGeometry, fetchStopById, fetchAllStops, LineRouteGeometry, Stop } from '../services/stopsApi';
import { getStaticStopSchedule, StaticScheduleEntry } from '../services/cgmApi';
import { RouteSelection } from '../types/routes';

type ScheduleKind = 'bus' | 'trolley' | 'tram' | 'subway' | 'night';

const SCHEDULE_KIND_ORDER: ScheduleKind[] = ['bus', 'trolley', 'tram', 'subway', 'night'];

const SCHEDULE_KIND_META: Record<ScheduleKind, { label: string; icon: string }> = {
    bus: { label: 'Автобус', icon: '🚌' },
    trolley: { label: 'Тролей', icon: '🚎' },
    tram: { label: 'Трамвай', icon: '🚊' },
    subway: { label: 'Метро', icon: '🚇' },
    night: { label: 'Нощен', icon: '🌙' },
};

const getLineKind = (line: AvailableLine): ScheduleKind => {
    if (line.isNight) return 'night';
    if (line.type === 'trolley') return 'trolley';
    if (line.type === 'tram') return 'tram';
    if (line.type === 'subway') return 'subway';
    return 'bus';
};

interface SchedulesScreenProps {
    onOpenRoute?: (route: RouteSelection) => void;
}

export default function SchedulesScreen({ onOpenRoute }: SchedulesScreenProps) {
    const [allLines, setAllLines] = useState<AvailableLine[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedKind, setSelectedKind] = useState<ScheduleKind>('bus');
    const [selectedLine, setSelectedLine] = useState<AvailableLine | null>(null);
    const [routeGeometry, setRouteGeometry] = useState<LineRouteGeometry | null>(null);
    const [routeLoading, setRouteLoading] = useState(false);
    const [stopSearch, setStopSearch] = useState('');
    const [allStops, setAllStops] = useState<Stop[]>([]);
    const [expandedStopId, setExpandedStopId] = useState<string | null>(null);
    const [stopSchedule, setStopSchedule] = useState<StaticScheduleEntry[]>([]);

    useEffect(() => {
        (async () => {
            try {
                const [lines, stops] = await Promise.all([fetchAvailableLines(), fetchAllStops()]);
                setAllLines(lines);
                setAllStops(stops);
            } catch (error) {
                console.error('Failed to load data:', error);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const linesForKind = useMemo(
        () => allLines.filter((line) => getLineKind(line) === selectedKind),
        [allLines, selectedKind],
    );

    const kindCounts = useMemo(() => {
        const counts: Record<ScheduleKind, number> = { bus: 0, trolley: 0, tram: 0, subway: 0, night: 0 };
        allLines.forEach((line) => { counts[getLineKind(line)]++; });
        return counts;
    }, [allLines]);

    const filteredDirections = useMemo(() => {
        if (!routeGeometry) return [];
        const q = stopSearch.trim().toLowerCase();
        if (!q) return routeGeometry.directions;
        return routeGeometry.directions.map((dir) => ({
            ...dir,
            stops: dir.stops.filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)),
        })).filter((dir) => dir.stops.length > 0);
    }, [routeGeometry, stopSearch]);

    const globalSearchResults = useMemo(() => {
        const q = stopSearch.trim().toLowerCase();
        if (!q || q.length < 2 || selectedLine) return [];
        return allStops
            .filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
            .slice(0, 30);
    }, [allStops, stopSearch, selectedLine]);

    const handleStopPress = (stopId: string) => {
        if (expandedStopId === stopId) {
            setExpandedStopId(null);
            setStopSchedule([]);
            return;
        }
        setExpandedStopId(stopId);
        setStopSchedule(getStaticStopSchedule(stopId));
    };

    const formatMinutes = (m: number) => {
        const h = Math.floor(m / 60);
        const min = m % 60;
        return `${h}:${min < 10 ? '0' : ''}${min}`;
    };

    const nowMinutes = useMemo(() => {
        const d = new Date();
        return d.getHours() * 60 + d.getMinutes();
    }, [expandedStopId]);

    const renderStopSchedule = () => {
        if (stopSchedule.length === 0) {
            return <Text style={styles.stopEtaEmpty}>Няма налично разписание</Text>;
        }
        return stopSchedule.map((entry) => {
            const label = `${getVehicleIcon(entry.type)} ${entry.line}${entry.destination ? ` → ${entry.destination}` : ''}`;
            return (
                <View key={label} style={styles.lineGroup}>
                    <Text style={styles.lineGroupHeader}>{label}</Text>
                    <View style={styles.lineGroupTimes}>
                        {entry.times.map((m) => {
                            const isPast = m < nowMinutes;
                            return (
                                <Text
                                    key={m}
                                    style={[styles.lineGroupTime, isPast && styles.stopEtaPast]}
                                >
                                    {formatMinutes(m)}
                                </Text>
                            );
                        })}
                    </View>
                </View>
            );
        });
    };

    useEffect(() => {
        let cancelled = false;

        if (!selectedLine) {
            setRouteGeometry(null);
            setRouteLoading(false);
            setStopSearch('');
            setExpandedStopId(null);
            setStopSchedule([]);
            return;
        }

        setRouteLoading(true);

        (async () => {
            const route = selectedLine.routeId
                ? await fetchLineRouteGeometryByRouteId(selectedLine.routeId)
                : await fetchLineRouteGeometry(selectedLine.line, selectedLine.type, selectedLine.isNight);
            if (!cancelled) {
                setRouteGeometry(route);
                setRouteLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [selectedLine]);

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#1D4ED8" />
                <Text style={styles.loadingText}>Зареждам линии...</Text>
            </View>
        );
    }

    return (
        <View style={styles.page}>
            <View style={styles.header}>
                <Text style={styles.title}>Линии</Text>
                <Text style={styles.subtitle}>{`${allLines.length} налични линии`}</Text>
            </View>

            <View style={styles.globalSearchWrap}>
                <TextInput
                    style={styles.globalSearchInput}
                    placeholder="🔍 Търси спирка по име..."
                    placeholderTextColor="#9CA3AF"
                    value={stopSearch}
                    onChangeText={(text) => {
                        setStopSearch(text);
                        setExpandedStopId(null);
                        setStopSchedule([]);
                    }}
                />
            </View>

            {globalSearchResults.length > 0 && !selectedLine ? (
                <ScrollView style={styles.routeArea} contentContainerStyle={styles.routeAreaContent}>
                    <View style={styles.routeCard}>
                        <Text style={styles.routeCardTitle}>{`🔍 Резултати (${globalSearchResults.length})`}</Text>
                        {globalSearchResults.map((stop) => (
                            <TouchableOpacity
                                key={stop.id}
                                style={[
                                    styles.stopRow,
                                    expandedStopId === stop.id && styles.stopRowActive,
                                ]}
                                activeOpacity={0.7}
                                onPress={() => { void handleStopPress(stop.id); }}
                            >
                                <Text style={styles.stopIndex}>🚏</Text>
                                <View style={styles.stopInfo}>
                                    <Text style={styles.stopName}>{stop.name}</Text>
                                    <Text style={styles.stopMeta}>{`ID: ${stop.id} • Линии: ${stop.lines.slice(0, 6).join(', ')}`}</Text>
                                    {expandedStopId === stop.id && (
                                        <View style={styles.stopEtaPanel}>
                                            {renderStopSchedule()}
                                        </View>
                                    )}
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            ) : (
            <>
            <View style={styles.filtersPanel}>
                <View style={styles.kindRow}>
                    {SCHEDULE_KIND_ORDER.map((kind) => (
                        <TouchableOpacity
                            key={kind}
                            style={[styles.chip, selectedKind === kind && styles.chipActive]}
                            onPress={() => { setSelectedKind(kind); setSelectedLine(null); }}
                        >
                            <Text style={[styles.chipText, selectedKind === kind && styles.chipTextActive]}>
                                {SCHEDULE_KIND_META[kind].icon} {SCHEDULE_KIND_META[kind].label} ({kindCounts[kind]})
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <ScrollView style={styles.linesScroll} showsVerticalScrollIndicator={false}>
                    <View style={styles.linesGrid}>
                        {linesForKind.map((line) => {
                            const isActive = selectedLine?.routeId === line.routeId && selectedLine?.line === line.line;
                            return (
                                <TouchableOpacity
                                    key={`${line.routeId || line.line}`}
                                    style={[styles.lineChip, isActive && styles.chipActive]}
                                    onPress={() => setSelectedLine(isActive ? null : line)}
                                >
                                    <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{line.line}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </ScrollView>
            </View>

            <ScrollView style={styles.routeArea} contentContainerStyle={styles.routeAreaContent}>
                {!selectedLine ? (
                    <View style={styles.placeholder}>
                        <Text style={styles.placeholderIcon}>{SCHEDULE_KIND_META[selectedKind].icon}</Text>
                        <Text style={styles.placeholderText}>Избери линия, за да видиш маршрута</Text>
                    </View>
                ) : routeLoading ? (
                    <View style={styles.inlineLoader}>
                        <ActivityIndicator size="small" color="#1D4ED8" />
                        <Text style={styles.inlineLoaderText}>Зареждам маршрут...</Text>
                    </View>
                ) : routeGeometry ? (
                    <View style={styles.routeCard}>
                        <View style={styles.routeCardHeader}>
                            <Text style={styles.routeCardTitle}>
                                {getVehicleIcon(selectedLine.type)} Линия {selectedLine.line}
                            </Text>
                            <TouchableOpacity
                                style={styles.mapButton}
                                onPress={() => {
                                    onOpenRoute?.({
                                        line: selectedLine.line,
                                        type: selectedLine.isNight ? 'bus' : selectedLine.type,
                                        isNight: selectedLine.isNight,
                                        routeId: selectedLine.routeId || undefined,
                                    });
                                }}
                            >
                                <Text style={styles.mapButtonText}>🗺️ Маршрут</Text>
                            </TouchableOpacity>
                        </View>

                        {filteredDirections.map((direction, dirIndex) => (
                            <View key={`dir-${dirIndex}`} style={styles.directionBlock}>
                                <Text style={styles.directionTitle} numberOfLines={2}>
                                    {direction.name || `Посока ${dirIndex + 1}`}
                                </Text>
                                {direction.stops.map((stop, stopIndex) => (
                                    <TouchableOpacity
                                        key={`${dirIndex}-${stop.id}-${stopIndex}`}
                                        style={[
                                            styles.stopRow,
                                            expandedStopId === stop.id && styles.stopRowActive,
                                        ]}
                                        activeOpacity={0.7}
                                        onPress={() => { void handleStopPress(stop.id); }}
                                    >
                                        <Text style={styles.stopIndex}>{`${stopIndex + 1}.`}</Text>
                                        <View style={styles.stopInfo}>
                                            <Text style={styles.stopName}>{stop.name}</Text>
                                            <Text style={styles.stopMeta}>{`ID: ${stop.id}`}</Text>
                                            {expandedStopId === stop.id && (
                                                <View style={styles.stopEtaPanel}>
                                                    {renderStopSchedule()}
                                                </View>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ))}

                        {filteredDirections.length === 0 && stopSearch.trim() !== '' && (
                            <Text style={styles.emptyText}>Няма спирки, съвпадащи с търсенето</Text>
                        )}
                    </View>
                ) : (
                    <Text style={styles.emptyText}>Няма данни за маршрута.</Text>
                )}
            </ScrollView>
            </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    page: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        paddingTop: 16,
    },
    header: {
        paddingHorizontal: 16,
        marginBottom: 8,
    },
    title: {
        color: '#0F172A',
        fontSize: 22,
        fontWeight: '700',
    },
    subtitle: {
        marginTop: 2,
        color: '#475569',
        fontSize: 12,
        fontWeight: '600',
    },
    globalSearchWrap: {
        paddingHorizontal: 12,
        marginBottom: 8,
    },
    globalSearchInput: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 14,
        color: '#0F172A',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    filtersPanel: {
        marginHorizontal: 12,
        marginBottom: 10,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 14,
        padding: 10,
    },
    kindRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginRight: -6,
        marginBottom: 8,
    },
    linesScroll: {
        maxHeight: 160,
    },
    linesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginRight: -6,
    },
    chip: {
        backgroundColor: '#EFF6FF',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderWidth: 1,
        borderColor: '#BFDBFE',
        marginRight: 6,
        marginBottom: 6,
    },
    lineChip: {
        backgroundColor: '#EFF6FF',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderWidth: 1,
        borderColor: '#BFDBFE',
        marginRight: 6,
        marginBottom: 6,
        minWidth: '18%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    chipActive: {
        backgroundColor: '#1D4ED8',
        borderColor: '#1D4ED8',
    },
    chipText: {
        color: '#1E3A8A',
        fontSize: 12,
        fontWeight: '700',
    },
    chipTextActive: {
        color: '#FFFFFF',
    },
    routeArea: {
        flex: 1,
    },
    routeAreaContent: {
        paddingHorizontal: 12,
        paddingBottom: 120,
    },
    placeholder: {
        marginTop: 48,
        alignItems: 'center',
        gap: 10,
    },
    placeholderIcon: {
        fontSize: 40,
    },
    placeholderText: {
        color: '#64748B',
        fontSize: 14,
        fontWeight: '600',
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8FAFC',
    },
    loadingText: {
        marginTop: 10,
        color: '#334155',
        fontSize: 14,
        fontWeight: '600',
    },
    inlineLoader: {
        marginTop: 36,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    inlineLoaderText: {
        color: '#334155',
        fontSize: 12,
        fontWeight: '600',
    },
    routeCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 12,
    },
    routeCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
        gap: 10,
    },
    routeCardTitle: {
        color: '#1E293B',
        fontSize: 16,
        fontWeight: '700',
        flex: 1,
    },
    mapButton: {
        borderRadius: 999,
        backgroundColor: '#1D4ED8',
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    mapButtonText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    directionBlock: {
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 10,
        padding: 10,
        backgroundColor: '#F8FAFC',
        marginBottom: 10,
    },
    directionTitle: {
        color: '#1E293B',
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 6,
    },
    stopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 6,
        paddingHorizontal: 6,
        borderTopWidth: 1,
        borderTopColor: '#EDF2F7',
        borderRadius: 8,
    },
    stopRowActive: {
        backgroundColor: '#EFF6FF',
    },
    stopIndex: {
        width: 28,
        color: '#64748B',
        fontSize: 12,
        fontWeight: '700',
        paddingTop: 1,
    },
    stopInfo: {
        flex: 1,
    },
    stopName: {
        color: '#0F172A',
        fontSize: 12,
        fontWeight: '700',
    },
    stopMeta: {
        color: '#64748B',
        fontSize: 11,
        marginTop: 1,
    },
    stopEtaPanel: {
        marginTop: 6,
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    stopEtaText: {
        color: '#1E293B',
        fontSize: 12,
        marginBottom: 5,
    },
    stopEtaPast: {
        color: '#94A3B8',
    },
    stopEtaEmpty: {
        color: '#94A3B8',
        fontSize: 12,
        fontStyle: 'italic',
    },
    lineGroup: {
        marginBottom: 8,
    },
    lineGroupHeader: {
        fontWeight: '700',
        fontSize: 13,
        color: '#1E293B',
        marginBottom: 4,
    },
    lineGroupTimes: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    lineGroupTime: {
        backgroundColor: '#EEF2FF',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        fontSize: 12,
        color: '#1E293B',
        overflow: 'hidden',
    },
    emptyText: {
        color: '#475569',
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
        marginTop: 36,
    },
});
