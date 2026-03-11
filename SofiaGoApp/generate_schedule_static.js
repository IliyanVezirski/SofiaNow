/**
 * Generates src/data/schedule.static.json from GTFS static feed.
 *
 * Structure:  { [stopId]: { [key: "routeId|headsign"]: string[] } }
 *   where string[] = sorted arrival times like ["05:32","05:47",...]
 *
 * Run:  node generate_schedule_static.js
 *   Optional:  node generate_schedule_static.js 20260311
 *   (pass a YYYYMMDD date, defaults to today)
 */
const fs = require('fs');
const path = require('path');
const yauzl = require('yauzl');
const https = require('https');

const GTFS_STATIC_URL = 'https://gtfs.sofiatraffic.bg/api/v1/static';
const ZIP_PATH = path.join(__dirname, 'gtfs_static.zip');
const OUTPUT_PATH = path.join(__dirname, 'src', 'data', 'schedule.static.json');

const today = process.argv[2] || new Date().toISOString().slice(0, 10).replace(/-/g, '');
console.log('Target date:', today);

/* ── helpers ───────────────────────────────────────────────── */

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(dest)) {
            const age = Date.now() - fs.statSync(dest).mtimeMs;
            if (age < 12 * 3600 * 1000) {
                console.log('Using cached ZIP (less than 12 h old)');
                return resolve();
            }
        }
        console.log('Downloading GTFS static feed …');
        const file = fs.createWriteStream(dest);
        https.get(url, (res) => {
            res.pipe(file);
            file.on('finish', () => { file.close(); console.log('Download complete'); resolve(); });
        }).on('error', (e) => { fs.unlinkSync(dest); reject(e); });
    });
}

function readCsvFromZip(zipPath, fileName) {
    return new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
            if (err) return reject(err);
            zip.readEntry();
            zip.on('entry', (entry) => {
                if (entry.fileName === fileName) {
                    zip.openReadStream(entry, (err2, stream) => {
                        if (err2) return reject(err2);
                        let data = '';
                        stream.on('data', (c) => (data += c));
                        stream.on('end', () => {
                            const lines = data.split(/\r?\n/).filter(Boolean);
                            const header = lines[0].split(',');
                            const rows = [];
                            for (let i = 1; i < lines.length; i++) {
                                const vals = lines[i].split(',');
                                const row = {};
                                header.forEach((h, idx) => (row[h] = vals[idx] || ''));
                                rows.push(row);
                            }
                            resolve(rows);
                        });
                    });
                } else {
                    zip.readEntry();
                }
            });
            zip.on('end', () => resolve([]));
        });
    });
}

/* ── routeNames (reuse existing bundled data for display names) ── */

const bundledRouteNames = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'src', 'data', 'routeNames.static.json'), 'utf8')
);
const resolveLineName = (routeId) => {
    const key = String(routeId || '').trim().toUpperCase();
    return bundledRouteNames[key] || key.replace(/^A/, '');
};

/* ── main ──────────────────────────────────────────────────── */

(async () => {
    await downloadFile(GTFS_STATIC_URL, ZIP_PATH);

    console.log('Parsing calendar_dates.txt …');
    const calRows = await readCsvFromZip(ZIP_PATH, 'calendar_dates.txt');
    const activeServiceIds = new Set();
    calRows.forEach((r) => {
        if (r.date === today && r.exception_type === '1') activeServiceIds.add(r.service_id);
    });
    console.log(`Active service IDs for ${today}: ${activeServiceIds.size}`);

    if (activeServiceIds.size === 0) {
        console.error('No active services for this date — is the date correct?');
        process.exit(1);
    }

    console.log('Parsing trips.txt …');
    const tripRows = await readCsvFromZip(ZIP_PATH, 'trips.txt');
    // tripId → { routeId, headsign }
    const tripInfo = new Map();
    tripRows.forEach((r) => {
        if (activeServiceIds.has(r.service_id)) {
            tripInfo.set(r.trip_id, {
                routeId: r.route_id,
                headsign: (r.trip_headsign || '').trim(),
            });
        }
    });
    console.log(`Active trips: ${tripInfo.size}`);

    console.log('Parsing stop_times.txt (this may take a moment) …');
    const stRows = await readCsvFromZip(ZIP_PATH, 'stop_times.txt');
    console.log(`Total stop_time rows: ${stRows.length}`);

    // Build index:  stopId → Map<"routeId|headsign", Set<"HH:MM">>
    const index = new Map();
    let matched = 0;
    stRows.forEach((r) => {
        const trip = tripInfo.get(r.trip_id);
        if (!trip) return;
        matched++;
        const stopId = r.stop_id;
        const time = (r.arrival_time || r.departure_time || '').trim();
        if (!time) return;
        // Normalize time: "06:30:00" → "06:30", handle "25:01:00" correctly
        const hhmm = time.slice(0, 5);

        const key = `${trip.routeId}|${trip.headsign}`;
        if (!index.has(stopId)) index.set(stopId, new Map());
        const stopMap = index.get(stopId);
        if (!stopMap.has(key)) stopMap.set(key, new Set());
        stopMap.get(key).add(hhmm);
    });
    console.log(`Matched stop_times: ${matched}, stops with schedule: ${index.size}`);

    // Convert to output JSON
    // Times stored as minutes-since-midnight integers for compactness
    const output = {};
    for (const [stopId, routeMap] of index) {
        const entries = {};
        for (const [key, timesSet] of routeMap) {
            const times = Array.from(timesSet)
                .map((hhmm) => {
                    const [h, m] = hhmm.split(':').map(Number);
                    return h * 60 + m;
                })
                .sort((a, b) => a - b);
            entries[key] = times;
        }
        output[stopId] = entries;
    }

    const json = JSON.stringify(output);
    fs.writeFileSync(OUTPUT_PATH, json, 'utf8');
    const sizeMB = (Buffer.byteLength(json) / (1024 * 1024)).toFixed(2);
    console.log(`\nWrote ${OUTPUT_PATH}`);
    console.log(`  Stops: ${Object.keys(output).length}`);
    console.log(`  Size: ${sizeMB} MB`);
})();
