import { Linking, Platform } from 'react-native';

const buildGoogleMapsDrivingWebUrl = (latitude: number, longitude: number) =>
    `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;

export const openExternalDrivingNavigation = async (latitude: number, longitude: number): Promise<boolean> => {
    const appUrl = Platform.select({
        ios: `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`,
        android: `google.navigation:q=${latitude},${longitude}&mode=d`,
        default: null,
    });

    if (appUrl) {
        try {
            const supported = await Linking.canOpenURL(appUrl);
            if (supported) {
                await Linking.openURL(appUrl);
                return true;
            }
        } catch {
            // Fall back to the Google Maps web URL below.
        }
    }

    try {
        await Linking.openURL(buildGoogleMapsDrivingWebUrl(latitude, longitude));
        return true;
    } catch {
        return false;
    }
};