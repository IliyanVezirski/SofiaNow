import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StopEta } from '../../../types/vehicles';
import {
    cancelTransitArrivalReminder,
    DEFAULT_REMINDER_MINUTES,
    getTransitArrivalReminder,
    scheduleTransitArrivalReminder,
    StoredTransitArrivalReminder,
    subscribeToTransitArrivalReminderChanges,
} from '../../../services/notifications/transitArrivalNotifications';

interface Props {
    stopName: string;
    eta: StopEta;
    compact?: boolean;
}

const normalizeReminderMinutesInput = (value: string) => String(value || '').replace(/\D/g, '').slice(0, 3);

const parseReminderMinutes = (value: string) => {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    if (!Number.isFinite(parsed)) {
        return null;
    }

    if (parsed < 1 || parsed > 120) {
        return null;
    }

    return parsed;
};

export const ArrivalReminderControl: React.FC<Props> = ({ stopName, eta, compact = false }) => {
    const [minutesInput, setMinutesInput] = useState(() => String(DEFAULT_REMINDER_MINUTES));
    const [submitting, setSubmitting] = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);
    const [activeReminder, setActiveReminder] = useState<StoredTransitArrivalReminder | null>(null);
    const [keyboardInset, setKeyboardInset] = useState(0);

    const canSchedule = useMemo(() => eta.minutesAway > 0, [eta.minutesAway]);

    const openMenu = () => {
        setMinutesInput(String(activeReminder?.minutesBefore ?? DEFAULT_REMINDER_MINUTES));
        setMenuVisible(true);
    };

    const closeMenu = () => {
        Keyboard.dismiss();
        setKeyboardInset(0);
        setMenuVisible(false);
    };

    useEffect(() => {
        let cancelled = false;

        const loadReminder = async () => {
            const reminder = await getTransitArrivalReminder(eta);
            if (cancelled) return;
            setActiveReminder(reminder);
            if (!menuVisible) {
                setMinutesInput(String(reminder?.minutesBefore ?? DEFAULT_REMINDER_MINUTES));
            }
        };

        void loadReminder();
        const unsubscribe = subscribeToTransitArrivalReminderChanges(() => {
            void loadReminder();
        });
        return () => { cancelled = true; unsubscribe(); };
    }, [eta.arrivalTimestamp, eta.stopId, eta.tripId, menuVisible]);

    useEffect(() => {
        if (Platform.OS !== 'android') {
            return;
        }

        if (!menuVisible) {
            setKeyboardInset(0);
            return;
        }

        const onKeyboardShow = Keyboard.addListener('keyboardDidShow', (event) => {
            setKeyboardInset(Math.max((event.endCoordinates?.height ?? 0) - 24, 0));
        });
        const onKeyboardHide = Keyboard.addListener('keyboardDidHide', () => {
            setKeyboardInset(0);
        });

        return () => {
            onKeyboardShow.remove();
            onKeyboardHide.remove();
        };
    }, [menuVisible]);

    const onSchedule = async () => {
        if (submitting) return;

        const minutesBefore = parseReminderMinutes(minutesInput);
        if (minutesBefore == null) {
            Alert.alert('Невалидни минути', 'Въведи число между 1 и 120 минути.');
            return;
        }

        Keyboard.dismiss();
        setSubmitting(true);
        try {
            const result = await scheduleTransitArrivalReminder({ stopName, eta, minutesBefore });
            if (result.ok) {
                const reminder = await getTransitArrivalReminder(eta);
                setActiveReminder(reminder);
                closeMenu();
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
        Keyboard.dismiss();
        setSubmitting(true);
        try {
            const result = await cancelTransitArrivalReminder(eta);
            if (result.ok) {
                setActiveReminder(null);
                closeMenu();
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
                    onPress={openMenu}
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

            <Modal transparent animationType="fade" visible={menuVisible} statusBarTranslucent onRequestClose={closeMenu}>
                <KeyboardAvoidingView
                    style={styles.modalRoot}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
                >
                    <Pressable style={styles.backdrop} onPress={closeMenu} />
                    <View style={[styles.menuCard, Platform.OS === 'android' ? { marginBottom: 110 + keyboardInset } : null]}>
                        <View style={styles.menuHeader}>
                            <Text style={styles.menuTitle}>{`Линия ${eta.line}`}</Text>
                            <TouchableOpacity onPress={closeMenu} style={styles.closeButton}>
                                <Ionicons name="close" size={18} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.menuSubtitle}>Напомни преди пристигане</Text>
                        <View style={styles.inputWrap}>
                            <Text style={styles.inputLabel}>Минути преди пристигане</Text>
                            <TextInput
                                style={styles.minutesInput}
                                value={minutesInput}
                                onChangeText={(value) => setMinutesInput(normalizeReminderMinutesInput(value))}
                                placeholder={String(DEFAULT_REMINDER_MINUTES)}
                                placeholderTextColor="#94A3B8"
                                keyboardType="number-pad"
                                maxLength={3}
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
                </KeyboardAvoidingView>
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
    inputWrap: {
        marginBottom: 14,
    },
    inputLabel: {
        fontSize: 12,
        color: '#334155',
        fontWeight: '700',
    },
    minutesInput: {
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
    inputHint: {
        marginTop: 8,
        fontSize: 12,
        lineHeight: 18,
        color: '#64748B',
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