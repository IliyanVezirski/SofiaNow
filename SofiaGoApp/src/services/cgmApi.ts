import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

export interface Vehicle {
    id: string;
    line: string;
    type: 'bus' | 'tram' | 'trolley' | 'subway';
    latitude: number;
    longitude: number;
    delayMinutes?: number;
}

export const fetchVehiclesNearby = async (lat: number, lon: number): Promise<Vehicle[]> => {
    try {
        const response = await fetch('https://gtfs.sofiatraffic.bg/api/v1/vehicle-positions');

        if (!response.ok) {
            console.warn("Error fetching real CGM data", response.statusText);
            return [];
        }

        // React Native's fetch doesn't support arrayBuffer() natively in all older Expo versions in the same way,
        // but in modern versions/Expo it does.
        const buffer = await response.arrayBuffer();
        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

        const vehicles: Vehicle[] = [];

        // Filter vehicles around the current viewport (approx 2-3km bounding box)
        const latDelta = 0.03;
        const lonDelta = 0.03;

        feed.entity.forEach((entity: any) => {
            if (entity.vehicle && entity.vehicle.position) {
                const vLat = entity.vehicle.position.latitude;
                const vLon = entity.vehicle.position.longitude;

                // Simple bounding box filtering to not overload the map
                if (vLat > lat - latDelta && vLat < lat + latDelta &&
                    vLon > lon - lonDelta && vLon < lon + lonDelta) {

                    // Try to resolve the route. GTFS routeId in Sofia is usually A84, TM10 (tram 10), TB2 (trolley 2)
                    const routeId = entity.vehicle.trip?.routeId || 'Unknown';
                    let formattedLine = routeId;
                    let type: 'bus' | 'tram' | 'trolley' | 'subway' = 'bus';

                    if (routeId.startsWith('TM')) {
                        type = 'tram';
                        formattedLine = routeId.replace('TM', '');
                    } else if (routeId.startsWith('TB')) {
                        type = 'trolley';
                        formattedLine = routeId.replace('TB', '');
                    } else if (routeId.startsWith('A')) {
                        type = 'bus';
                        formattedLine = routeId.replace('A', '');
                    }

                    vehicles.push({
                        id: entity.vehicle.vehicle?.id || entity.id,
                        line: formattedLine,
                        type,
                        latitude: vLat,
                        longitude: vLon,
                    });
                }
            }
        });

        return vehicles;

    } catch (error) {
        console.error('Failed to fetch/decode GTFS:', error);
        return [];
    }
};

export interface StopTime {
    time: string;
    realTime: boolean;
}

// Since real-time GTFS for virtual boards requires matching trip updates to stop schedules (which requires parsing static GTFS),
// we will keep the Virtual Board mocked for now as it's considerably more complex without a backend wrapper.
export const fetchVirtualBoard = async (stopId: string): Promise<StopTime[]> => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return [
        { time: '12:05', realTime: true },
        { time: '12:15', realTime: false },
        { time: '12:25', realTime: true },
    ];
};
