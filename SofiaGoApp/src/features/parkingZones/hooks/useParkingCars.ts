import { useCallback, useEffect, useState } from 'react';

import {
    addParkingCar as addParkingCarEntry,
    loadParkingCars,
    removeParkingCar as removeParkingCarEntry,
    setDefaultParkingCar as setDefaultParkingCarEntry,
    updateParkingCar as updateParkingCarEntry,
    type ParkingCar,
} from '../../../services/parkingCars';

export function useParkingCars() {
    const [cars, setCars] = useState<ParkingCar[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const nextCars = await loadParkingCars();
        setCars(nextCars);
        return nextCars;
    }, []);

    useEffect(() => {
        void refresh().finally(() => setLoading(false));
    }, [refresh]);

    const addCar = useCallback(async (value: string, name?: string) => {
        const nextCars = await addParkingCarEntry(value, name);
        setCars(nextCars);
        return nextCars;
    }, []);

    const removeCar = useCallback(async (id: string) => {
        const nextCars = await removeParkingCarEntry(id);
        setCars(nextCars);
        return nextCars;
    }, []);

    const setDefaultCar = useCallback(async (id: string) => {
        const nextCars = await setDefaultParkingCarEntry(id);
        setCars(nextCars);
        return nextCars;
    }, []);

    const updateCar = useCallback(async (id: string, plate: string, name?: string) => {
        const nextCars = await updateParkingCarEntry(id, plate, name);
        setCars(nextCars);
        return nextCars;
    }, []);

    return {
        cars,
        loading,
        refresh,
        addCar,
        removeCar,
        setDefaultCar,
        updateCar,
    };
}