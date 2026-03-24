import { StatusBar } from 'expo-status-bar';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as NavigationBar from 'expo-navigation-bar';
import MapScreen from './src/screens/MapScreen';
import SchedulesScreen from './src/screens/SchedulesScreen';
import TripPlannerScreen from './src/screens/TripPlannerScreen';
import NearbyScreen from './src/screens/NearbyScreen';
import { RouteSelection } from './src/types/routes';
import { TripLocation } from './src/services/tripPlanner';
import { initializeTransitArrivalNotifications, refreshTransitArrivalReminders } from './src/services/notifications/transitArrivalNotifications';
import { ensureTransitReminderBackgroundTaskRegistered } from './src/services/notifications/transitReminderBackgroundTask';
import { ReminderCenterButton } from './src/features/notifications/components/ReminderCenterButton';
import { reconcileFavoriteCommuteNotifications } from './src/services/places';
import { TripRouteGeoJSON } from './src/features/tripPlanner/utils/routeGeoJson';

type BottomTab = 'map' | 'schedules' | 'planner' | 'nearby';

type OpenedNotification = {
  id: string;
  title: string;
  body: string;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<BottomTab>('map');
  const [openedNotification, setOpenedNotification] = useState<OpenedNotification | null>(null);
  const lastHandledNotificationIdRef = useRef<string | null>(null);

  const openNotificationModal = (response: Notifications.NotificationResponse | null) => {
    const identifier = response?.notification.request.identifier;
    if (!identifier || lastHandledNotificationIdRef.current === identifier) {
      return;
    }

    lastHandledNotificationIdRef.current = identifier;
    const { title, body } = response.notification.request.content;

    setOpenedNotification({
      id: identifier,
      title: String(title || 'Уведомление'),
      body: String(body || 'Няма допълнителна информация.'),
    });
  };

  useEffect(() => {
    void NavigationBar.setVisibilityAsync('hidden');
    void initializeTransitArrivalNotifications();
    void ensureTransitReminderBackgroundTaskRegistered();
    void refreshTransitArrivalReminders();
    void reconcileFavoriteCommuteNotifications();

    void Notifications.getLastNotificationResponseAsync()
      .then(async (response) => {
        if (!response) {
          return;
        }

        openNotificationModal(response);
        await Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => undefined);

    const notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      openNotificationModal(response);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    });

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshTransitArrivalReminders();
        void reconcileFavoriteCommuteNotifications();
      }
    });

    return () => {
      notificationResponseSubscription.remove();
      appStateSubscription.remove();
    };
  }, []);

  const [selectedRoute, setSelectedRoute] = useState<RouteSelection | null>(null);
  const [mapFiltersVisible, setMapFiltersVisible] = useState(false);
  const [openSearchToken, setOpenSearchToken] = useState(0);
  const [toggleFavoritesToken, setToggleFavoritesToken] = useState(0);
  const [dismissTransientPanelsToken, setDismissTransientPanelsToken] = useState(0);
  const [focusStopCoordinate, setFocusStopCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
  const [focusStopId, setFocusStopId] = useState<string | null>(null);
  const [tripPlannerRoute, setTripPlannerRoute] = useState<TripRouteGeoJSON | null>(null);
  const [plannerInitialFrom, setPlannerInitialFrom] = useState<TripLocation | null>(null);
  const [plannerInitialTo, setPlannerInitialTo] = useState<TripLocation | null>(null);
  const [plannerInitialFromToken, setPlannerInitialFromToken] = useState(0);

  return (
    <View style={styles.container}>
      <View style={styles.screenWrap}>
        <MapScreen
          highlightedRoute={selectedRoute}
          onClearHighlightedRoute={() => setSelectedRoute(null)}
          showReportButton={false}
          filterPanelVisible={mapFiltersVisible}
          onCloseFilterPanel={() => setMapFiltersVisible(false)}
          onShowTripRoute={(route) => {
            setTripPlannerRoute(route);
            setMapFiltersVisible(false);
            setDismissTransientPanelsToken((value) => value + 1);
            setActiveTab('map');
          }}
          searchRequestToken={openSearchToken}
          favoritesRequestToken={toggleFavoritesToken}
          dismissTransientPanelsToken={dismissTransientPanelsToken}
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
            isActive={activeTab === 'planner'}
            initialFromLocation={plannerInitialFrom}
            initialToLocation={plannerInitialTo}
            initialFromToken={plannerInitialFromToken}
            onShowOnMap={(route) => {
              setTripPlannerRoute(route);
              setActiveTab('map');
            }}
          />
        </View>
        {activeTab === 'nearby' && (
        <View style={styles.schedulesOverlay}>
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
        )}
      </View>

      <ReminderCenterButton />

      {activeTab !== 'schedules' && activeTab !== 'planner' && activeTab !== 'nearby' && (
        <View style={styles.carouselContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselScrollContent}
            snapToInterval={78}
            decelerationRate="fast"
          >
            <TouchableOpacity
              style={styles.carouselButton}
              onPress={() => {
                setActiveTab((prev) => (prev === 'nearby' ? 'map' : 'nearby'));
                setMapFiltersVisible(false);
                setDismissTransientPanelsToken((value) => value + 1);
              }}
            >
              <Text style={styles.carouselIcon}>👣</Text>
              <Text style={styles.carouselLabel}>До мен</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.carouselButton}
              onPress={() => {
                setActiveTab((prev) => (prev === 'schedules' ? 'map' : 'schedules'));
                setMapFiltersVisible(false);
                setDismissTransientPanelsToken((value) => value + 1);
              }}
            >
              <Text style={styles.carouselIcon}>🕒</Text>
              <Text style={styles.carouselLabel}>Разписание</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.carouselButton}
              onPress={() => {
                setActiveTab((prev) => (prev === 'planner' ? 'map' : 'planner'));
                setMapFiltersVisible(false);
                setDismissTransientPanelsToken((value) => value + 1);
              }}
            >
              <Text style={styles.carouselIcon}>🧭</Text>
              <Text style={styles.carouselLabel}>Маршрут</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.carouselButton, activeTab !== 'map' && styles.carouselButtonDisabled]}
              onPress={() => {
                if (activeTab === 'map') {
                  setMapFiltersVisible(false);
                  setOpenSearchToken((prev) => prev + 1);
                }
              }}
              disabled={activeTab !== 'map'}
            >
              <Text style={styles.carouselIcon}>🔎</Text>
              <Text style={styles.carouselLabel}>Търсене</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.carouselButton, activeTab !== 'map' && styles.carouselButtonDisabled]}
              onPress={() => {
                if (activeTab === 'map') {
                  setMapFiltersVisible(false);
                  setToggleFavoritesToken((prev) => prev + 1);
                }
              }}
              disabled={activeTab !== 'map'}
            >
              <Text style={styles.carouselIcon}>⭐</Text>
              <Text style={styles.carouselLabel}>Места</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      <Modal
        transparent
        animationType="fade"
        visible={!!openedNotification}
        statusBarTranslucent
        onRequestClose={() => setOpenedNotification(null)}
      >
        <View style={styles.notificationModalWrap}>
          <Pressable style={styles.notificationModalBackdrop} onPress={() => setOpenedNotification(null)} />
          <View style={styles.notificationModalCard}>
            <View style={styles.notificationModalHeader}>
              <Text style={styles.notificationModalEyebrow}>Известие</Text>
              <TouchableOpacity style={styles.notificationModalClose} onPress={() => setOpenedNotification(null)}>
                <Text style={styles.notificationModalCloseText}>Затвори</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.notificationModalTitle}>{openedNotification?.title}</Text>
            <Text style={styles.notificationModalBody}>{openedNotification?.body}</Text>
          </View>
        </View>
      </Modal>

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
  // Carousel styles - bottom horizontal scrollable menu
  carouselContainer: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    zIndex: 999,
    elevation: 999,
  },
  carouselScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  carouselButton: {
    width: 70,
    height: 70,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  carouselButtonDisabled: {
    opacity: 0.45,
  },
  carouselIcon: {
    fontSize: 24,
    lineHeight: 28,
  },
  carouselLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#475569',
    marginTop: 4,
  },
  notificationModalWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  notificationModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.36)',
  },
  notificationModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 16,
  },
  notificationModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  notificationModalEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  notificationModalClose: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  notificationModalCloseText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  notificationModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  notificationModalBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#334155',
  },
});
