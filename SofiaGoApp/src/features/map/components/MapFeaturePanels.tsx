import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { CentralSearchResult } from '../../search/hooks/useSearch';
import { SearchModal } from '../../search/components/SearchModal';
import { FavoritesPanel } from '../../favorites/components/FavoritesPanel';
import { FilterPanel } from '../../filters/components/FilterPanel';
import { RouteStopsPanel } from '../../routing/components/RouteStopsPanel';
import { DroppedPinPanel } from '../../droppedPin/components/DroppedPinPanel';
import { ParkingLotInfoPanel } from '../../parkingZones/components/ParkingLotInfoPanel';
import { StopInfoPanel } from '../../stops/components/StopInfoPanel';
import { VehicleInfoPanel } from '../../vehicles/components/VehicleInfoPanel';
import { StopScheduleModal } from '../../stops/components/StopScheduleModal';
import { ReportModal } from '../../reporting/components/ReportModal';
import { SettingsModal } from '../../settings/components/SettingsModal';
import { SupportModal } from '../../settings/components/SupportModal';
import { ParkingPaymentScreen } from '../../parkingZones/components/ParkingPaymentScreen';
import { ParkingCarsScreen } from '../../parkingZones/components/ParkingCarsScreen';

type Props = {
    activeParkingOverlay: 'payment' | 'cars' | null;
    animationFilteredVehiclesCount: number;
    currentLocation: { latitude: number; longitude: number } | null;
    detectedParkingZoneId: string | null;
    droppedPin: { latitude: number; longitude: number } | null;
    droppedPinAlreadySaved: boolean;
    droppedPinMatchingFavoriteId: string | null;
    droppedPinPanelBottomOffset: number;
    editRequestFavoriteId: string | null;
    etasBySelectedStopId: any[];
    filterPanelVisible: boolean;
    filters: any;
    floatingControls: any;
    favorites: any;
    isParkingMode: boolean;
    isTransitMode: boolean;
    liveLines: Set<string>;
    onBuildRouteFromCoordinate?: (dstLat: number, dstLon: number, curLat?: number, curLon?: number) => void;
    onCloseFilterPanel?: () => void;
    onCloseParkingOverlay: () => void;
    onEditRequestHandled: () => void;
    onCloseSelectedParkingLot: () => void;
    onFilterOpenStopDetails: (stop: any) => Promise<void>;
    onOpenManageCars: () => void;
    onOpenSavedTripRoute?: (routeId: string) => void | Promise<void>;
    onParkingDroppedPinNavigate: () => void;
    onRouteStopSelect: (stop: any) => void;
    onSaveFavoriteFromSearch: (name: string, lat: number, lon: number) => void | Promise<void>;
    onSelectFavorite: (favorite: any) => void;
    onSelectLineResult: (result: CentralSearchResult) => void;
    onSelectSearchResult: (result: CentralSearchResult) => void;
    onSelectStopResult: (result: CentralSearchResult) => void;
    onShowFavoriteRouteOnMap: (route: any) => void;
    onSelectedStopPlaceAction: () => void;
    onSelectedStopNavigateAction: () => void;
    onSelectedStopEtaVehicleAction: (eta: any) => void;
    hasLiveVehicleForEta: (eta: any) => boolean;
    onSelectedVehicleClose: () => void;
    onSelectedVehicleLoadRoute: () => void;
    onTransitDroppedPinBuildRoute?: () => void;
    onTransitDroppedPinEditLocation?: () => void;
    onTransitDroppedPinSaveFavorite?: () => void;
    parkingCars: any;
    parkingOverlayBottomOffset: number;
    parkingPaymentPanelHeight: number;
    parkingCarsPanelHeight: number;
    parkingZones: any;
    reporting: any;
    routeLoading: boolean;
    reportButtonBottomOffset: number;
    routeStopsToggleTopOffset: number;
    routing: any;
    schedule: any;
    search: any;
    searchableStops: any[];
    selectedLotLiveData: any;
    selectedParkingLot: any;
    selectedStop: any;
    selectedStopMatchingFavorite: boolean;
    selectedStopPlaceSubmitting: boolean;
    selectedVehicle: any;
    selectedVehicleRouteActive: boolean;
    selectedVehicleStopName: string;
    setDroppedPin: (value: { latitude: number; longitude: number } | null) => void;
    showReportButton: boolean;
    stopsHook: any;
    totalVehiclesCount: number;
    vehicleDelays: Record<string, any>;
    visibleSearchResults: CentralSearchResult[];
};

