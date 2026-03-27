import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
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
  TripRequest,
  Itinerary,
  ItineraryLeg,
  PlanType,
} from '../services/tripPlanner';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { ArrivalReminderControl } from '../features/notifications/components/ArrivalReminderControl';
import { createStopEtaFromTripPlannerLeg } from '../features/notifications/utils/tripPlannerReminder';
import { buildRouteGeoJSON, TripRouteGeoJSON } from '../features/tripPlanner/utils/routeGeoJson';

export interface TripLocation {
  latitude: number;
  longitude: number;
  name: string;
}

/* ─── helpers ─────────────────────────────────────────────────── */

const modeIconName = (mode: string): string => {
  switch (mode) {
    case 'WALK': return 'footsteps-outline';
    case 'BUS': return 'bus-outline';
    case 'TRAM': return 'train-outline';
    case 'TROLLEYBUS': return 'bus-outline';
    case 'SUBWAY': return 'subway-outline';
    case 'RAIL': return 'train-outline';
    default: return 'bus-outline';
  }
};

const fmtTime = (epoch: number) => {
  const d = new Date(epoch);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const fmtDuration = (secs: number) => {
  const m = Math.round(secs / 60);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  return `${h} ч ${m % 60} мин`;
};

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

const getCurrentPlannerDateInput = () => formatDateForInput(new Date());
const getCurrentPlannerTimeInput = () => formatTimeForInput(new Date());

const parseInputDate = (value: string) => {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(value || '').trim());
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
};

const normalizeDateInput = (value: string) => value.replace(/[^\d.]/g, '').slice(0, 10);
const normalizeTimeInput = (value: string) => value.replace(/[^\d:]/g, '').slice(0, 5);

const isValidTimeInput = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || '').trim());

const PLAN_LABELS: Record<PlanType, string> = {
  '0': 'По-малко чакане',
  '1': 'По-малко ходене',
  '2': 'По-малко прекачвания',
};

/* ─── component ───────────────────────────────────────────────── */

interface Props {
  onClose?: () => void;
  onShowOnMap?: (route: TripRouteGeoJSON) => void;
  initialFromLocation?: TripLocation | null;
  initialToLocation?: TripLocation | null;
  initialFromToken?: number;
  isActive?: boolean;
}

export default function TripPlannerScreen({ onClose, onShowOnMap, initialFromLocation, initialToLocation, initialFromToken, isActive = true }: Props) {
  const previousIsActiveRef = useRef(isActive);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [fromLoc, setFromLoc] = useState<TripLocation | null>(null);
  const [toLoc, setToLoc] = useState<TripLocation | null>(null);
  const [autoFromLoading, setAutoFromLoading] = useState(false);

  const [suggestions, setSuggestions] = useState<TripLocation[]>([]);
  const [activeField, setActiveField] = useState<'from' | 'to' | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualFromEditedRef = useRef(false);

  const [planType, setPlanType] = useState<PlanType>('0');
  const [dateInput, setDateInput] = useState(() => getCurrentPlannerDateInput());
  const [timeInput, setTimeInput] = useState(() => getCurrentPlannerTimeInput());
  const [arriveBy, setArriveBy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itineraries, setItineraries] = useState<Itinerary[] | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

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
  }, [initialToLocation, initialFromToken]);

  useEffect(() => {
    const becameActive = isActive && !previousIsActiveRef.current;
    previousIsActiveRef.current = isActive;

    if (!becameActive || itineraries?.length) {
      return;
    }

    setDateInput(getCurrentPlannerDateInput());
    setTimeInput(getCurrentPlannerTimeInput());
  }, [isActive, itineraries]);

  /* autocomplete */
  const onChangeText = useCallback((field: 'from' | 'to', text: string) => {
    if (field === 'from') {
      manualFromEditedRef.current = true;
      setFromText(text);
      setFromLoc(null);
    }
    else { setToText(text); setToLoc(null); }
    setActiveField(field);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 2) { setSuggestions([]); return; }

    debounceRef.current = setTimeout(async () => {
      try {
        // Use CGM API for location search
        const locs = await searchLocations(text);
        setSuggestions(locs);
      } catch { setSuggestions([]); }
    }, 350);
  }, []);

  const pickSuggestion = (loc: TripLocation) => {
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

  /* swap */
  const swapDirections = () => {
    setFromText(toText); setToText(fromText);
    setFromLoc(toLoc); setToLoc(fromLoc);
    setItineraries(null);
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
    setError(null); setLoading(true); setItineraries(null); setExpandedIdx(null);
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
        // Scroll to top of results after a tick so they render first
        setTimeout(() => resultsScrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
      }
    } catch (e: any) {
      setError(e.message ?? 'Грешка при търсене');
    } finally {
      setLoading(false);
    }
  };

  /* ─── render ───────────────────────────────────────────────── */

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={s.title}>Планирай пътуване</Text>
          <Text style={s.subtitle}>Маршрутизатор</Text>
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
          <ItineraryCard
            it={item}
            expanded={expandedIdx === index}
            onToggle={() => setExpandedIdx(expandedIdx === index ? null : index)}
            onShowOnMap={onShowOnMap ? () => onShowOnMap(buildRouteGeoJSON(item)) : undefined}
          />
        </View>
      ))}
      </ScrollView>
    </View>
  );
}

