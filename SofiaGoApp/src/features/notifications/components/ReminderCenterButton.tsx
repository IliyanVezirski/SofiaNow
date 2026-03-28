import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
    cancelStoredTransitArrivalReminder,
    deleteTransitArrivalReminderHistoryEntry,
    listTransitArrivalReminderHistory,
    listTransitArrivalReminders,
    rescheduleTransitArrivalReminderFromHistory,
    StoredTransitArrivalReminder,
    StoredTransitArrivalReminderHistoryEntry,
    subscribeToTransitArrivalReminderChanges,
} from '../../../services/notifications/transitArrivalNotifications';
import {
    cancelFavoriteCommuteReminder,
    formatFavoriteCommuteWeekdays,
    listFavoriteCommuteReminders,
    StoredFavoriteCommuteReminder,
    subscribeToFavoritePlaceChanges,
} from '../../../services/places';

interface Props {
    anchorStyle?: object;
    inline?: boolean;
    opaque?: boolean;
    transparent?: boolean;
}

const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export const ReminderCenterButton: React.FC<Props> = ({ anchorStyle, inline = false, opaque = false, transparent = false }) => {
    const [visible, setVisible] = useState(false);
    const [arrivalReminders, setArrivalReminders] = useState<StoredTransitArrivalReminder[]>([]);
    const [commuteReminders, setCommuteReminders] = useState<StoredFavoriteCommuteReminder[]>([]);
    const [arrivalReminderHistory, setArrivalReminderHistory] = useState<StoredTransitArrivalReminderHistoryEntry[]>([]);
    const [submittingKey, setSubmittingKey] = useState<string | null>(null);
    const [submittingCommuteId, setSubmittingCommuteId] = useState<string | null>(null);
    const [submittingHistoryId, setSubmittingHistoryId] = useState<string | null>(null);
    const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
    const [nowUnix, setNowUnix] = useState(() => Math.floor(Date.now() / 1000));
    const { height } = useWindowDimensions();

    useEffect(() => {
        const timer = setInterval(() => {
            setNowUnix(Math.floor(Date.now() / 1000));
        }, 30000);

        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadReminders = async () => {
            const [nextArrivalReminders, nextArrivalReminderHistory, nextCommuteReminders] = await Promise.all([
                listTransitArrivalReminders(),
                listTransitArrivalReminderHistory(),
                listFavoriteCommuteReminders(),
            ]);
            if (!cancelled) {
                setArrivalReminders(nextArrivalReminders);
                setArrivalReminderHistory(nextArrivalReminderHistory);
                setCommuteReminders(nextCommuteReminders);
            }
        };

        void loadReminders();
        const unsubscribeArrival = subscribeToTransitArrivalReminderChanges(() => {
            void loadReminders();
        });
        const unsubscribeFavorites = subscribeToFavoritePlaceChanges(() => {
            void loadReminders();
        });

        return () => {
            cancelled = true;
            unsubscribeArrival();
            unsubscribeFavorites();
        };
    }, []);

    const totalReminders = arrivalReminders.length + commuteReminders.length;
    const hasReminders = totalReminders > 0;
    const activeHistoryIds = useMemo(() => new Set(arrivalReminders.map((reminder) => reminder.historyId).filter(Boolean)), [arrivalReminders]);
    const historyReminders = useMemo(
        () => arrivalReminderHistory.filter((entry) => !activeHistoryIds.has(entry.historyId)),
        [activeHistoryIds, arrivalReminderHistory],
    );

    const countLabel = useMemo(() => {
        if (totalReminders <= 9) return String(totalReminders);
        return '9+';
    }, [totalReminders]);

    const formatHistoryStateLabel = (state: StoredTransitArrivalReminderHistoryEntry['lastState']) => {
        if (state === 'cancelled') {
            return 'Отменено';
        }

        if (state === 'expired') {
            return 'Изтекло';
        }

        return 'Активно';
    };

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

    const onRestoreFromHistory = async (entry: StoredTransitArrivalReminderHistoryEntry) => {
        if (submittingHistoryId) return;

        setSubmittingHistoryId(entry.historyId);
        try {
            const result = await rescheduleTransitArrivalReminderFromHistory(entry.historyId);
            Alert.alert(result.ok ? 'Напомнянето е възстановено' : 'Неуспешно възстановяване', result.message);
        } catch {
            Alert.alert('Грешка', 'Неуспешно възстановяване на напомнянето от историята.');
        } finally {
            setSubmittingHistoryId(null);
        }
    };

    const onRemoveCommute = async (reminder: StoredFavoriteCommuteReminder) => {
        if (submittingCommuteId) return;

        setSubmittingCommuteId(reminder.favoriteId);
        try {
            const result = await cancelFavoriteCommuteReminder(reminder.favoriteId);
            Alert.alert(result.ok ? 'Маршрутното известие е премахнато' : 'Неуспешно', result.message);
        } catch {
            Alert.alert('Грешка', 'Неуспешно премахване на маршрутното известие.');
        } finally {
            setSubmittingCommuteId(null);
        }
    };

    const onDeleteFromHistory = async (entry: StoredTransitArrivalReminderHistoryEntry) => {
        if (deletingHistoryId) return;

        setDeletingHistoryId(entry.historyId);
        try {
            const result = await deleteTransitArrivalReminderHistoryEntry(entry.historyId);
            Alert.alert(result.ok ? 'Премахнато от историята' : 'Неуспешно изтриване', result.message);
        } catch {
            Alert.alert('Грешка', 'Неуспешно изтриване от историята.');
        } finally {
            setDeletingHistoryId(null);
        }
    };

    const formatArrivalEta = (arrivalTimestamp: number) => {
        const minutesAway = Math.max(0, Math.round((arrivalTimestamp - nowUnix) / 60));

        if (minutesAway <= 0) {
            return 'на спирката е сега';
        }

        if (minutesAway === 1) {
            return 'след 1 мин';
        }

        return `след ${minutesAway} мин`;
    };

    return (
        <>
            <View style={[inline ? styles.inlineWrap : styles.fabWrap, anchorStyle]} pointerEvents="box-none">
                <TouchableOpacity style={[styles.fab, transparent && styles.fabTransparent]} onPress={() => setVisible(true)}>
                    <View style={styles.fabIcon}>
                        <Ionicons name="notifications-outline" size={18} color="#0F172A" />
                    </View>
                    {hasReminders ? (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{countLabel}</Text>
                        </View>
                    ) : null}
                </TouchableOpacity>
            </View>

            <Modal transparent animationType="fade" visible={visible} statusBarTranslucent onRequestClose={() => setVisible(false)}>
                <View style={styles.panelWrap}>
                    <Pressable style={styles.backdrop} onPress={() => setVisible(false)} />
                    <View style={[styles.panel, { marginBottom: Math.min(Math.max(height * 0.16, 96), 188), maxHeight: Math.min(Math.max(height * 0.44, 320), 460) }, opaque && styles.panelOpaque]}>
                        <View style={styles.header}>
                            <Text style={styles.title}>Напомняния</Text>
                            <TouchableOpacity style={styles.closeBtn} onPress={() => setVisible(false)}>
                                <Ionicons name="close" size={18} color="#64748B" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={[styles.list, { maxHeight: Math.min(height * 0.36, 360) }]} showsVerticalScrollIndicator={false}>
                            {hasReminders ? <Text style={styles.sectionTitle}>Активни</Text> : null}
                            {arrivalReminders.map((reminder) => (
                                <View key={reminder.reminderKey} style={styles.card}>
                                    <View style={styles.cardRow}>
                                        <View style={styles.cardInfo}>
                                            <Text style={styles.cardLine}>{reminder.line}</Text>
                                            <Text style={styles.cardStop} numberOfLines={2}>{reminder.stopName}</Text>
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
                                    <Text style={styles.arrivalEta}>{`${formatArrivalEta(reminder.arrivalTimestamp)} • пристига ${formatTime(reminder.arrivalTimestamp)}`}</Text>
                                </View>
                            ))}

                            {commuteReminders.map((reminder) => (
                                <View key={`commute-${reminder.favoriteId}`} style={styles.card}>
                                    <View style={styles.cardRow}>
                                        <View style={styles.cardInfo}>
                                            <Text style={styles.cardLine}>{reminder.favoriteName}</Text>
                                            <Text style={styles.cardStop} numberOfLines={2}>{reminder.routeLabel}</Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.deleteBtn}
                                            onPress={() => void onRemoveCommute(reminder)}
                                            disabled={submittingCommuteId === reminder.favoriteId}
                                        >
                                            <Ionicons name="close" size={14} color="#94A3B8" />
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={styles.meta}>{`${reminder.reminderTime} • ${(reminder.reminderOffsetMinutes ?? 5)} мин преди`}</Text>
                                    <Text style={styles.arrivalEta}>{`${formatFavoriteCommuteWeekdays(reminder.notificationWeekdays)}${reminder.routeStartTime ? ` • тръгване ${reminder.routeStartTime}` : ''}`}</Text>
                                </View>
                            ))}

                            {historyReminders.length ? <Text style={styles.sectionTitle}>История</Text> : null}
                            {historyReminders.map((entry) => {
                                const isSubmitting = submittingHistoryId === entry.historyId;
                                const isDeleting = deletingHistoryId === entry.historyId;
                                const stateLabel = formatHistoryStateLabel(entry.lastState);
                                const stateStyle = entry.lastState === 'cancelled'
                                    ? styles.historyStateCancelled
                                    : entry.lastState === 'expired'
                                        ? styles.historyStateExpired
                                        : styles.historyStateActive;

                                return (
                                    <View key={entry.historyId} style={styles.card}>
                                        <View style={styles.cardRow}>
                                            <View style={styles.cardInfo}>
                                                <Text style={styles.cardLine}>{entry.line}</Text>
                                                <Text style={styles.cardStop} numberOfLines={2}>{entry.stopName}</Text>
                                            </View>
                                            <View style={styles.historyActionsWrap}>
                                                <TouchableOpacity
                                                    style={styles.historyRestoreBtn}
                                                    onPress={() => void onRestoreFromHistory(entry)}
                                                    disabled={isSubmitting || isDeleting}
                                                >
                                                    <Ionicons name="refresh-outline" size={14} color="#1D4ED8" />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={styles.historyDeleteBtn}
                                                    onPress={() => void onDeleteFromHistory(entry)}
                                                    disabled={isSubmitting || isDeleting}
                                                >
                                                    <Ionicons name="trash-outline" size={14} color="#DC2626" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                        <Text style={styles.meta}>{`${formatTime(entry.remindAtTimestamp)} • ${entry.minutesBefore} мин преди`}</Text>
                                        <Text style={styles.arrivalEta}>{`последно пристигане ${formatTime(entry.arrivalTimestamp)}${entry.destination ? ` • ${entry.destination}` : ''}`}</Text>
                                        <View style={styles.historyFooter}>
                                            <View style={[styles.historyStatePill, stateStyle]}>
                                                <Text style={styles.historyStateText}>{stateLabel}</Text>
                                            </View>
                                            {(isSubmitting || isDeleting) ? <Text style={styles.historyActionText}>{isSubmitting ? 'Възстановява...' : 'Изтрива...'}</Text> : null}
                                        </View>
                                    </View>
                                );
                            })}

                            {!arrivalReminders.length && !historyReminders.length ? (
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
    fabTransparent: {
        backgroundColor: 'rgba(255,255,255,0.88)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.78)',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 1,
        paddingHorizontal: 8,
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
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderRadius: 20,
        padding: 18,
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
        gap: 10,
    },
    title: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0F172A',
        flex: 1,
        minWidth: 0,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        marginTop: 4,
        marginBottom: 6,
    },
    closeBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    list: {},
    card: {
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(226,232,240,0.6)',
    },
    cardRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    cardInfo: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        flexWrap: 'wrap',
    },
    cardLine: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1D4ED8',
    },
    cardStop: {
        flex: 1,
        minWidth: 120,
        fontSize: 13,
        fontWeight: '600',
        color: '#0F172A',
        lineHeight: 17,
    },
    deleteBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    historyActionsWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    historyRestoreBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(239,246,255,0.88)',
    },
    historyDeleteBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(254,242,242,0.92)',
    },
    meta: {
        fontSize: 11,
        color: '#94A3B8',
        marginTop: 3,
    },
    arrivalEta: {
        fontSize: 11,
        color: '#475569',
        marginTop: 2,
        fontWeight: '600',
    },
    historyFooter: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    historyStatePill: {
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    historyStateActive: {
        backgroundColor: 'rgba(219,234,254,0.88)',
    },
    historyStateCancelled: {
        backgroundColor: 'rgba(254,226,226,0.88)',
    },
    historyStateExpired: {
        backgroundColor: 'rgba(241,245,249,0.92)',
    },
    historyStateText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#334155',
    },
    historyActionText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#64748B',
    },
    emptyText: {
        fontSize: 13,
        color: '#94A3B8',
        textAlign: 'center',
        paddingVertical: 16,
    },
});