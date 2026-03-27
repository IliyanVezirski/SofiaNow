import { StatusBar } from 'expo-status-bar';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
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
import { loadFavoritePlaces, reconcileFavoriteCommuteNotifications } from './src/services/places';
import { TripRouteGeoJSON } from './src/features/tripPlanner/utils/routeGeoJson';
import { FAVORITE_COMMUTE_ROUTE_NOTIFICATION_ACTION_SHOW_ROUTE } from './src/services/notifications/commuteRouteNotifications';

type BottomTab = 'map' | 'schedules' | 'planner' | 'nearby';

type OpenedNotification = {
  id: string;
  title: string;
  body: string;
  favoriteId: string | null;
  canShowRoute: boolean;
};

type HomeActionButton = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

const extractDelayHighlight = (body: string | null | undefined) => {
  const value = String(body || '');
  const match = /(закъснява с \d+ мин|идва с \d+ мин по-рано)/.exec(value);
  if (!match || match.index == null) {
    return {
      before: value,
      highlight: null,
      after: '',
      tone: null as 'late' | 'early' | null,
    };
  }

  const highlight = match[0];
  return {
    before: value.slice(0, match.index),
    highlight,
    after: value.slice(match.index + highlight.length),
    tone: highlight.startsWith('закъснява') ? 'late' as const : 'early' as const,
  };
};

