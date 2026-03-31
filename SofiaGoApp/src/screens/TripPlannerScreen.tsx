import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  planTrip,
  searchLocations,
  type Itinerary,
  type ItineraryLeg,
  type PlanType,
  type TripLocation,
} from '../services/transit';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { ArrivalReminderControl } from '../features/notifications/components/ArrivalReminderControl';
import { createStopEtaFromTripPlannerLeg } from '../features/notifications/utils/tripPlannerReminder';
import { buildRouteGeoJSON, TripRouteGeoJSON } from '../features/tripPlanner/utils/routeGeoJson';
import {
  getSavedTripPlannerRouteId,
  listSavedTripPlannerRoutes,
  saveTripPlannerRoute,
  subscribeToSavedTripPlannerRouteChanges,
  type SavedTripPlannerRoute,
} from '../services/savedTripRoutes';
import {
  fmtDuration,
  fmtTime,
  formatDateForApi,
  formatDateForInput,
  getCurrentPlannerDateInput,
  getCurrentPlannerTimeInput,
  isValidTimeInput,
  modeColor,
  modeIconName,
  normalizeDateInput,
  normalizeTimeInput,
  parseInputDate,
  PLAN_LABELS,
} from '../features/tripPlanner/utils/presentation';

/* ─── component ───────────────────────────────────────────────── */

interface Props {
  onClose?: () => void;
  onShowOnMap?: (route: TripRouteGeoJSON) => void;
  initialFromLocation?: TripLocation | null;
  initialToLocation?: TripLocation | null;
  initialFromToken?: number;
  initialSavedRoute?: SavedTripPlannerRoute | null;
  initialSavedRouteToken?: number;
  isActive?: boolean;
}

