const fs = require('fs');
const path = require('path');
const { unzipSync, strFromU8 } = require('fflate');

const STATIC_GTFS_URL = 'https://gtfs.sofiatraffic.bg/api/v1/static';
const OUTPUT_PATH = path.join(__dirname, 'src', 'data', 'metroRoutes.static.json');
const METRO_LINES = new Set(['M1', 'M2', 'M3', 'M4']);

const parseCsvRow = (row) => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '"') {
            if (inQuotes && row[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (ch === ',' && !inQuotes) {
            values.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    values.push(current);
    return values;
};

const parseCsv = (csvText) => {
    const lines = csvText.split(/\r?\n/).filter(Boolean);
    if (!lines.length) {
        return { headers: [], rows: [] };
    }

    const headers = parseCsvRow(lines[0]);
    const rows = lines.slice(1).map(parseCsvRow);
    return { headers, rows };
};

(async () => {
    console.log('Downloading GTFS static archive...');
    const response = await fetch(STATIC_GTFS_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch GTFS static: ${response.statusText}`);
    }

    const zipped = new Uint8Array(await response.arrayBuffer());
    console.log(`Downloaded ${(zipped.length / 1024 / 1024).toFixed(1)} MB, extracting...`);

    const files = unzipSync(zipped);
    const routesCsv = strFromU8(files['routes.txt']);
    const tripsCsv = strFromU8(files['trips.txt']);
    const stopTimesCsv = strFromU8(files['stop_times.txt']);
    const stopsCsv = strFromU8(files['stops.txt']);

    const routes = parseCsv(routesCsv);
    const trips = parseCsv(tripsCsv);
    const stopTimes = parseCsv(stopTimesCsv);
    const stops = parseCsv(stopsCsv);

    const routeIdIdx = routes.headers.indexOf('route_id');
    const routeShortNameIdx = routes.headers.indexOf('route_short_name');

    const tripRouteIdIdx = trips.headers.indexOf('route_id');
    const tripIdIdx = trips.headers.indexOf('trip_id');
    const tripDirectionIdIdx = trips.headers.indexOf('direction_id');

    const stopTimeTripIdIdx = stopTimes.headers.indexOf('trip_id');
    const stopTimeStopIdIdx = stopTimes.headers.indexOf('stop_id');
    const stopTimeSeqIdx = stopTimes.headers.indexOf('stop_sequence');

    const stopIdIdx = stops.headers.indexOf('stop_id');
    const stopNameIdx = stops.headers.indexOf('stop_name');
    const stopLatIdx = stops.headers.indexOf('stop_lat');
    const stopLonIdx = stops.headers.indexOf('stop_lon');

    const metroRouteIdToLine = new Map();
    routes.rows.forEach((row) => {
        const routeId = String(row[routeIdIdx] || '').trim().toUpperCase();
        const shortName = String(row[routeShortNameIdx] || '').trim().toUpperCase();
        if (routeId && METRO_LINES.has(shortName)) {
            metroRouteIdToLine.set(routeId, shortName);
        }
    });

    const metroTrips = [];
    const metroTripIds = new Set();

    trips.rows.forEach((row) => {
        const routeId = String(row[tripRouteIdIdx] || '').trim().toUpperCase();
        const line = metroRouteIdToLine.get(routeId);
        if (!line) {
            return;
        }

        const tripId = String(row[tripIdIdx] || '').trim();
        if (!tripId) {
            return;
        }

        metroTrips.push({ tripId, line });
        metroTripIds.add(tripId);
    });

    const stopInfoById = new Map();
    stops.rows.forEach((row) => {
        const id = String(row[stopIdIdx] || '').trim();
        const name = String(row[stopNameIdx] || '').trim();
        const lat = Number(row[stopLatIdx]);
        const lon = Number(row[stopLonIdx]);
        if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
            return;
        }
        stopInfoById.set(id, { id, name, latitude: lat, longitude: lon });
    });

    const stopTimesByTripId = new Map();
    stopTimes.rows.forEach((row) => {
        const tripId = String(row[stopTimeTripIdIdx] || '').trim();
        if (!metroTripIds.has(tripId)) {
            return;
        }

        const stopId = String(row[stopTimeStopIdIdx] || '').trim();
        const seq = Number(row[stopTimeSeqIdx]);
        if (!stopId || !Number.isFinite(seq)) {
            return;
        }

        const existing = stopTimesByTripId.get(tripId);
        if (existing) {
            existing.push({ stopId, seq });
        } else {
            stopTimesByTripId.set(tripId, [{ stopId, seq }]);
        }
    });

    const tripsByLine = new Map();

    metroTrips.forEach(({ tripId, line }) => {
        const stopTimesForTrip = stopTimesByTripId.get(tripId) || [];
        if (!stopTimesForTrip.length) {
            return;
        }

        const sorted = stopTimesForTrip
            .slice()
            .sort((a, b) => a.seq - b.seq)
            .map((entry) => stopInfoById.get(entry.stopId))
            .filter(Boolean);

        if (sorted.length < 2) {
            return;
        }

        const existing = tripsByLine.get(line);
        const tripEntry = {
            tripId,
            stops: sorted,
            startStopId: sorted[0].id,
            endStopId: sorted[sorted.length - 1].id,
        };

        if (existing) {
            existing.push(tripEntry);
        } else {
            tripsByLine.set(line, [tripEntry]);
        }
    });

    const result = {};

    for (const line of METRO_LINES) {
        const candidates = (tripsByLine.get(line) || []).slice().sort((a, b) => b.stops.length - a.stops.length);
        if (!candidates.length) {
            continue;
        }

        const primary = candidates[0];
        const reverse = candidates.find((candidate) => (
            candidate.startStopId === primary.endStopId
            && candidate.endStopId === primary.startStopId
        ));

        let secondary = reverse;
        if (!secondary) {
            secondary = candidates.find((candidate) => (
                candidate.tripId !== primary.tripId
                && (
                    candidate.startStopId !== primary.startStopId
                    || candidate.endStopId !== primary.endStopId
                )
            ));
        }

        const selected = [primary];
        if (secondary) {
            selected.push(secondary);
        }

        const directions = selected.map((trip, idx) => {
            const destination = trip.stops[trip.stops.length - 1]?.name || `Посока ${idx + 1}`;
            return {
                name: `${line} към ${destination}`,
                coordinates: trip.stops.map((s) => [s.longitude, s.latitude]),
                stops: trip.stops,
            };
        });

        if (directions.length) {
            result[line] = {
                line,
                type: 'subway',
                isNight: false,
                directions,
            };
        }
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`Written metro routes to ${OUTPUT_PATH}`);
    console.log('Lines:', Object.keys(result));
})();
