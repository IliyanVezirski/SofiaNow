import AsyncStorage from '@react-native-async-storage/async-storage';

import { PARKING_CARS_STORAGE_KEY } from './constants';
import { LOAD_PARKING_CARS_ERROR_MESSAGE } from './messages';
import type { ParkingCarsLogger, ParkingCarsStore } from './ports';
import type { ParkingCar } from './types';
import { ensureDefaultParkingCar, normalizeStoredParkingCar, sortParkingCars } from './validation';

type KeyValueStorage = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;

const defaultParkingCarsLogger: ParkingCarsLogger = {
    warn: (message, error) => {
        console.warn(message, error);
    },
};

const normalizeParkingCarsForPersistence = (cars: ParkingCar[]) => sortParkingCars(ensureDefaultParkingCar(cars));

const parseStoredParkingCars = (raw: string | null) => {
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

    return normalizeParkingCarsForPersistence(cars);
};

export const createParkingCarsStore = (
    storage: KeyValueStorage,
    logger: ParkingCarsLogger = defaultParkingCarsLogger,
): ParkingCarsStore => ({
    load: async () => {
        try {
            const raw = await storage.getItem(PARKING_CARS_STORAGE_KEY);
            return parseStoredParkingCars(raw);
        } catch (error) {
            logger.warn(LOAD_PARKING_CARS_ERROR_MESSAGE, error);
            return [] as ParkingCar[];
        }
    },

    save: async (cars: ParkingCar[]) => {
        const sortedCars = normalizeParkingCarsForPersistence(cars);

        if (!sortedCars.length) {
            await storage.removeItem(PARKING_CARS_STORAGE_KEY);
            return [] as ParkingCar[];
        }

        await storage.setItem(PARKING_CARS_STORAGE_KEY, JSON.stringify(sortedCars));
        return sortedCars;
    },
});

const defaultParkingCarsStore = createParkingCarsStore(AsyncStorage);

export const loadParkingCars = () => defaultParkingCarsStore.load();

export const persistParkingCars = (cars: ParkingCar[]) => defaultParkingCarsStore.save(cars);
