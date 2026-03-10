export type VehicleType = 'bus' | 'tram' | 'trolley' | 'subway';

export const VEHICLE_TYPE_ORDER: VehicleType[] = ['bus', 'tram', 'trolley', 'subway'];

export const getVehicleTypeLabel = (type: VehicleType) => {
    switch (type) {
        case 'tram':
            return 'Трамвай';
        case 'trolley':
            return 'Тролей';
        case 'subway':
            return 'Метро';
        default:
            return 'Автобус';
    }
};

export const getRouteMetadata = (routeId: string | undefined | null) => {
    const normalizedRouteId = (routeId || '').trim();

    if (normalizedRouteId.startsWith('TM')) {
        return { routeId: normalizedRouteId, line: normalizedRouteId.replace('TM', ''), type: 'tram' as VehicleType };
    }

    if (normalizedRouteId.startsWith('TB')) {
        return { routeId: normalizedRouteId, line: normalizedRouteId.replace('TB', ''), type: 'trolley' as VehicleType };
    }

    if (normalizedRouteId.startsWith('M')) {
        return { routeId: normalizedRouteId, line: normalizedRouteId.replace(/^M/, ''), type: 'subway' as VehicleType };
    }

    if (normalizedRouteId.startsWith('A')) {
        return { routeId: normalizedRouteId, line: normalizedRouteId.replace('A', ''), type: 'bus' as VehicleType };
    }

    return { routeId: normalizedRouteId || 'Unknown', line: normalizedRouteId || 'Unknown', type: 'bus' as VehicleType };
};

export const getVehicleIcon = (type: VehicleType) => {
    switch (type) {
        case 'tram':
            return '🚊';
        case 'trolley':
            return '🚎';
        case 'subway':
            return '🚇';
        default:
            return '🚌';
    }
};

export const getVehicleAccentColor = (type: VehicleType) => {
    switch (type) {
        case 'tram':
            return '#F59E0B';
        case 'trolley':
            return '#10B981';
        case 'subway':
            return '#6366F1';
        default:
            return '#EF4444';
    }
};

export const formatUnixTime = (unixTimestamp?: number) => {
    if (!unixTimestamp) {
        return 'н/д';
    }

    return new Date(unixTimestamp * 1000).toLocaleTimeString('bg-BG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

export const calculateBearingDegrees = (
    previousLatitude: number,
    previousLongitude: number,
    currentLatitude: number,
    currentLongitude: number
) => {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const toDegrees = (radians: number) => (radians * 180) / Math.PI;

    const lat1 = toRadians(previousLatitude);
    const lat2 = toRadians(currentLatitude);
    const longitudeDiff = toRadians(currentLongitude - previousLongitude);

    const y = Math.sin(longitudeDiff) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(longitudeDiff);

    const heading = (toDegrees(Math.atan2(y, x)) + 360) % 360;
    return Number.isFinite(heading) ? heading : 0;
};

export const haversineDistanceMeters = (
    latitudeA: number,
    longitudeA: number,
    latitudeB: number,
    longitudeB: number
) => {
    const earthRadiusMeters = 6371000;
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

    const dLat = toRadians(latitudeB - latitudeA);
    const dLon = toRadians(longitudeB - longitudeA);
    const lat1 = toRadians(latitudeA);
    const lat2 = toRadians(latitudeB);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusMeters * c;
};