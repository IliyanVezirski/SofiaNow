import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import * as NavigationBar from 'expo-navigation-bar';
import { Ionicons } from '@expo/vector-icons';
import MapScreen from './src/screens/MapScreen';
import SchedulesScreen from './src/screens/SchedulesScreen';
import TripPlannerScreen, { TripRouteGeoJSON } from './src/screens/TripPlannerScreen';
import NearbyScreen from './src/screens/NearbyScreen';
import { RouteSelection } from './src/types/routes';
import { TripLocation } from './src/services/tripPlanner';

type BottomTab = 'map' | 'schedules' | 'planner' | 'nearby';

export default function App() {
  const [activeTab, setActiveTab] = useState<BottomTab>('map');

  useEffect(() => {
    void NavigationBar.setVisibilityAsync('hidden');
  }, []);

  const [selectedRoute, setSelectedRoute] = useState<RouteSelection | null>(null);
  const [mapFiltersVisible, setMapFiltersVisible] = useState(false);
  const [openSearchToken, setOpenSearchToken] = useState(0);
  const [toggleFavoritesToken, setToggleFavoritesToken] = useState(0);
  const [recenterToken, setRecenterToken] = useState(0);
  const [dismissTransientPanelsToken, setDismissTransientPanelsToken] = useState(0);
  const [filterCount, setFilterCount] = useState(0);
  const [focusStopCoordinate, setFocusStopCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
  const [focusStopId, setFocusStopId] = useState<string | null>(null);
  const [tripPlannerRoute, setTripPlannerRoute] = useState<TripRouteGeoJSON | null>(null);
  const [plannerInitialFrom, setPlannerInitialFrom] = useState<TripLocation | null>(null);
  const [plannerInitialTo, setPlannerInitialTo] = useState<TripLocation | null>(null);
  const [plannerInitialFromToken, setPlannerInitialFromToken] = useState(0);
  const handleFilterCountChange = useCallback((count: number) => setFilterCount(count), []);

  return (
    <View style={styles.container}>
      <View style={styles.screenWrap}>
        <MapScreen
          highlightedRoute={selectedRoute}
          onClearHighlightedRoute={() => setSelectedRoute(null)}
          showReportButton={activeTab === 'map'}
          filterPanelVisible={mapFiltersVisible}
          onCloseFilterPanel={() => setMapFiltersVisible(false)}
          searchRequestToken={openSearchToken}
          favoritesRequestToken={toggleFavoritesToken}
          recenterRequestToken={recenterToken}
          dismissTransientPanelsToken={dismissTransientPanelsToken}
          onFilterCountChange={handleFilterCountChange}
          focusStopCoordinate={focusStopCoordinate}
          focusStopId={focusStopId}
          tripPlannerRoute={tripPlannerRoute}
          onClearTripRoute={() => setTripPlannerRoute(null)}
          onBuildRouteFromCoordinate={(destinationLatitude, destinationLongitude, currentLatitude, currentLongitude) => {
            if (Number.isFinite(currentLatitude) && Number.isFinite(currentLongitude)) {
              setPlannerInitialFrom({
                latitude: currentLatitude as number,
                longitude: currentLongitude as number,
                name: 'Моята локация',
              });
            }
            setPlannerInitialTo({
              latitude: destinationLatitude,
              longitude: destinationLongitude,
              name: `${destinationLatitude.toFixed(5)}, ${destinationLongitude.toFixed(5)}`,
            });
            setPlannerInitialFromToken((v) => v + 1);
            setMapFiltersVisible(false);
            setDismissTransientPanelsToken((value) => value + 1);
            setActiveTab('planner');
          }}
        />
        <View style={[styles.schedulesOverlay, activeTab !== 'schedules' && { display: 'none' }]}>
          <SchedulesScreen
            onOpenRoute={(route) => {
              setSelectedRoute(route);
              setActiveTab('map');
            }}
            onClose={() => setActiveTab('map')}
            onFocusStop={(stopId, latitude, longitude) => {
              setFocusStopId(stopId);
              setFocusStopCoordinate({ latitude, longitude });
              setActiveTab('map');
            }}
          />
        </View>
        <View style={[styles.schedulesOverlay, activeTab !== 'planner' && { display: 'none' }]}>
          <TripPlannerScreen
            onClose={() => setActiveTab('map')}
            initialFromLocation={plannerInitialFrom}
            initialToLocation={plannerInitialTo}
            initialFromToken={plannerInitialFromToken}
            onShowOnMap={(route) => {
              setTripPlannerRoute(route);
              setActiveTab('map');
            }}
          />
        </View>
        <View style={[styles.schedulesOverlay, activeTab !== 'nearby' && { display: 'none' }]}>
          <NearbyScreen
            onClose={() => setActiveTab('map')}
            onFocusStop={(stopId, latitude, longitude) => {
              setFocusStopId(stopId);
              setFocusStopCoordinate({ latitude, longitude });
              setActiveTab('map');
            }}
            onBuildRoute={(dstLat, dstLon, curLat, curLon) => {
              if (Number.isFinite(curLat) && Number.isFinite(curLon)) {
                setPlannerInitialFrom({
                  latitude: curLat as number,
                  longitude: curLon as number,
                  name: 'Моята локация',
                });
              }
              setPlannerInitialTo({
                latitude: dstLat,
                longitude: dstLon,
                name: `${dstLat.toFixed(5)}, ${dstLon.toFixed(5)}`,
              });
              setPlannerInitialFromToken((v) => v + 1);
              setMapFiltersVisible(false);
              setDismissTransientPanelsToken((value) => value + 1);
              setActiveTab('planner');
            }}
          />
        </View>
      </View>

      {activeTab !== 'schedules' && activeTab !== 'planner' && activeTab !== 'nearby' && <View style={styles.floatingMenu}>
        <TouchableOpacity
          style={[
            styles.floatingButton,
            activeTab === 'map' && mapFiltersVisible && styles.floatingButtonActive,
            activeTab !== 'map' && styles.floatingButtonDisabled,
          ]}
          onPress={() => {
            if (activeTab === 'map') {
              setMapFiltersVisible((prev) => {
                const next = !prev;
                if (next) {
                  setDismissTransientPanelsToken((value) => value + 1);
                }
                return next;
              });
            }
          }}
          disabled={activeTab !== 'map'}
        >
          <Ionicons
            name="filter-outline"
            size={24}
            color={activeTab === 'map' && mapFiltersVisible ? '#1E3A8A' : '#0F172A'}
          />
          {filterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{filterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.floatingButton}
          onPress={() => {
            setActiveTab((prev) => (prev === 'schedules' ? 'map' : 'schedules'));
            setMapFiltersVisible(false);
            setDismissTransientPanelsToken((value) => value + 1);
          }}
        >
          <Text style={styles.floatingIcon}>🕒</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.floatingButton}
          onPress={() => {
            setActiveTab((prev) => (prev === 'planner' ? 'map' : 'planner'));
            setMapFiltersVisible(false);
            setDismissTransientPanelsToken((value) => value + 1);
          }}
        >
          <Text style={styles.floatingIcon}>🧭</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.floatingButton}
          onPress={() => {
            setActiveTab((prev) => (prev === 'nearby' ? 'map' : 'nearby'));
            setMapFiltersVisible(false);
            setDismissTransientPanelsToken((value) => value + 1);
          }}
        >
          <Text style={styles.floatingIcon}>👣</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.floatingButton, activeTab !== 'map' && styles.floatingButtonDisabled]}
          onPress={() => {
            if (activeTab === 'map') {
              setMapFiltersVisible(false);
              setOpenSearchToken((prev) => prev + 1);
            }
          }}
          disabled={activeTab !== 'map'}
        >
          <Text style={styles.floatingIcon}>🔎</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.floatingButton, activeTab !== 'map' && styles.floatingButtonDisabled]}
          onPress={() => {
            if (activeTab === 'map') {
              setMapFiltersVisible(false);
              setToggleFavoritesToken((prev) => prev + 1);
            }
          }}
          disabled={activeTab !== 'map'}
        >
          <Text style={styles.floatingIcon}>⭐</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.floatingButton, activeTab !== 'map' && styles.floatingButtonDisabled]}
          onPress={() => {
            if (activeTab === 'map') {
              setMapFiltersVisible(false);
              setRecenterToken((prev) => prev + 1);
            }
          }}
          disabled={activeTab !== 'map'}
        >
          <Text style={styles.floatingIcon}>📍</Text>
        </TouchableOpacity>
      </View>}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  screenWrap: {
    flex: 1,
    position: 'relative',
  },
  schedulesOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F8FAFC',
    zIndex: 20,
  },
  floatingMenu: {
    position: 'absolute',
    right: 16,
    top: 62,
    gap: 12,
    zIndex: 999,
    elevation: 999,
  },
  floatingButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  floatingButtonActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
  },
  floatingButtonDisabled: {
    opacity: 0.45,
  },
  floatingIcon: {
    fontSize: 24,
    lineHeight: 30,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
});