export default function TripPlannerScreen({
  onClose,
  onShowOnMap,
  initialFromLocation,
  initialToLocation,
  initialFromToken,
  initialSavedRoute,
  initialSavedRouteToken,
  isActive = true,
}: Props) {
  const previousIsActiveRef = useRef(isActive);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [fromLoc, setFromLoc] = useState<TripLocation | null>(null);
  const [toLoc, setToLoc] = useState<TripLocation | null>(null);
  const [autoFromLoading, setAutoFromLoading] = useState(false);

  const [suggestions, setSuggestions] = useState<TripLocation[]>([]);
  const [activeField, setActiveField] = useState<'from' | 'to' | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionRequestIdRef = useRef(0);
  const manualFromEditedRef = useRef(false);

  const [planType, setPlanType] = useState<PlanType>('0');
  const [dateInput, setDateInput] = useState(() => getCurrentPlannerDateInput());
  const [timeInput, setTimeInput] = useState(() => getCurrentPlannerTimeInput());
  const [arriveBy, setArriveBy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itineraries, setItineraries] = useState<Itinerary[] | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [resultContext, setResultContext] = useState<{
    from: TripLocation;
    to: TripLocation;
    planType: PlanType;
    routeDate: string;
    routeTime: string;
    arriveBy: boolean;
  } | null>(null);
  const [savedRouteIds, setSavedRouteIds] = useState<Set<string>>(new Set());
  const [savingRouteId, setSavingRouteId] = useState<string | null>(null);

  const resultsScrollRef = useRef<ScrollView>(null);

  /* back button */
  useEffect(() => {
    if (!onClose) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [onClose]);

  /* auto-fill current location as starting point */
  useEffect(() => {
    if (initialFromLocation) return;
    let cancelled = false;
    (async () => {
      try {
        if (!manualFromEditedRef.current) {
          setFromText('Моята локация');
        }
        setAutoFromLoading(true);
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown && !cancelled && !manualFromEditedRef.current) {
          setFromLoc({
            latitude: lastKnown.coords.latitude,
            longitude: lastKnown.coords.longitude,
            name: 'Моята локация',
          });
        }
        const loc = await Location.getCurrentPositionAsync({});
        if (cancelled) return;
        const myLocation: TripLocation = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          name: 'Моята локация',
        };
        if (!manualFromEditedRef.current) {
          setFromText(myLocation.name);
        }
        setFromLoc(myLocation);
      } catch (err) {
        console.warn('Failed to get location for trip planner:', err);
      } finally {
        if (!cancelled) {
          setAutoFromLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* prefill from map-selected coordinate */
  useEffect(() => {
    if (!initialFromLocation) return;
    setFromText(initialFromLocation.name);
    setFromLoc(initialFromLocation);
    setSuggestions([]);
    setActiveField(null);
    setItineraries(null);
    setExpandedIdx(null);
    setError(null);
    setResultContext(null);
  }, [initialFromLocation, initialFromToken]);

  useEffect(() => {
    if (!initialToLocation) return;
    setToText(initialToLocation.name);
    setToLoc(initialToLocation);
    setSuggestions([]);
    setActiveField(null);
    setItineraries(null);
    setExpandedIdx(null);
    setError(null);
    setResultContext(null);
  }, [initialToLocation, initialFromToken]);

  useEffect(() => {
    if (!initialSavedRoute) return;
    setFromText(initialSavedRoute.from.name);
    setFromLoc(initialSavedRoute.from);
    setToText(initialSavedRoute.to.name);
    setToLoc(initialSavedRoute.to);
    setPlanType(initialSavedRoute.planType);
    setDateInput(initialSavedRoute.routeDate);
    setTimeInput(initialSavedRoute.routeTime);
    setArriveBy(initialSavedRoute.arriveBy);
    setItineraries([initialSavedRoute.itinerary]);
    setExpandedIdx(0);
    setSuggestions([]);
    setActiveField(null);
    setError(null);
    setLoading(false);
    setResultContext({
      from: initialSavedRoute.from,
      to: initialSavedRoute.to,
      planType: initialSavedRoute.planType,
      routeDate: initialSavedRoute.routeDate,
      routeTime: initialSavedRoute.routeTime,
      arriveBy: initialSavedRoute.arriveBy,
    });
    setTimeout(() => resultsScrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
  }, [initialSavedRoute, initialSavedRouteToken]);

  useEffect(() => {
    const becameActive = isActive && !previousIsActiveRef.current;
    previousIsActiveRef.current = isActive;

    if (!becameActive || itineraries?.length) {
      return;
    }

    setDateInput(getCurrentPlannerDateInput());
    setTimeInput(getCurrentPlannerTimeInput());
  }, [isActive, itineraries]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      suggestionRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncSavedRoutes = async () => {
      const routes = await listSavedTripPlannerRoutes();
      if (!cancelled) {
        setSavedRouteIds(new Set(routes.map((route) => route.id)));
      }
    };

    void syncSavedRoutes();
    const unsubscribe = subscribeToSavedTripPlannerRouteChanges(() => {
      void syncSavedRoutes();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  /* autocomplete */
  const onChangeText = useCallback((field: 'from' | 'to', text: string) => {
    if (field === 'from') {
      manualFromEditedRef.current = true;
      setFromText(text);
      setFromLoc(null);
    }
    else { setToText(text); setToLoc(null); }
    setActiveField(field);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const requestId = ++suggestionRequestIdRef.current;

    if (text.length < 2) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        // Use CGM API for location search
        const locs = await searchLocations(text);
        if (suggestionRequestIdRef.current === requestId) {
          setSuggestions(locs);
        }
      } catch {
        if (suggestionRequestIdRef.current === requestId) {
          setSuggestions([]);
        }
      }
    }, 350);
  }, []);

  const pickSuggestion = (loc: TripLocation) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    suggestionRequestIdRef.current += 1;

    if (activeField === 'from') {
      manualFromEditedRef.current = true;
      setFromText(loc.name);
      setFromLoc(loc);
    }
    else if (activeField === 'to') { setToText(loc.name); setToLoc(loc); }
    setSuggestions([]);
    setActiveField(null);
    Keyboard.dismiss();
  };

  const getSavedRouteIdForItinerary = useCallback((itinerary: Itinerary) => {
    if (!resultContext) {
      return null;
    }

    return getSavedTripPlannerRouteId({
      from: resultContext.from,
      to: resultContext.to,
      planType: resultContext.planType,
      routeDate: resultContext.routeDate,
      routeTime: resultContext.routeTime,
      arriveBy: resultContext.arriveBy,
      itinerary,
    });
  }, [resultContext]);

  /* swap */
  const swapDirections = () => {
    setFromText(toText); setToText(fromText);
    setFromLoc(toLoc); setToLoc(fromLoc);
    setItineraries(null);
    setResultContext(null);
  };

  /* search */
  const doSearch = async () => {
    if (!fromLoc || !toLoc) { setError('Изберете начална и крайна точка'); return; }
    const parsedDate = parseInputDate(dateInput);
    if (!parsedDate) {
      setError('Датата трябва да е във формат ДД.ММ.ГГГГ');
      return;
    }
    if (!isValidTimeInput(timeInput)) {
      setError('Часът трябва да е във формат ЧЧ:ММ');
      return;
    }
    setError(null); setLoading(true); setItineraries(null); setExpandedIdx(null); setResultContext(null);
    Keyboard.dismiss();
    try {
      const result = await planTrip({
        from: fromLoc,
        to: toLoc,
        type: planType,
        date: formatDateForApi(parsedDate),
        time: timeInput.trim(),
        arriveBy,
      });
      if (result.length === 0) setError('Не е намерен маршрут');
      else {
        setItineraries(result);
        setResultContext({
          from: fromLoc,
          to: toLoc,
          planType,
          routeDate: formatDateForInput(parsedDate),
          routeTime: timeInput.trim(),
          arriveBy,
        });
        // Scroll to top of results after a tick so they render first
        setTimeout(() => resultsScrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
      }
    } catch (e: any) {
      setError(e.message ?? 'Грешка при търсене');
    } finally {
      setLoading(false);
    }
  };

  const onSaveRoute = useCallback(async (itinerary: Itinerary) => {
    if (!resultContext) {
      Alert.alert('Липсва маршрут', 'Избери начална и крайна точка, преди да запазиш маршрут.');
      return;
    }

    const routeId = getSavedRouteIdForItinerary(itinerary);
    if (!routeId) {
      return;
    }

    setSavingRouteId(routeId);
    try {
      const savedRoute = await saveTripPlannerRoute({
        from: resultContext.from,
        to: resultContext.to,
        planType: resultContext.planType,
        routeDate: resultContext.routeDate,
        routeTime: resultContext.routeTime,
        arriveBy: resultContext.arriveBy,
        itinerary,
      });
      setSavedRouteIds((previous) => {
        const next = new Set(previous);
        next.add(savedRoute.id);
        return next;
      });
      Alert.alert('Маршрутът е запазен', 'Ще го намериш в Напомняния при запазените маршрути.');
    } catch {
      Alert.alert('Грешка', 'Неуспешно запазване на маршрута.');
    } finally {
      setSavingRouteId(null);
    }
  }, [getSavedRouteIdForItinerary, resultContext]);

  /* ─── render ───────────────────────────────────────────────── */

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={s.title}>Планирай пътуване</Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={s.closeButton}>
            <Ionicons name="close" size={18} color="#334155" />
          </TouchableOpacity>
        )}
      </View>

      {/* Collapsible form */}
      {/* Inputs */}
      <View style={s.inputRow}>
        <View style={s.inputsCol}>
          <View style={s.inputWrap}>
            <Ionicons name="ellipse-outline" size={12} color="#22C55E" style={{ marginRight: 8 }} />
            <TextInput
              style={s.inputField}
              placeholder={autoFromLoading ? 'Задавам текуща локация...' : 'Откъде...'}
              placeholderTextColor="#94A3B8"
              value={fromText}
              onChangeText={(t) => onChangeText('from', t)}
              onFocus={() => setActiveField('from')}
            />
          </View>
          <View style={s.inputWrap}>
            <Ionicons name="location" size={13} color="#EF4444" style={{ marginRight: 8 }} />
            <TextInput
              style={s.inputField}
              placeholder="До къде"
              placeholderTextColor="#94A3B8"
              value={toText}
              onChangeText={(t) => onChangeText('to', t)}
              onFocus={() => setActiveField('to')}
            />
          </View>
        </View>
        <TouchableOpacity style={s.swapBtn} onPress={swapDirections}>
          <Ionicons name="swap-vertical-outline" size={20} color="#475569" />
        </TouchableOpacity>
      </View>

      {/* Suggestions dropdown */}
      {suggestions.length > 0 && (
        <ScrollView style={s.suggestionsWrap} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {suggestions.map((loc, i) => (
            <TouchableOpacity key={i} style={s.suggestionItem} onPress={() => pickSuggestion(loc)}>
              <Ionicons name="location-outline" size={14} color="#64748B" style={{ marginRight: 8 }} />
              <Text style={s.suggestionText} numberOfLines={1}>{loc.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Scrollable area: options + datetime + button + results */}
      <ScrollView
        ref={resultsScrollRef}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 20 }}
      >
      {/* Plan type */}
      <View style={s.optionsRow}>
        {(['0', '1', '2'] as PlanType[]).map((pt) => (
          <TouchableOpacity
            key={pt}
            style={[s.planTypeBtn, planType === pt && s.planTypeBtnActive]}
            onPress={() => setPlanType(pt)}
          >
            <Text style={[s.planTypeText, planType === pt && s.planTypeTextActive]}>
              {PLAN_LABELS[pt]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.datetimeCard}>
        <Text style={s.datetimeTitle}>Ден и час</Text>
        <View style={s.datetimeQuickRow}>
          <TouchableOpacity
            style={s.quickDateChip}
            onPress={() => {
              setDateInput(getCurrentPlannerDateInput());
              setTimeInput(getCurrentPlannerTimeInput());
            }}
          >
            <Ionicons name="today-outline" size={12} color="#1D4ED8" />
            <Text style={s.quickDateChipText}>Днес</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.quickDateChip}
            onPress={() => {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              setDateInput(formatDateForInput(tomorrow));
            }}
          >
            <Ionicons name="calendar-outline" size={12} color="#1D4ED8" />
            <Text style={s.quickDateChipText}>Утре</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.quickDateChip}
            onPress={() => setTimeInput(getCurrentPlannerTimeInput())}
          >
            <Ionicons name="time-outline" size={12} color="#1D4ED8" />
            <Text style={s.quickDateChipText}>Сега</Text>
          </TouchableOpacity>
        </View>

        <View style={s.datetimeInputRow}>
          <View style={s.datetimeInputCol}>
            <Text style={s.datetimeLabel}>Дата</Text>
            <TextInput
              style={s.datetimeInput}
              value={dateInput}
              onChangeText={(value) => setDateInput(normalizeDateInput(value))}
              placeholder={getCurrentPlannerDateInput()}
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
            />
          </View>
          <View style={s.datetimeInputColSmall}>
            <Text style={s.datetimeLabel}>Час</Text>
            <TextInput
              style={s.datetimeInput}
              value={timeInput}
              onChangeText={(value) => setTimeInput(normalizeTimeInput(value))}
              placeholder={getCurrentPlannerTimeInput()}
              placeholderTextColor="#94A3B8"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </View>

        <View style={s.arriveByRow}>
          <TouchableOpacity
            style={[s.arriveByChip, !arriveBy && s.arriveByChipActive]}
            onPress={() => setArriveBy(false)}
          >
            <Ionicons name="arrow-forward-outline" size={13} color={!arriveBy ? '#FFFFFF' : '#475569'} />
            <Text style={[s.arriveByChipText, !arriveBy && s.arriveByChipTextActive]}>Тръгване в</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.arriveByChip, arriveBy && s.arriveByChipActive]}
            onPress={() => setArriveBy(true)}
          >
            <Ionicons name="flag-outline" size={13} color={arriveBy ? '#FFFFFF' : '#475569'} />
            <Text style={[s.arriveByChipText, arriveBy && s.arriveByChipTextActive]}>Пристигане до</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[s.searchBtn, (!fromLoc || !toLoc) && s.searchBtnDisabled]}
        onPress={doSearch}
        disabled={loading || !fromLoc || !toLoc}
        activeOpacity={0.7}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="search-outline" size={16} color="#FFF" />
            <Text style={s.searchBtnText}>Търси маршрут</Text>
          </View>
        )}
      </TouchableOpacity>

      {error && <Text style={s.errorText}>{error}</Text>}

      {/* Results */}
      {itineraries && itineraries.map((item, index) => (
        <View key={index} style={{ paddingHorizontal: 14 }}>
          {(() => {
            const savedRouteId = getSavedRouteIdForItinerary(item);
            return (
          <ItineraryCard
            it={item}
            expanded={expandedIdx === index}
            onToggle={() => setExpandedIdx(expandedIdx === index ? null : index)}
            onShowOnMap={onShowOnMap ? () => onShowOnMap(buildRouteGeoJSON(item)) : undefined}
            onSaveRoute={() => void onSaveRoute(item)}
            routeSaved={!!savedRouteId && savedRouteIds.has(savedRouteId)}
            routeSaving={!!savedRouteId && savingRouteId === savedRouteId}
          />
            );
          })()}
        </View>
      ))}
      </ScrollView>
    </View>
  );
}

/* ─── Itinerary card ─────────────────────────────────────────── */

function ItineraryCard({
  it,
  expanded,
  onToggle,
  onShowOnMap,
  onSaveRoute,
  routeSaved,
  routeSaving,
}: {
  it: Itinerary;
  expanded: boolean;
  onToggle: () => void;
  onShowOnMap?: () => void;
  onSaveRoute?: () => void;
  routeSaved?: boolean;
  routeSaving?: boolean;
}) {
  const safeLegs = Array.isArray(it.legs) ? it.legs : [];
  const canShowOnMap = !!onShowOnMap && safeLegs.length > 0;
  const canSaveRoute = !!onSaveRoute && safeLegs.length > 0;
  return (
    <TouchableOpacity style={s.card} onPress={onToggle} activeOpacity={0.7}>
      {/* Summary row */}
      <View style={s.cardSummary}>
        <Text style={s.cardTime}>{fmtTime(it.startTime)} → {fmtTime(it.endTime)}</Text>
        <Text style={s.cardDuration}>{fmtDuration(it.duration)}</Text>
      </View>
      <View style={s.cardModes}>
        {safeLegs.map((leg, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Ionicons name="chevron-forward" size={12} color="#94A3B8" />}
            <View style={[s.legBadge, { borderLeftWidth: 3, borderLeftColor: modeColor(leg.mode) }]}>
              <Ionicons name={modeIconName(leg.mode) as any} size={14} color={modeColor(leg.mode)} />
              {leg.route ? (
                <Text style={s.legRoute}>{leg.route.shortName}</Text>
              ) : leg.mode === 'WALK' ? (
                <Text style={s.legWalkLabel}>{fmtDuration(leg.to.arrivalTime / 1000 - leg.from.departureTime / 1000)}</Text>
              ) : null}
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Expanded details */}
      {expanded && (
        <View style={s.cardDetails}>
          {safeLegs.map((leg, i) => (
            <LegDetail key={i} leg={leg} />
          ))}
          {!safeLegs.length && (
            <Text style={s.emptyLegsText}>Този маршрут не върна достатъчно детайли.</Text>
          )}
          {canShowOnMap && (
            <TouchableOpacity style={s.showOnMapBtn} onPress={onShowOnMap}>
              <Ionicons name="map-outline" size={14} color="#FFFFFF" />
              <Text style={s.showOnMapText}>Покажи на картата</Text>
            </TouchableOpacity>
          )}
          {canSaveRoute && (
            <TouchableOpacity
              style={[s.saveRouteBtn, routeSaved && s.saveRouteBtnSaved]}
              onPress={onSaveRoute}
              disabled={routeSaving}
            >
              <Ionicons
                name={routeSaved ? 'bookmark' : 'bookmark-outline'}
                size={14}
                color={routeSaved ? '#0F766E' : '#1D4ED8'}
              />
              <Text style={[s.saveRouteText, routeSaved && s.saveRouteTextSaved]}>
                {routeSaving ? 'Запазване...' : routeSaved ? 'Запазен маршрут' : 'Запази маршрут'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function LegDetail({ leg }: { leg: ItineraryLeg }) {
  const isWalk = leg.mode === 'WALK';
  const [stopsExpanded, setStopsExpanded] = useState(false);
  const hasStops = leg.intermediatePlaces && leg.intermediatePlaces.length > 0;
  const reminderEta = createStopEtaFromTripPlannerLeg(leg);

  return (
    <View style={[s.legRow, isWalk && s.legRowWalk]}>
      <View style={s.legTimeCol}>
        <Text style={s.legTime}>{fmtTime(leg.from.departureTime)}</Text>
        <Text style={s.legTimeEnd}>{fmtTime(leg.to.arrivalTime)}</Text>
      </View>
      <View style={s.legTimeline}>
        <View style={[s.legDot, { backgroundColor: modeColor(leg.mode) }]} />
        <View style={[s.legLine, isWalk ? s.legLineWalk : { backgroundColor: modeColor(leg.mode) }]} />
        <View style={[s.legDot, { backgroundColor: modeColor(leg.mode) }]} />
      </View>
      <View style={s.legInfo}>
        <View style={s.legHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name={modeIconName(leg.mode) as any} size={14} color={modeColor(leg.mode)} />
            <Text style={[s.legMode, { color: modeColor(leg.mode) }]}>
              {leg.route ? leg.route.shortName : isWalk ? 'Пешеходно' : leg.mode}
            </Text>
          </View>
          {reminderEta ? <ArrivalReminderControl stopName={leg.from.name} eta={reminderEta} /> : null}
        </View>
        {isWalk && (
          <View style={s.walkInfoRow}>
            <Ionicons name="walk-outline" size={13} color="#64748B" />
            <Text style={s.walkInfoText}>
              {fmtDuration(Math.round((leg.to.arrivalTime - leg.from.departureTime) / 1000))}
            </Text>
          </View>
        )}
        <View style={s.legPlaceRow}>
          <Ionicons name="ellipse" size={7} color="#22C55E" />
          <Text style={s.legPlace}>{leg.from.name}</Text>
        </View>
        {hasStops && (
          <TouchableOpacity onPress={() => setStopsExpanded(!stopsExpanded)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 11 }}>
              <Ionicons name={stopsExpanded ? 'chevron-down' : 'chevron-forward'} size={13} color="#1D4ED8" />
              <Text style={s.legStopsToggle}>{leg.intermediatePlaces!.length} спирки</Text>
            </View>
          </TouchableOpacity>
        )}
        {hasStops && stopsExpanded && (
          <View style={s.intermediateStops}>
            {leg.intermediatePlaces!.map((place, idx) => (
              <View key={idx} style={s.intermediateRow}>
                <Text style={s.intermediateTime}>{fmtTime(place.arrivalTime)}</Text>
                <View style={s.intermediateDot} />
                <Text style={s.intermediateName}>{place.name}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={s.legPlaceRow}>
          <Ionicons name="location" size={8} color="#EF4444" />
          <Text style={s.legPlace}>{leg.to.name}</Text>
        </View>
      </View>
    </View>
  );
}

/* ─── styles ─────────────────────────────────────────────────── */

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent', paddingTop: 4 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 6,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  subtitle: { marginTop: 2, color: '#475569', fontSize: 12, fontWeight: '600' },
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

  inputRow: { flexDirection: 'row', paddingHorizontal: 14, gap: 6, alignItems: 'center' },
  inputsCol: { flex: 1, gap: 4 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.72)',
  },
  inputField: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.72)',
  },
  swapBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(248,250,252,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.72)',
  },

  suggestionsWrap: {
    marginHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.72)',
    maxHeight: 180,
    marginTop: 4,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(226,232,240,0.72)',
  },
  suggestionText: { fontSize: 13, color: '#0F172A', flex: 1 },

  optionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    marginTop: 6,
    gap: 5,
    flexWrap: 'wrap',
  },
  planTypeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(248,250,252,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.72)',
  },
  planTypeBtnActive: {
    backgroundColor: 'rgba(29,78,216,0.82)',
    borderColor: 'rgba(29,78,216,0.82)',
  },
  planTypeText: { fontSize: 11, color: '#475569', fontWeight: '600' },
  planTypeTextActive: { color: '#FFF', fontWeight: '700' },

  datetimeCard: {
    marginHorizontal: 14,
    marginTop: 6,
    padding: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.72)',
    gap: 6,
  },
  datetimeTitle: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  datetimeQuickRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  quickDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(239,246,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(191,219,254,0.72)',
  },
  quickDateChipText: { fontSize: 10, fontWeight: '700', color: '#1D4ED8' },
  datetimeInputRow: { flexDirection: 'row', alignItems: 'stretch', gap: 6 },
  datetimeInputCol: { flex: 1 },
  datetimeInputColSmall: { flexBasis: 104, flexGrow: 0, flexShrink: 1 },
  datetimeLabel: { fontSize: 10, fontWeight: '600', color: '#475569', marginBottom: 3 },
  datetimeInput: {
    backgroundColor: 'rgba(248,250,252,0.72)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.72)',
  },
  arriveByRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  arriveByChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(248,250,252,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.72)',
  },
  arriveByChipActive: {
    backgroundColor: 'rgba(15,118,110,0.82)',
    borderColor: 'rgba(15,118,110,0.82)',
  },
  arriveByChipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  arriveByChipTextActive: { color: '#FFFFFF' },

  searchBtn: {
    marginHorizontal: 14,
    marginTop: 6,
    backgroundColor: 'rgba(29,78,216,0.82)',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  searchBtnDisabled: { opacity: 0.4 },
  searchBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

  errorText: { color: '#DC2626', fontSize: 11, textAlign: 'center', marginTop: 6 },

  showFormHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 5,
    marginHorizontal: 14,
    marginTop: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(248,250,252,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.72)',
  },
  showFormHintText: { fontSize: 11, color: '#475569', fontWeight: '600' },

  resultsList: { marginTop: 6, paddingHorizontal: 14 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.6)',
  },
  cardSummary: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  cardTime: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  cardDuration: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  cardModes: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  legBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(248,250,252,0.82)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  legIcon: { fontSize: 16 },
  legRoute: { fontSize: 12, fontWeight: '700', color: '#1D4ED8', marginLeft: 4 },
  legWalkLabel: { fontSize: 11, fontWeight: '600', color: '#64748B', marginLeft: 3 },

  cardDetails: {
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(226,232,240,0.72)',
    paddingTop: 10,
  },
  legRow: { flexDirection: 'row', marginBottom: 12 },
  legRowWalk: { backgroundColor: 'rgba(248,250,252,0.82)', borderRadius: 10, padding: 8, marginHorizontal: -4 },
  legTimeCol: { minWidth: 42, justifyContent: 'space-between' },
  legTime: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  legTimeEnd: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  legTimeline: { width: 14, alignItems: 'center', marginHorizontal: 2 },
  legDot: { width: 8, height: 8, borderRadius: 4 },
  legLine: { flex: 1, width: 2.5, borderRadius: 1.5 },
  legLineWalk: { borderWidth: 1, borderColor: '#94A3B8', borderStyle: 'dashed', backgroundColor: 'transparent', width: 0 },
  legInfo: { flex: 1 },
  legHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  legMode: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  legPlaceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginVertical: 1 },
  legPlace: { fontSize: 12, color: '#334155', flex: 1 },
  walkInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  walkInfoText: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  legStopsToggle: { fontSize: 12, color: '#1D4ED8', fontWeight: '600', paddingVertical: 2 },

  intermediateStops: {
    marginLeft: 4,
    marginBottom: 4,
    marginTop: 2,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(203,213,225,0.72)',
    paddingLeft: 10,
  },
  intermediateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
  intermediateTime: { fontSize: 11, color: '#64748B', minWidth: 36, fontWeight: '600' },
  intermediateDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#94A3B8' },
  intermediateName: { fontSize: 11, color: '#475569', flex: 1 },
  emptyLegsText: { color: '#64748B', fontSize: 12, lineHeight: 18 },

  showOnMapBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'rgba(29,78,216,0.82)',
    borderRadius: 12,
    paddingVertical: 8,
  },
  showOnMapText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  saveRouteBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(239,246,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.72)',
  },
  saveRouteBtnSaved: {
    backgroundColor: 'rgba(204,251,241,0.82)',
    borderColor: 'rgba(15,118,110,0.18)',
  },
  saveRouteText: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '700',
  },
  saveRouteTextSaved: {
    color: '#0F766E',
  },
});
