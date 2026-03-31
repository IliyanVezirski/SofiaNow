import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ParkingLot, ParkingLotCategory } from '../types/parkingLots';
import type { LiveParkingLot } from '../../../services/parking';
import { fetchLiveParkingAvailability } from '../../../services/parking';
import { isPrivateParkingCandidate } from '../utils/privateParking';
import { openExternalDrivingNavigation } from '../../../services/integrations';

const CATEGORY_META: Record<ParkingLotCategory, { label: string; icon: string; color: string }> = {
    buffer:         { label: 'Буферен',       icon: 'train-outline',     color: '#0D9488' },
    underground:    { label: 'Подземен',       icon: 'arrow-down-circle-outline', color: '#6366F1' },
    'multi-storey': { label: 'Многоетажен',    icon: 'business-outline',  color: '#8B5CF6' },
    airport:        { label: 'Летище',         icon: 'airplane-outline',  color: '#0EA5E9' },
    surface:        { label: 'Открит',         icon: 'car-outline',       color: '#F59E0B' },
    commercial:     { label: 'Търговски',      icon: 'storefront-outline',color: '#EC4899' },
    impound:        { label: 'Наказателен',    icon: 'warning-outline',   color: '#EF4444' },
    private:        { label: 'Частен',         icon: 'lock-closed-outline', color: '#6B7280' },
};

export { CATEGORY_META };

const FILTER_TABS: Array<{ key: ParkingLotCategory | 'all'; label: string }> = [
    { key: 'all', label: 'Всички' },
    { key: 'buffer', label: 'Буферни' },
    { key: 'underground', label: 'Подземни' },
    { key: 'surface', label: 'Открити' },
    { key: 'commercial', label: 'Търговски' },
    { key: 'private', label: 'Частни/търг.' },
    { key: 'impound', label: 'Наказателни' },
];

interface Props {
    parkingLots: ParkingLot[];
    onClose: () => void;
    onFocusLot?: (lat: number, lon: number) => void;
}

