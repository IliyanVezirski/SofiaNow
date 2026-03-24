import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { FAVORITE_COMMUTE_WEEKDAY_OPTIONS, FavoriteCommutePlan, FavoriteCommuteWeekday, FavoriteLinePreference, FavoritePlace, PlaceSearchResult, formatFavoriteCommuteWeekdays, hasFavoriteCoordinates, searchLocations } from '../../../services/places';
import { Itinerary, PlanType, TripLocation, planTrip } from '../../../services/tripPlanner';
import { cancelCommuteRouteNotification, scheduleCommuteRouteNotification } from '../../../services/notifications/commuteRouteNotifications';
import { Stop } from '../../../services/stopsApi';

interface Props {
    visible: boolean;
    targetFavorite: FavoritePlace | null;
    currentLocation?: { latitude: number; longitude: number } | null;
    searchableStops: Stop[];
    onClose: () => void;
    onSave: (favoriteId: string, payload: {
        commutePlan: FavoriteCommutePlan | null;
        destinationLatitude: number | null;
        destinationLongitude: number | null;
        selectedStopId?: string | null;
        selectedStopName?: string | null;
        selectedLines?: FavoriteLinePreference[];
    }) => Promise<void> | void;
}

const PLAN_LABELS: Record<PlanType, string> = {
    '0': 'По-малко чакане',
    '1': 'По-малко ходене',
    '2': 'По-малко прекачвания',
};

const fmtTime = (epoch: number) => {
    const date = new Date(epoch);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const fmtDuration = (secs: number) => {
    const minutes = Math.round(secs / 60);
    if (minutes < 60) return `${minutes} мин`;
    return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
};

const REMINDER_OFFSET_OPTIONS = [5, 10] as const;

const formatDateForApi = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatDateForInput = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
};

const formatTimeForInput = (date: Date) => (
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
);

const parseInputDate = (value: string) => {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(value || '').trim());
    if (!match) {
        return null;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
        return null;
    }

    return parsed;
};

const normalizeDateInput = (value: string) => value.replace(/[^\d.]/g, '').slice(0, 10);
const normalizeTimeInput = (value: string) => value.replace(/[^\d:]/g, '').slice(0, 5);
const isValidTimeInput = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || '').trim());

const formatReminderTimeFromItineraryStart = (startEpoch: number, minutesBefore: number) => {
    const reminderDate = new Date(startEpoch - (minutesBefore * 60 * 1000));
    return `${String(reminderDate.getHours()).padStart(2, '0')}:${String(reminderDate.getMinutes()).padStart(2, '0')}`;
};

const buildTripLocation = (name: string, latitude: number | null, longitude: number | null): TripLocation | null => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    return {
        latitude: latitude as number,
        longitude: longitude as number,
        name,
    };
};

const buildItinerarySummary = (itinerary: Itinerary) => {
    const routeParts = itinerary.legs
        .map((leg) => (leg.route?.shortName ? leg.route.shortName : (leg.mode === 'WALK' ? '🚶' : leg.mode)))
        .join(' • ');
    return `${fmtTime(itinerary.startTime)} → ${fmtTime(itinerary.endTime)} • ${fmtDuration(itinerary.duration)} • ${routeParts}`;
};

const getTransitLegs = (itinerary: Itinerary) => itinerary.legs.filter((leg) => leg.mode !== 'WALK' && !!leg.route?.shortName);

const inferSelectedLines = (itinerary: Itinerary): FavoriteLinePreference[] => {
    const uniqueLines = Array.from(new Set(getTransitLegs(itinerary).map((leg) => String(leg.route?.shortName || '').trim().toUpperCase()).filter(Boolean)));
    return uniqueLines.map((line) => ({
        line,
        enabled: true,
        notificationsEnabled: false,
    }));
};

