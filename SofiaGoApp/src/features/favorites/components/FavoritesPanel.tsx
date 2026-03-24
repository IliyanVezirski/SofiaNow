import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, TouchableOpacity, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FavoritePlace, cancelFavoriteCommuteReminder, formatFavoriteCommuteWeekdays, hasFavoriteCoordinates } from '../../../services/places';
import { ReminderCenterButton } from '../../notifications/components/ReminderCenterButton';
import { Stop } from '../../../services/stopsApi';
import { FavoriteEditorModal } from './FavoriteEditorModal';
import type { FavoriteEditorSection } from './FavoriteEditorModal';
import { FavoriteRoutePlannerModal } from './FavoriteRoutePlannerModal';
import { TripRouteGeoJSON } from '../../tripPlanner/utils/routeGeoJson';

const NEW_FAVORITE_DRAFT_ID = '__new-favorite__';

interface Props {
    visible: boolean;
    places: FavoritePlace[];
    searchableStops: Stop[];
    currentPin?: { latitude: number; longitude: number } | null;
    currentLocation?: { latitude: number; longitude: number } | null;
    onOpenCentralPlanner?: (place: FavoritePlace) => void;
    onShowRouteOnMap?: (route: TripRouteGeoJSON) => void;
    onSelect: (place: FavoritePlace) => void;
    onUpdate: (favoriteId: string, updates: {
        name?: string;
        latitude: number | null;
        longitude: number | null;
        selectedStopId: string | null;
        selectedStopName: string | null;
        selectedLines: FavoritePlace['selectedLines'];
        defaultCommute?: FavoritePlace['defaultCommute'];
    }) => void | Promise<void>;
    onCreate: (input: {
        name: string;
        latitude: number;
        longitude: number;
        selectedStopId: string | null;
        selectedStopName: string | null;
        selectedLines: FavoritePlace['selectedLines'];
    }) => void | Promise<void>;
    onRemove: (id: string) => void;
    onClose: () => void;
}

