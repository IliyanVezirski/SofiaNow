import React, { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ECO_DATASET_CATALOG } from '../data/catalog';
import { useEcoParks } from '../hooks/useEcoParks';
import { openExternalDrivingNavigation } from '../../../services/integrations';
import type { EcoActionKey } from '../types';

type Props = {
    activeDataset: EcoActionKey;
    onClose: () => void;
    onOpenPlannerWithCoordinates?: (
        destinationLatitude: number,
        destinationLongitude: number,
        currentLatitude?: number | null,
        currentLongitude?: number | null,
    ) => void;
    onShowParkOnMap?: (parkId: string, bbox: [number, number, number, number]) => void;
};

export const EcoDatasetScreen: React.FC<Props> = ({
    activeDataset,
    onClose,
    onOpenPlannerWithCoordinates,
    onShowParkOnMap,
}) => {
    const dataset = ECO_DATASET_CATALOG[activeDataset];
    const parks = useEcoParks(null, activeDataset === 'parks');

    const parkItems = useMemo(
        () => (parks.parks?.features ?? [])
            .slice()
            .sort((left, right) => right.properties.areaSqM - left.properties.areaSqM)
            .slice(0, 60),
        [parks.parks?.features],
    );

    const promptNavigation = (
        parkName: string,
        latitude: number,
        longitude: number,
    ) => {
        Alert.alert(
            'Навигация',
            `Как да те водя до ${parkName}?`,
            [
                {
                    text: 'Пеша',
                    onPress: () => onOpenPlannerWithCoordinates?.(latitude, longitude),
                },
                {
                    text: 'С кола',
                    onPress: () => {
                        void openExternalDrivingNavigation(latitude, longitude);
                    },
                },
                {
                    text: 'Отказ',
                    style: 'cancel',
                },
            ],
            { cancelable: true },
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerIconWrap}>
                    <View style={[styles.headerIconBadge, { backgroundColor: `${dataset.accentColor}16` }]}>
                        <Ionicons name={dataset.icon} size={20} color={dataset.accentColor} />
                    </View>
                    <View style={styles.headerTextWrap}>
                        <Text style={styles.title}>{dataset.title}</Text>
                        <Text style={styles.subtitle}>{dataset.subtitle}</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <Ionicons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={[styles.heroCard, { borderColor: `${dataset.accentColor}2A` }]}>
                    <Text style={styles.description}>{dataset.description}</Text>
                    <View style={styles.tagsWrap}>
                        {dataset.tags.map((tag) => (
                            <View key={tag} style={styles.tagChip}>
                                <Text style={styles.tagText}>{tag}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                {activeDataset === 'parks' ? (
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionTitle}>Паркове и градини</Text>
                        <Text style={styles.sectionBody}>
                            {parks.loading
                                ? 'Зареждам списъка с паркове...'
                                : `Показани са ${parkItems.length} записа. Източникът не подава имена, затова използваме етикет по тип и ID.`}
                        </Text>
                        <View style={styles.parkListWrap}>
                            {parkItems.map((park) => (
                                <View key={park.id} style={styles.parkRow}>
                                    <View style={styles.parkRowMain}>
                                        <Text style={styles.parkName}>{park.properties.displayName}</Text>
                                        <Text style={styles.parkMeta}>
                                            {`${park.properties.category} • ${formatArea(park.properties.areaSqM)}`}
                                        </Text>
                                        <View style={styles.parkActions}>
                                            <TouchableOpacity
                                                activeOpacity={0.88}
                                                style={styles.parkActionButton}
                                                onPress={() => onShowParkOnMap?.(park.id, park.properties.bbox)}
                                            >
                                                <Ionicons name="map-outline" size={14} color="#1D4ED8" />
                                                <Text style={styles.parkActionButtonText}>На картата</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                activeOpacity={0.88}
                                                style={styles.parkActionButton}
                                                onPress={() => promptNavigation(
                                                    park.properties.displayName,
                                                    park.properties.center[1],
                                                    park.properties.center[0],
                                                )}
                                            >
                                                <Ionicons name="navigate-outline" size={14} color="#1D4ED8" />
                                                <Text style={styles.parkActionButtonText}>Навигирай</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                    <View style={[styles.parkBadge, { backgroundColor: `${park.properties.strokeColor}16` }]}>
                                        <Text style={[styles.parkBadgeText, { color: park.properties.strokeColor }]}>
                                            {park.properties.zoneCode || 'Зп'}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                ) : null}
            </ScrollView>
        </View>
    );
};

const formatArea = (areaSqM: number) => {
    if (!Number.isFinite(areaSqM) || areaSqM <= 0) {
        return 'н/д';
    }

    if (areaSqM >= 1000000) {
        return `${(areaSqM / 1000000).toFixed(2)} км²`;
    }

    return `${Math.round(areaSqM).toLocaleString('bg-BG')} м²`;
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    header: {
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(226,232,240,0.72)',
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
    },
    headerIconWrap: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingRight: 8,
    },
    headerIconBadge: {
        width: 42,
        height: 42,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTextWrap: {
        flex: 1,
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: '#0F172A',
    },
    subtitle: {
        marginTop: 4,
        fontSize: 13,
        color: '#64748B',
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(241,245,249,0.95)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.9)',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 12,
    },
    heroCard: {
        borderRadius: 18,
        borderWidth: 1,
        backgroundColor: 'rgba(255,255,255,0.9)',
        padding: 14,
        gap: 10,
    },
    description: {
        fontSize: 14,
        lineHeight: 20,
        color: '#334155',
        fontWeight: '600',
    },
    tagsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    tagChip: {
        borderRadius: 999,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.92)',
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    tagText: {
        fontSize: 11,
        color: '#475569',
        fontWeight: '700',
    },
    sectionCard: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.78)',
        backgroundColor: 'rgba(255,255,255,0.86)',
        padding: 14,
        gap: 10,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#0F172A',
    },
    sectionBody: {
        fontSize: 13,
        lineHeight: 20,
        color: '#475569',
        fontWeight: '600',
    },
    parkListWrap: {
        gap: 8,
    },
    parkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 14,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.9)',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    parkRowMain: {
        flex: 1,
    },
    parkName: {
        fontSize: 13,
        lineHeight: 18,
        color: '#0F172A',
        fontWeight: '800',
    },
    parkMeta: {
        marginTop: 2,
        fontSize: 11,
        lineHeight: 16,
        color: '#64748B',
        fontWeight: '600',
    },
    parkActions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 10,
    },
    parkActionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        height: 34,
        borderRadius: 10,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(239,246,255,0.82)',
        borderWidth: 1,
        borderColor: 'rgba(191,219,254,0.72)',
    },
    parkActionButtonText: {
        color: '#1D4ED8',
        fontSize: 12,
        fontWeight: '800',
    },
    parkBadge: {
        minWidth: 38,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
    },
    parkBadgeText: {
        fontSize: 11,
        fontWeight: '800',
    },
});
