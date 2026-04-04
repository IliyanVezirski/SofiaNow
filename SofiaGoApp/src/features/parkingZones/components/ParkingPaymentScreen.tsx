import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ParkingCar } from '../../../services/parkingCars';
import {
    openParkingSms,
    PARKING_SMS_OPTIONS,
    type ParkingSmsZoneId,
} from '../../../services/parking';

interface Props {
    cars: ParkingCar[];
    defaultZoneId?: ParkingSmsZoneId | null;
    onClose: () => void;
    onOpenManageCars: () => void;
}

export const ParkingPaymentScreen: React.FC<Props> = ({
    cars,
    defaultZoneId = null,
    onClose,
    onOpenManageCars,
}) => {
    const [selectedZoneId, setSelectedZoneId] = useState<ParkingSmsZoneId>(defaultZoneId ?? 'blue');
    const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
    const [hasManualZoneSelection, setHasManualZoneSelection] = useState(false);
    const [sending, setSending] = useState(false);

    const defaultCarId = useMemo(() => cars.find((car) => car.isDefault)?.id || cars[0]?.id || null, [cars]);
    const selectedCar = useMemo(() => cars.find((car) => car.id === selectedCarId) || null, [cars, selectedCarId]);
    const selectedZone = useMemo(() => PARKING_SMS_OPTIONS.find((option) => option.id === selectedZoneId) || PARKING_SMS_OPTIONS[0], [selectedZoneId]);
    const detectedZone = useMemo(() => {
        if (!defaultZoneId) {
            return null;
        }

        return PARKING_SMS_OPTIONS.find((option) => option.id === defaultZoneId) || null;
    }, [defaultZoneId]);

    useEffect(() => {
        setSelectedCarId((currentId) => {
            if (currentId && cars.some((car) => car.id === currentId)) {
                return currentId;
            }

            return defaultCarId;
        });
    }, [cars, defaultCarId]);

    useEffect(() => {
        if (hasManualZoneSelection) {
            return;
        }

        setSelectedZoneId(defaultZoneId ?? 'blue');
    }, [defaultZoneId, hasManualZoneSelection]);

    const handleOpenSms = async () => {
        if (!selectedCar || sending) {
            return;
        }

        setSending(true);
        try {
            await openParkingSms(selectedZoneId, selectedCar.plate);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Не успяхме да отворим SMS приложението.';
            Alert.alert('Грешка', message);
        } finally {
            setSending(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Плати с SMS</Text>
            
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <Ionicons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {detectedZone ? (
                    <View style={styles.statusCard}>
                        <Text style={styles.statusLabel}>Зона по подразбиране</Text>
                        <Text style={styles.statusValue}>{detectedZone.label}</Text>
                        <Text style={styles.statusHint}>Засечена е по текущата ти локация.</Text>
                    </View>
                ) : null}

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Зона</Text>
                    <View style={styles.zoneCardsWrap}>
                        {PARKING_SMS_OPTIONS.map((option) => {
                            const isActive = option.id === selectedZoneId;
                            return (
                                <TouchableOpacity
                                    key={option.id}
                                    style={[
                                        styles.zoneCard,
                                        isActive && { borderColor: option.accentColor, backgroundColor: `${option.accentColor}12` },
                                    ]}
                                    activeOpacity={0.88}
                                    onPress={() => {
                                        setHasManualZoneSelection(true);
                                        setSelectedZoneId(option.id);
                                    }}
                                >
                                    <Text style={[styles.zoneTitle, isActive && { color: option.accentColor }]}>{option.label}</Text>
                                    <Text style={styles.zonePrice}>{option.hourlyPriceLabel}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Моите коли</Text>
                        <TouchableOpacity style={styles.manageCarsButton} onPress={onOpenManageCars}>
                            <Ionicons name="car-outline" size={14} color="#1D4ED8" />
                            <Text style={styles.manageCarsText}>Моите коли</Text>
                        </TouchableOpacity>
                    </View>

                    {cars.length === 0 ? (
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyTitle}>Нямаш запазена кола</Text>
                            <TouchableOpacity style={styles.emptyAction} onPress={onOpenManageCars}>
                                <Text style={styles.emptyActionText}>Добави кола</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.carsWrap}>
                            {cars.map((car) => {
                                const isSelected = car.id === selectedCarId;
                                return (
                                    <TouchableOpacity
                                        key={car.id}
                                        style={[styles.carCard, isSelected && styles.carCardActive]}
                                        activeOpacity={0.88}
                                        onPress={() => setSelectedCarId(car.id)}
                                    >
                                        <View>
                                            <Text style={car.name ? styles.carNameTitle : styles.carTitle}>{car.name || car.displayPlate}</Text>
                                            <Text style={styles.carSubtitle}>{car.name ? `${car.displayPlate} • ${car.isDefault ? 'Основна кола' : 'Запазена кола'}` : (car.isDefault ? 'Основна кола' : 'Запазена кола')}</Text>
                                        </View>
                                        <Ionicons name={isSelected ? 'radio-button-on' : 'radio-button-off'} size={20} color={isSelected ? '#1D4ED8' : '#94A3B8'} />
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </View>

                <TouchableOpacity
                    style={[styles.primaryButton, (!selectedCar || sending) && styles.primaryButtonDisabled]}
                    disabled={!selectedCar || sending}
                    activeOpacity={0.88}
                    onPress={() => void handleOpenSms()}
                >
                    <Ionicons name="chatbox-ellipses-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>{sending ? 'Отваря...' : 'Изпрати SMS'}</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 18,
        paddingHorizontal: 18,
        paddingBottom: 18,
    },
    header: {
        marginBottom: 16,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 8,
    },
    statusCard: {
        marginBottom: 14,
        borderRadius: 14,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    statusLabel: {
        fontSize: 11,
        color: '#64748B',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    statusValue: {
        marginTop: 4,
        fontSize: 16,
        fontWeight: '900',
        color: '#0F172A',
    },
    statusHint: {
        marginTop: 4,
        fontSize: 12,
        lineHeight: 18,
        color: '#64748B',
        fontWeight: '600',
    },
    title: {
        fontSize: 17,
        fontWeight: '800',
        color: '#0F172A',
    },
    subtitle: {
        marginTop: 4,
        marginRight: 44,
        fontSize: 12,
        lineHeight: 18,
        color: '#64748B',
        fontWeight: '600',
    },
    closeButton: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    section: {
        marginBottom: 14,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 8,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 8,
    },
    manageCarsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    manageCarsText: {
        color: '#1D4ED8',
        fontSize: 12,
        fontWeight: '700',
    },
    zoneCardsWrap: {
        flexDirection: 'row',
        gap: 8,
    },
    zoneCard: {
        flex: 1,
        borderRadius: 14,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.82)',
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    zoneTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#0F172A',
    },
    zonePrice: {
        marginTop: 4,
        fontSize: 12,
        fontWeight: '700',
        color: '#0F172A',
    },
    emptyCard: {
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.82)',
        padding: 14,
    },
    emptyTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#0F172A',
    },
    emptyText: {
        marginTop: 6,
        fontSize: 12,
        lineHeight: 18,
        color: '#64748B',
        fontWeight: '600',
    },
    emptyAction: {
        marginTop: 12,
        height: 40,
        borderRadius: 10,
        backgroundColor: 'rgba(239,246,255,0.82)',
        borderWidth: 1,
        borderColor: 'rgba(191,219,254,0.72)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyActionText: {
        color: '#1D4ED8',
        fontSize: 12,
        fontWeight: '800',
    },
    carsWrap: {
        gap: 8,
    },
    carCard: {
        borderRadius: 14,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.82)',
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    carCardActive: {
        borderColor: '#1D4ED8',
        backgroundColor: 'rgba(239,246,255,0.78)',
    },
    carTitle: {
        fontSize: 15,
        fontWeight: '900',
        color: '#0F172A',
        letterSpacing: 0.8,
    },
    carNameTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#0F172A',
    },
    carSubtitle: {
        marginTop: 3,
        fontSize: 11,
        color: '#64748B',
        fontWeight: '600',
    },
    primaryButton: {
        marginTop: 14,
        height: 46,
        borderRadius: 12,
        backgroundColor: '#1D4ED8',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    primaryButtonDisabled: {
        backgroundColor: '#93C5FD',
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '800',
    },
});
