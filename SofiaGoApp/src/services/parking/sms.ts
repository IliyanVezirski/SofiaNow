import { Linking, Platform } from 'react-native';

export type ParkingSmsZoneId = 'blue' | 'green';

export interface ParkingSmsOption {
    id: ParkingSmsZoneId;
    label: string;
    shortCode: string;
    hourlyPriceLabel: string;
    accentColor: string;
    description: string;
}

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

const normalizeParkingSmsBody = (plate: string) => String(plate || '').trim();

export const buildParkingSmsUrl = (zoneId: ParkingSmsZoneId, plate: string) => {
    const option = getParkingSmsOption(zoneId);
    const separator = Platform.OS === 'ios' ? '&' : '?';
    return `sms:${option.shortCode}${separator}body=${encodeURIComponent(normalizeParkingSmsBody(plate))}`;
};

export const openParkingSms = async (zoneId: ParkingSmsZoneId, plate: string) => {
    await Linking.openURL(buildParkingSmsUrl(zoneId, plate));
};
