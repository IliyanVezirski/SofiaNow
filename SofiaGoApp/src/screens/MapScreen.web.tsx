import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import L from 'leaflet';
import * as Location from 'expo-location';
import { MapContainer, Popup, TileLayer, CircleMarker, Marker, useMap } from 'react-leaflet';
import { fetchStopEtas, fetchVehiclesNearby, StopEta, Vehicle } from '../services/cgmApi';
import { fetchStopsNearby, Stop, summarizeStopDirections } from '../services/stopsApi';
import 'leaflet/dist/leaflet.css';
import { VehicleType, formatUnixTime, getVehicleAccentColor, getVehicleIcon, getVehicleTypeLabel, haversineDistanceMeters, VEHICLE_TYPE_ORDER } from '../services/transitUtils';

type LatLngTuple = [number, number];

const VEHICLE_REFRESH_MS = 3000;
const STOP_ETA_REFRESH_MS = 15000;

const WebMapContainer = MapContainer as any;
const WebTileLayer = TileLayer as any;
const WebCircleMarker = CircleMarker as any;
const WebPopup = Popup as any;
const WebMarker = Marker as any;

function RecenterMap({ center }: { center: LatLngTuple }) {
    const map = useMap();

    useEffect(() => {
        map.setView(center, map.getZoom(), { animate: true });
    }, [center, map]);

    return null;
}

const createVehicleMarkerIcon = (vehicle: Vehicle) => L.divIcon({
    className: 'sofiago-vehicle-marker',
    html: `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <div style="font-size:12px;line-height:12px;color:#111827;text-shadow:0 0 4px rgba(255,255,255,0.95);transform:rotate(${vehicle.headingDegrees || 0}deg);">▲</div>
            <div style="width:30px;height:30px;border-radius:15px;border:2px solid ${getVehicleAccentColor(vehicle.type)};background:rgba(255,255,255,0.92);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(17,24,39,0.18);font-size:18px;line-height:18px;">
                ${getVehicleIcon(vehicle.type)}
            </div>
            <div style="margin-top:2px;min-width:24px;border-radius:999px;padding:2px 6px;background:${getVehicleAccentColor(vehicle.type)};color:#fff;font-size:10px;font-weight:700;line-height:12px;text-align:center;box-shadow:0 2px 8px rgba(17,24,39,0.18);">${vehicle.line}</div>
        </div>
    `,
    iconSize: [34, 42],
    iconAnchor: [17, 21],
});

