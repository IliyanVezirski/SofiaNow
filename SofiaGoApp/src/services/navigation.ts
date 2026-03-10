// OSRM routing service

export interface Route {
    distance: number; // in meters
    duration: number; // in seconds
    geometry: string; // Polyline format
}

export const fetchWalkingRoute = async (
    startCoord: [number, number], // [lon, lat]
    endCoord: [number, number]    // [lon, lat]
): Promise<Route | null> => {
    try {
        const url = `https://router.project-osrm.org/route/v1/foot/${startCoord[0]},${startCoord[1]};${endCoord[0]},${endCoord[1]}?overview=full&geometries=geojson`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            console.warn('OSRM routing failed:', data);
            return null;
        }

        const route = data.routes[0];
        return {
            distance: route.distance,
            duration: route.duration,
            geometry: route.geometry,
        };
    } catch (err) {
        console.error('Error fetching route:', err);
        return null;
    }
};
