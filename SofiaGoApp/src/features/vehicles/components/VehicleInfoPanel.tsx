import React from 'react';
import { View, Text, Pressable, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Vehicle } from '../../../types/vehicles';
import { getVehicleIcon, formatUnixTime } from '../../../services/transitUtils';

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
                        <Text style={styles.title}>{`${getVehicleIcon(vehicle.type)} Линия ${vehicle.line}`}</Text>
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
        backgroundColor: 'transparent',
    },
    panel: {
        marginBottom: 110, marginHorizontal: 16,
        backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, zIndex: 30, elevation: 30,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    title: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
    closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
    closeBtnText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
    info: { fontSize: 13, color: '#374151', marginBottom: 2 },
    routeBtn: { marginTop: 8, backgroundColor: '#059669', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
    routeBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
