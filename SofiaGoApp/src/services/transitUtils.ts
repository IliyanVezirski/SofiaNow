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

export const inferLineTypeFromToken = (lineToken: string | undefined | null): VehicleType => {
    const normalized = String(lineToken || '').trim().toUpperCase();

    if (normalized.includes('ТБ') || normalized.includes('TB')) {
        return 'trolley';
    }

    if (normalized.includes('ТМ') || normalized.includes('TM')) {
        return 'tram';
    }

    if (normalized.startsWith('M')) {
        return 'subway';
    }

    return 'bus';
};

export const getRouteMetadata = (routeId: string | undefined | null) => {
    const normalizedRouteId = (routeId || '').trim().toUpperCase();
    const primaryToken = normalizedRouteId.split('-')[0];

    const sanitizeLine = (value: string) => {
        const cleaned = (value || '').trim().toUpperCase().replace(/\s+/g, '');
        if (!cleaned) {
            return '';
        }

        return cleaned.replace(/[^0-9A-ZА-Я]/g, '');
    };

    const normalizedPrimaryToken = sanitizeLine(primaryToken);

    if (normalizedPrimaryToken.startsWith('TM')) {
        const line = sanitizeLine(normalizedPrimaryToken.replace(/^TM/, ''));
        return { routeId: normalizedRouteId || 'Unknown', line: line || normalizedPrimaryToken, type: 'tram' as VehicleType };
    }

    if (normalizedPrimaryToken.startsWith('TB')) {
        const line = sanitizeLine(normalizedPrimaryToken.replace(/^TB/, ''));
        return { routeId: normalizedRouteId || 'Unknown', line: line || normalizedPrimaryToken, type: 'trolley' as VehicleType };
    }

    if (/^M\d+/i.test(normalizedPrimaryToken)) {
        const line = sanitizeLine(normalizedPrimaryToken.replace(/^M/, ''));
        return { routeId: normalizedRouteId || 'Unknown', line: line || normalizedPrimaryToken, type: 'subway' as VehicleType };
    }

    if (/^N\d+/i.test(normalizedPrimaryToken)) {
        return { routeId: normalizedRouteId || 'Unknown', line: normalizedPrimaryToken, type: 'bus' as VehicleType };
    }

    if (normalizedPrimaryToken.startsWith('A')) {
        const line = sanitizeLine(normalizedPrimaryToken.replace(/^A/, ''));
        return { routeId: normalizedRouteId || 'Unknown', line: line || normalizedPrimaryToken, type: 'bus' as VehicleType };
    }

    return {
        routeId: normalizedRouteId || 'Unknown',
        line: normalizedPrimaryToken || normalizedRouteId || 'Unknown',
        type: 'bus' as VehicleType,
    };
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
            return '#F97316';
        case 'trolley':
            return '#2563EB';
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