import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal, Pressable } from 'react-native';
import * as Location from 'expo-location';
import { fetchVehiclesNearby, Vehicle } from '../services/cgmApi';
import { fetchStopsNearby, Stop } from '../services/stopsApi';
import MapboxGL from '@maplibre/maplibre-react-native';

MapboxGL.setAccessToken(null);

export default function MapScreen() {
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [stops, setStops] = useState<Stop[]>([]);
    const [reportModalVisible, setReportModalVisible] = useState(false);

    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                let { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    setErrorMsg('Permission to access location was denied');
                    return;
                }

                let loc = await Location.getCurrentPositionAsync({});
                setLocation(loc);

                // Fetch nearby vehicles and stops
                try {
                    const nearbyVehicles = await fetchVehiclesNearby(loc.coords.latitude, loc.coords.longitude);
                    setVehicles(nearbyVehicles);

                    const nearbyStops = await fetchStopsNearby(loc.coords.latitude, loc.coords.longitude);
                    setStops(nearbyStops);
                } catch (apiErr) {
                    console.error('API fetch failed:', apiErr);
                }
            } catch (err) {
                console.error('MapScreen initialization failed:', err);
                setErrorMsg('Failed to initialize map');
            }
        })();
    }, []);

    if (errorMsg) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
        );
    }

    return (
        <View style={styles.page}>
            <View style={styles.container}>
                <View style={{ flex: 1, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' }}>
                    <Text>Проверка на интерфейса (Картата е временно скрита за дебъг)</Text>
                    <Text>Местоположение: {location ? `${location.coords.latitude}, ${location.coords.longitude}` : 'Търсене...'}</Text>
                    <Text>Превозни средства: {vehicles.length}</Text>
                    <Text>Спирки: {stops.length}</Text>
                </View>

                {/* Floating UI Overlay */}
                <View style={styles.topRightControls}>
                    <View style={styles.iconButton}>
                        <Text style={styles.iconText}>🛡️</Text>
                    </View>
                    <View style={styles.iconButton}>
                        <Text style={styles.iconText}>🚇</Text>
                    </View>
                </View>

                <View style={styles.bottomOverlay}>
                    <TouchableOpacity
                        style={styles.reportButton}
                        onPress={() => setReportModalVisible(true)}
                    >
                        <Text style={styles.reportText}>🚨 Сигнализирай</Text>
                    </TouchableOpacity>
                </View>

                {/* Report Modal */}
                <Modal
                    animationType="slide"
                    transparent={true}
                    visible={reportModalVisible}
                    onRequestClose={() => setReportModalVisible(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Какво искате да репортнете?</Text>

                            <View style={styles.reportOptions}>
                                <TouchableOpacity style={styles.option} onPress={() => setReportModalVisible(false)}>
                                    <View style={[styles.optionIcon, { backgroundColor: '#E63946' }]}>
                                        <Text style={styles.iconLarge}>👮</Text>
                                    </View>
                                    <Text style={styles.optionLabel}>Контрола</Text>
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.option} onPress={() => setReportModalVisible(false)}>
                                    <View style={[styles.optionIcon, { backgroundColor: '#F4A261' }]}>
                                        <Text style={styles.iconLarge}>👨‍👩‍👧‍👦</Text>
                                    </View>
                                    <Text style={styles.optionLabel}>Претъпкано</Text>
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.option} onPress={() => setReportModalVisible(false)}>
                                    <View style={[styles.optionIcon, { backgroundColor: '#2A9D8F' }]}>
                                        <Text style={styles.iconLarge}>⏳</Text>
                                    </View>
                                    <Text style={styles.optionLabel}>Закъснение</Text>
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.option} onPress={() => setReportModalVisible(false)}>
                                    <View style={[styles.optionIcon, { backgroundColor: '#264653' }]}>
                                        <Text style={styles.iconLarge}>⚠️</Text>
                                    </View>
                                    <Text style={styles.optionLabel}>Опасност</Text>
                                </TouchableOpacity>
                            </View>

                            <Pressable
                                style={styles.closeButton}
                                onPress={() => setReportModalVisible(false)}
                            >
                                <Text style={styles.closeText}>Затвори</Text>
                            </Pressable>
                        </View>
                    </View>
                </Modal>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    page: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        height: '100%',
        width: '100%',
        backgroundColor: '#tomato',
    },
    map: {
        flex: 1,
    },
    userDot: {
        width: 20,
        height: 20,
        backgroundColor: '#007AFF',
        borderRadius: 10,
        borderWidth: 3,
        borderColor: 'white',
    },
    vehicleDot: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: 'white',
        alignItems: 'center',
        justifyContent: 'center',
    },
    busColor: {
        backgroundColor: '#E63946', // Red
    },
    tramColor: {
        backgroundColor: '#F4A261', // Orange
    },
    trolleyColor: {
        backgroundColor: '#2A9D8F', // Teal
    },
    vehicleText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
    stopDot: {
        backgroundColor: 'white',
        borderWidth: 2,
        borderColor: '#007AFF',
        borderRadius: 15,
        width: 30,
        height: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stopIcon: {
        fontSize: 14,
    },
    topRightControls: {
        position: 'absolute',
        top: 60,
        right: 20,
        alignItems: 'center',
        gap: 15,
    },
    iconButton: {
        backgroundColor: 'white',
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 5,
        marginBottom: 10,
    },
    iconText: {
        fontSize: 20,
    },
    bottomOverlay: {
        position: 'absolute',
        bottom: 40,
        width: '100%',
        alignItems: 'center',
    },
    reportButton: {
        backgroundColor: '#E63946',
        paddingHorizontal: 25,
        paddingVertical: 15,
        borderRadius: 30,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 6,
    },
    reportText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: 'white',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        padding: 25,
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 20,
        color: '#264653',
    },
    reportOptions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 20,
    },
    option: {
        width: '45%',
        alignItems: 'center',
        marginBottom: 20,
    },
    optionIcon: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    iconLarge: {
        fontSize: 28,
    },
    optionLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#264653',
    },
    closeButton: {
        marginTop: 10,
        padding: 10,
    },
    closeText: {
        color: '#E63946',
        fontWeight: 'bold',
        fontSize: 16,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorText: {
        fontSize: 16,
        color: '#E63946',
        textAlign: 'center',
    }
});
