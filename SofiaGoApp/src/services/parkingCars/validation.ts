import { CYRILLIC_PLATE_REGEX, MAX_PARKING_CAR_NAME_LENGTH, PLATE_SEPARATOR_REGEX } from './constants';
import type { ParkingCar, ParkingCarPlateValidationResult } from './types';

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

export const formatParkingCarDisplayPlate = (plate: string) => {
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

export const normalizeParkingCarPlate = (value: string) => String(value || '').trim().toUpperCase();

export const validateParkingCarPlate = (value: string): ParkingCarPlateValidationResult => {
    const rawValue = String(value || '').trim();
    const normalizedPlate = normalizeParkingCarPlate(rawValue);
    const displayPlate = formatParkingCarDisplayPlate(normalizedPlate);

    if (!rawValue) {
        return {
            isValid: false,
            normalizedPlate,
            displayPlate,
            error: 'Въведи регистрационен номер.',
        };
    }

    if (PLATE_SEPARATOR_REGEX.test(rawValue)) {
        return {
            isValid: false,
            normalizedPlate,
            displayPlate,
            error: 'Номерът трябва да е без интервали, тирета и точки.',
        };
    }

    if (CYRILLIC_PLATE_REGEX.test(rawValue)) {
        return {
            isValid: false,
            normalizedPlate,
            displayPlate,
            error: 'Използвай латински букви, а не кирилица.',
        };
    }

    if (/[^A-Za-z0-9]/.test(rawValue)) {
        return {
            isValid: false,
            normalizedPlate,
            displayPlate,
            error: 'Позволени са само латински букви и цифри.',
        };
    }

    if (!/[A-Z]/.test(normalizedPlate) || !/\d/.test(normalizedPlate)) {
        return {
            isValid: false,
            normalizedPlate,
            displayPlate,
            error: 'Номерът трябва да съдържа и букви, и цифри.',
        };
    }

    if (!/^[A-Z]{1,2}\d{4}[A-Z]{2}$/.test(normalizedPlate)) {
        return {
            isValid: false,
            normalizedPlate,
            displayPlate,
            error: 'Буквите трябва да са латински - XX9999XX',
        };
    }

    return {
        isValid: true,
        normalizedPlate,
        displayPlate,
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
    const validation = validateParkingCarPlate(plate);

    if (!id || !validation.isValid) {
        return null;
    }

    return {
        id,
        name: typeof entry.name === 'string' ? normalizeParkingCarName(entry.name).slice(0, MAX_PARKING_CAR_NAME_LENGTH) || null : null,
        plate: validation.normalizedPlate,
        displayPlate: formatParkingCarDisplayPlate(validation.normalizedPlate),
        isDefault: entry.isDefault === true,
        createdAt: typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
    };
};
