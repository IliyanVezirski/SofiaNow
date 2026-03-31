import type { ParkingCar } from './types';

export interface ParkingCarsStore {
    load: () => Promise<ParkingCar[]>;
    save: (cars: ParkingCar[]) => Promise<ParkingCar[]>;
}

export interface ParkingCarsLogger {
    warn: (message: string, error: unknown) => void;
}

export interface ParkingCarsDependencies {
    store: ParkingCarsStore;
    createId: () => string;
}
