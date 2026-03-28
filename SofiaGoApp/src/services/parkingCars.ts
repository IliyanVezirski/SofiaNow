import AsyncStorage from '@react-native-async-storage/async-storage';

const PARKING_CARS_STORAGE_KEY = '@sofiago:parking:cars:v1';
const PLATE_SEPARATOR_REGEX = /[\s\-–—_.·•]/;
const CYRILLIC_PLATE_REGEX = /[А-Яа-я]/;
export const MAX_PARKING_CAR_NAME_LENGTH = 24;

export interface ParkingCar {
    id: string;
    name: string | null;
    plate: string;
    displayPlate: string;
    isDefault: boolean;
    createdAt: number;
}

export interface ParkingCarPlateValidationResult {
    isValid: boolean;
    normalizedPlate: string;
    displayPlate: string;
    error: string | null;
}

const sortParkingCars = (cars: ParkingCar[]) => [...cars].sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
        return left.isDefault ? -1 : 1;
    }

    return right.createdAt - left.createdAt;
});

const formatParkingCarDisplayPlate = (plate: string) => {
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

const normalizeParkingCarName = (value: string) => String(value || '').trim().replace(/\s+/g, ' ');

const sanitizeParkingCarName = (value: string) => {
    const normalizedName = normalizeParkingCarName(value);
    if (!normalizedName) {
        return null;
    }

    if (normalizedName.length > MAX_PARKING_CAR_NAME_LENGTH) {
        throw new Error(`Името трябва да е до ${MAX_PARKING_CAR_NAME_LENGTH} символа.`);
    }

    return normalizedName;
};

const normalizeParkingCarPlate = (value: string) => String(value || '').trim().toUpperCase();

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

    // Bulgarian plate format: 1-2 letters + 4 digits + 2 letters (e.g. CB1234AB, E1234AB)
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

const normalizeStoredParkingCar = (value: unknown): ParkingCar | null => {
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

export const loadParkingCars = async () => {
    try {
        const raw = await AsyncStorage.getItem(PARKING_CARS_STORAGE_KEY);
        if (!raw) {
            return [] as ParkingCar[];
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [] as ParkingCar[];
        }

        const cars = parsed
            .map(normalizeStoredParkingCar)
            .filter((car): car is ParkingCar => !!car);

        if (cars.length > 1 && !cars.some((car) => car.isDefault)) {
            cars[0] = { ...cars[0], isDefault: true };
        }

        return sortParkingCars(cars);
    } catch (error) {
        console.warn('Failed to load parking cars:', error);
        return [] as ParkingCar[];
    }
};

const persistParkingCars = async (cars: ParkingCar[]) => {
    const sortedCars = sortParkingCars(cars);

    if (!sortedCars.length) {
        await AsyncStorage.removeItem(PARKING_CARS_STORAGE_KEY);
        return [] as ParkingCar[];
    }

    await AsyncStorage.setItem(PARKING_CARS_STORAGE_KEY, JSON.stringify(sortedCars));
    return sortedCars;
};

const createParkingCarId = () => `parking-car-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const addParkingCar = async (value: string, nameValue = '') => {
    const validation = validateParkingCarPlate(value);
    if (!validation.isValid) {
        throw new Error(validation.error || 'Невалиден регистрационен номер.');
    }

    const carName = sanitizeParkingCarName(nameValue);

    const currentCars = await loadParkingCars();
    if (currentCars.some((car) => car.plate === validation.normalizedPlate)) {
        throw new Error('Тази кола вече е добавена.');
    }

    const nextCars = [
        {
            id: createParkingCarId(),
            name: carName,
            plate: validation.normalizedPlate,
            displayPlate: validation.displayPlate,
            isDefault: currentCars.length === 0,
            createdAt: Date.now(),
        },
        ...currentCars.map((car) => ({
            ...car,
            isDefault: currentCars.length === 0 ? false : car.isDefault,
        })),
    ];

    return persistParkingCars(nextCars);
};

export const updateParkingCar = async (id: string, plateValue: string, nameValue = '') => {
    const validation = validateParkingCarPlate(plateValue);
    if (!validation.isValid) {
        throw new Error(validation.error || 'Невалиден регистрационен номер.');
    }

    const nextName = sanitizeParkingCarName(nameValue);
    const currentCars = await loadParkingCars();
    const targetCar = currentCars.find((car) => car.id === id) ?? null;

    if (!targetCar) {
        return currentCars;
    }

    const duplicateCar = currentCars.find((car) => car.id !== id && car.plate === validation.normalizedPlate);
    if (duplicateCar) {
        throw new Error('Вече имаш друга кола с този номер.');
    }

    return persistParkingCars(currentCars.map((car) => (
        car.id === id
            ? {
                ...car,
                name: nextName,
                plate: validation.normalizedPlate,
                displayPlate: validation.displayPlate,
            }
            : car
    )));
};

export const removeParkingCar = async (id: string) => {
    const currentCars = await loadParkingCars();
    const nextCars = currentCars.filter((car) => car.id !== id);

    if (nextCars.length === currentCars.length) {
        return currentCars;
    }

    if (nextCars.length > 0 && !nextCars.some((car) => car.isDefault)) {
        nextCars[0] = { ...nextCars[0], isDefault: true };
    }

    return persistParkingCars(nextCars);
};

export const setDefaultParkingCar = async (id: string) => {
    const currentCars = await loadParkingCars();
    const hasTarget = currentCars.some((car) => car.id === id);

    if (!hasTarget) {
        return currentCars;
    }

    return persistParkingCars(currentCars.map((car) => ({
        ...car,
        isDefault: car.id === id,
    })));
};

export const setParkingCarName = async (id: string, value: string) => {
    const currentCars = await loadParkingCars();
    const hasTarget = currentCars.some((car) => car.id === id);

    if (!hasTarget) {
        return currentCars;
    }

    const nextName = sanitizeParkingCarName(value);
    return persistParkingCars(currentCars.map((car) => (
        car.id === id
            ? {
                ...car,
                name: nextName,
            }
            : car
    )));
};