export default function App() {
  const [activeTab, setActiveTab] = useState<BottomTab>('map');
  const [openedNotification, setOpenedNotification] = useState<OpenedNotification | null>(null);
  const lastHandledNotificationIdRef = useRef<string | null>(null);
  const notificationBodyParts = extractDelayHighlight(openedNotification?.body);

  const showFavoriteRouteFromNotification = async (favoriteId: string | null | undefined) => {
    const normalizedFavoriteId = String(favoriteId || '').trim();
    if (!normalizedFavoriteId) {
      return false;
    }

    const favorites = await loadFavoritePlaces();
    const favorite = favorites.find((item) => item.id === normalizedFavoriteId) ?? null;
    const commutePlan = favorite?.defaultCommute ?? null;
    if (!favorite || !commutePlan) {
      return false;
    }

    if (commutePlan.routeGeoJson) {
      setTripPlannerRoute(commutePlan.routeGeoJson);
      setMapFiltersVisible(false);
      setDismissTransientPanelsToken((value) => value + 1);
      setActiveTab('map');
      return true;
    }

    if (
      Number.isFinite(commutePlan.originLatitude)
      && Number.isFinite(commutePlan.originLongitude)
      && Number.isFinite(favorite.latitude)
      && Number.isFinite(favorite.longitude)
    ) {
      setPlannerInitialFrom({
        latitude: commutePlan.originLatitude as number,
        longitude: commutePlan.originLongitude as number,
        name: commutePlan.originName || 'Начална точка',
      });
      setPlannerInitialTo({
        latitude: favorite.latitude as number,
        longitude: favorite.longitude as number,
        name: favorite.name,
      });
      setPlannerInitialFromToken((value) => value + 1);
      setMapFiltersVisible(false);
      setDismissTransientPanelsToken((value) => value + 1);
      setActiveTab('planner');
      return true;
    }

    return false;
  };

  const openNotificationModal = (response: Notifications.NotificationResponse | null) => {
    const identifier = response?.notification.request.identifier;
    if (!identifier || lastHandledNotificationIdRef.current === identifier) {
      return;
    }

    lastHandledNotificationIdRef.current = identifier;
    const { title, body } = response.notification.request.content;
    const data = response.notification.request.content.data as { favoriteId?: unknown; type?: unknown } | undefined;
    const favoriteId = data?.type === 'favorite-commute-route' ? String(data.favoriteId || '').trim() : '';

    setOpenedNotification({
      id: identifier,
      title: String(title || 'Уведомление'),
      body: String(body || 'Няма допълнителна информация.'),
      favoriteId: favoriteId || null,
      canShowRoute: !!favoriteId,
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

        const favoriteId = String((response.notification.request.content.data as { favoriteId?: unknown } | undefined)?.favoriteId || '').trim();
        if (response.actionIdentifier === FAVORITE_COMMUTE_ROUTE_NOTIFICATION_ACTION_SHOW_ROUTE) {
          await showFavoriteRouteFromNotification(favoriteId);
          await Notifications.clearLastNotificationResponseAsync();
          return;
        }

        openNotificationModal(response);
        await Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => undefined);

    const notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const favoriteId = String((response.notification.request.content.data as { favoriteId?: unknown } | undefined)?.favoriteId || '').trim();
      if (response.actionIdentifier === FAVORITE_COMMUTE_ROUTE_NOTIFICATION_ACTION_SHOW_ROUTE) {
        void showFavoriteRouteFromNotification(favoriteId).finally(() => {
          void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
        });
        return;
      }

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
  const [searchVisible, setSearchVisible] = useState(false);
  const [favoritesVisible, setFavoritesVisible] = useState(false);

  const homeActionButtons: HomeActionButton[] = [
    {
      key: 'nearby',
      label: 'До мен',
      icon: 'footsteps-outline',
      onPress: () => {
        setActiveTab((prev) => (prev === 'nearby' ? 'map' : 'nearby'));
        setMapFiltersVisible(false);
        setDismissTransientPanelsToken((value) => value + 1);
      },
    },
    {
      key: 'schedules',
      label: 'Разписание',
      icon: 'time-outline',
      onPress: () => {
        setActiveTab((prev) => (prev === 'schedules' ? 'map' : 'schedules'));
        setMapFiltersVisible(false);
        setDismissTransientPanelsToken((value) => value + 1);
      },
    },
    {
      key: 'planner',
      label: 'Маршрут',
      icon: 'navigate-outline',
      onPress: () => {
        setActiveTab((prev) => (prev === 'planner' ? 'map' : 'planner'));
        setMapFiltersVisible(false);
        setDismissTransientPanelsToken((value) => value + 1);
      },
    },
    {
      key: 'search',
      label: 'Търсене',
      icon: 'search-outline',
      onPress: () => {
        setActiveTab('map');
        setMapFiltersVisible(false);
        setDismissTransientPanelsToken((prev) => prev + 1);
        setTimeout(() => setOpenSearchToken((prev) => prev + 1), 0);
      },
    },
    {
      key: 'favorites',
      label: 'Места',
      icon: 'bookmark-outline',
      onPress: () => {
        setActiveTab('map');
        setMapFiltersVisible(false);
        setDismissTransientPanelsToken((prev) => prev + 1);
        setTimeout(() => setToggleFavoritesToken((prev) => prev + 1), 0);
      },
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.screenWrap}>
        <MapScreen
          isActive={activeTab === 'map' || activeTab === 'nearby' || activeTab === 'schedules' || activeTab === 'planner'}
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
          onSearchVisibilityChange={setSearchVisible}
          onFavoritesVisibilityChange={setFavoritesVisible}
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
        {activeTab === 'schedules' && (
          <View style={styles.nearbyPopupOverlay}>
            <Pressable style={styles.nearbyPopupBackdrop} onPress={() => setActiveTab('map')} />
            <View style={styles.schedulesPopupCard}>
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
          </View>
        )}
        {activeTab === 'planner' && (
          <View style={styles.nearbyPopupOverlay}>
            <Pressable style={styles.nearbyPopupBackdrop} onPress={() => setActiveTab('map')} />
            <View style={styles.plannerPopupCard}>
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
          </View>
        )}
        {activeTab === 'nearby' && (
          <View style={styles.nearbyPopupOverlay}>
            <Pressable style={styles.nearbyPopupBackdrop} onPress={() => setActiveTab('map')} />
            <View style={styles.nearbyPopupCard}>
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
        )}
      </View>

      <View style={styles.homeActionBarWrap}>
        <View style={styles.homeActionBar}>
          {homeActionButtons.map((button) => {
            const isActive = button.key === activeTab
              || (button.key === 'search' && searchVisible)
              || (button.key === 'favorites' && favoritesVisible);
            return (
              <TouchableOpacity
                key={button.key}
                style={styles.homeActionButton}
                onPress={button.onPress}
                activeOpacity={0.8}
              >
                <View style={[styles.homeActionIconWrap, isActive && styles.homeActionIconWrapActive]}>
                  <Ionicons name={button.icon} size={20} color={isActive ? '#FFFFFF' : '#0F172A'} />
                </View>
                <Text style={[styles.homeActionLabel, isActive && styles.homeActionLabelActive]}>{button.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

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
            <Text style={styles.notificationModalBody}>
              {notificationBodyParts.before}
              {notificationBodyParts.highlight ? (
                <Text
                  style={[
                    styles.notificationModalBody,
                    notificationBodyParts.tone === 'late'
                      ? styles.notificationModalBodyLate
                      : styles.notificationModalBodyEarly,
                  ]}
                >
                  {notificationBodyParts.highlight}
                </Text>
              ) : null}
              {notificationBodyParts.after}
            </Text>
            {openedNotification?.canShowRoute ? (
              <TouchableOpacity
                style={styles.notificationModalAction}
                onPress={() => {
                  const favoriteId = openedNotification.favoriteId;
                  setOpenedNotification(null);
                  void showFavoriteRouteFromNotification(favoriteId);
                }}
              >
                <Text style={styles.notificationModalActionText}>Покажи маршрута</Text>
              </TouchableOpacity>
            ) : null}
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
  schedulesPopupCard: {
    width: '100%',
    height: '82%',
    minHeight: 420,
    maxHeight: 640,
    alignSelf: 'center',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.72)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 10,
  },
  plannerPopupCard: {
    width: '100%',
    height: '92%',
    minHeight: 480,
    maxHeight: 840,
    alignSelf: 'center',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.72)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 10,
  },
  nearbyPopupOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    paddingTop: 78,
    paddingHorizontal: 12,
    paddingBottom: 80,
    zIndex: 40,
  },
  nearbyPopupBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.18)',
  },
  nearbyPopupCard: {
    width: '100%',
    height: '72%',
    minHeight: 360,
    maxHeight: 560,
    alignSelf: 'center',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.72)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 10,
  },
  homeActionBarWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 18,
    zIndex: 999,
    elevation: 999,
  },
  homeActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.72)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
  },
  homeActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  homeActionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248,250,252,0.42)',
  },
  homeActionIconWrapActive: {
    backgroundColor: '#1D4ED8',
  },
  homeActionLabel: {
    marginTop: 5,
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  homeActionLabelActive: {
    color: '#1D4ED8',
    fontWeight: '700',
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
  notificationModalBodyLate: {
    color: '#DC2626',
    fontWeight: '800',
  },
  notificationModalBodyEarly: {
    color: '#2563EB',
    fontWeight: '800',
  },
  notificationModalAction: {
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: '#0F766E',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationModalActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
