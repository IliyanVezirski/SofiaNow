import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
    visible: boolean;
    activeZoneLabel: string | null;
    droppedPinZoneLabel: string | null;
    onPayZone?: () => void;
}

export const ParkingModesPanel: React.FC<Props> = ({
    visible,
    activeZoneLabel,
    droppedPinZoneLabel,
    onPayZone,
}) => {
    if (!visible) return null;

    return (
        <View style={styles.panel}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>Паркинг</Text>
                    <Text style={styles.subtitle}>Опциите за този режим ще се добавят тук.</Text>
                </View>
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>Скоро</Text>
                </View>
            </View>

            <View style={styles.infoBox}>
                <Text style={styles.infoLabel}>Активна зона</Text>
                <Text style={styles.infoValue}>{activeZoneLabel ?? 'Извън зона'}</Text>
                {droppedPinZoneLabel ? <Text style={styles.infoHint}>{`Пин: ${droppedPinZoneLabel}`}</Text> : null}
            </View>

            <TouchableOpacity style={styles.primaryAction} activeOpacity={0.88} onPress={onPayZone}>
                <View style={styles.primaryActionIconWrap}>
                    <Ionicons name="card-outline" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.primaryActionBody}>
                    <Text style={styles.primaryActionTitle}>Плати зона</Text>
                    <Text style={styles.primaryActionSubtitle}>Изпрати или планирай паркинг SMS в следващия модал.</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.92)" />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    panel: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 34,
        backgroundColor: 'rgba(255,255,255,0.96)',
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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
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
    },
    badge: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: 'rgba(241,245,249,0.95)',
        borderWidth: 1,
        borderColor: 'rgba(203,213,225,0.9)',
    },
    badgeText: {
        color: '#475569',
        fontSize: 11,
        fontWeight: '700',
    },
    infoBox: {
        marginTop: 12,
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    infoLabel: {
        color: '#64748B',
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    infoValue: {
        marginTop: 4,
        color: '#0F172A',
        fontSize: 15,
        fontWeight: '800',
    },
    infoHint: {
        marginTop: 4,
        color: '#334155',
        fontSize: 12,
        lineHeight: 18,
        fontWeight: '600',
    },
    primaryAction: {
        marginTop: 12,
        minHeight: 68,
        borderRadius: 18,
        backgroundColor: '#1D4ED8',
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        shadowColor: '#1D4ED8',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 18,
        elevation: 6,
    },
    primaryActionIconWrap: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.18)',
    },
    primaryActionBody: {
        flex: 1,
    },
    primaryActionTitle: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
    },
    primaryActionSubtitle: {
        marginTop: 2,
        color: 'rgba(255,255,255,0.82)',
        fontSize: 11,
        lineHeight: 16,
        fontWeight: '600',
    },
});
