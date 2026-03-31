import {
    PARKING_CAR_ID_PREFIX,
    PARKING_CAR_ID_RANDOM_SLICE_END,
    PARKING_CAR_ID_RANDOM_SLICE_START,
} from './constants';
import { createParkingCarsStore } from './storage';
import { createParkingCarsService } from './service';
import AsyncStorage from '@react-native-async-storage/async-storage';

const createParkingCarId = () => (
    `${PARKING_CAR_ID_PREFIX}-${Date.now().toString(36)}-${Math.random().toString(36).slice(PARKING_CAR_ID_RANDOM_SLICE_START, PARKING_CAR_ID_RANDOM_SLICE_END)}`
);

const parkingCarsService = createParkingCarsService({
    store: createParkingCarsStore(AsyncStorage),
    createId: createParkingCarId,
});

export const loadParkingCars = parkingCarsService.loadParkingCars;
export const addParkingCar = parkingCarsService.addParkingCar;
export const updateParkingCar = parkingCarsService.updateParkingCar;
export const removeParkingCar = parkingCarsService.removeParkingCar;
export const setDefaultParkingCar = parkingCarsService.setDefaultParkingCar;
export const setParkingCarName = parkingCarsService.setParkingCarName;
