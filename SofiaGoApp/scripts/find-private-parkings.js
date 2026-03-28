const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const QUERY = `[out:json][timeout:30];
area[name="София"][admin_level=8]->.searchArea;
(
  nwr[amenity=parking][access=private](area.searchArea);
  nwr[amenity=parking][access=customers](area.searchArea);
  nwr[amenity=parking][parking=underground](area.searchArea);
  nwr[amenity=parking][operator](area.searchArea);
);
out center;`;

async function main() {
    const resp = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(QUERY),
    });
    const data = await resp.json();
    const els = data.elements || [];
    console.log('Total elements:', els.length);

    const named = els.filter(e => e.tags && e.tags.name);
    const unnamed = els.filter(e => !e.tags || !e.tags.name);
    console.log('Named:', named.length, 'Unnamed:', unnamed.length);

    const cats = {};
    for (const e of named) {
        const a = e.tags.access || 'none';
        cats[a] = (cats[a] || 0) + 1;
    }
    console.log('Named by access:', JSON.stringify(cats));

    const interesting = named.filter(e => e.tags.access === 'private' || e.tags.access === 'customers');
    console.log('\nNamed private/customers (' + interesting.length + '):');
    for (const e of interesting) {
        const t = e.tags;
        const lat = e.type === 'node' ? e.lat : (e.center ? e.center.lat : null);
        const lon = e.type === 'node' ? e.lon : (e.center ? e.center.lon : null);
        console.log('  ' + t.name + ' | access=' + t.access + ' | op=' + (t.operator || '-') + ' | cap=' + (t.capacity || '-') + ' | parking=' + (t.parking || '-') + ' | (' + lat + ', ' + lon + ')');
    }

    // Show all named that are NOT in existing dataset
    console.log('\nAll named parkings (' + named.length + '):');
    for (const e of named) {
        const t = e.tags;
        const lat = e.type === 'node' ? e.lat : (e.center ? e.center.lat : null);
        const lon = e.type === 'node' ? e.lon : (e.center ? e.center.lon : null);
        console.log('  ' + t.name + ' | access=' + (t.access || '-') + ' | op=' + (t.operator || '-') + ' | cap=' + (t.capacity || '-') + ' | parking=' + (t.parking || '-') + ' | fee=' + (t.fee || '-') + ' | (' + lat + ', ' + lon + ')');
    }

    // Show unnamed that have useful info
    const unnamedWithOp = unnamed.filter(e => e.tags && (e.tags.operator || e.tags.capacity));
    console.log('\nUnnamed with operator/capacity (' + unnamedWithOp.length + '):');
    for (const e of unnamedWithOp.slice(0, 20)) {
        const t = e.tags;
        const lat = e.type === 'node' ? e.lat : (e.center ? e.center.lat : null);
        const lon = e.type === 'node' ? e.lon : (e.center ? e.center.lon : null);
        console.log('  op=' + (t.operator || '-') + ' | access=' + (t.access || '-') + ' | cap=' + (t.capacity || '-') + ' | parking=' + (t.parking || '-') + ' | fee=' + (t.fee || '-') + ' | (' + lat + ', ' + lon + ')');
    }
}

main().catch(console.error);
