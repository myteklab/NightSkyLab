// Turns the source catalogs into the packed data modules in js/data/. Not loaded by the app.
//
//   node tools/build-data.mjs --src /path/to/sources --out js/data
//
// The source directory holds the raw downloads, one folder each (see
// makerspace-v2/192-night-sky-lab-sources.md in the platform repo for where each came from):
//   bsc5/heasarc_bsc5p.tdat        Yale Bright Star Catalog, 5th revised edition, HEASARC dump
//   stellarium/index.json          Stellarium western sky culture (lines by Hipparcos number)
//   iau/IAU-CSN.txt                IAU Working Group on Star Names catalog
//   geonames/cities15000.txt       GeoNames cities15000 dump
//   ne/ne_110m_land.geojson        Natural Earth 110m land
//   hip/                           Hipparcos rows fetched from VizieR by this script and kept
//
// Stars are kept to the magnitude limit plus every star a constellation line or a name needs,
// so a figure never loses a corner to the cut.
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]] : []).filter(Boolean));
const SRC = args.src;
const OUT = args.out || 'js/data';
if (!SRC) { console.error('usage: node tools/build-data.mjs --src DIR --out js/data'); process.exit(1); }
const MAG_LIMIT = 5.5;
const CITY_POP = Number(args.pop || 150000);

const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

// ---- BSC5 -------------------------------------------------------------------------------
function readBsc5() {
    const text = read('bsc5/heasarc_bsc5p.tdat');
    const header = text.slice(0, text.indexOf('<DATA>'));
    const cols = header.match(/^line\[1\] = (.*)$/m)[1].trim().split(/\s+/);
    const idx = Object.fromEntries(cols.map((c, i) => [c, i]));
    const rows = text.slice(text.indexOf('<DATA>') + 6).split('\n');
    const out = new Map();
    for (const line of rows) {
        if (!line || line.startsWith('<END>')) continue;
        const f = line.split('|');
        const hr = Number(f[idx.hr]);
        const ra = f[idx.ra], dec = f[idx.dec], mag = f[idx.vmag];
        if (!hr || ra === '' || dec === '' || mag === '') continue;   // novae and the like carry no position
        out.set(hr, {
            hr, ra: Number(ra), dec: Number(dec), mag: Number(mag),
            bv: f[idx.bv_color] === '' ? null : Number(f[idx.bv_color]),
            hd: f[idx.hd] === '' ? null : Number(f[idx.hd]),
            bayer: f[idx.alt_name].trim(),
            spect: f[idx.spect_type].trim()
        });
    }
    return out;
}

// ---- IAU names ---------------------------------------------------------------------------
function readIau() {
    const names = [];
    for (const line of read('iau/IAU-CSN.txt').split('\n')) {
        if (!line || line[0] === '#' || line[0] === '$') continue;
        // fixed columns: name(18) diacritics(18) designation(13) id(6) idgreek(6) con(4) comp(5) wds(11) mag bnd hip hd ra dec date
        const name = line.slice(0, 18).trim();
        const designation = line.slice(36, 49).trim();
        const rest = line.slice(49).trim().split(/\s+/);
        // rest: id idgreek con comp wds mag bnd hip hd ra dec date [notes]
        const hip = rest[7] === '_' ? null : Number(rest[7]);
        const hd = rest[8] === '_' ? null : Number(rest[8]);
        const hr = designation.startsWith('HR ') ? Number(designation.slice(3)) : null;
        names.push({ name, hr, hip, hd, con: rest[2], mag: Number(rest[5]) });
    }
    return names;
}

// ---- Stellarium lines --------------------------------------------------------------------
function readStellarium() {
    const d = JSON.parse(read('stellarium/index.json'));
    const cons = d.constellations.map(c => ({
        iau: c.iau,
        name: c.common_name.native || c.common_name.english,
        english: c.common_name.english,
        segs: segsOf(c.lines)
    }));
    const asterisms = {};
    for (const a of d.asterisms) if (a.common_name) asterisms[a.id] = { english: a.common_name.english, segs: segsOf(a.lines) };
    return { cons, asterisms };
}
function segsOf(lines) {
    const segs = [];
    for (const poly of lines) {
        const pts = poly.filter(x => typeof x === 'number');
        for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
    }
    return segs;
}