const createStopMarkerIcon = (stop: Stop) => L.divIcon({
    className: 'sofiago-stop-marker',
    html: `
        <div title="${stop.name} | ${summarizeStopDirections(stop, 1).replace('Посока: ', '')}" style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:9px;border:2px solid #2563EB;background:#FFFFFF;box-shadow:0 2px 6px rgba(37,99,235,0.3);color:#2563EB;font-size:9px;font-weight:800;line-height:9px;">
            S
        </div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
});

export default function MapScreen() {
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [stops, setStops] = useState<Stop[]>([]);
    const [reportModalVisible, setReportModalVisible] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [selectedVehicleType, setSelectedVehicleType] = useState<'all' | VehicleType>('all');
    const [selectedLine, setSelectedLine] = useState('all');
    const [etasByStopId, setEtasByStopId] = useState<Record<string, StopEta[]>>({});
    const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
    const vehiclesByType = useMemo(() => {
        if (selectedVehicleType === 'all') {
            return vehicles;
        }

        return vehicles.filter((vehicle) => vehicle.type === selectedVehicleType);
    }, [selectedVehicleType, vehicles]);
    const availableLines = useMemo(() => {
        return Array.from(new Set(vehiclesByType.map((vehicle) => vehicle.line)))
            .sort((left, right) => left.localeCompare(right, 'bg', { numeric: true }));
    }, [vehiclesByType]);
    const filteredVehicles = useMemo(() => {
        if (selectedLine === 'all') {
            return vehiclesByType;
        }

        return vehiclesByType.filter((vehicle) => vehicle.line === selectedLine);
    }, [selectedLine, vehiclesByType]);
    const stopNameById = useMemo(() => {
        return stops.reduce<Record<string, string>>((result, stop) => {
            result[stop.id] = stop.name;
            return result;
        }, {});
    }, [stops]);

    useEffect(() => {
        if (selectedLine !== 'all' && !availableLines.includes(selectedLine)) {
            setSelectedLine('all');
        }
    }, [availableLines, selectedLine]);

    useEffect(() => {
        let isMounted = true;
        let vehicleRefreshTimer: ReturnType<typeof setInterval> | null = null;
        let stopEtaRefreshTimer: ReturnType<typeof setInterval> | null = null;

        const refreshVehicles = async (latitude: number, longitude: number) => {
            try {
                const nearbyVehicles = await fetchVehiclesNearby(latitude, longitude);
                if (!isMounted) {
                    return;
                }
                setVehicles(nearbyVehicles);
                setLastUpdated(new Date());
            } catch (apiErr) {
                console.error('Vehicle refresh failed:', apiErr);
            }
        };

        const refreshStopEtas = async (nearbyStops: Stop[]) => {
            try {
                const nextEtasByStopId = await fetchStopEtas(nearbyStops.map((stop) => stop.id));
                if (!isMounted) {
                    return;
                }
                setEtasByStopId(nextEtasByStopId);
            } catch (apiErr) {
                console.error('Stop ETA refresh failed:', apiErr);
            }
        };

        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    setErrorMsg('Permission to access location was denied');
                    return;
                }

                const loc = await Location.getCurrentPositionAsync({});
                setLocation(loc);

                try {
                    const nearbyStops = await fetchStopsNearby(loc.coords.latitude, loc.coords.longitude);
                    if (isMounted) {
                        setStops(nearbyStops);
                    }

                    await refreshVehicles(loc.coords.latitude, loc.coords.longitude);
                    await refreshStopEtas(nearbyStops);

                    vehicleRefreshTimer = setInterval(() => {
                        void refreshVehicles(loc.coords.latitude, loc.coords.longitude);
                    }, VEHICLE_REFRESH_MS);

                    stopEtaRefreshTimer = setInterval(() => {
                        void refreshStopEtas(nearbyStops);
                    }, STOP_ETA_REFRESH_MS);
                } catch (apiErr) {
                    console.error('API fetch failed:', apiErr);
                }
            } catch (err) {
                console.error('MapScreen initialization failed:', err);
                setErrorMsg('Failed to initialize map');
            }
        })();

        return () => {
            isMounted = false;
            if (vehicleRefreshTimer) {
                clearInterval(vehicleRefreshTimer);
            }
            if (stopEtaRefreshTimer) {
                clearInterval(stopEtaRefreshTimer);
            }
        };
    }, []);

    const center: LatLngTuple = useMemo(() => {
        if (location && stops.length > 0) {
            const firstStop = stops[0];
            const distanceToFirstStop = haversineDistanceMeters(
                location.coords.latitude,
                location.coords.longitude,
                firstStop.latitude,
                firstStop.longitude
            );

            if (distanceToFirstStop <= 7000) {
                return [location.coords.latitude, location.coords.longitude];
            }

            return [firstStop.latitude, firstStop.longitude];
        }

        if (stops.length > 0) {
            return [stops[0].latitude, stops[0].longitude];
        }

        if (location) {
            return [location.coords.latitude, location.coords.longitude];
        }

        return [42.6977, 23.3219];
    }, [location, stops]);

    const renderStopEtaSummary = (stopId: string, textStyle: any = styles.popupSecondary) => {
        const stopEtas = etasByStopId[stopId] || [];
        if (!stopEtas.length) {
            return <Text style={textStyle}>Няма налични ETA в момента</Text>;
        }

        return stopEtas.slice(0, 3).map((eta) => (
            <Text key={`${eta.tripId}-${eta.stopId}-${eta.arrivalTimestamp}`} style={textStyle}>
                {`${getVehicleIcon(eta.type)} ${eta.line} • ${eta.minutesAway} мин • ${formatUnixTime(eta.arrivalTimestamp)}`}
            </Text>
        ));
    };

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
                <WebMapContainer center={center} zoom={13} style={styles.webMap}>
                    <RecenterMap center={center} />
                    <WebTileLayer
                        attribution='&copy; OpenStreetMap contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {location && (
                        <WebCircleMarker
                            center={[location.coords.latitude, location.coords.longitude]}
                            radius={10}
                            pathOptions={{ color: '#007AFF', fillColor: '#007AFF' }}
                        >
                            <WebPopup>Вашата локация</WebPopup>
                        </WebCircleMarker>
                    )}

                    {stops.map((stop) => (
                        <WebMarker
                            key={stop.id}
                            position={[stop.latitude, stop.longitude]}
                            icon={createStopMarkerIcon(stop)}
                            eventHandlers={{ click: () => setSelectedStop(stop) }}
                        />
                    ))}

                    {filteredVehicles.map((vehicle) => (
                        <WebMarker
                            key={vehicle.id}
                            position={[vehicle.latitude, vehicle.longitude]}
                            icon={createVehicleMarkerIcon(vehicle)}
                        >
                            <WebPopup>
                                <View style={styles.popupCard}>
                                    <Text style={styles.popupTitle}>{`${getVehicleIcon(vehicle.type)} Линия ${vehicle.line}`}</Text>
                                    <Text style={styles.popupSecondary}>{`Vehicle ID: ${vehicle.id}`}</Text>
                                    <Text style={styles.popupSecondary}>{`Последен update: ${formatUnixTime(vehicle.lastUpdatedUnix)}`}</Text>
                                    <Text style={styles.popupSecondary}>{`Скорост: ${vehicle.speedKph ? Math.round(vehicle.speedKph) : 0} км/ч`}</Text>
                                    <Text style={styles.popupSecondary}>{`Спирка: ${vehicle.stopId ? (stopNameById[vehicle.stopId] || vehicle.stopId) : 'н/д'}`}</Text>
                                </View>
                            </WebPopup>
                        </WebMarker>
                    ))}
                </WebMapContainer>

                <View style={styles.filtersPanel}>
                    <Text style={styles.filterTitle}>1. Филтър по вид</Text>
                    <View style={styles.chipRow}>
                        <TouchableOpacity
                            style={[styles.filterChip, selectedVehicleType === 'all' && styles.filterChipActive]}
                            onPress={() => setSelectedVehicleType('all')}
                        >
                            <Text style={[styles.filterChipText, selectedVehicleType === 'all' && styles.filterChipTextActive]}>Всички</Text>
                        </TouchableOpacity>
                        {VEHICLE_TYPE_ORDER.map((vehicleType) => (
                            <TouchableOpacity
                                key={vehicleType}
                                style={[styles.filterChip, selectedVehicleType === vehicleType && styles.filterChipActive]}
                                onPress={() => setSelectedVehicleType(vehicleType)}
                            >
                                <Text style={[styles.filterChipText, selectedVehicleType === vehicleType && styles.filterChipTextActive]}>
                                    {getVehicleIcon(vehicleType)} {getVehicleTypeLabel(vehicleType)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <Text style={[styles.filterTitle, styles.secondaryFilterTitle]}>2. Филтър по линия</Text>
                    <ScrollView style={styles.linesScroll} showsVerticalScrollIndicator={false}>
                        <View style={styles.chipRow}>
                            <TouchableOpacity
                                style={[styles.filterChip, selectedLine === 'all' && styles.filterChipActive]}
                                onPress={() => setSelectedLine('all')}
                            >
                                <Text style={[styles.filterChipText, selectedLine === 'all' && styles.filterChipTextActive]}>Всички</Text>
                            </TouchableOpacity>
                            {availableLines.map((line) => (
                                <TouchableOpacity
                                    key={line}
                                    style={[styles.filterChip, selectedLine === line && styles.filterChipActive]}
                                    onPress={() => setSelectedLine(line)}
                                >
                                    <Text style={[styles.filterChipText, selectedLine === line && styles.filterChipTextActive]}>{line}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>
                    <Text style={styles.filterHint}>{`Показани превозни средства: ${filteredVehicles.length}/${vehicles.length}`}</Text>
                    <Text style={styles.filterHint}>{`Видими спирки: ${stops.length}`}</Text>
                    <View style={styles.nearbyStopsList}>
                        {stops.slice(0, 6).map((stop) => (
                            <TouchableOpacity
                                key={stop.id}
                                style={styles.nearbyStopButton}
                                onPress={() => setSelectedStop(stop)}
                            >
                                <Text style={styles.nearbyStopButtonText} numberOfLines={1}>{stop.name}</Text>
                                <Text style={styles.nearbyStopDirectionText} numberOfLines={2}>{summarizeStopDirections(stop, 1)}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

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

                {selectedStop && (
                    <View style={styles.stopSchedulePanel}>
                        <View style={styles.stopScheduleHeader}>
                            <View style={styles.stopScheduleTitleWrap}>
                                <Text style={styles.stopScheduleTitle}>{selectedStop.name}</Text>
                                <Text style={styles.stopScheduleMeta}>{`Спирка: ${selectedStop.id}`}</Text>
                                <Text style={styles.stopScheduleMeta}>{summarizeStopDirections(selectedStop, 2)}</Text>
                                <Text style={styles.stopScheduleMeta}>{`Линии: ${selectedStop.lines.slice(0, 10).join(', ') || 'н/д'}`}</Text>
                            </View>
                            <Pressable onPress={() => setSelectedStop(null)} style={styles.stopScheduleClose}>
                                <Text style={styles.stopScheduleCloseText}>Затвори</Text>
                            </Pressable>
                        </View>
                        <ScrollView style={styles.stopScheduleList} showsVerticalScrollIndicator={false}>
                            {renderStopEtaSummary(selectedStop.id, styles.stopScheduleEta)}
                        </ScrollView>
                    </View>
                )}

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
        backgroundColor: 'tomato',
    },
    webMap: {
        height: '100%',
        width: '100%',
    },
    filtersPanel: {
        position: 'absolute',
        top: 20,
        left: 16,
        width: 248,
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: 14,
        padding: 12,
        zIndex: 1000,
        elevation: 20,
    },
    filterTitle: {
        color: '#264653',
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 8,
    },
    secondaryFilterTitle: {
        marginTop: 10,
    },
    filterHint: {
        marginTop: 8,
        color: '#4B5563',
        fontSize: 12,
        fontWeight: '600',
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginRight: -6,
        marginBottom: -6,
    },
    linesScroll: {
        marginTop: 2,
        maxHeight: 112,
    },
    filterChip: {
        backgroundColor: '#EEF2FF',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderWidth: 1,
        borderColor: '#C7D2FE',
        marginRight: 6,
        marginBottom: 6,
    },
    filterChipActive: {
        backgroundColor: '#1D4ED8',
        borderColor: '#1D4ED8',
    },
    filterChipText: {
        color: '#1E3A8A',
        fontSize: 12,
        fontWeight: '700',
    },
    filterChipTextActive: {
        color: '#FFFFFF',
    },
    nearbyStopsList: {
        marginTop: 10,
        gap: 6,
    },
    nearbyStopButton: {
        backgroundColor: '#DBEAFE',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    nearbyStopButtonText: {
        color: '#1D4ED8',
        fontSize: 12,
        fontWeight: '600',
    },
    nearbyStopDirectionText: {
        marginTop: 3,
        color: '#4B5563',
        fontSize: 11,
        lineHeight: 14,
    },
    topRightControls: {
        position: 'absolute',
        top: 60,
        right: 20,
        alignItems: 'center',
        gap: 15,
        zIndex: 1000,
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
        zIndex: 1000,
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
    },
    popupCard: {
        minWidth: 220,
        gap: 4,
    },
    popupTitle: {
        color: '#111827',
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 2,
    },
    popupSecondary: {
        color: '#374151',
        fontSize: 12,
        marginBottom: 2,
    },
    stopSchedulePanel: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 110,
        backgroundColor: 'rgba(255,255,255,0.97)',
        borderRadius: 18,
        padding: 14,
        zIndex: 1200,
        elevation: 25,
    },
    stopScheduleHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 10,
    },
    stopScheduleTitleWrap: {
        flex: 1,
    },
    stopScheduleTitle: {
        color: '#111827',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 4,
    },
    stopScheduleMeta: {
        color: '#4B5563',
        fontSize: 12,
        marginBottom: 2,
    },
    stopScheduleClose: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: '#E5E7EB',
    },
    stopScheduleCloseText: {
        color: '#111827',
        fontSize: 12,
        fontWeight: '600',
    },
    stopScheduleList: {
        maxHeight: 160,
    },
    stopScheduleEta: {
        color: '#1F2937',
        fontSize: 13,
        marginBottom: 8,
    },
});