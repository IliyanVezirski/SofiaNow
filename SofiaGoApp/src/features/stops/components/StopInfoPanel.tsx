import React from 'react';
import { View, Text, Pressable, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Stop, summarizeStopDirections } from '../../../services/stopsApi';
import { StopEta } from '../../../types/vehicles';
import { getEtaScheduleInfo } from '../../../services/cgmApi/schedules';
import { getVehicleIcon, formatUnixTime } from '../../../services/transitUtils';
import { STOP_ETA_PREVIEW_COUNT, formatMinSinceMidnight } from '../../map/constants';

interface Props {
    stop: Stop;
    etas: StopEta[];
    onClose: () => void;
    onOpenSchedule: (stopId: string, stopName: string) => void;
}

export const StopInfoPanel: React.FC<Props> = ({ stop, etas, onClose, onOpenSchedule }) => {
    const visibleEtas = etas.slice(0, STOP_ETA_PREVIEW_COUNT);

    return (
        <View style={styles.panel}>
            <View style={styles.header}>
                <Text style={styles.title}>{`\uD83D\uDE8F ${stop.name}`}</Text>
                <Pressable style={styles.closeBtn} onPress={onClose}>
                    <Text style={styles.closeBtnText}>{'\u00D7'}</Text>
                </Pressable>
            </View>
            <ScrollView style={styles.scroll} nestedScrollEnabled>
                <Text style={styles.info}>{summarizeStopDirections(stop, 2)}</Text>
                <Text style={styles.info}>{`Линии: ${stop.lines.slice(0, 8).join(', ') || 'н/д'}`}</Text>
                {visibleEtas.length > 0 ? visibleEtas.map((eta) => {
                    const info = getEtaScheduleInfo(eta);
                    const hasDelay = info.delayMinutes != null && info.delayMinutes > 0;
                    const isEarly = info.delayMinutes != null && info.delayMinutes < 0;
                    const delayText = info.delayMinutes != null
                        ? (info.delayMinutes > 0 ? `+${info.delayMinutes} мин` : info.delayMinutes < 0 ? `${info.delayMinutes} мин (по-рано)` : 'навреме')
                        : null;
                    const schedText = info.scheduledMinSinceMidnight != null ? formatMinSinceMidnight(info.scheduledMinSinceMidnight) : null;
                    return (
                        <Text key={`${eta.tripId}-${eta.stopId}-${eta.arrivalTimestamp}`} style={styles.info}>
                            {`${getVehicleIcon(eta.type)} ${eta.line} \u2022 ${eta.minutesAway} мин \u2022 ${formatUnixTime(eta.arrivalTimestamp)}`}
                            {schedText ? ` (разп. ${schedText})` : ''}
                            {delayText ? ' ' : ''}
                            {delayText ? (
                                <Text style={hasDelay ? { color: '#DC2626', fontWeight: 'bold' } : isEarly ? { color: '#2563EB', fontWeight: 'bold' } : undefined}>
                                    {delayText}
                                </Text>
                            ) : null}
                        </Text>
                    );
                }) : <Text style={styles.info}>Няма налични ETA в момента</Text>}
            </ScrollView>
            <TouchableOpacity style={styles.scheduleBtn} onPress={() => onOpenSchedule(stop.id, stop.name)}>
                <Text style={styles.scheduleBtnText}>{'\uD83D\uDCC5'} Разписание</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    panel: {
        position: 'absolute', bottom: 70, left: 16, right: 16, maxHeight: 280,
        backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, zIndex: 25, elevation: 25,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    title: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
    closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
    closeBtnText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
    scroll: { maxHeight: 150 },
    info: { fontSize: 13, color: '#374151', marginBottom: 2 },
    scheduleBtn: { marginTop: 8, backgroundColor: '#1D4ED8', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
    scheduleBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
