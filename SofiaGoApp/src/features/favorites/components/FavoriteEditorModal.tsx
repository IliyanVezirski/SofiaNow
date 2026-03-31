import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatFavoriteCommuteWeekdays, getFavoriteCommuteNotificationShiftLabel } from '../../../services/places/commute';
import { getFavoritePresetLabel, hasFavoriteCoordinates } from '../../../services/places/normalization';
import { searchLocations } from '../../../services/places/search';
import type { FavoriteLinePreference, FavoritePlace, PlaceSearchResult } from '../../../services/places/types';
import { Stop, summarizeStopDirections } from '../../../services/stopsApi';

export type FavoriteEditorSection = 'name' | 'location';

interface Props {
    visible: boolean;
    favorite: FavoritePlace | null;
    isDraft?: boolean;
    initialSection?: FavoriteEditorSection | null;
    locationOnly?: boolean;
    searchableStops: Stop[];
    currentPin?: { latitude: number; longitude: number } | null;
    currentLocation?: { latitude: number; longitude: number } | null;
    onClose: () => void;
    onConfigureRoute: (favoriteId: string, updates: {
        name?: string;
        latitude: number | null;
        longitude: number | null;
        selectedStopId: string | null;
        selectedStopName: string | null;
        selectedLines: FavoriteLinePreference[];
        personalNotificationLeadMinutes?: number | null;
    }) => void | Promise<void>;
    onSave: (favoriteId: string, updates: {
        name?: string;
        latitude: number | null;
        longitude: number | null;
        selectedStopId: string | null;
        selectedStopName: string | null;
        selectedLines: FavoriteLinePreference[];
        personalNotificationLeadMinutes?: number | null;
    }) => void | Promise<void>;
    onCreateAndConfigureRoute?: (updates: {
        name?: string;
        latitude: number | null;
        longitude: number | null;
        selectedStopId: string | null;
        selectedStopName: string | null;
        selectedLines: FavoriteLinePreference[];
        personalNotificationLeadMinutes?: number | null;
    }) => void | Promise<void>;
    onUpdateRouteNotificationSettings?: (favoriteId: string, updates: { enabled?: boolean; reminderOffsetMinutes?: number }) => Promise<{ ok: boolean; message: string }> | { ok: boolean; message: string };
    onRemoveSavedRoute?: (favoriteId: string) => Promise<void> | void;
}

const normalizeReminderOffsetInput = (value: string) => value.replace(/[^\d]/g, '').slice(0, 3);

const parseReminderOffsetMinutes = (value: unknown) => {
    const normalized = Math.round(Number(value));
    if (!Number.isFinite(normalized) || normalized < 1 || normalized > 120) {
        return null;
    }

    return normalized;
};

const sortLines = (lines: string[]) => [...lines].sort((left, right) => left.localeCompare(right, 'bg', { numeric: true }));

const syncLineNotifications = (lines: FavoriteLinePreference[], enabled: boolean, primaryLine?: string | null): FavoriteLinePreference[] => {
    const normalizedPrimaryLine = String(primaryLine || '').trim().toUpperCase();
    const fallbackPrimaryLine = lines.find((entry) => entry.enabled)?.line || '';
    const effectivePrimaryLine = normalizedPrimaryLine || fallbackPrimaryLine;

    return lines.map((entry) => ({
        ...entry,
        notificationsEnabled: enabled ? !!entry.enabled && entry.line === effectivePrimaryLine : false,
    }));
};

