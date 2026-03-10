const https = require('https');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const fetchPositions = () => {
    https.get('https://gtfs.sofiatraffic.bg/api/v1/vehicle-positions', (res) => {
        let data = [];
        res.on('data', chunk => data.push(chunk));
        res.on('end', () => {
            const buffer = Buffer.concat(data);
            try {
                const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
                console.log("Total entities:", feed.entity.length);
                if (feed.entity.length > 0) {
                    // Print the first 3
                    for (let i = 0; i < Math.min(3, feed.entity.length); i++) {
                        const entity = feed.entity[i];
                        console.log(JSON.stringify(entity, null, 2));
                    }
                }
            } catch (e) {
                console.error("error", e);
            }
        });
    }).on('error', err => console.log('Error: ', err.message));
};

fetchPositions();