const inferSelectedStop = (itinerary: Itinerary, searchableStops: Stop[]) => {
    const firstTransitLeg = getTransitLegs(itinerary)[0];
    if (!firstTransitLeg) {
        return { selectedStopId: null, selectedStopName: null };
    }

    const stopCode = String(firstTransitLeg.from.stop?.code || '').trim();
    if (stopCode) {
        const exactMatch = searchableStops.find((stop) => stop.id === stopCode);
        if (exactMatch) {
            return { selectedStopId: exactMatch.id, selectedStopName: exactMatch.name };
        }
    }

    const byName = searchableStops.find((stop) => stop.name.trim().toLowerCase() === firstTransitLeg.from.name.trim().toLowerCase());
    if (byName) {
        return { selectedStopId: byName.id, selectedStopName: byName.name };
    }

    return {
        selectedStopId: stopCode || null,
        selectedStopName: firstTransitLeg.from.name || null,
    };
};

const getLegLabel = (mode: string) => {
    switch (mode) {
        case 'WALK':
            return 'Ходене';
        case 'BUS':
            return 'Автобус';
        case 'TRAM':
            return 'Трамвай';
        case 'TROLLEYBUS':
            return 'Тролей';
        case 'SUBWAY':
            return 'Метро';
        default:
            return mode;
    }
};

