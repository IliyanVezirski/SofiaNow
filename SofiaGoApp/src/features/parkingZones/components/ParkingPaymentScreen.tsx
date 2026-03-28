import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ParkingCar } from '../../../services/parkingCars';
import {
    cancelScheduledParkingSms,
    loadScheduledParkingSmsEntries,
    openParkingSmsExactAlarmSettings,
    PARKING_SMS_OPTIONS,
    removeScheduledParkingSmsEntry,
    saveScheduledParkingSmsEntry,
    scheduleParkingSmsAutomatically,
    sendParkingSmsAutomatically,
    type ParkingSmsZoneId,
    type ScheduledParkingSmsEntry,
} from '../../../services/parkingSms';

const formatTimeForInput = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const normalizeTimeInput = (value: string) => value.replace(/[^\d:]/g, '').slice(0, 5);
const isValidTimeInput = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || '').trim());

const getDefaultScheduledTimeInput = () => {
    const date = new Date(Date.now() + 60 * 60 * 1000);
    date.setSeconds(0, 0);
    return formatTimeForInput(date);
};

const buildScheduledDate = (value: string) => {
    const trimmed = String(value || '').trim();
    if (!isValidTimeInput(trimmed)) {
        return null;
    }

    const [hours, minutes] = trimmed.split(':').map((segment) => Number(segment));
    const candidate = new Date();
    candidate.setSeconds(0, 0);
    candidate.setHours(hours, minutes, 0, 0);

    if (candidate.getTime() <= Date.now()) {
        candidate.setDate(candidate.getDate() + 1);
    }

    return candidate;
};

