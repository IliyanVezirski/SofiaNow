import React from 'react';
import { View, Text, Pressable, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { StopEta, StaticScheduleEntry, DayType } from '../../../types/vehicles';
import { getEtaScheduleInfo } from '../../../services/cgmApi/schedules';
import { getVehicleIcon, formatUnixTime } from '../../../services/transitUtils';
import { formatMinutesSinceMidnight, formatMinSinceMidnight } from '../../map/constants';

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
    if (!stopId) return null;

    return (
        <Modal animationType="slide" transparent={false} visible={!!stopId} onRequestClose={onClose}>
            <View style={styles.fullScreen}>
                <View style={styles.header}>
                    <View style={styles.titleWrap}>
                        <Text style={styles.title}>{`\uD83D\uDCC5 ${stopName}`}</Text>
                        <Text style={styles.meta}>{`Спирка ${stopId}`}</Text>
                    </View>
                    <Pressable style={styles.closeBtn} onPress={onClose}>
                        <Text style={styles.closeBtnText}>{'\u00D7'}</Text>
                    </Pressable>
                </View>
                {loading && <Text style={styles.eta}>Зареждане...</Text>}
                <ScrollView style={styles.list} showsVerticalScrollIndicator nestedScrollEnabled>
                    {realtime.length > 0 && (
                        <>
                            <Text style={styles.sectionTitle}>{'\uD83D\uDD34'} В реално време</Text>
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
                                        <Text style={styles.eta}>
                                            {`${getVehicleIcon(eta.type)} ${eta.line} \u2192 ${eta.destination || 'н/д'} \u2022 ${eta.minutesAway} мин \u2022 ${formatUnixTime(eta.arrivalTimestamp)}`}
                                            {schedText ? ` (разп. ${schedText})` : ''}
                                            {delayText ? ' ' : ''}
                                            {delayText ? (
                                                <Text style={hasDelay ? { color: '#DC2626', fontWeight: 'bold' } : isEarly ? { color: '#2563EB', fontWeight: 'bold' } : undefined}>
                                                    {delayText}
                                                </Text>
                                            ) : null}
                                        </Text>
                                    </View>
                                );
                            })}
                        </>
                    )}
                    {staticSchedule.length > 0 && (
                        <>
                            <Text style={[styles.sectionTitle, { marginTop: realtime.length > 0 ? 12 : 0 }]}>{'\uD83D\uDCCB'} Статично разписание</Text>
                            <View style={styles.dayTypeRow}>
                                <TouchableOpacity style={[styles.dayTypeChip, dayType === 'w' && styles.dayTypeChipActive]} onPress={() => onChangeDayType('w')}>
                                    <Text style={[styles.dayTypeChipText, dayType === 'w' && styles.dayTypeChipTextActive]}>Делник</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.dayTypeChip, dayType === 'h' && styles.dayTypeChipActive]} onPress={() => onChangeDayType('h')}>
                                    <Text style={[styles.dayTypeChipText, dayType === 'h' && styles.dayTypeChipTextActive]}>Празник</Text>
                                </TouchableOpacity>
                            </View>
                            {staticSchedule.map((entry) => (
                                <View key={`st-${entry.line}-${entry.destination}`} style={styles.row}>
                                    <Text style={styles.eta}>{`${getVehicleIcon(entry.type)} ${entry.line} \u2192 ${entry.destination}`}</Text>
                                    <Text style={styles.meta}>{entry.times.map(formatMinutesSinceMidnight).join(', ')}</Text>
                                </View>
                            ))}
                        </>
                    )}
                    {!loading && !realtime.length && !staticSchedule.length && (
                        <Text style={styles.eta}>Няма налично разписание за тази спирка</Text>
                    )}
                </ScrollView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    fullScreen: { flex: 1, backgroundColor: '#FFFFFF', paddingTop: 50, paddingHorizontal: 16, paddingBottom: 16 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    titleWrap: { flex: 1 },
    title: { color: '#111827', fontSize: 16, fontWeight: '700', marginBottom: 4 },
    meta: { color: '#4B5563', fontSize: 12, marginBottom: 2 },
    closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
    closeBtnText: { color: '#111827', fontSize: 20, fontWeight: '700', lineHeight: 22 },
    list: { flexGrow: 1, gap: 6 },
    eta: { color: '#1F2937', fontSize: 13, marginBottom: 8 },
    sectionTitle: { color: '#1F2937', fontSize: 13, fontWeight: '700', marginBottom: 8 },
    row: { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
    dayTypeRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
    dayTypeChip: { backgroundColor: '#F1F5F9', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: '#E2E8F0' },
    dayTypeChipActive: { backgroundColor: '#1E293B', borderColor: '#1E293B' },
    dayTypeChipText: { color: '#475569', fontSize: 12, fontWeight: '700' },
    dayTypeChipTextActive: { color: '#FFFFFF' },
});
