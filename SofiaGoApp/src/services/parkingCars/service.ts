import {
    findParkingCarById,
    hasParkingCar,
    hasParkingCarWithPlate,
    markDefaultParkingCar,
    removeParkingCarById,
    updateParkingCarById,
} from './domain';
import type { ParkingCarsDependencies } from './ports';
import type { ParkingCar } from './types';
import {
    DUPLICATE_CAR_ERROR_MESSAGE,
    DUPLICATE_OTHER_CAR_ERROR_MESSAGE,
    INVALID_PLATE_ERROR_MESSAGE,
} from './messages';
import { sanitizeParkingCarName, validateParkingCarPlate } from './validation';

const createParkingCar = (
    id: string,
    plate: string,
    displayPlate: string,
    name: string | null,
    isDefault: boolean,
): ParkingCar => ({
    id,
    name,
    plate,
    displayPlate,
    isDefault,
    createdAt: Date.now(),
});

export const createParkingCarsService = ({ store, createId }: ParkingCarsDependencies) => ({
    loadParkingCars: () => store.load(),

    addParkingCar: async (value: string, nameValue = '') => {
        const validation = validateParkingCarPlate(value);
        if (!validation.isValid) {
            throw new Error(validation.error || INVALID_PLATE_ERROR_MESSAGE);
        }

        const currentCars = await store.load();
        if (hasParkingCarWithPlate(currentCars, validation.normalizedPlate)) {
            throw new Error(DUPLICATE_CAR_ERROR_MESSAGE);
        }

        const nextCars: ParkingCar[] = [
            createParkingCar(
                createId(),
                validation.normalizedPlate,
                validation.displayPlate,
                sanitizeParkingCarName(nameValue),
                currentCars.length === 0,
            ),
            ...currentCars,
        ];

        return store.save(nextCars);
    },

    updateParkingCar: async (id: string, plateValue: string, nameValue = '') => {
        const validation = validateParkingCarPlate(plateValue);
        if (!validation.isValid) {
            throw new Error(validation.error || INVALID_PLATE_ERROR_MESSAGE);
        }

        const currentCars = await store.load();
        if (!findParkingCarById(currentCars, id)) {
            return currentCars;
        }

        if (hasParkingCarWithPlate(currentCars, validation.normalizedPlate, id)) {
            throw new Error(DUPLICATE_OTHER_CAR_ERROR_MESSAGE);
        }

        const nextName = sanitizeParkingCarName(nameValue);
        return store.save(updateParkingCarById(currentCars, id, (car) => ({
            ...car,
            name: nextName,
            plate: validation.normalizedPlate,
            displayPlate: validation.displayPlate,
        })));
    },

    removeParkingCar: async (id: string) => {
        const currentCars = await store.load();
        const nextCars = removeParkingCarById(currentCars, id);

        if (nextCars.length === currentCars.length) {
            return currentCars;
        }

        return store.save(nextCars);
    },

    setDefaultParkingCar: async (id: string) => {
        const currentCars = await store.load();
        if (!hasParkingCar(currentCars, id)) {
            return currentCars;
        }

        return store.save(markDefaultParkingCar(currentCars, id));
    },

    setParkingCarName: async (id: string, value: string) => {
        const currentCars = await store.load();
        if (!hasParkingCar(currentCars, id)) {
            return currentCars;
        }

        const nextName = sanitizeParkingCarName(value);
        return store.save(updateParkingCarById(currentCars, id, (car) => ({
            ...car,
            name: nextName,
        })));
    },
});
