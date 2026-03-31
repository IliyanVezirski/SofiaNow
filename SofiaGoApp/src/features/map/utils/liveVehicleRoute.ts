type Coordinate = [number, number];

interface VehicleCoordinateLike {
    latitude: number;
    longitude: number;
}

export const getLiveVehicleRouteCoordinates = (
    routeCoordinates: Coordinate[],
    trackedVehicle: VehicleCoordinateLike | null | undefined,
): Coordinate[] => {
    if (!trackedVehicle || routeCoordinates.length < 2) {
        return routeCoordinates;
    }

    const vehicleLongitude = trackedVehicle.longitude;
    const vehicleLatitude = trackedVehicle.latitude;
    let bestIndex = 0;
    let bestDistance = Infinity;

    for (let index = 0; index < routeCoordinates.length; index += 1) {
        const [routeLongitude, routeLatitude] = routeCoordinates[index];
        const longitudeDelta = routeLongitude - vehicleLongitude;
        const latitudeDelta = routeLatitude - vehicleLatitude;
        const distance = longitudeDelta * longitudeDelta + latitudeDelta * latitudeDelta;

        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
        }
    }

    const liveCoordinates: Coordinate[] = [
        [vehicleLongitude, vehicleLatitude],
        ...routeCoordinates.slice(bestIndex + 1),
    ];

    if (liveCoordinates.length >= 2) {
        return liveCoordinates;
    }

    return [
        [vehicleLongitude, vehicleLatitude],
        routeCoordinates[routeCoordinates.length - 1],
    ];
};
