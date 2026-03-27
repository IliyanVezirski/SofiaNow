import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FavoriteLinePreference, FavoritePlace, PlaceSearchResult, formatFavoriteCommuteWeekdays, getFavoriteCommuteNotificationShiftLabel, getFavoritePresetLabel, hasFavoriteCoordinates, searchLocations } from '../../../services/places';
import { Stop, summarizeStopDirections } from '../../../services/stopsApi';

export type FavoriteEditorSection = 'name' | 'location' | 'stop' | 'lines';

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

const REMINDER_OFFSET_OPTIONS = [5, 10] as const;

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
    const nameInputRef = useRef<TextInput | null>(null);
    const locationSearchInputRef = useRef<TextInput | null>(null);
    const stopInputRef = useRef<TextInput | null>(null);
    const [name, setName] = useState('');
    const [latitude, setLatitude] = useState<number | null>(null);
    const [longitude, setLongitude] = useState<number | null>(null);
    const [locationQuery, setLocationQuery] = useState('');
    const [locationSearchResults, setLocationSearchResults] = useState<PlaceSearchResult[]>([]);
    const [locationSearchLoading, setLocationSearchLoading] = useState(false);
    const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
    const [stopQuery, setStopQuery] = useState('');
    const [linePreferences, setLinePreferences] = useState<FavoriteLinePreference[]>([]);
    const [activeSection, setActiveSection] = useState<FavoriteEditorSection | null>(null);
    const [routeNotificationEnabled, setRouteNotificationEnabled] = useState(false);
    const [routeNotificationPending, setRouteNotificationPending] = useState(false);
    const [routeReminderOffsetMinutes, setRouteReminderOffsetMinutes] = useState<number>(5);
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
        setStopQuery(favorite.selectedStopName || '');
        setLinePreferences(favorite.selectedLines || []);
        setRouteNotificationEnabled(!!favorite.defaultCommute?.notificationEnabled);
        setRouteReminderOffsetMinutes(favorite.defaultCommute?.reminderOffsetMinutes === 10 ? 10 : 5);
        setPersonalNotificationLeadMinutes(favorite.personalNotificationLeadMinutes === 10 ? 10 : 5);
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
                return;
            }

            if (activeSection === 'stop') {
                stopInputRef.current?.focus();
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

    const visibleStops = useMemo(() => {
        const normalizedQuery = stopQuery.trim().toLowerCase();
        const base = normalizedQuery
            ? searchableStops.filter((stop) => (
                stop.name.toLowerCase().includes(normalizedQuery)
                || stop.id.toLowerCase().includes(normalizedQuery)
            ))
            : searchableStops;

        const selected = selectedStopId ? searchableStops.find((stop) => stop.id === selectedStopId) : null;
        const combined = selected ? [selected, ...base.filter((stop) => stop.id !== selected.id)] : base;
        return combined.slice(0, 18);
    }, [searchableStops, selectedStopId, stopQuery]);

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
    const locationSummary = hasCoordinates ? `${latitude?.toFixed(5)}, ${longitude?.toFixed(5)}` : 'Не е зададена';
    const stopSummary = selectedStop?.name || 'Не е избрана';
    const linesSummary = enabledLines.length ? enabledLines.map((entry) => entry.line).join(', ') : 'Няма избрани линии';
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

        const normalizedValue = value === 10 ? 10 : 5;
        const previousValue = routeReminderOffsetMinutes;
        setRouteNotificationPending(true);
        setRouteReminderOffsetMinutes(normalizedValue);
        setPersonalNotificationLeadMinutes(normalizedValue);

        try {
            const result = await onUpdateRouteNotificationSettings(favorite.id, { reminderOffsetMinutes: normalizedValue });
            if (!result.ok) {
                setRouteReminderOffsetMinutes(previousValue);
                setPersonalNotificationLeadMinutes(previousValue);
                Alert.alert('Неуспешно', result.message);
                return;
            }

            Alert.alert('Маршрутното известие е обновено', result.message);
        } catch {
            setRouteReminderOffsetMinutes(previousValue);
            setPersonalNotificationLeadMinutes(previousValue);
            Alert.alert('Грешка', 'Неуспешна промяна на времето за маршрутното известие.');
        } finally {
            setRouteNotificationPending(false);
        }
    };

    const handlePersonalNotificationLeadMinutesChange = (value: number) => {
        const normalizedValue = value === 10 ? 10 : 5;
        setPersonalNotificationLeadMinutes(normalizedValue);
        if (hasSavedRoute) {
            setRouteReminderOffsetMinutes(normalizedValue);
        }
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

    const applyLineToggle = (line: string, field: 'enabled' | 'notificationsEnabled', value: boolean) => {
        setLinePreferences((previous) => previous.map((entry) => {
            if (entry.line !== line) {
                return entry;
            }

            if (field === 'enabled') {
                return {
                    ...entry,
                    enabled: value,
                    notificationsEnabled: value ? entry.notificationsEnabled : false,
                };
            }

            return {
                ...entry,
                enabled: value ? true : entry.enabled,
                notificationsEnabled: value,
            };
        }));
    };

    const buildDraftUpdates = () => ({
        name,
        latitude,
        longitude,
        selectedStopId,
        selectedStopName: selectedStop?.name ?? null,
        selectedLines: enabledLines.map((entry) => ({
            line: entry.line,
            enabled: true,
            notificationsEnabled: entry.notificationsEnabled,
        })),
        personalNotificationLeadMinutes,
    });

    return (
        <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.overlay}>
                <View style={styles.card}>
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
                                            {REMINDER_OFFSET_OPTIONS.map((option) => (
                                                <TouchableOpacity
                                                    key={option}
                                                    style={[styles.offsetChip, routeReminderOffsetMinutes === option && styles.offsetChipActive]}
                                                    disabled={routeNotificationPending}
                                                    onPress={() => void handleRouteReminderOffsetChange(option)}
                                                >
                                                    <Text style={[styles.offsetChipText, routeReminderOffsetMinutes === option && styles.offsetChipTextActive]}>
                                                        {`${option}мин`}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
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
                                                setStopQuery(stop.name);
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

                        {!locationOnly && (<>
                        <TouchableOpacity style={styles.compactSectionCard} onPress={() => toggleSection('stop')} activeOpacity={0.8}>
                            <View style={styles.compactSectionHeader}>
                                <View style={styles.compactSectionTextWrap}>
                                    <Text style={styles.compactSectionTitle}>Спирка</Text>
                                    <Text style={styles.compactSectionSummary}>{stopSummary}</Text>
                                </View>
                                <Ionicons name={activeSection === 'stop' ? 'chevron-up' : 'chevron-down'} size={16} color="#1D4ED8" />
                            </View>
                        </TouchableOpacity>
                        {activeSection === 'stop' ? (
                        <View style={styles.section}>
                            <TextInput
                                ref={stopInputRef}
                                style={styles.stopInput}
                                value={stopQuery}
                                onChangeText={setStopQuery}
                                placeholder="Име или код"
                                placeholderTextColor="#9CA3AF"
                            />
                            <ScrollView style={styles.stopList} nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                {visibleStops.map((stop) => {
                                    const isSelected = stop.id === selectedStopId;
                                    return (
                                        <TouchableOpacity
                                            key={stop.id}
                                            style={[styles.stopRow, isSelected && styles.stopRowSelected]}
                                            onPress={() => {
                                                setSelectedStopId(stop.id);
                                                setStopQuery(stop.name);
                                            }}
                                        >
                                            <Text style={styles.stopName}>{stop.name}</Text>
                                            <Text style={styles.stopMeta}>{`${stop.id} • ${summarizeStopDirections(stop, 1)}`}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>
                        ) : null}

                        <TouchableOpacity style={styles.compactSectionCard} onPress={() => toggleSection('lines')} activeOpacity={0.8}>
                            <View style={styles.compactSectionHeader}>
                                <View style={styles.compactSectionTextWrap}>
                                    <Text style={styles.compactSectionTitle}>Линии</Text>
                                    <Text style={styles.compactSectionSummary}>{linesSummary}</Text>
                                </View>
                                <Ionicons name={activeSection === 'lines' ? 'chevron-up' : 'chevron-down'} size={16} color="#1D4ED8" />
                            </View>
                        </TouchableOpacity>
                        {activeSection === 'lines' ? (
                        <View style={styles.section}>
                            {!selectedStopLines.length && (
                                <Text style={styles.emptyState}>Избери спирка.</Text>
                            )}
                            {!!selectedStopLines.length && (
                                <>
                                    <ScrollView style={styles.lineList} nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                        {linePreferences.map((entry) => (
                                            <View key={entry.line} style={styles.lineRow}>
                                                <View style={styles.lineLabelWrap}>
                                                    <Text style={styles.lineLabel}>{entry.line}</Text>
                                                </View>
                                                <View style={styles.toggleWrap}>
                                                    <Text style={styles.toggleLabel}>Пътувам</Text>
                                                    <Switch
                                                        value={entry.enabled}
                                                        onValueChange={(value) => applyLineToggle(entry.line, 'enabled', value)}
                                                        trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                                                        thumbColor={entry.enabled ? '#1D4ED8' : '#F9FAFB'}
                                                    />
                                                </View>
                                                <View style={styles.toggleWrap}>
                                                    <Text style={styles.toggleLabel}>Уведомявай</Text>
                                                    <Switch
                                                        value={entry.notificationsEnabled}
                                                        onValueChange={(value) => applyLineToggle(entry.line, 'notificationsEnabled', value)}
                                                        disabled={!entry.enabled}
                                                        trackColor={{ false: '#D1D5DB', true: '#86EFAC' }}
                                                        thumbColor={entry.notificationsEnabled ? '#16A34A' : '#F9FAFB'}
                                                    />
                                                </View>
                                            </View>
                                        ))}
                                    </ScrollView>
                                    <View style={styles.offsetOptionsRow}>
                                        {REMINDER_OFFSET_OPTIONS.map((option) => (
                                            <TouchableOpacity
                                                key={`personal-${option}`}
                                                style={[styles.offsetChip, personalNotificationLeadMinutes === option && styles.offsetChipActive]}
                                                onPress={() => handlePersonalNotificationLeadMinutesChange(option)}
                                            >
                                                <Text style={[styles.offsetChipText, personalNotificationLeadMinutes === option && styles.offsetChipTextActive]}>
                                                    {`${option}мин`}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </>
                            )}
                        </View>
                        ) : null}
                        </>)}

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

                        {!isDraft && (
                            <TouchableOpacity
                                style={styles.clearRow}
                                onPress={() => {
                                    Alert.alert('Изчисти данните', 'Ще се нулират локация, спирка и линии.', [
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
                                                setStopQuery('');
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
    overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.14)', justifyContent: 'flex-start', paddingTop: 78, paddingHorizontal: 12, paddingBottom: 16 },
    card: { position: 'relative', backgroundColor: '#FFFFFF', borderRadius: 22, padding: 14, maxHeight: '92%', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 24 },
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
    routeActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    routeButton: { marginBottom: 8, minHeight: 42, backgroundColor: '#7C3AED', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    routeButtonDisabled: { backgroundColor: '#C4B5FD' },
    routeButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

    /* Offset chips (shared) */
    offsetOptionsRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
    offsetChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: 'rgba(226,232,240,0.6)' },
    offsetChipActive: { backgroundColor: '#1D4ED8' },
    offsetChipText: { color: '#475569', fontSize: 11, fontWeight: '700' },
    offsetChipTextActive: { color: '#FFFFFF' },

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

    /* Stop */
    stopInput: { borderRadius: 10, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', paddingHorizontal: 12, paddingVertical: 9, color: '#0F172A', fontSize: 13, marginBottom: 6 },
    stopList: { maxHeight: 160, borderRadius: 10, backgroundColor: 'rgba(248,250,252,0.72)', padding: 6 },
    stopRow: { paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8, marginBottom: 2 },
    stopRowSelected: { backgroundColor: 'rgba(239,246,255,0.82)' },
    stopName: { color: '#0F172A', fontSize: 12, fontWeight: '600' },
    stopMeta: { color: '#64748B', fontSize: 11 },

    /* Lines */
    lineList: { maxHeight: 190 },
    lineRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8, marginBottom: 4, backgroundColor: 'rgba(248,250,252,0.6)' },
    lineLabelWrap: { width: 44 },
    lineLabel: { color: '#0F172A', fontSize: 13, fontWeight: '700' },
    toggleWrap: { flex: 1, alignItems: 'center' },
    toggleLabel: { color: '#475569', fontSize: 10, fontWeight: '600', marginBottom: 2 },
    emptyState: { color: '#64748B', fontSize: 12 },

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