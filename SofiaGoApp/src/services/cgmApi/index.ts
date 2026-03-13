export { getTripUpdateEntities, getVehiclePositionEntities } from './gtfsFeed';
export { resolveLineByRouteShortName, stopCoordinatesById, stopNameById, getStaticDestination, routeShortNameByRouteId } from './routeResolver';
export { getUpcomingStopTargetsByTripId, pickNextStopTarget, resolveVehicleHeading } from './headingResolver';
export type { TripStopTarget } from './headingResolver';
export { fetchVehiclesNearby, fetchVehiclesInBounds } from './vehiclePositions';
export { fetchStopEtas, fetchFullStopSchedule } from './stopEtas';
export { getDayTypeForDate, getScheduleBasedDirections, resolveScheduleRouteId, getStaticStopSchedule, getStaticLineSchedule, getEtaScheduleInfo } from './schedules';
export { fetchTripDelay } from './delays';
export { fetchTripStops } from './tripStops';
export { fetchGlobalDepartures } from './globalDepartures';

export type { Vehicle } from '../../types/vehicles';
export type { StopEta, GlobalDeparture, TripStopInfo, StaticScheduleEntry, DayType, StopTime, LineScheduleDirection, ScheduleBasedStop, ScheduleBasedDirection } from '../../types/vehicles';
export type { MapBounds } from '../../types/map';