export const ParkingLotsScreen: React.FC<Props> = ({
    parkingLots,
    onClose,
    onFocusLot,
}) => {
    const [activeFilter, setActiveFilter] = useState<ParkingLotCategory | 'all'>('all');
    const [liveLots, setLiveLots] = useState<LiveParkingLot[]>([]);

    useEffect(() => {
        void fetchLiveParkingAvailability().then(setLiveLots);
        const interval = setInterval(() => void fetchLiveParkingAvailability().then(setLiveLots), 30_000);
        return () => clearInterval(interval);
    }, []);

    const filteredLots = useMemo(() => {
        if (activeFilter === 'all') {
            return parkingLots;
        }

        if (activeFilter === 'private') {
            return parkingLots.filter(isPrivateParkingCandidate);
        }

        return parkingLots.filter((lot) => lot.category === activeFilter);
    }, [activeFilter, parkingLots]);

    const getLiveForLot = (lot: ParkingLot): LiveParkingLot | undefined =>
        liveLots.find(l =>
            Math.abs(l.latitude - lot.latitude) < 0.002 &&
            Math.abs(l.longitude - lot.longitude) < 0.002
        );

    const openDirections = (lot: ParkingLot) => {
        if (onFocusLot) {
            onFocusLot(lot.latitude, lot.longitude);
            onClose();
            return;
        }
        void openExternalDrivingNavigation(lot.latitude, lot.longitude);
    };

    const renderItem = ({ item }: { item: ParkingLot }) => {
        const meta = CATEGORY_META[item.category];
        const live = getLiveForLot(item);
        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={[styles.categoryBadge, { backgroundColor: meta.color }]}>
                        <Ionicons name={meta.icon as any} size={14} color="#FFF" />
                    </View>
                    <View style={styles.cardTitleWrap}>
                        <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
                        <Text style={styles.cardCategory}>{meta.label}</Text>
                    </View>
                    {live != null && (
                        <View style={styles.liveChip}>
                            <View style={styles.liveDot} />
                            <Text style={styles.liveText}>{live.spaces}</Text>
                        </View>
                    )}
                </View>

                <View style={styles.cardDetails}>
                    {item.capacity != null && (
                        <View style={styles.detailChip}>
                            <Ionicons name="car-outline" size={12} color="#475569" />
                            <Text style={styles.detailText}>{item.capacity} места</Text>
                        </View>
                    )}
                    {item.fee && (
                        <View style={styles.detailChip}>
                            <Ionicons name="card-outline" size={12} color="#475569" />
                            <Text style={styles.detailText}>{item.charge || 'Платен'}</Text>
                        </View>
                    )}
                    {item.parkRide && (
                        <View style={[styles.detailChip, styles.detailChipHighlight]}>
                            <Ionicons name="train-outline" size={12} color="#0D9488" />
                            <Text style={[styles.detailText, { color: '#0D9488' }]}>Park & Ride</Text>
                        </View>
                    )}
                    {item.maxheight != null && (
                        <View style={styles.detailChip}>
                            <Ionicons name="resize-outline" size={12} color="#475569" />
                            <Text style={styles.detailText}>{item.maxheight} м</Text>
                        </View>
                    )}
                </View>

                {(item.operator || item.openingHours) && (
                    <View style={styles.cardMeta}>
                        {item.operator && <Text style={styles.metaText}>{item.operator}</Text>}
                        {item.openingHours && <Text style={styles.metaText}>{item.openingHours}</Text>}
                    </View>
                )}

                <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openDirections(item)}>
                        <Ionicons name="navigate-outline" size={14} color="#1D4ED8" />
                        <Text style={styles.actionBtnText}>Навигирай</Text>
                    </TouchableOpacity>
                    {item.phone && (
                        <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => Linking.openURL(`tel:${item.phone}`).catch(() => {})}
                        >
                            <Ionicons name="call-outline" size={14} color="#1D4ED8" />
                            <Text style={styles.actionBtnText}>Обади се</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Паркинги в София</Text>
                <Text style={styles.subtitle}>
                    {filteredLots.length} обекта{liveLots.length > 0 ? ' • лайв свободни места' : ' • OpenStreetMap'}
                </Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <Ionicons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
            </View>

            <FlatList
                horizontal
                data={FILTER_TABS}
                keyExtractor={t => t.key}
                showsHorizontalScrollIndicator={false}
                style={styles.filterList}
                contentContainerStyle={styles.filterListContent}
                renderItem={({ item: tab }) => (
                    <TouchableOpacity
                        style={[styles.filterChip, activeFilter === tab.key && styles.filterChipActive]}
                        onPress={() => setActiveFilter(tab.key)}
                    >
                        <Text style={[styles.filterChipText, activeFilter === tab.key && styles.filterChipTextActive]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                )}
            />

            <FlatList
                data={filteredLots}
                keyExtractor={l => l.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={<Text style={styles.emptyText}>Няма паркинги в тази категория.</Text>}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 18,
    },
    header: {
        paddingHorizontal: 18,
        marginBottom: 10,
    },
    title: {
        fontSize: 17,
        fontWeight: '800',
        color: '#0F172A',
    },
    subtitle: {
        marginTop: 4,
        fontSize: 12,
        color: '#64748B',
        fontWeight: '600',
    },
    closeButton: {
        position: 'absolute',
        top: 0,
        right: 18,
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterList: {
        flexGrow: 0,
        flexShrink: 0,
        height: 42,
        marginBottom: 8,
    },
    filterListContent: {
        paddingHorizontal: 18,
        gap: 8,
        alignItems: 'center',
    },
    filterChip: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 10,
        backgroundColor: 'rgba(241,245,249,0.8)',
    },
    filterChipActive: {
        backgroundColor: '#1D4ED8',
    },
    filterChipText: {
        fontSize: 12,
        color: '#475569',
        fontWeight: '600',
    },
    filterChipTextActive: {
        color: '#FFFFFF',
    },
    listContent: {
        paddingHorizontal: 18,
        paddingTop: 4,
        paddingBottom: 12,
        gap: 10,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.82)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    categoryBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitleWrap: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0F172A',
        lineHeight: 20,
    },
    cardCategory: {
        marginTop: 2,
        fontSize: 11,
        color: '#94A3B8',
        fontWeight: '600',
    },
    cardDetails: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 10,
    },
    detailChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    detailChipHighlight: {
        backgroundColor: 'rgba(13,148,136,0.08)',
        borderColor: 'rgba(13,148,136,0.24)',
    },
    detailText: {
        fontSize: 11,
        color: '#475569',
        fontWeight: '600',
    },
    cardMeta: {
        marginTop: 8,
    },
    metaText: {
        fontSize: 11,
        color: '#64748B',
        lineHeight: 16,
    },
    cardActions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 10,
    },
    actionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: 'rgba(239,246,255,0.82)',
        borderWidth: 1,
        borderColor: 'rgba(191,219,254,0.72)',
    },
    actionBtnText: {
        color: '#1D4ED8',
        fontSize: 12,
        fontWeight: '700',
    },
    emptyText: {
        textAlign: 'center',
        color: '#94A3B8',
        fontSize: 13,
        marginTop: 24,
    },
    liveChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(16,185,129,0.10)',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.24)',
    },
    liveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#10B981',
    },
    liveText: {
        fontSize: 13,
        fontWeight: '800',
        color: '#059669',
    },
});
