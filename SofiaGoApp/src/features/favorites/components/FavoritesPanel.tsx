import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { FavoritePlace } from '../../../services/places';

interface Props {
    visible: boolean;
    places: FavoritePlace[];
    onSelect: (place: FavoritePlace) => void;
    onRemove: (id: string) => void;
    onClose: () => void;
}

export const FavoritesPanel: React.FC<Props> = ({ visible, places, onSelect, onRemove, onClose }) => {
    if (!visible) return null;
    return (
        <View style={styles.panel}>
            <View style={styles.header}>
                <Text style={styles.title}>Любими места</Text>
                <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                    <Text style={styles.closeBtnText}>{'\u00D7'}</Text>
                </TouchableOpacity>
            </View>
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                {!places.length && <Text style={styles.empty}>Няма запазени места. Задръж на картата или запази от търсачката.</Text>}
                {places.map((fav) => (
                    <View key={fav.id} style={styles.row}>
                        <TouchableOpacity style={styles.rowMain} onPress={() => onSelect(fav)}>
                            <Text style={styles.rowName} numberOfLines={1}>{fav.name}</Text>
                            <Text style={styles.rowCoords} numberOfLines={1}>{`${fav.latitude.toFixed(5)}, ${fav.longitude.toFixed(5)}`}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.removeBtn} onPress={() => onRemove(fav.id)}>
                            <Text style={styles.removeBtnText}>{'\u00D7'}</Text>
                        </TouchableOpacity>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    panel: {
        position: 'absolute', right: 70, top: 128, width: 280, maxHeight: 320,
        backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB',
        padding: 10, zIndex: 30, elevation: 30,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    title: { color: '#111827', fontSize: 14, fontWeight: '700' },
    closeBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
    closeBtnText: { color: '#374151', fontSize: 13, fontWeight: '700' },
    list: { maxHeight: 262 },
    empty: { color: '#6B7280', fontSize: 12, lineHeight: 16, paddingVertical: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, backgroundColor: '#F9FAFB', borderRadius: 10, padding: 8 },
    rowMain: { flex: 1 },
    rowName: { color: '#111827', fontSize: 12, fontWeight: '700' },
    rowCoords: { color: '#6B7280', fontSize: 11, marginTop: 2 },
    removeBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEE2E2' },
    removeBtnText: { color: '#B91C1C', fontSize: 13, fontWeight: '700' },
});
