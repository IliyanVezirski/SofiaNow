import React from 'react';
import { View, Text, Pressable, ScrollView, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Stop } from '../../../services/stopsApi';
import { StopEta } from '../../../types/vehicles';
import { getEtaScheduleInfo } from '../../../services/cgmApi/schedules';
import { getVehicleAccentColor, getVehicleIcon, formatUnixTime } from '../../../services/transitUtils';
import { formatMinSinceMidnight } from '../../map/constants';
import { ArrivalReminderControl } from '../../notifications/components/ArrivalReminderControl';
import { ReminderCenterButton } from '../../notifications/components/ReminderCenterButton';

interface Props {
    stop: Stop;
    etas: StopEta[];
    onClose: () => void;
    onOpenSchedule: (stopId: string, stopName: string) => void;
}

export const StopInfoPanel: React.FC<Props> = ({ stop, etas, onClose, onOpenSchedule }) => {
    const visibleEtas = etas;

    return (
        <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.modalRoot}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <View style={styles.panel}>
                    <View style={styles.header}>
                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.title}>{`\uD83D\uDE8F ${stop.name}`}</Text>
                        <Pressable style={styles.closeBtn} onPress={onClose}>
                            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.closeBtnText}>{'\u00D7'}</Text>
                        </Pressable>
                    </View>
                    <ScrollView style={styles.scroll} nestedScrollEnabled>
                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.info}>{`Линии: ${stop.lines.slice(0, 8).join(', ') || 'н/д'}`}</Text>
                        {visibleEtas.length > 0 ? visibleEtas.map((eta) => {
                            const info = getEtaScheduleInfo(eta);
                            const hasDelay = info.delayMinutes != null && info.delayMinutes > 0;
                            const isEarly = info.delayMinutes != null && info.delayMinutes < 0;
                            const delayText = info.delayMinutes != null
                                ? (info.delayMinutes > 0 ? `+${info.delayMinutes} мин` : info.delayMinutes < 0 ? `${info.delayMinutes} мин (по-рано)` : 'навреме')
                                : null;
                            const schedText = info.scheduledMinSinceMidnight != null ? formatMinSinceMidnight(info.scheduledMinSinceMidnight) : null;
                            const lineLabel = eta.destination ? `${eta.line} → ${eta.destination}` : eta.line;
                            return (
                                <View key={`${eta.tripId}-${eta.stopId}-${eta.arrivalTimestamp}`} style={styles.etaCard}>
                                    <View style={styles.etaRow}>
                                        <View style={styles.etaInfoWrap}>
                                            <View style={styles.etaHeaderRow}>
                                                <View style={[styles.vehicleBadge, { backgroundColor: getVehicleAccentColor(eta.type) }]}>
                                                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.vehicleBadgeText}>{getVehicleIcon(eta.type)}</Text>
                                                </View>
                                                <View style={styles.etaTextWrap}>
                                                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.etaLineText} numberOfLines={2}>
                                                        {lineLabel}
                                                    </Text>
                                                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.etaMetaText}>
                                                        {`${eta.minutesAway} мин • ${formatUnixTime(eta.arrivalTimestamp)}`}
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
                                        </View>
                                        <ArrivalReminderControl stopName={stop.name} eta={eta} />
                                    </View>
                                </View>
                            );
                        }) : <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.info}>Няма налични ETA в момента</Text>}
                    </ScrollView>
                    <View style={styles.footerActions}>
                        <ReminderCenterButton inline />
                        <TouchableOpacity style={styles.scheduleBtn} onPress={() => onOpenSchedule(stop.id, stop.name)}>
                            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.scheduleBtnText}>{'\uD83D\uDCC5'} Разписание</Text>
                        </TouchableOpacity>
                    </View>
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
        marginBottom: 188, marginHorizontal: 16, maxHeight: 280,
        backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, zIndex: 25, elevation: 25,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    title: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
    closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
    closeBtnText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
    scroll: { maxHeight: 150 },
    info: { fontSize: 13, color: '#374151', marginBottom: 2 },
    etaCard: {
        backgroundColor: '#F8FAFC',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    etaRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
    },
    etaInfoWrap: {
        flex: 1,
    },
    etaHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    etaTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    etaLineText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1F2937',
    },
    etaMetaText: {
        marginTop: 2,
        fontSize: 12,
        color: '#475569',
    },
    vehicleBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    vehicleBadgeText: {
        fontSize: 15,
    },
    footerActions: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    scheduleBtn: { flex: 1, backgroundColor: '#1D4ED8', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
    scheduleBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
