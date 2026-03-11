import { VehicleType } from '../services/transitUtils';

export interface RouteSelection {
    line: string;
    type: VehicleType;
    isNight: boolean;
    routeId?: string;
}
