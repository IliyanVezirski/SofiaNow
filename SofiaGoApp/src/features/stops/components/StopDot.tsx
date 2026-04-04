import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Stop } from '../../../services/stopsApi';
import { VehicleType } from '../../../services/transitUtils';

type Props = {
    markerKinds?: Array<VehicleType | 'night'>;
    stop: Stop;
    selected: boolean;
};

type StopMarkerKind = VehicleType | 'night';

const STOP_TYPE_PRIORITY: StopMarkerKind[] = ['subway', 'tram', 'trolley', 'bus', 'night'];

const STOP_TYPE_COLORS: Record<StopMarkerKind, {
    backgroundColor: string;
    borderColor: string;
    haloBorderColor: string;
    haloBackgroundColor: string;
    labelColor: string;
}> = {
    bus: {
        backgroundColor: '#DC2626',
        borderColor: 'rgba(255,255,255,0.95)',
        haloBorderColor: 'rgba(220,38,38,0.4)',
        haloBackgroundColor: 'rgba(220,38,38,0.14)',
        labelColor: '#FFFFFF',
    },
    trolley: {
        backgroundColor: '#2563EB',
        borderColor: 'rgba(255,255,255,0.95)',
        haloBorderColor: 'rgba(37,99,235,0.36)',
        haloBackgroundColor: 'rgba(37,99,235,0.12)',
        labelColor: '#FFFFFF',
    },
    tram: {
        backgroundColor: '#EA580C',
        borderColor: 'rgba(255,255,255,0.95)',
        haloBorderColor: 'rgba(234,88,12,0.4)',
        haloBackgroundColor: 'rgba(234,88,12,0.14)',
        labelColor: '#FFFFFF',
    },
    subway: {
        backgroundColor: '#FFFFFF',
        borderColor: '#0056A4',
        haloBorderColor: 'rgba(0,86,164,0.28)',
        haloBackgroundColor: 'rgba(0,86,164,0.08)',
        labelColor: '#0056A4',
    },
    night: {
        backgroundColor: '#111827',
        borderColor: 'rgba(255,255,255,0.95)',
        haloBorderColor: 'rgba(17,24,39,0.32)',
        haloBackgroundColor: 'rgba(17,24,39,0.12)',
        labelColor: '#FFFFFF',
    },
};

export function StopDot({ markerKinds, stop, selected }: Props) {
    const types = useMemo((): StopMarkerKind[] => {
        if (markerKinds && markerKinds.length > 0) {
            return Array.from(new Set(markerKinds)).sort(
                (left, right) => STOP_TYPE_PRIORITY.indexOf(left) - STOP_TYPE_PRIORITY.indexOf(right),
            );
        }

        if (stop.vehicleTypes && stop.vehicleTypes.length > 0) {
            const typesSet = new Set(stop.vehicleTypes);
            const sorted = Array.from(typesSet);
            sorted.sort((left, right) => STOP_TYPE_PRIORITY.indexOf(left) - STOP_TYPE_PRIORITY.indexOf(right));
            return sorted;
        }

        return ['bus'];
    }, [markerKinds, stop.vehicleTypes]);

    const resolvedTypes = types.length > 0 ? types : ['bus'];
    const hasSubway = resolvedTypes.includes('subway');
    const primaryType = resolvedTypes[0];
    const colors = STOP_TYPE_COLORS[primaryType];
    const segmentTypes = resolvedTypes.slice(0, 4);
    const segmentCount = segmentTypes.length;
    const showSubwayLabel = segmentCount === 1 && primaryType === 'subway';

    return (
        <View style={[
            styles.stopDotBase,
            { backgroundColor: colors.backgroundColor, borderColor: hasSubway ? STOP_TYPE_COLORS.subway.borderColor : colors.borderColor },
            selected && styles.stopDotBaseSelected,
        ]}>
            <View style={styles.segmentClip}>
                {segmentTypes.map((type, index) => (
                    <View
                        key={`${type}-${index}`}
                        style={[
                            styles.segment,
                            {
                                backgroundColor: STOP_TYPE_COLORS[type].backgroundColor,
                                left: `${(index * 100) / segmentCount}%`,
                                width: `${100 / segmentCount}%`,
                            },
                        ]}
                    />
                ))}
            </View>
            {selected ? (
                <View style={[
                    styles.selectionHalo,
                    {
                        borderColor: colors.haloBorderColor,
                        backgroundColor: colors.haloBackgroundColor,
                    },
                ]} />
            ) : null}
            {segmentCount > 1 ? (
                <View pointerEvents="none" style={styles.segmentDividerRow}>
                    {segmentTypes.slice(1).map((type, index) => (
                        <View
                            key={`${type}-divider-${index}`}
                            style={[
                                styles.segmentDivider,
                                { left: `${((index + 1) * 100) / segmentCount}%` },
                            ]}
                        />
                    ))}
                </View>
            ) : null}
            {showSubwayLabel ? (
                <Text style={[styles.subwayLabel, { color: colors.labelColor }]}>M</Text>
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
        overflow: 'visible',
        elevation: 2,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
    },
    stopDotBaseSelected: {
        transform: [{ scale: 1.15 }],
        shadowOpacity: 0.18,
        shadowRadius: 4,
        zIndex: 10,
    },
    segmentClip: {
        position: 'absolute',
        width: 14,
        height: 14,
        borderRadius: 7,
        overflow: 'hidden',
    },
    segment: {
        position: 'absolute',
        top: 0,
        bottom: 0,
    },
    segmentDividerRow: {
        position: 'absolute',
        width: 14,
        height: 14,
    },
    segmentDivider: {
        position: 'absolute',
        top: 1,
        bottom: 1,
        width: 1,
        marginLeft: -0.5,
        backgroundColor: 'rgba(255,255,255,0.92)',
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
    subwayLabel: {
        width: 10,
        fontWeight: '800',
        fontSize: 9,
        lineHeight: 11,
    },
});
