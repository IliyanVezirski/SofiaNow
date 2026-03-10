import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

const API_KEY_APPLE = 'apple_placeholder_key';
const API_KEY_GOOGLE = 'google_placeholder_key';

export const setupRevenueCat = async () => {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);

    if (Platform.OS === 'ios') {
        Purchases.configure({ apiKey: API_KEY_APPLE });
    } else if (Platform.OS === 'android') {
        Purchases.configure({ apiKey: API_KEY_GOOGLE });
    }
};

export const checkPremiumStatus = async (): Promise<boolean> => {
    try {
        const customerInfo = await Purchases.getCustomerInfo();
        // Assuming "Premium" is the entitlement identifier in RevenueCat
        return typeof customerInfo.entitlements.active['Premium'] !== 'undefined';
    } catch (e) {
        console.error('Error fetching customer info', e);
        return false;
    }
};

export const purchasePremium = async (): Promise<boolean> => {
    try {
        const offerings = await Purchases.getOfferings();
        if (offerings.current !== null && offerings.current.availablePackages.length !== 0) {
            const { customerInfo } = await Purchases.purchasePackage(offerings.current.availablePackages[0]);
            return typeof customerInfo.entitlements.active['Premium'] !== 'undefined';
        }
    } catch (e) {
        console.error('Error making purchase', e);
    }
    return false;
};
