import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, TouchableOpacity, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FavoritePlace, cancelFavoriteCommuteReminder, formatFavoriteCommuteWeekdays, hasFavoriteCoordinates, updateFavoriteCommuteReminderSettings } from '../../../services/places';
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
        personalNotificationLeadMinutes?: number | null;
        defaultCommute?: FavoritePlace['defaultCommute'];
    }) => void | Promise<void>;
    onCreate: (input: {
        name: string;
        latitude: number;
        longitude: number;
        selectedStopId: string | null;
        selectedStopName: string | null;
        selectedLines: FavoritePlace['selectedLines'];
        personalNotificationLeadMinutes?: number | null;
    }) => FavoritePlace[] | void | Promise<FavoritePlace[] | void>;
    onReorder: (favoriteIds: string[]) => void | Promise<void>;
    onRemove: (id: string) => void;
    onClose: () => void;
}

export const FavoritesPanel: React.FC<Props> = ({ visible, places, searchableStops, currentPin, currentLocation, onOpenCentralPlanner, onShowRouteOnMap, onSelect, onUpdate, onCreate, onReorder, onRemove, onClose }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [creatingNewPlace, setCreatingNewPlace] = useState(false);
    const [editingSection, setEditingSection] = useState<FavoriteEditorSection | null>(null);
    const [activeFavoriteId, setActiveFavoriteId] = useState<string | null>(null);
    const [activeRouteLineTabIds, setActiveRouteLineTabIds] = useState<Record<string, string | null>>({});
    const [routePlannerFavoriteId, setRoutePlannerFavoriteId] = useState<string | null>(null);
    const [routePlannerOpenBuilder, setRoutePlannerOpenBuilder] = useState(false);
    const [submittingFavoriteId, setSubmittingFavoriteId] = useState<string | null>(null);
    const [orderedPlaces, setOrderedPlaces] = useState<FavoritePlace[]>(places);
    const [editorPrefill, setEditorPrefill] = useState<{
        favoriteId: string;
        latitude?: number | null;
        longitude?: number | null;
        selectedStopId?: string | null;
        selectedStopName?: string | null;
        selectedLines?: FavoritePlace['selectedLines'];
    } | null>(null);

    const editingFavorite = useMemo(() => orderedPlaces.find((place) => place.id === editingId) ?? null, [editingId, orderedPlaces]);
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
            personalNotificationLeadMinutes: 5,
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
    const searchableStopsLookup = useMemo(() => {
        const byCode = new Map<string, Stop[]>();
        const byName = new Map<string, Stop[]>();

        searchableStops.forEach((stop) => {
            const normalizedName = stop.name.trim().toLowerCase();
            if (normalizedName) {
                byName.set(normalizedName, [...(byName.get(normalizedName) || []), stop]);
            }

            String(stop.id || '')
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean)
                .forEach((code) => {
                    byCode.set(code, [...(byCode.get(code) || []), stop]);
                });
        });

        return { byCode, byName };
    }, [searchableStops]);
    const activeFavorite = useMemo(() => orderedPlaces.find((place) => place.id === activeFavoriteId) ?? orderedPlaces[0] ?? null, [activeFavoriteId, orderedPlaces]);
    const routePlannerFavorite = useMemo(() => orderedPlaces.find((place) => place.id === routePlannerFavoriteId) ?? null, [orderedPlaces, routePlannerFavoriteId]);

    const moveFavorite = useCallback((id: string, direction: -1 | 1) => {
        setOrderedPlaces((current) => {
            const index = current.findIndex((place) => place.id === id);
            if (index < 0) return current;
            const targetIndex = index + direction;
            if (targetIndex < 0 || targetIndex >= current.length) return current;
            const next = [...current];
            [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
            void Promise.resolve(onReorder(next.map((place) => place.id))).catch(() => {
                setOrderedPlaces(places);
            });
            return next;
        });
    }, [onReorder, places]);

    useEffect(() => {
        setOrderedPlaces(places);
    }, [places]);

    useEffect(() => {
        if (!visible) {
            return;
        }

        setActiveFavoriteId((previous) => {
            if (previous && orderedPlaces.some((place) => place.id === previous)) {
                return previous;
            }

            return null;
        });
    }, [orderedPlaces, visible]);

    useEffect(() => {
        if (routePlannerFavoriteId && !orderedPlaces.some((place) => place.id === routePlannerFavoriteId)) {
            setRoutePlannerFavoriteId(null);
            setRoutePlannerOpenBuilder(false);
        }
    }, [orderedPlaces, routePlannerFavoriteId]);

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

    const openFavoriteEditor = (favoriteId: string, section: FavoriteEditorSection | null) => {
        setCreatingNewPlace(false);
        setEditingSection(section);
        setEditingId(favoriteId);
    };

    const openRoutePlanner = (favorite: FavoritePlace, openBuilder = false) => {
        if (!hasFavoriteCoordinates(favorite)) {
            openFavoriteEditor(favorite.id, 'location');
            return;
        }

        setActiveFavoriteId(favorite.id);
        setRoutePlannerOpenBuilder(openBuilder);
        setRoutePlannerFavoriteId(favorite.id);
    };

    const confirmRemoveFavorite = (favorite: FavoritePlace) => {
        Alert.alert(
            favorite.presetKey ? 'Изтриване на място по подразбиране' : 'Изтриване на място',
            `Сигурен ли си, че искаш да изтриеш ${favorite.name}?`,
            [
                { text: 'Отказ', style: 'cancel' },
                { text: 'Изтрий', style: 'destructive', onPress: () => onRemove(favorite.id) },
            ],
        );
    };

    const findCreatedFavorite = (favoriteList: FavoritePlace[] | undefined, latitude: number, longitude: number, name: string) => {
        if (!favoriteList?.length) {
            return null;
        }

        return favoriteList.find((place) => (
            place.latitude === latitude
            && place.longitude === longitude
            && place.name === name.trim()
        )) || null;
    };

    if (!visible) return null;

    return (
        <>
            <Pressable style={styles.overlay} onPress={onClose}>
                <ReminderCenterButton anchorStyle={styles.reminderCenterAnchor} />
                <View style={styles.panel} onStartShouldSetResponder={() => true}>
                        <View style={styles.header}>
                            <View>
                                <Text style={styles.title}>Моите места</Text>
                                
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
                                    <Ionicons name="close" size={16} color="#334155" />
                                </Pressable>
                            </View>
                        </View>

                        <FlatList
                            data={orderedPlaces}
                            keyExtractor={(item) => item.id}
                            style={styles.list}
                            contentContainerStyle={orderedPlaces.length ? styles.listContent : styles.listEmptyContent}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            ListEmptyComponent={<Text style={styles.empty}>Няма запазени места.</Text>}
                            renderItem={({ item: fav, index }) => {
                                const isExpanded = fav.id === activeFavoriteId;
                                const favoriteEnabledLines = fav.selectedLines.filter((entry) => entry.enabled);
                                const notifyCount = favoriteEnabledLines.filter((entry) => entry.notificationsEnabled).length;
                                const hasCoords = hasFavoriteCoordinates(fav);
                                const missingLineSetup = !!fav.selectedStopId && !favoriteEnabledLines.length;
                                const hasCommuteReminder = !!fav.defaultCommute?.notificationEnabled && !!fav.defaultCommute?.notificationIds?.length && !!fav.defaultCommute?.reminderTime;
                                const routeSummary = fav.defaultCommute?.itinerarySummary || 'Няма запазен маршрут';
                                const hasSavedRouteGeometry = !!fav.defaultCommute?.routeGeoJson?.features?.length;
                                const routeLineTabs = fav.defaultCommute?.routeLineTabs || [];
                                const fallbackRouteLineTabs = Array.from(new Set(
                                    (fav.defaultCommute?.transportLabels?.length
                                        ? fav.defaultCommute.transportLabels
                                        : favoriteEnabledLines.map((entry) => entry.line))
                                        .map((entry) => String(entry || '').trim())
                                        .filter(Boolean),
                                )).map((label, index) => ({
                                    id: `fallback-${fav.id}-${index}`,
                                    line: label,
                                    label,
                                    mode: '',
                                    stops: [],
                                }));
                                const displayRouteLineTabs = routeLineTabs.length ? routeLineTabs : fallbackRouteLineTabs;
                                const activeRouteLineTabId = activeRouteLineTabIds[fav.id] && displayRouteLineTabs.some((tab) => tab.id === activeRouteLineTabIds[fav.id])
                                    ? activeRouteLineTabIds[fav.id]
                                    : null;
                                const activeRouteLineTab = displayRouteLineTabs.find((tab) => tab.id === activeRouteLineTabId) || null;
                                const activeRouteLineToken = String(activeRouteLineTab?.line || '').trim().toUpperCase();
                                const fallbackRouteStops = (fav.defaultCommute?.routeGeoJson?.transitStops || []).map((stop) => ({
                                    name: String(stop?.name || '').trim(),
                                    stopCode: stop?.stopCode ? String(stop.stopCode).trim() : null,
                                    time: null,
                                })).filter((stop) => stop.name);
                                const filteredFallbackRouteStops = activeRouteLineToken
                                    ? fallbackRouteStops.filter((stop) => {
                                        const normalizedName = stop.name.trim().toLowerCase();
                                        const candidates = [
                                            ...(stop.stopCode ? (searchableStopsLookup.byCode.get(stop.stopCode) || []) : []),
                                            ...(normalizedName ? (searchableStopsLookup.byName.get(normalizedName) || []) : []),
                                        ];

                                        return candidates.some((candidate) => candidate.lines.some((line) => String(line || '').trim().toUpperCase() === activeRouteLineToken));
                                    })
                                    : fallbackRouteStops;
                                const hasExplicitRouteLineStops = routeLineTabs.some((tab) => tab.stops?.length);
                                const usingFallbackRouteStops = !!activeRouteLineTab && !activeRouteLineTab.stops?.length && filteredFallbackRouteStops.length > 0;
                                const activeRouteStops = activeRouteLineTab?.stops?.length
                                    ? activeRouteLineTab.stops
                                    : (activeRouteLineTab ? filteredFallbackRouteStops : []);
                                const reminderSummary = hasCommuteReminder
                                    ? `${formatFavoriteCommuteWeekdays(fav.defaultCommute?.notificationWeekdays || [])} • ${fav.defaultCommute?.reminderTime}${notifyCount ? ` • ${notifyCount} активни по спирки` : ''}`
                                    : (notifyCount ? `${notifyCount} активни по спирки` : 'Известието е изключено');

                                const isFirst = index === 0;
                                const isLast = index === orderedPlaces.length - 1;

                                return (
                                    <View style={styles.tabItemWrap}>
                                        <View style={[styles.tabButton, isExpanded && styles.tabButtonActive]}>
                                            <TouchableOpacity
                                                style={styles.tabButtonMain}
                                                onPress={() => setActiveFavoriteId((previous) => previous === fav.id ? null : fav.id)}
                                            >
                                                <View style={styles.tabButtonTitleRow}>
                                                    <Text style={[styles.tabButtonText, isExpanded && styles.tabButtonTextActive]} numberOfLines={1}>{fav.name}</Text>
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
                                            {orderedPlaces.length > 1 && (
                                                <View style={styles.reorderButtons}>
                                                    <TouchableOpacity
                                                        style={[styles.reorderBtn, isFirst && styles.reorderBtnDisabled]}
                                                        disabled={isFirst}
                                                        onPress={() => moveFavorite(fav.id, -1)}
                                                    >
                                                        <Ionicons name="chevron-up" size={14} color={isFirst ? '#CBD5E1' : '#475569'} />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[styles.reorderBtn, isLast && styles.reorderBtnDisabled]}
                                                        disabled={isLast}
                                                        onPress={() => moveFavorite(fav.id, 1)}
                                                    >
                                                        <Ionicons name="chevron-down" size={14} color={isLast ? '#CBD5E1' : '#475569'} />
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                            <TouchableOpacity
                                                style={[styles.routeIconButton, !hasCoords && styles.routeIconButtonDisabled]}
                                                disabled={!hasCoords}
                                                onPress={() => openRoutePlanner(fav)}
                                            >
                                                <Ionicons name="navigate-outline" size={15} color={hasCoords ? '#1D4ED8' : '#94A3B8'} />
                                            </TouchableOpacity>
                                        </View>

                                        {isExpanded && (
                                            <View style={styles.card}>
                                                <View style={styles.cardHeader}>
                                                    <View style={styles.cardHeaderMain}>
                                                        <Text style={styles.rowName}>{fav.name}</Text>
                                                    </View>
                                                    <View style={styles.cardHeaderActions}>
                                                        <TouchableOpacity style={styles.removeBtn} onPress={() => confirmRemoveFavorite(fav)}>
                                                        <Ionicons name="close" size={14} color="#B91C1C" />
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>

                                                <View style={styles.overviewCard}>
                                                    <View style={styles.overviewRow}>
                                                        <Text style={styles.overviewLabel}>Локация</Text>
                                                        <Text style={styles.overviewValue}>{hasCoords ? `${fav.latitude?.toFixed(5)}, ${fav.longitude?.toFixed(5)}` : 'Не е зададена'}</Text>
                                                    </View>
                                                    <View style={styles.overviewRow}>
                                                        <Text style={styles.overviewLabel}>Линии</Text>
                                                        {displayRouteLineTabs.length ? (
                                                            <View style={styles.lineTabsRow}>
                                                                {displayRouteLineTabs.map((tab) => {
                                                                    const isTabActive = tab.id === activeRouteLineTabId;
                                                                    return (
                                                                        <TouchableOpacity
                                                                            key={`${fav.id}-${tab.id}`}
                                                                            style={[styles.lineTabChip, isTabActive && styles.lineTabChipActive]}
                                                                            onPress={() => setActiveRouteLineTabIds((previous) => ({
                                                                                ...previous,
                                                                                [fav.id]: previous[fav.id] === tab.id ? null : tab.id,
                                                                            }))}
                                                                        >
                                                                            <Text style={[styles.lineTabChipText, isTabActive && styles.lineTabChipTextActive]}>{tab.line}</Text>
                                                                            <Ionicons name={isTabActive ? 'chevron-up' : 'chevron-down'} size={12} color={isTabActive ? '#1D4ED8' : '#374151'} />
                                                                        </TouchableOpacity>
                                                                    );
                                                                })}
                                                            </View>
                                                        ) : (
                                                            <Text style={styles.overviewValue}>{favoriteEnabledLines.length ? favoriteEnabledLines.map((entry) => entry.line).join(', ') : 'Няма избрани линии'}</Text>
                                                        )}
                                                    </View>
                                                    {activeRouteLineTab ? (
                                                    <View style={styles.overviewRow}>
                                                        <Text style={styles.overviewLabel}>Спирка и линии</Text>
                                                        <Text style={styles.overviewValue}>{activeRouteLineTab.label}</Text>
                                                        {activeRouteStops.length ? (
                                                            <View style={styles.routeStopsList}>
                                                                {activeRouteStops.map((stop, index) => (
                                                                    <View key={`${fav.id}-${activeRouteLineTab.id}-stop-${index}`} style={styles.routeStopRow}>
                                                                        <Text style={styles.routeStopIndex}>{`${index + 1}.`}</Text>
                                                                        <View style={styles.routeStopContent}>
                                                                            <Text style={styles.routeStopName}>{stop.name}</Text>
                                                                            {(stop.stopCode || stop.time) ? (
                                                                                <Text style={styles.routeStopMeta}>
                                                                                    {[stop.stopCode, stop.time].filter(Boolean).join(' • ')}
                                                                                </Text>
                                                                            ) : null}
                                                                        </View>
                                                                    </View>
                                                                ))}
                                                            </View>
                                                        ) : (
                                                            <Text style={styles.overviewMeta}>
                                                                {usingFallbackRouteStops && displayRouteLineTabs.length > 1 && !hasExplicitRouteLineStops
                                                                    ? 'Показан е общият списък спирки за маршрута. Запази маршрута наново, за да се разделят точно по линии.'
                                                                    : usingFallbackRouteStops
                                                                        ? 'Показани са спирките от запазения маршрут.'
                                                                        : 'Няма запазени спирки за тази линия.'}
                                                            </Text>
                                                        )}
                                                    </View>
                                                    ) : null}
                                                    <View style={styles.overviewRow}>
                                                        <Text style={styles.overviewLabel}>Маршрут и известие</Text>
                                                        <Text style={styles.overviewValue}>{routeSummary}</Text>
                                                        <Text style={styles.overviewMeta}>{reminderSummary}</Text>
                                                    </View>
                                                </View>
                                                {missingLineSetup && (
                                                    <View style={styles.noticeBox}>
                                                        <Text style={styles.noticeTitle}>Линиите още не са настроени</Text>
                                                        <Text style={styles.noticeText}>Избрал си спирка, но още не си маркирал с кои линии пътуваш и за кои искаш известия.</Text>
                                                    </View>
                                                )}

                                                {!fav.defaultCommute?.itinerarySummary ? (
                                                    <View style={styles.actionsRow}>
                                                        <TouchableOpacity
                                                            style={[styles.actionButton, styles.routeSettingsButton]}
                                                            onPress={() => openRoutePlanner(fav)}
                                                        >
                                                            <Text style={styles.actionButtonText}>Създай маршрут</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                ) : null}

                                                {hasSavedRouteGeometry ? (
                                                    <View style={styles.actionsRow}>
                                                        <TouchableOpacity
                                                            style={[styles.actionButton, styles.routeSettingsButton]}
                                                            onPress={() => onShowRouteOnMap?.(fav.defaultCommute!.routeGeoJson!)}
                                                        >
                                                            <Text style={styles.actionButtonText}>Покажи маршрута</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                ) : null}

                                                <View style={styles.actionsRow}>
                                                    <TouchableOpacity
                                                        style={[styles.actionButton, styles.actionButtonSecondary]}
                                                        onPress={() => openFavoriteEditor(fav.id, null)}
                                                    >
                                                        <Text style={styles.actionButtonText}>Редакция</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[styles.actionButton, !hasCoords && styles.actionButtonDisabled]}
                                                        disabled={!hasCoords}
                                                        onPress={() => onSelect(fav)}
                                                    >
                                                        <Text style={styles.actionButtonText}>Покажи локацията</Text>
                                                    </TouchableOpacity>
                                                </View>

                                                <TouchableOpacity
                                                    style={styles.renameButton}
                                                    onPress={() => confirmRemoveFavorite(fav)}
                                                >
                                                    <Text style={styles.renameButtonText}>{fav.presetKey ? 'Изтрий мястото по подразбиране' : 'Изтрий мястото'}</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                );
                            }}
                        />
                </View>
            </Pressable>

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
                    setRoutePlannerOpenBuilder(true);
                    setRoutePlannerFavoriteId(favoriteId);
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
                            personalNotificationLeadMinutes: updates.personalNotificationLeadMinutes,
                        });
                        setCreatingNewPlace(false);
                        setEditingSection(null);
                        setActiveFavoriteId(null);
                        setEditorPrefill(null);
                        return;
                    }

                    await onUpdate(favoriteId, updates);
                    const existingFavorite = orderedPlaces.find((place) => place.id === favoriteId) ?? null;
                    if (
                        existingFavorite?.defaultCommute?.itinerarySummary
                        && updates.personalNotificationLeadMinutes != null
                        && updates.personalNotificationLeadMinutes !== existingFavorite.personalNotificationLeadMinutes
                    ) {
                        await updateFavoriteCommuteReminderSettings(favoriteId, { reminderOffsetMinutes: updates.personalNotificationLeadMinutes });
                    }
                    setEditingSection(null);
                    setEditorPrefill(null);
                }}
                onCreateAndConfigureRoute={async (updates) => {
                    if (!creatingNewPlace || updates.latitude == null || updates.longitude == null) {
                        return;
                    }

                    const favoriteName = updates.name?.trim() || 'Ново място';
                    const nextFavorites = await onCreate({
                        name: favoriteName,
                        latitude: updates.latitude,
                        longitude: updates.longitude,
                        selectedStopId: updates.selectedStopId,
                        selectedStopName: updates.selectedStopName,
                        selectedLines: updates.selectedLines,
                        personalNotificationLeadMinutes: updates.personalNotificationLeadMinutes,
                    });
                    const createdFavorite = findCreatedFavorite(nextFavorites as FavoritePlace[] | undefined, updates.latitude, updates.longitude, favoriteName);
                    const fallbackFavoriteId = createdFavorite?.id
                        || orderedPlaces.find((place) => place.latitude === updates.latitude && place.longitude === updates.longitude && place.name === favoriteName)?.id
                        || null;

                    setCreatingNewPlace(false);
                    setEditingSection(null);
                    setEditorPrefill(null);
                    setEditingId(null);

                    if (fallbackFavoriteId) {
                        setActiveFavoriteId(fallbackFavoriteId);
                        setRoutePlannerOpenBuilder(true);
                        setRoutePlannerFavoriteId(fallbackFavoriteId);
                    }
                }}
                onUpdateRouteNotificationSettings={async (favoriteId, updates) => updateFavoriteCommuteReminderSettings(favoriteId, updates)}
                onRemoveSavedRoute={async (favoriteId) => {
                    const favorite = orderedPlaces.find((place) => place.id === favoriteId);
                    if (!favorite) {
                        return;
                    }

                    const clearedFavorite: FavoritePlace = {
                        ...favorite,
                        selectedStopId: null,
                        selectedStopName: null,
                        selectedLines: [],
                        personalNotificationLeadMinutes: 5,
                        defaultCommute: null,
                    };

                    setOrderedPlaces((current) => current.map((place) => (
                        place.id === favoriteId ? clearedFavorite : place
                    )));
                    setEditingSection(null);
                    setEditorPrefill(null);
                    setRoutePlannerOpenBuilder(false);
                    setRoutePlannerFavoriteId(null);
                    setActiveRouteLineTabIds((previous) => ({
                        ...previous,
                        [favoriteId]: null,
                    }));

                    try {
                        await onUpdate(favoriteId, {
                            name: favorite.name,
                            latitude: favorite.latitude,
                            longitude: favorite.longitude,
                            selectedStopId: null,
                            selectedStopName: null,
                            selectedLines: [],
                            personalNotificationLeadMinutes: 5,
                            defaultCommute: null,
                        });
                    } catch (error) {
                        setOrderedPlaces((current) => current.map((place) => (
                            place.id === favoriteId ? favorite : place
                        )));
                        throw error;
                    }
                }}
            />

            <FavoriteRoutePlannerModal
                visible={!!routePlannerFavorite}
                targetFavorite={routePlannerFavorite}
                openBuilderByDefault={routePlannerOpenBuilder}
                currentLocation={currentLocation}
                searchableStops={searchableStops}
                onShowOnMap={(route) => {
                    onShowRouteOnMap?.(route);
                    setRoutePlannerOpenBuilder(false);
                    setRoutePlannerFavoriteId(null);
                }}
                onOpenPlaceEditor={(favoriteId, prefill) => {
                    setRoutePlannerOpenBuilder(false);
                    setRoutePlannerFavoriteId(null);
                    setEditorPrefill(prefill ? { favoriteId, ...prefill } : null);
                    openFavoriteEditor(favoriteId, 'location');
                }}
                onClose={() => {
                    setRoutePlannerOpenBuilder(false);
                    setRoutePlannerFavoriteId(null);
                }}
                onSave={async (favoriteId, payload) => {
                    await onUpdate(favoriteId, {
                        latitude: payload.destinationLatitude,
                        longitude: payload.destinationLongitude,
                        selectedStopId: payload.selectedStopId ?? routePlannerFavorite?.selectedStopId ?? null,
                        selectedStopName: payload.selectedStopName ?? routePlannerFavorite?.selectedStopName ?? null,
                        selectedLines: payload.selectedLines ?? routePlannerFavorite?.selectedLines ?? [],
                        personalNotificationLeadMinutes: payload.personalNotificationLeadMinutes ?? routePlannerFavorite?.personalNotificationLeadMinutes ?? 5,
                        defaultCommute: payload.commutePlan,
                    });
                    setRoutePlannerOpenBuilder(false);
                    setRoutePlannerFavoriteId(null);
                    setActiveFavoriteId(favoriteId);
                }}
            />

        </>
    );
};

