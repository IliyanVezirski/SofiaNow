import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useState } from 'react';
import MapScreen from './src/screens/MapScreen';
import SchedulesScreen from './src/screens/SchedulesScreen';
import { RouteSelection } from './src/types/routes';

type BottomTab = 'map' | 'schedules';

export default function App() {
  const [activeTab, setActiveTab] = useState<BottomTab>('map');
  const [selectedRoute, setSelectedRoute] = useState<RouteSelection | null>(null);
  const [mapFiltersVisible, setMapFiltersVisible] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.screenWrap}>
        <MapScreen
          highlightedRoute={selectedRoute}
          filterPanelVisible={mapFiltersVisible}
        />
        {activeTab === 'schedules' && (
          <View style={styles.schedulesOverlay}>
          <SchedulesScreen
            onOpenRoute={(route) => {
              setSelectedRoute(route);
              setActiveTab('map');
            }}
          />
          </View>
        )}
      </View>

      <View style={styles.floatingMenu}>
        <TouchableOpacity
          style={[
            styles.floatingButton,
            activeTab === 'map' && mapFiltersVisible && styles.floatingButtonActive,
            activeTab !== 'map' && styles.floatingButtonDisabled,
          ]}
          onPress={() => {
            if (activeTab === 'map') {
              setMapFiltersVisible((prev) => !prev);
            }
          }}
          disabled={activeTab !== 'map'}
        >
          <Text style={styles.floatingIcon}>🎛️</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.floatingButton, activeTab === 'map' && styles.floatingButtonActive]}
          onPress={() => {
            setActiveTab('map');
            setSelectedRoute(null);
          }}
        >
          <Text style={styles.floatingIcon}>🗺️</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.floatingButton, activeTab === 'schedules' && styles.floatingButtonActive]}
          onPress={() => {
            setActiveTab((prev) => (prev === 'schedules' ? 'map' : 'schedules'));
          }}
        >
          <Text style={styles.floatingIcon}>🕒</Text>
        </TouchableOpacity>
      </View>
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
    zIndex: 40,
    elevation: 40,
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
    lineHeight: 24,
  },
});
