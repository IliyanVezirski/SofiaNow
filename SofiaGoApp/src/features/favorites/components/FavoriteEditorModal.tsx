import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { FavoriteLinePreference, FavoritePlace, PlaceSearchResult, getFavoritePresetLabel, hasFavoriteCoordinates, searchLocations } from '../../../services/places';
import { Stop, summarizeStopDirections } from '../../../services/stopsApi';

interface Props {
    visible: boolean;
    favorite: FavoritePlace | null;
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
    }) => void | Promise<void>;
    onSave: (favoriteId: string, updates: {
        name?: string;
        latitude: number | null;
        longitude: number | null;
        selectedStopId: string | null;
        selectedStopName: string | null;
        selectedLines: FavoriteLinePreference[];
    }) => void | Promise<void>;
}

const sortLines = (lines: string[]) => [...lines].sort((left, right) => left.localeCompare(right, 'bg', { numeric: true }));

export const FavoriteEditorModal: React.FC<Props> = ({
    visible,
    favorite,
    searchableStops,
    currentPin,
    currentLocation,
    onClose,
    onConfigureRoute,
    onSave,
}) => {
    const [name, setName] = useState('');
    const [latitude, setLatitude] = useState<number | null>(null);
    const [longitude, setLongitude] = useState<number | null>(null);
    const [locationQuery, setLocationQuery] = useState('');
    const [locationSearchResults, setLocationSearchResults] = useState<PlaceSearchResult[]>([]);
    const [locationSearchLoading, setLocationSearchLoading] = useState(false);
    const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
    const [stopQuery, setStopQuery] = useState('');
    const [linePreferences, setLinePreferences] = useState<FavoriteLinePreference[]>([]);

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
    }, [favorite, visible]);

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
        if (selectedStop?.lines?.length) {
            return sortLines(Array.from(new Set(selectedStop.lines.map((line) => String(line || '').trim().toUpperCase()).filter(Boolean))));
        }

        return sortLines((favorite?.selectedLines || []).map((entry) => entry.line));
    }, [favorite?.selectedLines, selectedStop]);

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
    });

    return (
        <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <ScrollView
                        style={styles.contentScroll}
                        contentContainerStyle={styles.contentScrollInner}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled
                    >
                        <View style={styles.header}>
                            <View>
                                <Text style={styles.title}>{title}</Text>
                                <Text style={styles.subtitle}>Задай място, спирка, линии и известия</Text>
                            </View>
                            <Pressable onPress={onClose} style={styles.closeButton}>
                                <Text style={styles.closeButtonText}>{'×'}</Text>
                            </Pressable>
                        </View>

                        <TextInput
                            style={styles.nameInput}
                            value={name}
                            onChangeText={setName}
                            placeholder="Име на любимо място"
                            placeholderTextColor="#9CA3AF"
                        />

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Локация</Text>
                            <Text style={styles.sectionHint}>Избери адрес, спирка, pin от картата или текуща локация. После натисни бутона за запазване в долната част.</Text>
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
                                style={styles.locationSearchInput}
                                value={locationQuery}
                                onChangeText={setLocationQuery}
                                placeholder="Търси адрес или спирка"
                                placeholderTextColor="#9CA3AF"
                            />
                            {(locationSearchLoading || locationStopResults.length > 0 || locationSearchResults.length > 0) && (
                                <ScrollView style={styles.locationSearchList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
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
                                            <Text style={styles.locationResultTitle}>{`🚌 ${stop.name}`}</Text>
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
                                            <Text style={styles.locationResultTitle}>{`📍 ${result.name}`}</Text>
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
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Спирка, от която тръгваш</Text>
                            <Text style={styles.sectionHint}>След като зададеш адрес или локация, избери спирка оттук и после маркирай линиите отдолу.</Text>
                            <TextInput
                                style={styles.stopInput}
                                value={stopQuery}
                                onChangeText={setStopQuery}
                                placeholder="Търси по име или код на спирка"
                                placeholderTextColor="#9CA3AF"
                            />
                            <ScrollView style={styles.stopList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
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

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Линии и уведомяване</Text>
                            {!selectedStopLines.length && (
                                <Text style={styles.emptyState}>Избери спирка, за да покажем наличните линии.</Text>
                            )}
                            {!!selectedStopLines.length && (
                                <ScrollView style={styles.lineList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
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
                            )}
                        </View>

                        {hasCoordinates && (
                            <TouchableOpacity
                                style={styles.routeButton}
                                onPress={async () => {
                                    await onConfigureRoute(favorite.id, buildDraftUpdates());
                                    onClose();
                                }}
                            >
                                <Text style={styles.routeButtonText}>Настрой маршрут и час</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={[styles.saveButton, !hasCoordinates && styles.saveButtonDisabled]}
                            disabled={!hasCoordinates}
                            onPress={() => {
                                void onSave(favorite.id, buildDraftUpdates());
                                onClose();
                            }}
                        >
                            <Text style={styles.saveButtonText}>Запази мястото</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.35)', justifyContent: 'flex-start', paddingTop: 28, paddingHorizontal: 12 },
    card: { backgroundColor: 'rgba(255,255,255,0.98)', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, maxHeight: '92%' },
    contentScroll: { flexGrow: 0 },
    contentScrollInner: { paddingBottom: 6 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 },
    title: { color: '#111827', fontSize: 16, fontWeight: '700' },
    subtitle: { color: '#6B7280', fontSize: 12, marginTop: 3 },
    closeButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
    closeButtonText: { color: '#374151', fontSize: 16, fontWeight: '700' },
    nameInput: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#D1D5DB', paddingHorizontal: 12, paddingVertical: 10, color: '#111827', fontSize: 14, marginBottom: 12 },
    section: { marginBottom: 14 },
    sectionTitle: { color: '#111827', fontSize: 13, fontWeight: '700', marginBottom: 6 },
    sectionHint: { color: '#6B7280', fontSize: 11, lineHeight: 16, marginBottom: 8 },
    locationText: { color: '#4B5563', fontSize: 12, marginBottom: 8 },
    selectedLocationBox: { backgroundColor: '#ECFDF5', borderRadius: 10, borderWidth: 1, borderColor: '#A7F3D0', paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
    selectedLocationTitle: { color: '#065F46', fontSize: 11, fontWeight: '700', marginBottom: 2 },
    selectedLocationText: { color: '#047857', fontSize: 12, fontWeight: '700' },
    locationSearchInput: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#D1D5DB', paddingHorizontal: 12, paddingVertical: 10, color: '#111827', fontSize: 14, marginBottom: 8 },
    locationSearchList: { maxHeight: 180, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', padding: 8, marginBottom: 8 },
    locationResultRow: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FFFFFF', marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
    locationResultTitle: { color: '#111827', fontSize: 12, fontWeight: '700' },
    locationResultSubtitle: { color: '#6B7280', fontSize: 11, marginTop: 2 },
    locationSearchStatus: { color: '#4B5563', fontSize: 12, textAlign: 'center', paddingVertical: 8 },
    locationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    locationButton: { backgroundColor: '#DBEAFE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
    locationButtonSecondary: { backgroundColor: '#DCFCE7' },
    locationButtonText: { color: '#0F172A', fontSize: 12, fontWeight: '700' },
    stopInput: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#D1D5DB', paddingHorizontal: 12, paddingVertical: 10, color: '#111827', fontSize: 14, marginBottom: 8 },
    stopList: { maxHeight: 170, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', padding: 8 },
    stopRow: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FFFFFF', marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
    stopRowSelected: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
    stopName: { color: '#111827', fontSize: 12, fontWeight: '700' },
    stopMeta: { color: '#6B7280', fontSize: 11, marginTop: 2 },
    lineList: { maxHeight: 190 },
    lineRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
    lineLabelWrap: { width: 48 },
    lineLabel: { color: '#111827', fontSize: 13, fontWeight: '700' },
    toggleWrap: { flex: 1, alignItems: 'center' },
    toggleLabel: { color: '#4B5563', fontSize: 11, fontWeight: '600', marginBottom: 4 },
    emptyState: { color: '#6B7280', fontSize: 12, lineHeight: 17 },
    routeButton: { marginBottom: 10, minHeight: 44, backgroundColor: '#7C3AED', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    routeButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    saveButton: { backgroundColor: '#1D4ED8', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    saveButtonDisabled: { backgroundColor: '#93C5FD' },
    saveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});