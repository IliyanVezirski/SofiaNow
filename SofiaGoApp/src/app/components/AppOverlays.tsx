import NearbyScreen from '../../screens/NearbyScreen';
import SchedulesScreen from '../../screens/SchedulesScreen';
import TripPlannerScreen from '../../screens/TripPlannerScreen';
import { ParkingCarsScreen } from '../../features/parkingZones/components/ParkingCarsScreen';
import { ParkingLotsScreen } from '../../features/parkingZones/components/ParkingLotsModal';
import { ParkingPaymentScreen } from '../../features/parkingZones/components/ParkingPaymentScreen';
import { ParkingZonesScreen } from '../../features/parkingZones/components/ParkingZonesScreen';
import type { ParkingZoneId } from '../../features/parkingZones/types';
import type { ParkingLot } from '../../features/parkingZones/types/parkingLots';
import type { SavedTripPlannerRoute } from '../../services/savedTripRoutes';
import type { TripLocation } from '../../services/transit';
import type { RouteSelection } from '../../types/routes';
import type { TripRouteGeoJSON } from '../../features/tripPlanner/utils/routeGeoJson';
import { AppOverlayCard } from './AppOverlayCard';

type AppOverlaysProps = {
    activeTab: 'map' | 'schedules' | 'planner' | 'nearby';
    focusedParkingZoneFeatureId: string | null;
    onCloseNearby: () => void;
    onCloseParkingCars: () => void;
    onCloseParkingLots: () => void;
    onCloseParkingPayment: () => void;
    onCloseParkingZones: () => void;
    onClosePlanner: () => void;
    onCloseSchedules: () => void;
    onFocusStop: (stopId: string, latitude: number, longitude: number) => void;
    onOpenManageCars: () => void;
    onOpenPlannerWithCoordinates: (
        destinationLatitude: number,
        destinationLongitude: number,
        currentLatitude?: number | null,
        currentLongitude?: number | null,
    ) => void;
    onOpenRoute: (route: RouteSelection) => void;
    onShowParkingZoneOnMap: (zoneFeatureId: string) => void;
    onShowPlannerRoute: (route: TripRouteGeoJSON) => void;
    parkingCars: {
        cars: Parameters<typeof ParkingCarsScreen>[0]['cars'];
        loading: Parameters<typeof ParkingCarsScreen>[0]['loading'];
        addCar: Parameters<typeof ParkingCarsScreen>[0]['onAddCar'];
        removeCar: Parameters<typeof ParkingCarsScreen>[0]['onRemoveCar'];
        updateCar: Parameters<typeof ParkingCarsScreen>[0]['onUpdateCar'];
        setDefaultCar: Parameters<typeof ParkingCarsScreen>[0]['onSetDefaultCar'];
    };
    parkingDetectedZoneId: ParkingZoneId | null;
    parkingLots: ParkingLot[];
    parkingLotsVisible: boolean;
    parkingPaymentVisible: boolean;
    parkingZonesVisible: boolean;
    parkingCarsVisible: boolean;
    plannerInitialFrom: TripLocation | null;
    plannerInitialFromToken: number;
    plannerInitialTo: TripLocation | null;
    plannerSavedRoute: SavedTripPlannerRoute | null;
    plannerSavedRouteToken: number;
    plannerVisible: boolean;
};

export const AppOverlays = ({
    activeTab,
    focusedParkingZoneFeatureId,
    onCloseNearby,
    onCloseParkingCars,
    onCloseParkingLots,
    onCloseParkingPayment,
    onCloseParkingZones,
    onClosePlanner,
    onCloseSchedules,
    onFocusStop,
    onOpenManageCars,
    onOpenPlannerWithCoordinates,
    onOpenRoute,
    onShowParkingZoneOnMap,
    onShowPlannerRoute,
    parkingCars,
    parkingDetectedZoneId,
    parkingLots,
    parkingLotsVisible,
    parkingPaymentVisible,
    parkingZonesVisible,
    parkingCarsVisible,
    plannerInitialFrom,
    plannerInitialFromToken,
    plannerInitialTo,
    plannerSavedRoute,
    plannerSavedRouteToken,
    plannerVisible,
}: AppOverlaysProps) => (
    <>
        <AppOverlayCard visible={activeTab === 'schedules'} onClose={onCloseSchedules} cardSize="schedules">
            <SchedulesScreen
                onOpenRoute={onOpenRoute}
                onClose={onCloseSchedules}
                onFocusStop={onFocusStop}
            />
        </AppOverlayCard>

        <AppOverlayCard visible={plannerVisible} onClose={onClosePlanner} cardSize="planner" persistent>
            <TripPlannerScreen
                onClose={onClosePlanner}
                isActive={plannerVisible}
                initialFromLocation={plannerInitialFrom}
                initialToLocation={plannerInitialTo}
                initialFromToken={plannerInitialFromToken}
                initialSavedRoute={plannerSavedRoute}
                initialSavedRouteToken={plannerSavedRouteToken}
                onShowOnMap={onShowPlannerRoute}
            />
        </AppOverlayCard>

        <AppOverlayCard visible={activeTab === 'nearby'} onClose={onCloseNearby} cardSize="nearby">
            <NearbyScreen
                onClose={onCloseNearby}
                onFocusStop={onFocusStop}
                onBuildRoute={onOpenPlannerWithCoordinates}
            />
        </AppOverlayCard>

        <AppOverlayCard visible={parkingLotsVisible} onClose={onCloseParkingLots} cardSize="schedules">
            <ParkingLotsScreen
                parkingLots={parkingLots}
                onClose={onCloseParkingLots}
            />
        </AppOverlayCard>

        <AppOverlayCard visible={parkingZonesVisible} onClose={onCloseParkingZones} cardSize="schedules">
            <ParkingZonesScreen
                selectedZoneFeatureId={focusedParkingZoneFeatureId}
                onClose={onCloseParkingZones}
                onShowZoneOnMap={onShowParkingZoneOnMap}
            />
        </AppOverlayCard>

        <AppOverlayCard visible={parkingPaymentVisible} onClose={onCloseParkingPayment} cardSize="schedules">
            <ParkingPaymentScreen
                cars={parkingCars.cars}
                defaultZoneId={parkingDetectedZoneId}
                onClose={onCloseParkingPayment}
                onOpenManageCars={onOpenManageCars}
            />
        </AppOverlayCard>

        <AppOverlayCard visible={parkingCarsVisible} onClose={onCloseParkingCars} cardSize="schedules">
            <ParkingCarsScreen
                cars={parkingCars.cars}
                loading={parkingCars.loading}
                onAddCar={parkingCars.addCar}
                onRemoveCar={parkingCars.removeCar}
                onUpdateCar={parkingCars.updateCar}
                onSetDefaultCar={parkingCars.setDefaultCar}
                onClose={onCloseParkingCars}
            />
        </AppOverlayCard>
    </>
);
