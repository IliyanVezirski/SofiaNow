import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';

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
    cancelScheduledParkingSms?: (id: string) => Promise<void>;
    consumeCompletedScheduledParkingSmsIds?: () => Promise<string[]>;
    addListener: (eventName: string) => void;
    removeListeners: (count: number) => void;
    canScheduleExactAlarms?: () => Promise<boolean>;
    openExactAlarmSettings?: () => Promise<void>;
};

const parkingSmsAutomationModule = (NativeModules.ParkingSmsAutomation as ParkingSmsAutomationModule | undefined);
const parkingSmsAutomationEventEmitter = Platform.OS === 'android' && parkingSmsAutomationModule
    ? new NativeEventEmitter(parkingSmsAutomationModule)
    : null;
const PARKING_SMS_SCHEDULES_STORAGE_KEY = '@sofiago:parking:sms:schedules:v1';

export interface ScheduledParkingSmsEntry {
    id: string;
    zoneId: ParkingSmsZoneId;
    plate: string;
    displayPlate: string;
    carId: string | null;
    carLabel: string;
    triggerAtMillis: number;
    createdAt: number;
    exactAlarmGranted: boolean;
}

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

const sortScheduledParkingSmsEntries = (entries: ScheduledParkingSmsEntry[]) => [...entries].sort((left, right) => {
    if (left.triggerAtMillis !== right.triggerAtMillis) {
        return left.triggerAtMillis - right.triggerAtMillis;
    }

    return right.createdAt - left.createdAt;
});

const normalizeStoredScheduledParkingSmsEntry = (value: unknown): ScheduledParkingSmsEntry | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const entry = value as Record<string, unknown>;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const zoneId = entry.zoneId === 'green' ? 'green' : entry.zoneId === 'blue' ? 'blue' : null;
    const plate = normalizeParkingSmsBody(typeof entry.plate === 'string' ? entry.plate : '');
    const displayPlate = typeof entry.displayPlate === 'string' && entry.displayPlate.trim()
        ? entry.displayPlate.trim()
        : plate;
    const triggerAtMillis = typeof entry.triggerAtMillis === 'number' && Number.isFinite(entry.triggerAtMillis)
        ? entry.triggerAtMillis
        : NaN;
    const createdAt = typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
        ? entry.createdAt
        : Date.now();

    if (!id || !zoneId || !plate || !Number.isFinite(triggerAtMillis)) {
        return null;
    }

    return {
        id,
        zoneId,
        plate,
        displayPlate,
        carId: typeof entry.carId === 'string' && entry.carId.trim() ? entry.carId.trim() : null,
        carLabel: typeof entry.carLabel === 'string' && entry.carLabel.trim() ? entry.carLabel.trim() : displayPlate,
        triggerAtMillis,
        createdAt,
        exactAlarmGranted: entry.exactAlarmGranted !== false,
    };
};

const scheduledParkingSmsListeners = new Set<() => void>();
let parkingSmsCompletionSubscription: { remove: () => void } | null = null;

export const subscribeToScheduledParkingSmsChanges = (listener: () => void) => {
    scheduledParkingSmsListeners.add(listener);
    return () => { scheduledParkingSmsListeners.delete(listener); };
};

const extractScheduledParkingSmsId = (value: unknown) => {
    if (!value || typeof value !== 'object') {
        return '';
    }

    const scheduleId = (value as { id?: unknown }).id;
    return typeof scheduleId === 'string' ? scheduleId.trim() : '';
};

const normalizeScheduledParkingSmsIds = (value: unknown) => {
    if (!Array.isArray(value)) {
        return [] as string[];
    }

    return value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item): item is string => item.length > 0);
};

const consumeCompletedScheduledParkingSmsIds = async () => {
    if (Platform.OS !== 'android' || !parkingSmsAutomationModule?.consumeCompletedScheduledParkingSmsIds) {
        return [] as string[];
    }

    try {
        const completedIds = await parkingSmsAutomationModule.consumeCompletedScheduledParkingSmsIds();
        return normalizeScheduledParkingSmsIds(completedIds);
    } catch (error) {
        console.warn('Failed to consume completed parking SMS ids:', error);
        return [] as string[];
    }
};

const reconcileCompletedScheduledParkingSmsEntries = async (entries: ScheduledParkingSmsEntry[]) => {
    const completedIds = await consumeCompletedScheduledParkingSmsIds();
    if (!completedIds.length) {
        return entries;
    }

    const completedIdSet = new Set(completedIds);
    const nextEntries = entries.filter((entry) => !completedIdSet.has(entry.id));
    if (nextEntries.length === entries.length) {
        return entries;
    }

    return persistScheduledParkingSmsEntries(nextEntries);
};

