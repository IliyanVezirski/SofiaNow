import { Linking, NativeModules, PermissionsAndroid, Platform } from 'react-native';

export type ParkingSmsZoneId = 'blue' | 'green';

export interface ParkingSmsOption {
    id: ParkingSmsZoneId;
    label: string;
    shortCode: string;
    hourlyPriceLabel: string;
    accentColor: string;
    description: string;
}

type ParkingSmsAutomationModule = {
    sendParkingSms: (destination: string, body: string) => Promise<void>;
    scheduleParkingSms: (destination: string, body: string, triggerAtMillis: number) => Promise<{ id?: string; exactAlarmGranted?: boolean }>;
    canScheduleExactAlarms?: () => Promise<boolean>;
    openExactAlarmSettings?: () => Promise<void>;
};

const parkingSmsAutomationModule = (NativeModules.ParkingSmsAutomation as ParkingSmsAutomationModule | undefined);

const ensureParkingSmsAutomationAvailable = () => {
    if (Platform.OS !== 'android') {
        throw new Error('Автоматичното изпращане на паркинг SMS работи само на Android.');
    }

    if (!parkingSmsAutomationModule) {
        throw new Error('Тази инсталация няма native SMS модул. Инсталирай нов Android билд на Sofia Go.');
    }

    return parkingSmsAutomationModule;
};

export const PARKING_SMS_OPTIONS: ParkingSmsOption[] = [
    {
        id: 'blue',
        label: 'Синя зона',
        shortCode: '1302',
        hourlyPriceLabel: '1,02 EUR/час',
        accentColor: '#2563EB',
        description: 'SMS към 1302 с номера на автомобила.',
    },
    {
        id: 'green',
        label: 'Зелена зона',
        shortCode: '1303',
        hourlyPriceLabel: '0,51 EUR/час',
        accentColor: '#16A34A',
        description: 'SMS към 1303 с номера на автомобила.',
    },
];

export const getParkingSmsOption = (zoneId: ParkingSmsZoneId) => PARKING_SMS_OPTIONS.find((option) => option.id === zoneId) || PARKING_SMS_OPTIONS[0];

const normalizeParkingSmsBody = (plate: string) => String(plate || '').trim().toUpperCase();

const ensureParkingSmsPermission = async () => {
    if (Platform.OS !== 'android') {
        return false;
    }

    const permission = PermissionsAndroid.PERMISSIONS.SEND_SMS;
    const alreadyGranted = await PermissionsAndroid.check(permission);
    if (alreadyGranted) {
        return true;
    }

    const result = await PermissionsAndroid.request(permission, {
        title: 'Разрешение за SMS',
        message: 'Sofia Go има нужда от достъп до SMS, за да може да изпраща и отлага паркинг SMS-и автоматично.',
        buttonPositive: 'Разреши',
        buttonNegative: 'Отказ',
    });

    return result === PermissionsAndroid.RESULTS.GRANTED;
};

export const supportsAutomaticParkingSms = Platform.OS === 'android' && !!parkingSmsAutomationModule;

export const buildParkingSmsUrl = (zoneId: ParkingSmsZoneId, plate: string) => {
    const option = getParkingSmsOption(zoneId);
    const separator = Platform.OS === 'ios' ? '&' : '?';
    return `sms:${option.shortCode}${separator}body=${encodeURIComponent(normalizeParkingSmsBody(plate))}`;
};

export const openParkingSms = async (zoneId: ParkingSmsZoneId, plate: string) => {
    await Linking.openURL(buildParkingSmsUrl(zoneId, plate));
};

export const sendParkingSmsAutomatically = async (zoneId: ParkingSmsZoneId, plate: string) => {
    const automationModule = ensureParkingSmsAutomationAvailable();

    const granted = await ensureParkingSmsPermission();
    if (!granted) {
        throw new Error('Няма разрешение за автоматично изпращане на SMS.');
    }

    const option = getParkingSmsOption(zoneId);
    await automationModule.sendParkingSms(option.shortCode, normalizeParkingSmsBody(plate));
};

export const scheduleParkingSmsAutomatically = async (zoneId: ParkingSmsZoneId, plate: string, triggerAtMillis: number) => {
    const automationModule = ensureParkingSmsAutomationAvailable();

    const granted = await ensureParkingSmsPermission();
    if (!granted) {
        throw new Error('Няма разрешение за автоматично изпращане на SMS.');
    }

    const option = getParkingSmsOption(zoneId);
    const result = await automationModule.scheduleParkingSms(option.shortCode, normalizeParkingSmsBody(plate), triggerAtMillis);

    return {
        id: String(result?.id || ''),
        exactAlarmGranted: result?.exactAlarmGranted !== false,
    };
};

export const openParkingSmsExactAlarmSettings = async () => {
    if (Platform.OS !== 'android' || !parkingSmsAutomationModule?.openExactAlarmSettings) {
        return;
    }

    await parkingSmsAutomationModule.openExactAlarmSettings();
};