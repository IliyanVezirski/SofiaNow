import type { ParkingZoneId } from '../types';

export interface ParkingZonePolicy {
    zoneId: ParkingZoneId;
    activePeriodLabel: string;
    activeDaysLabel: string;
    activeHoursLabel: string;
    activeSummaryLabel: string;
    priceLabel: string;
    smsNumber: string;
    maxStayLabel: string;
    paymentLabel: string;
    paymentMethodsLabel: string;
    vehicleLimitLabel: string;
    sourceLabel: string;
    sourceUrl: string;
    disclaimer: string;
}

export const PARKING_ZONE_POLICIES: Record<ParkingZoneId, ParkingZonePolicy> = {
    blue: {
        zoneId: 'blue',
        activePeriodLabel: 'Целогодишно',
        activeDaysLabel: 'Понеделник - събота',
        activeHoursLabel: '08:30 - 20:00',
        activeSummaryLabel: 'Понеделник - събота · 08:30 - 20:00',
        priceLabel: '1,02 EUR/час',
        smsNumber: '1302',
        maxStayLabel: 'До 2 часа',
        paymentLabel: 'SMS 1302',
        paymentMethodsLabel: 'SMS, Viber чатбот, Urbo, талон, служебен абонамент',
        vehicleLimitLabel: 'За ППС до 2,5 т и микробуси/автобуси до 12 места',
        sourceLabel: 'Столична община - Транспорт - Паркиране',
        sourceUrl: 'https://www.sofia.bg/w/parkira-1',
        disclaimer: 'Режимът важи само на обозначените места и се определя окончателно от пътните знаци на място.',
    },
    green: {
        zoneId: 'green',
        activePeriodLabel: 'Целогодишно',
        activeDaysLabel: 'Понеделник - петък; събота',
        activeHoursLabel: 'Пн - Пт 08:30 - 19:30; Сб 10:00 - 18:00',
        activeSummaryLabel: 'Пн - Пт 08:30 - 19:30 · Сб 10:00 - 18:00',
        priceLabel: '0,51 EUR/час',
        smsNumber: '1303',
        maxStayLabel: 'До 4 часа',
        paymentLabel: 'SMS 1303',
        paymentMethodsLabel: 'SMS, Viber чатбот, Urbo, талон, служебен абонамент',
        vehicleLimitLabel: 'За ППС до 2,5 т и микробуси/автобуси до 12 места',
        sourceLabel: 'Столична община - Транспорт - Паркиране',
        sourceUrl: 'https://www.sofia.bg/w/parkira-1',
        disclaimer: 'Режимът важи само на обозначените места и се определя окончателно от пътните знаци на място.',
    },
};

export const getParkingZonePolicy = (zoneId: ParkingZoneId) => PARKING_ZONE_POLICIES[zoneId];
