import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
    visible: boolean;
    hasData: boolean;
    featureCount: number;
    blueCount: number;
    greenCount: number;
    userZoneLabel: string | null;
    droppedPinZoneLabel: string | null;
    guidance: string;
    topOffset?: number;
}

export const ParkingZoneStatusCard: React.FC<Props> = ({
    visible,
    hasData,
    featureCount,
    blueCount,
    greenCount,
    userZoneLabel,
    droppedPinZoneLabel,
    guidance,
    topOffset = 160,
}) => {
    if (!visible) return null;

    return (
        <View style={[styles.card, { top: topOffset }]}>
            <Text style={styles.title}>Паркинг зони</Text>
            {hasData ? (
                <>
                    <Text style={styles.bodyText}>{`Заредени полигони: ${featureCount}`}</Text>
                    <Text style={styles.bodyText}>{`Сини: ${blueCount} | Зелени: ${greenCount}`}</Text>
                    <Text style={styles.bodyText}>{`Моята позиция: ${userZoneLabel ?? 'извън зона'}`}</Text>
                    {droppedPinZoneLabel ? (
                        <Text style={styles.bodyText}>{`Пин: ${droppedPinZoneLabel}`}</Text>
                    ) : null}
                </>
            ) : (
                <Text style={styles.emptyText}>{guidance}</Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        position: 'absolute',
        right: 16,
        maxWidth: 220,
        backgroundColor: 'rgba(255,255,255,0.94)',
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.88)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
        elevation: 8,
        zIndex: 12,
    },
    title: {
        color: '#0F172A',
        fontSize: 13,
        fontWeight: '800',
        marginBottom: 6,
    },
    bodyText: {
        color: '#334155',
        fontSize: 12,
        fontWeight: '600',
        lineHeight: 18,
    },
    emptyText: {
        color: '#475569',
        fontSize: 12,
        lineHeight: 18,
    },
});
