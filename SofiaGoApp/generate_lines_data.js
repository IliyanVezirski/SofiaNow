/**
 * Build-time script: fetches lines-data from Sofia Traffic and saves a slim
 * static JSON that can be bundled with the app (avoids CORS issues at runtime).
 *
 * Run: node generate_lines_data.js
 */

const fs = require('fs');
const path = require('path');

const LINES_DATA_URL = 'https://livemap.sofiatraffic.bg/api/lines-data';
const OUTPUT_PATH = path.join(__dirname, 'src', 'data', 'lines-data.static.json');

async function main() {
    console.log('Fetching lines-data from', LINES_DATA_URL, '...');
    const response = await fetch(LINES_DATA_URL);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const linesData = await response.json();
    console.log(`Received ${linesData.length} lines.`);

    const slimStop = (stop) => ({
        id: stop.id,
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
    });

    const slimDirection = (direction) => {
        if (!direction || !Array.isArray(direction.stops) || !direction.stops.length) {
            return null;
        }
        return {
            name: direction.name || '',
            stops: direction.stops.map(slimStop),
        };
    };

    const slim = linesData.map((entry) => ({
        line: entry.line,
        direction0: slimDirection(entry.direction0),
        direction1: slimDirection(entry.direction1),
    }));

    const json = JSON.stringify(slim);
    fs.writeFileSync(OUTPUT_PATH, json, 'utf-8');
    console.log(`Wrote ${slim.length} lines to ${OUTPUT_PATH} (${Math.round(json.length / 1024)} KB)`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
