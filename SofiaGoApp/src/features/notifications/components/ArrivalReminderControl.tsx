import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StopEta } from '../../../types/vehicles';
import {
    cancelTransitArrivalReminder,
    DEFAULT_REMINDER_MINUTES,
    getTransitArrivalReminder,
    REMINDER_MINUTE_OPTIONS,
    scheduleTransitArrivalReminder,
    StoredTransitArrivalReminder,
    subscribeToTransitArrivalReminderChanges,
} from '../../../services/notifications/transitArrivalNotifications';

interface Props {
    stopName: string;
    eta: StopEta;
    compact?: boolean;
}

export const ArrivalReminderControl: React.FC<Props> = ({ stopName, eta, compact = false }) => {
    const [minutesBefore, setMinutesBefore] = useState<number>(DEFAULT_REMINDER_MINUTES);
    const [submitting, setSubmitting] = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);
    const [activeReminder, setActiveReminder] = useState<StoredTransitArrivalReminder | null>(null);
    const [delayFollowUpEnabled, setDelayFollowUpEnabled] = useState(false);

    const canSchedule = useMemo(() => eta.minutesAway > 0, [eta.minutesAway]);

    useEffect(() => {
        let cancelled = false;

        const loadReminder = async () => {
            const reminder = await getTransitArrivalReminder(eta);
            if (cancelled) return;
            setActiveReminder(reminder);
            if (reminder) setMinutesBefore(reminder.minutesBefore);
            setDelayFollowUpEnabled(!!reminder?.delayFollowUpEnabled);
        };

        void loadReminder();
        const unsubscribe = subscribeToTransitArrivalReminderChanges(() => {
            void loadReminder();
        });
        return () => { cancelled = true; unsubscribe(); };
    }, [eta.arrivalTimestamp, eta.stopId, eta.tripId]);

    const onSchedule = async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const result = await scheduleTransitArrivalReminder({ stopName, eta, minutesBefore, delayFollowUpEnabled });
            if (result.ok) {
                const reminder = await getTransitArrivalReminder(eta);
                setActiveReminder(reminder);
                setMenuVisible(false);
            }
            Alert.alert(result.ok ? 'Напомняне създадено' : 'Неуспешно напомняне', result.message);
        } catch {
            Alert.alert('Грешка', 'Неуспешно създаване на напомняне. Опитайте отново.');
        } finally {
            setSubmitting(false);
        }
    };

    const onRemove = async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const result = await cancelTransitArrivalReminder(eta);
            if (result.ok) {
                setActiveReminder(null);
                setMenuVisible(false);
            }
            Alert.alert(result.ok ? 'Напомнянето е махнато' : 'Няма какво да се маха', result.message);
        } catch {
            Alert.alert('Грешка', 'Неуспешно премахване на напомнянето. Опитайте отново.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <View style={[styles.container, compact && styles.containerCompact]}>
                <TouchableOpacity
                    style={[
                        styles.bellButton,
                        activeReminder && styles.bellButtonActive,
                        !canSchedule && styles.bellButtonDisabled,
                        compact && styles.bellButtonCompact,
                    ]}
                    onPress={() => setMenuVisible(true)}
                    disabled={!canSchedule && !activeReminder}
                >
                    <Ionicons
                        name={activeReminder ? 'notifications' : 'notifications-outline'}
                        size={compact ? 15 : 17}
                        color={activeReminder ? '#A16207' : '#64748B'}
                    />
                </TouchableOpacity>
                {activeReminder && !compact ? (
                    <Text style={styles.activeHint}>{`${activeReminder.minutesBefore} мин`}</Text>
                ) : null}
            </View>

            <Modal transparent animationType="fade" visible={menuVisible} onRequestClose={() => setMenuVisible(false)}>
                <View style={styles.modalRoot}>
                    <Pressable style={styles.backdrop} onPress={() => setMenuVisible(false)} />
                    <View style={styles.menuCard}>
                        <View style={styles.menuHeader}>
                            <Text style={styles.menuTitle}>{`Линия ${eta.line}`}</Text>
                            <TouchableOpacity onPress={() => setMenuVisible(false)} style={styles.closeButton}>
                                <Ionicons name="close" size={18} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.menuSubtitle}>Напомни преди пристигане</Text>
                        <View style={styles.optionsRow}>
                            {REMINDER_MINUTE_OPTIONS.map((option) => (
                                <TouchableOpacity
                                    key={option}
                                    style={[styles.optionChip, minutesBefore === option && styles.optionChipActive]}
                                    onPress={() => setMinutesBefore(option)}
                                >
                                    <Text style={[styles.optionText, minutesBefore === option && styles.optionTextActive]}>{`${option} мин`}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={styles.followUpRow}>
                            <Text style={styles.followUpTitle}>При закъснение — повторно</Text>
                            <Switch
                                value={delayFollowUpEnabled}
                                onValueChange={setDelayFollowUpEnabled}
                                trackColor={{ false: '#E2E8F0', true: '#93C5FD' }}
                                thumbColor={delayFollowUpEnabled ? '#1D4ED8' : '#F8FAFC'}
                            />
                        </View>
                        <TouchableOpacity
                            style={[styles.button, !canSchedule && styles.buttonDisabled]}
                            onPress={onSchedule}
                            disabled={!canSchedule || submitting}
                        >
                            <Text style={styles.buttonText}>{submitting ? 'Запазване...' : 'Запази'}</Text>
                        </TouchableOpacity>
                        {activeReminder ? (
                            <TouchableOpacity style={styles.removeButton} onPress={onRemove} disabled={submitting}>
                                <Text style={styles.removeButtonText}>Премахни</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </View>
            </Modal>
        </>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'flex-end',
        minWidth: 40,
    },
    containerCompact: {
        minWidth: 34,
    },
    bellButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(248,250,252,0.64)',
        borderWidth: 1,
        borderColor: 'rgba(203,213,225,0.7)',
    },
    bellButtonCompact: {
        width: 26,
        height: 26,
        borderRadius: 13,
    },
    bellButtonActive: {
        backgroundColor: 'rgba(245,158,11,0.14)',
        borderColor: 'rgba(245,158,11,0.28)',
    },
    bellButtonDisabled: {
        opacity: 0.5,
    },
    activeHint: {
        marginTop: 3,
        fontSize: 10,
        color: '#92400E',
        fontWeight: '600',
        textAlign: 'right',
    },
    modalRoot: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15,23,42,0.18)',
    },
    menuCard: {
        marginHorizontal: 16,
        marginBottom: 110,
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderRadius: 20,
        padding: 18,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 12,
    },
    menuHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    menuTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0F172A',
    },
    closeButton: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuSubtitle: {
        fontSize: 12,
        color: '#94A3B8',
        marginBottom: 12,
    },
    optionsRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 14,
    },
    optionChip: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 10,
        backgroundColor: 'rgba(241,245,249,0.8)',
    },
    optionChipActive: {
        backgroundColor: '#1D4ED8',
    },
    optionText: {
        fontSize: 13,
        color: '#475569',
        fontWeight: '600',
    },
    optionTextActive: {
        color: '#FFFFFF',
    },
    followUpRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    followUpTitle: {
        color: '#64748B',
        fontSize: 12,
        fontWeight: '600',
    },
    button: {
        backgroundColor: '#1D4ED8',
        borderRadius: 12,
        paddingVertical: 11,
        alignItems: 'center',
    },
    buttonDisabled: {
        backgroundColor: '#93C5FD',
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    removeButton: {
        marginTop: 8,
        alignItems: 'center',
        paddingVertical: 10,
    },
    removeButtonText: {
        color: '#94A3B8',
        fontSize: 12,
        fontWeight: '600',
    },
});