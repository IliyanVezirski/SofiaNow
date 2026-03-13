import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { VehicleType, VEHICLE_TYPE_ORDER, getVehicleIcon, getVehicleTypeLabel } from '../../../services/transitUtils';
import { Stop, summarizeStopDirections } from '../../../services/stopsApi';

interface Props {
    visible: boolean;
    selectedVehicleTypes: VehicleType[];
    selectedLines: string[];
    availableLines: string[];
    liveLineSet: Set<string>;
    filteredVehiclesCount: number;
    totalVehiclesCount: number;
    filteredStops: Stop[];
    totalStopsCount: number;
    onToggleVehicleType: (type: VehicleType) => void;
    onToggleLine: (line: string) => void;
    onClearVehicleTypes: () => void;
    onClearLines: () => void;
    onClose?: () => void;
    onOpenStopDetails: (stop: Stop) => void;
}

export const FilterPanel: React.FC<Props> = ({
    visible, selectedVehicleTypes, selectedLines, availableLines, liveLineSet,
    filteredVehiclesCount, totalVehiclesCount, filteredStops, totalStopsCount,
    onToggleVehicleType, onToggleLine, onClearVehicleTypes, onClearLines,
    onClose, onOpenStopDetails,
}) => {
    if (!visible) return null;

    return (
        <ScrollView style={styles.panel} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} nestedScrollEnabled>
            <View style={styles.headerRow}>
                <Text style={styles.filterTitle}>1. Филтър по вид</Text>
                {onClose && (
                    <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                        <Text style={styles.closeBtnText}>{'\u00D7'}</Text>
                    </TouchableOpacity>
                )}
            </View>
            <View style={styles.chipRow}>
                <TouchableOpacity style={[styles.chip, !selectedVehicleTypes.length && styles.chipActive]} onPress={onClearVehicleTypes}>
                    <Text style={[styles.chipText, !selectedVehicleTypes.length && styles.chipTextActive]}>Всички</Text>
                </TouchableOpacity>
                {VEHICLE_TYPE_ORDER.map((vt) => (
                    <TouchableOpacity key={vt} style={[styles.chip, selectedVehicleTypes.includes(vt) && styles.chipActive]} onPress={() => onToggleVehicleType(vt)}>
                        <Text style={[styles.chipText, selectedVehicleTypes.includes(vt) && styles.chipTextActive]}>{getVehicleIcon(vt)} {getVehicleTypeLabel(vt)}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            <Text style={[styles.filterTitle, { marginTop: 10 }]}>2. Филтър по линия</Text>
            <ScrollView style={styles.linesScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                <View style={styles.chipRow}>
                    <TouchableOpacity style={[styles.chip, !selectedLines.length && styles.chipActive]} onPress={onClearLines}>
                        <Text style={[styles.chipText, !selectedLines.length && styles.chipTextActive]}>Всички</Text>
                    </TouchableOpacity>
                    {availableLines.map((line, idx) => {
                        const isLive = liveLineSet.has(line);
                        const isSelected = selectedLines.includes(line);
                        return (
                            <TouchableOpacity key={`lf-${line}-${idx}`} style={[styles.chip, isSelected && styles.chipActive, !isLive && styles.chipDimmed]} onPress={() => onToggleLine(line)}>
                                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{isLive ? `\u25CF ${line}` : line}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>
            <Text style={styles.hint}>{`Показани превозни средства: ${filteredVehiclesCount}/${totalVehiclesCount}`}</Text>
            <Text style={styles.hint}>{`Видими спирки: ${filteredStops.length}/${totalStopsCount}`}</Text>
            <ScrollView style={styles.stopsList} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                {filteredStops.map((stop) => (
                    <TouchableOpacity key={stop.id} style={styles.stopBtn} onPress={() => onOpenStopDetails(stop)}>
                        <Text style={styles.stopBtnText} numberOfLines={1}>{stop.name}</Text>
                        <Text style={styles.stopDirText} numberOfLines={2}>{summarizeStopDirections(stop, 1)}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    panel: {
        position: 'absolute', top: 62, right: 76, width: 248, maxHeight: '72%',
        backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 14, padding: 12, zIndex: 20, elevation: 20,
    },
    content: { paddingBottom: 8 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    filterTitle: { color: '#264653', fontSize: 14, fontWeight: '700' },
    closeBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D1D5DB' },
    closeBtnText: { fontSize: 18, lineHeight: 20, fontWeight: '700', color: '#334155' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginRight: -6, marginBottom: -6 },
    chip: { backgroundColor: '#EEF2FF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#C7D2FE', marginRight: 6, marginBottom: 6 },
    chipActive: { backgroundColor: '#1D4ED8', borderColor: '#1D4ED8' },
    chipDimmed: { opacity: 0.45 },
    chipText: { color: '#1E3A8A', fontSize: 12, fontWeight: '700' },
    chipTextActive: { color: '#FFFFFF' },
    linesScroll: { marginTop: 2, maxHeight: 140 },
    hint: { marginTop: 8, color: '#4B5563', fontSize: 12, fontWeight: '600' },
    stopsList: { marginTop: 10, maxHeight: 200 },
    stopBtn: { backgroundColor: '#DBEAFE', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6 },
    stopBtnText: { color: '#1D4ED8', fontSize: 12, fontWeight: '600' },
    stopDirText: { marginTop: 3, color: '#4B5563', fontSize: 11, lineHeight: 14 },
});
