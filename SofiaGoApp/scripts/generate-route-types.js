const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GTFS_DIR = path.join(ROOT, 'gtfs_static');
const OUTPUT_PATH = path.join(ROOT, 'src', 'data', 'routeTypes.static.json');

// CGM Trip API type codes -> our internal types
const CGM_TYPE_MAP = { 1: 'bus', 2: 'tram', 3: 'subway', 4: 'trolley', 5: 'bus' };

// GTFS route_type fallback
const GTFS_TYPE_MAP = { 0: 'tram', 1: 'subway', 3: 'bus', 11: 'trolley' };

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

async function fetchCgmTypes() {
    console.log('Fetching CGM Trip API line types...');
    const pageRes = await fetch('https://www.sofiatraffic.bg/bg/public-transport', { redirect: 'follow' });
    const html = await pageRes.text();
    const csrfMatch = html.match(/meta\s+name="csrf-token"\s+content="([^"]+)"/i);
    if (!csrfMatch) throw new Error('Failed to extract CSRF token from sofiatraffic.bg');
    const csrf = csrfMatch[1];
    const rawCookies = pageRes.headers.getSetCookie ? pageRes.headers.getSetCookie() : [];
    const cookieStr = rawCookies.map(c => c.split(';')[0]).join('; ');

    const linesRes = await fetch('https://www.sofiatraffic.bg/bg/trip/getLines', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrf,
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': cookieStr,
            'Referer': 'https://www.sofiatraffic.bg/bg/public-transport',
        },
        body: JSON.stringify({}),
    });
    const lines = await linesRes.json();

    // Map ext_id (= GTFS route_id) -> CGM type
    const cgmTypeByRouteId = {};
    for (const line of lines) {
        const extId = String(line.ext_id || '').trim();
        const mapped = CGM_TYPE_MAP[line.type];
        if (extId && mapped) {
            cgmTypeByRouteId[extId] = mapped;
        }
    }
    console.log(`CGM API returned ${lines.length} lines, mapped ${Object.keys(cgmTypeByRouteId).length} route types`);
    return cgmTypeByRouteId;
}

function loadGtfsFallback() {
    const routesPath = path.join(GTFS_DIR, 'routes.txt');
    if (!fs.existsSync(routesPath)) return {};
    const raw = fs.readFileSync(routesPath, 'utf8');
    const rows = raw.split(/\r?\n/).filter(Boolean);
    const headerCols = splitCsvLine(rows[0]);
    const routeIdIdx = headerCols.indexOf('route_id');
    const routeTypeIdx = headerCols.indexOf('route_type');
    const result = {};
    for (let i = 1; i < rows.length; i++) {
        const cols = splitCsvLine(rows[i]);
        const routeId = cols[routeIdIdx];
        const routeType = Number(cols[routeTypeIdx]);
        const mapped = GTFS_TYPE_MAP[routeType];
        if (routeId && mapped) result[routeId] = mapped;
    }
    return result;
}

async function main() {
    const gtfsTypes = loadGtfsFallback();
    let cgmTypes = {};
    try {
        cgmTypes = await fetchCgmTypes();
    } catch (err) {
        console.warn('CGM API fetch failed, using GTFS only:', err.message);
    }

    // Merge: CGM is authoritative, GTFS fills gaps.
    // Routes absent from CGM with TB/TM/A prefix are substitute bus services.
    const result = {};
    const allRouteIds = new Set([...Object.keys(gtfsTypes), ...Object.keys(cgmTypes)]);
    for (const routeId of allRouteIds) {
        if (cgmTypes[routeId]) {
            result[routeId] = cgmTypes[routeId];
        } else if (Object.keys(cgmTypes).length > 0) {
            // Route not in CGM -> likely a substitute line, default to bus
            // unless it's a metro route (M prefix) which is always metro
            result[routeId] = routeId.startsWith('M') ? 'subway' : 'bus';
        } else {
            result[routeId] = gtfsTypes[routeId];
        }
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8');

    const counts = {};
    Object.values(result).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    console.log(`Generated ${Object.keys(result).length} route type mappings to ${OUTPUT_PATH}`);
    console.log('Breakdown:', counts);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
