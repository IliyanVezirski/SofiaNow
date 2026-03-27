import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
    cancelStoredTransitArrivalReminder,
    listTransitArrivalReminders,
    StoredTransitArrivalReminder,
    subscribeToTransitArrivalReminderChanges,
} from '../../../services/notifications/transitArrivalNotifications';

interface Props {
    anchorStyle?: object;
    inline?: boolean;
    opaque?: boolean;
}

const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export const ReminderCenterButton: React.FC<Props> = ({ anchorStyle, inline = false, opaque = false }) => {
    const [visible, setVisible] = useState(false);
    const [arrivalReminders, setArrivalReminders] = useState<StoredTransitArrivalReminder[]>([]);
    const [submittingKey, setSubmittingKey] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const loadReminders = async () => {
            const nextArrivalReminders = await listTransitArrivalReminders();
            if (!cancelled) {
                setArrivalReminders(nextArrivalReminders);
            }
        };

        void loadReminders();
        const unsubscribeArrival = subscribeToTransitArrivalReminderChanges(() => {
            void loadReminders();
        });

        return () => {
            cancelled = true;
            unsubscribeArrival();
        };
    }, []);

    const totalReminders = arrivalReminders.length;

    const countLabel = useMemo(() => {
        if (totalReminders <= 9) return String(totalReminders);
        return '9+';
    }, [totalReminders]);

    const onRemoveArrival = async (reminder: StoredTransitArrivalReminder) => {
        if (submittingKey) return;
        setSubmittingKey(reminder.reminderKey);
        try {
            const result = await cancelStoredTransitArrivalReminder(reminder.reminderKey);
            Alert.alert(result.ok ? 'Напомнянето е премахнато' : 'Неуспешно', result.message);
        } catch {
            Alert.alert('Грешка', 'Неуспешно премахване на напомнянето.');
        } finally {
            setSubmittingKey(null);
        }
    };

    if (totalReminders === 0) return null;

    return (
        <>
            <View style={[inline ? styles.inlineWrap : styles.fabWrap, anchorStyle]} pointerEvents="box-none">
                <TouchableOpacity style={styles.fab} onPress={() => setVisible(true)}>
                    <View style={styles.fabIcon}>
                        <Ionicons name="notifications-outline" size={18} color="#0F172A" />
                    </View>
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>{countLabel}</Text>
                    </View>
                </TouchableOpacity>
            </View>

            <Modal transparent animationType="fade" visible={visible} statusBarTranslucent onRequestClose={() => setVisible(false)}>
                <View style={styles.panelWrap}>
                    <Pressable style={styles.backdrop} onPress={() => setVisible(false)} />
                    <View style={[styles.panel, opaque && styles.panelOpaque]}>
                        <View style={styles.header}>
                            <Text style={styles.title}>Напомняния</Text>
                            <TouchableOpacity style={styles.closeBtn} onPress={() => setVisible(false)}>
                                <Ionicons name="close" size={18} color="#64748B" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                            {arrivalReminders.map((reminder) => (
                                <View key={reminder.reminderKey} style={styles.card}>
                                    <View style={styles.cardRow}>
                                        <View style={styles.cardInfo}>
                                            <Text style={styles.cardLine}>{reminder.line}</Text>
                                            <Text style={styles.cardStop} numberOfLines={1}>{reminder.stopName}</Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.deleteBtn}
                                            onPress={() => void onRemoveArrival(reminder)}
                                            disabled={submittingKey === reminder.reminderKey}
                                        >
                                            <Ionicons name="close" size={14} color="#94A3B8" />
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={styles.meta}>{`${formatTime(reminder.remindAtTimestamp)} • ${reminder.minutesBefore} мин преди`}</Text>
                                </View>
                            ))}

                            {!arrivalReminders.length ? (
                                <Text style={styles.emptyText}>Няма напомняния.</Text>
                            ) : null}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </>
    );
};

const styles = StyleSheet.create({
    fabWrap: {
        position: 'absolute',
        right: 16,
        bottom: 178,
        zIndex: 1,
        elevation: 1,
    },
    inlineWrap: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    fab: {
        height: 44,
        borderRadius: 22,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        backgroundColor: 'rgba(255,255,255,0.92)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 1,
    },
    fabIcon: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badge: {
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#1D4ED8',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '700',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 23, 42, 0.18)',
    },
    panelWrap: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    panel: {
        marginHorizontal: 16,
        marginBottom: 188,
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderRadius: 20,
        padding: 18,
        maxHeight: 400,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 12,
    },
    panelOpaque: {
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    title: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0F172A',
    },
    closeBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    list: {
        maxHeight: 320,
    },
    card: {
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(226,232,240,0.6)',
    },
    cardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    cardInfo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    cardLine: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1D4ED8',
    },
    cardStop: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
        color: '#0F172A',
    },
    deleteBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    meta: {
        fontSize: 11,
        color: '#94A3B8',
        marginTop: 3,
    },
    emptyText: {
        fontSize: 13,
        color: '#94A3B8',
        textAlign: 'center',
        paddingVertical: 16,
    },
});