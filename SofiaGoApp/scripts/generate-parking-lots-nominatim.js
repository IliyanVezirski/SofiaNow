/**
 * Fetch parking lots in Sofia via Nominatim search + structured query.
 * Fallback when Overpass is down. Uses Nominatim's search endpoint.
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'features', 'parkingZones', 'data', 'parkingLots.generated.json');

// Sofia bounding box: roughly 42.60-42.79 lat, 23.20-23.50 lon
const BBOX = '42.60,23.20,42.79,23.50';

async function nominatimSearch(query, limit = 50) {
    const url = `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=${limit}` +
        `&viewbox=23.20,42.79,23.50,42.60&bounded=1&extratags=1`;
    console.log(`Searching: "${query}"...`);
    const resp = await fetch(url, {
        headers: { 'User-Agent': 'SofiaGoApp/1.0 parking-data-gen' }
    });
    if (!resp.ok) throw new Error(`Nominatim error: ${resp.status}`);
    return resp.json();
}

function classifyCategory(item) {
    const tags = item.extratags || {};
    const name = (item.display_name || '').toLowerCase();
    const nameShort = (item.name || '').toLowerCase();
    
    if (tags.parking === 'impound' || nameShort.includes('наказателен')) return 'impound';
    if (tags.park_ride === 'yes' || nameShort.includes('буферен') || nameShort.includes('park & ride')) return 'buffer';
    if (nameShort.includes('летище') || nameShort.includes('airport')) return 'airport';
    if (tags.parking === 'underground') return 'underground';
    if (tags.parking === 'multi-storey') return 'multi-storey';
    
    const operator = (tags.operator || '').toLowerCase();
    if (operator.includes('център за градска мобилност') || operator.includes('цгм')) return 'buffer';
    
    if (tags.access === 'private' || tags.access === 'no') return 'private';
    if (tags.access === 'customers') return 'commercial';
    
    return 'surface';
}

function parseNominatimResult(item) {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (item.class !== 'amenity' || item.type !== 'parking') return null;
    
    const tags = item.extratags || {};
    const name = item.name || item.display_name?.split(',')[0] || null;
    if (!name) return null;
    
    const capacity = tags.capacity ? parseInt(tags.capacity, 10) : null;
    const maxheight = tags.maxheight ? parseFloat(tags.maxheight) : null;
    
    return {
        id: `osm-${item.osm_type === 'way' ? 'way' : item.osm_type === 'node' ? 'node' : 'relation'}-${item.osm_id}`,
        name,
        latitude: lat,
        longitude: lon,
        category: classifyCategory(item),
        capacity: Number.isFinite(capacity) ? capacity : null,
        fee: tags.fee === 'yes',
        operator: tags.operator || null,
        parkRide: tags.park_ride === 'yes',
        openingHours: tags.opening_hours || null,
        website: tags.website || null,
        phone: tags.phone || null,
        maxheight: Number.isFinite(maxheight) ? maxheight : null,
        surface: tags.surface || null,
    };
}

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function main() {
    const allResults = [];
    
    // Multiple searches to capture different parking types
    const queries = [
        'parking Sofia',
        'паркинг София',
        'подземен паркинг София',
        'буферен паркинг София',
        'наказателен паркинг София',
        'parking mall Sofia',
        'parking garage Sofia',
    ];
    
    for (const q of queries) {
        try {
            const results = await nominatimSearch(q);
            allResults.push(...results);
            console.log(`  Found ${results.length} results`);
            await sleep(1100); // Nominatim asks for 1 req/sec
        } catch (err) {
            console.log(`  Error: ${err.message}`);
        }
    }
    
    console.log(`\nTotal raw results: ${allResults.length}`);
    
    // Parse and deduplicate
    const seen = new Set();
    const parkingLots = [];
    
    for (const item of allResults) {
        const lot = parseNominatimResult(item);
        if (!lot) continue;
        const key = `${lot.name}-${lot.latitude.toFixed(4)}-${lot.longitude.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        parkingLots.push(lot);
    }
    
    parkingLots.sort((a, b) => {
        const order = { buffer: 0, underground: 1, 'multi-storey': 2, airport: 3, surface: 4, commercial: 5, private: 6, impound: 7 };
        const catDiff = (order[a.category] ?? 99) - (order[b.category] ?? 99);
        if (catDiff !== 0) return catDiff;
        return a.name.localeCompare(b.name, 'bg');
    });
    
    const categoryCounts = {};
    for (const lot of parkingLots) {
        categoryCounts[lot.category] = (categoryCounts[lot.category] || 0) + 1;
    }
    
    console.log(`\nParsed ${parkingLots.length} unique parking lots:`);
    for (const [cat, count] of Object.entries(categoryCounts)) {
        console.log(`  ${cat}: ${count}`);
    }
    
    for (const lot of parkingLots) {
        console.log(`  ${lot.category.padEnd(14)} | ${lot.name} (cap: ${lot.capacity ?? '?'})`);
    }
    
    if (process.argv.includes('--write')) {
        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(parkingLots, null, 2), 'utf-8');
        console.log(`\nWritten to ${OUTPUT_PATH}`);
    } else {
        console.log('\n[DRY RUN] Pass --write to save');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