const ensureParkingSmsCompletionSubscription = () => {
    if (parkingSmsCompletionSubscription || !parkingSmsAutomationEventEmitter) {
        return;
    }

    parkingSmsCompletionSubscription = parkingSmsAutomationEventEmitter.addListener('parkingSmsScheduledSent', (payload: unknown) => {
        const scheduleId = extractScheduledParkingSmsId(payload);
        if (!scheduleId) {
            return;
        }

        void removeScheduledParkingSmsEntry(scheduleId).catch((error) => {
            console.warn('Failed to remove completed scheduled parking SMS entry:', error);
        });
    });
};

ensureParkingSmsCompletionSubscription();

const persistScheduledParkingSmsEntries = async (entries: ScheduledParkingSmsEntry[]) => {
    const futureEntries = sortScheduledParkingSmsEntries(entries.filter((entry) => entry.triggerAtMillis > Date.now()));

    if (!futureEntries.length) {
        await AsyncStorage.removeItem(PARKING_SMS_SCHEDULES_STORAGE_KEY);
        scheduledParkingSmsListeners.forEach((fn) => fn());
        return [] as ScheduledParkingSmsEntry[];
    }

    await AsyncStorage.setItem(PARKING_SMS_SCHEDULES_STORAGE_KEY, JSON.stringify(futureEntries));
    scheduledParkingSmsListeners.forEach((fn) => fn());
    return futureEntries;
};

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

const ensureExactAlarmPermission = async () => {
    if (Platform.OS !== 'android') {
        return true;
    }

    if (!parkingSmsAutomationModule?.canScheduleExactAlarms) {
        return true;
    }

    try {
        return await parkingSmsAutomationModule.canScheduleExactAlarms();
    } catch (error) {
        console.warn('Failed to check exact alarm permission:', error);
        return false;
    }
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

export const cancelScheduledParkingSms = async (id: string) => {
    const automationModule = ensureParkingSmsAutomationAvailable();

    if (!automationModule.cancelScheduledParkingSms) {
        throw new Error('Тази версия на приложението не поддържа отказ на планиран SMS. Инсталирай нов Android билд на Sofia Go.');
    }

    await automationModule.cancelScheduledParkingSms(String(id || '').trim());
};

export const scheduleParkingSmsAutomatically = async (zoneId: ParkingSmsZoneId, plate: string, triggerAtMillis: number) => {
    const automationModule = ensureParkingSmsAutomationAvailable();

    const granted = await ensureParkingSmsPermission();
    if (!granted) {
        throw new Error('Няма разрешение за автоматично изпращане на SMS.');
    }

    const exactAlarmGranted = await ensureExactAlarmPermission();
    if (!exactAlarmGranted) {
        throw new Error('Няма разрешение за точни аларми. Разреши ги от настройките, за да планираш SMS.');
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

export const loadScheduledParkingSmsEntries = async () => {
    try {
        const raw = await AsyncStorage.getItem(PARKING_SMS_SCHEDULES_STORAGE_KEY);
        if (!raw) {
            return reconcileCompletedScheduledParkingSmsEntries([]);
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            await AsyncStorage.removeItem(PARKING_SMS_SCHEDULES_STORAGE_KEY);
            return [] as ScheduledParkingSmsEntry[];
        }

        const normalizedEntries = parsed
            .map(normalizeStoredScheduledParkingSmsEntry)
            .filter((entry): entry is ScheduledParkingSmsEntry => !!entry);

        const nextEntries = sortScheduledParkingSmsEntries(normalizedEntries.filter((entry) => entry.triggerAtMillis > Date.now()));
        const persistedEntries = nextEntries.length !== normalizedEntries.length
            ? await persistScheduledParkingSmsEntries(nextEntries)
            : nextEntries;

        return reconcileCompletedScheduledParkingSmsEntries(persistedEntries);
    } catch (error) {
        console.warn('Failed to load scheduled parking SMS entries:', error);
        return [] as ScheduledParkingSmsEntry[];
    }
};

export const saveScheduledParkingSmsEntry = async (entry: ScheduledParkingSmsEntry) => {
    const currentEntries = await loadScheduledParkingSmsEntries();
    return persistScheduledParkingSmsEntries([
        entry,
        ...currentEntries.filter((currentEntry) => currentEntry.id !== entry.id),
    ]);
};

export const removeScheduledParkingSmsEntry = async (id: string) => {
    const currentEntries = await loadScheduledParkingSmsEntries();
    return persistScheduledParkingSmsEntries(currentEntries.filter((entry) => entry.id !== id));
};