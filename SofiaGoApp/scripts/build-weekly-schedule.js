const fs = require('fs');

// 1) Parse calendar_dates -> service_id -> Set<dayOfWeek>
const calLines = fs.readFileSync('gtfs_static/calendar_dates.txt', 'utf8').split('\n');
const serviceDays = {};
for (let i = 1; i < calLines.length; i++) {
  const p = calLines[i].split(',');
  if (p.length < 3) continue;
  const sid = p[0], d = p[1];
  const dt = new Date(d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8));
  if (!serviceDays[sid]) serviceDays[sid] = new Set();
  serviceDays[sid].add(dt.getUTCDay());
}

function getDayTypes(sid) {
  const days = serviceDays[sid];
  if (!days) return [];
  const types = [];
  if (days.has(1) || days.has(2) || days.has(3) || days.has(4) || days.has(5)) types.push('w');
  if (days.has(6)) types.push('s');
  if (days.has(0)) types.push('u');
  return types;
}

console.log('Service IDs loaded:', Object.keys(serviceDays).length);

// 2) Parse trips -> trip_id -> {route, service, headsign}
const tripLines = fs.readFileSync('gtfs_static/trips.txt', 'utf8').split('\n');
const trips = {};
for (let i = 1; i < tripLines.length; i++) {
  const p = tripLines[i].split(',');
  if (p.length < 4) continue;
  trips[p[0]] = { route: p[1], service: p[2], headsign: p[3] || '' };
}
console.log('Trips loaded:', Object.keys(trips).length);

// 3) Parse stop_times and build schedule
// Structure: { stopId: { routeKey: { w:[], s:[], u:[] } } }
const schedule = {};

// Also collect stop_sequence per trip to derive canonical stop order per route|destination
// tripStops: { tripId: [ { stopId, seq } ] }
const tripStops = {};

const stData = fs.readFileSync('gtfs_static/stop_times.txt', 'utf8');
const stLines = stData.split('\n');
console.log('stop_times lines:', stLines.length);

for (let i = 1; i < stLines.length; i++) {
  const p = stLines[i].split(',');
  if (p.length < 5) continue;
  const tripId = p[0], arrTime = p[1], stopId = p[3], stopSeq = parseInt(p[4]) || 0;
  const trip = trips[tripId];
  if (!trip) continue;

  const tp = arrTime.split(':');
  const mins = parseInt(tp[0]) * 60 + parseInt(tp[1]);
  if (isNaN(mins)) continue;

  const dayTypes = getDayTypes(trip.service);
  if (!dayTypes.length) continue;

  const key = trip.route + '|' + trip.headsign;

  if (!schedule[stopId]) schedule[stopId] = {};
  if (!schedule[stopId][key]) schedule[stopId][key] = { w: [], h: [] };

  for (const dt of dayTypes) {
    if (dt === 'w') schedule[stopId][key].w.push(mins);
    else schedule[stopId][key].h.push(mins);
  }

  // Track stop sequence for this trip
  if (!tripStops[tripId]) tripStops[tripId] = [];
  tripStops[tripId].push({ stopId, seq: stopSeq });
}

// Sort and dedupe
let totalEntries = 0;
for (const stop of Object.values(schedule)) {
  for (const route of Object.values(stop)) {
    for (const dt of ['w', 'h']) {
      route[dt] = [...new Set(route[dt])].sort((a, b) => a - b);
      totalEntries += route[dt].length;
    }
  }
}

console.log('Stops:', Object.keys(schedule).length);
console.log('Total time entries:', totalEntries);

// 4) Build canonical stop order per route|destination from GTFS stop_sequence.
// For each route key, pick the trip with the MOST stops (the "full" variant) and use its stop order.
const stopOrder = {};
for (const [tripId, stopsArr] of Object.entries(tripStops)) {
  const trip = trips[tripId];
  if (!trip) continue;
  const key = trip.route + '|' + trip.headsign;
  stopsArr.sort((a, b) => a.seq - b.seq);
  const ordered = stopsArr.map(s => s.stopId);
  if (!stopOrder[key] || stopOrder[key].length < ordered.length) {
    stopOrder[key] = ordered;
  }
}

console.log('Stop order keys:', Object.keys(stopOrder).length);

fs.writeFileSync('src/data/schedule.weekly.static.json', JSON.stringify(schedule));
const size = fs.statSync('src/data/schedule.weekly.static.json').size;
console.log('Written schedule.weekly.static.json:', (size / 1048576).toFixed(2) + 'MB');

fs.writeFileSync('src/data/stopOrder.static.json', JSON.stringify(stopOrder));
const soSize = fs.statSync('src/data/stopOrder.static.json').size;
console.log('Written stopOrder.static.json:', (soSize / 1024).toFixed(1) + 'KB');