export const FavoritesPanel: React.FC<Props> = ({ visible, places, searchableStops, currentPin, currentLocation, onOpenCentralPlanner, onShowRouteOnMap, onSelect, onUpdate, onCreate, onRemove, onClose }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [creatingNewPlace, setCreatingNewPlace] = useState(false);
    const [editingSection, setEditingSection] = useState<FavoriteEditorSection | null>(null);
    const [activeFavoriteId, setActiveFavoriteId] = useState<string | null>(null);
    const [submittingFavoriteId, setSubmittingFavoriteId] = useState<string | null>(null);
    const [editorPrefill, setEditorPrefill] = useState<{
        favoriteId: string;
        latitude?: number | null;
        longitude?: number | null;
        selectedStopId?: string | null;
        selectedStopName?: string | null;
        selectedLines?: FavoritePlace['selectedLines'];
    } | null>(null);

    const editingFavorite = useMemo(() => places.find((place) => place.id === editingId) ?? null, [editingId, places]);
    const draftFavorite = useMemo<FavoritePlace | null>(() => {
        if (!creatingNewPlace) {
            return null;
        }

        return {
            id: NEW_FAVORITE_DRAFT_ID,
            name: 'Ново място',
            latitude: null,
            longitude: null,
            createdAtUnix: Date.now(),
            presetKey: null,
            selectedStopId: null,
            selectedStopName: null,
            selectedLines: [],
            defaultCommute: null,
        };
    }, [creatingNewPlace]);
    const editorFavorite = useMemo(() => {
        const baseFavorite = editingFavorite ?? draftFavorite;
        if (!baseFavorite || !editingFavorite || !editorPrefill || editorPrefill.favoriteId !== editingFavorite.id) {
            return baseFavorite;
        }

        return {
            ...baseFavorite,
            latitude: editorPrefill.latitude === undefined ? baseFavorite.latitude : editorPrefill.latitude,
            longitude: editorPrefill.longitude === undefined ? baseFavorite.longitude : editorPrefill.longitude,
            selectedStopId: editorPrefill.selectedStopId === undefined ? baseFavorite.selectedStopId : editorPrefill.selectedStopId,
            selectedStopName: editorPrefill.selectedStopName === undefined ? baseFavorite.selectedStopName : editorPrefill.selectedStopName,
            selectedLines: editorPrefill.selectedLines === undefined ? baseFavorite.selectedLines : editorPrefill.selectedLines,
        };
    }, [draftFavorite, editingFavorite, editorPrefill]);
    const activeFavorite = useMemo(() => places.find((place) => place.id === activeFavoriteId) ?? places[0] ?? null, [activeFavoriteId, places]);

    useEffect(() => {
        if (!visible) {
            return;
        }

        setActiveFavoriteId((previous) => {
            if (previous && places.some((place) => place.id === previous)) {
                return previous;
            }

            return null;
        });
    }, [places, visible]);

    const onDisableCommuteReminder = async (favorite: FavoritePlace) => {
        if (submittingFavoriteId) {
            return;
        }

        setSubmittingFavoriteId(favorite.id);
        try {
            const result = await cancelFavoriteCommuteReminder(favorite.id);
            Alert.alert(result.ok ? 'Уведомлението е спряно' : 'Неуспешно', result.message);
        } catch {
            Alert.alert('Грешка', 'Неуспешно спиране на уведомлението.');
        } finally {
            setSubmittingFavoriteId(null);
        }
    };

    const openFavoriteEditor = (favoriteId: string, section: FavoriteEditorSection) => {
        setCreatingNewPlace(false);
        setEditingSection(section);
        setEditingId(favoriteId);
    };

    if (!visible) return null;

    return (
        <>
            <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
                <View style={styles.overlay}>
                    <ReminderCenterButton anchorStyle={styles.reminderCenterAnchor} />
                    <View style={styles.panel}>
                        <View style={styles.header}>
                            <View>
                                <Text style={styles.title}>Места</Text>
                                <Text style={styles.subtitle}>Моите места</Text>
                            </View>
                            <View style={styles.headerActions}>
                                <TouchableOpacity
                                    style={styles.addButton}
                                    onPress={() => {
                                        setEditingId(null);
                                        setEditingSection(null);
                                        setCreatingNewPlace(true);
                                    }}
                                >
                                    <Ionicons name="add" size={16} color="#FFFFFF" />
                                    <Text style={styles.addButtonText}>Добави място</Text>
                                </TouchableOpacity>
                                <Pressable style={styles.closeBtn} onPress={onClose}>
                                    <Text style={styles.closeBtnText}>{'×'}</Text>
                                </Pressable>
                            </View>
                        </View>

                        <ScrollView
                            style={styles.list}
                            showsVerticalScrollIndicator={false}
                            nestedScrollEnabled
                            keyboardShouldPersistTaps="handled"
                        >
                            {!places.length && <Text style={styles.empty}>Няма запазени места.</Text>}
                            {places.map((fav) => {
                                const isActive = fav.id === activeFavoriteId;
                                const favoriteEnabledLines = fav.selectedLines.filter((entry) => entry.enabled);
                                const notifyCount = favoriteEnabledLines.filter((entry) => entry.notificationsEnabled).length;
                                const hasCoords = hasFavoriteCoordinates(fav);
                                const hasSavedRoute = !!fav.defaultCommute?.itinerarySummary;
                                const missingLineSetup = !!fav.selectedStopId && !favoriteEnabledLines.length;
                                const hasCommuteReminder = !!fav.defaultCommute?.notificationEnabled && !!fav.defaultCommute?.notificationIds?.length && !!fav.defaultCommute?.reminderTime;

                                return (
                                    <View key={fav.id} style={styles.tabItemWrap}>
                                        <View style={[styles.tabButton, isActive && styles.tabButtonActive]}>
                                            <TouchableOpacity
                                                style={styles.tabButtonMain}
                                                onPress={() => setActiveFavoriteId((previous) => previous === fav.id ? null : fav.id)}
                                            >
                                                <View style={styles.tabButtonTitleRow}>
                                                    <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]} numberOfLines={1}>{fav.name}</Text>
                                                    {hasCommuteReminder ? (
                                                        <View style={styles.reminderBadge}>
                                                            <Ionicons name="notifications" size={11} color="#0F766E" />
                                                            <Text style={styles.reminderBadgeText}>маршрут</Text>
                                                        </View>
                                                    ) : null}
                                                    {fav.presetKey && (
                                                        <View style={styles.badge}>
                                                            <Text style={styles.badgeText}>{fav.presetKey === 'home' ? 'Дом' : 'Работа'}</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <Text style={styles.tabMetaText} numberOfLines={1}>
                                                    {fav.defaultCommute?.routeLabel || (hasCoords ? 'Има зададена локация' : 'Няма зададена локация')}
                                                </Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.routeIconButton, !hasCoords && styles.routeIconButtonDisabled]}
                                                disabled={!hasCoords}
                                                onPress={() => {
                                                    setActiveFavoriteId(fav.id);
                                                    onOpenCentralPlanner?.(fav);
                                                }}
                                            >
                                                <Text style={styles.routeIconText}>🧭</Text>
                                            </TouchableOpacity>
                                        </View>

                                        {isActive && (
                                            <View style={styles.card}>
                                                <View style={styles.cardHeader}>
                                                    <View style={styles.cardHeaderMain}>
                                                        <Text style={styles.rowName}>{fav.name}</Text>
                                                    </View>
                                                    <View style={styles.cardHeaderActions}>
                                                        <TouchableOpacity
                                                            style={styles.collapseBtn}
                                                            onPress={() => setActiveFavoriteId((previous) => previous === fav.id ? null : previous)}
                                                        >
                                                            <Ionicons name="chevron-up" size={16} color="#374151" />
                                                        </TouchableOpacity>
                                                        {!fav.presetKey && (
                                                            <TouchableOpacity style={styles.removeBtn} onPress={() => onRemove(fav.id)}>
                                                                <Text style={styles.removeBtnText}>{'×'}</Text>
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                </View>

                                                <FavoriteRoutePlannerModal
                                                    inline
                                                    targetFavorite={fav}
                                                    currentLocation={currentLocation}
                                                    searchableStops={searchableStops}
                                                    onShowOnMap={onShowRouteOnMap}
                                                    onOpenPlaceEditor={(favoriteId, prefill) => {
                                                        setEditorPrefill(prefill ? { favoriteId, ...prefill } : null);
                                                        openFavoriteEditor(favoriteId, 'location');
                                                    }}
                                                    onClose={() => undefined}
                                                    onSave={async (favoriteId, payload) => {
                                                        await onUpdate(favoriteId, {
                                                            latitude: payload.destinationLatitude,
                                                            longitude: payload.destinationLongitude,
                                                            selectedStopId: payload.selectedStopId ?? fav.selectedStopId ?? null,
                                                            selectedStopName: payload.selectedStopName ?? fav.selectedStopName ?? null,
                                                            selectedLines: payload.selectedLines ?? fav.selectedLines ?? [],
                                                            defaultCommute: payload.commutePlan,
                                                        });
                                                    }}
                                                />

                                                <TouchableOpacity style={styles.summaryBox} onPress={() => openFavoriteEditor(fav.id, 'location')}>
                                                    <View style={styles.summaryHeaderRow}>
                                                        <Text style={styles.summaryLabel}>Локация</Text>
                                                        <Ionicons name="create-outline" size={14} color="#64748B" />
                                                    </View>
                                                    <Text style={styles.summaryValue}>{hasCoords ? `${fav.latitude?.toFixed(5)}, ${fav.longitude?.toFixed(5)}` : 'Не е зададена'}</Text>
                                                    <Text style={styles.summaryEditHint}>Натисни за редакция</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity style={styles.summaryBox} onPress={() => openFavoriteEditor(fav.id, 'stop')}>
                                                    <View style={styles.summaryHeaderRow}>
                                                        <Text style={styles.summaryLabel}>Спирка</Text>
                                                        <Ionicons name="create-outline" size={14} color="#64748B" />
                                                    </View>
                                                    <Text style={styles.summaryValue}>{fav.selectedStopName || 'Не е избрана'}</Text>
                                                    <Text style={styles.summaryEditHint}>Натисни за редакция</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity style={styles.summaryBox} onPress={() => openFavoriteEditor(fav.id, 'lines')}>
                                                    <View style={styles.summaryHeaderRow}>
                                                        <Text style={styles.summaryLabel}>Линии</Text>
                                                        <Ionicons name="create-outline" size={14} color="#64748B" />
                                                    </View>
                                                    <Text style={styles.summaryValue}>{favoriteEnabledLines.length ? favoriteEnabledLines.map((entry) => entry.line).join(', ') : 'Няма избрани линии'}</Text>
                                                    <Text style={styles.summaryEditHint}>Натисни за редакция</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity style={styles.summaryBox} onPress={() => openFavoriteEditor(fav.id, 'lines')}>
                                                    <View style={styles.summaryHeaderRow}>
                                                        <Text style={styles.summaryLabel}>Известия</Text>
                                                        <Ionicons name="create-outline" size={14} color="#64748B" />
                                                    </View>
                                                    <Text style={styles.summaryValue}>{notifyCount ? `${notifyCount} активни по спирки` : 'Няма активни по спирки'}</Text>
                                                    <Text style={styles.summarySubvalue}>{hasCommuteReminder ? 'Маршрутното уведомление е включено за това място.' : 'Няма активно маршрутно уведомление.'}</Text>
                                                    <Text style={styles.summaryEditHint}>Натисни за редакция</Text>
                                                </TouchableOpacity>
                                                {missingLineSetup && (
                                                    <View style={styles.noticeBox}>
                                                        <Text style={styles.noticeTitle}>Линиите още не са настроени</Text>
                                                        <Text style={styles.noticeText}>Избрал си спирка, но още не си маркирал с кои линии пътуваш и за кои искаш известия.</Text>
                                                    </View>
                                                )}

                                                <View style={styles.actionsRow}>
                                                    {hasCommuteReminder ? (
                                                        <TouchableOpacity
                                                            style={[styles.actionButton, styles.stopReminderButton, submittingFavoriteId === fav.id && styles.actionButtonDisabled, !hasCommuteReminder && styles.actionButtonFullWidth]}
                                                            disabled={submittingFavoriteId === fav.id}
                                                            onPress={() => void onDisableCommuteReminder(fav)}
                                                        >
                                                            <Text style={styles.actionButtonText}>Спри известието</Text>
                                                        </TouchableOpacity>
                                                    ) : null}
                                                </View>

                                                <View style={styles.actionsRow}>
                                                    <TouchableOpacity
                                                        style={[styles.actionButton, !hasCoords && styles.actionButtonDisabled]}
                                                        disabled={!hasCoords}
                                                        onPress={() => onSelect(fav)}
                                                    >
                                                        <Text style={styles.actionButtonText}>Отвори на карта</Text>
                                                    </TouchableOpacity>
                                                </View>

                                                <TouchableOpacity
                                                    style={styles.renameButton}
                                                    onPress={() => openFavoriteEditor(fav.id, 'name')}
                                                >
                                                    <Text style={styles.renameButtonText}>Преименувай и редактирай мястото</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <FavoriteEditorModal
                visible={!!editorFavorite}
                favorite={editorFavorite}
                isDraft={creatingNewPlace}
                initialSection={editingSection}
                searchableStops={searchableStops}
                currentPin={currentPin}
                currentLocation={currentLocation}
                onClose={() => {
                    setEditingId(null);
                    setCreatingNewPlace(false);
                    setEditingSection(null);
                    setEditorPrefill(null);
                }}
                onConfigureRoute={async (favoriteId, updates) => {
                    await onUpdate(favoriteId, updates);
                    setActiveFavoriteId(favoriteId);
                }}
                onSave={async (favoriteId, updates) => {
                    if (creatingNewPlace) {
                        if (updates.latitude == null || updates.longitude == null) {
                            return;
                        }

                        await onCreate({
                            name: updates.name?.trim() || 'Ново място',
                            latitude: updates.latitude,
                            longitude: updates.longitude,
                            selectedStopId: updates.selectedStopId,
                            selectedStopName: updates.selectedStopName,
                            selectedLines: updates.selectedLines,
                        });
                        setCreatingNewPlace(false);
                        setEditingSection(null);
                        setActiveFavoriteId(null);
                        setEditorPrefill(null);
                        return;
                    }

                    await onUpdate(favoriteId, updates);
                    setEditingSection(null);
                    setEditorPrefill(null);
                }}
            />

        </>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.35)', justifyContent: 'flex-start', paddingTop: 28, paddingHorizontal: 12 },
    reminderCenterAnchor: {
        top: 42,
        right: 20,
        zIndex: 0,
        elevation: 0,
    },
    panel: {
        backgroundColor: 'rgba(255,255,255,0.98)', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB',
        padding: 12, maxHeight: '88%',
        zIndex: 5,
        elevation: 5,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { color: '#111827', fontSize: 15, fontWeight: '700' },
    subtitle: { color: '#6B7280', fontSize: 12, marginTop: 2 },
    addButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0F766E', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
    addButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
    closeBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
    closeBtnText: { color: '#374151', fontSize: 14, fontWeight: '700' },
    tabItemWrap: { marginBottom: 10 },
    tabButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 14, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
    tabButtonMain: { flex: 1 },
    tabButtonTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tabButtonActive: { backgroundColor: '#DBEAFE', borderColor: '#93C5FD' },
    tabButtonText: { color: '#374151', fontSize: 13, fontWeight: '700', flexShrink: 1 },
    tabButtonTextActive: { color: '#1D4ED8' },
    reminderBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#CCFBF1', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
    reminderBadgeText: { color: '#0F766E', fontSize: 10, fontWeight: '700' },
    tabMetaText: { color: '#64748B', fontSize: 11, marginTop: 4 },
    routeIconButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#93C5FD' },
    routeIconButtonDisabled: { backgroundColor: '#E2E8F0', borderColor: '#CBD5E1' },
    routeIconText: { fontSize: 14 },
    list: { maxHeight: 560 },
    empty: { color: '#6B7280', fontSize: 12, lineHeight: 16, paddingVertical: 8 },
    card: { marginTop: 8, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E5E7EB' },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    cardHeaderMain: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
    cardHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    badge: { backgroundColor: '#DBEAFE', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
    badgeText: { color: '#1D4ED8', fontSize: 10, fontWeight: '700' },
    rowName: { color: '#111827', fontSize: 15, fontWeight: '700', flexShrink: 1 },
    collapseBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
    summaryBox: { backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 10, paddingVertical: 9, marginTop: 8 },
    summaryHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    summaryLabel: { color: '#6B7280', fontSize: 11, fontWeight: '600', marginBottom: 2 },
    summaryValue: { color: '#111827', fontSize: 12, fontWeight: '700' },
    summarySubvalue: { color: '#475569', fontSize: 11, marginTop: 4, lineHeight: 16 },
    summaryEditHint: { color: '#64748B', fontSize: 10, fontWeight: '600', marginTop: 6 },
    routeReminderRow: { marginTop: 8, flexDirection: 'row' },
    routeReminderPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
    routeReminderPillActive: { backgroundColor: '#ECFDF5', borderColor: '#99F6E4' },
    routeReminderPillInactive: { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
    routeReminderPillText: { fontSize: 11, fontWeight: '700' },
    routeReminderPillTextActive: { color: '#0F766E' },
    routeReminderPillTextInactive: { color: '#64748B' },
    noticeBox: { marginTop: 10, backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#FCD34D' },
    noticeTitle: { color: '#92400E', fontSize: 12, fontWeight: '700', marginBottom: 2 },
    noticeText: { color: '#92400E', fontSize: 11, lineHeight: 16 },
    actionsRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'stretch' },
    actionButton: { flex: 1, minHeight: 44, backgroundColor: '#1D4ED8', borderRadius: 10, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
    actionButtonFullWidth: { flex: 1 },
    actionButtonSecondary: { backgroundColor: '#0F766E' },
    routeSettingsButton: { backgroundColor: '#7C3AED' },
    stopReminderButton: { backgroundColor: '#B91C1C' },
    actionButtonDisabled: { backgroundColor: '#93C5FD' },
    actionButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', textAlign: 'center', includeFontPadding: false },
    renameButton: { marginTop: 8, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE' },
    renameButtonText: { color: '#3730A3', fontSize: 12, fontWeight: '700' },
    removeBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEE2E2' },
    removeBtnText: { color: '#B91C1C', fontSize: 14, fontWeight: '700' },
});
