const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GTFS_DIR = path.join(ROOT, 'gtfs_static');
const OUTPUT_PATH = path.join(ROOT, 'src', 'data', 'routeGeometry.static.json');

const readCsvRows = (filename) => {
    const raw = fs.readFileSync(path.join(GTFS_DIR, filename), 'utf8');
    return raw.split(/\r?\n/).filter(Boolean);
};

const splitCsvLine = (line) => {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === ',' && !inQuotes) { fields.push(current); current = ''; continue; }
        current += ch;
    }
    fields.push(current);
    return fields;
};

const GTFS_TYPE_MAP = { 0: 'tram', 1: 'subway', 3: 'bus', 11: 'trolley' };

// Use CGM-authoritative types when available
const ROUTE_TYPES_PATH = path.join(ROOT, 'src', 'data', 'routeTypes.static.json');
const cgmRouteTypes = fs.existsSync(ROUTE_TYPES_PATH)
    ? JSON.parse(fs.readFileSync(ROUTE_TYPES_PATH, 'utf8'))
    : {};

const parseRouteType = (routeTypeValue, routeId) => {
    if (cgmRouteTypes[routeId]) return cgmRouteTypes[routeId];
    return GTFS_TYPE_MAP[Number(routeTypeValue)] || 'bus';
};

const normalizeDisplayLine = (shortName, type) => {
    const normalized = String(shortName || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!normalized) {
        return '';
    }

    if (type === 'tram') {
        return normalized.replace(/^TM/, '').replace(/TM$/, '');
    }

    if (type === 'trolley') {
        return normalized.replace(/^TB/, '').replace(/TB$/, '');
    }

    if (type === 'subway') {
        return normalized.replace(/^M/, '');
    }

    return normalized;
};

const buildStopsIndex = () => {
    const rows = readCsvRows('stops.txt');
    const stopsById = new Map();

    for (let i = 1; i < rows.length; i += 1) {
        const [stopId, , stopName, stopLat, stopLon] = splitCsvLine(rows[i]);
        const latitude = Number(stopLat);
        const longitude = Number(stopLon);
        if (!stopId || !stopName || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            continue;
        }

        stopsById.set(stopId, {
            id: stopId,
            name: stopName,
            latitude,
            longitude,
        });
    }

    return stopsById;
};

const buildRoutesIndex = () => {
    const rows = readCsvRows('routes.txt');
    const routesById = new Map();

    for (let i = 1; i < rows.length; i += 1) {
        const [routeId, , routeShortName, routeLongName, , routeType] = splitCsvLine(rows[i]);
        if (!routeId || !routeShortName) {
            continue;
        }

        const type = parseRouteType(routeType, routeId);
        routesById.set(routeId, {
            routeId,
            shortName: String(routeShortName || '').trim(),
            longName: String(routeLongName || '').trim(),
            type,
            isNight: String(routeShortName || '').trim().toUpperCase().startsWith('N'),
            line: normalizeDisplayLine(routeShortName, type),
        });
    }

    return routesById;
};

const buildTripsIndex = (routesById) => {
    const rows = readCsvRows('trips.txt');
    const tripsById = new Map();

    for (let i = 1; i < rows.length; i += 1) {
        const [tripId, routeId, , headsign, , directionId, , shapeId] = splitCsvLine(rows[i]);
        if (!tripId || !routeId || !shapeId || !routesById.has(routeId)) {
            continue;
        }

        tripsById.set(tripId, {
            tripId,
            routeId,
            headsign: String(headsign || '').trim(),
            directionId: String(directionId || '').trim(),
            shapeId: String(shapeId || '').trim(),
        });
    }

    return tripsById;
};

