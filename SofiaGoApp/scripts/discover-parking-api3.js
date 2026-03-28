// Deep dive into parking route context in the JS bundle
(async () => {
    const res = await fetch('https://www.sofiatraffic.bg/bg/parking', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await res.text();
    const jsUrl = 'https://www.sofiatraffic.bg' + html.match(/src=["']([^"']*app\.js[^"']*)/)[1];
    const js = (await (await fetch(jsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text());

    // Find "parkings" or "parkings.update" route definition context
    const terms = ['parkings.update', 'parking.get.cars', 'parkingMap', 'ParkingHero', 
                   'ParkingCuteCard', 'bufferParking', 'buffer-parking', 'BufferParking',
                   'freeSpaces', 'freePlaces', 'free_places', 'availablePlaces',
                   'available_places', 'свободни', 'parkings/'];
    
    for (const term of terms) {
        let idx = js.indexOf(term);
        while (idx !== -1) {
            const start = Math.max(0, idx - 300);
            const end = Math.min(js.length, idx + 400);
            const ctx = js.slice(start, end);
            // Only show if it looks like application code (not library code)
            if (!ctx.includes('prototype') || ctx.includes('route') || ctx.includes('axios') || ctx.includes('fetch')) {
                console.log(`\n========== ${term} @ ${idx} ==========`);
                console.log(ctx);
            }
            const nextIdx = js.indexOf(term, idx + 1);
            if (nextIdx === idx) break;
            idx = nextIdx;
            // Only first 3 occurrences
            if (idx !== -1 && js.indexOf(term) < idx - 5000) break;
        }
    }

    // Also look for the route() helper used in Laravel/Ziggy
    console.log('\n\n========== Ziggy/route helper ==========');
    const ziggyMatch = js.match(/route\s*\(\s*["']parking[^)]{0,200}\)/g);
    if (ziggyMatch) {
        ziggyMatch.forEach(m => console.log(m));
    }
    
    // Look for the routes definition object (Ziggy puts routes in window.Ziggy)
    const ziggyIdx = js.indexOf('Ziggy');
    if (ziggyIdx > -1) {
        console.log('\n========== Ziggy config ==========');
        console.log(js.slice(ziggyIdx, ziggyIdx + 500));
    }

    // Search for route definitions in the HTML itself (Ziggy often injects routes there)
    console.log('\n========== Ziggy in HTML ==========');
    const ziggyHtml = html.match(/Ziggy\s*=\s*(\{[^;]*\})/s);
    if (ziggyHtml) {
        console.log(ziggyHtml[1].substring(0, 2000));
    }
    
    // Also look for @routes blade directive output
    const routesScript = html.match(/"routes"\s*:\s*\{([^}]*parking[^}]*)\}/);
    if (routesScript) {
        console.log('\nRoutes with parking:', routesScript[0].substring(0, 2000));
    }

    // Find all URLs in the HTML that start with /bg/parking or /parking
    console.log('\n========== Parking URLs in HTML ==========');
    const htmlUrls = [...html.matchAll(/["'](\/[^"'\s]*parking[^"'\s]*)["']/gi)];
    [...new Set(htmlUrls.map(m => m[1]))].forEach(u => console.log(u));

})().catch(console.error);
