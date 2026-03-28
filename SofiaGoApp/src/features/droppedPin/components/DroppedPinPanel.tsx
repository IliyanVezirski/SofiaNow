import React from 'react';
import { View, Text, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
    pin: { latitude: number; longitude: number };
    onClose: () => void;
    onSaveFavorite?: () => void;
    onBuildRoute?: () => void;
    onEditLocation?: () => void;
    primaryActionLabel?: string;
}

export const DroppedPinPanel: React.FC<Props> = ({ pin, onClose, onSaveFavorite, onBuildRoute, onEditLocation, primaryActionLabel }) => (
    <View style={styles.panel}>
        <View style={styles.header}>
            <Text style={styles.title}>{`${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`}</Text>
            <Pressable style={styles.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={14} color="#334155" />
            </Pressable>
        </View>
        <View style={styles.actions}>
            {onEditLocation && (
                <TouchableOpacity style={styles.actionBtn} onPress={onEditLocation}>
                    <Ionicons name="search-outline" size={14} color="#1D4ED8" />
                    <Text style={styles.actionBtnText}>Коригирай</Text>
                </TouchableOpacity>
            )}
            {onSaveFavorite ? (
                <TouchableOpacity style={styles.actionBtn} onPress={onSaveFavorite}>
                    <Ionicons name="star-outline" size={14} color="#1D4ED8" />
                    <Text style={styles.actionBtnText}>Запази</Text>
                </TouchableOpacity>
            ) : null}
            {onBuildRoute && (
                <TouchableOpacity style={[styles.actionBtn, styles.actionBtnRoute]} onPress={onBuildRoute}>
                    <Ionicons name="navigate-outline" size={14} color="#FFFFFF" />
                    <Text style={[styles.actionBtnText, styles.actionBtnTextRoute]}>{primaryActionLabel ?? 'Маршрут'}</Text>
                </TouchableOpacity>
            )}
        </View>
    </View>
);

const styles = StyleSheet.create({
    panel: {
        position: 'absolute', bottom: 188, left: 12, right: 12,
        backgroundColor: '#FFFFFF', borderRadius: 22, padding: 14, zIndex: 25, elevation: 25,
        shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 24,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(248,250,252,0.72)', alignItems: 'center', justifyContent: 'center' },
    actions: { flexDirection: 'row', gap: 6, marginTop: 10 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, backgroundColor: 'rgba(239,246,255,0.82)', borderWidth: 1, borderColor: 'rgba(191,219,254,0.72)' },
    actionBtnText: { color: '#1D4ED8', fontSize: 12, fontWeight: '700' },
    actionBtnRoute: { backgroundColor: '#1D4ED8', borderColor: '#1D4ED8' },
    actionBtnTextRoute: { color: '#FFFFFF' },
});
