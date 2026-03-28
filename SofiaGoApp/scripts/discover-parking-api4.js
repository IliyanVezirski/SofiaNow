// Extract Ziggy routes for parking from sofiatraffic.bg
(async () => {
    const res = await fetch('https://www.sofiatraffic.bg/bg/parking', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await res.text();
    
    // Extract full Ziggy config
    const ziggyMatch = html.match(/\{[^{}]*"url"\s*:\s*"https?:\/\/www\.sofiatraffic\.bg"[^]*?"routes"\s*:\s*\{([^]*?)\}\s*\}/s);
    if (!ziggyMatch) {
        // Try alternative: find the script tag containing Ziggy
        const ziggyScript = html.match(/<script[^>]*>[^]*?({"url"[^]*?"routes"[^]*?})[^]*?<\/script>/s);
        if (ziggyScript) {
            try {
                const ziggy = JSON.parse(ziggyScript[1]);
                const parkingRoutes = Object.entries(ziggy.routes).filter(([k]) => k.includes('parking'));
                console.log('Parking routes from Ziggy:');
                parkingRoutes.forEach(([name, def]) => console.log(`  ${name}:`, JSON.stringify(def)));
            } catch(e) {
                console.log('Parse error, trying substring');
            }
        }
    }

    // Alternative: find all Ziggy-like objects
    const allMatches = [...html.matchAll(/"(parking[^"]*?)"\s*:\s*\{[^}]*?"uri"\s*:\s*"([^"]+)"[^}]*?"methods"\s*:\s*\[([^\]]+)\]/g)];
    console.log('\nParking route URIs:');
    allMatches.forEach(m => console.log(`  ${m[1]}: ${m[3]} ${m[2]}`));

    // Also find parkings.update specifically
    const updateMatch = html.match(/"parkings\.update"\s*:\s*\{[^}]*?\}/);
    if (updateMatch) {
        console.log('\nparkings.update:', updateMatch[0]);
    }
    
    // Try broader search
    const allRoutes = [...html.matchAll(/"([^"]+)"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"\s*,\s*"methods"\s*:\s*\[([^\]]+)\]/g)];
    const parkingRelated = allRoutes.filter(m => m[1].includes('parking') || m[2].includes('parking'));
    console.log('\nAll parking-related routes:');
    parkingRelated.forEach(m => console.log(`  ${m[1]}: [${m[3]}] /${m[2]}`));

    // Now try to call parkings.update
    const csrf = html.match(/meta name="csrf-token" content="([^"]+)"/)?.[1];
    const cookies = (res.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
    const xsrf = decodeURIComponent(cookies.match(/XSRF-TOKEN=([^;]+)/)?.[1] || '');

    // Try the most likely URIs for parkings.update
    const testUris = [
        '/bg/parkings/update',
        '/parkings/update', 
        '/bg/parking/update',
        '/parking/update',
        '/bg/parking/parkings/update',
        '/api/parkings/update',
        '/bg/api/parkings/update',
    ];
    
    const headers = {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-TOKEN': csrf,
        'X-XSRF-TOKEN': xsrf,
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.sofiatraffic.bg/bg/parking',
    };
    
    console.log('\n=== Testing parkings.update URIs ===');
    for (const uri of testUris) {
        try {
            const r = await fetch('https://www.sofiatraffic.bg' + uri, {
                headers,
                redirect: 'manual'
            });
            const ct = r.headers.get('content-type') || '';
            const body = await r.text();
            console.log(`\n${r.status} ${uri} (${ct})`);
            if (r.status < 400 && ct.includes('json')) {
                console.log(body.substring(0, 1000));
            } else if (r.status < 400) {
                console.log(body.substring(0, 200));
            }
        } catch(e) {
            console.log(`ERR ${uri}: ${e.message}`);
        }
    }

})().catch(console.error);