const formatScheduledMoment = (date: Date) => {
    const timeLabel = formatTimeForInput(date);
    const today = new Date();
    const isToday = date.getDate() === today.getDate()
        && date.getMonth() === today.getMonth()
        && date.getFullYear() === today.getFullYear();

    return isToday ? `днес в ${timeLabel}` : `утре в ${timeLabel}`;
};

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
    const [scheduleExpanded, setScheduleExpanded] = useState(false);
    const [scheduledTimeInput, setScheduledTimeInput] = useState(() => getDefaultScheduledTimeInput());
    const [scheduling, setScheduling] = useState(false);
    const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
    const [scheduledEntries, setScheduledEntries] = useState<ScheduledParkingSmsEntry[]>([]);
    const [scheduledEntriesLoading, setScheduledEntriesLoading] = useState(true);

    const defaultCarId = useMemo(() => cars.find((car) => car.isDefault)?.id || cars[0]?.id || null, [cars]);
    const selectedCar = useMemo(() => cars.find((car) => car.id === selectedCarId) || null, [cars, selectedCarId]);
    const selectedZone = useMemo(() => PARKING_SMS_OPTIONS.find((option) => option.id === selectedZoneId) || PARKING_SMS_OPTIONS[0], [selectedZoneId]);
    const selectedCarLabel = useMemo(() => {
        if (!selectedCar) {
            return 'избери кола';
        }

        return selectedCar.name ? `${selectedCar.name} • ${selectedCar.displayPlate}` : selectedCar.displayPlate;
    }, [selectedCar]);
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

    useEffect(() => {
        let isActive = true;

        const loadEntries = async () => {
            setScheduledEntriesLoading(true);
            try {
                const entries = await loadScheduledParkingSmsEntries();
                if (isActive) {
                    setScheduledEntries(entries);
                }
            } finally {
                if (isActive) {
                    setScheduledEntriesLoading(false);
                }
            }
        };

        void loadEntries();

        return () => {
            isActive = false;
        };
    }, []);

    const handleSendSms = async () => {
        if (!selectedCar) {
            return;
        }

        setSending(true);
        try {
            await sendParkingSmsAutomatically(selectedZoneId, selectedCar.plate);
            Alert.alert('SMS е изпратен', `Изпратихме SMS за ${selectedCar.name || selectedCar.displayPlate}.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Не успяхме да изпратим SMS.';
            Alert.alert('Неуспешно изпращане', message);
        } finally {
            setSending(false);
        }
    };

    const handleConfirmSendSms = () => {
        if (!selectedCar || sending) {
            return;
        }

        Alert.alert(
            'Потвърди SMS',
            `Ще изпратим SMS до ${selectedZone.shortCode} за ${selectedCar.name || selectedCar.displayPlate}. Текстът ще бъде ${selectedCar.plate}.`,
            [
                { text: 'Отказ', style: 'cancel' },
                {
                    text: 'Продължи',
                    onPress: () => {
                        void handleSendSms();
                    },
                },
            ],
        );
    };

    const handleScheduleSms = async () => {
        if (!selectedCar || scheduling) {
            return;
        }

        const scheduledDate = buildScheduledDate(scheduledTimeInput);
        if (!scheduledDate) {
            Alert.alert('Невалиден час', 'Въведи час във формат ЧЧ:ММ, например 18:30.');
            return;
        }

        setScheduling(true);
        try {
            const previousEditingId = editingScheduleId;
            const result = await scheduleParkingSmsAutomatically(selectedZoneId, selectedCar.plate, scheduledDate.getTime());
            const scheduleLabel = formatScheduledMoment(scheduledDate);
            const scheduledEntry: ScheduledParkingSmsEntry = {
                id: result.id,
                zoneId: selectedZoneId,
                plate: selectedCar.plate,
                displayPlate: selectedCar.displayPlate,
                carId: selectedCar.id,
                carLabel: selectedCar.name || selectedCar.displayPlate,
                triggerAtMillis: scheduledDate.getTime(),
                createdAt: Date.now(),
                exactAlarmGranted: result.exactAlarmGranted,
            };

            let nextEntries = await saveScheduledParkingSmsEntry(scheduledEntry);
            let previousScheduleCancelled = true;

            if (previousEditingId && previousEditingId !== result.id) {
                try {
                    await cancelScheduledParkingSms(previousEditingId);
                    nextEntries = await removeScheduledParkingSmsEntry(previousEditingId);
                } catch (cancelError) {
                    previousScheduleCancelled = false;
                    console.warn('Failed to cancel previous scheduled parking SMS:', cancelError);
                }
            }

            setScheduledEntries(nextEntries);
            setScheduleExpanded(false);
            setEditingScheduleId(null);
            setScheduledTimeInput(getDefaultScheduledTimeInput());

            const successTitle = previousEditingId ? 'Планирането е обновено' : 'SMS е планиран';
            const baseMessage = previousEditingId
                ? `Обновеният SMS ще бъде изпратен ${scheduleLabel}.`
                : `Ще изпратим SMS ${scheduleLabel}.`;
            const settingsMessage = !result.exactAlarmGranted
                ? ' За максимална точност разреши точни аларми.'
                : '';
            const cancellationWarning = !previousScheduleCancelled
                ? ' Старото планиране не беше отменено автоматично, затова го провери в списъка и при нужда го отмени ръчно.'
                : '';

            if (!result.exactAlarmGranted) {
                Alert.alert(
                    successTitle,
                    `${baseMessage}${settingsMessage}${cancellationWarning}`,
                    [
                        { text: 'По-късно', style: 'cancel' },
                        {
                            text: 'Настройки',
                            onPress: () => {
                                void openParkingSmsExactAlarmSettings();
                            },
                        },
                    ],
                );
                return;
            }

            Alert.alert(successTitle, `${baseMessage}${cancellationWarning}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Не успяхме да планираме изпращането.';
            Alert.alert('Неуспешно планиране', message);
        } finally {
            setScheduling(false);
        }
    };

    const startEditingScheduledEntry = (entry: ScheduledParkingSmsEntry) => {
        const matchingCar = cars.find((car) => car.id === entry.carId) || cars.find((car) => car.plate === entry.plate) || null;

        setEditingScheduleId(entry.id);
        setHasManualZoneSelection(true);
        setSelectedZoneId(entry.zoneId);
        setSelectedCarId(matchingCar?.id || null);
        setScheduledTimeInput(formatTimeForInput(new Date(entry.triggerAtMillis)));
        setScheduleExpanded(true);

        if (!matchingCar) {
            Alert.alert(
                'Избери кола',
                'Тази планирана заявка е за кола, която вече не е сред Моите коли. Избери кола и запази промените или отмени планирането.',
            );
        }
    };

    const handleCancelScheduledEntry = async (entry: ScheduledParkingSmsEntry) => {
        if (scheduling) {
            return;
        }

        setScheduling(true);
        let nativeCancelFailed = false;
        try {
            await cancelScheduledParkingSms(entry.id);
        } catch (error) {
            nativeCancelFailed = true;
            console.warn('Native cancel failed for scheduled SMS:', error);
        }

        try {
            const nextEntries = await removeScheduledParkingSmsEntry(entry.id);
            setScheduledEntries(nextEntries);

            if (editingScheduleId === entry.id) {
                setEditingScheduleId(null);
                setScheduledTimeInput(getDefaultScheduledTimeInput());
            }

            if (nativeCancelFailed) {
                Alert.alert(
                    'Планирането е премахнато',
                    `Заявката за ${entry.carLabel} е премахната от списъка, но системната аларма може да не е отменена. Ако получиш SMS, игнорирай го.`,
                );
            } else {
                Alert.alert('Планирането е отменено', `Няма да изпращаме SMS за ${entry.carLabel}.`);
            }
        } catch (storageError) {
            const message = storageError instanceof Error ? storageError.message : 'Не успяхме да премахнем планирания SMS.';
            Alert.alert('Грешка', message);
        } finally {
            setScheduling(false);
        }
    };

    const handlePressScheduledEntry = (entry: ScheduledParkingSmsEntry) => {
        startEditingScheduledEntry(entry);
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

                {scheduledEntries.length > 0 ? (
                    <View style={styles.summaryCard}>
                        <Text style={styles.summaryLabel}>Резюме</Text>
                        <Text style={styles.summaryValue}>{`${selectedZone.label} • ${selectedZone.shortCode}`}</Text>
                        <Text style={styles.summaryMeta}>{`${selectedCarLabel}`}</Text>
                    </View>
                ) : null}

                {(!scheduledEntriesLoading && scheduledEntries.length > 0) ? (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Планирани SMS-и</Text>
                        <View style={styles.scheduledEntriesWrap}>
                            {scheduledEntries.map((entry) => {
                                const zone = PARKING_SMS_OPTIONS.find((option) => option.id === entry.zoneId) || PARKING_SMS_OPTIONS[0];
                                const isEditing = editingScheduleId === entry.id;

                                return (
                                    <TouchableOpacity
                                        key={entry.id}
                                        style={[styles.scheduledEntryCard, isEditing && styles.scheduledEntryCardActive]}
                                        activeOpacity={0.88}
                                        onPress={() => handlePressScheduledEntry(entry)}
                                    >
                                        <View style={styles.scheduledEntryHeader}>
                                            <Text style={styles.scheduledEntryZone}>{zone.label}</Text>
                                            <View style={styles.scheduledEntryHeaderActions}>
                                                {isEditing ? <Text style={styles.scheduledEntryBadge}>Редактираш</Text> : null}
                                                <TouchableOpacity
                                                    style={styles.scheduledEntryCancelButton}
                                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                    onPress={() => void handleCancelScheduledEntry(entry)}
                                                >
                                                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                        <Text style={styles.scheduledEntryTitle}>{entry.carLabel}</Text>
                                        <Text style={styles.scheduledEntryMeta}>{`${entry.displayPlate} • ${formatScheduledMoment(new Date(entry.triggerAtMillis))}`}</Text>
                                        {!entry.exactAlarmGranted ? (
                                            <Text style={styles.scheduledEntryWarning}>Точните аларми не са разрешени и изпращането може да се забави.</Text>
                                        ) : null}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                </View>
                ) : null}

                <View style={styles.section}>
                    <TouchableOpacity
                        style={styles.scheduleToggleButton}
                        activeOpacity={0.88}
                        onPress={() => {
                            setScheduleExpanded((current) => {
                                if (current) {
                                    setEditingScheduleId(null);
                                }

                                return !current;
                            });
                        }}
                    >
                        <View style={styles.scheduleToggleBody}>
                            <Text style={styles.scheduleToggleTitle}>
                                {editingScheduleId ? 'Редактирай планиран SMS' : 'Изпрати по-късно'}
                            </Text>
                            <Text style={styles.scheduleToggleText}>
                                {editingScheduleId
                                    ? 'Промени часа, колата или зоната и запази.'
                                    : scheduleExpanded
                                        ? 'Задай час за автоматично изпращане.'
                                        : `Планиран час: ${scheduledTimeInput}`}
                            </Text>
                        </View>
                        <Ionicons name={scheduleExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#1D4ED8" />
                    </TouchableOpacity>

                    {scheduleExpanded ? (
                        <View style={styles.schedulePanel}>
                            {editingScheduleId ? (
                                <View style={styles.scheduleEditBanner}>
                                    <View style={styles.scheduleEditBannerBody}>
                                        <Text style={styles.scheduleEditTitle}>Редакция на планиран SMS</Text>
                                        <Text style={styles.scheduleEditText}>Промени часа, колата или зоната и после запази.</Text>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.scheduleEditResetButton}
                                        activeOpacity={0.88}
                                        onPress={() => setEditingScheduleId(null)}
                                    >
                                        <Text style={styles.scheduleEditResetText}>Ново</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : null}
                            <Text style={styles.scheduleInputLabel}>Час</Text>
                            <TextInput
                                style={styles.scheduleTimeInput}
                                value={scheduledTimeInput}
                                onChangeText={(value) => setScheduledTimeInput(normalizeTimeInput(value))}
                                placeholder="18:30"
                                placeholderTextColor="#94A3B8"
                                keyboardType="numbers-and-punctuation"
                                maxLength={5}
                            />
                            <Text style={styles.scheduleHint}>Ако часът е минал за днес, ще изпратим SMS утре.</Text>
                            <TouchableOpacity
                                style={[styles.secondaryActionButton, (!selectedCar || scheduling) && styles.secondaryActionButtonDisabled]}
                                disabled={!selectedCar || scheduling}
                                activeOpacity={0.88}
                                onPress={() => void handleScheduleSms()}
                            >
                                <Ionicons name="alarm-outline" size={18} color="#1D4ED8" />
                                <Text style={styles.secondaryActionText}>{scheduling ? 'Планира...' : (editingScheduleId ? 'Запази промените' : 'Планирай изпращане')}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}
                </View>

                <TouchableOpacity
                    style={[styles.primaryButton, (!selectedCar || sending) && styles.primaryButtonDisabled]}
                    disabled={!selectedCar || sending}
                    activeOpacity={0.88}
                    onPress={handleConfirmSendSms}
                >
                    <Ionicons name="chatbox-ellipses-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>{sending ? 'Изпраща SMS...' : 'Изпрати SMS'}</Text>
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
    summaryCard: {
        marginTop: 4,
        borderRadius: 16,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 14,
    },
    summaryLabel: {
        fontSize: 11,
        color: '#64748B',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    summaryValue: {
        marginTop: 4,
        fontSize: 15,
        color: '#0F172A',
        fontWeight: '900',
    },
    summaryMeta: {
        marginTop: 4,
        fontSize: 12,
        color: '#475569',
        fontWeight: '600',
    },
    scheduledInfoCard: {
        borderRadius: 14,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.82)',
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    scheduledInfoTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#0F172A',
    },
    scheduledInfoText: {
        marginTop: 4,
        color: '#64748B',
        fontSize: 12,
        lineHeight: 18,
        fontWeight: '600',
    },
    scheduledEntriesWrap: {
        gap: 8,
    },
    scheduledEntryCard: {
        borderRadius: 14,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.82)',
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    scheduledEntryCardActive: {
        borderColor: '#1D4ED8',
        backgroundColor: 'rgba(239,246,255,0.72)',
    },
    scheduledEntryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    scheduledEntryHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    scheduledEntryCancelButton: {
        padding: 2,
    },
    scheduledEntryZone: {
        fontSize: 12,
        fontWeight: '800',
        color: '#1D4ED8',
        flex: 1,
    },
    scheduledEntryBadge: {
        fontSize: 11,
        fontWeight: '800',
        color: '#1D4ED8',
    },
    scheduledEntryTitle: {
        marginTop: 6,
        fontSize: 14,
        fontWeight: '800',
        color: '#0F172A',
    },
    scheduledEntryMeta: {
        marginTop: 4,
        fontSize: 12,
        color: '#475569',
        fontWeight: '600',
    },
    scheduledEntryHint: {
        marginTop: 6,
        fontSize: 11,
        color: '#64748B',
        fontWeight: '700',
    },
    scheduledEntryWarning: {
        marginTop: 6,
        fontSize: 11,
        lineHeight: 16,
        color: '#B45309',
        fontWeight: '700',
    },
    scheduleToggleButton: {
        borderRadius: 14,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(191,219,254,0.72)',
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    scheduleToggleBody: {
        flex: 1,
    },
    scheduleToggleTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#0F172A',
    },
    scheduleToggleText: {
        marginTop: 4,
        color: '#475569',
        fontSize: 12,
        lineHeight: 18,
        fontWeight: '600',
    },
    schedulePanel: {
        marginTop: 10,
        borderRadius: 14,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 14,
    },
    scheduleEditBanner: {
        marginBottom: 12,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(191,219,254,0.72)',
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    scheduleEditBannerBody: {
        flex: 1,
    },
    scheduleEditTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: '#0F172A',
    },
    scheduleEditText: {
        marginTop: 4,
        fontSize: 11,
        lineHeight: 16,
        color: '#64748B',
        fontWeight: '600',
    },
    scheduleEditResetButton: {
        minWidth: 56,
        height: 34,
        borderRadius: 10,
        backgroundColor: 'rgba(239,246,255,0.82)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
    },
    scheduleEditResetText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#1D4ED8',
    },
    scheduleInputLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#334155',
    },
    scheduleTimeInput: {
        marginTop: 8,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(203,213,225,0.9)',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 12,
        fontSize: 15,
        color: '#0F172A',
        fontWeight: '700',
    },
    scheduleHint: {
        marginTop: 8,
        color: '#64748B',
        fontSize: 12,
        lineHeight: 18,
        fontWeight: '600',
    },
    secondaryActionButton: {
        marginTop: 10,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(239,246,255,0.82)',
        borderWidth: 1,
        borderColor: 'rgba(191,219,254,0.72)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    secondaryActionButtonDisabled: {
        opacity: 0.6,
    },
    secondaryActionText: {
        color: '#1D4ED8',
        fontSize: 13,
        fontWeight: '800',
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