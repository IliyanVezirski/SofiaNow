import {
    ParkingZoneFeatureCollection,
    ParkingZoneId,
    ParkingZoneRule,
    ParkingZoneSourceFeature,
} from '../types';
import generatedParkingZones from './parkingZones.generated.json';

export const PARKING_ZONE_RULES: Record<ParkingZoneId, ParkingZoneRule> = {
    blue: {
        id: 'blue',
        label: 'Синя зона',
        lineColor: '#0B46FF',
        fillColor: 'rgba(11,70,255,0.26)',
    },
    green: {
        id: 'green',
        label: 'Зелена зона',
        lineColor: '#00A63A',
        fillColor: 'rgba(0,166,58,0.26)',
    },
};

export const PARKING_ZONE_DATA_GUIDANCE = 'Изпълни npm run generate:parking-zones -- --source=merge след като одобриш източника на данни.';

const RAW_ZONE_FEATURES = generatedParkingZones as ParkingZoneSourceFeature[];

const ZONE_NAME_OVERRIDES: Partial<Record<string, string>> = {
    'podzona-1': 'Център · Позитано',
    'podzona-2': 'Център · Узунджовска',
    'podzona-3': 'Център · Неофит Рилски',
    'podzona-4': 'Център · Кузман Шапкарев',
    'podzona-5': 'Център · Московска',
    'podzona-6': 'Център · бул. Стефан Стамболов',
    'podzona-7': 'Център · Отец Паисий',
    'podzona-9': 'Център · Лайош Кошут',
    'podzona-10': 'Център · Цар Асен',
    'podzona-12': 'Център · Велико Търново',
    'podzona-13': 'Център · Княз Александър Невски',
    'podzona-14': 'Център · бул. Ген. Данаил Николаев',
    'podzona-15': 'Център · 11-ти Август',
    'podzona-16': 'Център · Веслец',
    'podzona-17': 'Център · Будапеща',
    'podzona-18': 'Център · Клокотница',
    'podzona-19': 'Банишора · Струга',
    'podzona-20': 'Иван Вазов · Юг',
    'podzona-21': 'Лозенец · Югозапад',
    'podzona-22': 'Лозенец · Св. Теодосий Търновски',
    'podzona-23': 'Лозенец · Розова долина',
    'podzona-24': 'Лозенец · бул. Христо Смирненски',
    'podzona-25': 'Център · Светослав Тертер',
    'podzona-26': 'Лозенец · Димитър Търкаланов',
    'podzona-28': 'Лозенец · Кричим',
    'podzona-29': 'Хладилника · бул. Никола Й. Вапцаров',
    'podzona-30': 'Крива река · Яков Крайков',
    'podzona-31': 'Център · Владайска',
    'podzona-32': 'Зона Б-5 · Партений Нишавски',
    'podzona-33': 'Център · Брегалница',
    'podzona-34': 'Център · Димитър Петков',
    'podzona-35': 'Подуяне · Русалка',
};

const extractZoneNumber = (value: string) => {
    const match = /(\d+)\s*$/.exec(String(value || '').trim());
    if (!match) {
        return null;
    }

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
};

const GENERIC_SUBZONE_NAME_PATTERN = /^подзона\s+\d+$/i;

const resolveZoneDisplayName = (name: string, zoneLabel: string, featureId: string) => {
    const overrideName = ZONE_NAME_OVERRIDES[featureId];
    if (overrideName) {
        return overrideName;
    }

    const normalizedName = String(name || '').trim();
    if (normalizedName && !GENERIC_SUBZONE_NAME_PATTERN.test(normalizedName)) {
        return normalizedName;
    }

    const zoneNumber = extractZoneNumber(normalizedName) ?? extractZoneNumber(featureId);
    if (zoneNumber == null) {
        return zoneLabel;
    }

    return `${zoneLabel} №${zoneNumber}`;
};

export const parkingZonesFeatureCollection: ParkingZoneFeatureCollection = {
    type: 'FeatureCollection',
    features: RAW_ZONE_FEATURES.map((feature) => {
        const rule = PARKING_ZONE_RULES[feature.zoneId];
        const displayName = resolveZoneDisplayName(feature.name, rule.label, feature.id);
        return {
            type: 'Feature',
            geometry: feature.geometry,
            properties: {
                id: feature.id,
                zoneId: feature.zoneId,
                name: feature.name,
                displayName,
                lineColor: rule.lineColor,
                fillColor: rule.fillColor,
                zoneLabel: rule.label,
            },
        };
    }),
};
