/**
 * Fetch named parking lots in Sofia from OpenStreetMap via Overpass API
 * and write a generated JSON file consumed by the app.
 *
 * Usage:
 *   node scripts/generate-parking-lots.js
 *   node scripts/generate-parking-lots.js --dry-run
 */

const fs = require('fs');
const path = require('path');

const OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const OVERPASS_REQUEST_TIMEOUT_MS = 20_000;
const SOFIA_BBOXES = [
        [42.60, 23.20, 42.67, 23.30],
        [42.60, 23.30, 42.67, 23.40],
        [42.60, 23.40, 42.67, 23.50],
        [42.67, 23.20, 42.73, 23.30],
        [42.67, 23.30, 42.73, 23.40],
        [42.67, 23.40, 42.73, 23.50],
        [42.73, 23.20, 42.79, 23.35],
        [42.73, 23.35, 42.79, 23.50],
];

const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'features', 'parkingZones', 'data', 'parkingLots.generated.json');

const isDryRun = process.argv.includes('--dry-run');

function buildQueryForBBox([south, west, north, east]) {
        return `[out:json][timeout:35];
(
    nwr[amenity=parking][fee=yes](${south},${west},${north},${east});
    nwr[amenity=parking][charge](${south},${west},${north},${east});
);
out center;`;
}

function classifyCategory(tags) {
    if (tags.parking === 'impound') return 'impound';
    if (tags.park_ride === 'yes') return 'buffer';
    const name = (tags.name || '').toLowerCase();
    const nameEn = (tags['name:en'] || '').toLowerCase();
    if (name.includes('буферен') || name.includes('park & ride') || name.includes('park_ride')) return 'buffer';
    if (name.includes('летище') || name.includes('airport') || name.includes('aeroport') || nameEn.includes('airport')) return 'airport';
    if (tags.parking === 'underground') return 'underground';
    if (tags.parking === 'multi-storey') return 'multi-storey';
    const operator = (tags.operator || '').toLowerCase();
    if (operator.includes('център за градска мобилност') || operator.includes('цгм')) {
        if (tags.parking === 'underground') return 'underground';
        return 'buffer';
    }
    if (tags.access === 'private' || tags.access === 'no') return 'private';
    if (tags.access === 'customers') return 'commercial';
    return 'surface';
}

function parseElement(el) {
    const tags = el.tags || {};
    const isPaidParking = tags.fee === 'yes' || !!tags.charge;
    if (!isPaidParking) return null;

    let lat, lon;
    if (el.type === 'node') {
        lat = el.lat;
        lon = el.lon;
    } else if (el.center) {
        lat = el.center.lat;
        lon = el.center.lon;
    } else {
        return null;
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const operator = (tags.operator || '').trim();
    const normalizedOperator = operator.toLowerCase();
    let name = tags.name || tags['name:en'] || null;
    if (!name) {
        if (normalizedOperator.includes('център за градска мобилност') || normalizedOperator === 'цгм') {
            return null;
        }

        if (operator) {
            name = /паркинг|parking/i.test(operator) ? operator : `${operator} паркинг`;
        } else {
            return null;
        }
    }

    const capacity = tags.capacity ? parseInt(tags.capacity, 10) : null;
    const maxheight = tags.maxheight ? parseFloat(tags.maxheight) : null;

    return {
        id: `osm-${el.type}-${el.id}`,
        name,
        latitude: lat,
        longitude: lon,
        category: classifyCategory(tags),
        capacity: Number.isFinite(capacity) ? capacity : null,
        fee: true,
        charge: tags.charge || null,
        operator: operator || null,
        parkRide: tags.park_ride === 'yes',
        openingHours: tags.opening_hours || null,
        website: tags.website || null,
        phone: tags.phone || null,
        maxheight: Number.isFinite(maxheight) ? maxheight : null,
        surface: tags.surface || null,
    };
}

async function fetchWithFallback(query) {
    for (const url of OVERPASS_URLS) {
        try {
            console.log(`Trying ${url}...`);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), OVERPASS_REQUEST_TIMEOUT_MS);
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `data=${encodeURIComponent(query)}`,
                signal: controller.signal,
            });
            clearTimeout(timeout);
            if (!resp.ok) {
                console.log(`  HTTP ${resp.status}, trying next...`);
                continue;
            }
            const data = await resp.json();
            console.log(`  Success from ${url}`);
            return data;
        } catch (err) {
            console.log(`  Failed: ${err.message}, trying next...`);
        }
    }
    throw new Error('All Overpass endpoints failed');
}

async function fetchAllParkingElements() {
    const allElements = [];

    for (let index = 0; index < SOFIA_BBOXES.length; index += 1) {
        const bbox = SOFIA_BBOXES[index];
        console.log(`Fetching parking lots for bbox ${index + 1}/${SOFIA_BBOXES.length}: ${bbox.join(', ')}`);
        const data = await fetchWithFallback(buildQueryForBBox(bbox));
        allElements.push(...(data.elements || []));
    }

    return allElements;
}

async function main() {
    console.log('Fetching parking lots from Overpass API...');
    const elements = await fetchAllParkingElements();
    console.log(`Received ${elements.length} raw elements`);

    const parkingLots = elements
        .map(parseElement)
        .filter(Boolean)
        // Remove duplicates by name+rough coordinates
        .reduce((acc, lot) => {
            const key = `${lot.name}-${lot.latitude.toFixed(4)}-${lot.longitude.toFixed(4)}`;
            if (!acc.seen.has(key)) {
                acc.seen.add(key);
                acc.items.push(lot);
            }
            return acc;
        }, { seen: new Set(), items: [] })
        .items
        .sort((a, b) => {
            // Sort: buffer first, then underground, then rest alphabetically
            const order = { buffer: 0, underground: 1, 'multi-storey': 2, airport: 3, surface: 4, commercial: 5, private: 6, impound: 7 };
            const catDiff = (order[a.category] ?? 99) - (order[b.category] ?? 99);
            if (catDiff !== 0) return catDiff;
            return a.name.localeCompare(b.name, 'bg');
        });

    const categoryCounts = {};
    for (const lot of parkingLots) {
        categoryCounts[lot.category] = (categoryCounts[lot.category] || 0) + 1;
    }

    console.log(`Parsed ${parkingLots.length} parking lots:`);
    for (const [cat, count] of Object.entries(categoryCounts)) {
        console.log(`  ${cat}: ${count}`);
    }
    console.log(`  with charge: ${parkingLots.filter((lot) => !!lot.charge).length}`);
    console.log(`  with openingHours: ${parkingLots.filter((lot) => !!lot.openingHours).length}`);
    console.log(`  with operator: ${parkingLots.filter((lot) => !!lot.operator).length}`);

    if (isDryRun) {
        console.log('\n[DRY RUN] Would write to:', OUTPUT_PATH);
        console.log('\nSample entries:');
        parkingLots.slice(0, 5).forEach(l => console.log(`  ${l.name} (${l.category}, cap: ${l.capacity ?? '?'})`));
        return;
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(parkingLots, null, 2), 'utf-8');
    console.log(`Written ${parkingLots.length} parking lots to ${OUTPUT_PATH}`);
}

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
