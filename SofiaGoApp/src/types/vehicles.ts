import { VehicleType } from '../services/transitUtils';

export interface Vehicle {
    id: string;
    line: string;
    routeId: string;
    tripId: string;
    type: VehicleType;
    latitude: number;
    longitude: number;
    speedKph?: number;
    stopId?: string;
    currentStatus?: string;
    occupancyStatus?: string;
    lastUpdatedUnix?: number;
    headingDegrees?: number;
}

export interface StopEta {
    stopId: string;
    tripId: string;
    routeId: string;
    line: string;
    type: VehicleType;
    arrivalTimestamp: number;
    minutesAway: number;
    destination?: string;
}

export interface GlobalDeparture extends StopEta {
    stopSequence?: number;
}

export interface TripStopInfo {
    stopId: string;
    stopName: string;
    latitude: number;
    longitude: number;
    arrivalTimestamp?: number;
    departureTimestamp?: number;
    stopSequence?: number;
}

export interface StaticScheduleEntry {
    line: string;
    type: VehicleType;
    destination: string;
    times: number[];
    routeId: string;
}

export type DayType = 'w' | 'h';

export interface StopTime {
    time: string;
    realTime: boolean;
}

export interface LineScheduleDirection {
    directionName: string;
    firstStopId: string;
    firstStopName: string;
    times: number[];
}

export interface ScheduleBasedStop {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
}

export interface ScheduleBasedDirection {
    name: string;
    stops: ScheduleBasedStop[];
}
