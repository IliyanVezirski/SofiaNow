import bundledRouteTypes from '../../data/routeTypes.static.json';
import bundledRouteNames from '../../data/routeNames.static.json';

export type VehicleType = 'bus' | 'tram' | 'trolley' | 'subway';

export const VEHICLE_TYPE_ORDER: VehicleType[] = ['bus', 'tram', 'trolley', 'subway'];

const routeTypeByRouteId: Record<string, VehicleType> = bundledRouteTypes as Record<string, VehicleType>;

export const getGtfsRouteType = (routeId: string | undefined | null): VehicleType | undefined => {
    const normalized = (routeId || '').trim().toUpperCase();
    const primaryToken = normalized.split('-')[0];
    return routeTypeByRouteId[primaryToken] || routeTypeByRouteId[normalized];
};

let _displayNameToType: Map<string, VehicleType> | null = null;
const getDisplayNameToTypeMap = (): Map<string, VehicleType> => {
    if (_displayNameToType) return _displayNameToType;
    _displayNameToType = new Map();
    const names = bundledRouteNames as Record<string, string>;
    for (const [routeId, displayName] of Object.entries(names)) {
        const gtfsType = routeTypeByRouteId[routeId];
        if (gtfsType && displayName) {
            const key = displayName.toUpperCase().replace(/\s+/g, '');
            if (!_displayNameToType.has(key)) {
                _displayNameToType.set(key, gtfsType);
            }
        }
    }
    return _displayNameToType;
};

const SUBSTITUTE_SUFFIX_RE = /[TТ][MМБBbm]+$/i;

export const resolveDisplayLineType = (displayLine: string | undefined | null): VehicleType => {
    const normalized = String(displayLine || '').trim().toUpperCase().replace(/\s+/g, '');
    const fromMap = getDisplayNameToTypeMap().get(normalized);
    if (fromMap) return fromMap;

    // Display names like "6ТБ", "12TM", "1АТБ" are substitute bus services.
    // The suffix (ТМ/TM/ТБ/TB) indicates which line type they replace, not what they are.
    if (SUBSTITUTE_SUFFIX_RE.test(normalized)) {
        return 'bus';
    }

    return inferLineTypeFromToken(displayLine);
};

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

    if (normalized.startsWith('M') || normalized.startsWith('М')) {
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
    const gtfsType = getGtfsRouteType(routeId);

    if (normalizedPrimaryToken.startsWith('TM')) {
        const line = sanitizeLine(normalizedPrimaryToken.replace(/^TM/, ''));
        return { routeId: normalizedRouteId || 'Unknown', line: line || normalizedPrimaryToken, type: gtfsType || ('tram' as VehicleType) };
    }

    if (normalizedPrimaryToken.startsWith('TB')) {
        const line = sanitizeLine(normalizedPrimaryToken.replace(/^TB/, ''));
        return { routeId: normalizedRouteId || 'Unknown', line: line || normalizedPrimaryToken, type: gtfsType || ('trolley' as VehicleType) };
    }

    if (/^M\d+/i.test(normalizedPrimaryToken)) {
        const line = sanitizeLine(normalizedPrimaryToken.replace(/^M/, ''));
        return { routeId: normalizedRouteId || 'Unknown', line: line || normalizedPrimaryToken, type: gtfsType || ('subway' as VehicleType) };
    }

    if (/^N\d+/i.test(normalizedPrimaryToken)) {
        return { routeId: normalizedRouteId || 'Unknown', line: normalizedPrimaryToken, type: gtfsType || ('bus' as VehicleType) };
    }

    if (normalizedPrimaryToken.startsWith('A')) {
        const line = sanitizeLine(normalizedPrimaryToken.replace(/^A/, ''));
        return { routeId: normalizedRouteId || 'Unknown', line: line || normalizedPrimaryToken, type: gtfsType || ('bus' as VehicleType) };
    }

    return {
        routeId: normalizedRouteId || 'Unknown',
        line: normalizedPrimaryToken || normalizedRouteId || 'Unknown',
        type: gtfsType || ('bus' as VehicleType),
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

/** Returns an Ionicons outline icon name for the given vehicle type. */
export const getVehicleIconName = (type: VehicleType): string => {
    switch (type) {
        case 'tram':
            return 'train-outline';
        case 'trolley':
            return 'bus-outline';
        case 'subway':
            return 'subway-outline';
        default:
            return 'bus-outline';
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