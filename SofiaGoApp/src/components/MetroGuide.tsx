import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface MetroStationProps {
    stationName: string;
    bestCarRef: 'first' | 'middle' | 'last';
    transferTo?: string;
}

export const MetroGuide: React.FC<MetroStationProps> = ({ stationName, bestCarRef, transferTo }) => {
    const getCarText = (ref: typeof bestCarRef) => {
        switch (ref) {
            case 'first': return 'Първи вагон';
            case 'middle': return 'Среден вагон';
            case 'last': return 'Последен вагон';
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.stationTitle}>Метростанция: {stationName}</Text>
            <Text style={styles.advice}>
                За бърз изход/трансфер, качете се в: <Text style={styles.bold}>{getCarText(bestCarRef)}</Text>
            </Text>
            {transferTo && (
                <Text style={styles.transfer}>Връзка с: {transferTo}</Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 16,
        backgroundColor: '#333',
        borderRadius: 8,
        marginVertical: 8,
    },
    stationTitle: {
        fontSize: 18,
        color: '#fff',
        fontWeight: 'bold',
    },
    advice: {
        fontSize: 14,
        color: '#ddd',
        marginTop: 4,
    },
    bold: {
        fontWeight: 'bold',
        color: '#4CAF50',
    },
    transfer: {
        marginTop: 8,
        fontSize: 14,
        color: '#FFC107',
    }
});