// ---- Hipparcos crosswalk, fetched once ----------------------------------------------------
async function hipRows(hips) {
    const cache = path.join(SRC, 'hip', 'rows.json');
    if (fs.existsSync(cache)) {
        const c = JSON.parse(fs.readFileSync(cache, 'utf8'));
        if (hips.every(h => c.main[h] !== undefined)) return c;
    }
    console.error('fetching ' + hips.length + ' Hipparcos rows from VizieR');
    const tap = async (adql) => {
        const body = new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', FORMAT: 'csv', QUERY: adql });
        const r = await fetch('https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync', { method: 'POST', body });
        if (!r.ok) throw new Error('VizieR ' + r.status);
        const [head, ...rows] = (await r.text()).trim().split('\n');
        const cols = head.split(',');
        return rows.map(line => Object.fromEntries(line.split(',').map((v, i) => [cols[i], v])));
    };
    // the service refuses a very long IN list, so the ids go in chunks
    const chunks = [];
    for (let i = 0; i < hips.length; i += 150) chunks.push(hips.slice(i, i + 150));
    const q = (table, cols, ids) => `SELECT ${cols} FROM "${table}" WHERE HIP IN (${ids.join(',')})`;
    const main = {};
    const plx = {};
    for (const ids of chunks) {
        for (const r of await tap(q('I/239/hip_main', 'HIP,HD,RAICRS,DEICRS,Vmag', ids))) main[r.HIP] = { hd: r.HD === '' ? null : Number(r.HD), ra: Number(r.RAICRS), dec: Number(r.DEICRS) };
        for (const r of await tap(q('I/311/hip2', 'HIP,Plx,e_Plx', ids))) plx[r.HIP] = { plx: Number(r.Plx), e: Number(r.e_Plx) };
    }
    for (const h of hips) if (main[h] === undefined) main[h] = null;
    const out = { fetched: new Date().toISOString().slice(0, 10), main, plx };
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.writeFileSync(cache, JSON.stringify(out));
    return out;
}

// HIP -> HR: by HD number first, then by position within 20 arcseconds.
function crosswalk(hips, hip, bsc) {
    const byHd = new Map();
    for (const s of bsc.values()) if (s.hd) byHd.set(s.hd, s.hr);
    const map = {};
    const missing = [];
    for (const h of hips) {
        const row = hip.main[h];
        if (!row) { missing.push(h); continue; }
        let hr = row.hd ? byHd.get(row.hd) : undefined;
        if (!hr) {
            let best = null, bestD = 20 / 3600;
            for (const s of bsc.values()) {
                const dd = Math.abs(s.dec - row.dec);
                if (dd > bestD) continue;
                const dr = Math.abs(((s.ra - row.ra + 540) % 360) - 180) * Math.cos(row.dec * Math.PI / 180);
                const dist = Math.hypot(dr, dd);
                if (dist < bestD) { bestD = dist; best = s.hr; }
            }
            hr = best;
        }
        if (hr) map[h] = hr; else missing.push(h);
    }
    return { map, missing };
}

// ---- packing -----------------------------------------------------------------------------
function packStars(stars) {
    const buf = new ArrayBuffer(stars.length * 14);
    const v = new DataView(buf);
    stars.forEach((s, i) => {
        const o = i * 14;
        v.setUint16(o, s.hr);
        v.setUint32(o + 2, Math.round(s.ra * 100000));
        v.setInt32(o + 6, Math.round(s.dec * 100000));
        v.setInt16(o + 10, Math.round(s.mag * 100));
        v.setInt16(o + 12, s.bv === null ? 32767 : Math.round(s.bv * 100));
    });
    return Buffer.from(buf).toString('base64');
}

