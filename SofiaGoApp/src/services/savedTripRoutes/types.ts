import type { Itinerary, PlanType, TripLocation } from '../transit';
import type { TripRouteGeoJSON } from '../../features/tripPlanner/utils/routeGeoJson';

export type SavedTripPlannerRoute = {
    id: string;
    createdAtUnix: number;
    updatedAtUnix: number;
    from: TripLocation;
    to: TripLocation;
    planType: PlanType;
    routeDate: string;
    routeTime: string;
    arriveBy: boolean;
    itinerary: Itinerary;
    routeGeoJson: TripRouteGeoJSON;
    itinerarySummary: string;
    routeLabel: string;
    transportLabels: string[];
};

