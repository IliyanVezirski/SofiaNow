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

    const reminderSummary = useMemo(() => {
        if (!activeReminder) return null;
        const remindAt = new Date(activeReminder.remindAtTimestamp * 1000);
        return `${activeReminder.line}${activeReminder.destination ? ` • ${activeReminder.destination}` : ''} • ${String(remindAt.getHours()).padStart(2, '0')}:${String(remindAt.getMinutes()).padStart(2, '0')}`;
    }, [activeReminder]);

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
                    <View style={styles.activeSummaryWrap}>
                        <View style={styles.activeBadge}>
                            <Ionicons name="notifications" size={12} color="#B45309" />
                            <Text style={styles.activeBadgeText}>{`${activeReminder.minutesBefore} мин преди`}</Text>
                        </View>
                        <Text style={styles.summaryText} numberOfLines={2}>{reminderSummary}</Text>
                    </View>
                ) : null}
            </View>

            <Modal transparent animationType="fade" visible={menuVisible} onRequestClose={() => setMenuVisible(false)}>
                <View style={styles.modalRoot}>
                    <Pressable style={styles.backdrop} onPress={() => setMenuVisible(false)} />
                    <View style={styles.menuCard}>
                        <View style={styles.menuHeader}>
                            <Text style={styles.menuTitle}>{`Напомняне за линия ${eta.line}`}</Text>
                            <TouchableOpacity onPress={() => setMenuVisible(false)} style={styles.closeButton}>
                                <Ionicons name="close" size={18} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.menuSubtitle}>{activeReminder ? 'Изберете ново време или махнете текущото напомняне.' : 'Изберете колко минути по-рано да ви напомни.'}</Text>
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
                        {activeReminder ? (
                            <View style={styles.currentReminderCard}>
                                <Ionicons name="time-outline" size={14} color="#B45309" />
                                <Text style={styles.currentReminderText}>{reminderSummary}</Text>
                            </View>
                        ) : null}
                        <View style={styles.followUpRow}>
                            <View style={styles.followUpTextWrap}>
                                <Text style={styles.followUpTitle}>Втори път при голямо закъснение</Text>
                                <Text style={styles.followUpSubtitle}>Ще изпрати още едно напомняне, ако линията изостава осезаемо от разписанието.</Text>
                            </View>
                            <Switch
                                value={delayFollowUpEnabled}
                                onValueChange={setDelayFollowUpEnabled}
                                trackColor={{ false: '#D1D5DB', true: '#86EFAC' }}
                                thumbColor={delayFollowUpEnabled ? '#16A34A' : '#F9FAFB'}
                            />
                        </View>
                        <TouchableOpacity
                            style={[styles.button, !canSchedule && styles.buttonDisabled]}
                            onPress={onSchedule}
                            disabled={!canSchedule || submitting}
                        >
                            <Text style={styles.buttonText}>{submitting ? 'Запазване...' : `Запази за ${minutesBefore} мин`}</Text>
                        </TouchableOpacity>
                        {activeReminder ? (
                            <TouchableOpacity style={styles.removeButton} onPress={onRemove} disabled={submitting}>
                                <Text style={styles.removeButtonText}>Премахни напомнянето</Text>
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
    activeSummaryWrap: {
        marginTop: 6,
        alignItems: 'flex-end',
        maxWidth: 180,
    },
    activeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#FEF3C7',
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginBottom: 4,
    },
    activeBadgeText: {
        color: '#92400E',
        fontSize: 11,
        fontWeight: '700',
    },
    summaryText: {
        fontSize: 11,
        color: '#475569',
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
        backgroundColor: 'rgba(255,255,255,0.82)',
        borderRadius: 24,
        padding: 18,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 28,
        elevation: 20,
    },
    menuHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    menuTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0F172A',
    },
    closeButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(226,232,240,0.72)',
    },
    menuSubtitle: {
        fontSize: 12,
        color: '#64748B',
        marginBottom: 10,
    },
    optionsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 8,
    },
    optionChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        backgroundColor: 'rgba(248,250,252,0.72)',
    },
    optionChipActive: {
        backgroundColor: '#1D4ED8',
        borderColor: '#1D4ED8',
    },
    optionText: {
        fontSize: 12,
        color: '#475569',
        fontWeight: '600',
    },
    optionTextActive: {
        color: '#FFFFFF',
    },
    currentReminderCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(248,250,252,0.72)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 10,
    },
    currentReminderText: {
        flex: 1,
        color: '#475569',
        fontSize: 12,
        fontWeight: '600',
    },
    followUpRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    followUpTextWrap: {
        flex: 1,
    },
    followUpTitle: {
        color: '#0F172A',
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 2,
    },
    followUpSubtitle: {
        color: '#64748B',
        fontSize: 11,
        lineHeight: 15,
    },
    button: {
        backgroundColor: '#1D4ED8',
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: 'center',
    },
    buttonDisabled: {
        backgroundColor: '#93C5FD',
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    removeButton: {
        marginTop: 8,
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(254,226,226,0.72)',
    },
    removeButtonText: {
        color: '#B91C1C',
        fontSize: 12,
        fontWeight: '700',
    },
});