import React from 'react';
import { ActivityIndicator, View, Text, Pressable, ScrollView, TouchableOpacity, Modal, StyleSheet, useWindowDimensions } from 'react-native';
import { StopEta, StaticScheduleEntry, DayType } from '../../../types/vehicles';
import { getEtaScheduleInfo } from '../../../services/cgmApi/schedules';
import { getVehicleAccentColor, getVehicleIconName, formatUnixTime } from '../../../services/transitUtils';
import { formatMinutesSinceMidnight, formatMinSinceMidnight } from '../../map/constants';
import { Ionicons } from '@expo/vector-icons';

interface Props {
    stopId: string | null;
    stopName: string;
    realtime: StopEta[];
    staticSchedule: StaticScheduleEntry[];
    dayType: DayType;
    loading: boolean;
    onClose: () => void;
    onChangeDayType: (dt: DayType) => void;
}

export const StopScheduleModal: React.FC<Props> = ({
    stopId, stopName, realtime, staticSchedule, dayType, loading, onClose, onChangeDayType,
}) => {
    const { height } = useWindowDimensions();

    if (!stopId) return null;

    const panelBottomOffset = Math.min(Math.max(height * 0.16, 96), 188);
    const panelMaxHeight = Math.max(height - panelBottomOffset - 8, 360);
    const listMaxHeight = Math.max(panelMaxHeight - 92, 220);

    return (
        <Modal animationType="fade" transparent visible={!!stopId} onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.modalRoot}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <View style={[styles.panel, { marginBottom: panelBottomOffset, maxHeight: panelMaxHeight }]}>
                    <View style={styles.header}>
                        <View style={styles.headerRow}>
                            <View style={styles.headerTextWrap}>
                                <Text style={styles.title}>Разписание</Text>
                                <Text style={styles.subtitle} numberOfLines={2}>{`${stopName} • Спирка ${stopId}`}</Text>
                            </View>
                            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                                <Ionicons name="close" size={18} color="#334155" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <ScrollView
                        style={[styles.routeArea, { maxHeight: listMaxHeight }]}
                        contentContainerStyle={styles.routeAreaContent}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled
                        bounces={false}
                    >
                        {loading && !realtime.length && !staticSchedule.length && (
                            <View style={styles.inlineLoader}>
                                <ActivityIndicator size="small" color="#1D4ED8" />
                                <Text style={styles.inlineLoaderText}>Зареждане...</Text>
                            </View>
                        )}

                        {realtime.length > 0 && (
                            <View style={styles.routeCard}>
                                <View style={styles.sectionHeaderRow}>
                                    <Ionicons name="radio-button-on" size={12} color="#DC2626" />
                                    <Text style={styles.sectionTitle}>В реално време</Text>
                                </View>
                                {realtime.map((eta) => {
                                        const info = getEtaScheduleInfo(eta);
                                        const hasDelay = info.delayMinutes != null && info.delayMinutes > 0;
                                        const isEarly = info.delayMinutes != null && info.delayMinutes < 0;
                                        const delayText = info.delayMinutes != null
                                            ? (info.delayMinutes > 0 ? `+${info.delayMinutes} мин` : info.delayMinutes < 0 ? `${info.delayMinutes} мин (по-рано)` : 'навреме')
                                            : null;
                                        const schedText = info.scheduledMinSinceMidnight != null ? formatMinSinceMidnight(info.scheduledMinSinceMidnight) : null;
                                        return (
                                            <View key={`rt-${eta.tripId}-${eta.arrivalTimestamp}`} style={styles.row}>
                                                <View style={styles.etaHeaderRow}>
                                                    <View style={[styles.vehicleBadge, { backgroundColor: getVehicleAccentColor(eta.type) }]}>
                                                        <Ionicons name={getVehicleIconName(eta.type) as any} size={15} color="#FFFFFF" />
                                                    </View>
                                                    <Text style={styles.eta}>
                                                        {`${eta.line} \u2192 ${eta.destination || 'н/д'} \u2022 ${eta.minutesAway} мин \u2022 ${formatUnixTime(eta.arrivalTimestamp)}`}
                                                        {schedText ? ` (разп. ${schedText})` : ''}
                                                        {delayText ? ' ' : ''}
                                                        {delayText ? (
                                                            <Text style={hasDelay ? { color: '#DC2626', fontWeight: 'bold' } : isEarly ? { color: '#2563EB', fontWeight: 'bold' } : undefined}>
                                                                {delayText}
                                                            </Text>
                                                        ) : null}
                                                    </Text>
                                                </View>
                                            </View>
                                        );
                                    })}
                            </View>
                        )}

                        {staticSchedule.length > 0 && (
                            <View style={styles.routeCard}>
                                <View style={styles.sectionHeaderRow}>
                                    <Ionicons name="list-outline" size={14} color="#0F172A" />
                                    <Text style={styles.sectionTitle}>Разписание</Text>
                                </View>
                                <View style={styles.dayTypeRow}>
                                    <TouchableOpacity style={[styles.dayTypeChip, dayType === 'w' && styles.dayTypeChipActive]} onPress={() => onChangeDayType('w')}>
                                        <Text style={[styles.dayTypeChipText, dayType === 'w' && styles.dayTypeChipTextActive]}>Делник</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.dayTypeChip, dayType === 'h' && styles.dayTypeChipActive]} onPress={() => onChangeDayType('h')}>
                                        <Text style={[styles.dayTypeChipText, dayType === 'h' && styles.dayTypeChipTextActive]}>Почивен ден</Text>
                                    </TouchableOpacity>
                                </View>
                                {staticSchedule.map((entry) => (
                                    <View key={`st-${entry.line}-${entry.destination}`} style={styles.row}>
                                        <View style={styles.etaHeaderRow}>
                                            <View style={[styles.vehicleBadge, { backgroundColor: getVehicleAccentColor(entry.type) }]}>
                                                <Ionicons name={getVehicleIconName(entry.type) as any} size={15} color="#FFFFFF" />
                                            </View>
                                            <Text style={styles.eta}>{`${entry.line} \u2192 ${entry.destination}`}</Text>
                                        </View>
                                        <Text style={styles.meta}>{entry.times.map(formatMinutesSinceMidnight).join(', ')}</Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {!loading && !realtime.length && !staticSchedule.length && (
                            <Text style={styles.emptyText}>Няма налично разписание за тази спирка</Text>
                        )}
                    </ScrollView>
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
        backgroundColor: 'rgba(15,23,42,0.18)',
    },
    panel: {
        marginHorizontal: 16,
        backgroundColor: '#F8FAFC',
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.9)',
        overflow: 'hidden',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 28,
        zIndex: 30,
        elevation: 30,
    },
    header: {
        paddingHorizontal: 14,
        paddingTop: 6,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(226,232,240,0.9)',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    headerTextWrap: {
        flex: 1,
        paddingRight: 12,
    },
    title: {
        color: '#0F172A',
        fontSize: 18,
        fontWeight: '700',
    },
    subtitle: {
        marginTop: 2,
        color: '#475569',
        fontSize: 12,
        fontWeight: '600',
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(248,250,252,0.72)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
    },
    routeArea: {
        flexGrow: 0,
        backgroundColor: '#F8FAFC',
    },
    routeAreaContent: {
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 16,
    },
    routeCard: {
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        padding: 10,
        marginBottom: 8,
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
    eta: { flex: 1, minWidth: 0, color: '#0F172A', fontSize: 13, marginBottom: 8, lineHeight: 19 },
    sectionTitle: { color: '#0F172A', fontSize: 12, fontWeight: '700' },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    row: { backgroundColor: 'rgba(248,250,252,0.72)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    etaHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    vehicleBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    dayTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    dayTypeChip: { backgroundColor: 'rgba(226,232,240,0.72)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    dayTypeChipActive: { backgroundColor: '#1D4ED8', borderColor: '#1D4ED8' },
    dayTypeChipText: { color: '#475569', fontSize: 12, fontWeight: '700' },
    dayTypeChipTextActive: { color: '#FFFFFF' },
    meta: { color: '#475569', fontSize: 12, marginBottom: 2 },
    emptyText: { color: '#64748B', fontSize: 14, fontWeight: '600', marginTop: 48, textAlign: 'center' },
});
