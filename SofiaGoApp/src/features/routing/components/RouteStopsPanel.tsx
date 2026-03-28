import React from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { getDirectionAccentColor } from '../../map/constants';
import { Stop } from '../../../services/stopsApi';

export interface RouteStopItem {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    dirIndex: number;
    stopIndex: number;
    directionName: string;
}

interface Props {
    visible: boolean;
    lineName: string;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    stops: RouteStopItem[];
    selectedStopId: string | null;
    onSelectStop: (stop: RouteStopItem) => void;
    onClose: () => void;
    onToggleOpen: () => void;
}

export const RouteStopsPanel: React.FC<Props> = ({
    visible, lineName, searchQuery, onSearchChange, stops, selectedStopId, onSelectStop, onClose, onToggleOpen,
}) => {
    const { width, height } = useWindowDimensions();

    if (!visible) {
        return (
            <TouchableOpacity style={[styles.toggleBtn, { right: 12 }]} onPress={onToggleOpen}>
                <Text style={styles.toggleBtnText}>{'\uD83D\uDE8F'}</Text>
            </TouchableOpacity>
        );
    }

    return (
        <View style={[styles.panel, { width: Math.min(width - 24, 320), right: 12, maxHeight: Math.min(height * 0.72, 520) }]}>
            <View style={styles.header}>
                <Text style={styles.title}>{`\uD83D\uDE8F Спирки \u2014 ${lineName}`}</Text>
                <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                    <Text style={styles.closeBtnText}>{'\u00D7'}</Text>
                </TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder="Търси спирка по име..." placeholderTextColor="#9CA3AF" value={searchQuery} onChangeText={onSearchChange} />
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                {stops.map((stop) => (
                    <TouchableOpacity
                        key={`rs-${stop.dirIndex}-${stop.id}-${stop.stopIndex}`}
                        style={[styles.item, selectedStopId === stop.id && styles.itemActive]}
                        onPress={() => onSelectStop(stop)}
                    >
                        <View style={[styles.badge, { backgroundColor: getDirectionAccentColor(stop.dirIndex) }]}>
                            <Text style={styles.badgeText}>{stop.stopIndex + 1}</Text>
                        </View>
                        <View style={styles.info}>
                            <Text style={styles.name} numberOfLines={2}>{stop.name}</Text>
                            <Text style={styles.dir} numberOfLines={2}>{stop.directionName}</Text>
                        </View>
                    </TouchableOpacity>
                ))}
                {stops.length === 0 && <Text style={styles.empty}>Няма намерени спирки</Text>}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    panel: {
        position: 'absolute', top: 62,
        backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 14, padding: 12, zIndex: 20, elevation: 20,
    },
    toggleBtn: {
        position: 'absolute', top: 62, width: 44, height: 44, borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.97)', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#E5E7EB', zIndex: 20, elevation: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4,
    },
    toggleBtnText: { fontSize: 20 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
    title: { color: '#111827', fontSize: 14, fontWeight: '700', flex: 1, minWidth: 0 },
    closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB', flexShrink: 0 },
    closeBtnText: { fontSize: 18, lineHeight: 20, fontWeight: '700', color: '#334155' },
    input: { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#111827', marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
    list: { maxHeight: 360 },
    item: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, paddingHorizontal: 6, borderRadius: 10, gap: 10 },
    itemActive: { backgroundColor: '#DBEAFE' },
    badge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
    info: { flex: 1, minWidth: 0 },
    name: { color: '#111827', fontSize: 13, fontWeight: '600', lineHeight: 17 },
    dir: { color: '#6B7280', fontSize: 11, marginTop: 1, lineHeight: 15 },
    empty: { color: '#9CA3AF', fontSize: 13, textAlign: 'center', paddingVertical: 16 },
});
