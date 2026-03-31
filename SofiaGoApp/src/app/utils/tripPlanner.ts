import type { TripLocation } from '../../services/transit';

export const hasFiniteCoordinates = (latitude: number | null | undefined, longitude: number | null | undefined) => (
    Number.isFinite(latitude) && Number.isFinite(longitude)
);

export const createTripLocation = (latitude: number, longitude: number, name: string): TripLocation => ({
    latitude,
    longitude,
    name,
});

export const formatCoordinateLocationName = (latitude: number, longitude: number) => (
    `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
);
