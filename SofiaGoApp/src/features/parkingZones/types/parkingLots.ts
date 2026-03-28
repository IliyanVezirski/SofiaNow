export type ParkingLotCategory = 'buffer' | 'underground' | 'surface' | 'multi-storey' | 'impound' | 'airport' | 'commercial' | 'private';

export interface ParkingLot {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    category: ParkingLotCategory;
    capacity: number | null;
    fee: boolean;
    operator: string | null;
    parkRide: boolean;
    openingHours: string | null;
    website: string | null;
    phone: string | null;
    maxheight: number | null;
    surface: string | null;
}
