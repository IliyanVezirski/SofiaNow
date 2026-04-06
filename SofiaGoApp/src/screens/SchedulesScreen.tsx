import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getVehicleIconName, VehicleType } from '../services/transitUtils';
import { AvailableLine, fetchAvailableLines, fetchLineRouteGeometryByRouteId, fetchLineRouteGeometry, fetchStopById, fetchAllStops, LineRouteGeometry, Stop } from '../services/stopsApi';
import { getStaticStopSchedule, getScheduleBasedDirections, resolveScheduleRouteId, StaticScheduleEntry, DayType, getDayTypeForDate } from '../services/cgmApi';
import { convertTripApiScheduleToRouteGeometry, fetchTripApiAvailableLines, fetchTripApiLineSchedule, getTripApiStopScheduleEntries, TripApiLineSchedule } from '../services/cgmApi/tripScheduleApi';
import { collapseContainedDirections } from '../services/transit/routeDirectionMerge';
import { RouteSelection } from '../types/routes';
import { Ionicons } from '@expo/vector-icons';

type ScheduleKind = 'bus' | 'trolley' | 'tram' | 'subway' | 'night';

const SCHEDULE_KIND_ORDER: ScheduleKind[] = ['bus', 'trolley', 'tram', 'subway', 'night'];

const SCHEDULE_KIND_META: Record<ScheduleKind, { label: string; ionicon: string }> = {
    bus: { label: 'Автобус', ionicon: 'bus-outline' },
    trolley: { label: 'Тролей', ionicon: 'bus-outline' },
    tram: { label: 'Трамвай', ionicon: 'train-outline' },
    subway: { label: 'Метро', ionicon: 'subway-outline' },
    night: { label: 'Нощен', ionicon: 'moon-outline' },
};

const LINE_KIND_TINT: Record<ScheduleKind, string> = {
    bus: 'rgba(220,38,38,0.07)',
    tram: 'rgba(234,138,0,0.07)',
    trolley: 'rgba(37,99,235,0.07)',
    subway: 'rgba(37,99,235,0.07)',
    night: 'rgba(15,23,42,0.07)',
};

const LINE_KIND_BORDER_TINT: Record<ScheduleKind, string> = {
    bus: 'rgba(220,38,38,0.18)',
    tram: 'rgba(234,138,0,0.18)',
    trolley: 'rgba(37,99,235,0.18)',
    subway: 'rgba(37,99,235,0.18)',
    night: 'rgba(15,23,42,0.18)',
};

const getLineKind = (line: AvailableLine): ScheduleKind => {
    if (line.isNight) return 'night';
    if (line.type === 'trolley') return 'trolley';
    if (line.type === 'tram') return 'tram';
    if (line.type === 'subway') return 'subway';
    return 'bus';
};

const collapseShortRouteDirections = (directions: LineRouteGeometry['directions']) => collapseContainedDirections(
    directions,
    (direction) => ({
        ...direction,
        mergedDirectionNames: [...(direction.mergedDirectionNames || [direction.name]).filter(Boolean)],
        coordinates: direction.coordinates.map((coordinate) => [...coordinate] as [number, number]),
        stops: direction.stops.map((stop) => ({ ...stop })),
    }),
    (master, candidate) => {
        const mergedNames = new Set(
            [...(master.mergedDirectionNames || [master.name]), ...(candidate.mergedDirectionNames || [candidate.name])]
                .filter(Boolean),
        );
        master.mergedDirectionNames = Array.from(mergedNames);
    },
);

const getDirectionDisplayLabel = (direction: LineRouteGeometry['directions'][number], fallbackIndex: number) => {
    const firstStopName = direction.stops[0]?.name?.trim() || '';
    const lastStopName = direction.stops[direction.stops.length - 1]?.name?.trim() || '';

    if (firstStopName && lastStopName && firstStopName !== lastStopName) {
        return `${firstStopName} → ${lastStopName}`;
    }

    return direction.name || `Посока ${fallbackIndex + 1}`;
};

const splitStopIdParts = (value: string | null | undefined) => (
    String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
);

