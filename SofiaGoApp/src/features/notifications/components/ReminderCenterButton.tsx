import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
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
    updateStoredTransitArrivalReminder,
} from '../../../services/notifications/transitArrivalNotifications';
import {
    formatFavoriteCommuteWeekdays,
} from '../../../services/places/commute';
import {
    cancelFavoriteCommuteReminder,
    listFavoriteCommuteReminders,
    updateFavoriteCommuteReminderSettings,
} from '../../../services/places/repository';
import { subscribeToFavoritePlaceChanges } from '../../../services/places/storage';
import type { StoredFavoriteCommuteReminder } from '../../../services/places/types';
import {
    listSavedTripPlannerRoutes,
    removeSavedTripPlannerRoute,
    subscribeToSavedTripPlannerRouteChanges,
    type SavedTripPlannerRoute,
} from '../../../services/savedTripRoutes';

interface Props {
    anchorStyle?: object;
    inline?: boolean;
    opaque?: boolean;
    transparent?: boolean;
    onOpenSavedTripRoute?: (routeId: string) => void | Promise<void>;
}

const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

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

export const ReminderCenterButton: React.FC<Props> = ({ anchorStyle, inline = false, opaque = false, transparent = false, onOpenSavedTripRoute }) => {
    const [visible, setVisible] = useState(false);
    const [arrivalReminders, setArrivalReminders] = useState<StoredTransitArrivalReminder[]>([]);
    const [commuteReminders, setCommuteReminders] = useState<StoredFavoriteCommuteReminder[]>([]);
    const [savedRoutes, setSavedRoutes] = useState<SavedTripPlannerRoute[]>([]);
    const [arrivalReminderHistory, setArrivalReminderHistory] = useState<StoredTransitArrivalReminderHistoryEntry[]>([]);
    const [submittingKey, setSubmittingKey] = useState<string | null>(null);
    const [submittingCommuteId, setSubmittingCommuteId] = useState<string | null>(null);
    const [submittingHistoryId, setSubmittingHistoryId] = useState<string | null>(null);
    const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
    const [deletingSavedRouteId, setDeletingSavedRouteId] = useState<string | null>(null);
    const [editingReminder, setEditingReminder] = useState<StoredTransitArrivalReminder | null>(null);
    const [editingMinutesInput, setEditingMinutesInput] = useState('');
    const [editingSubmitting, setEditingSubmitting] = useState(false);
    const [editingCommuteReminder, setEditingCommuteReminder] = useState<StoredFavoriteCommuteReminder | null>(null);
    const [editingCommuteMinutesInput, setEditingCommuteMinutesInput] = useState('');
    const [editingCommuteSubmitting, setEditingCommuteSubmitting] = useState(false);
    const [restoringHistoryEntry, setRestoringHistoryEntry] = useState<StoredTransitArrivalReminderHistoryEntry | null>(null);
    const [restoringMinutesInput, setRestoringMinutesInput] = useState('');
    const [restoringSubmitting, setRestoringSubmitting] = useState(false);
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
            const [nextArrivalReminders, nextArrivalReminderHistory, nextCommuteReminders, nextSavedRoutes] = await Promise.all([
                listTransitArrivalReminders(),
                listTransitArrivalReminderHistory(),
                listFavoriteCommuteReminders(),
                listSavedTripPlannerRoutes(),
            ]);
            if (!cancelled) {
                setArrivalReminders(nextArrivalReminders);
                setArrivalReminderHistory(nextArrivalReminderHistory);
                setCommuteReminders(nextCommuteReminders);
                setSavedRoutes(nextSavedRoutes);
            }
        };

        void loadReminders();
        const unsubscribeArrival = subscribeToTransitArrivalReminderChanges(() => {
            void loadReminders();
        });
        const unsubscribeFavorites = subscribeToFavoritePlaceChanges(() => {
            void loadReminders();
        });
        const unsubscribeSavedRoutes = subscribeToSavedTripPlannerRouteChanges(() => {
            void loadReminders();
        });

        return () => {
            cancelled = true;
            unsubscribeArrival();
            unsubscribeFavorites();
            unsubscribeSavedRoutes();
        };
    }, []);

    const totalReminders = arrivalReminders.length + commuteReminders.length + savedRoutes.length;
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
            if (editingReminder?.reminderKey === reminder.reminderKey) {
                setEditingReminder(null);
                setEditingMinutesInput('');
            }
            Alert.alert(result.ok ? 'Напомнянето е премахнато' : 'Неуспешно', result.message);
        } catch {
            Alert.alert('Грешка', 'Неуспешно премахване на напомнянето.');
        } finally {
            setSubmittingKey(null);
        }
    };

    const openEditReminder = (reminder: StoredTransitArrivalReminder) => {
        setEditingReminder(reminder);
        setEditingMinutesInput(String(reminder.minutesBefore));
    };

    const closeEditReminder = () => {
        if (editingSubmitting) {
            return;
        }

        Keyboard.dismiss();
        setEditingReminder(null);
        setEditingMinutesInput('');
    };

    const onSaveEditedReminder = async () => {
        if (!editingReminder || editingSubmitting) {
            return;
        }

        const minutesBefore = parseReminderMinutes(editingMinutesInput);
        if (minutesBefore == null) {
            Alert.alert('Невалидни минути', 'Въведи число между 1 и 120 минути.');
            return;
        }

        Keyboard.dismiss();
        setEditingSubmitting(true);
        try {
            const result = await updateStoredTransitArrivalReminder(editingReminder.reminderKey, minutesBefore);
            if (result.ok) {
                setEditingReminder(null);
                setEditingMinutesInput('');
            }
            Alert.alert(result.ok ? 'Напомнянето е обновено' : 'Неуспешна редакция', result.message);
        } catch {
            Alert.alert('Грешка', 'Неуспешна редакция на напомнянето.');
        } finally {
            setEditingSubmitting(false);
        }
    };

    const onRestoreFromHistory = async (entry: StoredTransitArrivalReminderHistoryEntry) => {
        setRestoringHistoryEntry(entry);
        setRestoringMinutesInput(String(entry.minutesBefore));
    };

    const closeRestoreHistory = () => {
        if (restoringSubmitting) {
            return;
        }

        Keyboard.dismiss();
        setRestoringHistoryEntry(null);
        setRestoringMinutesInput('');
    };

    const onConfirmRestoreHistory = async () => {
        if (!restoringHistoryEntry || restoringSubmitting) {
            return;
        }

        const minutesBefore = parseReminderMinutes(restoringMinutesInput);
        if (minutesBefore == null) {
            Alert.alert('Невалидни минути', 'Въведи число между 1 и 120 минути.');
            return;
        }

        Keyboard.dismiss();
        setRestoringSubmitting(true);
        try {
            const result = await rescheduleTransitArrivalReminderFromHistory(restoringHistoryEntry.historyId, minutesBefore);
            if (result.ok) {
                setRestoringHistoryEntry(null);
                setRestoringMinutesInput('');
            }
            Alert.alert(result.ok ? 'Напомнянето е възстановено' : 'Неуспешно възстановяване', result.message);
        } catch {
            Alert.alert('Грешка', 'Неуспешно възстановяване на напомнянето от историята.');
        } finally {
            setRestoringSubmitting(false);
        }
    };

    const onRemoveCommute = async (reminder: StoredFavoriteCommuteReminder) => {
        if (submittingCommuteId) return;

        setSubmittingCommuteId(reminder.favoriteId);
        try {
            const result = await cancelFavoriteCommuteReminder(reminder.favoriteId);
            if (editingCommuteReminder?.favoriteId === reminder.favoriteId) {
                setEditingCommuteReminder(null);
                setEditingCommuteMinutesInput('');
            }
            Alert.alert(result.ok ? 'Маршрутното известие е премахнато' : 'Неуспешно', result.message);
        } catch {
            Alert.alert('Грешка', 'Неуспешно премахване на маршрутното известие.');
        } finally {
            setSubmittingCommuteId(null);
        }
    };

    const openEditCommuteReminder = (reminder: StoredFavoriteCommuteReminder) => {
        setEditingCommuteReminder(reminder);
        setEditingCommuteMinutesInput(String(reminder.reminderOffsetMinutes ?? 5));
    };

    const closeEditCommuteReminder = () => {
        if (editingCommuteSubmitting) {
            return;
        }

        Keyboard.dismiss();
        setEditingCommuteReminder(null);
        setEditingCommuteMinutesInput('');
    };

    const onSaveEditedCommuteReminder = async () => {
        if (!editingCommuteReminder || editingCommuteSubmitting) {
            return;
        }

        const minutesBefore = parseReminderMinutes(editingCommuteMinutesInput);
        if (minutesBefore == null) {
            Alert.alert('Невалидни минути', 'Въведи число между 1 и 120 минути.');
            return;
        }

        Keyboard.dismiss();
        setEditingCommuteSubmitting(true);
        try {
            const result = await updateFavoriteCommuteReminderSettings(editingCommuteReminder.favoriteId, { reminderOffsetMinutes: minutesBefore });
            if (result.ok) {
                setEditingCommuteReminder(null);
                setEditingCommuteMinutesInput('');
            }
            Alert.alert(result.ok ? 'Маршрутното известие е обновено' : 'Неуспешна редакция', result.message);
        } catch {
            Alert.alert('Грешка', 'Неуспешна редакция на маршрутното известие.');
        } finally {
            setEditingCommuteSubmitting(false);
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

    const onOpenSavedRoute = async (route: SavedTripPlannerRoute) => {
        if (!onOpenSavedTripRoute) {
            return;
        }

        Keyboard.dismiss();
        setVisible(false);
        await Promise.resolve(onOpenSavedTripRoute(route.id));
    };

    const onDeleteSavedRoute = async (route: SavedTripPlannerRoute) => {
        if (deletingSavedRouteId) {
            return;
        }

        setDeletingSavedRouteId(route.id);
        try {
            await removeSavedTripPlannerRoute(route.id);
            Alert.alert('Маршрутът е премахнат', 'Запазеният маршрут беше изтрит.');
        } catch {
            Alert.alert('Грешка', 'Неуспешно изтриване на запазения маршрут.');
        } finally {
            setDeletingSavedRouteId(null);
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
                                <Pressable key={reminder.reminderKey} style={styles.card} onPress={() => openEditReminder(reminder)}>
                                    <View style={styles.cardRow}>
                                        <View style={styles.cardInfo}>
                                            <Text style={styles.cardLine}>{reminder.line}</Text>
                                            <Text style={styles.cardStop} numberOfLines={2}>{reminder.stopName}</Text>
                                        </View>
                                        <View style={styles.historyActionsWrap}>
                                            <TouchableOpacity
                                                style={styles.editBtn}
                                                onPress={() => openEditReminder(reminder)}
                                                disabled={submittingKey === reminder.reminderKey}
                                            >
                                                <Ionicons name="create-outline" size={14} color="#1D4ED8" />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.deleteBtn}
                                                onPress={() => void onRemoveArrival(reminder)}
                                                disabled={submittingKey === reminder.reminderKey}
                                            >
                                                <Ionicons name="close" size={14} color="#94A3B8" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                    <Text style={styles.meta}>{`${formatTime(reminder.remindAtTimestamp)} • ${reminder.minutesBefore} мин преди`}</Text>
                                    <Text style={styles.arrivalEta}>{`${formatArrivalEta(reminder.arrivalTimestamp)} • пристига ${formatTime(reminder.arrivalTimestamp)}`}</Text>
                                </Pressable>
                            ))}

                            {commuteReminders.map((reminder) => (
                                <Pressable key={`commute-${reminder.favoriteId}`} style={styles.card} onPress={() => openEditCommuteReminder(reminder)}>
                                    <View style={styles.cardRow}>
                                        <View style={styles.cardInfo}>
                                            <Text style={styles.cardLine}>{reminder.favoriteName}</Text>
                                            <Text style={styles.cardStop} numberOfLines={2}>{reminder.routeLabel}</Text>
                                        </View>
                                        <View style={styles.historyActionsWrap}>
                                            <TouchableOpacity
                                                style={styles.editBtn}
                                                onPress={() => openEditCommuteReminder(reminder)}
                                                disabled={submittingCommuteId === reminder.favoriteId}
                                            >
                                                <Ionicons name="create-outline" size={14} color="#1D4ED8" />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.deleteBtn}
                                                onPress={() => void onRemoveCommute(reminder)}
                                                disabled={submittingCommuteId === reminder.favoriteId}
                                            >
                                                <Ionicons name="close" size={14} color="#94A3B8" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                    <Text style={styles.meta}>{`${reminder.reminderTime} • ${(reminder.reminderOffsetMinutes ?? 5)} мин преди`}</Text>
                                    <Text style={styles.arrivalEta}>{`${formatFavoriteCommuteWeekdays(reminder.notificationWeekdays)}${reminder.routeStartTime ? ` • тръгване ${reminder.routeStartTime}` : ''}`}</Text>
                                </Pressable>
                            ))}

                            {savedRoutes.length ? <Text style={styles.sectionTitle}>Запазени маршрути</Text> : null}
                            {savedRoutes.map((route) => {
                                const isDeleting = deletingSavedRouteId === route.id;
                                const canOpenSavedRoute = !!onOpenSavedTripRoute;
                                return (
                                    <Pressable
                                        key={route.id}
                                        style={styles.card}
                                        disabled={!canOpenSavedRoute}
                                        onPress={() => {
                                            void onOpenSavedRoute(route);
                                        }}
                                    >
                                        <View style={styles.cardRow}>
                                            <View style={styles.cardInfo}>
                                                <Text style={styles.cardLine} numberOfLines={1}>{route.routeLabel}</Text>
                                                <Text style={styles.cardStop} numberOfLines={2}>{`${route.from.name} → ${route.to.name}`}</Text>
                                            </View>
                                            <View style={styles.historyActionsWrap}>
                                                {canOpenSavedRoute ? (
                                                    <TouchableOpacity
                                                        style={styles.editBtn}
                                                        onPress={() => {
                                                            void onOpenSavedRoute(route);
                                                        }}
                                                        disabled={isDeleting}
                                                    >
                                                        <Ionicons name="open-outline" size={14} color="#1D4ED8" />
                                                    </TouchableOpacity>
                                                ) : null}
                                                <TouchableOpacity
                                                    style={styles.deleteBtn}
                                                    onPress={() => {
                                                        void onDeleteSavedRoute(route);
                                                    }}
                                                    disabled={isDeleting}
                                                >
                                                    <Ionicons name="close" size={14} color="#94A3B8" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                        <Text style={styles.meta}>{`${route.routeDate} • ${route.routeTime}${route.arriveBy ? ' • пристигане до' : ' • тръгване в'}`}</Text>
                                        <Text style={styles.arrivalEta}>{route.itinerarySummary}</Text>
                                    </Pressable>
                                );
                            })}

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

                            {!arrivalReminders.length && !commuteReminders.length && !savedRoutes.length && !historyReminders.length ? (
                                <Text style={styles.emptyText}>Няма запазени напомняния или маршрути.</Text>
                            ) : null}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <Modal transparent animationType="fade" visible={!!editingReminder} statusBarTranslucent onRequestClose={closeEditReminder}>
                <KeyboardAvoidingView
                    style={styles.editModalRoot}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
                >
                    <Pressable style={styles.backdrop} onPress={closeEditReminder} />
                    <View style={styles.editCard}>
                        <View style={styles.header}>
                            <View style={styles.editHeaderCopy}>
                                <Text style={styles.title}>Редакция на напомняне</Text>
                                {editingReminder ? (
                                    <>
                                        <View style={styles.editLineBadge}>
                                            <Text style={styles.editLineBadgeText}>{editingReminder.line}</Text>
                                        </View>
                                        <Text style={styles.editStopName}>{editingReminder.stopName}</Text>
                                    </>
                                ) : null}
                            </View>
                            <TouchableOpacity style={styles.closeBtn} onPress={closeEditReminder}>
                                <Ionicons name="close" size={18} color="#64748B" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.editLabel}>Минути преди пристигане</Text>
                        <TextInput
                            style={styles.editInput}
                            value={editingMinutesInput}
                            onChangeText={(value) => setEditingMinutesInput(normalizeReminderMinutesInput(value))}
                            keyboardType="number-pad"
                            maxLength={3}
                            placeholder="5"
                            placeholderTextColor="#94A3B8"
                        />

                        <TouchableOpacity style={styles.saveBtn} onPress={() => void onSaveEditedReminder()} disabled={editingSubmitting}>
                            <Text style={styles.saveBtnText}>{editingSubmitting ? 'Запазване...' : 'Запази'}</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <Modal transparent animationType="fade" visible={!!editingCommuteReminder} statusBarTranslucent onRequestClose={closeEditCommuteReminder}>
                <KeyboardAvoidingView
                    style={styles.editModalRoot}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
                >
                    <Pressable style={styles.backdrop} onPress={closeEditCommuteReminder} />
                    <View style={styles.editCard}>
                        <View style={styles.header}>
                            <View style={styles.editHeaderCopy}>
                                <Text style={styles.title}>Редакция на маршрутно известие</Text>
                                {editingCommuteReminder ? (
                                    <>
                                        <View style={styles.editLineBadge}>
                                            <Text style={styles.editLineBadgeText}>{editingCommuteReminder.favoriteName}</Text>
                                        </View>
                                        <Text style={styles.editStopName}>{editingCommuteReminder.routeLabel}</Text>
                                        {editingCommuteReminder.routeStartTime ? <Text style={styles.editRouteMeta}>{`Тръгване ${editingCommuteReminder.routeStartTime}`}</Text> : null}
                                    </>
                                ) : null}
                            </View>
                            <TouchableOpacity style={styles.closeBtn} onPress={closeEditCommuteReminder}>
                                <Ionicons name="close" size={18} color="#64748B" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.editLabel}>Минути преди тръгване</Text>
                        <TextInput
                            style={styles.editInput}
                            value={editingCommuteMinutesInput}
                            onChangeText={(value) => setEditingCommuteMinutesInput(normalizeReminderMinutesInput(value))}
                            keyboardType="number-pad"
                            maxLength={3}
                            placeholder="5"
                            placeholderTextColor="#94A3B8"
                        />

                        <TouchableOpacity style={styles.saveBtn} onPress={() => void onSaveEditedCommuteReminder()} disabled={editingCommuteSubmitting}>
                            <Text style={styles.saveBtnText}>{editingCommuteSubmitting ? 'Запазване...' : 'Запази'}</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
            <Modal transparent animationType="fade" visible={!!restoringHistoryEntry} statusBarTranslucent onRequestClose={closeRestoreHistory}>
                <KeyboardAvoidingView
                    style={styles.editModalRoot}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
                >
                    <Pressable style={styles.backdrop} onPress={closeRestoreHistory} />
                    <View style={styles.editCard}>
                        <View style={styles.header}>
                            <View style={styles.editHeaderCopy}>
                                <Text style={styles.title}>Възстановяване на напомняне</Text>
                                {restoringHistoryEntry ? (
                                    <>
                                        <View style={styles.editLineBadge}>
                                            <Text style={styles.editLineBadgeText}>{restoringHistoryEntry.line}</Text>
                                        </View>
                                        <Text style={styles.editStopName}>{restoringHistoryEntry.stopName}</Text>
                                    </>
                                ) : null}
                            </View>
                            <TouchableOpacity style={styles.closeBtn} onPress={closeRestoreHistory}>
                                <Ionicons name="close" size={18} color="#64748B" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.editLabel}>Минути преди пристигане</Text>
                        <TextInput
                            style={styles.editInput}
                            value={restoringMinutesInput}
                            onChangeText={(value) => setRestoringMinutesInput(normalizeReminderMinutesInput(value))}
                            keyboardType="number-pad"
                            maxLength={3}
                            placeholder="5"
                            placeholderTextColor="#94A3B8"
                        />

                        <TouchableOpacity style={styles.saveBtn} onPress={() => void onConfirmRestoreHistory()} disabled={restoringSubmitting}>
                            <Text style={styles.saveBtnText}>{restoringSubmitting ? 'Възстановяване...' : 'Възстанови'}</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
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
    editBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(239,246,255,0.88)',
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
    editModalRoot: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    editCard: {
        marginHorizontal: 16,
        marginBottom: 120,
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderRadius: 18,
        padding: 18,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.82)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 18,
    },
    editHeaderCopy: {
        flex: 1,
        minWidth: 0,
    },
    editLineBadge: {
        alignSelf: 'flex-start',
        marginTop: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: 'rgba(219,234,254,0.88)',
    },
    editLineBadgeText: {
        color: '#1D4ED8',
        fontSize: 11,
        fontWeight: '800',
    },
    editStopName: {
        marginTop: 8,
        color: '#0F172A',
        fontSize: 14,
        fontWeight: '600',
        lineHeight: 20,
    },
    editRouteMeta: {
        marginTop: 4,
        color: '#64748B',
        fontSize: 12,
        fontWeight: '600',
    },
    editLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#475569',
        marginBottom: 6,
    },
    editInput: {
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(203,213,225,0.9)',
        backgroundColor: 'rgba(248,250,252,0.88)',
        paddingHorizontal: 12,
        color: '#0F172A',
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 12,
    },
    saveBtn: {
        height: 42,
        borderRadius: 12,
        backgroundColor: '#1D4ED8',
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
});
