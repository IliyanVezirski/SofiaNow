import { CYRILLIC_PLATE_REGEX, MAX_PARKING_CAR_NAME_LENGTH, PLATE_SEPARATOR_REGEX } from './constants';
import type { ParkingCar, ParkingCarPlateKind, ParkingCarPlateValidationResult } from './types';

export const sortParkingCars = (cars: ParkingCar[]) => [...cars].sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
        return left.isDefault ? -1 : 1;
    }

    return right.createdAt - left.createdAt;
});

export const ensureDefaultParkingCar = (cars: ParkingCar[]) => {
    if (cars.length > 1 && !cars.some((car) => car.isDefault)) {
        return cars.map((car, index) => ({
            ...car,
            isDefault: index === 0,
        }));
    }

    return cars;
};

export const getParkingCarPlateKindLabel = (plateKind: ParkingCarPlateKind) => (
    plateKind === 'foreign' ? 'Чуждестранен номер' : 'Български номер'
);

export const formatParkingCarDisplayPlate = (plate: string, plateKind: ParkingCarPlateKind = 'bg') => {
    if (plateKind === 'foreign') {
        return plate;
    }

    const standardMatch = /^([A-Z]{1,2})(\d{4})([A-Z]{1,3})$/.exec(plate);
    if (standardMatch) {
        return `${standardMatch[1]} ${standardMatch[2]} ${standardMatch[3]}`;
    }

    const fallbackMatch = /^([A-Z]{1,3})(\d{2,4})([A-Z0-9]{1,3})$/.exec(plate);
    if (fallbackMatch) {
        return `${fallbackMatch[1]} ${fallbackMatch[2]} ${fallbackMatch[3]}`;
    }

    return plate;
};

export const normalizeParkingCarName = (value: string) => String(value || '').trim().replace(/\s+/g, ' ');

export const sanitizeParkingCarName = (value: string) => {
    const normalizedName = normalizeParkingCarName(value);
    if (!normalizedName) {
        return null;
    }

    if (normalizedName.length > MAX_PARKING_CAR_NAME_LENGTH) {
        throw new Error(`Името трябва да е до ${MAX_PARKING_CAR_NAME_LENGTH} символа.`);
    }

    return normalizedName;
};

export const normalizeParkingCarPlate = (value: string, plateKind: ParkingCarPlateKind = 'bg') => (
    plateKind === 'foreign'
        ? String(value || '').trim()
        : String(value || '').trim().toUpperCase()
);

export const validateParkingCarPlate = (
    value: string,
    plateKind: ParkingCarPlateKind = 'bg',
): ParkingCarPlateValidationResult => {
    const rawValue = String(value || '').trim();
    const normalizedPlate = normalizeParkingCarPlate(rawValue, plateKind);
    const displayPlate = formatParkingCarDisplayPlate(normalizedPlate, plateKind);

    if (!rawValue) {
        return {
            isValid: false,
            normalizedPlate,
            displayPlate,
            plateKind,
            error: 'Въведи регистрационен номер.',
        };
    }

    if (plateKind === 'foreign') {
        if (normalizedPlate.length < 3) {
            return {
                isValid: false,
                normalizedPlate,
                displayPlate,
                plateKind,
                error: 'Въведи пълния номер така, както е на колата.',
            };
        }

        return {
            isValid: true,
            normalizedPlate,
            displayPlate,
            plateKind,
            error: null,
        };
    }

    if (PLATE_SEPARATOR_REGEX.test(rawValue)) {
        return {
            isValid: false,
            normalizedPlate,
            displayPlate,
            plateKind,
            error: 'Номерът трябва да е без интервали, тирета и точки.',
        };
    }

    if (CYRILLIC_PLATE_REGEX.test(rawValue)) {
        return {
            isValid: false,
            normalizedPlate,
            displayPlate,
            plateKind,
            error: 'Използвай латински букви, а не кирилица.',
        };
    }

    if (/[^A-Za-z0-9]/.test(rawValue)) {
        return {
            isValid: false,
            normalizedPlate,
            displayPlate,
            plateKind,
            error: 'Позволени са само латински букви и цифри.',
        };
    }

    if (!/[A-Z]/.test(normalizedPlate) || !/\d/.test(normalizedPlate)) {
        return {
            isValid: false,
            normalizedPlate,
            displayPlate,
            plateKind,
            error: 'Номерът трябва да съдържа и букви, и цифри.',
        };
    }

    if (!/^[A-Z]{1,2}\d{4}[A-Z]{2}$/.test(normalizedPlate)) {
        return {
            isValid: false,
            normalizedPlate,
            displayPlate,
            plateKind,
            error: 'Буквите трябва да са латински - XX9999XX',
        };
    }

    return {
        isValid: true,
        normalizedPlate,
        displayPlate,
        plateKind,
        error: null,
    };
};

export const normalizeStoredParkingCar = (value: unknown): ParkingCar | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const entry = value as Record<string, unknown>;
    const id = typeof entry.id === 'string' ? entry.id : '';
    const plate = typeof entry.plate === 'string' ? entry.plate : '';
    const plateKind: ParkingCarPlateKind = entry.plateKind === 'foreign' ? 'foreign' : 'bg';
    const validation = validateParkingCarPlate(plate, plateKind);

    if (!id || !validation.isValid) {
        return null;
    }

    return {
        id,
        name: typeof entry.name === 'string' ? normalizeParkingCarName(entry.name).slice(0, MAX_PARKING_CAR_NAME_LENGTH) || null : null,
        plate: validation.normalizedPlate,
        displayPlate: formatParkingCarDisplayPlate(validation.normalizedPlate, validation.plateKind),
        plateKind: validation.plateKind,
        isDefault: entry.isDefault === true,
        createdAt: typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
    };
};
