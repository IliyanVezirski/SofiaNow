import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
    visible: boolean;
    vehiclesCount: number;
    stopsCount: number;
    filterCount: number;
    onOpenSearch: () => void;
    onOpenFavorites: () => void;
}

export const TransportModePanel: React.FC<Props> = ({
    visible,
    vehiclesCount,
    stopsCount,
    filterCount,
    onOpenSearch,
    onOpenFavorites,
}) => {
    if (!visible) return null;

    return (
        <View style={styles.panel}>
            <View style={styles.headerRow}>
                <View>
                    <Text style={styles.title}>Градски транспорт</Text>
                    <Text style={styles.subtitle}>Живи превозни средства, спирки и маршрутни панели.</Text>
                </View>
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{filterCount > 0 ? `${filterCount} филтъра` : 'Без филтри'}</Text>
                </View>
            </View>

            <View style={styles.metricsRow}>
                <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>{vehiclesCount}</Text>
                    <Text style={styles.metricLabel}>Превозни средства</Text>
                </View>
                <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>{stopsCount}</Text>
                    <Text style={styles.metricLabel}>Спирки</Text>
                </View>
            </View>

            <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.actionButton} onPress={onOpenSearch}>
                    <Ionicons name="search-outline" size={16} color="#0F172A" />
                    <Text style={styles.actionText}>Търсене</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={onOpenFavorites}>
                    <Ionicons name="star-outline" size={16} color="#0F172A" />
                    <Text style={styles.actionText}>Любими</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    panel: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 112,
        backgroundColor: 'rgba(255,255,255,0.94)',
        borderRadius: 22,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.82)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
        elevation: 8,
        zIndex: 8,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
    },
    title: {
        color: '#0F172A',
        fontSize: 15,
        fontWeight: '800',
    },
    subtitle: {
        marginTop: 4,
        color: '#475569',
        fontSize: 12,
        lineHeight: 18,
        maxWidth: 220,
    },
    badge: {
        backgroundColor: '#EFF6FF',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    badgeText: {
        color: '#1D4ED8',
        fontSize: 11,
        fontWeight: '700',
    },
    metricsRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
    },
    metricCard: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    metricValue: {
        color: '#0F172A',
        fontSize: 16,
        fontWeight: '800',
    },
    metricLabel: {
        marginTop: 4,
        color: '#475569',
        fontSize: 11,
        fontWeight: '600',
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
    },
    actionButton: {
        flex: 1,
        height: 42,
        borderRadius: 16,
        backgroundColor: 'rgba(248,250,252,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.92)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    actionText: {
        color: '#0F172A',
        fontSize: 12,
        fontWeight: '700',
    },
});
