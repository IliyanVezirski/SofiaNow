const fs = require('fs/promises');
const path = require('path');

const OUTPUT_PATH = path.resolve(__dirname, '../src/features/parkingZones/data/parkingZones.generated.json');

const SOURCES = {
    nmanolov: 'https://raw.githubusercontent.com/nmanolov/sinia-zona/main/src/zones.json',
    yurukov: 'https://raw.githubusercontent.com/yurukov/Bulgaria-geocoding/master/sofiatraffic_subzones.geojson',
};

const parseArgs = () => {
    const args = process.argv.slice(2);
    const options = {
        source: 'merge',
        dryRun: false,
    };

    for (const arg of args) {
        if (arg.startsWith('--source=')) {
            options.source = arg.slice('--source='.length).trim();
            continue;
        }

        if (arg === '--dry-run') {
            options.dryRun = true;
            continue;
        }
    }

    if (!['merge', 'nmanolov', 'yurukov'].includes(options.source)) {
        throw new Error(`Unsupported source "${options.source}". Use merge, nmanolov, or yurukov.`);
    }

    return options;
};

const fetchJson = async (url) => {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'SofiaGo parking zone generator',
            Accept: 'application/json,text/plain,*/*',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    return response.json();
};

const mercatorToWgs84 = ([x, y]) => {
    const lon = (x / 20037508.34) * 180;
    let lat = (y / 20037508.34) * 180;
    lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
    return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
};

const areCoordinatesEqual = (left, right) => (
    Array.isArray(left)
    && Array.isArray(right)
    && left.length >= 2
    && right.length >= 2
    && left[0] === right[0]
    && left[1] === right[1]
);

const normalizeRing = (ring, coordinateTransformer) => {
    const transformed = ring
        .filter((point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]))
        .map((point) => coordinateTransformer(point));

    if (transformed.length < 3) {
        return null;
    }

    const closed = areCoordinatesEqual(transformed[0], transformed[transformed.length - 1])
        ? transformed
        : [...transformed, transformed[0]];

    return closed.length >= 4 ? closed : null;
};

const normalizePolygonGeometry = (geometry, coordinateTransformer) => {
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) {
        return null;
    }

    if (geometry.type === 'Polygon') {
        const rings = geometry.coordinates
            .map((ring) => normalizeRing(ring, coordinateTransformer))
            .filter(Boolean);

        if (!rings.length) {
            return null;
        }

        return {
            type: 'Polygon',
            coordinates: rings,
        };
    }

    const polygons = geometry.coordinates
        .map((polygon) => polygon.map((ring) => normalizeRing(ring, coordinateTransformer)).filter(Boolean))
        .filter((polygon) => polygon.length > 0);

    if (!polygons.length) {
        return null;
    }

    return {
        type: 'MultiPolygon',
        coordinates: polygons,
    };
};

const extractSubzoneNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const match = value.match(/(\d+)/);
    return match ? Number(match[1]) : null;
};

const compareBySubzone = (left, right) => {
    const leftNumber = extractSubzoneNumber(left.name) ?? 0;
    const rightNumber = extractSubzoneNumber(right.name) ?? 0;
    return leftNumber - rightNumber;
};

const normalizeNmanolovFeatures = (collection) => {
    if (!collection || !Array.isArray(collection.features)) {
        throw new Error('nmanolov dataset is not a GeoJSON FeatureCollection');
    }

    const normalized = [];

    for (const feature of collection.features) {
        const subzoneNumber = extractSubzoneNumber(feature?.properties?.name);
        const zoneId = feature?.properties?.color === 'blue' || feature?.properties?.color === 'green'
            ? feature.properties.color
            : null;

        const geometry = normalizePolygonGeometry(feature?.geometry, mercatorToWgs84);
        if (!subzoneNumber || !zoneId || !geometry) {
            continue;
        }

        normalized.push({
            id: `podzona-${subzoneNumber}`,
            zoneId,
            name: `Подзона ${subzoneNumber}`,
            geometry,
        });
    }

    return normalized.sort(compareBySubzone);
};

const buildZoneIdBySubzone = (normalizedNmanolovFeatures) => {
    const zoneIdBySubzone = new Map();

    for (const feature of normalizedNmanolovFeatures) {
        const subzoneNumber = extractSubzoneNumber(feature.name);
        if (subzoneNumber) {
            zoneIdBySubzone.set(subzoneNumber, feature.zoneId);
        }
    }

    return zoneIdBySubzone;
};

const normalizeYurukovFeatures = (collection, zoneIdBySubzone) => {
    if (!collection || !Array.isArray(collection.features)) {
        throw new Error('yurukov dataset is not a GeoJSON FeatureCollection');
    }

    const normalized = [];

    for (const feature of collection.features) {
        const subzoneNumber = extractSubzoneNumber(feature?.properties?.podzona);
        if (!subzoneNumber) {
            continue;
        }

        const zoneId = zoneIdBySubzone.get(subzoneNumber);
        if (!zoneId) {
            continue;
        }

        const geometry = normalizePolygonGeometry(feature?.geometry, (coordinate) => [
            Number(coordinate[0].toFixed(6)),
            Number(coordinate[1].toFixed(6)),
        ]);

        if (!geometry) {
            continue;
        }

        normalized.push({
            id: `podzona-${subzoneNumber}`,
            zoneId,
            name: `Подзона ${subzoneNumber}`,
            geometry,
        });
    }

    return normalized.sort(compareBySubzone);
};

const summarize = (features) => {
    const summary = features.reduce((accumulator, feature) => {
        accumulator.total += 1;
        accumulator[feature.zoneId] += 1;
        return accumulator;
    }, { total: 0, blue: 0, green: 0 });

    return `total=${summary.total}, blue=${summary.blue}, green=${summary.green}`;
};

const main = async () => {
    const options = parseArgs();
    const nmanolovRaw = await fetchJson(SOURCES.nmanolov);
    const nmanolovFeatures = normalizeNmanolovFeatures(nmanolovRaw);

    let outputFeatures = nmanolovFeatures;

    if (options.source === 'merge' || options.source === 'yurukov') {
        const yurukovRaw = await fetchJson(SOURCES.yurukov);
        const zoneIdBySubzone = buildZoneIdBySubzone(nmanolovFeatures);
        outputFeatures = normalizeYurukovFeatures(yurukovRaw, zoneIdBySubzone);
    }

    if (options.dryRun) {
        console.log(`Parking zones dry run (${options.source}): ${summarize(outputFeatures)}`);
        return;
    }

    await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(outputFeatures, null, 2)}\n`, 'utf8');
    console.log(`Generated ${outputFeatures.length} parking zone features to ${OUTPUT_PATH}`);
    console.log(`Summary: ${summarize(outputFeatures)}`);
  };

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});