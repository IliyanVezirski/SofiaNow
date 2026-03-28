import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Vehicle } from '../../../types/vehicles';
import { getVehicleAccentColor, getVehicleIconName } from '../../../services/transitUtils';
import { Ionicons } from '@expo/vector-icons';

interface Props {
    vehicle: Vehicle;
}

export const VehicleMarkerContent: React.FC<Props> = React.memo(({ vehicle }) => {
    const accentColor = getVehicleAccentColor(vehicle.type);
    return (
        <View style={styles.container}>
            <Text style={[styles.lineText, { color: accentColor }]}>{vehicle.line}</Text>
            <View style={styles.wrap}>
                <View style={[styles.accentPlate, { backgroundColor: accentColor }]} />
                <Ionicons name={getVehicleIconName(vehicle.type) as any} size={28} color={accentColor} />
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    container: { alignItems: 'center', justifyContent: 'center' },
    lineText: {
        marginBottom: 2, fontSize: 15, fontWeight: '900',
        textShadowColor: 'rgba(255,255,255,0.96)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 1,
    },
    wrap: { alignItems: 'center', justifyContent: 'center', width: 56, height: 56 },
    accentPlate: { position: 'absolute', width: 30, height: 30, borderRadius: 9, opacity: 0.22 },
});
