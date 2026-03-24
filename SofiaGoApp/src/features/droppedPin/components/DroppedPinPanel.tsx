import React from 'react';
import { View, Text, Pressable, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
    pin: { latitude: number; longitude: number };
    onClose: () => void;
    onSaveFavorite?: () => void;
    onBuildRoute?: () => void;
}

export const DroppedPinPanel: React.FC<Props> = ({ pin, onClose, onSaveFavorite, onBuildRoute }) => (
    <View style={styles.panel}>
        <View style={styles.header}>
            <Text style={styles.title}>{`\uD83D\uDCCD ${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`}</Text>
            <Pressable style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeBtnText}>{'\u00D7'}</Text>
            </Pressable>
        </View>
        {onSaveFavorite ? (
            <TouchableOpacity style={styles.favBtn} onPress={onSaveFavorite}>
                <Text style={styles.favBtnText}>{'\u2B50'} Добави в любими</Text>
            </TouchableOpacity>
        ) : null}
        {onBuildRoute && (
            <TouchableOpacity style={styles.routeBtn} onPress={onBuildRoute}>
                <Text style={styles.routeBtnText}>{'\uD83E\uDDED'} Изгради маршрут</Text>
            </TouchableOpacity>
        )}
    </View>
);

const styles = StyleSheet.create({
    panel: {
        position: 'absolute', bottom: 188, left: 16, right: 16,
        backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, zIndex: 25, elevation: 25,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    title: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
    closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
    closeBtnText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
    favBtn: { marginTop: 8, backgroundColor: '#1D4ED8', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
    favBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    routeBtn: { marginTop: 8, backgroundColor: '#059669', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
    routeBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
