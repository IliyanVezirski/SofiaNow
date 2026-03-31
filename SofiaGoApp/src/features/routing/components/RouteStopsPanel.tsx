import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDirectionAccentColor } from '../../map/constants';

export interface RouteStopItem {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    dirIndex: number;
    stopIndex: number;
    directionName: string;
}

interface Props {
    visible: boolean;
    lineName: string;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    stops: RouteStopItem[];
    selectedStopId: string | null;
    onSelectStop: (stop: RouteStopItem) => void;
    onClose: () => void;
    onToggleOpen: () => void;
}

export const RouteStopsPanel: React.FC<Props> = ({
    visible, lineName, searchQuery, onSearchChange, stops, selectedStopId, onSelectStop, onClose, onToggleOpen,
}) => {
    const { width, height } = useWindowDimensions();
    const [expandedDirections, setExpandedDirections] = useState<Set<string>>(new Set());

    const groupedDirections = useMemo(() => {
        const groups = new Map<string, { key: string; dirIndex: number; directionName: string; stops: RouteStopItem[] }>();

        stops.forEach((stop) => {
            const key = `dir-${stop.dirIndex}`;
            const existing = groups.get(key);
            if (existing) {
                existing.stops.push(stop);
                return;
            }

            groups.set(key, {
                key,
                dirIndex: stop.dirIndex,
                directionName: stop.directionName,
                stops: [stop],
            });
        });

        return Array.from(groups.values()).sort((left, right) => left.dirIndex - right.dirIndex);
    }, [stops]);

    useEffect(() => {
        if (!groupedDirections.length) {
            setExpandedDirections(new Set());
            return;
        }

        setExpandedDirections((previous) => {
            const validKeys = new Set(groupedDirections.map((direction) => direction.key));
            const next = new Set(Array.from(previous).filter((key) => validKeys.has(key)));

            if (next.size === 0) {
                next.add(groupedDirections[0].key);
            }

            return next;
        });
    }, [groupedDirections]);

    const toggleDirection = (directionKey: string) => {
        setExpandedDirections((previous) => {
            const next = new Set(previous);
            if (next.has(directionKey)) {
                next.delete(directionKey);
            } else {
                next.add(directionKey);
            }
            return next;
        });
    };

    if (!visible) {
        return (
            <TouchableOpacity style={[styles.toggleBtn, { right: 12 }]} onPress={onToggleOpen}>
                <Ionicons name="git-network-outline" size={20} color="#334155" />
            </TouchableOpacity>
        );
    }

    return (
        <View style={[styles.panel, { width: Math.min(width - 24, 340), right: 12, maxHeight: Math.min(height * 0.72, 560) }]}>
            <View style={styles.header}>
                <View style={styles.headerTitleWrap}>
                    <Text style={styles.title}>Маршрут</Text>
                    <Text style={styles.subtitle} numberOfLines={1}>{`Линия ${lineName}`}</Text>
                </View>
                <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                    <Ionicons name="close" size={18} color="#334155" />
                </TouchableOpacity>
            </View>
            <View style={styles.searchWrap}>
                <Ionicons name="search-outline" size={16} color="#94A3B8" style={styles.searchIcon} />
                <TextInput style={styles.input} placeholder="Търси спирка по име..." placeholderTextColor="#9CA3AF" value={searchQuery} onChangeText={onSearchChange} />
            </View>
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                {groupedDirections.map((direction) => {
                    const isExpanded = expandedDirections.has(direction.key);
                    return (
                        <View key={direction.key} style={styles.directionCard}>
                            <TouchableOpacity style={styles.directionHeader} activeOpacity={0.7} onPress={() => toggleDirection(direction.key)}>
                                <View style={styles.directionHeaderTextWrap}>
                                    <View style={styles.directionTitleRow}>
                                        <Ionicons name="navigate-outline" size={14} color="#475569" />
                                        <Text style={styles.directionTitle} numberOfLines={2}>{direction.directionName || `Посока ${direction.dirIndex + 1}`}</Text>
                                    </View>
                                    <Text style={styles.directionMeta}>{`${direction.stops.length} спирки`}</Text>
                                </View>
                                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#64748B" />
                            </TouchableOpacity>

                            {isExpanded ? (
                                <View style={styles.directionBody}>
                                    {direction.stops.map((stop) => (
                                        <TouchableOpacity
                                            key={`rs-${stop.dirIndex}-${stop.id}-${stop.stopIndex}`}
                                            style={[styles.item, selectedStopId === stop.id && styles.itemActive]}
                                            onPress={() => onSelectStop(stop)}
                                            activeOpacity={0.7}
                                        >
                                            <View style={[styles.badge, { backgroundColor: getDirectionAccentColor(stop.dirIndex) }]}>
                                                <Text style={styles.badgeText}>{stop.stopIndex + 1}</Text>
                                            </View>
                                            <View style={styles.info}>
                                                <Text style={styles.name} numberOfLines={2}>{stop.name}</Text>
                                                <Text style={styles.meta}>{`ID: ${stop.id}`}</Text>
                                            </View>
                                            <Ionicons name="chevron-forward" size={15} color="#94A3B8" />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            ) : null}
                        </View>
                    );
                })}
                {groupedDirections.length === 0 && <Text style={styles.empty}>Няма намерени спирки</Text>}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    panel: {
        position: 'absolute', top: 62,
        backgroundColor: '#F8FAFC', borderRadius: 22, padding: 12, zIndex: 20, elevation: 20,
        borderWidth: 1, borderColor: 'rgba(226,232,240,0.9)',
        shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 28,
    },
    toggleBtn: {
        position: 'absolute', top: 62, width: 44, height: 44, borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.97)', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#E5E7EB', zIndex: 20, elevation: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4,
    },
    header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 8 },
    headerTitleWrap: { flex: 1, minWidth: 0, paddingRight: 8 },
    title: { color: '#0F172A', fontSize: 18, fontWeight: '700' },
    subtitle: { marginTop: 2, color: '#475569', fontSize: 12, fontWeight: '600' },
    closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(248,250,252,0.72)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', flexShrink: 0 },
    searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', marginBottom: 10 },
    searchIcon: { marginRight: 8 },
    input: { flex: 1, paddingVertical: 10, fontSize: 14, color: '#0F172A' },
    list: { maxHeight: 420 },
    listContent: { paddingBottom: 4 },
    directionCard: { backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', marginBottom: 8, overflow: 'hidden' },
    directionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: 'rgba(248,250,252,0.68)' },
    directionHeaderTextWrap: { flex: 1, minWidth: 0 },
    directionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    directionTitle: { color: '#1E293B', fontSize: 14, fontWeight: '700', flex: 1 },
    directionMeta: { color: '#64748B', fontSize: 11, fontWeight: '600', marginTop: 2 },
    directionBody: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.68)' },
    item: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12, gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(226,232,240,0.72)' },
    itemActive: { backgroundColor: 'rgba(219,234,254,0.72)' },
    badge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
    info: { flex: 1, minWidth: 0 },
    name: { color: '#0F172A', fontSize: 12, fontWeight: '700', lineHeight: 17 },
    meta: { color: '#64748B', fontSize: 11, marginTop: 2, lineHeight: 15 },
    empty: { color: '#64748B', fontSize: 14, fontWeight: '600', textAlign: 'center', paddingVertical: 20 },
});
