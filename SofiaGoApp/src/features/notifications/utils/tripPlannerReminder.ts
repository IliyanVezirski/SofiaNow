import { StopEta } from '../../../types/vehicles';
import { VehicleType } from '../../../services/transitUtils';
import { ItineraryLeg } from '../../../services/tripPlanner';

const mapTripLegModeToVehicleType = (mode: string): VehicleType => {
    switch (mode) {
        case 'TRAM':
            return 'tram';
        case 'TROLLEYBUS':
            return 'trolley';
        case 'SUBWAY':
            return 'subway';
        default:
            return 'bus';
    }
};

export const createStopEtaFromTripPlannerLeg = (leg: ItineraryLeg): StopEta | null => {
    if (leg.mode === 'WALK' || !leg.route?.shortName) {
        return null;
    }

    const arrivalTimestamp = Math.floor(leg.from.departureTime / 1000);
    const nowUnix = Math.floor(Date.now() / 1000);

    return {
        stopId: leg.from.stop?.code || `tripplanner:${leg.from.name}:${arrivalTimestamp}`,
        tripId: `tripplanner:${leg.route.shortName}:${arrivalTimestamp}:${leg.to.name}`,
        routeId: leg.route.shortName,
        line: leg.route.shortName,
        type: mapTripLegModeToVehicleType(leg.mode),
        arrivalTimestamp,
        minutesAway: Math.max(0, Math.round((arrivalTimestamp - nowUnix) / 60)),
        destination: leg.to.name,
    };
};