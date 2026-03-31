export { MAX_PARKING_CAR_NAME_LENGTH } from './parkingCars/constants';
export type { ParkingCar, ParkingCarPlateValidationResult } from './parkingCars/types';
export { validateParkingCarPlate } from './parkingCars/validation';
export { loadParkingCars } from './parkingCars/storage';
export {
    addParkingCar,
    removeParkingCar,
    setDefaultParkingCar,
    setParkingCarName,
    updateParkingCar,
} from './parkingCars/repository';