export function MapFeaturePanels({
    activeParkingOverlay,
    animationFilteredVehiclesCount,
    currentLocation,
    detectedParkingZoneId,
    droppedPin,
    droppedPinAlreadySaved,
    droppedPinMatchingFavoriteId,
    droppedPinPanelBottomOffset,
    editRequestFavoriteId,
    etasBySelectedStopId,
    filterPanelVisible,
    filters,
    floatingControls,
    favorites,
    isParkingMode,
    isTransitMode,
    liveLines,
    onBuildRouteFromCoordinate,
    onCloseFilterPanel,
    onCloseParkingOverlay,
    onCloseSelectedParkingLot,
    onEditRequestHandled,
    onFilterOpenStopDetails,
    onOpenManageCars,
    onOpenSavedTripRoute,
    onParkingDroppedPinNavigate,
    onRouteStopSelect,
    onSaveFavoriteFromSearch,
    onSelectFavorite,
    onSelectLineResult,
    onSelectSearchResult,
    onSelectStopResult,
    onShowFavoriteRouteOnMap,
    onSelectedStopPlaceAction,
    onSelectedStopNavigateAction,
    onSelectedStopEtaVehicleAction,
    hasLiveVehicleForEta,
    onSelectedVehicleClose,
    onSelectedVehicleLoadRoute,
    onTransitDroppedPinBuildRoute,
    onTransitDroppedPinEditLocation,
    onTransitDroppedPinSaveFavorite,
    parkingCars,
    parkingOverlayBottomOffset,
    parkingPaymentPanelHeight,
    parkingCarsPanelHeight,
    parkingZones,
    reporting,
    routeLoading,
    reportButtonBottomOffset,
    routeStopsToggleTopOffset,
    routing,
    schedule,
    search,
    searchableStops,
    selectedLotLiveData,
    selectedParkingLot,
    selectedStop,
    selectedStopMatchingFavorite,
    selectedStopPlaceSubmitting,
    selectedVehicle,
    selectedVehicleRouteActive,
    selectedVehicleStopName,
    setDroppedPin,
    showReportButton,
    stopsHook,
    totalVehiclesCount,
    vehicleDelays,
    visibleSearchResults,
}: Props) {
    return (
        <>
            <SearchModal
                visible={search.searchModalVisible}
                query={search.locationSearchQuery}
                loading={search.locationSearchLoading}
                results={visibleSearchResults}
                placeholder={isParkingMode ? 'Търси адрес или място' : 'Търси адрес, линия или спирка'}
                allowSaveFavorite={!isParkingMode}
                onChangeQuery={search.setLocationSearchQuery}
                onClose={() => search.setSearchModalVisible(false)}
                onSelectPlace={onSelectSearchResult}
                onSelectLine={onSelectLineResult}
                onSelectStop={onSelectStopResult}
                onSaveFavorite={onSaveFavoriteFromSearch}
            />

            <FavoritesPanel
                visible={isTransitMode && favorites.favoritesVisible}
                places={favorites.favoritePlaces}
                searchableStops={searchableStops}
                currentPin={droppedPin}
                currentLocation={currentLocation}
                onOpenCentralPlanner={(favorite) => {
                    if (!Number.isFinite(favorite.latitude) || !Number.isFinite(favorite.longitude)) {
                        return;
                    }

                    onBuildRouteFromCoordinate?.(
                        favorite.latitude,
                        favorite.longitude,
                        currentLocation?.latitude,
                        currentLocation?.longitude,
                    );
                    favorites.setFavoritesVisible(false);
                }}
                onShowRouteOnMap={(route) => {
                    onShowFavoriteRouteOnMap(route);
                    favorites.setFavoritesVisible(false);
                }}
                onReorder={favorites.reorderFavorites}
                onSelect={onSelectFavorite}
                onUpdate={favorites.updateFavorite}
                onCreate={favorites.createFavorite}
                onRemove={favorites.removeFavorite}
                onClose={() => favorites.setFavoritesVisible(false)}
                editRequestFavoriteId={editRequestFavoriteId}
                onEditRequestHandled={onEditRequestHandled}
            />

            {isTransitMode && filterPanelVisible && !filters.isRouteMode ? (
                <FilterPanel
                    visible={true}
                    selectedVehicleTypes={filters.selectedVehicleTypes}
                    selectedLines={filters.selectedLines}
                    availableLines={filters.availableLines}
                    liveLineSet={liveLines}
                    filteredVehiclesCount={animationFilteredVehiclesCount}
                    totalVehiclesCount={totalVehiclesCount}
                    filteredStops={stopsHook.filteredStops}
                    totalStopsCount={stopsHook.stops.length}
                    onToggleVehicleType={filters.toggleVehicleTypeFilter}
                    onToggleLine={filters.toggleLineFilter}
                    onClearVehicleTypes={() => filters.setSelectedVehicleTypes([])}
                    onClearLines={() => filters.setSelectedLines([])}
                    onClose={onCloseFilterPanel}
                    onOpenStopDetails={onFilterOpenStopDetails}
                />
            ) : null}

            {isTransitMode && filters.isRouteMode && routing.routeGeometry ? (
                <RouteStopsPanel
                    visible={routing.routeStopsPanelVisible}
                    lineName={routing.routeGeometry.line}
                    searchQuery={routing.routeStopSearch}
                    onSearchChange={routing.setRouteStopSearch}
                    stops={routing.routeStopsFiltered}
                    selectedStopId={selectedStop.selectedStop?.id ?? null}
                    onSelectStop={onRouteStopSelect}
                    onClose={() => routing.setRouteStopsPanelVisible(false)}
                    onToggleOpen={() => routing.setRouteStopsPanelVisible(true)}
                    toggleTopOffset={routeStopsToggleTopOffset}
                />
            ) : null}

            {isTransitMode && droppedPin && !selectedStop.selectedStop && !selectedVehicle ? (
                <DroppedPinPanel
                    pin={droppedPin}
                    bottomOffset={droppedPinPanelBottomOffset}
                    onClose={() => setDroppedPin(null)}
                    onSaveFavorite={droppedPinAlreadySaved ? undefined : onTransitDroppedPinSaveFavorite}
                    onBuildRoute={onTransitDroppedPinBuildRoute}
                    onEditLocation={droppedPinMatchingFavoriteId ? onTransitDroppedPinEditLocation : undefined}
                />
            ) : null}

            {isParkingMode && droppedPin && !selectedStop.selectedStop && !selectedVehicle && !selectedParkingLot ? (
                <DroppedPinPanel
                    pin={droppedPin}
                    bottomOffset={droppedPinPanelBottomOffset}
                    onClose={() => setDroppedPin(null)}
                    primaryActionLabel="Навигирай ме"
                    onBuildRoute={onParkingDroppedPinNavigate}
                />
            ) : null}

            {isParkingMode && selectedParkingLot ? (
                <ParkingLotInfoPanel
                    lot={selectedParkingLot}
                    liveData={selectedLotLiveData}
                    inline
                    bottomOffset={parkingOverlayBottomOffset}
                    onClose={onCloseSelectedParkingLot}
                />
            ) : null}

            {isTransitMode && selectedStop.selectedStop && !selectedVehicle && !schedule.scheduleStopId ? (
                <StopInfoPanel
                    stop={selectedStop.selectedStop}
                    etas={etasBySelectedStopId}
                    onClose={selectedStop.closeSelectedStop}
                    onOpenSchedule={schedule.openStopSchedule}
                    onOpenSavedTripRoute={onOpenSavedTripRoute}
                    onPlaceAction={onSelectedStopPlaceAction}
                    onNavigateAction={onSelectedStopNavigateAction}
                    onEtaVehicleAction={onSelectedStopEtaVehicleAction}
                    hasLiveVehicleForEta={hasLiveVehicleForEta}
                    placeSaved={selectedStopMatchingFavorite}
                    placeSubmitting={selectedStopPlaceSubmitting}
                />
            ) : null}

            {isTransitMode && selectedVehicle ? (
                <VehicleInfoPanel
                    vehicle={selectedVehicle}
                    delay={vehicleDelays[selectedVehicle.id]}
                    stopName={selectedVehicleStopName}
                    onClose={onSelectedVehicleClose}
                    onLoadRoute={onSelectedVehicleLoadRoute}
                    routeLoading={routeLoading}
                    isRouteActive={selectedVehicleRouteActive}
                />
            ) : null}

            {showReportButton && isTransitMode ? (
                <View style={[styles.bottomOverlay, { bottom: reportButtonBottomOffset }]}>
                    <TouchableOpacity style={styles.reportButton} onPress={reporting.openReportModal}>
                        <Text style={styles.reportText}>{'\uD83D\uDEA8'} Сигнализирай</Text>
                    </TouchableOpacity>
                </View>
            ) : null}

            <StopScheduleModal
                stopId={isTransitMode ? schedule.scheduleStopId : null}
                stopName={isTransitMode ? schedule.scheduleStopName : ''}
                realtime={isTransitMode ? schedule.scheduleRealtime : []}
                staticSchedule={isTransitMode ? schedule.scheduleStatic : []}
                dayType={schedule.scheduleDayType}
                loading={isTransitMode ? schedule.scheduleLoading : false}
                onClose={schedule.closeSchedule}
                onChangeDayType={schedule.changeDayType}
            />

            <ReportModal visible={reporting.reportModalVisible} onClose={reporting.closeReportModal} />
            <SettingsModal
                visible={floatingControls.settingsVisible}
                onClose={() => floatingControls.setSettingsVisible(false)}
                parkingZonesEnabled={parkingZones.enabled}
                parkingZonesDataReady={parkingZones.hasData}
                parkingZoneFeatureCount={parkingZones.featureCount}
                parkingZoneUserLabel={parkingZones.userZone?.label ?? null}
                parkingZonePinLabel={parkingZones.droppedPinZone?.label ?? null}
                parkingZonesGuidance={parkingZones.guidance}
                onToggleParkingZones={parkingZones.toggleEnabled}
            />
            <SupportModal
                visible={floatingControls.supportVisible}
                onClose={() => floatingControls.setSupportVisible(false)}
                onOpenSupport={floatingControls.handleOpenSupportLink}
            />

            {activeParkingOverlay ? (
                <View
                    style={[
                        styles.parkingSheetCard,
                        {
                            bottom: parkingOverlayBottomOffset,
                            height: activeParkingOverlay === 'payment' ? parkingPaymentPanelHeight : parkingCarsPanelHeight,
                        },
                    ]}
                >
                    {activeParkingOverlay === 'payment' ? (
                        <ParkingPaymentScreen
                            cars={parkingCars.cars}
                            defaultZoneId={detectedParkingZoneId as any}
                            onClose={onCloseParkingOverlay}
                            onOpenManageCars={onOpenManageCars}
                        />
                    ) : (
                        <ParkingCarsScreen
                            cars={parkingCars.cars}
                            loading={parkingCars.loading}
                            onAddCar={parkingCars.addCar}
                            onRemoveCar={parkingCars.removeCar}
                            onUpdateCar={parkingCars.updateCar}
                            onSetDefaultCar={parkingCars.setDefaultCar}
                            onClose={onCloseParkingOverlay}
                        />
                    )}
                </View>
            ) : null}
        </>
    );
}

const styles = StyleSheet.create({
    parkingSheetCard: {
        position: 'absolute',
        left: 16,
        right: 16,
        backgroundColor: 'rgba(255,255,255,0.82)',
        borderRadius: 24,
        zIndex: 25,
        elevation: 25,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 28,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        overflow: 'hidden',
    },
    bottomOverlay: {
        position: 'absolute',
        width: '100%',
        alignItems: 'center',
        zIndex: 5,
        elevation: 5,
    },
    reportButton: {
        backgroundColor: '#E63946',
        paddingHorizontal: 25,
        paddingVertical: 15,
        borderRadius: 30,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 6,
    },
    reportText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
