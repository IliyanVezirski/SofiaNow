import type { ParkingZoneId } from '../types';

export interface ParkingZonePolicy {
    zoneId: ParkingZoneId;
    activePeriodLabel: string;
    activeDaysLabel: string;
    activeHoursLabel: string;
    maxStayLabel: string;
    paymentLabel: string;
    sourceLabel: string;
    sourceUrl: string;
    disclaimer: string;
}

export const PARKING_ZONE_POLICIES: Record<ParkingZoneId, ParkingZonePolicy> = {
    blue: {
        zoneId: 'blue',
        activePeriodLabel: 'Целогодишно',
        activeDaysLabel: 'Понеделник - събота',
        activeHoursLabel: '08:30 - 19:30',
        maxStayLabel: 'До 2 часа',
        paymentLabel: 'SMS към 1302',
        sourceLabel: 'ЦГМ / SofiaTraffic - Синя зона',
        sourceUrl: 'https://www.sofiatraffic.bg/bg/parking',
        disclaimer: 'Провери пътната сигнализация на място при временни промени.',
    },
    green: {
        zoneId: 'green',
        activePeriodLabel: 'Целогодишно',
        activeDaysLabel: 'Понеделник - петък',
        activeHoursLabel: '08:30 - 19:30',
        maxStayLabel: 'До 4 часа',
        paymentLabel: 'SMS към 1303',
        sourceLabel: 'ЦГМ / SofiaTraffic - Зелена зона',
        sourceUrl: 'https://www.sofiatraffic.bg/bg/parking',
        disclaimer: 'Провери пътната сигнализация на място при временни промени.',
    },
};

export const getParkingZonePolicy = (zoneId: ParkingZoneId) => PARKING_ZONE_POLICIES[zoneId];
