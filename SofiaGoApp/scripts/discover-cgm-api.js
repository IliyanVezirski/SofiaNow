// Discover CGM trip planner API - find initialPlanData & test
const html_url = 'https://www.sofiatraffic.bg/bg/public-transport';

(async () => {
    const res = await fetch(html_url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const csrfMatch = html.match(/meta name="csrf-token" content="([^"]+)"/);
    const csrf = csrfMatch?.[1];
    const cookies = (res.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-TOKEN': csrf,
        'X-XSRF-TOKEN': decodeURIComponent(cookies.match(/XSRF-TOKEN=([^;]+)/)?.[1] || ''),
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0',
        'Cookie': cookies,
        'Referer': 'https://www.sofiatraffic.bg/bg/trip/search',
    };
    const base = 'https://www.sofiatraffic.bg/bg';

    // Fetch JS bundle
    const scriptRefs = [...html.matchAll(/src=["']([^"']+\.js[^"']*)/g)].map(m => m[1]);
    const jsBundleUrl = `https://www.sofiatraffic.bg${scriptRefs.find(s => s.includes('app.js'))}`;
    const bundleRes = await fetch(jsBundleUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const js = await bundleRes.text();

    // Find initialPlanData method
    const ipIdx = js.indexOf('initialPlanData');
    if (ipIdx > -1) {
        console.log('=== initialPlanData ===');
        console.log(js.slice(ipIdx, ipIdx + 1000));
    }

    // Find the second occurrence (the definition)
    const ipIdx2 = js.indexOf('initialPlanData', ipIdx + 1);
    if (ipIdx2 > -1) {
        console.log('\n=== initialPlanData #2 ===');
        console.log(js.slice(ipIdx2, ipIdx2 + 1000));
    }

    // Search for "arriveBy" to understand the field
    const abIdx = js.indexOf('arriveBy');
    if (abIdx > -1) {
        console.log('\n=== arriveBy context ===');
        console.log(js.slice(Math.max(0, abIdx - 200), abIdx + 300));
    }

    // Find "planType" or "plan_type" or "optimize"
    for (const term of ['planType', 'plan_type', 'optimize', 'less-waiting', 'less-walking', 'less-transfers', 'routeType']) {
        const idx = js.indexOf(term);
        if (idx > -1) {
            console.log(`\n=== ${term} context ===`);
            console.log(js.slice(Math.max(0, idx - 200), idx + 400));
        }
    }

    // Also find where "date" and "time" are set on planData
    const setDateAll = [...js.matchAll(/planData\.date\s*=/g)];
    console.log(`\n=== planData.date assignments: ${setDateAll.length} ===`);
    for (const m of setDateAll.slice(0, 3)) {
        console.log(js.slice(m.index, m.index + 200));
    }

    const setTimeAll = [...js.matchAll(/planData\.time\s*=/g)];
    console.log(`\n=== planData.time assignments: ${setTimeAll.length} ===`);
    for (const m of setTimeAll.slice(0, 3)) {
        console.log(js.slice(m.index, m.index + 200));
    }

    // Now test with OTP-like payload
    console.log('\n\n=== TESTING TRIP API ===');

    const fromRes = await fetch(`${base}/trip/locations`, {
        method: 'POST', headers, body: JSON.stringify({ address: 'Сердика' }),
    });
    const fromLocs = await fromRes.json();
    const toRes = await fetch(`${base}/trip/locations`, {
        method: 'POST', headers, body: JSON.stringify({ address: 'Люлин' }),
    });
    const toLocs = await toRes.json();

    // Based on initialPlanData: type, from, to, time, date, arriveBy, locale
    const payload = {
        type: "0",
        from: { latitude: fromLocs[0].latitude, longitude: fromLocs[0].longitude, name: fromLocs[0].name },
        to: { latitude: toLocs[0].latitude, longitude: toLocs[0].longitude, name: toLocs[0].name },
        date: new Date().toISOString().slice(0, 10),
        time: '10:00',
        arriveBy: false,
        locale: 'bg',
    };

    console.log('Payload:', JSON.stringify(payload));
    const r = await fetch(`${base}/trip/trip`, {
        method: 'POST', headers, body: JSON.stringify(payload),
    });
    const t = await r.text();
    console.log(`\nStatus: ${r.status}`);
    console.log('Response:', t.slice(0, 3000));

    // Also try with time as empty string (like default)
    if (r.status !== 200) {
        const payload2 = { ...payload, time: '' };
        console.log('\n--- Trying with empty time ---');
        const r2 = await fetch(`${base}/trip/trip`, {
            method: 'POST', headers, body: JSON.stringify(payload2),
        });
        const t2 = await r2.text();
        console.log(`Status: ${r2.status}`);
        console.log('Response:', t2.slice(0, 3000));
    }

    // Try with type as number
    if (r.status !== 200) {
        const payload3 = { ...payload, type: 0 };
        console.log('\n--- Trying with numeric type ---');
        const r3 = await fetch(`${base}/trip/trip`, {
            method: 'POST', headers, body: JSON.stringify(payload3),
        });
        const t3 = await r3.text();
        console.log(`Status: ${r3.status}`);
        console.log('Response:', t3.slice(0, 3000));
    }
})();
