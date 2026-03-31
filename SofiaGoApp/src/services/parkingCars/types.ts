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
