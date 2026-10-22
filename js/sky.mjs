// The sky model: where everything is for a place and an instant. Pure math, no DOM.
// Stars come from the packed catalog; the Sun, Moon and planets from Astronomy Engine,
// handed in once with useEngine() so the same file runs in the browser and in the Node suite.
//
// Frames: a "hor" vector is Astronomy Engine's horizontal frame, x north, y west, z up.
// Azimuth is measured from north through east, altitude up from the horizon.
import { STARS_B64, STAR_COUNT } from './data/stars.mjs?v=1';
import { NAMES, DIST, BAYER } from './data/names.mjs?v=1';
import { LINES, CONSTELLATIONS, ASTERISMS } from './data/lines.mjs?v=1';

let A = null;
export function useEngine(engine) { A = engine; }
export const engine = () => A;

const D2R = Math.PI / 180, R2D = 180 / Math.PI;

// ---- the catalog, unpacked once ----------------------------------------------------------
function decode64(s) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
    const bin = atob(s), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
const bytes = decode64(STARS_B64);
const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
export const N = STAR_COUNT;
export const HR = new Uint16Array(N);
export const RA = new Float64Array(N);     // degrees, J2000
export const DEC = new Float64Array(N);
export const MAG = new Float32Array(N);
export const BV = new Float32Array(N);     // NaN when the catalog has none
const J2000 = new Float64Array(N * 3);     // unit vectors in the J2000 equatorial frame
const byHr = new Map();
for (let i = 0; i < N; i++) {
    const o = i * 14;
    HR[i] = dv.getUint16(o);
    RA[i] = dv.getUint32(o + 2) / 100000;
    DEC[i] = dv.getInt32(o + 6) / 100000;
    MAG[i] = dv.getInt16(o + 10) / 100;
    const bv = dv.getInt16(o + 12);
    BV[i] = bv === 32767 ? NaN : bv / 100;
    const ra = RA[i] * D2R, dec = DEC[i] * D2R, c = Math.cos(dec);
    J2000[i * 3] = c * Math.cos(ra); J2000[i * 3 + 1] = c * Math.sin(ra); J2000[i * 3 + 2] = Math.sin(dec);
    byHr.set(HR[i], i);
}
export const indexOfHr = (hr) => byHr.get(hr);
export { NAMES, DIST, BAYER, LINES, CONSTELLATIONS, ASTERISMS };
export const CONST_BY_ID = Object.fromEntries(CONSTELLATIONS.map(c => [c.id, c]));

// a lowercase id for a star: its proper name, else "hr1234"
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const idByIndex = new Array(N);
const indexById = new Map();
for (let i = 0; i < N; i++) {
    const id = NAMES[HR[i]] ? slug(NAMES[HR[i]]) : 'hr' + HR[i];
    idByIndex[i] = id;
    if (!indexById.has(id)) indexById.set(id, i);
}
export const starId = (i) => idByIndex[i];
export const starIndexById = (id) => indexById.get(id);
export const starName = (i) => NAMES[HR[i]] || BAYER[HR[i]] || ('HR ' + HR[i]);

// which constellation each catalog star belongs to, from the engine's IAU boundaries, on demand
const conCache = new Map();
export function starConstellation(i) {
    if (!conCache.has(i)) conCache.set(i, A.Constellation(RA[i] / 15, DEC[i]).symbol.toLowerCase());
    return conCache.get(i);
}

// ---- places and times --------------------------------------------------------------------
export const roundPlace = (p) => ({ name: p.name, country: p.country, lat: Math.round(p.lat), lon: Math.round(p.lon), zone: p.zone });