const styles = StyleSheet.create({
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.18)', justifyContent: 'flex-start', paddingTop: 78, paddingHorizontal: 12, zIndex: 50 },
    reminderCenterAnchor: {
        top: 42,
        right: 20,
        zIndex: 0,
        elevation: 0,
    },
    panel: {
        backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)',
        padding: 14, maxHeight: '88%',
        zIndex: 5,
        elevation: 5,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 28,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(226,232,240,0.72)', marginBottom: 10 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { color: '#0F172A', fontSize: 16, fontWeight: '700' },
    subtitle: { color: '#475569', fontSize: 12, marginTop: 2 },
    addButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#0F766E', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
    addButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
    closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(248,250,252,0.72)', borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    closeBtnText: { color: '#334155', fontSize: 14, fontWeight: '700' },
    tabItemWrap: { marginBottom: 8 },
    tabButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(248,250,252,0.72)', borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    tabButtonMain: { flex: 1 },
    tabButtonTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tabButtonActive: { backgroundColor: 'rgba(219,234,254,0.72)', borderColor: 'rgba(147,197,253,0.72)' },
    reorderButtons: { flexDirection: 'column', justifyContent: 'center', alignItems: 'center', marginRight: 2 },
    reorderBtn: { width: 26, height: 20, alignItems: 'center', justifyContent: 'center' },
    reorderBtnDisabled: { opacity: 0.4 },
    tabButtonText: { color: '#334155', fontSize: 13, fontWeight: '700', flexShrink: 1 },
    tabButtonTextActive: { color: '#1D4ED8' },
    reminderBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(204,251,241,0.72)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
    reminderBadgeText: { color: '#0F766E', fontSize: 10, fontWeight: '700' },
    tabMetaText: { color: '#64748B', fontSize: 11, marginTop: 4 },

    routeIconButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(219,234,254,0.72)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(147,197,253,0.72)' },
    routeIconButtonDisabled: { backgroundColor: 'rgba(226,232,240,0.52)', borderColor: 'rgba(203,213,225,0.52)' },
    routeIconText: { fontSize: 14 },
    list: { maxHeight: 560 },
    listContent: { paddingBottom: 4 },
    listEmptyContent: { paddingBottom: 4, minHeight: 80 },
    empty: { color: '#64748B', fontSize: 12, lineHeight: 16, paddingVertical: 8 },
    card: { marginTop: 8, backgroundColor: 'rgba(255,255,255,0.74)', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    cardHeaderMain: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
    cardHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    badge: { backgroundColor: 'rgba(219,234,254,0.72)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
    badgeText: { color: '#1D4ED8', fontSize: 10, fontWeight: '700' },
    rowName: { color: '#0F172A', fontSize: 15, fontWeight: '700', flexShrink: 1 },
    overviewCard: { backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', paddingHorizontal: 10, paddingVertical: 8, marginTop: 8, gap: 8 },
    overviewRow: { gap: 3 },
    overviewLabel: { color: '#64748B', fontSize: 11, fontWeight: '600' },
    overviewValue: { color: '#0F172A', fontSize: 12, fontWeight: '700', lineHeight: 17 },
    overviewMeta: { color: '#64748B', fontSize: 11, lineHeight: 16 },
    lineTabsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    lineTabChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(248,250,252,0.72)', borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    lineTabChipActive: { backgroundColor: 'rgba(219,234,254,0.72)', borderColor: 'rgba(147,197,253,0.72)' },
    lineTabChipText: { color: '#334155', fontSize: 11, fontWeight: '700' },
    lineTabChipTextActive: { color: '#1D4ED8' },
    routeStopsList: { gap: 6, marginTop: 2 },
    routeStopRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    routeStopIndex: { color: '#64748B', fontSize: 11, fontWeight: '700', lineHeight: 16, width: 16 },
    routeStopContent: { flex: 1, gap: 1 },
    routeStopName: { color: '#0F172A', fontSize: 12, fontWeight: '700', lineHeight: 16 },
    routeStopMeta: { color: '#64748B', fontSize: 11, lineHeight: 15 },
    noticeBox: { marginTop: 10, backgroundColor: 'rgba(254,243,199,0.82)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(252,211,77,0.72)' },
    noticeTitle: { color: '#92400E', fontSize: 12, fontWeight: '700', marginBottom: 2 },
    noticeText: { color: '#92400E', fontSize: 11, lineHeight: 16 },
    actionsRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'stretch' },
    actionButton: { flex: 1, minHeight: 44, backgroundColor: '#1D4ED8', borderRadius: 10, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
    actionButtonSecondary: { backgroundColor: '#0F766E' },
    routeSettingsButton: { backgroundColor: '#7C3AED' },
    actionButtonDisabled: { backgroundColor: '#93C5FD' },
    actionButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', textAlign: 'center', includeFontPadding: false },
    renameButton: { marginTop: 8, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: 'rgba(254,226,226,0.72)', borderWidth: 1, borderColor: 'rgba(254,202,202,0.72)' },
    renameButtonText: { color: '#B91C1C', fontSize: 12, fontWeight: '700' },
    removeBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(254,226,226,0.72)' },
    removeBtnText: { color: '#B91C1C', fontSize: 14, fontWeight: '700' },
});
