import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  searchLocations,
  planTrip,
  decodePolyline,
  TripLocation,
  Itinerary,
  ItineraryLeg,
  PlanType,
} from '../services/tripPlanner';

/* ─── helpers ─────────────────────────────────────────────────── */

const modeIcon = (mode: string) => {
  switch (mode) {
    case 'WALK': return '🚶';
    case 'BUS': return '🚌';
    case 'TRAM': return '🚊';
    case 'TROLLEYBUS': return '🚎';
    case 'SUBWAY': return '🚇';
    case 'RAIL': return '🚆';
    default: return '🚌';
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

const PLAN_LABELS: Record<PlanType, string> = {
  '0': 'По-малко чакане',
  '1': 'По-малко ходене',
  '2': 'По-малко прекачвания',
};

const MODE_COLORS: Record<string, string> = {
  WALK: '#94A3B8',
  BUS: '#2563EB',
  TRAM: '#DC2626',
  TROLLEYBUS: '#7C3AED',
  SUBWAY: '#059669',
  RAIL: '#D97706',
};

export interface TripRouteStop {
  name: string;
  lat: number;
  lon: number;
  stopCode?: string;
}

export interface TripRouteGeoJSON {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { mode: string; color: string };
    geometry: { type: 'LineString'; coordinates: [number, number][] };
  }>;
  /** Start and end points of the whole itinerary */
  endpoints: { from: TripRouteStop; to: TripRouteStop };
  /** All transit stops along the route (from/to + intermediate per transit leg) */
  transitStops: TripRouteStop[];
}

function buildRouteGeoJSON(it: Itinerary): TripRouteGeoJSON {
  const transitStops: TripRouteStop[] = [];
  const seen = new Set<string>();

  for (const leg of it.legs) {
    if (leg.mode === 'WALK') continue;

    const addStop = (place: typeof leg.from) => {
      const key = place.stop?.code ?? `${place.lat},${place.lon}`;
      if (seen.has(key)) return;
      seen.add(key);
      transitStops.push({
        name: place.name,
        lat: place.lat,
        lon: place.lon,
        stopCode: place.stop?.code,
      });
    };

    addStop(leg.from);
    if (leg.intermediatePlaces) {
      for (const p of leg.intermediatePlaces) addStop(p);
    }
    addStop(leg.to);
  }

  const firstLeg = it.legs[0];
  const lastLeg = it.legs[it.legs.length - 1];

  return {
    type: 'FeatureCollection',
    features: it.legs.map((leg) => ({
      type: 'Feature' as const,
      properties: {
        mode: leg.mode,
        color: MODE_COLORS[leg.mode] ?? '#1E3A8A',
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: decodePolyline(leg.legGeometry.points),
      },
    })),
    endpoints: {
      from: { name: firstLeg.from.name, lat: firstLeg.from.lat, lon: firstLeg.from.lon },
      to: { name: lastLeg.to.name, lat: lastLeg.to.lat, lon: lastLeg.to.lon },
    },
    transitStops,
  };
}

/* ─── component ───────────────────────────────────────────────── */

interface Props {
  onClose?: () => void;
  onShowOnMap?: (route: TripRouteGeoJSON) => void;
  initialFromLocation?: TripLocation | null;
  initialToLocation?: TripLocation | null;
  initialFromToken?: number;
}

export default function TripPlannerScreen({ onClose, onShowOnMap, initialFromLocation, initialToLocation, initialFromToken }: Props) {
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [fromLoc, setFromLoc] = useState<TripLocation | null>(null);
  const [toLoc, setToLoc] = useState<TripLocation | null>(null);

  const [suggestions, setSuggestions] = useState<TripLocation[]>([]);
  const [activeField, setActiveField] = useState<'from' | 'to' | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [planType, setPlanType] = useState<PlanType>('0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itineraries, setItineraries] = useState<Itinerary[] | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  /* back button */
  useEffect(() => {
    if (!onClose) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [onClose]);

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

  /* autocomplete */
  const onChangeText = useCallback((field: 'from' | 'to', text: string) => {
    if (field === 'from') { setFromText(text); setFromLoc(null); }
    else { setToText(text); setToLoc(null); }
    setActiveField(field);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 2) { setSuggestions([]); return; }

    debounceRef.current = setTimeout(async () => {
      try {
        const locs = await searchLocations(text);
        setSuggestions(locs);
      } catch { setSuggestions([]); }
    }, 350);
  }, []);

  const pickSuggestion = (loc: TripLocation) => {
    if (activeField === 'from') { setFromText(loc.name); setFromLoc(loc); }
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
    setError(null); setLoading(true); setItineraries(null); setExpandedIdx(null);
    Keyboard.dismiss();
    try {
      const result = await planTrip({ from: fromLoc, to: toLoc, type: planType });
      if (result.length === 0) setError('Не е намерен маршрут');
      else setItineraries(result);
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
        <Text style={s.title}>🗺️ Маршрутизатор</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={s.closeButton}>
            <Text style={s.closeButtonText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Inputs */}
      <View style={s.inputRow}>
        <View style={s.inputsCol}>
          <TextInput
            style={s.input}
            placeholder="Откъде..."
            placeholderTextColor="#94A3B8"
            value={fromText}
            onChangeText={(t) => onChangeText('from', t)}
            onFocus={() => setActiveField('from')}
          />
          <TextInput
            style={s.input}
            placeholder="Докъде..."
            placeholderTextColor="#94A3B8"
            value={toText}
            onChangeText={(t) => onChangeText('to', t)}
            onFocus={() => setActiveField('to')}
          />
        </View>
        <TouchableOpacity style={s.swapBtn} onPress={swapDirections}>
          <Text style={s.swapIcon}>⇅</Text>
        </TouchableOpacity>
      </View>

      {/* Suggestions dropdown */}
      {suggestions.length > 0 && (
        <ScrollView style={s.suggestionsWrap} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {suggestions.map((loc, i) => (
            <TouchableOpacity key={i} style={s.suggestionItem} onPress={() => pickSuggestion(loc)}>
              <Text style={s.suggestionText}>{loc.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Plan type & search button */}
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

      <TouchableOpacity
        style={[s.searchBtn, (!fromLoc || !toLoc) && s.searchBtnDisabled]}
        onPress={doSearch}
        disabled={loading || !fromLoc || !toLoc}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={s.searchBtnText}>Търси маршрут</Text>
        )}
      </TouchableOpacity>

      {error && <Text style={s.errorText}>{error}</Text>}

      {/* Results */}
      {itineraries && (
        <FlatList
          data={itineraries}
          keyExtractor={(_, i) => String(i)}
          style={s.resultsList}
          renderItem={({ item, index }) => (
            <ItineraryCard
              it={item}
              expanded={expandedIdx === index}
              onToggle={() => setExpandedIdx(expandedIdx === index ? null : index)}
              onShowOnMap={onShowOnMap ? () => onShowOnMap(buildRouteGeoJSON(item)) : undefined}
            />
          )}
        />
      )}
    </View>
  );
}

/* ─── Itinerary card ─────────────────────────────────────────── */

function ItineraryCard({ it, expanded, onToggle, onShowOnMap }: { it: Itinerary; expanded: boolean; onToggle: () => void; onShowOnMap?: () => void }) {
  const transitLegs = it.legs.filter((l) => l.mode !== 'WALK');
  return (
    <TouchableOpacity style={s.card} onPress={onToggle} activeOpacity={0.7}>
      {/* Summary row */}
      <View style={s.cardSummary}>
        <Text style={s.cardTime}>{fmtTime(it.startTime)} → {fmtTime(it.endTime)}</Text>
        <Text style={s.cardDuration}>{fmtDuration(it.duration)}</Text>
      </View>
      <View style={s.cardModes}>
        {it.legs.map((leg, i) => (
          <View key={i} style={s.legBadge}>
            <Text style={s.legIcon}>{modeIcon(leg.mode)}</Text>
            {leg.route && <Text style={s.legRoute}>{leg.route.shortName}</Text>}
          </View>
        ))}
      </View>

      {/* Expanded details */}
      {expanded && (
        <View style={s.cardDetails}>
          {it.legs.map((leg, i) => (
            <LegDetail key={i} leg={leg} />
          ))}
          {onShowOnMap && (
            <TouchableOpacity style={s.showOnMapBtn} onPress={onShowOnMap}>
              <Text style={s.showOnMapText}>🗺️ Покажи на картата</Text>
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

  return (
    <View style={s.legRow}>
      <Text style={s.legTime}>{fmtTime(leg.from.departureTime)}</Text>
      <View style={[s.legLine, isWalk && s.legLineDashed]} />
      <View style={s.legInfo}>
        <Text style={s.legMode}>
          {modeIcon(leg.mode)} {leg.route ? leg.route.shortName : isWalk ? 'Пешеходно' : leg.mode}
        </Text>
        <Text style={s.legPlace}>{leg.from.name}</Text>
        {hasStops && (
          <TouchableOpacity onPress={() => setStopsExpanded(!stopsExpanded)}>
            <Text style={s.legStopsToggle}>
              {stopsExpanded ? '▼' : '▶'} {leg.intermediatePlaces!.length} спирки
            </Text>
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
  root: { flex: 1, backgroundColor: '#F8FAFC', paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: '#0F172A' },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  closeButtonText: {
    fontSize: 22,
    color: '#334155',
    fontWeight: '600',
    lineHeight: 24,
  },

  inputRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  inputsCol: { flex: 1, gap: 8 },
  input: {
    backgroundColor: '#FFF', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0',
  },
  swapBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  swapIcon: { fontSize: 20, color: '#475569' },

  suggestionsWrap: {
    marginHorizontal: 16, backgroundColor: '#FFF', borderRadius: 10, borderWidth: 1,
    borderColor: '#E2E8F0', maxHeight: 200, marginTop: 4,
  },
  suggestionItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  suggestionText: { fontSize: 14, color: '#0F172A' },

  optionsRow: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 12, gap: 6, flexWrap: 'wrap' },
  planTypeBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: '#E2E8F0' },
  planTypeBtnActive: { backgroundColor: '#1E3A8A' },
  planTypeText: { fontSize: 12, color: '#475569' },
  planTypeTextActive: { color: '#FFF', fontWeight: '600' },

  searchBtn: {
    marginHorizontal: 16, marginTop: 12, backgroundColor: '#1E3A8A', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  searchBtnDisabled: { opacity: 0.4 },
  searchBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  errorText: { color: '#DC2626', fontSize: 13, textAlign: 'center', marginTop: 8 },

  resultsList: { marginTop: 12, paddingHorizontal: 16 },
  card: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  cardSummary: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  cardTime: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  cardDuration: { fontSize: 14, color: '#64748B' },
  cardModes: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  legBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  legIcon: { fontSize: 16 },
  legRoute: { fontSize: 13, fontWeight: '700', color: '#1E3A8A', marginLeft: 4 },

  cardDetails: { marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0', paddingTop: 10 },
  legRow: { flexDirection: 'row', marginBottom: 10 },
  legTime: { width: 45, fontSize: 12, color: '#64748B', fontWeight: '600' },
  legLine: { width: 3, backgroundColor: '#1E3A8A', borderRadius: 1.5, marginHorizontal: 8 },
  legLineDashed: { backgroundColor: '#94A3B8' },
  legInfo: { flex: 1 },
  legMode: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  legPlace: { fontSize: 13, color: '#334155' },
  legStopsToggle: { fontSize: 12, color: '#1E3A8A', fontWeight: '600', marginVertical: 4, paddingVertical: 2 },

  intermediateStops: { marginLeft: 4, marginBottom: 4, borderLeftWidth: 2, borderLeftColor: '#CBD5E1', paddingLeft: 10 },
  intermediateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3, gap: 6 },
  intermediateTime: { fontSize: 11, color: '#64748B', width: 38, fontWeight: '500' },
  intermediateDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#94A3B8' },
  intermediateName: { fontSize: 12, color: '#475569', flex: 1 },

  showOnMapBtn: {
    marginTop: 8, backgroundColor: '#1E3A8A', borderRadius: 8, paddingVertical: 8, alignItems: 'center',
  },
  showOnMapText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
});
