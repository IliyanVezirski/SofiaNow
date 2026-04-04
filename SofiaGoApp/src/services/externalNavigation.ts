import { Linking, Platform } from 'react-native';

export type ExternalNavigationMode = 'driving' | 'walking';

const buildGoogleMapsWebUrl = (
    latitude: number,
    longitude: number,
    mode: ExternalNavigationMode,
) => `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=${mode}`;

const buildAppleMapsUrl = (
    latitude: number,
    longitude: number,
    mode: ExternalNavigationMode,
) => `http://maps.apple.com/?daddr=${latitude},${longitude}&dirflg=${mode === 'walking' ? 'w' : 'd'}`;

const buildAndroidSystemNavigationUrl = (
    latitude: number,
    longitude: number,
) => `geo:0,0?q=${latitude},${longitude}`;

const buildSystemNavigationUrl = (
    latitude: number,
    longitude: number,
    mode: ExternalNavigationMode,
) => {
    if (Platform.OS === 'android') {
        return buildAndroidSystemNavigationUrl(latitude, longitude);
    }

    if (Platform.OS === 'ios') {
        return buildAppleMapsUrl(latitude, longitude, mode);
    }

    return buildGoogleMapsWebUrl(latitude, longitude, mode);
};

const openUrlWithFallback = async (primaryUrl: string, fallbackUrl: string): Promise<boolean> => {
    try {
        const supported = await Linking.canOpenURL(primaryUrl);
        if (supported) {
            await Linking.openURL(primaryUrl);
            return true;
        }
    } catch {
        // Fall through to fallback.
    }

    try {
        await Linking.openURL(fallbackUrl);
        return true;
    } catch {
        return false;
    }
};

export const openExternalNavigation = async (
    latitude: number,
    longitude: number,
    mode: ExternalNavigationMode = 'driving',
): Promise<boolean> => {
    const systemUrl = buildSystemNavigationUrl(latitude, longitude, mode);
    const fallbackUrl = buildGoogleMapsWebUrl(latitude, longitude, mode);

    return openUrlWithFallback(systemUrl, fallbackUrl);
};

export const openExternalDrivingNavigation = async (latitude: number, longitude: number): Promise<boolean> => (
    openExternalNavigation(latitude, longitude, 'driving')
);

export const openExternalWalkingNavigation = async (latitude: number, longitude: number): Promise<boolean> => (
    openExternalNavigation(latitude, longitude, 'walking')
);
