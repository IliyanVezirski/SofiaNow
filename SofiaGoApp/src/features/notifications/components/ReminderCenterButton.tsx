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
                            <View>
                                <Text style={styles.title}>Активни напомняния</Text>
                                <Text style={styles.subtitle}>{`${totalReminders} активни уведомления`}</Text>
                            </View>
                            <TouchableOpacity style={styles.closeBtn} onPress={() => setVisible(false)}>
                                <Ionicons name="close" size={18} color="#64748B" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                            {arrivalReminders.length ? (
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>Пристигания по спирки</Text>
                                    {arrivalReminders.map((reminder) => (
                                        <View key={reminder.reminderKey} style={styles.card}>
                                            <View style={styles.cardHeader}>
                                                <View style={styles.lineBadge}>
                                                    <Ionicons name="bus-outline" size={13} color="#1D4ED8" />
                                                    <Text style={styles.lineBadgeText}>{reminder.line}</Text>
                                                </View>
                                                <TouchableOpacity
                                                    style={styles.deleteBtn}
                                                    onPress={() => void onRemoveArrival(reminder)}
                                                    disabled={submittingKey === reminder.reminderKey}
                                                >
                                                    <Ionicons name="trash-outline" size={16} color="#B91C1C" />
                                                </TouchableOpacity>
                                            </View>
                                            <Text style={styles.stopName}>{reminder.stopName}</Text>
                                            {reminder.destination ? <Text style={styles.meta}>{reminder.destination}</Text> : null}
                                            <Text style={styles.meta}>{`Известие: ${formatTime(reminder.remindAtTimestamp)} • Пристига: ${formatTime(reminder.arrivalTimestamp)}`}</Text>
                                            <Text style={styles.meta}>{`${reminder.minutesBefore} мин преди пристигане`}</Text>
                                        </View>
                                    ))}
                                </View>
                            ) : null}

                            {!arrivalReminders.length ? (
                                <Text style={styles.emptyText}>Няма активни уведомления.</Text>
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
        height: 48,
        borderRadius: 24,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.78)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
        elevation: 1,
    },
    fabIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(248,250,252,0.42)',
    },
    fabLabel: {
        color: '#475569',
        fontSize: 12,
        fontWeight: '600',
    },
    badge: {
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#DC2626',
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
        backgroundColor: 'rgba(255,255,255,0.82)',
        borderRadius: 24,
        padding: 18,
        maxHeight: 420,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 28,
        elevation: 20,
    },
    panelOpaque: {
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
    },
    subtitle: {
        fontSize: 12,
        color: '#64748B',
        marginTop: 2,
    },
    closeBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(226,232,240,0.72)',
    },
    list: {
        maxHeight: 320,
    },
    section: {
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#334155',
        marginBottom: 8,
    },
    card: {
        backgroundColor: 'rgba(248,250,252,0.72)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    lineBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#DBEAFE',
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    lineBadgeText: {
        color: '#1D4ED8',
        fontSize: 12,
        fontWeight: '700',
    },
    deleteBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FEE2E2',
    },
    stopName: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 4,
    },
    meta: {
        fontSize: 12,
        color: '#475569',
        marginBottom: 2,
    },
    emptyText: {
        fontSize: 13,
        color: '#64748B',
        textAlign: 'center',
        paddingVertical: 16,
    },
});