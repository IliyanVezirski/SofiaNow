import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Stop } from '../../../services/stopsApi';
import { VehicleType, resolveDisplayLineType } from '../../../services/transitUtils';
import { getStopTypeInfo } from '../../map/utils/mapScreen';

type Props = {
    stop: Stop;
    selected: boolean;
};

export function StopDot({ stop, selected }: Props) {
    const types = useMemo(() => {
        if (stop.vehicleTypes && stop.vehicleTypes.length > 0) {
            const typesSet = new Set(stop.vehicleTypes);
            const sorted = Array.from(typesSet);
            sorted.sort();
            return sorted;
        }

        const typeSet = new Set<VehicleType>();
        stop.lines.forEach((line) => {
            typeSet.add(resolveDisplayLineType(line));
        });

        const sorted = Array.from(typeSet);
        sorted.sort();
        return sorted;
    }, [stop.lines, stop.vehicleTypes]);

    if (types.length === 0) {
        return <View style={[styles.stopDot, selected && styles.stopDotSelected]} />;
    }

    const hasSubway = types.includes('subway');
    const primaryColor = hasSubway ? '#0056A4' : getStopTypeInfo(types[0]).color;

    if (types.length > 1 && !hasSubway) {
        const colors = types.map((type) => getStopTypeInfo(type).color);
        return (
            <View style={[styles.stopDotBase, selected && styles.stopDotBaseSelected]}>
                <View style={styles.multiTypeDot}>
                    {colors.map((color, index) => (
                        <View key={index} style={[styles.multiTypeDotSegment, { backgroundColor: color }]} />
                    ))}
                </View>
                {selected ? (
                    <View style={styles.stopLabelContainer}>
                        <Text style={styles.stopLabelText}>{stop.name}</Text>
                    </View>
                ) : null}
            </View>
        );
    }

    return (
        <View style={[styles.stopDotBase, selected && styles.stopDotBaseSelected]}>
            {hasSubway ? (
                <Text style={styles.subwayLabel}>M</Text>
            ) : (
                <View style={[styles.primaryTypeDot, { backgroundColor: primaryColor }]} />
            )}
            {selected ? (
                <View style={styles.stopLabelContainer}>
                    <Text style={styles.stopLabelText}>{stop.name}</Text>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    stopDotBase: {
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.9)',
        elevation: 2,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
    },
    stopDotBaseSelected: {
        backgroundColor: '#FFFFFF',
        transform: [{ scale: 1.35 }],
        shadowOpacity: 0.18,
        shadowRadius: 4,
        zIndex: 10,
    },
    stopDot: {
        backgroundColor: 'rgba(148,163,184,0.35)',
        borderRadius: 7,
        width: 14,
        height: 14,
    },
    stopDotSelected: {
        backgroundColor: '#1D4ED8',
        transform: [{ scale: 1.3 }],
    },
    stopLabelContainer: {
        position: 'absolute',
        bottom: 28,
        left: -60,
        width: 140,
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 4,
        alignItems: 'center',
        elevation: 5,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
    },
    stopLabelText: {
        color: '#0F172A',
        fontSize: 10,
        fontWeight: '700',
        textAlign: 'center',
    },
    multiTypeDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        overflow: 'hidden',
        flexDirection: 'row',
    },
    multiTypeDotSegment: {
        flex: 1,
    },
    subwayLabel: {
        color: '#0056A4',
        fontWeight: '800',
        fontSize: 9,
        lineHeight: 11,
    },
    primaryTypeDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
});