const dtfCache = new Map();
function dtf(zone) {
    if (!dtfCache.has(zone)) dtfCache.set(zone, new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }));
    return dtfCache.get(zone);
}
// the wall clock in a zone for an instant
export function localParts(date, zone) {
    const p = {};
    for (const part of dtf(zone).formatToParts(date)) p[part.type] = part.value;
    const hour = p.hour === '24' ? 0 : Number(p.hour);
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${String(hour).padStart(2, '0')}:${p.minute}`, h: hour, m: Number(p.minute), s: Number(p.second), weekday: p.weekday, y: Number(p.year), mo: Number(p.month), d: Number(p.day) };
}
// offset of a zone from UTC, in minutes, at an instant
function zoneOffset(date, zone) {
    const l = localParts(date, zone);
    const asUtc = Date.UTC(l.y, l.mo - 1, l.d, l.h, l.m, l.s);
    return Math.round((asUtc - date.getTime()) / 60000);
}
// the instant for a wall clock date and time in a zone (two passes cover daylight saving edges)
export function localToDate(dateStr, timeStr, zone) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const [h, mi] = timeStr.split(':').map(Number);
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    let t = guess - zoneOffset(new Date(guess), zone) * 60000;
    t = guess - zoneOffset(new Date(t), zone) * 60000;
    return new Date(t);
}
export function addDays(dateStr, n) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const t = new Date(Date.UTC(y, mo - 1, d + n));
    return t.toISOString().slice(0, 10);
}
export function addMonths(dateStr, n) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const t = new Date(Date.UTC(y, mo - 1 + n, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    t.setUTCDate(Math.min(d, last));
    return t.toISOString().slice(0, 10);
}

// ---- the frame: everything that depends on place and instant -----------------------------
export function makeFrame(place, date) {
    const observer = new A.Observer(place.lat, place.lon, 0);
    const time = A.MakeTime(date);
    const m = A.Rotation_EQJ_HOR(time, observer).rot;
    // flattened so that out.x = rot[0] x + rot[1] y + rot[2] z, which is how RotateVector applies rot
    const rot = new Float64Array([m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]]);
    const gast = A.SiderealTime(time);
    const lst = ((gast + place.lon / 15) % 24 + 24) % 24;
    return { place, date, observer, time, rot, lst };
}

// stars: fills hor[] with x north, y west, z up for every catalog star, refraction included
export function starVectors(frame, hor) {
    const r = frame.rot;
    for (let i = 0; i < N; i++) {
        const x = J2000[i * 3], y = J2000[i * 3 + 1], z = J2000[i * 3 + 2];
        let hx = r[0] * x + r[1] * y + r[2] * z;
        let hy = r[3] * x + r[4] * y + r[5] * z;
        let hz = r[6] * x + r[7] * y + r[8] * z;
        if (hz > -0.05) {
            // lift by refraction: rotate the vector up in its own vertical plane
            const alt = Math.asin(Math.max(-1, Math.min(1, hz)));
            const lift = A.Refraction('normal', alt * R2D) * D2R;
            if (lift > 0) {
                const alt2 = alt + lift, h = Math.hypot(hx, hy);
                if (h > 1e-9) { const k = Math.cos(alt2) / h; hx *= k; hy *= k; }
                hz = Math.sin(alt2);
            }
        }
        hor[i * 3] = hx; hor[i * 3 + 1] = hy; hor[i * 3 + 2] = hz;
    }
    return hor;
}
export const horToAltAz = (x, y, z) => ({ alt: Math.asin(Math.max(-1, Math.min(1, z))) * R2D, az: ((Math.atan2(-y, x) * R2D) + 360) % 360 });
export function altAzToHor(az, alt) {
    const a = az * D2R, e = alt * D2R, c = Math.cos(e);
    return [c * Math.cos(a), -c * Math.sin(a), Math.sin(e)];
}

// one J2000 position (degrees) to alt/az in this frame, with the steps kept for the Sky numbers panel
export function skyNumbers(frame, raDeg, decDeg) {
    const eqd = A.RotateVector(A.Rotation_EQJ_EQD(frame.time), A.VectorFromSphere(new A.Spherical(decDeg, raDeg, 1), frame.time));
    const d = A.SphereFromVector(eqd);
    const raD = d.lon / 15, decD = d.lat;
    let ha = frame.lst - raD; ha = ((ha % 24) + 24) % 24; if (ha > 12) ha -= 24;
    const h = A.Horizon(frame.time, frame.observer, raD, decD, 'normal');
    const airless = A.Horizon(frame.time, frame.observer, raD, decD, null);
    return { raJ: raDeg / 15, decJ: decDeg, raD, decD, lst: frame.lst, ha, alt: h.altitude, az: h.azimuth, altAirless: airless.altitude, lat: frame.place.lat };
}
export function starAltAz(frame, i) {
    const r = frame.rot, x = J2000[i * 3], y = J2000[i * 3 + 1], z = J2000[i * 3 + 2];
    const hx = r[0] * x + r[1] * y + r[2] * z, hy = r[3] * x + r[4] * y + r[5] * z, hz = r[6] * x + r[7] * y + r[8] * z;
    const aa = horToAltAz(hx, hy, hz);
    aa.alt += A.Refraction('normal', aa.alt);
    return aa;
}

// ---- Sun, Moon, planets ------------------------------------------------------------------
export const BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
export const PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
const BODY_NAME = { sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn' };
export const bodyName = (id) => BODY_NAME[id];
const engineBody = (id) => A.Body[BODY_NAME[id]];

export function bodyAt(frame, id) {
    const eq = A.Equator(engineBody(id), frame.time, frame.observer, true, true);
    const h = A.Horizon(frame.time, frame.observer, eq.ra, eq.dec, 'normal');
    const out = { id, name: BODY_NAME[id], alt: h.altitude, az: h.azimuth, ra: eq.ra, dec: eq.dec, dist: eq.dist, hor: altAzToHor(h.azimuth, h.altitude) };
    if (id !== 'sun') {
        const ill = A.Illumination(engineBody(id), frame.time);
        out.mag = ill.mag;
        out.fraction = ill.phase_fraction;
    }
    if (id === 'moon') {
        out.phaseAngle = A.MoonPhase(frame.time);
        out.phase = phaseName(out.phaseAngle);
        // which side is lit, as seen from here: direction from the Moon toward the Sun on the sky
        const sun = A.Equator(A.Body.Sun, frame.time, frame.observer, true, true);
        const sh = A.Horizon(frame.time, frame.observer, sun.ra, sun.dec, null);
        out.sunDir = { alt: sh.altitude, az: sh.azimuth };
    }
    return out;
}
export const bodiesAt = (frame) => BODIES.map(id => bodyAt(frame, id));

// 0 = new, 90 = first quarter, 180 = full, 270 = last quarter
export function phaseName(angle) {
    const a = ((angle % 360) + 360) % 360;
    if (a < 11.25 || a >= 348.75) return 'new';
    if (a < 78.75) return 'waxing-crescent';
    if (a < 101.25) return 'first-quarter';
    if (a < 168.75) return 'waxing-gibbous';
    if (a < 191.25) return 'full';
    if (a < 258.75) return 'waning-gibbous';
    if (a < 281.25) return 'last-quarter';
    return 'waning-crescent';
}
export const PHASE_WORDS = { 'new': 'New Moon', 'waxing-crescent': 'Waxing crescent', 'first-quarter': 'First quarter', 'waxing-gibbous': 'Waxing gibbous', 'full': 'Full Moon', 'waning-gibbous': 'Waning gibbous', 'last-quarter': 'Last quarter', 'waning-crescent': 'Waning crescent' };
export const PHASES = Object.keys(PHASE_WORDS);

// the next four quarters after an instant
export function moonQuarters(date, count = 4) {
    const out = [];
    let q = A.SearchMoonQuarter(A.MakeTime(date));
    for (let i = 0; i < count; i++) { out.push({ quarter: q.quarter, date: q.time.date }); q = A.NextMoonQuarter(q); }
    return out;
}

// rise and set of a body in the local day that starts at noon of dateStr
export function bodyRiseSet(place, dateStr, id) {
    const start = localToDate(dateStr, '12:00', place.zone);
    const obs = new A.Observer(place.lat, place.lon, 0);
    const rise = A.SearchRiseSet(engineBody(id), obs, +1, start, 1);
    const set = A.SearchRiseSet(engineBody(id), obs, -1, start, 1);
    return { rise: rise ? rise.date : null, set: set ? set.date : null };
}

// rise and set of a fixed J2000 point by sampling its altitude through the local day
export function starRiseSet(place, dateStr, raDeg, decDeg) {
    const start = localToDate(dateStr, '12:00', place.zone).getTime();
    const obs = new A.Observer(place.lat, place.lon, 0);
    const altAt = (t) => {
        const time = A.MakeTime(new Date(t));
        const eqd = A.SphereFromVector(A.RotateVector(A.Rotation_EQJ_EQD(time), A.VectorFromSphere(new A.Spherical(decDeg, raDeg, 1), time)));
        return A.Horizon(time, obs, eqd.lon / 15, eqd.lat, 'normal').altitude;
    };
    const out = { rise: null, set: null, always: null };
    const step = 10 * 60000;
    let prev = altAt(start);
    let crossings = 0;
    for (let t = start + step; t <= start + 86400000; t += step) {
        const cur = altAt(t);
        if ((prev < 0) !== (cur < 0)) {
            let lo = t - step, hi = t;
            for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if ((altAt(mid) < 0) === (prev < 0)) lo = mid; else hi = mid; }
            const when = new Date((lo + hi) / 2);
            if (cur >= 0) { if (!out.rise) out.rise = when; } else if (!out.set) out.set = when;
            crossings++;
        }
        prev = cur;
    }
    if (!crossings) out.always = altAt(start) >= 0 ? 'up' : 'down';
    return out;
}

// ---- colors and words ---------------------------------------------------------------------
// Ballesteros 2012 fit of temperature to B-V
export function bvTemperature(bv) {
    if (!Number.isFinite(bv)) return null;
    return Math.round(4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)));
}
export function bvClass(bv) {
    if (!Number.isFinite(bv)) return 'white';
    if (bv < 0.0) return 'blue-white';
    if (bv < 0.3) return 'white';
    if (bv < 0.6) return 'yellow-white';
    if (bv < 0.9) return 'yellow';
    if (bv < 1.4) return 'orange';
    return 'red';
}
export const STAR_COLORS = { 'blue-white': '#b9cdff', 'white': '#f2f4ff', 'yellow-white': '#fff6dc', 'yellow': '#ffe7a8', 'orange': '#ffc27a', 'red': '#ff9c6a' };

export function compassWord(az) {
    const names = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
    return names[Math.round(((az % 360) + 360) % 360 / 45) % 8];
}
export function compassLetter(az) {
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return names[Math.round(((az % 360) + 360) % 360 / 45) % 8];
}
// a fist at arm's length is about ten degrees
export function fistWords(alt) {
    if (alt < 3) return 'right on the horizon';
    const f = Math.round(alt / 10);
    if (alt > 80) return 'straight overhead';
    if (f <= 0) return 'less than a fist above the horizon';
    return (f === 1 ? 'about one fist' : 'about ' + ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'][f] + ' fists') + ' above the horizon';
}

// the angle between two hor vectors, degrees
export const angleBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * R2D;

// the Sun's altitude decides how dark the sky is: full dark below -18, day above 0
export function darkness(sunAlt) {
    if (sunAlt <= -18) return 1;
    if (sunAlt >= 0) return 0;
    return -sunAlt / 18;
}
