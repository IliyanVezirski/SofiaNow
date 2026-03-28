const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Simpler: only named parkings that are NOT currently in the dataset 
// (private access, or customers access, or no name filter but with operator)
const QUERY = `[out:json][timeout:60];
area[name="София"][admin_level=8]->.searchArea;
(
  nwr[amenity=parking][access~"private|customers"][name](area.searchArea);
);
out center;`;

async function main() {
    console.log('Fetching...');
    const resp = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(QUERY),
    });
    if (!resp.ok) {
        console.error('HTTP error:', resp.status);
        return;
    }
    const data = await resp.json();
    const els = data.elements || [];
    console.log('Found', els.length, 'named private/customer parkings');
    
    for (const e of els) {
        const t = e.tags || {};
        const lat = e.type === 'node' ? e.lat : (e.center ? e.center.lat : null);
        const lon = e.type === 'node' ? e.lon : (e.center ? e.center.lon : null);
        console.log(JSON.stringify({
            name: t.name,
            access: t.access,
            operator: t.operator || null,
            capacity: t.capacity || null,
            parking: t.parking || null,
            fee: t.fee || null,
            opening_hours: t.opening_hours || null,
            website: t.website || null,
            phone: t.phone || null,
            lat, lon,
            osmId: e.type + '-' + e.id,
        }));
    }
}

main().catch(console.error);