export const FavoriteEditorModal: React.FC<Props> = ({
    visible,
    favorite,
    isDraft = false,
    initialSection = null,
    locationOnly = false,
    searchableStops,
    currentPin,
    currentLocation,
    onClose,
    onConfigureRoute,
    onSave,
    onCreateAndConfigureRoute,
    onUpdateRouteNotificationSettings,
    onRemoveSavedRoute,
}) => {
    const { height } = useWindowDimensions();
    const nameInputRef = useRef<TextInput | null>(null);
    const locationSearchInputRef = useRef<TextInput | null>(null);
    const [name, setName] = useState('');
    const [latitude, setLatitude] = useState<number | null>(null);
    const [longitude, setLongitude] = useState<number | null>(null);
    const [locationQuery, setLocationQuery] = useState('');
    const [locationSearchResults, setLocationSearchResults] = useState<PlaceSearchResult[]>([]);
    const [locationSearchLoading, setLocationSearchLoading] = useState(false);
    const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
    const [linePreferences, setLinePreferences] = useState<FavoriteLinePreference[]>([]);
    const [activeSection, setActiveSection] = useState<FavoriteEditorSection | null>(null);
    const [routeNotificationEnabled, setRouteNotificationEnabled] = useState(false);
    const [routeNotificationPending, setRouteNotificationPending] = useState(false);
    const [routeReminderOffsetMinutes, setRouteReminderOffsetMinutes] = useState<number>(5);
    const [routeReminderOffsetInput, setRouteReminderOffsetInput] = useState('5');
    const [personalNotificationLeadMinutes, setPersonalNotificationLeadMinutes] = useState<number>(5);

    useEffect(() => {
        if (!favorite || !visible) {
            return;
        }

        setName(favorite.name);
        setLatitude(favorite.latitude);
        setLongitude(favorite.longitude);
        setLocationQuery('');
        setLocationSearchResults([]);
        setLocationSearchLoading(false);
        setSelectedStopId(favorite.selectedStopId);
        setLinePreferences(favorite.selectedLines || []);
        const normalizedReminderOffsetMinutes = parseReminderOffsetMinutes(favorite.defaultCommute?.reminderOffsetMinutes) ?? 5;
        const normalizedPersonalLeadMinutes = parseReminderOffsetMinutes(favorite.personalNotificationLeadMinutes) ?? 5;
        setRouteNotificationEnabled(!!favorite.defaultCommute?.notificationEnabled);
        setRouteReminderOffsetMinutes(normalizedReminderOffsetMinutes);
        setRouteReminderOffsetInput(String(normalizedReminderOffsetMinutes));
        setPersonalNotificationLeadMinutes(normalizedPersonalLeadMinutes);
        setActiveSection(initialSection ?? null);
    }, [favorite, initialSection, isDraft, visible]);

    useEffect(() => {
        if (!visible || !favorite) {
            return;
        }

        const timer = setTimeout(() => {
            if (initialSection === 'name') {
                nameInputRef.current?.focus();
                return;
            }

            if (activeSection === 'location') {
                locationSearchInputRef.current?.focus();
            }
        }, 120);

        return () => clearTimeout(timer);
    }, [activeSection, favorite, initialSection, visible]);

    useEffect(() => {
        const normalizedQuery = locationQuery.trim();
        if (!visible || !normalizedQuery) {
            setLocationSearchResults([]);
            setLocationSearchLoading(false);
            return;
        }

        let isMounted = true;
        setLocationSearchLoading(true);
        const timer = setTimeout(() => {
            void (async () => {
                try {
                    const results = await searchLocations(normalizedQuery, 6);
                    if (isMounted) {
                        setLocationSearchResults(results);
                    }
                } catch {
                    if (isMounted) {
                        setLocationSearchResults([]);
                    }
                } finally {
                    if (isMounted) {
                        setLocationSearchLoading(false);
                    }
                }
            })();
        }, 320);

        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [locationQuery, visible]);

    const selectedStop = useMemo(() => {
        if (!selectedStopId) {
            return null;
        }

        return searchableStops.find((stop) => stop.id === selectedStopId) ?? null;
    }, [searchableStops, selectedStopId]);

    const selectedStopLines = useMemo(() => {
        const combinedLines = new Set<string>();

        (selectedStop?.lines || []).forEach((line) => {
            const normalized = String(line || '').trim().toUpperCase();
            if (normalized) {
                combinedLines.add(normalized);
            }
        });

        if (selectedStop || linePreferences.length > 0) {
            (favorite?.selectedLines || []).forEach((entry) => {
                const normalized = String(entry.line || '').trim().toUpperCase();
                if (normalized) {
                    combinedLines.add(normalized);
                }
            });
        }

        linePreferences.forEach((entry) => {
            const normalized = String(entry.line || '').trim().toUpperCase();
            if (normalized) {
                combinedLines.add(normalized);
            }
        });

        return sortLines(Array.from(combinedLines));
    }, [favorite?.selectedLines, linePreferences, selectedStop]);

    useEffect(() => {
        const nextLinePreferences = selectedStopLines.map((line) => {
            const existing = linePreferences.find((entry) => entry.line === line) ?? favorite?.selectedLines.find((entry) => entry.line === line);
            return {
                line,
                enabled: existing?.enabled ?? false,
                notificationsEnabled: existing?.notificationsEnabled ?? false,
            };
        });

        const hasChanged = nextLinePreferences.length !== linePreferences.length
            || nextLinePreferences.some((entry, index) => {
                const current = linePreferences[index];
                return !current
                    || current.line !== entry.line
                    || current.enabled !== entry.enabled
                    || current.notificationsEnabled !== entry.notificationsEnabled;
            });

        if (hasChanged) {
            setLinePreferences(nextLinePreferences);
        }
    }, [favorite?.selectedLines, linePreferences, selectedStopLines]);

    const locationStopResults = useMemo(() => {
        const normalizedQuery = locationQuery.trim().toLowerCase();
        if (!normalizedQuery) {
            return [] as Stop[];
        }

        return searchableStops
            .filter((stop) => (
                stop.name.toLowerCase().includes(normalizedQuery)
                || stop.id.toLowerCase().includes(normalizedQuery)
            ))
            .slice(0, 8);
    }, [locationQuery, searchableStops]);

    if (!favorite) {
        return null;
    }

    const title = favorite.name || (favorite.presetKey ? getFavoritePresetLabel(favorite.presetKey) : 'Редакция на любимо');
    const hasCoordinates = hasFavoriteCoordinates({ ...favorite, latitude, longitude });
    const enabledLines = linePreferences.filter((entry) => entry.enabled);
    const hasSavedRoute = !!favorite.defaultCommute?.itinerarySummary;
    const hasEditableLocationData = hasCoordinates || !!selectedStopId || linePreferences.length > 0;
    const locationSummary = hasCoordinates ? `${latitude?.toFixed(5)}, ${longitude?.toFixed(5)}` : 'Не е зададена';
    const hasPersonalNotifications = linePreferences.some((entry) => entry.enabled && entry.notificationsEnabled);

    const toggleSection = (section: FavoriteEditorSection) => {
        if (section === 'name') {
            nameInputRef.current?.focus();
            return;
        }

        setActiveSection((previous) => previous === section ? null : section);
    };

    const handleRouteNotificationToggle = async (value: boolean) => {
        if (!favorite.defaultCommute?.itinerarySummary || !onUpdateRouteNotificationSettings || routeNotificationPending) {
            return;
        }

        setRouteNotificationPending(true);
        const previousValue = routeNotificationEnabled;
        const previousLinePreferences = linePreferences;
        setRouteNotificationEnabled(value);
        setLinePreferences(syncLineNotifications(linePreferences, value, favorite.defaultCommute?.firstTransitLine));

        try {
            const result = await onUpdateRouteNotificationSettings(favorite.id, { enabled: value });
            if (!result.ok) {
                setRouteNotificationEnabled(previousValue);
                setLinePreferences(previousLinePreferences);
                Alert.alert('Неуспешно', result.message);
                return;
            }

            Alert.alert(value ? 'Маршрутното известие е включено' : 'Маршрутното известие е изключено', result.message);
        } catch {
            setRouteNotificationEnabled(previousValue);
            setLinePreferences(previousLinePreferences);
            Alert.alert('Грешка', 'Неуспешна промяна на маршрутното известие.');
        } finally {
            setRouteNotificationPending(false);
        }
    };

    const handleRouteReminderOffsetChange = async (value: number) => {
        if (!favorite.defaultCommute?.itinerarySummary || !onUpdateRouteNotificationSettings || routeNotificationPending) {
            return;
        }

        const normalizedValue = parseReminderOffsetMinutes(value);
        if (normalizedValue == null) {
            Alert.alert('Невалидни минути', 'Въведи стойност между 1 и 120 минути.');
            setRouteReminderOffsetInput(String(routeReminderOffsetMinutes));
            return;
        }

        const previousValue = routeReminderOffsetMinutes;
        setRouteNotificationPending(true);
        setRouteReminderOffsetMinutes(normalizedValue);
        setRouteReminderOffsetInput(String(normalizedValue));
        setPersonalNotificationLeadMinutes(normalizedValue);

        try {
            const result = await onUpdateRouteNotificationSettings(favorite.id, { reminderOffsetMinutes: normalizedValue });
            if (!result.ok) {
                setRouteReminderOffsetMinutes(previousValue);
                setRouteReminderOffsetInput(String(previousValue));
                setPersonalNotificationLeadMinutes(previousValue);
                Alert.alert('Неуспешно', result.message);
                return;
            }

            Alert.alert('Маршрутното известие е обновено', result.message);
        } catch {
            setRouteReminderOffsetMinutes(previousValue);
            setRouteReminderOffsetInput(String(previousValue));
            setPersonalNotificationLeadMinutes(previousValue);
            Alert.alert('Грешка', 'Неуспешна промяна на времето за маршрутното известие.');
        } finally {
            setRouteNotificationPending(false);
        }
    };

    const commitRouteReminderOffsetInput = async () => {
        const parsed = parseReminderOffsetMinutes(routeReminderOffsetInput);
        if (parsed == null) {
            Alert.alert('Невалидни минути', 'Въведи стойност между 1 и 120 минути.');
            setRouteReminderOffsetInput(String(routeReminderOffsetMinutes));
            return;
        }

        if (parsed === routeReminderOffsetMinutes) {
            setRouteReminderOffsetInput(String(parsed));
            return;
        }

        await handleRouteReminderOffsetChange(parsed);
    };

    const handleRemoveSavedRoute = () => {
        if (!favorite.defaultCommute?.itinerarySummary || routeNotificationPending || !onRemoveSavedRoute) {
            return;
        }

        Alert.alert(
            'Махане на маршрут',
            `Сигурен ли си, че искаш да махнеш запазения маршрут за ${favorite.name}?`,
            [
                { text: 'Отказ', style: 'cancel' },
                {
                    text: 'Махни',
                    style: 'destructive',
                    onPress: async () => {
                        setRouteNotificationPending(true);
                        try {
                            await onRemoveSavedRoute(favorite.id);
                            onClose();
                        } catch {
                            Alert.alert('Грешка', 'Неуспешно премахване на запазения маршрут.');
                        } finally {
                            setRouteNotificationPending(false);
                        }
                    },
                },
            ],
        );
    };

    const buildDraftUpdates = () => ({
        name,
        latitude,
        longitude,
        selectedStopId,
        selectedStopName: selectedStop?.name ?? null,
        selectedLines: linePreferences,
        personalNotificationLeadMinutes,
    });

    const overlayTopPadding = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 56) + 22 : 78;
    const overlayBottomPadding = Math.min(Math.max(height * 0.03, 16), 28);
    const cardMaxHeight = Math.min(Math.max(height * 0.72, 480), 760);

    return (
        <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose} statusBarTranslucent>
            <View style={[styles.overlay, { paddingTop: overlayTopPadding, paddingBottom: overlayBottomPadding }]}>
                <View style={[styles.card, { maxHeight: cardMaxHeight }]}>
                    <Pressable onPress={onClose} style={styles.closeButton}>
                        <Ionicons name="close" size={16} color="#334155" />
                    </Pressable>
                    <ScrollView
                        style={styles.contentScroll}
                        contentContainerStyle={styles.contentScrollInner}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                    >
                        <View style={styles.header}>
                            <Text style={styles.title}>{title}</Text>
                        </View>

                        <TextInput
                            ref={nameInputRef}
                            style={styles.nameInput}
                            value={name}
                            onChangeText={setName}
                            placeholder="Име на любимо място"
                            placeholderTextColor="#9CA3AF"
                        />

                        {!isDraft ? (
                            <View style={styles.section}>
                                {hasSavedRoute && (
                                    <>
                                        <Text style={styles.routeSummary}>{favorite.defaultCommute?.itinerarySummary}</Text>
                                        {favorite.defaultCommute?.reminderTime ? (
                                            <Text style={styles.routeMeta}>
                                                {favorite.defaultCommute.arriveBy && favorite.defaultCommute.reminderOffsetMinutes
                                                    ? `${formatFavoriteCommuteWeekdays(favorite.defaultCommute.notificationWeekdays)} • ${favorite.defaultCommute.reminderOffsetMinutes}мин (${favorite.defaultCommute.reminderTime})${getFavoriteCommuteNotificationShiftLabel(favorite.defaultCommute) ? ` • ${getFavoriteCommuteNotificationShiftLabel(favorite.defaultCommute)}` : ''}`
                                                    : `${formatFavoriteCommuteWeekdays(favorite.defaultCommute.notificationWeekdays)} • ${favorite.defaultCommute.reminderTime}`}
                                            </Text>
                                        ) : null}
                                        <View style={styles.routeActions}>
                                            <Switch
                                                value={routeNotificationEnabled}
                                                onValueChange={(value) => void handleRouteNotificationToggle(value)}
                                                disabled={routeNotificationPending}
                                                trackColor={{ false: '#D1D5DB', true: '#86EFAC' }}
                                                thumbColor={routeNotificationEnabled ? '#16A34A' : '#F9FAFB'}
                                            />
                                            <View style={styles.routeMinutesInputWrap}>
                                                <Text style={styles.routeMinutesInputLabel}>мин по-рано</Text>
                                                <TextInput
                                                    style={styles.routeMinutesInput}
                                                    value={routeReminderOffsetInput}
                                                    onChangeText={(value) => setRouteReminderOffsetInput(normalizeReminderOffsetInput(value))}
                                                    onBlur={() => { void commitRouteReminderOffsetInput(); }}
                                                    onSubmitEditing={() => { void commitRouteReminderOffsetInput(); }}
                                                    editable={!routeNotificationPending}
                                                    keyboardType="number-pad"
                                                    returnKeyType="done"
                                                    placeholder="5"
                                                    placeholderTextColor="#94A3B8"
                                                />
                                            </View>
                                            <TouchableOpacity onPress={handleRemoveSavedRoute} disabled={routeNotificationPending} style={{ padding: 4, marginLeft: 'auto' }}>
                                                <Ionicons name="trash-outline" size={14} color="#94A3B8" />
                                            </TouchableOpacity>
                                        </View>
                                    </>
                                )}
                            </View>
                        ) : null}

                        <TouchableOpacity style={styles.compactSectionCard} onPress={() => toggleSection('location')} activeOpacity={0.8}>
                            <View style={styles.compactSectionHeader}>
                                <View style={styles.compactSectionTextWrap}>
                                    <Text style={styles.compactSectionTitle}>Локация</Text>
                                    <Text style={styles.compactSectionSummary}>{locationSummary}</Text>
                                </View>
                                <Ionicons name={activeSection === 'location' ? 'chevron-up' : 'chevron-down'} size={16} color="#1D4ED8" />
                            </View>
                        </TouchableOpacity>
                        {activeSection === 'location' ? (
                        <View style={styles.section}>
                            <TextInput
                                ref={locationSearchInputRef}
                                style={styles.locationSearchInput}
                                value={locationQuery}
                                onChangeText={setLocationQuery}
                                placeholder="Адрес или спирка"
                                placeholderTextColor="#9CA3AF"
                            />
                            {(locationSearchLoading || locationStopResults.length > 0 || locationSearchResults.length > 0) && (
                                <ScrollView style={styles.locationSearchList} nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                    {locationStopResults.map((stop) => (
                                        <TouchableOpacity
                                            key={`location-stop-${stop.id}`}
                                            style={styles.locationResultRow}
                                            onPress={() => {
                                                setLatitude(stop.latitude);
                                                setLongitude(stop.longitude);
                                                setSelectedStopId(stop.id);
                                                setLocationQuery(stop.name);
                                                setLocationSearchResults([]);
                                                setLocationSearchLoading(false);
                                            }}
                                        >
                                            <Text style={styles.locationResultTitle}>{stop.name}</Text>
                                            <Text style={styles.locationResultSubtitle}>{`${stop.id} • ${summarizeStopDirections(stop, 1)}`}</Text>
                                        </TouchableOpacity>
                                    ))}
                                    {locationSearchResults.map((result) => (
                                        <TouchableOpacity
                                            key={`location-address-${result.id}`}
                                            style={styles.locationResultRow}
                                            onPress={() => {
                                                setLatitude(result.latitude);
                                                setLongitude(result.longitude);
                                                setSelectedStopId(null);
                                                setLocationQuery(result.name);
                                                setLocationSearchResults([]);
                                                setLocationSearchLoading(false);
                                            }}
                                        >
                                            <Text style={styles.locationResultTitle}>{result.name}</Text>
                                            <Text style={styles.locationResultSubtitle}>{result.subtitle}</Text>
                                        </TouchableOpacity>
                                    ))}
                                    {locationSearchLoading && (
                                        <Text style={styles.locationSearchStatus}>Търсене...</Text>
                                    )}
                                </ScrollView>
                            )}
                            <View style={styles.locationActions}>
                                {currentLocation && (
                                    <TouchableOpacity
                                        style={[styles.locationButton, styles.locationButtonSecondary]}
                                        onPress={() => {
                                            setLatitude(currentLocation.latitude);
                                            setLongitude(currentLocation.longitude);
                                            setSelectedStopId(null);
                                            setLocationQuery('');
                                            setLocationSearchResults([]);
                                            setLocationSearchLoading(false);
                                        }}
                                    >
                                        <Text style={styles.locationButtonText}>Моята локация</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            {isDraft ? (
                                <TouchableOpacity
                                    style={[styles.routeButton, (!hasCoordinates || !onCreateAndConfigureRoute) && styles.routeButtonDisabled]}
                                    disabled={!hasCoordinates || !onCreateAndConfigureRoute}
                                    onPress={() => {
                                        if (!onCreateAndConfigureRoute) {
                                            return;
                                        }

                                        void onCreateAndConfigureRoute(buildDraftUpdates());
                                    }}
                                >
                                    <Text style={styles.routeButtonText}>Изчисли маршрут</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                        ) : null}

                        <TouchableOpacity
                            style={[styles.saveButton, (isDraft && !hasCoordinates) && styles.saveButtonDisabled]}
                            disabled={isDraft && !hasCoordinates}
                            onPress={() => {
                                void onSave(favorite.id, buildDraftUpdates());
                                onClose();
                            }}
                        >
                            <Text style={styles.saveButtonText}>{isDraft ? 'Добави мястото' : 'Запази промените'}</Text>
                        </TouchableOpacity>

                        {!isDraft && hasEditableLocationData && (
                            <TouchableOpacity
                                style={styles.clearRow}
                                onPress={() => {
                                    Alert.alert('Изчисти данните', 'Ще се нулира локацията.', [
                                        { text: 'Отказ', style: 'cancel' },
                                        {
                                            text: 'Изчисти',
                                            style: 'destructive',
                                            onPress: () => {
                                                setLatitude(null);
                                                setLongitude(null);
                                                setLocationQuery('');
                                                setLocationSearchResults([]);
                                                setSelectedStopId(null);
                                                setLinePreferences([]);
                                                setActiveSection(null);
                                            },
                                        },
                                    ]);
                                }}
                            >
                                <Ionicons name="trash-outline" size={13} color="#94A3B8" />
                                <Text style={styles.clearRowText}>Изчисти данните</Text>
                            </TouchableOpacity>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.14)', justifyContent: 'flex-start', paddingHorizontal: 12 },
    card: { position: 'relative', backgroundColor: '#FFFFFF', borderRadius: 22, padding: 14, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 24 },
    contentScroll: { flexGrow: 0 },
    contentScrollInner: { paddingTop: 2, paddingBottom: 6 },
    header: { paddingRight: 46, marginBottom: 10 },
    title: { color: '#0F172A', fontSize: 16, fontWeight: '700' },
    closeButton: { position: 'absolute', top: 12, right: 12, zIndex: 20, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(248,250,252,0.72)' },
    nameInput: { borderRadius: 10, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', paddingHorizontal: 12, paddingVertical: 9, color: '#0F172A', fontSize: 14, marginBottom: 10 },
    section: { marginBottom: 10 },

    /* Route */
    routeSummary: { color: '#0F172A', fontSize: 12, fontWeight: '600', marginBottom: 2 },
    routeMeta: { color: '#64748B', fontSize: 11, marginBottom: 6 },
    routeActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
    routeButton: { marginBottom: 8, minHeight: 42, backgroundColor: '#7C3AED', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    routeButtonDisabled: { backgroundColor: '#C4B5FD' },
    routeButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

    routeMinutesInputWrap: { minWidth: 104, marginLeft: 2 },
    routeMinutesInputLabel: { color: '#64748B', fontSize: 10, fontWeight: '700', marginBottom: 3 },
    routeMinutesInput: { borderRadius: 8, borderWidth: 1, borderColor: 'rgba(226,232,240,0.9)', paddingHorizontal: 10, paddingVertical: 7, color: '#0F172A', fontSize: 12, fontWeight: '700', minWidth: 72, backgroundColor: 'rgba(248,250,252,0.78)' },

    /* Location */
    locationSearchInput: { borderRadius: 10, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', paddingHorizontal: 12, paddingVertical: 9, color: '#0F172A', fontSize: 13, marginBottom: 6 },
    locationSearchList: { maxHeight: 170, borderRadius: 10, backgroundColor: 'rgba(248,250,252,0.72)', padding: 6, marginBottom: 6 },
    locationResultRow: { paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8, marginBottom: 2 },
    locationResultTitle: { color: '#0F172A', fontSize: 12, fontWeight: '600' },
    locationResultSubtitle: { color: '#64748B', fontSize: 11 },
    locationSearchStatus: { color: '#475569', fontSize: 12, textAlign: 'center', paddingVertical: 6 },
    locationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    locationButton: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: 'rgba(219,234,254,0.6)' },
    locationButtonSecondary: { backgroundColor: 'rgba(220,252,231,0.6)' },
    locationButtonText: { color: '#0F172A', fontSize: 11, fontWeight: '700' },

    /* Accordion sections */
    compactSectionCard: { marginBottom: 8, borderRadius: 10, backgroundColor: 'rgba(248,250,252,0.6)', paddingHorizontal: 12, paddingVertical: 9 },
    compactSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    compactSectionTextWrap: { flex: 1 },
    compactSectionTitle: { color: '#0F172A', fontSize: 13, fontWeight: '700' },
    compactSectionSummary: { color: '#64748B', fontSize: 11, marginTop: 2 },

    /* Save */
    saveButton: { backgroundColor: '#1D4ED8', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
    saveButtonDisabled: { backgroundColor: '#93C5FD' },
    saveButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    clearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, marginTop: 4 },
    clearRowText: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },
});
