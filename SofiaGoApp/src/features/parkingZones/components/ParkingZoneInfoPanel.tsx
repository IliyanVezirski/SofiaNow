import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { getParkingZonePolicy } from '../data/parkingZonePolicy.static';
import { parkingZonesFeatureCollection } from '../data/parkingZones.static';

interface Props {
    selectedZoneFeatureId: string | null;
    visible: boolean;
    onClose: () => void;
}

export const ParkingZoneInfoPanel: React.FC<Props> = ({
    selectedZoneFeatureId,
    visible,
    onClose,
}) => {
    const selectedFeature = useMemo(
        () => parkingZonesFeatureCollection.features.find((feature) => feature.properties.id === selectedZoneFeatureId) ?? null,
        [selectedZoneFeatureId],
    );

    const policy = selectedFeature ? getParkingZonePolicy(selectedFeature.properties.zoneId) : null;

    if (!visible || !selectedFeature || !policy) {
        return null;
    }

    const title = selectedFeature.properties.displayName;
    const subtitle = selectedFeature.properties.zoneLabel;

    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <View style={styles.titleWrap}>
                    <View style={[styles.zoneDot, { backgroundColor: selectedFeature.properties.lineColor }]} />
                    <View style={styles.titleTextWrap}>
                        <Text style={styles.title}>{title}</Text>
                        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                    </View>
                </View>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                    <Ionicons name="close" size={16} color="#475569" />
                </TouchableOpacity>
            </View>

            <View style={styles.metaGrid}>
                <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Работно време</Text>
                    <Text style={styles.metaValue}>{policy.activeSummaryLabel}</Text>
                </View>
                <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Цена</Text>
                    <Text style={styles.metaValue}>{policy.priceLabel}</Text>
                </View>
                <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>SMS</Text>
                    <Text style={styles.metaValue}>{policy.smsNumber}</Text>
                </View>
                <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Макс. престой</Text>
                    <Text style={styles.metaValue}>{policy.maxStayLabel}</Text>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 94,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.92)',
        paddingHorizontal: 14,
        paddingVertical: 14,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
        elevation: 8,
        zIndex: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    titleWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        paddingRight: 10,
    },
    zoneDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 8,
        marginTop: 4,
    },
    titleTextWrap: {
        flex: 1,
    },
    title: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0F172A',
    },
    subtitle: {
        marginTop: 2,
        fontSize: 12,
        color: '#64748B',
        fontWeight: '600',
    },
    closeButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(241,245,249,0.95)',
    },
    metaGrid: {
        gap: 8,
    },
    metaItem: {
        borderRadius: 12,
        backgroundColor: '#F8FAFC',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.9)',
    },
    metaLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#64748B',
        marginBottom: 2,
        textTransform: 'uppercase',
    },
    metaValue: {
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '700',
        color: '#1E293B',
    },
});
