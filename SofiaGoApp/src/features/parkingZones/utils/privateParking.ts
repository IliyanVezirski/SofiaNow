import type { ParkingLot } from '../types/parkingLots';

const MUNICIPAL_OPERATOR_PATTERN = /център за градска мобилност|цгм/i;

export const isPrivateParkingCandidate = (lot: ParkingLot) => {
    if (lot.category === 'private' || lot.category === 'commercial') {
        return true;
    }

    if (lot.category === 'buffer' || lot.category === 'airport' || lot.category === 'impound' || lot.parkRide) {
        return false;
    }

    if (lot.operator && MUNICIPAL_OPERATOR_PATTERN.test(lot.operator)) {
        return false;
    }

    if (lot.operator || lot.website || lot.phone) {
        return true;
    }

    if ((lot.category === 'underground' || lot.category === 'multi-storey') && lot.fee) {
        return true;
    }

    return false;
};