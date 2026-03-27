import React from 'react';
import { View, Text, Pressable, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
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
    if (!stopId) return null;

    return (
        <Modal animationType="slide" transparent={false} visible={!!stopId} onRequestClose={onClose}>
            <View style={styles.fullScreen}>
                <View style={styles.header}>
                    <View style={styles.titleWrap}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Ionicons name="calendar-outline" size={16} color="#0F172A" />
                            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.title}>{stopName}</Text>
                        </View>
                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.meta}>{`Спирка ${stopId}`}</Text>
                    </View>
                    <Pressable style={styles.closeBtn} onPress={onClose}>
                        <Ionicons name="close" size={20} color="#334155" />
                    </Pressable>
                </View>
                {loading && <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.eta}>Зареждане...</Text>}
                <ScrollView style={styles.list} showsVerticalScrollIndicator nestedScrollEnabled>
                    {realtime.length > 0 && (
                        <>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <Ionicons name="radio-button-on" size={12} color="#DC2626" />
                                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionTitle}>В реално време</Text>
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
                                                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.eta}>
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
                        </>
                    )}
                    {staticSchedule.length > 0 && (
                        <>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: realtime.length > 0 ? 12 : 0 }}>
                                <Ionicons name="list-outline" size={14} color="#0F172A" />
                                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionTitle}>Статично разписание</Text>
                            </View>
                            <View style={styles.dayTypeRow}>
                                <TouchableOpacity style={[styles.dayTypeChip, dayType === 'w' && styles.dayTypeChipActive]} onPress={() => onChangeDayType('w')}>
                                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={[styles.dayTypeChipText, dayType === 'w' && styles.dayTypeChipTextActive]}>Делник</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.dayTypeChip, dayType === 'h' && styles.dayTypeChipActive]} onPress={() => onChangeDayType('h')}>
                                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={[styles.dayTypeChipText, dayType === 'h' && styles.dayTypeChipTextActive]}>Почивен ден</Text>
                                </TouchableOpacity>
                            </View>
                            {staticSchedule.map((entry) => (
                                <View key={`st-${entry.line}-${entry.destination}`} style={styles.row}>
                                    <View style={styles.etaHeaderRow}>
                                        <View style={[styles.vehicleBadge, { backgroundColor: getVehicleAccentColor(entry.type) }]}>
                                            <Ionicons name={getVehicleIconName(entry.type) as any} size={15} color="#FFFFFF" />
                                        </View>
                                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.eta}>{`${entry.line} \u2192 ${entry.destination}`}</Text>
                                    </View>
                                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.meta}>{entry.times.map(formatMinutesSinceMidnight).join(', ')}</Text>
                                </View>
                            ))}
                        </>
                    )}
                    {!loading && !realtime.length && !staticSchedule.length && (
                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.eta}>Няма налично разписание за тази спирка</Text>
                    )}
                </ScrollView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    fullScreen: { flex: 1, backgroundColor: '#F8FAFC', paddingTop: 50, paddingHorizontal: 16, paddingBottom: 16 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(226,232,240,0.72)' },
    titleWrap: { flex: 1 },
    title: { color: '#0F172A', fontSize: 16, fontWeight: '700' },
    meta: { color: '#475569', fontSize: 12, marginBottom: 2 },
    closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(248,250,252,0.72)', borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', alignItems: 'center', justifyContent: 'center' },
    list: { flexGrow: 1, gap: 6 },
    eta: { flex: 1, color: '#0F172A', fontSize: 13, marginBottom: 8 },
    sectionTitle: { color: '#0F172A', fontSize: 13, fontWeight: '700' },
    row: { backgroundColor: 'rgba(248,250,252,0.72)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    etaHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    vehicleBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    dayTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    dayTypeChip: { backgroundColor: 'rgba(226,232,240,0.72)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    dayTypeChipActive: { backgroundColor: '#1D4ED8', borderColor: '#1D4ED8' },
    dayTypeChipText: { color: '#475569', fontSize: 12, fontWeight: '700' },
    dayTypeChipTextActive: { color: '#FFFFFF' },
});
