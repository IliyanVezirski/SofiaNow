import { Alert, Platform } from 'react-native';

// Lazy-load react-native-iap — require() is called only when a billing
// function is actually invoked, so the native module is never touched at
// bundle-evaluation time (safe in Expo Go / before native rebuild).
let _iap: any = undefined; // undefined = not yet attempted
function getIAP(): any {
    if (_iap === undefined) {
        try {
            _iap = require('react-native-iap');
        } catch {
            _iap = null;
        }
    }
    return _iap;
}

// ── Product identifiers ─────────────────────────────────────────────
// Create these in Google Play Console → Monetize → Products / Subscriptions

export const SUBSCRIPTION_IDS = [
    'monthly_399',  // 3.99 eur/месец
    'monthly_799',  // 7.99 eur/месец
] as const;

export const ONE_TIME_IDS = [
    'support_once_599',     // 5.99 eur еднократно
    'support_once_1099',    // 10.99 eur еднократно
] as const;

export type SubscriptionId = typeof SUBSCRIPTION_IDS[number];
export type OneTimeId = typeof ONE_TIME_IDS[number];

// ── State ────────────────────────────────────────────────────────────

let connected = false;
let purchaseUpdateSub: { remove(): void } | null = null;
let purchaseErrorSub: { remove(): void } | null = null;

// ── Setup / teardown ─────────────────────────────────────────────────

export const setupBilling = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
        return false;
    }

    try {
        const iap = getIAP();
        if (!iap) return false;

        await iap.initConnection();
        connected = true;

        purchaseUpdateSub = iap.purchaseUpdatedListener(async (purchase: any) => {
            try {
                await iap.finishTransaction({ purchase, isConsumable: true });
            } catch {
                // finish silently – the store will retry
            }
        });

        purchaseErrorSub = iap.purchaseErrorListener((error: any) => {
            if (error.code !== iap.ErrorCode.UserCancelled) {
                Alert.alert('Грешка при плащане', error.message ?? 'Неуспешна транзакция.');
            }
        });

        return true;
    } catch {
        connected = false;
        return false;
    }
};

export const teardownBilling = () => {
    purchaseUpdateSub?.remove();
    purchaseErrorSub?.remove();
    purchaseUpdateSub = null;
    purchaseErrorSub = null;
    if (connected) {
        getIAP()?.endConnection();
        connected = false;
    }
};

// ── Fetch available products ─────────────────────────────────────────

export const fetchOneTimeProducts = async () => {
    if (!connected) return [];
    try {
        const iap = getIAP();
        if (!iap) return [];
        return await iap.fetchProducts({ skus: [...ONE_TIME_IDS], type: 'in-app' });
    } catch {
        return [];
    }
};

export const fetchSubscriptionProducts = async () => {
    if (!connected) return [];
    try {
        const iap = getIAP();
        if (!iap) return [];
        return await iap.fetchProducts({ skus: [...SUBSCRIPTION_IDS], type: 'subs' });
    } catch {
        return [];
    }
};

// ── Purchase ─────────────────────────────────────────────────────────

export const buyOneTime = async (productId: OneTimeId): Promise<boolean> => {
    try {
        const iap = getIAP();
        if (!iap) return false;
        await iap.requestPurchase({
            type: 'in-app',
            request: { google: { skus: [productId] } },
        });
        return true;
    } catch {
        return false;
    }
};

export const buySubscription = async (subscriptionId: SubscriptionId, offerToken?: string): Promise<boolean> => {
    try {
        const iap = getIAP();
        if (!iap) return false;

        const subscriptionOffers = offerToken
            ? [{ sku: subscriptionId, offerToken }]
            : undefined;

        await iap.requestPurchase({
            type: 'subs',
            request: {
                google: {
                    skus: [subscriptionId],
                    ...(subscriptionOffers ? { subscriptionOffers } : {}),
                },
            },
        });
        return true;
    } catch {
        return false;
    }
};