const buildCanonicalTrips = (tripsById) => {
    const rows = readCsvRows('stop_times.txt');
    const tripStops = new Map();

    for (let i = 1; i < rows.length; i += 1) {
        const [tripId, , , stopId, stopSequence] = splitCsvLine(rows[i]);
        const trip = tripsById.get(tripId);
        if (!trip || !stopId) {
            continue;
        }

        const seq = Number(stopSequence);
        if (!Number.isFinite(seq)) {
            continue;
        }

        const current = tripStops.get(tripId) || [];
        current.push({ stopId, seq });
        tripStops.set(tripId, current);
    }

    const canonicalTripsByKey = new Map();

    for (const [tripId, trip] of tripsById.entries()) {
        const stops = (tripStops.get(tripId) || [])
            .sort((left, right) => left.seq - right.seq)
            .map((entry) => entry.stopId);

        if (stops.length < 2) {
            continue;
        }

        const groupingKey = `${trip.routeId}__${trip.directionId || trip.headsign || trip.shapeId}`;
        const existing = canonicalTripsByKey.get(groupingKey);
        if (!existing || existing.stops.length < stops.length) {
            canonicalTripsByKey.set(groupingKey, {
                ...trip,
                stops,
            });
        }
    }

    return canonicalTripsByKey;
};

const buildShapeCoordinates = (neededShapeIds) => {
    const rows = readCsvRows('shapes.txt');
    const shapesById = new Map();

    for (let i = 1; i < rows.length; i += 1) {
        const [shapeId, shapePtLat, shapePtLon, shapePtSequence] = splitCsvLine(rows[i]);
        if (!neededShapeIds.has(shapeId)) {
            continue;
        }

        const latitude = Number(shapePtLat);
        const longitude = Number(shapePtLon);
        const sequence = Number(shapePtSequence);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(sequence)) {
            continue;
        }

        const points = shapesById.get(shapeId) || [];
        points.push({ sequence, coordinate: [longitude, latitude] });
        shapesById.set(shapeId, points);
    }

    for (const [shapeId, points] of shapesById.entries()) {
        points.sort((left, right) => left.sequence - right.sequence);
        shapesById.set(shapeId, points.map((entry) => entry.coordinate));
    }

    return shapesById;
};

const main = () => {
    const stopsById = buildStopsIndex();
    const routesById = buildRoutesIndex();
    const tripsById = buildTripsIndex(routesById);
    const canonicalTripsByKey = buildCanonicalTrips(tripsById);
    const neededShapeIds = new Set(
        Array.from(canonicalTripsByKey.values())
            .map((trip) => trip.shapeId)
            .filter(Boolean),
    );
    const shapesById = buildShapeCoordinates(neededShapeIds);

    const geometriesByRouteId = new Map();

    for (const trip of canonicalTripsByKey.values()) {
        const route = routesById.get(trip.routeId);
        const coordinates = shapesById.get(trip.shapeId) || [];
        if (!route || route.type === 'subway' || coordinates.length < 2) {
            continue;
        }

        const stops = trip.stops
            .map((stopId) => stopsById.get(stopId) || null)
            .filter(Boolean);

        if (stops.length < 2) {
            continue;
        }

        const existing = geometriesByRouteId.get(route.routeId) || {
            routeId: route.routeId,
            line: route.line,
            shortName: route.shortName,
            longName: route.longName,
            type: route.type,
            isNight: route.isNight,
            directions: [],
        };

        existing.directions.push({
            id: `${route.routeId}:${trip.directionId || trip.headsign || trip.shapeId}`,
            name: trip.headsign || route.longName || route.shortName || route.routeId,
            coordinates,
            stops,
        });

        geometriesByRouteId.set(route.routeId, existing);
    }

    const output = Array.from(geometriesByRouteId.values())
        .filter((entry) => entry.line && entry.directions.length > 0)
        .sort((left, right) => {
            if (left.type !== right.type) {
                return left.type.localeCompare(right.type, 'en');
            }

            return left.line.localeCompare(right.line, 'bg', { numeric: true });
        });

    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(`Generated ${output.length} GTFS route geometries to ${OUTPUT_PATH}`);
};

main();
