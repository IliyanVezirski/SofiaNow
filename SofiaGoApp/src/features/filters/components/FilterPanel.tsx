import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { VehicleType, VEHICLE_TYPE_ORDER, getVehicleIconName, getVehicleTypeLabel } from '../../../services/transitUtils';
import { Stop, summarizeStopDirections } from '../../../services/stopsApi';
import { Ionicons } from '@expo/vector-icons';

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
    const { width, height } = useWindowDimensions();

    if (!visible) return null;

    return (
        <ScrollView
            style={[
                styles.panel,
                {
                    width: Math.min(width - 24, 320),
                    right: 12,
                    maxHeight: Math.min(height * 0.72, 560),
                },
            ]}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
        >
            <View style={styles.headerRow}>
                <Text style={styles.filterTitle}>1. Филтър по вид</Text>
                {onClose && (
                    <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                        <Ionicons name="close" size={16} color="#334155" />
                    </TouchableOpacity>
                )}
            </View>
            <View style={styles.chipRow}>
                <TouchableOpacity style={[styles.chip, !selectedVehicleTypes.length && styles.chipActive]} onPress={onClearVehicleTypes}>
                    <Text style={[styles.chipText, !selectedVehicleTypes.length && styles.chipTextActive]}>Всички</Text>
                </TouchableOpacity>
                {VEHICLE_TYPE_ORDER.map((vt) => (
                    <TouchableOpacity key={vt} style={[styles.chip, selectedVehicleTypes.includes(vt) && styles.chipActive]} onPress={() => onToggleVehicleType(vt)}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name={getVehicleIconName(vt) as any} size={14} color={selectedVehicleTypes.includes(vt) ? '#FFFFFF' : '#374151'} />
                            <Text style={[styles.chipText, selectedVehicleTypes.includes(vt) && styles.chipTextActive]}>{getVehicleTypeLabel(vt)}</Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>
            <Text style={[styles.filterTitle, { marginTop: 10 }]}>2. Филтър по линия</Text>
            <ScrollView style={[styles.linesScroll, { maxHeight: Math.min(height * 0.22, 180) }]} showsVerticalScrollIndicator={false} nestedScrollEnabled>
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
            <ScrollView style={[styles.stopsList, { maxHeight: Math.min(height * 0.3, 240) }]} showsVerticalScrollIndicator={false} nestedScrollEnabled>
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
        position: 'absolute', top: 62,
        backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: 18, padding: 12, zIndex: 20, elevation: 20,
        borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)',
        shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 20,
    },
    content: { paddingBottom: 8 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    filterTitle: { color: '#0F172A', fontSize: 14, fontWeight: '700' },
    closeBtn: {
        width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(248,250,252,0.72)', borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)',
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginRight: -6, marginBottom: -6 },
    chip: {
        backgroundColor: 'rgba(248,250,252,0.72)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7,
        borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', marginRight: 6, marginBottom: 6,
    },
    chipActive: { backgroundColor: 'rgba(29,78,216,0.82)', borderColor: 'rgba(29,78,216,0.82)' },
    chipDimmed: { opacity: 0.45 },
    chipText: { color: '#1E293B', fontSize: 12, fontWeight: '700' },
    chipTextActive: { color: '#FFFFFF' },
    linesScroll: { marginTop: 2 },
    hint: { marginTop: 8, color: '#475569', fontSize: 12, fontWeight: '600' },
    stopsList: { marginTop: 10 },
    stopBtn: {
        backgroundColor: 'rgba(248,250,252,0.72)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6,
        borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)',
    },
    stopBtnText: { color: '#1D4ED8', fontSize: 12, fontWeight: '600' },
    stopDirText: { marginTop: 3, color: '#475569', fontSize: 11, lineHeight: 14 },
});
