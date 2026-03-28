// Deep scan sofiatraffic.bg JS bundle for parking/buffer API routes
(async () => {
    const res = await fetch('https://www.sofiatraffic.bg/bg/parking', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await res.text();

    // Get the app.js bundle
    const jsMatch = html.match(/src=["']([^"']*app\.js[^"']*)/);
    if (!jsMatch) { console.log('No app.js found'); return; }
    const jsUrl = 'https://www.sofiatraffic.bg' + jsMatch[1];
    console.log('Fetching:', jsUrl);
    
    const jsRes = await fetch(jsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const js = await jsRes.text();
    console.log('Bundle size:', js.length);

    // Search for all route-like strings containing parking/buffer/garage
    console.log('\n=== Route patterns ===');
    const routePatterns = [...js.matchAll(/["'`](\/[^"'`\s]{2,80}(?:parking|buffer|garage|parkirane)[^"'`\s]{0,80})["'`]/gi)];
    routePatterns.forEach(m => console.log(m[1]));

    // Search for axios/fetch calls with URL patterns
    console.log('\n=== HTTP calls near parking context ===');
    const keywords = ['bufferParking', 'BufferParking', 'buffer_parking', 'buffer-parking', 
                       'parkingLot', 'parking_lot', 'parking-lot', 'parkingGarage',
                       'freeSpaces', 'freePlaces', 'free_spaces', 'free_places',
                       'availableSpaces', 'available_spaces', 'occupancy',
                       'parkingStatus', 'parking_status', 'parkingData', 'parking_data'];
    
    for (const kw of keywords) {
        let idx = -1;
        while ((idx = js.indexOf(kw, idx + 1)) !== -1) {
            const start = Math.max(0, idx - 200);
            const end = Math.min(js.length, idx + 200);
            const context = js.slice(start, end);
            console.log(`\n--- ${kw} at ${idx} ---`);
            console.log(context);
            break; // just first occurrence
        }
    }

    // Search for Laravel-style route naming with parking
    console.log('\n=== Laravel route names with parking ===');
    const laravelRoutes = [...js.matchAll(/["']([a-zA-Z._-]*(?:parking|buffer|garage)[a-zA-Z._-]*)["']/gi)];
    const uniqueRoutes = [...new Set(laravelRoutes.map(m => m[1]))];
    uniqueRoutes.forEach(r => console.log(r));

    // Search for "concat" patterns building URLs with parking
    console.log('\n=== URL building with concat ===');
    const concats = [...js.matchAll(/concat\(["']([^"']*(?:parking|buffer)[^"']*)["']\)/gi)];
    concats.forEach(m => console.log(m[0]));

    // Search for /bg/ routes
    console.log('\n=== /bg/ API routes ===');
    const bgRoutes = [...js.matchAll(/["'](\/bg\/[^"'\s]{3,100})["']/g)];
    const uniqueBg = [...new Set(bgRoutes.map(m => m[1]))].filter(r => 
        r.includes('parking') || r.includes('buffer') || r.includes('garage') || r.includes('api')
    );
    uniqueBg.forEach(r => console.log(r));

    // Look for webportal subdomain
    console.log('\n=== webportal/api references ===');
    const webportal = [...js.matchAll(/["'](https?:\/\/[^"'\s]*(?:webportal|api)[^"'\s]*)["']/gi)];
    [...new Set(webportal.map(m => m[1]))].slice(0, 30).forEach(r => console.log(r));

    // Look for any JSON endpoint patterns 
    console.log('\n=== .json endpoints ===');
    const jsonEndpoints = [...js.matchAll(/["']([^"'\s]*\.json[^"'\s]*)["']/gi)];
    [...new Set(jsonEndpoints.map(m => m[1]))].slice(0, 20).forEach(r => console.log(r));

    // Extract all axios configurations or base URLs
    console.log('\n=== Base URLs / axios config ===');
    const baseUrls = [...js.matchAll(/baseURL\s*[:=]\s*["']([^"']+)["']/gi)];
    baseUrls.forEach(m => console.log(m[1]));
    
    const apiUrls = [...js.matchAll(/["'](https?:\/\/[^"'\s]*(?:api|data|service)[^"'\s]*)["']/gi)];
    [...new Set(apiUrls.map(m => m[1]))].slice(0, 30).forEach(r => console.log(r));

})().catch(console.error);
