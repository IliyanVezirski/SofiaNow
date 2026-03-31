const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LINES_DATA_PATH = path.join(ROOT, 'src', 'data', 'lines-data.static.json');

// CGM Trip API type codes -> our internal types
const CGM_TYPE_MAP = { 1: 'bus', 2: 'tram', 3: 'subway', 4: 'trolley', 5: 'bus' };

async function fetchCgmLines() {
    console.log('Fetching CGM Trip API lines...');
    const pageRes = await fetch('https://www.sofiatraffic.bg/bg/public-transport', { redirect: 'follow' });
    const html = await pageRes.text();
    const csrfMatch = html.match(/meta\s+name="csrf-token"\s+content="([^"]+)"/i);
    if (!csrfMatch) throw new Error('Failed to extract CSRF token');
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
    return await linesRes.json();
}

async function main() {
    const cgmLines = await fetchCgmLines();
    console.log('CGM returned', cgmLines.length, 'lines');

    // Build two lookups from CGM:
    // 1. ext_id (GTFS route_id like TB34) -> type
    // 2. display name (like "20T") -> type (using CGM's own type)
    const typeByExtId = new Map();
    const typeByDisplayName = new Map();

    cgmLines.forEach(l => {
        const extId = String(l.ext_id || '').trim();
        const name = String(l.name || '').trim().toUpperCase();
        const type = CGM_TYPE_MAP[l.type] || 'bus';
        if (extId) typeByExtId.set(extId, type);
        if (extId) typeByExtId.set(extId.toUpperCase(), type);
        // For display name, store all matches grouped by type
        if (name) {
            if (!typeByDisplayName.has(name)) typeByDisplayName.set(name, []);
            typeByDisplayName.get(name).push({ extId, type });
        }
    });

    // Load lines-data
    const linesData = JSON.parse(fs.readFileSync(LINES_DATA_PATH, 'utf8'));
    console.log('lines-data has', linesData.length, 'entries');

    let enriched = 0;
    linesData.forEach(entry => {
        const ldId = String(entry.line || '').trim();
        const ldIdUpper = ldId.toUpperCase();

        // Strategy 1: direct ext_id match
        if (typeByExtId.has(ldIdUpper)) {
            entry.type = typeByExtId.get(ldIdUpper);
            enriched++;
            return;
        }

        // Strategy 2: extract display line from lines-data ID, match with CGM
        // lines-data ID format: <prefix><displayLine> e.g. A10, TB20T, TM10, AX9, AN4
        const prefixMatch = ldIdUpper.match(/^(TM|TB|A)(.*)/);
        if (!prefixMatch) {
            entry.type = 'bus';
            enriched++;
            return;
        }

        const ldPrefix = prefixMatch[1]; // A, TB, TM
        const displayLine = prefixMatch[2]; // 10, 20T, X9, N4, etc.

        if (!displayLine) {
            entry.type = 'bus';
            enriched++;
            return;
        }

        const cgmMatches = typeByDisplayName.get(displayLine) || [];

        if (cgmMatches.length === 1) {
            // Unambiguous match
            entry.type = cgmMatches[0].type;
            enriched++;
            return;
        }

        if (cgmMatches.length > 1) {
            // Ambiguous: use lines-data prefix to pick the right one
            // TB prefix -> prefer trolley match, TM -> tram, A -> bus
            const prefixPreference = ldPrefix === 'TB' ? 'trolley' : ldPrefix === 'TM' ? 'tram' : 'bus';
            const preferred = cgmMatches.find(m => m.type === prefixPreference);
            if (preferred) {
                entry.type = preferred.type;
            } else {
                // No match for prefix preference -> it's a substitute bus
                entry.type = 'bus';
            }
            enriched++;
            return;
        }

        // No CGM match at all -> not in CGM, so it's a substitute bus
        entry.type = 'bus';
        enriched++;
    });

    fs.writeFileSync(LINES_DATA_PATH, JSON.stringify(linesData), 'utf8');

    // Summary
    const counts = {};
    linesData.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1; });
    console.log('Enriched', enriched, '/', linesData.length, 'entries');
    console.log('Type breakdown:', counts);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
