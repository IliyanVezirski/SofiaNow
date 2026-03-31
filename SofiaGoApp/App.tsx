import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import MapScreen from './src/screens/MapScreen';
import { useParkingCatalog } from './src/features/parkingZones/hooks/useParkingCatalog';
import { useParkingCars } from './src/features/parkingZones/hooks/useParkingCars';
import { HomeActionBar } from './src/app/components/HomeActionBar';
import { AppOverlays } from './src/app/components/AppOverlays';
import { OpenedNotificationModal } from './src/app/components/OpenedNotificationModal';
import { useAppFlow } from './src/app/hooks/useAppFlow';
import { useHomeActions } from './src/app/hooks/useHomeActions';
import { useAppNotifications } from './src/app/hooks/useAppNotifications';
import { useNavigationPreferences } from './src/app/hooks/useNavigationPreferences';

export default function App() {
  const appFlow = useAppFlow();
  const parkingCatalog = useParkingCatalog();
  const parkingCars = useParkingCars();

  useAppNotifications({
    setOpenedNotification: appFlow.setOpenedNotification,
    showFavoriteRouteFromNotification: appFlow.showFavoriteRouteFromNotification,
  });

  useNavigationPreferences({
    mapExperienceMode: appFlow.mapExperienceMode,
    setMapExperienceMode: appFlow.setMapExperienceMode,
    parkingActionKey: appFlow.parkingActionKey,
    setParkingActionKey: appFlow.setParkingActionKey,
    setParkingLotsVisible: appFlow.setParkingLotsVisible,
  });

  const homeActionButtons = useHomeActions(appFlow);

  return (
    <View style={styles.container}>
      <View style={styles.screenWrap}>
        <MapScreen
          isActive={appFlow.activeTab === 'map' || appFlow.activeTab === 'nearby' || appFlow.activeTab === 'schedules' || appFlow.activeTab === 'planner'}
          parkingLots={parkingCatalog.lots}
          preferredMapExperienceMode={appFlow.mapExperienceMode}
          highlightedRoute={appFlow.selectedRoute}
          onClearHighlightedRoute={() => appFlow.setSelectedRoute(null)}
          showReportButton={false}
          filterPanelVisible={appFlow.mapFiltersVisible}
          onCloseFilterPanel={() => appFlow.setMapFiltersVisible(false)}
          onShowTripRoute={(route, source) => appFlow.handleShowTripRouteOnMap(route, source === 'favorites' ? 'favorites' : 'planner')}
          searchRequestToken={appFlow.openSearchToken}
          favoritesRequestToken={appFlow.toggleFavoritesToken}
          dismissTransientPanelsToken={appFlow.dismissTransientPanelsToken}
          focusStopCoordinate={appFlow.focusStopCoordinate}
          focusStopId={appFlow.focusStopId}
          focusedParkingZoneFeatureId={appFlow.focusedParkingZoneFeatureId}
          focusParkingZoneBounds={appFlow.focusParkingZoneBounds}
          focusParkingZoneToken={appFlow.focusParkingZoneToken}
          onClearFocusedParkingZone={appFlow.handleClearFocusedParkingZone}
          tripPlannerRoute={appFlow.tripPlannerRoute}
          onClearTripRoute={appFlow.handleCloseShownTripRoute}
          onSearchVisibilityChange={appFlow.setSearchVisible}
          onFavoritesVisibilityChange={appFlow.setFavoritesVisible}
          onMapExperienceModeChange={appFlow.setMapExperienceMode}
          onParkingZoneChange={appFlow.setParkingDetectedZoneId}
          onShowParkingZoneOnMap={appFlow.handleShowParkingZoneOnMap}
          onBuildRouteFromCoordinate={appFlow.handleOpenPlannerWithCoordinates}
          onOpenSavedTripRoute={(routeId) => {
            void appFlow.showSavedTripRouteFromReminder(routeId);
          }}
        />

        <AppOverlays
          activeTab={appFlow.activeTab}
          focusedParkingZoneFeatureId={appFlow.focusedParkingZoneFeatureId}
          onCloseNearby={() => appFlow.setActiveTab('map')}
          onCloseParkingCars={() => appFlow.setParkingCarsVisible(false)}
          onCloseParkingLots={() => appFlow.setParkingLotsVisible(false)}
          onCloseParkingPayment={() => appFlow.setParkingPaymentVisible(false)}
          onCloseParkingZones={() => appFlow.setParkingZonesVisible(false)}
          onClosePlanner={() => appFlow.setActiveTab('map')}
          onCloseSchedules={() => appFlow.setActiveTab('map')}
          onFocusStop={appFlow.handleFocusStop}
          onOpenManageCars={appFlow.handleOpenManageCars}
          onOpenPlannerWithCoordinates={appFlow.handleOpenPlannerWithCoordinates}
          onOpenRoute={(route) => {
            appFlow.setSelectedRoute(route);
            appFlow.setActiveTab('map');
          }}
          onShowParkingZoneOnMap={appFlow.handleShowParkingZoneOnMap}
          onShowPlannerRoute={(route) => appFlow.handleShowTripRouteOnMap(route, 'planner')}
          parkingCars={{
            cars: parkingCars.cars,
            loading: parkingCars.loading,
            addCar: parkingCars.addCar,
            removeCar: parkingCars.removeCar,
            updateCar: parkingCars.updateCar,
            setDefaultCar: parkingCars.setDefaultCar,
          }}
          parkingDetectedZoneId={appFlow.parkingDetectedZoneId}
          parkingLots={parkingCatalog.lots}
          parkingLotsVisible={appFlow.parkingLotsVisible}
          parkingPaymentVisible={appFlow.parkingPaymentVisible}
          parkingZonesVisible={appFlow.parkingZonesVisible}
          parkingCarsVisible={appFlow.parkingCarsVisible}
          plannerInitialFrom={appFlow.plannerInitialFrom}
          plannerInitialFromToken={appFlow.plannerInitialFromToken}
          plannerInitialTo={appFlow.plannerInitialTo}
          plannerSavedRoute={appFlow.plannerSavedRoute}
          plannerSavedRouteToken={appFlow.plannerSavedRouteToken}
          plannerVisible={appFlow.plannerVisible}
        />
      </View>

      <HomeActionBar
        buttons={homeActionButtons}
        activeTab={appFlow.activeTab}
        searchVisible={appFlow.searchVisible}
        favoritesVisible={appFlow.favoritesVisible}
      />

      <OpenedNotificationModal
        openedNotification={appFlow.openedNotification}
        onClose={() => appFlow.setOpenedNotification(null)}
        onShowRoute={(favoriteId) => {
          void appFlow.showFavoriteRouteFromNotification(favoriteId);
        }}
      />

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
});
