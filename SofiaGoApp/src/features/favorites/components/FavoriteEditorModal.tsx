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

        (favorite?.selectedLines || []).forEach((entry) => {
            const normalized = String(entry.line || '').trim().toUpperCase();
            if (normalized) {
                combinedLines.add(normalized);
            }
        });

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
                            <View style={styles.headerTextWrap}>
                                <Text style={styles.title}>{title}</Text>
                                <Text style={styles.subtitle}>{isDraft ? 'Добави име, локация и спирка.' : 'Редакция на място, спирка, линии и известия'}</Text>
                            </View>
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
                                <Text style={styles.sectionTitle}>Маршрут и известие</Text>
                                <Text style={styles.sectionHint}>Оттук отваряш отделния екран за маршрут, час и маршрутно известие.</Text>
                                {hasSavedRoute ? (
                                    <View style={styles.routeSummaryBox}>
                                        <Text style={styles.routeSummaryTitle}>{favorite.defaultCommute?.routeLabel || 'Запазен маршрут'}</Text>
                                        <Text style={styles.routeSummaryText}>{favorite.defaultCommute?.itinerarySummary}</Text>
                                        {favorite.defaultCommute?.reminderTime ? (
                                            <Text style={styles.routeSummaryMeta}>
                                                {favorite.defaultCommute.arriveBy && favorite.defaultCommute.reminderOffsetMinutes
                                                    ? `Известяване: ${formatFavoriteCommuteWeekdays(favorite.defaultCommute.notificationWeekdays)} • ${favorite.defaultCommute.reminderOffsetMinutes} мин по-рано (${favorite.defaultCommute.reminderTime})${getFavoriteCommuteNotificationShiftLabel(favorite.defaultCommute) ? ` • ${getFavoriteCommuteNotificationShiftLabel(favorite.defaultCommute)}` : ''}`
                                                    : `Известяване: ${formatFavoriteCommuteWeekdays(favorite.defaultCommute.notificationWeekdays)} • ${favorite.defaultCommute.reminderTime}`}
                                            </Text>
                                        ) : (
                                            <Text style={styles.routeSummaryMeta}>Няма запазено маршрутно известяване.</Text>
                                        )}
                                        <View style={styles.routeNotificationRow}>
                                            <Text style={styles.routeNotificationLabel}>Маршрутно известие</Text>
                                            <Switch
                                                value={routeNotificationEnabled}
                                                onValueChange={(value) => void handleRouteNotificationToggle(value)}
                                                disabled={routeNotificationPending}
                                                trackColor={{ false: '#D1D5DB', true: '#86EFAC' }}
                                                thumbColor={routeNotificationEnabled ? '#16A34A' : '#F9FAFB'}
                                            />
                                        </View>
                                        <View style={styles.offsetOptionsRow}>
                                            {REMINDER_OFFSET_OPTIONS.map((option) => (
                                                <TouchableOpacity
                                                    key={option}
                                                    style={[styles.offsetChip, routeReminderOffsetMinutes === option && styles.offsetChipActive]}
                                                    disabled={routeNotificationPending}
                                                    onPress={() => void handleRouteReminderOffsetChange(option)}
                                                >
                                                    <Text style={[styles.offsetChipText, routeReminderOffsetMinutes === option && styles.offsetChipTextActive]}>
                                                        {`${option} мин по-рано`}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                        <TouchableOpacity
                                            style={[styles.routeRemoveButton, routeNotificationPending && styles.routeRemoveButtonDisabled]}
                                            disabled={routeNotificationPending}
                                            onPress={handleRemoveSavedRoute}
                                        >
                                            <Text style={styles.routeRemoveButtonText}>Махни запазения маршрут</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View style={styles.routeSummaryEmptyBox}>
                                        <Text style={styles.routeSummaryEmptyText}>Още няма изграден маршрут за това място.</Text>
                                    </View>
                                )}
                                <TouchableOpacity
                                    style={[styles.routeButton, !hasCoordinates && styles.routeButtonDisabled]}
                                    disabled={!hasCoordinates}
                                    onPress={async () => {
                                        await onConfigureRoute(favorite.id, buildDraftUpdates());
                                        onClose();
                                    }}
                                >
                                    <Text style={styles.routeButtonText}>{hasSavedRoute ? 'Изгради наново маршрут' : 'Създай маршрут'}</Text>
                                </TouchableOpacity>
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
                            <Text style={styles.sectionTitle}>Локация</Text>
                            <Text style={styles.sectionHint}>Избери адрес, спирка, pin от картата или текуща локация.</Text>
                            <Text style={styles.locationText}>
                                {hasCoordinates
                                    ? `${latitude?.toFixed(5)}, ${longitude?.toFixed(5)}`
                                    : 'Още няма зададена локация'}
                            </Text>
                            {hasCoordinates && (
                                <View style={styles.selectedLocationBox}>
                                    <Text style={styles.selectedLocationTitle}>Избрана локация</Text>
                                    <Text style={styles.selectedLocationText}>{`${latitude?.toFixed(5)}, ${longitude?.toFixed(5)}`}</Text>
                                </View>
                            )}
                            <TextInput
                                ref={locationSearchInputRef}
                                style={styles.locationSearchInput}
                                value={locationQuery}
                                onChangeText={setLocationQuery}
                                placeholder="Търси адрес или спирка"
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
                                {currentPin && (
                                    <TouchableOpacity
                                        style={styles.locationButton}
                                        onPress={() => {
                                            setLatitude(currentPin.latitude);
                                            setLongitude(currentPin.longitude);
                                            setLocationQuery('');
                                            setLocationSearchResults([]);
                                            setLocationSearchLoading(false);
                                        }}
                                    >
                                        <Text style={styles.locationButtonText}>Използвай pin от картата</Text>
                                    </TouchableOpacity>
                                )}
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
                                        <Text style={styles.locationButtonText}>Използвай моята локация</Text>
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

                        <TouchableOpacity style={styles.compactSectionCard} onPress={() => toggleSection('stop')} activeOpacity={0.8}>
                            <View style={styles.compactSectionHeader}>
                                <View style={styles.compactSectionTextWrap}>
                                    <Text style={styles.compactSectionTitle}>Първа спирка</Text>
                                    <Text style={styles.compactSectionSummary}>{stopSummary}</Text>
                                </View>
                                <Ionicons name={activeSection === 'stop' ? 'chevron-up' : 'chevron-down'} size={16} color="#1D4ED8" />
                            </View>
                        </TouchableOpacity>
                        {activeSection === 'stop' ? (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Спирка, от която тръгваш</Text>
                            <Text style={styles.sectionHint}>След като зададеш адрес или локация, избери спирка оттук и после маркирай линиите отдолу.</Text>
                            <TextInput
                                ref={stopInputRef}
                                style={styles.stopInput}
                                value={stopQuery}
                                onChangeText={setStopQuery}
                                placeholder="Търси по име или код на спирка"
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
                                    <Text style={styles.compactSectionTitle}>Линии и известия</Text>
                                    <Text style={styles.compactSectionSummary}>{linesSummary}</Text>
                                </View>
                                <Ionicons name={activeSection === 'lines' ? 'chevron-up' : 'chevron-down'} size={16} color="#1D4ED8" />
                            </View>
                        </TouchableOpacity>
                        {activeSection === 'lines' ? (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Линии и уведомяване</Text>
                            {!selectedStopLines.length && (
                                <Text style={styles.emptyState}>Избери спирка, за да покажем наличните линии.</Text>
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
                                    <View style={styles.personalReminderCard}>
                                        <Text style={styles.personalReminderTitle}>Колко по-рано да е персоналното известие</Text>
                                        <Text style={styles.personalReminderHint}>
                                            {hasPersonalNotifications
                                                ? 'Тази настройка се пази за персоналните известия по линии и се синхронизира с маршрутното известие, ако има запазен маршрут.'
                                                : 'Избери 5 или 10 минути предварително. Настройката ще се приложи, когато включиш персонално известяване за линия.'}
                                        </Text>
                                        <View style={styles.offsetOptionsRow}>
                                            {REMINDER_OFFSET_OPTIONS.map((option) => (
                                                <TouchableOpacity
                                                    key={`personal-${option}`}
                                                    style={[styles.offsetChip, personalNotificationLeadMinutes === option && styles.offsetChipActive]}
                                                    onPress={() => handlePersonalNotificationLeadMinutesChange(option)}
                                                >
                                                    <Text style={[styles.offsetChipText, personalNotificationLeadMinutes === option && styles.offsetChipTextActive]}>
                                                        {`${option} мин по-рано`}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                </>
                            )}
                        </View>
                        ) : null}

                        <TouchableOpacity
                            style={[styles.saveButton, !hasCoordinates && styles.saveButtonDisabled]}
                            disabled={!hasCoordinates}
                            onPress={() => {
                                void onSave(favorite.id, buildDraftUpdates());
                                onClose();
                            }}
                        >
                            <Text style={styles.saveButtonText}>{isDraft ? 'Добави мястото' : 'Запази промените'}</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.18)', justifyContent: 'flex-start', paddingTop: 78, paddingHorizontal: 12, paddingBottom: 16 },
    card: { position: 'relative', backgroundColor: '#FFFFFF', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', padding: 14, maxHeight: '92%', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 28 },
    contentScroll: { flexGrow: 0 },
    contentScrollInner: { paddingTop: 2, paddingBottom: 6 },
    header: { paddingRight: 46, marginBottom: 12 },
    headerTextWrap: { flex: 1, minWidth: 0 },
    title: { color: '#0F172A', fontSize: 16, fontWeight: '700' },
    subtitle: { color: '#475569', fontSize: 12, marginTop: 3 },
    closeButton: { position: 'absolute', top: 12, right: 12, zIndex: 20, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(248,250,252,0.72)', borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', flexShrink: 0 },
    closeButtonText: { color: '#334155', fontSize: 18, fontWeight: '700', lineHeight: 20 },
    nameInput: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', paddingHorizontal: 12, paddingVertical: 10, color: '#0F172A', fontSize: 14, marginBottom: 12 },
    section: { marginBottom: 14 },
    sectionTitle: { color: '#0F172A', fontSize: 13, fontWeight: '700', marginBottom: 6 },
    sectionHint: { color: '#475569', fontSize: 11, lineHeight: 16, marginBottom: 8 },
    locationText: { color: '#475569', fontSize: 12, marginBottom: 8 },
    selectedLocationBox: { backgroundColor: 'rgba(236,253,245,0.82)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(167,243,208,0.72)', paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
    selectedLocationTitle: { color: '#065F46', fontSize: 11, fontWeight: '700', marginBottom: 2 },
    selectedLocationText: { color: '#047857', fontSize: 12, fontWeight: '700' },
    locationSearchInput: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', paddingHorizontal: 12, paddingVertical: 10, color: '#0F172A', fontSize: 14, marginBottom: 8 },
    locationSearchList: { maxHeight: 180, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', backgroundColor: 'rgba(248,250,252,0.72)', padding: 8, marginBottom: 8 },
    locationResultRow: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FFFFFF', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    locationResultTitle: { color: '#0F172A', fontSize: 12, fontWeight: '700' },
    locationResultSubtitle: { color: '#64748B', fontSize: 11, marginTop: 2 },
    locationSearchStatus: { color: '#475569', fontSize: 12, textAlign: 'center', paddingVertical: 8 },
    locationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    locationButton: { backgroundColor: 'rgba(219,234,254,0.72)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
    locationButtonSecondary: { backgroundColor: 'rgba(220,252,231,0.72)' },
    locationButtonText: { color: '#0F172A', fontSize: 12, fontWeight: '700' },
    stopInput: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', paddingHorizontal: 12, paddingVertical: 10, color: '#0F172A', fontSize: 14, marginBottom: 8 },
    stopList: { maxHeight: 170, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', backgroundColor: 'rgba(248,250,252,0.72)', padding: 8 },
    stopRow: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FFFFFF', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    stopRowSelected: { borderColor: 'rgba(37,99,235,0.72)', backgroundColor: 'rgba(239,246,255,0.82)' },
    stopName: { color: '#0F172A', fontSize: 12, fontWeight: '700' },
    stopMeta: { color: '#64748B', fontSize: 11, marginTop: 2 },
    lineList: { maxHeight: 190 },
    lineRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(248,250,252,0.72)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    lineLabelWrap: { width: 48 },
    lineLabel: { color: '#0F172A', fontSize: 13, fontWeight: '700' },
    toggleWrap: { flex: 1, alignItems: 'center' },
    toggleLabel: { color: '#475569', fontSize: 11, fontWeight: '600', marginBottom: 4 },
    personalReminderCard: { marginTop: 10, backgroundColor: 'rgba(248,250,252,0.72)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', paddingHorizontal: 10, paddingVertical: 10 },
    personalReminderTitle: { color: '#0F172A', fontSize: 12, fontWeight: '700' },
    personalReminderHint: { color: '#64748B', fontSize: 11, lineHeight: 16, marginTop: 4 },
    emptyState: { color: '#64748B', fontSize: 12, lineHeight: 17 },
    routeSummaryBox: { backgroundColor: 'rgba(239,246,255,0.82)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(191,219,254,0.72)', paddingHorizontal: 10, paddingVertical: 9, marginBottom: 10 },
    routeSummaryTitle: { color: '#1E3A8A', fontSize: 12, fontWeight: '700', marginBottom: 3 },
    routeSummaryText: { color: '#0F172A', fontSize: 12, fontWeight: '600' },
    routeSummaryMeta: { color: '#475569', fontSize: 11, marginTop: 4, lineHeight: 16 },
    routeNotificationRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    routeNotificationLabel: { color: '#1E3A8A', fontSize: 12, fontWeight: '700' },
    offsetOptionsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    offsetChip: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(226,232,240,0.72)', alignItems: 'center', justifyContent: 'center' },
    offsetChipActive: { backgroundColor: '#1D4ED8' },
    offsetChipText: { color: '#475569', fontSize: 12, fontWeight: '700' },
    offsetChipTextActive: { color: '#FFFFFF' },
    routeRemoveButton: { marginTop: 10, minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(254,243,199,0.82)', borderWidth: 1, borderColor: 'rgba(252,211,77,0.72)' },
    routeRemoveButtonDisabled: { opacity: 0.6 },
    routeRemoveButtonText: { color: '#92400E', fontSize: 12, fontWeight: '700' },
    routeSummaryEmptyBox: { backgroundColor: 'rgba(248,250,252,0.72)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', paddingHorizontal: 10, paddingVertical: 9, marginBottom: 10 },
    routeSummaryEmptyText: { color: '#64748B', fontSize: 12, fontWeight: '600' },
    routeButton: { marginBottom: 10, minHeight: 44, backgroundColor: '#7C3AED', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    routeButtonDisabled: { backgroundColor: '#C4B5FD' },
    routeCustomizeButton: { backgroundColor: '#0F766E' },
    routeButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    compactSectionCard: { marginBottom: 10, backgroundColor: 'rgba(248,250,252,0.72)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', paddingHorizontal: 12, paddingVertical: 10 },
    compactSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    compactSectionTextWrap: { flex: 1 },
    compactSectionTitle: { color: '#0F172A', fontSize: 13, fontWeight: '700' },
    compactSectionSummary: { color: '#64748B', fontSize: 11, marginTop: 4, lineHeight: 16 },
    compactSectionToggle: { color: '#1D4ED8', fontSize: 20, fontWeight: '400', width: 20, textAlign: 'center' },
    saveButton: { backgroundColor: '#1D4ED8', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    saveButtonDisabled: { backgroundColor: '#93C5FD' },
    saveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});