const GREEK = { alf: 'α', bet: 'β', gam: 'γ', del: 'δ', eps: 'ε', zet: 'ζ', eta: 'η', the: 'θ', iot: 'ι', kap: 'κ', lam: 'λ', mu: 'μ', nu: 'ν', ksi: 'ξ', omi: 'ο', pi: 'π', rho: 'ρ', sig: 'σ', tau: 'τ', ups: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', ome: 'ω' };
// "Alp UMa" -> "α UMa"; "11Bet Cas" (Flamsteed + Bayer) -> "β Cas"; "80 UMa" stays.
function bayerLabel(alt) {
    const m = alt.match(/^(\d*)\s*([A-Z][a-z][a-z]?)(\d?)\s+([A-Z][A-Za-z]{2})$/);
    if (!m) return alt.replace(/\s+/g, ' ') || null;
    const g = GREEK[m[2].toLowerCase()] || GREEK[m[2].toLowerCase().slice(0, 3)];
    if (!g) return alt.replace(/\s+/g, ' ');
    const sup = m[3] ? String.fromCharCode(0x2070 + Number(m[3])).replace('⁰', '⁰') : '';
    return g + (m[3] ? ['', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'][Number(m[3])] : '') + ' ' + m[4];
}

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
    const bsc = readBsc5();
    const iau = readIau();
    const stel = readStellarium();
    const hips = [...new Set([
        ...stel.cons.flatMap(c => c.segs.flat()),
        ...Object.values(stel.asterisms).flatMap(a => a.segs.flat()),
        ...iau.map(n => n.hip).filter(Boolean)
    ])].sort((a, b) => a - b);
    const hip = await hipRows(hips);
    const { map: hip2hr, missing } = crosswalk(hips, hip, bsc);
    if (missing.length) console.error('no BSC5 star for HIP ' + missing.join(', '));

    // names: IAU rows that name a BSC5 star (by HR, else by HIP crosswalk); one name per star
    const names = {};
    const dist = {};
    for (const n of iau) {
        const hr = n.hr || (n.hip && hip2hr[n.hip]);
        if (!hr || !bsc.has(hr) || names[hr]) continue;
        names[hr] = n.name;
        const p = n.hip && hip.plx[n.hip];
        // a parallax known to better than a quarter of itself gives a distance worth printing
        if (p && p.plx > 0 && p.e / p.plx < 0.25) {
            const ly = 3261.56 / p.plx;
            dist[hr] = ly < 100 ? Math.round(ly * 10) / 10 : Math.round(ly);
        }
    }

    const keep = new Set();
    for (const s of bsc.values()) if (s.mag <= MAG_LIMIT) keep.add(s.hr);
    const lines = {};
    const consts = [];
    for (const c of stel.cons) {
        const id = c.iau.toLowerCase();
        const segs = c.segs.map(([a, b]) => [hip2hr[a], hip2hr[b]]).filter(([a, b]) => a && b && a !== b);
        segs.flat().forEach(hr => keep.add(hr));
        lines[id] = segs;
        // label point: the mean direction of the figure's stars
        let x = 0, y = 0, z = 0;
        for (const hr of new Set(segs.flat())) {
            const s = bsc.get(hr), ra = s.ra * Math.PI / 180, dec = s.dec * Math.PI / 180;
            x += Math.cos(dec) * Math.cos(ra); y += Math.cos(dec) * Math.sin(ra); z += Math.sin(dec);
        }
        const ra = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360, dec = Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI;
        consts.push({ id, iau: c.iau, name: c.name, english: c.english, ra: +ra.toFixed(2), dec: +dec.toFixed(2) });
    }
    for (const hr of Object.keys(names)) keep.add(Number(hr));
    const asterisms = {};
    for (const [id, a] of Object.entries(stel.asterisms)) {
        const key = { 'AST western BDr': 'dipper', 'AST western LDr': 'littledipper', 'AST western NCr': 'northerncross' }[id];
        if (!key) continue;
        asterisms[key] = a.segs.map(([x, y]) => [hip2hr[x], hip2hr[y]]).filter(([x, y]) => x && y);
        asterisms[key].flat().forEach(hr => keep.add(hr));
    }
    consts.sort((a, b) => a.name.localeCompare(b.name));

    const stars = [...keep].map(hr => bsc.get(hr)).filter(Boolean).sort((a, b) => a.mag - b.mag);
    const bayer = {};
    for (const s of stars) if (s.bayer && (s.mag <= 4 || Object.values(lines).some(segs => segs.some(sg => sg.includes(s.hr))))) {
        const b = bayerLabel(s.bayer);
        if (b) bayer[s.hr] = b;
    }

    const stamp = `// Built ${new Date().toISOString().slice(0, 10)} by tools/build-data.mjs. Do not edit by hand.`;
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'stars.mjs'),
`${stamp}
// Yale Bright Star Catalog, 5th revised edition (Hoffleit and Warren 1991), HEASARC copy.
// ${stars.length} stars: every star to magnitude ${MAG_LIMIT} plus every star a line or a name needs,
// sorted bright to faint. 14 bytes each: HR number (u16), RA J2000 (u32, 1e-5 deg),
// Dec J2000 (i32, 1e-5 deg), V magnitude (i16, x100), B-V (i16, x100, 32767 = none).
export const STAR_COUNT = ${stars.length};
export const STARS_B64 = '${packStars(stars)}';
`);
    fs.writeFileSync(path.join(OUT, 'names.mjs'),
`${stamp}
// NAMES: IAU Working Group on Star Names catalog (edition of 2022-04-04), by HR number.
// DIST: light-years from the Hipparcos new reduction parallax (van Leeuwen 2007, VizieR I/311),
// only where the parallax is known to better than a quarter of itself. Rounded.
// BAYER: Bayer or Flamsteed designation from BSC5 for the brighter and the line stars.
export const NAMES = ${JSON.stringify(names)};
export const DIST = ${JSON.stringify(dist)};
export const BAYER = ${JSON.stringify(bayer)};
`);
    fs.writeFileSync(path.join(OUT, 'lines.mjs'),
`${stamp}
// Constellation figures from the Stellarium western sky culture (CC BY-SA), star ids
// converted from Hipparcos to HR numbers through the Hipparcos main catalog's HD column.
// Label points are the mean direction of each figure's stars. Asterisms are the same source.
export const LINES = ${JSON.stringify(lines)};
export const CONSTELLATIONS = ${JSON.stringify(consts)};
export const ASTERISMS = ${JSON.stringify(asterisms)};
`);

    // cities: GeoNames, population at or above the cut plus every capital
    const zones = [];
    const zoneIdx = (z) => { let i = zones.indexOf(z); if (i < 0) { zones.push(z); i = zones.length - 1; } return i; };
    const cities = [];
    for (const line of read('geonames/cities15000.txt').split('\n')) {
        if (!line) continue;
        const f = line.split('\t');
        const pop = Number(f[14]);
        if (!(pop >= CITY_POP || f[7] === 'PPLC')) continue;
        if (!f[17]) continue;
        cities.push([f[1], f[8], Math.round(Number(f[4]) * 10), Math.round(Number(f[5]) * 10), zoneIdx(f[17]), Math.round(pop / 1000)]);
    }
    cities.sort((a, b) => b[5] - a[5]);
    fs.writeFileSync(path.join(OUT, 'cities.mjs'),
`${stamp}
// GeoNames cities15000 (CC BY 4.0): places with ${CITY_POP.toLocaleString('en-US')} people or more plus every capital.
// Each row: name, country code, latitude x10, longitude x10, zone index, thousands of people.
// Biggest first, so a search shows the big one before the small one of the same name.
export const ZONES = ${JSON.stringify(zones)};
export const CITIES = ${JSON.stringify(cities)};
`);

    // land: Natural Earth 110m, every ring thinned to about one point per degree
    const geo = JSON.parse(read('ne/ne_110m_land.geojson'));
    const rings = [];
    for (const f of geo.features) {
        const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        for (const poly of polys) {
            const ring = poly[0];
            const out = [];
            let last = null;
            for (const [lon, lat] of ring) {
                const p = [Math.round(lon), Math.round(lat)];
                if (last && last[0] === p[0] && last[1] === p[1]) continue;
                out.push(p[0], p[1]);
                last = p;
            }
            if (out.length >= 8) rings.push(out);
        }
    }
    fs.writeFileSync(path.join(OUT, 'land.mjs'),
`${stamp}
// Natural Earth 110m land (public domain), rings thinned to whole degrees: lon, lat, lon, lat...
export const LAND = ${JSON.stringify(rings)};
`);

    const sizes = fs.readdirSync(OUT).map(f => f + ' ' + fs.statSync(path.join(OUT, f)).size);
    console.log(`stars ${stars.length}, names ${Object.keys(names).length}, distances ${Object.keys(dist).length}, bayer ${Object.keys(bayer).length}, constellations ${consts.length}, cities ${cities.length}, zones ${zones.length}, land rings ${rings.length}`);
    console.log(sizes.join('\n'));
    const noLine = consts.filter(c => lines[c.id].length === 0).map(c => c.id);
    if (noLine.length) console.error('constellations with no lines: ' + noLine.join(' '));
}
main().catch(e => { console.error(e); process.exit(1); });
