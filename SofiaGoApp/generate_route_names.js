const fs = require('fs');
const path = require('path');
const { unzipSync, strFromU8 } = require('fflate');

const STATIC_GTFS_URL = 'https://gtfs.sofiatraffic.bg/api/v1/static';
const OUTPUT_PATH = path.join(__dirname, 'src', 'data', 'routeNames.static.json');

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

(async () => {
    console.log('Downloading GTFS static archive...');
    const response = await fetch(STATIC_GTFS_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const buf = new Uint8Array(await response.arrayBuffer());
    console.log(`Downloaded ${(buf.length / 1024 / 1024).toFixed(1)} MB, extracting...`);

    const files = unzipSync(buf);
    const csv = strFromU8(files['routes.txt']);
    const lines = csv.split(/\r?\n/).filter(Boolean);
    const headers = parseCsvRow(lines[0]);
    const idIdx = headers.indexOf('route_id');
    const snIdx = headers.indexOf('route_short_name');

    if (idIdx < 0 || snIdx < 0) {
        throw new Error('Missing route_id or route_short_name columns in routes.txt');
    }

    const map = {};
    for (const line of lines.slice(1)) {
        const cols = parseCsvRow(line);
        const id = (cols[idIdx] || '').trim().toUpperCase();
        const shortName = (cols[snIdx] || '').trim();
        if (id && shortName) {
            map[id] = shortName;
        }
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(map, null, 2));
    console.log(`Written ${Object.keys(map).length} route mappings to ${OUTPUT_PATH}`);
})();