export const FavoriteRoutePlannerModal: React.FC<Props> = ({ visible, targetFavorite, currentLocation, searchableStops, onClose, onSave }) => {
    const initialNow = new Date();
    const [originName, setOriginName] = useState('');
    const [originLatitude, setOriginLatitude] = useState<number | null>(null);
    const [originLongitude, setOriginLongitude] = useState<number | null>(null);
    const [originQuery, setOriginQuery] = useState('');
    const [originSearchResults, setOriginSearchResults] = useState<PlaceSearchResult[]>([]);
    const [originSearchLoading, setOriginSearchLoading] = useState(false);
    const [destinationLatitude, setDestinationLatitude] = useState<number | null>(null);
    const [destinationLongitude, setDestinationLongitude] = useState<number | null>(null);
    const [destinationQuery, setDestinationQuery] = useState('');
    const [destinationSearchResults, setDestinationSearchResults] = useState<PlaceSearchResult[]>([]);
    const [destinationSearchLoading, setDestinationSearchLoading] = useState(false);
    const [isEditingDestination, setIsEditingDestination] = useState(false);
    const [planType, setPlanType] = useState<PlanType>('0');
    const [routeDateInput, setRouteDateInput] = useState(formatDateForInput(initialNow));
    const [routeTimeInput, setRouteTimeInput] = useState(formatTimeForInput(initialNow));
    const [reminderOffsetMinutes, setReminderOffsetMinutes] = useState<number>(5);
    const [reminderWeekdays, setReminderWeekdays] = useState<FavoriteCommuteWeekday[]>(FAVORITE_COMMUTE_WEEKDAY_OPTIONS.map((option) => option.value));
    const [itineraries, setItineraries] = useState<Itinerary[]>([]);
    const [selectedItineraryIndex, setSelectedItineraryIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notificationEnabled, setNotificationEnabled] = useState(false);

    useEffect(() => {
        const normalizedQuery = originQuery.trim();
        if (!visible || !normalizedQuery || normalizedQuery === originName.trim()) {
            setOriginSearchResults([]);
            setOriginSearchLoading(false);
            return;
        }

        let isMounted = true;
        setOriginSearchLoading(true);
        const timer = setTimeout(() => {
            void (async () => {
                try {
                    const results = await searchLocations(normalizedQuery, 6);
                    if (isMounted) {
                        setOriginSearchResults(results);
                    }
                } catch {
                    if (isMounted) {
                        setOriginSearchResults([]);
                    }
                } finally {
                    if (isMounted) {
                        setOriginSearchLoading(false);
                    }
                }
            })();
        }, 320);

        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [originName, originQuery, visible]);

    useEffect(() => {
        const normalizedQuery = destinationQuery.trim();
        if (!visible || !isEditingDestination || !normalizedQuery) {
            setDestinationSearchResults([]);
            setDestinationSearchLoading(false);
            return;
        }

        let isMounted = true;
        setDestinationSearchLoading(true);
        const timer = setTimeout(() => {
            void (async () => {
                try {
                    const results = await searchLocations(normalizedQuery, 6);
                    if (isMounted) {
                        setDestinationSearchResults(results);
                    }
                } catch {
                    if (isMounted) {
                        setDestinationSearchResults([]);
                    }
                } finally {
                    if (isMounted) {
                        setDestinationSearchLoading(false);
                    }
                }
            })();
        }, 320);

        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [destinationQuery, isEditingDestination, visible]);

    useEffect(() => {
        if (!visible || !targetFavorite) {
            return;
        }

        const existingPlan = targetFavorite.defaultCommute;
        if (existingPlan?.originName && Number.isFinite(existingPlan.originLatitude) && Number.isFinite(existingPlan.originLongitude)) {
            setOriginName(existingPlan.originName);
            setOriginLatitude(existingPlan.originLatitude);
            setOriginLongitude(existingPlan.originLongitude);
            setOriginQuery(existingPlan.originName);
        } else if (currentLocation) {
            setOriginName('Моята локация');
            setOriginLatitude(currentLocation.latitude);
            setOriginLongitude(currentLocation.longitude);
            setOriginQuery('Моята локация');
        } else {
            setOriginName('');
            setOriginLatitude(null);
            setOriginLongitude(null);
            setOriginQuery('');
        }

        setDestinationLatitude(targetFavorite.latitude);
        setDestinationLongitude(targetFavorite.longitude);
        setDestinationQuery('');
        setDestinationSearchResults([]);
        setDestinationSearchLoading(false);
        setIsEditingDestination(false);
        setOriginSearchResults([]);
        setOriginSearchLoading(false);
        setPlanType(existingPlan?.planType || '0');
        setRouteDateInput(existingPlan?.routeDate || formatDateForInput(new Date()));
        setRouteTimeInput(existingPlan?.routeTime || formatTimeForInput(new Date()));
        setReminderOffsetMinutes(existingPlan?.reminderOffsetMinutes === 10 ? 10 : 5);
        setReminderWeekdays(existingPlan?.reminderWeekdays?.length ? existingPlan.reminderWeekdays : FAVORITE_COMMUTE_WEEKDAY_OPTIONS.map((option) => option.value));
        setSelectedItineraryIndex(existingPlan?.itineraryIndex || 0);
        setNotificationEnabled(existingPlan?.notificationEnabled || false);
        setItineraries([]);
        setError(null);
    }, [
        visible,
        targetFavorite?.id,
        targetFavorite?.defaultCommute?.lastPlannedAt,
    ]);

    if (!targetFavorite) {
        return null;
    }

    const existingPlan = targetFavorite.defaultCommute;
    const arriveBy = true;
    const canPlanRoute = Number.isFinite(originLatitude) && Number.isFinite(originLongitude) && Number.isFinite(destinationLatitude) && Number.isFinite(destinationLongitude);
    const selectedItinerary = itineraries[selectedItineraryIndex] ?? null;
    const derivedArriveByReminderTime = selectedItinerary
        ? formatReminderTimeFromItineraryStart(selectedItinerary.startTime, reminderOffsetMinutes)
        : null;

    const toggleReminderWeekday = (weekday: FavoriteCommuteWeekday) => {
        setReminderWeekdays((previous) => {
            const exists = previous.includes(weekday);
            if (exists) {
                const next = previous.filter((candidate) => candidate !== weekday);
                return next.length ? next : previous;
            }

            return FAVORITE_COMMUTE_WEEKDAY_OPTIONS
                .map((option) => option.value)
                .filter((candidate) => previous.includes(candidate) || candidate === weekday);
        });
    };

    const doPlanRoute = async () => {
        const from = buildTripLocation(originName || 'Начална точка', originLatitude, originLongitude);
        const to = buildTripLocation(targetFavorite.name, destinationLatitude, destinationLongitude);
        if (!from || !to) {
            setError('Задай начална точка и крайна точка с локация.');
            return;
        }

        const parsedDate = parseInputDate(routeDateInput);
        if (!parsedDate) {
            setError('Датата трябва да е във формат ДД.ММ.ГГГГ');
            return;
        }

        if (!isValidTimeInput(routeTimeInput)) {
            setError('Часът трябва да е във формат ЧЧ:ММ');
            return;
        }

        setLoading(true);
        setError(null);
        setItineraries([]);
        try {
            const result = await planTrip({
                from,
                to,
                type: planType,
                date: formatDateForApi(parsedDate),
                time: routeTimeInput.trim(),
                arriveBy: true,
            });
            if (!result.length) {
                setError('Не е намерен маршрут.');
            } else {
                setItineraries(result);
                setSelectedItineraryIndex(0);
            }
        } catch (routeError: any) {
            setError(routeError?.message || 'Грешка при изчисляване на маршрут.');
        } finally {
            setLoading(false);
        }
    };

    const savePlan = async () => {
        if (!selectedItinerary) {
            setError('Избери маршрут, който да запазим.');
            return;
        }

        const inferredStop = inferSelectedStop(selectedItinerary, searchableStops);
        const inferredLines = inferSelectedLines(selectedItinerary);
        const effectiveReminderTime = derivedArriveByReminderTime;

        let notificationIds = existingPlan?.notificationIds || [];
        if (notificationEnabled) {
            if (!effectiveReminderTime) {
                setError('Липсва час за уведомление.');
                return;
            }
            if (!reminderWeekdays.length) {
                setError('Избери поне един ден за повтарящо се уведомление.');
                return;
            }

            const scheduled = await scheduleCommuteRouteNotification({
                sourceName: originName || 'Начална точка',
                destinationName: targetFavorite.name,
                routeSummary: buildItinerarySummary(selectedItinerary),
                reminderTime: effectiveReminderTime,
                weekdays: reminderWeekdays,
                existingNotificationIds: existingPlan?.notificationIds || [],
            });

            if (!scheduled.ok) {
                setError(scheduled.message);
                return;
            }

            notificationIds = scheduled.notificationIds || [];
        } else if (existingPlan?.notificationIds?.length) {
            await cancelCommuteRouteNotification(existingPlan.notificationIds);
            notificationIds = [];
        }

        await onSave(targetFavorite.id, {
            commutePlan: {
                originName: originName || 'Начална точка',
                originLatitude,
                originLongitude,
                destinationFavoriteId: targetFavorite.id,
                destinationFavoriteName: targetFavorite.name,
                planType,
                routeDate: routeDateInput.trim(),
                routeTime: routeTimeInput.trim(),
                arriveBy: true,
                routeStartTime: fmtTime(selectedItinerary.startTime),
                reminderOffsetMinutes: reminderOffsetMinutes,
                reminderWeekdays,
                itineraryIndex: selectedItineraryIndex,
                itinerarySummary: buildItinerarySummary(selectedItinerary),
                routeLabel: `${originName || 'Начална точка'} → ${targetFavorite.name}`,
                reminderTime: notificationEnabled ? effectiveReminderTime : derivedArriveByReminderTime,
                notificationEnabled,
                notificationIds,
                lastPlannedAt: Date.now(),
            },
            destinationLatitude,
            destinationLongitude,
            selectedStopId: inferredStop.selectedStopId,
            selectedStopName: inferredStop.selectedStopName,
            selectedLines: inferredLines,
        });
        onClose();
    };

    return (
        <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} nestedScrollEnabled>
                        <View style={styles.header}>
                            <View>
                                <Text style={styles.title}>Маршрут и час</Text>
                                <Text style={styles.subtitle}>Настрой маршрут за това място</Text>
                            </View>
                            <Pressable onPress={onClose} style={styles.closeButton}>
                                <Text style={styles.closeButtonText}>{'×'}</Text>
                            </Pressable>
                        </View>

                        <View style={styles.placesSummaryBox}>
                            <View style={styles.placeSummaryRow}>
                                <Text style={styles.placeSummaryLabel}>От</Text>
                                <Text style={styles.placeSummaryValue}>{originName || 'Моята локация'}</Text>
                            </View>
                            <View style={styles.placeSummaryRow}>
                                <Text style={styles.placeSummaryLabel}>До</Text>
                                <Text style={styles.placeSummaryValue}>{targetFavorite.name}</Text>
                            </View>
                        </View>

                        <Text style={styles.sectionTitle}>Начална точка</Text>
                        <Text style={styles.sectionHint}>По подразбиране началната точка е твоята локация. Ако искаш да я смениш, потърси адрес отдолу.</Text>
                        <TextInput
                            style={styles.originInput}
                            value={originQuery}
                            onChangeText={setOriginQuery}
                            placeholder="Промени началната точка по адрес"
                            placeholderTextColor="#94A3B8"
                        />
                        {(originSearchLoading || originSearchResults.length > 0) && (
                            <ScrollView style={styles.originResultsList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                {originSearchResults.map((result) => (
                                    <TouchableOpacity
                                        key={result.id}
                                        style={styles.originResultRow}
                                        onPress={() => {
                                            setOriginName(result.name);
                                            setOriginLatitude(result.latitude);
                                            setOriginLongitude(result.longitude);
                                            setOriginQuery(result.name);
                                            setOriginSearchResults([]);
                                        }}
                                    >
                                        <Text style={styles.originResultTitle}>{`📍 ${result.name}`}</Text>
                                        <Text style={styles.originResultSubtitle}>{result.subtitle}</Text>
                                    </TouchableOpacity>
                                ))}
                                {originSearchLoading && <Text style={styles.originSearchStatus}>Търсене...</Text>}
                            </ScrollView>
                        )}
                        <Text style={styles.sectionTitle}>Крайна точка</Text>
                        <TouchableOpacity
                            style={[styles.destinationFixedBox, isEditingDestination && styles.destinationFixedBoxActive]}
                            onPress={() => setIsEditingDestination((previous) => !previous)}
                        >
                            <Text style={styles.destinationFixedTitle}>{targetFavorite.name}</Text>
                            <Text style={styles.destinationFixedText}>
                                {Number.isFinite(destinationLatitude) && Number.isFinite(destinationLongitude)
                                    ? `${(destinationLatitude as number).toFixed(5)}, ${(destinationLongitude as number).toFixed(5)}`
                                    : 'Няма зададена локация'}
                            </Text>
                        </TouchableOpacity>
                        {isEditingDestination && (
                            <>
                                <TextInput
                                    style={styles.originInput}
                                    value={destinationQuery}
                                    onChangeText={setDestinationQuery}
                                    placeholder="Търси нов адрес за крайната точка"
                                    placeholderTextColor="#94A3B8"
                                />
                                {(destinationSearchLoading || destinationSearchResults.length > 0) && (
                                    <ScrollView style={styles.originResultsList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                        {destinationSearchResults.map((result) => (
                                            <TouchableOpacity
                                                key={result.id}
                                                style={styles.originResultRow}
                                                onPress={() => {
                                                    setDestinationLatitude(result.latitude);
                                                    setDestinationLongitude(result.longitude);
                                                    setDestinationQuery(result.name);
                                                    setDestinationSearchResults([]);
                                                    setIsEditingDestination(false);
                                                }}
                                            >
                                                <Text style={styles.originResultTitle}>{`📍 ${result.name}`}</Text>
                                                <Text style={styles.originResultSubtitle}>{result.subtitle}</Text>
                                            </TouchableOpacity>
                                        ))}
                                        {destinationSearchLoading && <Text style={styles.originSearchStatus}>Търсене...</Text>}
                                    </ScrollView>
                                )}
                            </>
                        )}

                        <Text style={styles.sectionTitle}>Тип маршрут</Text>
                        <View style={styles.planTypesRow}>
                            {(['0', '1', '2'] as PlanType[]).map((type) => (
                                <TouchableOpacity key={type} style={[styles.planTypeButton, planType === type && styles.planTypeButtonActive]} onPress={() => setPlanType(type)}>
                                    <Text style={[styles.planTypeButtonText, planType === type && styles.planTypeButtonTextActive]}>{PLAN_LABELS[type]}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.sectionTitle}>Ден и час за маршрута</Text>
                        <View style={styles.quickActionRow}>
                            <TouchableOpacity
                                style={styles.quickActionChip}
                                onPress={() => {
                                    const now = new Date();
                                    setRouteDateInput(formatDateForInput(now));
                                    setRouteTimeInput(formatTimeForInput(now));
                                }}
                            >
                                <Text style={styles.quickActionChipText}>Днес</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.quickActionChip}
                                onPress={() => {
                                    const tomorrow = new Date();
                                    tomorrow.setDate(tomorrow.getDate() + 1);
                                    setRouteDateInput(formatDateForInput(tomorrow));
                                }}
                            >
                                <Text style={styles.quickActionChipText}>Утре</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.quickActionChip}
                                onPress={() => setRouteTimeInput(formatTimeForInput(new Date()))}
                            >
                                <Text style={styles.quickActionChipText}>Сега</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.routeDateTimeRow}>
                            <View style={styles.routeDateInputWrap}>
                                <Text style={styles.routeDateTimeLabel}>Дата</Text>
                                <TextInput
                                    style={styles.originInput}
                                    value={routeDateInput}
                                    onChangeText={(value) => setRouteDateInput(normalizeDateInput(value))}
                                    placeholder="24.03.2026"
                                    placeholderTextColor="#94A3B8"
                                    keyboardType="number-pad"
                                />
                            </View>
                            <View style={styles.routeTimeInputWrap}>
                                <Text style={styles.routeDateTimeLabel}>Час</Text>
                                <TextInput
                                    style={styles.originInput}
                                    value={routeTimeInput}
                                    onChangeText={(value) => setRouteTimeInput(normalizeTimeInput(value))}
                                    placeholder="08:30"
                                    placeholderTextColor="#94A3B8"
                                    keyboardType="numbers-and-punctuation"
                                />
                            </View>
                        </View>

                        <View style={styles.arriveByFixedBox}>
                            <Text style={styles.arriveByFixedLabel}>Режим на маршрута</Text>
                            <Text style={styles.arriveByFixedValue}>Пристигане до</Text>
                        </View>

                        <TouchableOpacity style={[styles.searchButton, !canPlanRoute && styles.searchButtonDisabled]} disabled={!canPlanRoute || loading} onPress={doPlanRoute}>
                            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.searchButtonText}>Изчисли маршрут</Text>}
                        </TouchableOpacity>

                        {error ? <Text style={styles.errorText}>{error}</Text> : null}

                        {!!itineraries.length && (
                            <>
                                <Text style={styles.sectionTitle}>Избери маршрут</Text>
                                {itineraries.map((itinerary, index) => {
                                    const active = index === selectedItineraryIndex;
                                    return (
                                        <View key={`${itinerary.startTime}-${index}`}>
                                            <TouchableOpacity style={[styles.routeCard, active && styles.routeCardActive]} onPress={() => setSelectedItineraryIndex(index)}>
                                                <Text style={styles.routeSummary}>{buildItinerarySummary(itinerary)}</Text>
                                            </TouchableOpacity>
                                            {active && (
                                                <View style={styles.routeDetailsBox}>
                                                    {itinerary.legs.map((leg, legIndex) => (
                                                        <View key={`${itinerary.startTime}-${index}-${legIndex}`} style={styles.routeDetailRow}>
                                                            <Text style={styles.routeDetailMode}>
                                                                {leg.route?.shortName ? `${getLegLabel(leg.mode)} ${leg.route.shortName}` : getLegLabel(leg.mode)}
                                                            </Text>
                                                            <Text style={styles.routeDetailText}>{`${leg.from.name} • ${fmtTime(leg.from.departureTime)} → ${leg.to.name} • ${fmtTime(leg.to.arrivalTime)}`}</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            )}
                                        </View>
                                    );
                                })}
                            </>
                        )}

                        <Text style={styles.sectionTitle}>Известяване</Text>
                        <View style={styles.reminderRow}>
                            <View style={styles.switchWrap}>
                                <Text style={styles.switchLabel}>Известявай ме</Text>
                                <Switch value={notificationEnabled} onValueChange={setNotificationEnabled} />
                            </View>
                        </View>
                        {notificationEnabled && arriveBy ? (
                            <>
                                <Text style={styles.reminderHint}>
                                    {selectedItinerary
                                        ? `Начало на маршрута: ${fmtTime(selectedItinerary.startTime)}. Известието ще е по-рано.`
                                        : 'Избери маршрут, за да изчислим уведомлението от началния час.'}
                                </Text>
                                <Text style={styles.reminderSubheading}>Повтаряй в дни</Text>
                                <View style={styles.weekdayGrid}>
                                    {FAVORITE_COMMUTE_WEEKDAY_OPTIONS.map((option) => {
                                        const active = reminderWeekdays.includes(option.value);
                                        return (
                                            <TouchableOpacity
                                                key={option.value}
                                                style={[styles.weekdayChip, active && styles.weekdayChipActive]}
                                                onPress={() => toggleReminderWeekday(option.value)}
                                            >
                                                <Text style={[styles.weekdayChipText, active && styles.weekdayChipTextActive]}>{option.shortLabel}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                                <Text style={styles.reminderHint}>{`Дни: ${formatFavoriteCommuteWeekdays(reminderWeekdays)}`}</Text>
                                <View style={styles.offsetOptionsRow}>
                                    {REMINDER_OFFSET_OPTIONS.map((option) => (
                                        <TouchableOpacity
                                            key={option}
                                            style={[styles.offsetChip, reminderOffsetMinutes === option && styles.offsetChipActive]}
                                            onPress={() => setReminderOffsetMinutes(option)}
                                        >
                                            <Text style={[styles.offsetChipText, reminderOffsetMinutes === option && styles.offsetChipTextActive]}>
                                                {`${option} мин по-рано`}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                {derivedArriveByReminderTime ? (
                                    <Text style={styles.reminderHint}>{`Уведомление: ${derivedArriveByReminderTime}`}</Text>
                                ) : null}
                            </>
                        ) : null}

                        {existingPlan?.itinerarySummary ? (
                            <View style={styles.currentPlanBox}>
                                <Text style={styles.currentPlanTitle}>Текущ запазен маршрут</Text>
                                <Text style={styles.currentPlanText}>{existingPlan.routeLabel}</Text>
                                <Text style={styles.currentPlanText}>{existingPlan.itinerarySummary}</Text>
                                <Text style={styles.currentPlanText}>
                                    {existingPlan.routeDate && existingPlan.routeTime
                                        ? `Пристигане до ${existingPlan.routeDate} ${existingPlan.routeTime}`
                                        : 'Без зададен ден и час за маршрута'}
                                </Text>
                                <Text style={styles.currentPlanText}>
                                    {existingPlan.reminderTime
                                        ? `Известяване: ${formatFavoriteCommuteWeekdays(existingPlan.reminderWeekdays)} • ${existingPlan.reminderOffsetMinutes || 5} мин по-рано (${existingPlan.reminderTime})`
                                        : 'Без известяване'}
                                </Text>
                            </View>
                        ) : null}

                        <TouchableOpacity style={[styles.saveButton, !itineraries.length && styles.saveButtonDisabled]} disabled={!itineraries.length} onPress={savePlan}>
                            <Text style={styles.saveButtonText}>Запази маршрут и час</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.35)', justifyContent: 'flex-start', paddingTop: 28, paddingHorizontal: 12 },
    card: { backgroundColor: 'rgba(255,255,255,0.98)', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', maxHeight: '92%', padding: 12 },
    content: { paddingBottom: 8 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 },
    title: { color: '#111827', fontSize: 16, fontWeight: '700' },
    subtitle: { color: '#6B7280', fontSize: 12, marginTop: 2 },
    placesSummaryBox: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 10, marginBottom: 6 },
    placeSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    placeSummaryLabel: { width: 24, color: '#475569', fontSize: 12, fontWeight: '700' },
    placeSummaryValue: { flex: 1, color: '#111827', fontSize: 12, fontWeight: '700' },
    closeButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
    closeButtonText: { color: '#374151', fontSize: 16, fontWeight: '700' },
    sectionTitle: { color: '#111827', fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 6 },
    sectionHint: { color: '#6B7280', fontSize: 11, lineHeight: 16, marginBottom: 8 },
    originInput: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#D1D5DB', paddingHorizontal: 12, paddingVertical: 10, color: '#111827', fontSize: 14 },
    originResultsList: { maxHeight: 180, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', padding: 8, marginTop: 8 },
    originResultRow: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FFFFFF', marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
    originResultTitle: { color: '#111827', fontSize: 12, fontWeight: '700' },
    originResultSubtitle: { color: '#6B7280', fontSize: 11, marginTop: 2 },
    originSearchStatus: { color: '#4B5563', fontSize: 12, textAlign: 'center', paddingVertical: 8 },
    destinationFixedBox: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 10 },
    destinationFixedBoxActive: { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' },
    destinationFixedTitle: { color: '#111827', fontSize: 12, fontWeight: '700' },
    destinationFixedText: { color: '#475569', fontSize: 11, marginTop: 4 },
    emptyText: { color: '#6B7280', fontSize: 12, lineHeight: 17 },
    planTypesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    planTypeButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 16, backgroundColor: '#E2E8F0' },
    planTypeButtonActive: { backgroundColor: '#1E3A8A' },
    planTypeButtonText: { color: '#475569', fontSize: 12, fontWeight: '600' },
    planTypeButtonTextActive: { color: '#FFFFFF' },
    quickActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    quickActionChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
    quickActionChipText: { color: '#1D4ED8', fontSize: 12, fontWeight: '700' },
    routeDateTimeRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
    routeDateInputWrap: { flex: 1 },
    routeTimeInputWrap: { width: 110 },
    routeDateTimeLabel: { color: '#475569', fontSize: 12, fontWeight: '600', marginBottom: 6 },
    arriveByFixedBox: { backgroundColor: '#ECFDF5', borderRadius: 12, borderWidth: 1, borderColor: '#A7F3D0', padding: 10, marginBottom: 4 },
    arriveByFixedLabel: { color: '#065F46', fontSize: 12, fontWeight: '600' },
    arriveByFixedValue: { color: '#047857', fontSize: 13, fontWeight: '800', marginTop: 4 },
    searchButton: { marginTop: 10, minHeight: 44, backgroundColor: '#1D4ED8', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    searchButtonDisabled: { backgroundColor: '#93C5FD' },
    searchButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    errorText: { color: '#B91C1C', fontSize: 12, marginTop: 8 },
    routeCard: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
    routeCardActive: { borderColor: '#1D4ED8', backgroundColor: '#EFF6FF' },
    routeSummary: { color: '#111827', fontSize: 12, fontWeight: '700', lineHeight: 18 },
    routeDetailsBox: { marginTop: 6, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#DBEAFE' },
    routeDetailRow: { marginBottom: 8 },
    routeDetailMode: { color: '#1E3A8A', fontSize: 11, fontWeight: '700', marginBottom: 2 },
    routeDetailText: { color: '#334155', fontSize: 11, lineHeight: 16 },
    reminderRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    reminderHint: { color: '#475569', fontSize: 11, lineHeight: 16, marginTop: 6 },
    switchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    switchLabel: { color: '#334155', fontSize: 12, fontWeight: '600' },
    reminderSubheading: { color: '#111827', fontSize: 12, fontWeight: '700', marginTop: 8 },
    weekdayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    weekdayChip: { width: 42, paddingVertical: 10, borderRadius: 10, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
    weekdayChipActive: { backgroundColor: '#0F766E' },
    weekdayChipText: { color: '#475569', fontSize: 12, fontWeight: '700' },
    weekdayChipTextActive: { color: '#FFFFFF' },
    offsetOptionsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    offsetChip: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
    offsetChipActive: { backgroundColor: '#1D4ED8' },
    offsetChipText: { color: '#475569', fontSize: 12, fontWeight: '700' },
    offsetChipTextActive: { color: '#FFFFFF' },
    currentPlanBox: { marginTop: 12, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 10 },
    currentPlanTitle: { color: '#111827', fontSize: 12, fontWeight: '700', marginBottom: 4 },
    currentPlanText: { color: '#475569', fontSize: 11, lineHeight: 16 },
    saveButton: { marginTop: 14, minHeight: 46, backgroundColor: '#0F766E', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    saveButtonDisabled: { backgroundColor: '#99F6E4' },
    saveButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});