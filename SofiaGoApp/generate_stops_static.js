const fs = require('fs');
const path = require('path');
const https = require('https');

const LINES_DATA_URL = 'https://livemap.sofiatraffic.bg/api/lines-data';
const OUTPUT_PATH = path.join(__dirname, 'src', 'data', 'stops.static.json');

const normalizeLine = (lineId) => {
    const rawLine = String(lineId || '').trim();

    if (rawLine.startsWith('TM')) {
        return `${rawLine.slice(2)}ТМ`;
    }

    if (rawLine.startsWith('TB')) {
        return `${rawLine.slice(2)}ТБ`;
    }

    if (rawLine.startsWith('M')) {
        return `М${rawLine.slice(1)}`;
    }

    if (rawLine.startsWith('A')) {
        return rawLine.slice(1);
    }

    return rawLine || 'Unknown';
};

const sortBg = (values, numeric = false) => values.sort((left, right) => left.localeCompare(right, 'bg', { numeric }));

const getDirectionLabel = (line, direction) => {
    const explicitDirectionName = typeof direction?.name === 'string' ? direction.name.trim() : '';
    const destinationStopName = Array.isArray(direction?.stops) && direction.stops.length
        ? String(direction.stops[direction.stops.length - 1]?.name || '').trim()
        : '';
    const destination = explicitDirectionName || destinationStopName;
    return destination ? `${line} към ${destination}` : line;
};

https.get(LINES_DATA_URL, (response) => {
    let data = '';

    response.on('data', (chunk) => {
        data += chunk;
    });

    response.on('end', () => {
        const linesData = JSON.parse(data);
        const stopIndex = new Map();

        linesData.forEach((lineData) => {
            const line = normalizeLine(lineData.line);

            ['direction0', 'direction1'].forEach((directionKey) => {
                const direction = lineData[directionKey];
                if (!direction || !Array.isArray(direction.stops)) {
                    return;
                }

                const directionLabel = getDirectionLabel(line, direction);

                direction.stops.forEach((stop) => {
                    if (!stop || !stop.id) {
                        return;
                    }

                    const existing = stopIndex.get(stop.id);
                    if (existing) {
                        existing.lines.add(line);
                        existing.directions.add(directionLabel);
                        return;
                    }

                    stopIndex.set(stop.id, {
                        id: String(stop.id),
                        name: String(stop.name || stop.id),
                        latitude: Number(stop.latitude),
                        longitude: Number(stop.longitude),
                        lines: new Set([line]),
                        directions: new Set([directionLabel]),
                    });
                });
            });
        });

        const stops = Array.from(stopIndex.values())
            .map((stop) => ({
                id: stop.id,
                name: stop.name,
                latitude: stop.latitude,
                longitude: stop.longitude,
                lines: sortBg(Array.from(stop.lines), true),
                directions: sortBg(Array.from(stop.directions)),
            }))
            .filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude))
            .sort((left, right) => left.name.localeCompare(right.name, 'bg'));

        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(stops, null, 2), 'utf8');
        console.log(`Wrote ${stops.length} stops to ${OUTPUT_PATH}`);
    });
}).on('error', (error) => {
    console.error(error);
    process.exit(1);
});