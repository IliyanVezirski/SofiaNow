import type { ParkingCar } from './types';

export const hasParkingCar = (cars: ParkingCar[], id: string) => cars.some((car) => car.id === id);

export const findParkingCarById = (cars: ParkingCar[], id: string) => cars.find((car) => car.id === id) ?? null;

export const hasParkingCarWithPlate = (cars: ParkingCar[], plate: string, excludedId?: string, plateKind?: ParkingCar['plateKind']) => cars.some((car) => (
    car.plate === plate
    && car.id !== excludedId
    && (plateKind ? car.plateKind === plateKind : true)
));

export const updateParkingCarById = (
    cars: ParkingCar[],
    id: string,
    update: (car: ParkingCar) => ParkingCar,
) => cars.map((car) => (car.id === id ? update(car) : car));

export const removeParkingCarById = (cars: ParkingCar[], id: string) => cars.filter((car) => car.id !== id);

export const markDefaultParkingCar = (cars: ParkingCar[], id: string) => cars.map((car) => ({
    ...car,
    isDefault: car.id === id,
}));
