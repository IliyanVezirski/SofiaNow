// Discover parking availability API from sofiatraffic.bg
(async () => {
    const res = await fetch('https://www.sofiatraffic.bg/bg/parking', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await res.text();
    const csrfMatch = html.match(/meta name="csrf-token" content="([^"]+)"/);
    const csrf = csrfMatch?.[1];
    const allCookies = (res.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
    console.log('CSRF:', csrf?.substring(0, 20) + '...');
    console.log('Cookies:', allCookies.substring(0, 80) + '...');

    // Extract JS bundle URLs
    const scriptRefs = [...html.matchAll(/src=["']([^"']+\.js[^"']*)/g)].map(m => m[1]);
    console.log('\nScripts found:', scriptRefs.length);
    scriptRefs.forEach(s => console.log('  ', s));

    // Search the app JS bundle for parking API routes
    for (const ref of scriptRefs) {
        if (!ref.includes('app') && !ref.includes('parking')) continue;
        const url = ref.startsWith('http') ? ref : 'https://www.sofiatraffic.bg' + ref;
        console.log('\nFetching bundle:', url);
        const jsRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const js = await jsRes.text();
        console.log('Bundle size:', js.length);
        
        // Find all URL-like patterns with "parking" or "buffer"
        const urlPatterns = [...js.matchAll(/["']([^"']*(?:parking|buffer|garage|freePlaces|freeSpaces|available)[^"']*?)["']/gi)];
        console.log('\nURL patterns with parking/buffer:');
        urlPatterns.slice(0, 30).forEach(m => console.log('  ', m[1]));

        // Also search for fetch/axios calls near parking
        const parkingContexts = [...js.matchAll(/(?:fetch|axios|get|post|put)\s*\(\s*["']([^"']+)['"]/gi)];
        console.log('\nAPI calls found:');
        parkingContexts.slice(0, 20).forEach(m => console.log('  ', m[1]));
    }

    // Try common API patterns
    console.log('\n=== Testing common API patterns ===');
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-TOKEN': csrf,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0',
        'Cookie': allCookies,
        'Referer': 'https://www.sofiatraffic.bg/bg/parking',
    };
    
    const xsrf = allCookies.match(/XSRF-TOKEN=([^;]+)/)?.[1];
    if (xsrf) headers['X-XSRF-TOKEN'] = decodeURIComponent(xsrf);

    const testUrls = [
        'https://www.sofiatraffic.bg/api/parking',
        'https://www.sofiatraffic.bg/api/parking/buffer',
        'https://www.sofiatraffic.bg/api/parking/available',
        'https://www.sofiatraffic.bg/api/buffer-parkings',
        'https://www.sofiatraffic.bg/bg/api/parking',
        'https://www.sofiatraffic.bg/bg/parking/api/buffer',
        'https://www.sofiatraffic.bg/bg/parking/buffer-parkings',
        'https://www.sofiatraffic.bg/parking/data',
        'https://www.sofiatraffic.bg/bg/parking/data',
    ];
    
    for (const url of testUrls) {
        try {
            const r = await fetch(url, { headers, redirect: 'manual' });
            const ct = r.headers.get('content-type') || '';
            const status = r.status;
            const body = await r.text();
            const preview = body.substring(0, 200);
            console.log(`\n${status} ${url}`);
            console.log(`  CT: ${ct}`);
            if (status < 400) console.log(`  Body: ${preview}`);
        } catch (e) {
            console.log(`ERR ${url}: ${e.message}`);
        }
    }
})().catch(console.error);
