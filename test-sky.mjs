// The sky math against outside references, no browser.
//   node test-sky.mjs
// Horizons rows were fetched 2026-10-22 from https://ssd.jpl.nasa.gov/api/horizons.api
// (observer ephemeris, geodetic site at sea level, apparent refracted az/el, quantities 4 and 10)
// and are fixed here so the suite runs offline.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const A = require('./js/vendor/astronomy.browser.min.js');
const S = await import('./js/sky.mjs?v=1');
S.useEngine(A);

let pass = 0, fail = 0;
function check(name, ok, detail) {
    if (ok) pass++; else { fail++; console.log('FAIL ' + name + (detail ? ': ' + detail : '')); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const azNear = (a, b, tol) => Math.abs(((a - b + 540) % 360) - 180) <= tol;

// ---- ten Horizons cases: three continents, both hemispheres, 2026 to 2030 -----------------
const HORIZONS = [
    { body: 'moon', lat: 40, lon: -105, utc: '2026-11-15T03:00:00Z', az: 229.53308, alt: 8.026555, illum: 0.2775193 },
    { body: 'jupiter', lat: 40, lon: -105, utc: '2026-11-15T05:00:00Z', az: 56.672913, alt: -14.727012, illum: 0.9913027 },
    { body: 'saturn', lat: 14.6, lon: 121, utc: '2027-03-10T12:00:00Z', az: 274.675516, alt: -3.313609, illum: 0.9995159 },
    { body: 'moon', lat: 14.6, lon: 121, utc: '2027-03-10T12:00:00Z', az: 281.161638, alt: -4.793989, illum: 0.0443415 },
    { body: 'mars', lat: 43, lon: -3, utc: '2028-07-20T22:00:00Z', az: 356.174353, alt: -22.379388, illum: 0.9737009 },
    { body: 'venus', lat: -34, lon: 151, utc: '2029-01-05T09:30:00Z', az: 225.346068, alt: -16.651087, illum: 0.9499609 },
    { body: 'moon', lat: -34, lon: 151, utc: '2029-01-05T09:30:00Z', az: 112.166577, alt: -30.845568, illum: 0.7370069 },
    { body: 'sun', lat: -1, lon: 37, utc: '2030-06-21T15:00:00Z', az: 293.785939, alt: 7.477458, illum: 1 },
    { body: 'moon', lat: -33, lon: -71, utc: '2030-09-03T23:00:00Z', az: 297.945039, alt: 67.724081, illum: 0.3895845 },
    { body: 'jupiter', lat: 52, lon: 13, utc: '2026-12-01T17:30:00Z', az: 17.768118, alt: -22.426379, illum: 0.9917758 }
];
// below the horizon Horizons reports airless altitude and our model keeps refraction off too
for (const h of HORIZONS) {
    const frame = S.makeFrame({ lat: h.lat, lon: h.lon, zone: 'UTC' }, new Date(h.utc));
    const b = S.bodyAt(frame, h.body);
    const name = `${h.body} at ${h.lat},${h.lon} ${h.utc}`;
    check(name + ' alt', near(b.alt, h.alt, 0.25), `${b.alt.toFixed(3)} vs ${h.alt}`);
    check(name + ' az', azNear(b.az, h.az, 0.25 / Math.max(0.2, Math.cos(h.alt * Math.PI / 180))), `${b.az.toFixed(3)} vs ${h.az}`);
    if (h.body !== 'sun') check(name + ' lit', near(b.fraction, h.illum, 0.01), `${b.fraction.toFixed(4)} vs ${h.illum}`);
}

// ---- Polaris stands at the latitude, everywhere north of the equator ----------------------
const ip = S.starIndexById('polaris');
for (const lat of [5, 14, 25, 40, 52, 65, 80]) for (const lon of [-105, 0, 121]) for (const hour of [0, 6, 12, 18]) {
    const frame = S.makeFrame({ lat, lon, zone: 'UTC' }, new Date(Date.UTC(2027, 2, 21, hour)));
    const aa = S.starAltAz(frame, ip);
    check(`Polaris alt at lat ${lat} lon ${lon} ${hour}h`, near(aa.alt, lat, 1), aa.alt.toFixed(2));
    check(`Polaris az at lat ${lat}`, azNear(aa.az, 0, 2 / Math.cos(lat * Math.PI / 180)), aa.az.toFixed(2));
}

// ---- the star path agrees with the engine's own Horizon() --------------------------------
const hor = new Float32Array(S.N * 3);
for (const [lat, lon, when] of [[40, -105, '2026-10-23T02:00:00Z'], [-34, 151, '2029-01-05T09:30:00Z'], [14.6, 121, '2027-03-10T12:00:00Z']]) {
    const frame = S.makeFrame({ lat, lon, zone: 'UTC' }, new Date(when));
    S.starVectors(frame, hor);
    let worst = 0;
    for (const id of ['sirius', 'vega', 'betelgeuse', 'canopus', 'acrux', 'dubhe', 'antares']) {
        const i = S.starIndexById(id);
        const mine = S.horToAltAz(hor[i * 3], hor[i * 3 + 1], hor[i * 3 + 2]);
        const ref = S.skyNumbers(frame, S.RA[i], S.DEC[i]);
        if (ref.altAirless < 0) continue;   // below the horizon Horizon() keeps refracting and we stop; nothing is drawn there
        worst = Math.max(worst, Math.abs(mine.alt - ref.alt), Math.abs(((mine.az - ref.az + 540) % 360) - 180) * Math.cos(ref.alt * Math.PI / 180));
    }
    check(`star vectors match Horizon() at ${lat},${lon}`, worst < 0.02, 'worst gap ' + worst.toFixed(4));
}

// ---- transit altitudes from the textbook: 90 - lat + dec -----------------------------------
{
    const iv = S.starIndexById('vega');
    const place = { lat: 40, lon: 0, zone: 'UTC' };
    let best = -90;
    for (let m = 0; m < 1440; m += 2) {
        const frame = S.makeFrame(place, new Date(Date.UTC(2027, 6, 1, 0, m)));
        best = Math.max(best, S.starAltAz(frame, iv).alt);
    }
    check('Vega transit altitude at lat 40', near(best, 90 - 40 + S.DEC[iv], 0.3), best.toFixed(2));
}

// ---- the Dipper's pointers never rise at 35 south; the Southern Cross never sets there -------
// (the spec said the whole Dipper; Alkaid, the handle's end, does clear the horizon by about 6 degrees)
{
    const place = { lat: -35, lon: 20, zone: 'UTC' };
    let dipperMax = -90, cruxMin = 90;
    const dipper = ['dubhe', 'merak'].map(S.starIndexById);
    const crux = [...new Set(S.LINES.cru.flat())].map(S.indexOfHr);
    for (let h = 0; h < 24; h += 0.5) {
        const frame = S.makeFrame(place, new Date(Date.UTC(2027, 0, 1, 0, h * 60)));
        for (const i of dipper) dipperMax = Math.max(dipperMax, S.starAltAz(frame, i).alt);
        for (const i of crux) cruxMin = Math.min(cruxMin, S.starAltAz(frame, i).alt);
    }
    check('the pointers stay below the horizon at 35 south', dipperMax < 0, 'highest ' + dipperMax.toFixed(1));
    check('Southern Cross is circumpolar at 35 south', cruxMin > 0, 'lowest ' + cruxMin.toFixed(1));
}

// ---- Moon phase names and quarters --------------------------------------------------------
{
    // first quarter 2026-10-26 04:12 UTC (from the engine's own quarter search, checked against Horizons illumination 50 percent)
    const q = S.moonQuarters(new Date('2026-10-22T00:00:00Z'), 4);
    check('quarters come in order', q.map(x => x.quarter).join('') === '2301', q.map(x => x.quarter).join(''));
    const full = S.bodyAt(S.makeFrame({ lat: 0, lon: 0, zone: 'UTC' }, q[0].date), 'moon');
    check('full Moon named full', full.phase === 'full', full.phase);
    check('full Moon lit about 100 percent', full.fraction > 0.99, full.fraction.toFixed(3));
    const newm = S.bodyAt(S.makeFrame({ lat: 0, lon: 0, zone: 'UTC' }, q[2].date), 'moon');
    check('new Moon named new', newm.phase === 'new', newm.phase);
    check('phase names cover the circle', [0, 45, 90, 135, 180, 225, 270, 315].map(S.phaseName).join(',') === S.PHASES.join(','));
}

// ---- rise and set: Denver moonrise 2026-10-22 against Horizons rise time 22:19 UTC ---------
{
    const place = { name: 'Denver', lat: 40, lon: -105, zone: 'America/Denver' };
    const rs = S.bodyRiseSet(place, '2026-10-22', 'moon');
    check('Denver moonrise within 2 minutes of Horizons', rs.rise && near(rs.rise.getTime(), Date.parse('2026-10-22T22:19:25Z'), 120000), rs.rise && rs.rise.toISOString());
    const is = S.starIndexById('sirius');
    const srs = S.starRiseSet(place, '2026-10-22', S.RA[is], S.DEC[is]);
    // Sirius (dec -16.7) at lat 40: cos H = -tan(40) tan(-16.7) gives 10.05 hours up, a little more with refraction
    const up = srs.rise && srs.set ? ((srs.set - srs.rise) / 3600000 + 24) % 24 : null;
    check('Sirius up about 10.1 hours at lat 40', up !== null && near(up, 10.1, 0.25), up && up.toFixed(2));
    const idb = S.starIndexById('dubhe');
    check('Dubhe never sets at lat 40', S.starRiseSet(place, '2026-10-22', S.RA[idb], S.DEC[idb]).always === 'up');
}

// ---- local time round trips, including a daylight saving edge ------------------------------
{
    const d = S.localToDate('2026-11-01', '01:30', 'America/Denver');  // the hour that happens twice
    const back = S.localParts(d, 'America/Denver');
    check('local round trip on the fall-back night', back.date === '2026-11-01' && back.time === '01:30', back.date + ' ' + back.time);
    const d2 = S.localToDate('2026-10-22', '20:00', 'Asia/Manila');
    check('Manila 8 pm is 12:00 UTC', d2.toISOString() === '2026-10-22T12:00:00.000Z', d2.toISOString());
    check('addMonths clamps the day', S.addMonths('2026-01-31', 1) === '2026-02-28' && S.addMonths('2026-11-30', 3) === '2027-02-28');
}

// ---- the data itself -----------------------------------------------------------------------
{
    check('catalog sorted bright to faint', S.MAG.every((m, i) => i === 0 || m >= S.MAG[i - 1]));
    check('every line star is in the catalog', Object.values(S.LINES).flat(2).every(hr => S.indexOfHr(hr) !== undefined));
    check('88 constellations with lines', S.CONSTELLATIONS.length === 88 && S.CONSTELLATIONS.every(c => S.LINES[c.id] && S.LINES[c.id].length > 0));
    check('Big Dipper has seven stars', new Set(S.ASTERISMS.dipper.flat()).size === 7);
    const named = ['polaris', 'sirius', 'vega', 'betelgeuse', 'rigel', 'dubhe', 'merak', 'acrux', 'gacrux', 'antares', 'arcturus', 'capella'];
    check('the famous names resolve', named.every(id => S.starIndexById(id) !== undefined), named.filter(id => S.starIndexById(id) === undefined).join(' '));
    check('Polaris sits at the pole', S.DEC[ip] > 89 && S.NAMES[S.HR[ip]] === 'Polaris');
    check('distances only where known', Object.values(S.DIST).every(d => d >= 4 && d < 10000));
    check('Sirius about 8.6 light-years', near(S.DIST[S.HR[S.starIndexById('sirius')]], 8.6, 0.2), S.DIST[S.HR[S.starIndexById('sirius')]]);
    check('Sun temperature from B-V 0.65 near 5800 K', near(S.bvTemperature(0.65), 5800, 100), S.bvTemperature(0.65));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
