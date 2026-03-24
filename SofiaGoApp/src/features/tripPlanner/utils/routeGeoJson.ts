import { Itinerary } from '../../../services/tripPlanner';

const MODE_COLORS: Record<string, string> = {
    WALK: '#94A3B8',
    BUS: '#2563EB',
    TRAM: '#DC2626',
    TROLLEYBUS: '#7C3AED',
    SUBWAY: '#059669',
    RAIL: '#D97706',
};

const decodePolyline = (encoded: string): [number, number][] => {
    let index = 0;
    const length = encoded.length;
    let latitude = 0;
    let longitude = 0;
    const coordinates: [number, number][] = [];

    while (index < length) {
        let shift = 0;
        let result = 0;
        let byte = 0;

        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
        latitude += deltaLat;

        shift = 0;
        result = 0;

        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        const deltaLon = (result & 1) ? ~(result >> 1) : (result >> 1);
        longitude += deltaLon;

        coordinates.push([longitude / 1e5, latitude / 1e5]);
    }

    return coordinates;
};

export interface TripRouteStop {
    name: string;
    lat: number;
    lon: number;
    stopCode?: string;
}

export interface TripRouteGeoJSON {
    type: 'FeatureCollection';
    features: Array<{
        type: 'Feature';
        properties: { mode: string; color: string };
        geometry: { type: 'LineString'; coordinates: [number, number][] };
    }>;
    endpoints: { from: TripRouteStop; to: TripRouteStop };
    transitStops: TripRouteStop[];
}

export const buildRouteGeoJSON = (itinerary: Itinerary): TripRouteGeoJSON => {
    if (!Array.isArray(itinerary.legs) || itinerary.legs.length === 0) {
        throw new Error('Маршрутът няма достатъчно данни за показване на картата.');
    }

    const transitStops: TripRouteStop[] = [];
    const seen = new Set<string>();

    for (const leg of itinerary.legs) {
        if (leg.mode === 'WALK') {
            continue;
        }

        const addStop = (place: typeof leg.from) => {
            const key = place.stop?.code ?? `${place.lat},${place.lon}`;
            if (seen.has(key)) {
                return;
            }

            seen.add(key);
            transitStops.push({
                name: place.name,
                lat: place.lat,
                lon: place.lon,
                stopCode: place.stop?.code,
            });
        };

        addStop(leg.from);
        if (leg.intermediatePlaces) {
            for (const place of leg.intermediatePlaces) {
                addStop(place);
            }
        }
        addStop(leg.to);
    }

    const firstLeg = itinerary.legs[0];
    const lastLeg = itinerary.legs[itinerary.legs.length - 1];

    return {
        type: 'FeatureCollection',
        features: itinerary.legs.map((leg) => ({
            type: 'Feature' as const,
            properties: {
                mode: leg.mode,
                color: MODE_COLORS[leg.mode] ?? '#1E3A8A',
            },
            geometry: {
                type: 'LineString' as const,
                coordinates: decodePolyline(leg.legGeometry.points),
            },
        })),
        endpoints: {
            from: { name: firstLeg.from.name, lat: firstLeg.from.lat, lon: firstLeg.from.lon },
            to: { name: lastLeg.to.name, lat: lastLeg.to.lat, lon: lastLeg.to.lon },
        },
        transitStops,
    };
};