/* ─── Itinerary card ─────────────────────────────────────────── */

function ItineraryCard({ it, expanded, onToggle, onShowOnMap }: { it: Itinerary; expanded: boolean; onToggle: () => void; onShowOnMap?: () => void }) {
  const safeLegs = Array.isArray(it.legs) ? it.legs : [];
  const canShowOnMap = !!onShowOnMap && safeLegs.length > 0;
  return (
    <TouchableOpacity style={s.card} onPress={onToggle} activeOpacity={0.7}>
      {/* Summary row */}
      <View style={s.cardSummary}>
        <Text style={s.cardTime}>{fmtTime(it.startTime)} → {fmtTime(it.endTime)}</Text>
        <Text style={s.cardDuration}>{fmtDuration(it.duration)}</Text>
      </View>
      <View style={s.cardModes}>
        {safeLegs.map((leg, i) => (
          <View key={i} style={s.legBadge}>
            <Ionicons name={modeIconName(leg.mode) as any} size={16} color="#1F2937" />
            {leg.route && <Text style={s.legRoute}>{leg.route.shortName}</Text>}
          </View>
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
    <View style={s.legRow}>
      <Text style={s.legTime}>{fmtTime(leg.from.departureTime)}</Text>
      <View style={[s.legLine, isWalk && s.legLineDashed]} />
      <View style={s.legInfo}>
        <View style={s.legHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name={modeIconName(leg.mode) as any} size={14} color="#1F2937" />
            <Text style={s.legMode}>
              {leg.route ? leg.route.shortName : isWalk ? 'Пешеходно' : leg.mode}
            </Text>
          </View>
          {reminderEta ? <ArrivalReminderControl stopName={leg.from.name} eta={reminderEta} /> : null}
        </View>
        <Text style={s.legPlace}>{leg.from.name}</Text>
        {hasStops && (
          <TouchableOpacity onPress={() => setStopsExpanded(!stopsExpanded)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
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
        <Text style={s.legPlace}>→ {leg.to.name}</Text>
        <Text style={s.legTime}>{fmtTime(leg.to.arrivalTime)}</Text>
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
  datetimeInputRow: { flexDirection: 'row', gap: 6 },
  datetimeInputCol: { flex: 1 },
  datetimeInputColSmall: { width: 100 },
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
  arriveByRow: { flexDirection: 'row', gap: 5 },
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
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.72)',
  },
  cardSummary: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  cardTime: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  cardDuration: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  cardModes: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  legBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(248,250,252,0.72)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.72)',
  },
  legIcon: { fontSize: 16 },
  legRoute: { fontSize: 12, fontWeight: '700', color: '#1D4ED8', marginLeft: 4 },

  cardDetails: {
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(226,232,240,0.72)',
    paddingTop: 10,
  },
  legRow: { flexDirection: 'row', marginBottom: 10 },
  legTime: { width: 42, fontSize: 11, color: '#64748B', fontWeight: '600' },
  legLine: { width: 3, backgroundColor: 'rgba(29,78,216,0.72)', borderRadius: 1.5, marginHorizontal: 6 },
  legLineDashed: { backgroundColor: '#94A3B8' },
  legInfo: { flex: 1 },
  legHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  legMode: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  legPlace: { fontSize: 12, color: '#334155' },
  legStopsToggle: { fontSize: 12, color: '#1D4ED8', fontWeight: '600', paddingVertical: 2 },

  intermediateStops: {
    marginLeft: 4,
    marginBottom: 4,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(226,232,240,0.72)',
    paddingLeft: 10,
  },
  intermediateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3, gap: 5 },
  intermediateTime: { fontSize: 11, color: '#64748B', width: 36, fontWeight: '500' },
  intermediateDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#94A3B8' },
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
});