const applyCanonicalStopCoordinates = (
    geometry: LineRouteGeometry | null,
    allStops: Stop[],
): LineRouteGeometry | null => {
    if (!geometry || !allStops.length) {
        return geometry;
    }

    const stopByExactId = new Map(allStops.map((stop) => [stop.id, stop]));
    const stopByPartId = new Map<string, Stop>();
    allStops.forEach((stop) => {
        splitStopIdParts(stop.id).forEach((part) => {
            if (!stopByPartId.has(part)) {
                stopByPartId.set(part, stop);
            }
        });
    });

    return {
        ...geometry,
        directions: geometry.directions.map((direction) => ({
            ...direction,
            stops: direction.stops.map((stop) => {
                const canonicalStop = stopByExactId.get(stop.id) || stopByPartId.get(stop.id);
                if (!canonicalStop) {
                    return stop;
                }

                return {
                    ...stop,
                    name: canonicalStop.name || stop.name,
                    latitude: canonicalStop.latitude,
                    longitude: canonicalStop.longitude,
                };
            }),
        })),
    };
};

interface SchedulesScreenProps {
    onOpenRoute?: (route: RouteSelection) => void;
    onClose?: () => void;
    onFocusStop?: (stopId: string, latitude: number, longitude: number) => void;
}

export default function SchedulesScreen({ onOpenRoute, onClose, onFocusStop }: SchedulesScreenProps) {
    const [allLines, setAllLines] = useState<AvailableLine[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedKind, setSelectedKind] = useState<ScheduleKind>('bus');
    const [selectedLine, setSelectedLine] = useState<AvailableLine | null>(null);
    const [routeGeometry, setRouteGeometry] = useState<LineRouteGeometry | null>(null);
    const [routeLoading, setRouteLoading] = useState(false);
    const [stopSearch, setStopSearch] = useState('');
    const [allStops, setAllStops] = useState<Stop[]>([]);
    const [expandedStopId, setExpandedStopId] = useState<string | null>(null);
    const [expandedDirectionId, setExpandedDirectionId] = useState<string | null>(null);
    const [expandedDirectionName, setExpandedDirectionName] = useState<string | null>(null);
    const [expandedDirectionAliases, setExpandedDirectionAliases] = useState<string[]>([]);
    const [stopSchedule, setStopSchedule] = useState<StaticScheduleEntry[]>([]);
    const [selectedDayType, setSelectedDayType] = useState<DayType>(getDayTypeForDate());
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
    const [tripApiLineSchedule, setTripApiLineSchedule] = useState<TripApiLineSchedule | null>(null);

    const normalizeScheduleText = (value: string) => value
        .trim()
        .toLocaleUpperCase('bg-BG')
        .replace(/\s+/g, ' ')
        .replace(/[.\-–—,;:()]/g, '');

    const getFilteredScheduleEntries = (
        stopId: string,
        directionId?: string | null,
        directionName?: string | null,
        directionAliases: string[] = [],
    ) => {
        const tripApiEntries = getTripApiStopScheduleEntries(
            tripApiLineSchedule,
            stopId,
            directionId,
            directionName,
            directionAliases,
            selectedDayType,
        );
        if (tripApiEntries && tripApiEntries.length > 0) {
            return tripApiEntries;
        }

        let schedule = getStaticStopSchedule(stopId, selectedDayType);
        if (!selectedLine) {
            return schedule;
        }

        const lineMatches = schedule.filter((entry) => entry.line === selectedLine.line && entry.type === selectedLine.type);
        const normalizedTargets = Array.from(new Set([
            directionName,
            ...directionAliases,
        ].filter((value): value is string => Boolean(value)).map((value) => normalizeScheduleText(value))));

        if (normalizedTargets.length === 0) {
            return lineMatches;
        }

        const destinationMatches = lineMatches.filter((entry) => {
            const normalizedDestination = normalizeScheduleText(entry.destination);
            return normalizedTargets.some((normalizedTarget) => (
                normalizedDestination === normalizedTarget
                || normalizedDestination.includes(normalizedTarget)
                || normalizedTarget.includes(normalizedDestination)
            ));
        });

        return destinationMatches.length > 0 ? destinationMatches : lineMatches;
    };

    const toggleSection = (key: string) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const schedRouteId = useMemo(() => {
        if (!selectedLine?.routeId) return '';
        return resolveScheduleRouteId(selectedLine.line, selectedLine.type, selectedLine.routeId);
    }, [selectedLine]);

    useEffect(() => {
        (async () => {
            try {
                const [lines, stops] = await Promise.all([
                    fetchTripApiAvailableLines().catch(() => fetchAvailableLines()),
                    fetchAllStops(),
                ]);
                setAllLines(lines);
                setAllStops(stops);
            } catch (error) {
                console.error('Failed to load data:', error);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    useEffect(() => {
        if (!onClose) return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            onClose();
            return true;
        });
        return () => sub.remove();
    }, [onClose]);

    const linesForKind = useMemo(
        () => allLines.filter((line) => getLineKind(line) === selectedKind),
        [allLines, selectedKind],
    );

    const kindCounts = useMemo(() => {
        const counts: Record<ScheduleKind, number> = { bus: 0, trolley: 0, tram: 0, subway: 0, night: 0 };
        allLines.forEach((line) => { counts[getLineKind(line)]++; });
        return counts;
    }, [allLines]);

    const filteredDirections = useMemo(() => {
        if (!routeGeometry) return [];
        const visibleDirections = collapseShortRouteDirections(routeGeometry.directions).filter((direction) => {
            if (!direction.availableDayTypes || direction.availableDayTypes.length === 0) {
                return true;
            }

            return direction.availableDayTypes.includes(selectedDayType);
        });

        const q = stopSearch.trim().toLowerCase();
        if (!q) return visibleDirections;
        return visibleDirections.map((dir) => ({
            ...dir,
            stops: dir.stops.filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)),
        })).filter((dir) => dir.stops.length > 0);
    }, [routeGeometry, selectedDayType, stopSearch]);

    const globalSearchResults = useMemo(() => {
        const q = stopSearch.trim().toLowerCase();
        if (!q || q.length < 2 || selectedLine) return [];
        return allStops
            .filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
            .slice(0, 30);
    }, [allStops, stopSearch, selectedLine]);

    const canonicalStopById = useMemo(() => {
        const result = new Map<string, Stop>();
        allStops.forEach((stop) => {
            result.set(stop.id, stop);
            splitStopIdParts(stop.id).forEach((part) => {
                if (!result.has(part)) {
                    result.set(part, stop);
                }
            });
        });
        return result;
    }, [allStops]);

    const handleStopPress = (
        stopId: string,
        directionId?: string | null,
        directionName?: string | null,
        directionAliases: string[] = [],
    ) => {
        if (expandedStopId === stopId) {
            setExpandedStopId(null);
            setExpandedDirectionId(null);
            setExpandedDirectionName(null);
            setExpandedDirectionAliases([]);
            setStopSchedule([]);
            return;
        }
        setExpandedStopId(stopId);
        setExpandedDirectionId(directionId ?? null);
        setExpandedDirectionName(directionName ?? null);
        setExpandedDirectionAliases(directionAliases);
        setStopSchedule(getFilteredScheduleEntries(stopId, directionId, directionName, directionAliases));
    };

    useEffect(() => {
        if (expandedStopId) {
            setStopSchedule(getFilteredScheduleEntries(expandedStopId, expandedDirectionId, expandedDirectionName, expandedDirectionAliases));
        }
    }, [expandedDirectionAliases, expandedDirectionId, expandedDirectionName, expandedStopId, selectedDayType, selectedLine, tripApiLineSchedule]);

    const formatMinutes = (m: number) => {
        const h = Math.floor(m / 60) % 24;
        const min = m % 60;
        return `${h}:${min < 10 ? '0' : ''}${min}`;
    };

    const nowMinutes = useMemo(() => {
        const d = new Date();
        return d.getHours() * 60 + d.getMinutes();
    }, [expandedStopId]);

    const isToday = selectedDayType === getDayTypeForDate();

    const renderStopSchedule = () => {
        return (
            <>
                <View style={styles.dayTypeRow}>
                    <TouchableOpacity
                        style={[styles.dayTypeChip, selectedDayType === 'w' && styles.dayTypeChipActive]}
                        onPress={() => setSelectedDayType('w')}
                    >
                        <Text style={[styles.dayTypeChipText, selectedDayType === 'w' && styles.dayTypeChipTextActive]}>Делник</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.dayTypeChip, selectedDayType === 'h' && styles.dayTypeChipActive]}
                        onPress={() => setSelectedDayType('h')}
                    >
                        <Text style={[styles.dayTypeChipText, selectedDayType === 'h' && styles.dayTypeChipTextActive]}>Почивен ден</Text>
                    </TouchableOpacity>
                </View>
                {stopSchedule.length === 0 ? (
                    <Text style={styles.stopEtaEmpty}>Няма налично разписание</Text>
                ) : (
                    stopSchedule.map((entry) => {
                        const label = `${entry.line}${entry.destination ? ` → ${entry.destination}` : ''}`;
                        return (
                            <View key={label} style={styles.lineGroup}>
                                <Text style={styles.lineGroupHeader}>{label}</Text>
                                <View style={styles.lineGroupTimes}>
                                    {entry.times.map((m) => {
                                        const isPast = isToday && m < nowMinutes;
                                        const partialTimeKind = entry.partialTimeKinds?.[String(m)];
                                        return (
                                            <Text
                                                key={m}
                                                style={[
                                                    styles.lineGroupTime,
                                                    partialTimeKind === 'start' && styles.lineGroupTimePartialStart,
                                                    partialTimeKind === 'final' && styles.lineGroupTimePartialFinal,
                                                    isPast && styles.stopEtaPast,
                                                ]}
                                            >
                                                {formatMinutes(m)}
                                            </Text>
                                        );
                                    })}
                                </View>
                            </View>
                        );
                    })
                )}
            </>
        );
    };

    useEffect(() => {
        let cancelled = false;

        if (!selectedLine) {
            setRouteGeometry(null);
            setRouteLoading(false);
            setTripApiLineSchedule(null);
            setStopSearch('');
            setExpandedStopId(null);
            setExpandedDirectionId(null);
            setExpandedDirectionName(null);
            setExpandedDirectionAliases([]);
            setStopSchedule([]);
            setExpandedSections(new Set());
            return;
        }

        setRouteLoading(true);

        (async () => {
            let loadedTripApiSchedule: TripApiLineSchedule | null = null;

            try {
                const tripApiSchedule = await fetchTripApiLineSchedule(selectedLine);
                if (!cancelled) {
                    loadedTripApiSchedule = tripApiSchedule?.directions.length ? tripApiSchedule : null;
                    setTripApiLineSchedule(loadedTripApiSchedule);
                }
            } catch (error) {
                if (!cancelled) {
                    setTripApiLineSchedule(null);
                }
                console.warn('Falling back to bundled schedules for line:', selectedLine.line, error);
            }

            let route = selectedLine.routeId
                ? await fetchLineRouteGeometryByRouteId(selectedLine.routeId)
                : await fetchLineRouteGeometry(selectedLine.line, selectedLine.type, selectedLine.isNight);
            // Fallback: build directions from schedule data if lines-data has no/empty geometry
            // or if the stops don't have schedule entries for this route
            const effectiveSchedRouteId = resolveScheduleRouteId(selectedLine.line, selectedLine.type, selectedLine.routeId);
            let needsFallback = !route || route.directions.every((d) => d.stops.length === 0);
            if (!needsFallback && route) {
                // Validate each direction against schedule data.
                // If one direction has no matches (or overall coverage is too low), prefer schedule-based stops.
                const directionHasMatch = route.directions.map((d) => {
                    const testStops = d.stops.slice(0, 5);
                    if (testStops.length === 0) return false;
                    return testStops.some((s) => {
                        const sched = getStaticStopSchedule(s.id, selectedDayType);
                        return sched.some((e) => e.routeId === effectiveSchedRouteId);
                    });
                });

                const sampledStops = route.directions.flatMap((d) => d.stops.slice(0, 8));
                const matchedStops = sampledStops.filter((s) => {
                    const sched = getStaticStopSchedule(s.id, selectedDayType);
                    return sched.some((e) => e.routeId === effectiveSchedRouteId);
                }).length;
                const coverageRatio = sampledStops.length ? (matchedStops / sampledStops.length) : 0;

                const anyDirectionMissing = directionHasMatch.some((hasMatch) => !hasMatch);
                const lowCoverage = sampledStops.length > 0 && coverageRatio < 0.35;
                if (anyDirectionMissing || lowCoverage) needsFallback = true;
            }
            if (needsFallback) {
                const schedDirs = getScheduleBasedDirections(effectiveSchedRouteId);
                if (schedDirs.length > 0) {
                    route = {
                        line: selectedLine.line,
                        type: selectedLine.type,
                        isNight: selectedLine.isNight,
                        directions: schedDirs.map((d) => ({
                            name: d.name,
                            mergedDirectionNames: d.mergedDirectionNames,
                            coordinates: d.stops.map((s) => [s.longitude, s.latitude] as [number, number]),
                            stops: d.stops,
                        })),
                    };
                } else if (loadedTripApiSchedule?.directions.length) {
                    route = convertTripApiScheduleToRouteGeometry(loadedTripApiSchedule);
                }
            }
            if (!cancelled) {
                setRouteGeometry(applyCanonicalStopCoordinates(route, allStops));
                setRouteLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [allStops, selectedLine]);

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#1D4ED8" />
                <Text style={styles.loadingText}>Зареждам линии...</Text>
            </View>
        );
    }

    return (
        <View style={styles.page}>
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={styles.title}>Линии</Text>
                        <Text style={styles.subtitle}>{`${allLines.length} налични линии`}</Text>
                    </View>
                    {onClose && (
                        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                            <Ionicons name="close" size={18} color="#334155" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <View style={styles.globalSearchWrap}>
                <View style={styles.searchInputWrap}>
                    <Ionicons name="search-outline" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
                    <TextInput
                        style={styles.globalSearchInput}
                    placeholder="Търси спирка по име"
                    placeholderTextColor="#9CA3AF"
                    value={stopSearch}
                    onChangeText={(text) => {
                        setStopSearch(text);
                        setExpandedStopId(null);
                        setExpandedDirectionId(null);
                        setExpandedDirectionAliases([]);
                        setStopSchedule([]);
                    }}
                    />
                </View>
            </View>

            {globalSearchResults.length > 0 && !selectedLine ? (
                <ScrollView style={styles.routeArea} contentContainerStyle={styles.routeAreaContent}>
                    <View style={styles.routeCard}>
                        <Text style={styles.routeCardTitle}>{`Резултати (${globalSearchResults.length})`}</Text>
                        {globalSearchResults.map((stop) => (
                            <View
                                key={stop.id}
                                style={[
                                    styles.stopRow,
                                    expandedStopId === stop.id && styles.stopRowActive,
                                ]}
                            >
                                <TouchableOpacity
                                    style={styles.stopRowPressable}
                                    activeOpacity={0.7}
                                    onPress={() => { void handleStopPress(stop.id); }}
                                >
                                    <View style={styles.stopRowMain}>
                                        <View style={styles.stopIndexIcon}>
                                            <Ionicons name="flag-outline" size={13} color="#64748B" />
                                        </View>
                                        <View style={styles.stopInfo}>
                                            <Text style={styles.stopName}>{stop.name}</Text>
                                            <Text style={styles.stopMeta}>{`ID: ${stop.id} • Линии: ${stop.lines.slice(0, 6).join(', ')}`}</Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                                {expandedStopId === stop.id && (
                                    <View style={styles.stopEtaPanel}>
                                        {renderStopSchedule()}
                                    </View>
                                )}
                            </View>
                        ))}
                    </View>
                </ScrollView>
            ) : (
                <>
                    <View style={styles.filtersPanel}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kindCarousel} contentContainerStyle={styles.kindCarouselContent}>
                            {SCHEDULE_KIND_ORDER.map((kind) => (
                                <TouchableOpacity
                                    key={kind}
                                    style={[styles.kindChip, selectedKind === kind && styles.kindChipActive]}
                                    onPress={() => { setSelectedKind(kind); setSelectedLine(null); }}
                                >
                                    <Ionicons name={SCHEDULE_KIND_META[kind].ionicon as any} size={18} color={selectedKind === kind ? '#FFFFFF' : '#475569'} />
                                    <Text style={[styles.kindChipText, selectedKind === kind && styles.chipTextActive]}>
                                        {SCHEDULE_KIND_META[kind].label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <ScrollView style={styles.linesScroll} showsVerticalScrollIndicator={false}>
                            <View style={styles.linesGrid}>
                                {linesForKind.map((line, index) => {
                                    const isActive = selectedLine?.routeId === line.routeId && selectedLine?.line === line.line;
                                    const kind = getLineKind(line);
                                    return (
                                        <TouchableOpacity
                                            key={`schedule-line-${line.routeId || line.line}-${index}`}
                                            style={[
                                                styles.lineChip,
                                                !isActive && { borderColor: LINE_KIND_BORDER_TINT[kind] },
                                                isActive && styles.chipActive,
                                            ]}
                                            onPress={() => {
                                                setExpandedDirectionId(null);
                                                setExpandedDirectionName(null);
                                                setExpandedDirectionAliases([]);
                                                setSelectedLine(isActive ? null : line);
                                            }}
                                        >
                                            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{line.line}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </ScrollView>
                    </View>

                    <ScrollView style={styles.routeArea} contentContainerStyle={styles.routeAreaContent}>
                        {!selectedLine ? (
                            <View style={styles.placeholder}>
                                <Ionicons name={SCHEDULE_KIND_META[selectedKind].ionicon as any} size={40} color="#94A3B8" />
                                <Text style={styles.placeholderText}>Избери линия, за да видиш маршрута</Text>
                            </View>
                        ) : routeLoading ? (
                            <View style={styles.inlineLoader}>
                                <ActivityIndicator size="small" color="#1D4ED8" />
                                <Text style={styles.inlineLoaderText}>Зареждам маршрут...</Text>
                            </View>
                        ) : routeGeometry ? (
                            <View style={styles.routeCard}>
                                <View style={styles.routeCardHeader}>
                                    <View style={styles.routeCardTitleRow}>
                                        <Ionicons name={getVehicleIconName(selectedLine.type) as any} size={16} color="#1F2937" />
                                        <Text style={styles.routeCardTitle} numberOfLines={1}>
                                            Линия {selectedLine.line}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.mapButton}
                                        activeOpacity={0.7}
                                        onPress={() => {
                                            if (onOpenRoute) {
                                                onOpenRoute({
                                                    line: selectedLine.line,
                                                    type: selectedLine.isNight ? 'bus' : selectedLine.type,
                                                    isNight: selectedLine.isNight,
                                                    routeId: selectedLine.routeId || undefined,
                                                });
                                            }
                                        }}
                                    >
                                        <Ionicons name="map-outline" size={14} color="#FFFFFF" />
                                        <Text style={styles.mapButtonText}>На картата</Text>
                                    </TouchableOpacity>
                                </View>

                                {filteredDirections.map((direction, dirIndex) => {
                                    const dirKey = `dir-${dirIndex}`;
                                    const isExpanded = expandedSections.has(dirKey);
                                    return (
                                        <View key={dirKey} style={styles.accordionSection}>
                                            <TouchableOpacity
                                                style={styles.accordionHeader}
                                                activeOpacity={0.7}
                                                onPress={() => toggleSection(dirKey)}
                                            >
                                                <View style={{ flex: 1 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                        <Ionicons name="navigate-outline" size={14} color="#475569" />
                                                        <Text style={styles.accordionHeaderText} numberOfLines={2}>
                                                            {getDirectionDisplayLabel(direction, dirIndex)}
                                                        </Text>
                                                    </View>
                                                    <Text style={styles.accordionSubText}>{`${direction.stops.length} спирки`}</Text>
                                                </View>
                                                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#64748B" />
                                            </TouchableOpacity>
                                            {isExpanded && (
                                                <View style={styles.accordionBody}>
                                                    {direction.stops.map((stop, stopIndex) => (
                                                        <View
                                                            key={`${dirIndex}-${stop.id}-${stopIndex}`}
                                                            style={[
                                                                styles.stopRow,
                                                                expandedStopId === stop.id && styles.stopRowActive,
                                                            ]}
                                                        >
                                                            <TouchableOpacity
                                                                style={styles.stopRowPressable}
                                                                activeOpacity={0.7}
                                                                onPress={() => { void handleStopPress(stop.id, direction.id, direction.name, direction.mergedDirectionNames || []); }}
                                                            >
                                                                <View style={styles.stopRowMain}>
                                                                    <Text style={styles.stopIndex}>{`${stopIndex + 1}.`}</Text>
                                                                    <View style={styles.stopInfo}>
                                                                        <Text style={styles.stopName}>{stop.name}</Text>
                                                                        <Text style={styles.stopMeta}>{`ID: ${stop.id}`}</Text>
                                                                    </View>
                                                                    {onFocusStop && (
                                                                        <TouchableOpacity
                                                                            style={styles.stopMapBtn}
                                                                            onPress={() => {
                                                                                const canonicalStop = canonicalStopById.get(stop.id);
                                                                                const latitude = canonicalStop?.latitude ?? stop.latitude;
                                                                                const longitude = canonicalStop?.longitude ?? stop.longitude;
                                                                                onFocusStop(stop.id, latitude, longitude);
                                                                            }}
                                                                        >
                                                                                <Ionicons name="locate-outline" size={14} color="#475569" />
                                                                        </TouchableOpacity>
                                                                    )}
                                                                </View>
                                                            </TouchableOpacity>
                                                            {expandedStopId === stop.id && (
                                                                <View style={styles.stopEtaPanel}>
                                                                    {renderStopSchedule()}
                                                                </View>
                                                            )}
                                                        </View>
                                                    ))}
                                                </View>
                                            )}
                                        </View>
                                    );
                                })}

                                {filteredDirections.length === 0 && stopSearch.trim() !== '' && (
                                    <Text style={styles.emptyText}>Няма спирки, съвпадащи с търсенето</Text>
                                )}
                            </View>
                        ) : (
                            <Text style={styles.emptyText}>Няма данни за маршрута.</Text>
                        )}
                    </ScrollView>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    page: {
        flex: 1,
        backgroundColor: 'transparent',
        paddingTop: 8,
    },
    header: {
        paddingHorizontal: 14,
        paddingTop: 6,
        paddingBottom: 10,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(248,250,252,0.72)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
    },
    closeButtonText: {
        fontSize: 22,
        color: '#334155',
        fontWeight: '600',
        lineHeight: 24,
    },
    title: {
        color: '#0F172A',
        fontSize: 20,
        fontWeight: '700',
    },
    subtitle: {
        marginTop: 2,
        color: '#475569',
        fontSize: 12,
        fontWeight: '600',
    },
    globalSearchWrap: {
        paddingHorizontal: 12,
        marginBottom: 8,
    },
    searchInputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.72)',
        borderRadius: 12,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
    },
    globalSearchInput: {
        flex: 1,
        paddingVertical: 10,
        fontSize: 14,
        color: '#0F172A',
    },
    filtersPanel: {
        marginHorizontal: 12,
        marginBottom: 6,
        backgroundColor: 'rgba(255,255,255,0.74)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        borderRadius: 18,
        padding: 8,
    },
    kindCarousel: {
        marginBottom: 6,
        marginHorizontal: -8,
    },
    kindCarouselContent: {
        paddingHorizontal: 8,
        gap: 6,
    },
    kindChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(248,250,252,0.72)',
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
    },
    kindChipActive: {
        backgroundColor: 'rgba(29,78,216,0.82)',
        borderColor: 'rgba(29,78,216,0.82)',
    },
    kindChipText: {
        color: '#475569',
        fontSize: 13,
        fontWeight: '700',
    },
    linesScroll: {
        maxHeight: 120,
    },
    linesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginRight: -5,
    },
    lineChip: {
        backgroundColor: 'rgba(248,250,252,0.72)',
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        marginRight: 5,
        marginBottom: 5,
        minWidth: '15%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    chipActive: {
        backgroundColor: 'rgba(29,78,216,0.82)',
        borderColor: 'rgba(29,78,216,0.82)',
    },
    chipText: {
        color: '#1E293B',
        fontSize: 12,
        fontWeight: '700',
    },
    chipTextActive: {
        color: '#FFFFFF',
    },
    routeArea: {
        flex: 1,
    },
    routeAreaContent: {
        paddingHorizontal: 12,
        paddingBottom: 32,
    },
    placeholder: {
        marginTop: 48,
        alignItems: 'center',
        gap: 10,
    },
    placeholderIcon: {
        fontSize: 40,
        display: 'none',
    },
    placeholderText: {
        color: '#64748B',
        fontSize: 14,
        fontWeight: '600',
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    loadingText: {
        marginTop: 10,
        color: '#334155',
        fontSize: 14,
        fontWeight: '600',
    },
    inlineLoader: {
        marginTop: 36,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    inlineLoaderText: {
        color: '#334155',
        fontSize: 12,
        fontWeight: '600',
    },
    routeCard: {
        backgroundColor: 'rgba(255,255,255,0.74)',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        padding: 12,
    },
    routeCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
        gap: 8,
    },
    routeCardTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flex: 1,
        minWidth: 0,
    },
    routeCardTitle: {
        color: '#1E293B',
        fontSize: 16,
        fontWeight: '700',
        flexShrink: 1,
    },
    mapButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderRadius: 12,
        backgroundColor: 'rgba(29,78,216,0.82)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        flexShrink: 0,
    },
    mapButtonText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },

    accordionSection: {
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        borderRadius: 14,
        marginBottom: 10,
        overflow: 'hidden',
    },
    accordionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(248,250,252,0.68)',
        paddingHorizontal: 12,
        paddingVertical: 11,
        gap: 8,
    },
    accordionHeaderText: {
        color: '#1E293B',
        fontSize: 14,
        fontWeight: '700',
        flex: 1,
    },
    accordionSubText: {
        color: '#64748B',
        fontSize: 11,
        fontWeight: '600',
        marginTop: 1,
    },

    accordionBody: {
        padding: 10,
        backgroundColor: 'rgba(255,255,255,0.68)',
    },
    directionTitle: {
        color: '#1E293B',
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 6,
    },
    stopRow: {
        width: '100%',
        alignSelf: 'stretch',
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderTopWidth: 1,
        borderTopColor: 'rgba(226,232,240,0.72)',
        borderRadius: 12,
    },
    stopRowPressable: {
        width: '100%',
    },
    stopRowMain: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        width: '100%',
    },
    stopRowActive: {
        backgroundColor: 'rgba(248,250,252,0.84)',
    },
    stopIndex: {
        width: 28,
        color: '#64748B',
        fontSize: 12,
        fontWeight: '700',
        paddingTop: 1,
    },
    stopIndexIcon: {
        width: 28,
        alignItems: 'center',
        paddingTop: 2,
    },
    stopInfo: {
        flex: 1,
        minWidth: 0,
    },
    stopName: {
        color: '#0F172A',
        fontSize: 12,
        fontWeight: '700',
    },
    stopMeta: {
        color: '#64748B',
        fontSize: 11,
        marginTop: 1,
    },
    stopMapBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(248,250,252,0.72)',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 4,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
    },
    stopEtaPanel: {
        marginTop: 8,
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: 'rgba(226,232,240,0.72)',
        width: '100%',
        alignSelf: 'stretch',
    },
    dayTypeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 8,
    },
    dayTypeChip: {
        backgroundColor: 'rgba(248,250,252,0.72)',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
    },
    dayTypeChipActive: {
        backgroundColor: 'rgba(30,41,59,0.88)',
        borderColor: 'rgba(30,41,59,0.88)',
    },
    dayTypeChipText: {
        color: '#475569',
        fontSize: 12,
        fontWeight: '700',
    },
    dayTypeChipTextActive: {
        color: '#FFFFFF',
    },
    stopEtaText: {
        color: '#1E293B',
        fontSize: 12,
        marginBottom: 5,
    },
    stopEtaPast: {
        color: '#94A3B8',
    },
    stopEtaEmpty: {
        color: '#94A3B8',
        fontSize: 12,
        fontStyle: 'italic',
    },
    lineGroup: {
        marginBottom: 8,
    },
    lineGroupHeader: {
        fontWeight: '700',
        fontSize: 13,
        color: '#1E293B',
        marginBottom: 4,
    },
    lineGroupTimes: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 6,
    },
    lineGroupTime: {
        backgroundColor: 'rgba(248,250,252,0.72)',
        borderRadius: 8,
        width: '15.6%',
        paddingHorizontal: 2,
        paddingVertical: 4,
        textAlign: 'center',
        fontSize: 11,
        color: '#1E293B',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.56)',
    },
    lineGroupTimePartialStart: {
        backgroundColor: '#FDE68A',
        color: '#1E293B',
    },
    lineGroupTimePartialFinal: {
        backgroundColor: '#DC2626',
        color: '#FFFFFF',
    },
    emptyText: {
        color: '#475569',
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
        marginTop: 36,
    },
});
