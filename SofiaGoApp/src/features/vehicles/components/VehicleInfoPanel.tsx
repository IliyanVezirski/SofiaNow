import React from 'react';
import { View, Text, Pressable, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Vehicle } from '../../../types/vehicles';
import { getVehicleAccentColor, getVehicleIconName, formatUnixTime } from '../../../services/transitUtils';
import { Ionicons } from '@expo/vector-icons';

interface Props {
    vehicle: Vehicle & { renderId?: string };
    delay: number | null | undefined;
    stopName: string;
    onClose: () => void;
    onLoadRoute: () => void;
    routeLoading: boolean;
    isRouteActive: boolean;
}

export const VehicleInfoPanel: React.FC<Props> = ({
    vehicle, delay, stopName, onClose, onLoadRoute, routeLoading, isRouteActive,
}) => {
    const delaySeconds = delay ?? null;
    const delayText = delaySeconds != null
        ? (delaySeconds > 0 ? `+${Math.round(delaySeconds / 60)} мин`
            : delaySeconds < 0 ? `${Math.round(delaySeconds / 60)} мин (по-рано)` : 'навреме')
        : 'зареждане...';

    return (
        <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.modalRoot}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <View style={styles.panel}>
                    <View style={styles.header}>
                        <View style={styles.titleRow}>
                            <View style={[styles.vehicleBadge, { backgroundColor: getVehicleAccentColor(vehicle.type) }]}>
                                <Ionicons name={getVehicleIconName(vehicle.type) as any} size={15} color="#FFFFFF" />
                            </View>
                            <Text style={styles.title}>{`Линия ${vehicle.line}`}</Text>
                        </View>
                        <Pressable style={styles.closeBtn} onPress={onClose}>
                            <Text style={styles.closeBtnText}>{'\u00D7'}</Text>
                        </Pressable>
                    </View>
                    <Text style={styles.info}>{`Последен update: ${formatUnixTime(vehicle.lastUpdatedUnix)}`}</Text>
                    <Text style={styles.info}>{`Скорост: ${Number.isFinite(vehicle.speedKph) ? Math.round(vehicle.speedKph as number) : 'н/д'} км/ч`}</Text>
                    <Text style={styles.info}>{`Спирка: ${stopName || 'н/д'}`}</Text>
                    <Text style={[
                        styles.info,
                        delaySeconds != null && delaySeconds > 0 ? { color: '#DC2626', fontWeight: '700' } :
                            delaySeconds != null && delaySeconds < 0 ? { color: '#2563EB', fontWeight: '700' } : undefined,
                    ]}>{`Закъснение: ${delayText}`}</Text>
                    <TouchableOpacity style={styles.routeBtn} disabled={routeLoading} onPress={onLoadRoute}>
                        <Text style={styles.routeBtnText}>
                            {routeLoading ? 'Зареждане...' : isRouteActive ? 'Скрий маршрута' : '\uD83D\uDDFA\uFE0F Продължи маршрута'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalRoot: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.18)',
    },
    panel: {
        marginBottom: 100, marginHorizontal: 16,
        backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: 18, padding: 14, zIndex: 30, elevation: 30,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8,
        borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)',
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    vehicleBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
    closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(248,250,252,0.42)', alignItems: 'center', justifyContent: 'center' },
    closeBtnText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
    info: { fontSize: 13, color: '#374151', marginBottom: 2 },
    routeBtn: { marginTop: 8, backgroundColor: 'rgba(5,150,105,0.82)', borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
    routeBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
