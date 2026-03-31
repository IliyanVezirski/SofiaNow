import React from 'react';
import { View, Text, Pressable, ScrollView, TouchableOpacity, StyleSheet, Modal, useWindowDimensions } from 'react-native';
import { Stop } from '../../../services/stopsApi';
import { StopEta } from '../../../types/vehicles';
import { getEtaScheduleInfo } from '../../../services/cgmApi/schedules';
import { getVehicleAccentColor, getVehicleIconName, formatUnixTime } from '../../../services/transitUtils';
import { formatMinSinceMidnight } from '../../map/constants';
import { ArrivalReminderControl } from '../../notifications/components/ArrivalReminderControl';
import { ReminderCenterButton } from '../../notifications/components/ReminderCenterButton';
import { Ionicons } from '@expo/vector-icons';

interface Props {
    stop: Stop;
    etas: StopEta[];
    onClose: () => void;
    onOpenSchedule: (stopId: string, stopName: string) => void;
    onOpenSavedTripRoute?: (routeId: string) => void | Promise<void>;
    onPlaceAction?: () => void;
    placeSaved?: boolean;
    placeSubmitting?: boolean;
}

export const StopInfoPanel: React.FC<Props> = ({
    stop,
    etas,
    onClose,
    onOpenSchedule,
    onOpenSavedTripRoute,
    onPlaceAction,
    placeSaved = false,
    placeSubmitting = false,
}) => {
    const visibleEtas = etas;
    const { height } = useWindowDimensions();
    const panelBottomOffset = Math.min(Math.max(height * 0.16, 96), 188);
    const panelMaxHeight = Math.min(Math.max(height * 0.42, 280), 420);
    const scrollMaxHeight = Math.min(Math.max(panelMaxHeight - 128, 140), 260);

    return (
        <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.modalRoot}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <View style={[styles.panel, { marginBottom: panelBottomOffset, maxHeight: panelMaxHeight }]}>
                    <View style={styles.header}>
                        <Ionicons name="flag-outline" size={16} color="#0F172A" style={{ marginRight: 4 }} />
                        <Text style={styles.title}>{stop.name}</Text>
                        {onPlaceAction ? (
                            <TouchableOpacity
                                style={[styles.placeIconBtn, placeSaved && styles.placeIconBtnSaved]}
                                onPress={onPlaceAction}
                                disabled={placeSubmitting}
                            >
                                <Ionicons
                                    name={placeSaved ? 'bookmark' : 'bookmark-outline'}
                                    size={15}
                                    color={placeSaved ? '#A16207' : '#64748B'}
                                />
                            </TouchableOpacity>
                        ) : null}
                        <Pressable style={styles.closeBtn} onPress={onClose}>
                            <Ionicons name="close" size={18} color="#334155" />
                        </Pressable>
                    </View>
                    <ScrollView style={[styles.scroll, { maxHeight: scrollMaxHeight }]} nestedScrollEnabled>
                        <Text style={styles.info}>{`Линии: ${stop.lines.slice(0, 8).join(', ') || 'н/д'}`}</Text>
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
                                                    <Ionicons name={getVehicleIconName(eta.type) as any} size={15} color="#FFFFFF" />
                                                </View>
                                                <View style={styles.etaTextWrap}>
                                                    <Text style={styles.etaLineText}>
                                                        {lineLabel}
                                                    </Text>
                                                    <Text style={styles.etaMetaText}>
                                                        {schedText ? `Разп. ${schedText}` : 'Няма разписание'}
                                                        {delayText ? ' • ' : ''}
                                                        {delayText ? (
                                                            <Text style={hasDelay ? styles.delayLateText : isEarly ? styles.delayEarlyText : styles.delayOnTimeText}>
                                                                {delayText}
                                                            </Text>
                                                        ) : null}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                        <View style={styles.etaSideWrap}>
                                            <Text style={styles.etaMinutesText}>{eta.minutesAway} мин</Text>
                                            <Text style={styles.etaClockText}>{formatUnixTime(eta.arrivalTimestamp)}</Text>
                                            <ArrivalReminderControl stopName={stop.name} eta={eta} compact />
                                        </View>
                                    </View>
                                </View>
                            );
                        }) : <Text style={styles.info}>Няма налични ETA в момента</Text>}
                    </ScrollView>
                    <View style={styles.footerActions}>
                        <ReminderCenterButton inline onOpenSavedTripRoute={onOpenSavedTripRoute} />
                        <TouchableOpacity style={styles.scheduleBtn} onPress={() => onOpenSchedule(stop.id, stop.name)}>
                            <Ionicons name="calendar-outline" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                            <Text style={styles.scheduleBtnText}>Разписание</Text>
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
        backgroundColor: 'rgba(15,23,42,0.18)',
    },
    panel: {
        marginHorizontal: 16,
        backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: 24, padding: 14, zIndex: 25, elevation: 25,
        shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 28,
        borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)',
    },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 4 },
    title: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: '700', color: '#0F172A' },
    placeIconBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(248,250,252,0.72)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        flexShrink: 0,
    },
    placeIconBtnSaved: {
        backgroundColor: 'rgba(254,249,195,0.75)',
        borderColor: 'rgba(217,119,6,0.18)',
    },
    closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(248,250,252,0.72)', borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    scroll: { flexGrow: 0 },
    info: { fontSize: 12, color: '#475569', marginBottom: 8, lineHeight: 18 },
    etaCard: {
        backgroundColor: 'rgba(248,250,252,0.72)',
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
    },
    etaRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    etaInfoWrap: {
        flex: 1,
        minWidth: 0,
    },
    etaHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        minWidth: 0,
    },
    etaTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    etaLineText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0F172A',
        lineHeight: 17,
    },
    etaMetaText: {
        marginTop: 2,
        fontSize: 11,
        color: '#475569',
        lineHeight: 16,
    },
    etaSideWrap: {
        minWidth: 72,
        alignItems: 'flex-end',
        flexShrink: 0,
    },
    etaMinutesText: {
        fontSize: 13,
        fontWeight: '800',
        color: '#1D4ED8',
    },
    etaClockText: {
        marginTop: 2,
        marginBottom: 6,
        fontSize: 11,
        color: '#94A3B8',
    },
    delayLateText: {
        color: '#DC2626',
        fontWeight: '700',
    },
    delayEarlyText: {
        color: '#2563EB',
        fontWeight: '700',
    },
    delayOnTimeText: {
        color: '#475569',
        fontWeight: '600',
    },
    vehicleBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    footerActions: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
    },
    scheduleBtn: { flex: 1, flexDirection: 'row', backgroundColor: '#1D4ED8', borderRadius: 12, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
    scheduleBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
