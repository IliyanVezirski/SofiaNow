import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Stop } from '../../../services/stopsApi';
import { VehicleType, resolveDisplayLineType } from '../../../services/transitUtils';

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

    const hasSubway = types.includes('subway');

    return (
        <View style={[
            styles.stopDotBase,
            hasSubway ? styles.subwayStopDotBase : styles.standardStopDotBase,
            selected && styles.stopDotBaseSelected,
            selected && (hasSubway ? styles.subwayStopDotBaseSelected : styles.standardStopDotBaseSelected),
        ]}>
            {selected ? (
                <View style={[
                    styles.selectionHalo,
                    hasSubway ? styles.subwaySelectionHalo : styles.standardSelectionHalo,
                ]} />
            ) : null}
            {hasSubway ? (
                <Text style={styles.subwayLabel}>M</Text>
            ) : null}
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
        width: 16,
        height: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        elevation: 2,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
    },
    standardStopDotBase: {
        backgroundColor: '#A7CFB3',
        borderColor: 'rgba(255,255,255,0.95)',
    },
    subwayStopDotBase: {
        backgroundColor: '#FFFFFF',
        borderColor: '#0056A4',
    },
    stopDotBaseSelected: {
        transform: [{ scale: 1.15 }],
        shadowOpacity: 0.18,
        shadowRadius: 4,
        zIndex: 10,
    },
    standardStopDotBaseSelected: {
        backgroundColor: '#A7CFB3',
        borderColor: '#FFFFFF',
    },
    subwayStopDotBaseSelected: {
        backgroundColor: '#FFFFFF',
        borderColor: '#0056A4',
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
        borderWidth: 0.5,
        borderColor: 'rgba(226,232,240,0.72)',
    },
    stopLabelText: {
        color: '#0F172A',
        fontSize: 10,
        fontWeight: '700',
        textAlign: 'center',
    },
    selectionHalo: {
        position: 'absolute',
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1.5,
    },
    standardSelectionHalo: {
        borderColor: 'rgba(93, 154, 114, 0.4)',
        backgroundColor: 'rgba(167, 207, 179, 0.14)',
    },
    subwaySelectionHalo: {
        borderColor: 'rgba(0, 86, 164, 0.28)',
        backgroundColor: 'rgba(0, 86, 164, 0.08)',
    },
    subwayLabel: {
        width: 10,
        color: '#0056A4',
        fontWeight: '800',
        fontSize: 9,
        lineHeight: 11,
    },
});
