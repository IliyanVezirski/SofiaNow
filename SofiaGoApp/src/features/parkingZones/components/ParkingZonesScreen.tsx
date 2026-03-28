import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { parkingZonesFeatureCollection, PARKING_ZONE_RULES } from '../data/parkingZones.static';
import { getParkingZonePolicy } from '../data/parkingZonePolicy.static';
import type { ParkingZoneId } from '../types';
import { PARKING_SMS_OPTIONS } from '../../../services/parkingSms';

type ZoneListItem = {
    id: string;
    name: string;
    displayName: string;
    zoneId: ParkingZoneId;
    zoneLabel: string;
};

interface Props {
    selectedZoneFeatureId?: string | null;
    onShowZoneOnMap: (zoneFeatureId: string) => void;
    onClose: () => void;
}

const extractTrailingNumber = (name: string) => {
    const match = /(\d+)\s*$/.exec(String(name || ''));
    if (!match) {
        return Number.POSITIVE_INFINITY;
    }

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};

export const ParkingZonesScreen: React.FC<Props> = ({
    selectedZoneFeatureId = null,
    onShowZoneOnMap,
    onClose,
}) => {
    const [inspectedZoneFeatureId, setInspectedZoneFeatureId] = useState<string | null>(selectedZoneFeatureId);

    const zoneItems = useMemo<ZoneListItem[]>(() => parkingZonesFeatureCollection.features
        .map((feature) => ({
            id: feature.properties.id,
            name: feature.properties.name,
            displayName: feature.properties.displayName,
            zoneId: feature.properties.zoneId,
            zoneLabel: feature.properties.zoneLabel,
        }))
        .sort((a, b) => {
            if (a.zoneId !== b.zoneId) {
                return a.zoneId.localeCompare(b.zoneId);
            }

            const aNumber = extractTrailingNumber(a.name);
            const bNumber = extractTrailingNumber(b.name);
            if (aNumber !== bNumber) {
                return aNumber - bNumber;
            }

            return a.name.localeCompare(b.name, 'bg');
        }), []);

    useEffect(() => {
        if (!selectedZoneFeatureId) {
            return;
        }

        setInspectedZoneFeatureId(selectedZoneFeatureId);
    }, [selectedZoneFeatureId]);

    const groupedItems = useMemo(() => ({
        blue: zoneItems.filter((item) => item.zoneId === 'blue'),
        green: zoneItems.filter((item) => item.zoneId === 'green'),
    }), [zoneItems]);

    const zoneOrder: ParkingZoneId[] = ['blue', 'green'];

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Зони за паркиране</Text>
                <Text style={styles.subtitle}>Избери зона, виж информацията и после натисни „Покажи на картата“.</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <Ionicons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {zoneOrder.map((zoneId) => {
                    const zoneRule = PARKING_ZONE_RULES[zoneId];
                    const items = groupedItems[zoneId];
                    if (!items.length) {
                        return null;
                    }

                    return (
                        <View key={zoneId} style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <View style={[styles.zoneColorDot, { backgroundColor: zoneRule.lineColor }]} />
                                <View style={styles.sectionTitlesWrap}>
                                    <Text style={styles.sectionTitle}>{zoneRule.label}</Text>
                                    <Text style={styles.sectionSubtitle}>{items.length} зони</Text>
                                </View>
                            </View>

                            <View style={styles.zoneListWrap}>
                                {items.map((item) => {
                                    const isActive = item.id === inspectedZoneFeatureId;
                                    const policy = getParkingZonePolicy(item.zoneId);
                                    const smsOption = PARKING_SMS_OPTIONS.find((option) => option.id === item.zoneId) ?? null;
                                    return (
                                        <View key={item.id}>
                                            <TouchableOpacity
                                                style={[
                                                    styles.zoneItem,
                                                    isActive && {
                                                        borderColor: zoneRule.lineColor,
                                                        backgroundColor: `${zoneRule.lineColor}12`,
                                                    },
                                                ]}
                                                activeOpacity={0.88}
                                                onPress={() => setInspectedZoneFeatureId((current) => (current === item.id ? null : item.id))}
                                            >
                                                <View style={styles.zoneItemMain}>
                                                    <Text style={[styles.zoneName, isActive && { color: zoneRule.lineColor }]}>{item.displayName}</Text>
                                                    <Text style={styles.zoneZoneLabel}>{item.zoneLabel}</Text>
                                                </View>
                                                <Ionicons name={isActive ? 'chevron-up-outline' : 'information-circle-outline'} size={18} color={isActive ? zoneRule.lineColor : '#94A3B8'} />
                                            </TouchableOpacity>

                                            {isActive && policy && (
                                                <View style={[styles.inlineInfoCard, { borderColor: `${zoneRule.lineColor}55` }]}>
                                                    <Text style={styles.infoLine}>{`Зона: ${policy.zoneId === 'blue' ? 'Синя' : 'Зелена'}`}</Text>
                                                    <Text style={styles.infoLine}>{`Период: ${policy.activePeriodLabel}`}</Text>
                                                    <Text style={styles.infoLine}>{`Дни: ${policy.activeDaysLabel}`}</Text>
                                                    <Text style={styles.infoLine}>{`Часове: ${policy.activeHoursLabel}`}</Text>
                                                    <Text style={styles.infoLine}>{`Максимален престой: ${policy.maxStayLabel}`}</Text>
                                                    <Text style={styles.infoLine}>{`Плащане: ${policy.paymentLabel}`}</Text>
                                                    {smsOption ? <Text style={styles.infoLine}>{`Цена: ${smsOption.hourlyPriceLabel}`}</Text> : null}

                                                    <Text style={styles.infoDisclaimer}>{policy.disclaimer}</Text>

                                                    <TouchableOpacity
                                                        activeOpacity={0.88}
                                                        style={styles.showOnMapButton}
                                                        onPress={() => onShowZoneOnMap(item.id)}
                                                    >
                                                        <Ionicons name="map-outline" size={16} color="#FFFFFF" />
                                                        <Text style={styles.showOnMapButtonText}>Покажи на картата</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
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
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: '#0F172A',
        paddingRight: 44,
    },
    subtitle: {
        marginTop: 4,
        fontSize: 13,
        color: '#64748B',
        paddingRight: 44,
    },
    closeButton: {
        position: 'absolute',
        top: 14,
        right: 14,
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
    section: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.78)',
        backgroundColor: 'rgba(255,255,255,0.86)',
        overflow: 'hidden',
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 10,
    },
    zoneColorDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    sectionTitlesWrap: {
        marginLeft: 8,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#0F172A',
    },
    sectionSubtitle: {
        marginTop: 2,
        fontSize: 12,
        color: '#64748B',
    },
    zoneListWrap: {
        paddingHorizontal: 12,
        paddingBottom: 12,
        gap: 8,
    },
    zoneItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(203,213,225,0.8)',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    zoneItemMain: {
        flex: 1,
        paddingRight: 10,
    },
    zoneName: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E293B',
    },
    zoneZoneLabel: {
        marginTop: 2,
        fontSize: 12,
        color: '#64748B',
    },
    inlineInfoCard: {
        marginTop: 8,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(203,213,225,0.82)',
        backgroundColor: 'rgba(255,255,255,0.94)',
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    infoLine: {
        fontSize: 12,
        lineHeight: 18,
        color: '#334155',
        fontWeight: '600',
    },
    infoDisclaimer: {
        marginTop: 8,
        fontSize: 11,
        lineHeight: 16,
        color: '#64748B',
        fontWeight: '600',
    },
    showOnMapButton: {
        marginTop: 10,
        height: 42,
        borderRadius: 12,
        backgroundColor: '#1D4ED8',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
    },
    showOnMapButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '800',
    },
});
