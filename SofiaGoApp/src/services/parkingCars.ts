export { MAX_PARKING_CAR_NAME_LENGTH } from './parkingCars/constants';
export type { ParkingCar, ParkingCarPlateKind, ParkingCarPlateValidationResult } from './parkingCars/types';
export { getParkingCarPlateKindLabel, validateParkingCarPlate } from './parkingCars/validation';
export { loadParkingCars } from './parkingCars/storage';
export { subscribeToParkingCarChanges } from './parkingCars/storage';
export {
    addParkingCar,
    removeParkingCar,
    setDefaultParkingCar,
    setParkingCarName,
    updateParkingCar,
} from './parkingCars/repository';
