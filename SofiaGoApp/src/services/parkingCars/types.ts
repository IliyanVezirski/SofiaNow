export type ParkingCarPlateKind = 'bg' | 'foreign';

export interface ParkingCar {
    id: string;
    name: string | null;
    plate: string;
    displayPlate: string;
    plateKind: ParkingCarPlateKind;
    isDefault: boolean;
    createdAt: number;
}

export interface ParkingCarPlateValidationResult {
    isValid: boolean;
    normalizedPlate: string;
    displayPlate: string;
    plateKind: ParkingCarPlateKind;
    error: string | null;
}
