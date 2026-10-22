// What the card says about a star, a constellation, a planet, the Moon or the Sun. Positions,
// rise and set times and phases are worked out here from the frame; the sentences that state a
// fact are keyed to makerspace-v2/192-night-sky-lab-sources.md (the key is in the comment).
import * as S from './sky.mjs?v=1';
import { esc, timeAt, deg, hms, dms } from './words.mjs?v=1';

// (c1..c20) one line each, read before shipping
const STAR_LINES = {
    polaris: 'Polaris is not the brightest star in the sky. It is famous because it stays put while everything else wheels around it.',   // c1
    sirius: 'The brightest star in the night sky.',                                                                                          // c2
    betelgeuse: 'A red supergiant, one of the largest stars you can see with your eyes.',                                                   // c3
    rigel: 'A blue supergiant. Blue stars are the hot ones.',                                                                              // c4
    vega: 'One corner of the Summer Triangle, with Deneb and Altair.',                                                                     // c5
    deneb: 'One corner of the Summer Triangle, and the tail of the Swan.',                                                                 // c5
    altair: 'One corner of the Summer Triangle, with Vega and Deneb.',                                                                     // c5
    antares: 'Its name means rival of Mars, for its red color.',                                                                           // c6
    arcturus: 'Follow the arc of the Big Dipper’s handle and you arrive at Arcturus.',                                                  // c7
    mizar: 'Look closely: a fainter star, Alcor, sits right beside Mizar. Seeing both was an old test of sharp eyes.',                       // c8
    alcor: 'The faint partner of Mizar in the Dipper’s handle. Seeing it was an old test of sharp eyes.',                               // c8
    dubhe: 'One of the two Pointers. A line from Merak through Dubhe runs to Polaris.',                                                     // c9
    merak: 'One of the two Pointers. A line from Merak through Dubhe runs to Polaris.',                                                     // c9
    aldebaran: 'The red eye of the Bull, in front of the Pleiades cluster.',                                                                // c10
    capella: 'The bright yellow star of the Charioteer, high in winter evenings from the north.',                                           // c11
    acrux: 'The foot of the Southern Cross. The long axis of the Cross points toward the south pole of the sky.',                           // c12
    spica: 'Follow the arc of the Dipper’s handle to Arcturus, then keep going to Spica.',                                               // c7
    procyon: 'The Little Dog star. With Sirius and Betelgeuse it makes the Winter Triangle.',                                               // c13
    regulus: 'The heart of the Lion, at the bottom of the backwards question mark.'                                                        // c14
};
const CON_LINES = {
    uma: 'Seven bright stars make the Big Dipper. The two at the front of the cup point to Polaris.',                                       // c9
    umi: 'The Little Dipper. Polaris is at the very end of its handle.',                                                                   // c15
    ori: 'Three stars in a short row make Orion’s belt. Red Betelgeuse is one shoulder, blue Rigel one foot.',                           // c16
    cas: 'Five stars in a W, on the other side of Polaris from the Big Dipper.',                                                           // c17
    sco: 'The red star Antares is the Scorpion’s heart.',                                                                               // c6
    cyg: 'The Swan flies down the Milky Way. Its stars also make the Northern Cross.',                                                     // c18
    leo: 'A backwards question mark makes the Lion’s head and mane.',                                                                   // c14
    cru: 'The Southern Cross. Its long axis points toward the south pole of the sky, where there is no bright star.',                        // c12
    tau: 'The Bull. The Pleiades cluster rides on its shoulder.',                                                                          // c10
    gem: 'The Twins, Castor and Pollux, side by side.',                                                                                    // c19
    boo: 'The Herdsman. Bright orange Arcturus is at the bottom of its kite shape.'                                                        // c7
};
const BODY_LINES = {
    jupiter: 'The biggest planet. Binoculars held very steady show up to four of its moons as tiny dots in a line.',                       // c20
    saturn: 'Its rings need a small telescope. In binoculars it is a steady yellowish point.',                                             // c21
    venus: 'The brightest planet. It stays near the Sun, so you see it in the evening or the morning, never late at night.',               // c22
    mars: 'The red planet. It changes brightness a lot as Earth and Mars move closer and farther apart.',                                  // c23
    mercury: 'The planet closest to the Sun. It never gets far from the Sun in our sky, so look low in twilight.',                          // c24
    moon: 'The Moon makes no light of its own. The bright part is where the Sun is shining on it.',                                        // c25
    sun: 'Never look straight at the Sun, and never through binoculars or a telescope. This card is here because the Sun is up right now.'  // c26
};

const RANK_WORDS = ['brightest', 'second brightest', 'third brightest', 'fourth brightest', 'fifth brightest'];

function whereWords(ctx, alt, az) {
    const p = ctx.project;
    if (alt < -0.5) return null;
    if (p.mode === 'astronomer') return `Altitude ${deg(alt, 1)}, azimuth ${deg(az, 1)} (${S.compassLetter(az)}).`;
    return `Look ${S.compassWord(az)}, ${S.fistWords(alt)}.`;
}

export function cardFor(ctx, hit) {
    const p = ctx.project, little = p.mode === 'little', astro = p.mode === 'astronomer';
    const zone = p.place.zone;
    if (hit.kind === 'star') {
        const i = hit.i;
        const name = S.starName(i);
        const id = S.starId(i);
        const con = S.CONST_BY_ID[S.starConstellation(i)];
        const bv = S.BV[i];
        const color = S.bvClass(bv).replace('-', ' ');
        const dist = S.DIST[S.HR[i]];
        const hor = ctx.starHor(i);
        const aa = S.horToAltAz(hor[0], hor[1], hor[2]);
        const parts = [];
        if (little) {
            parts.push(`<p>This is ${esc(name)}. It is a ${color} star${con ? ' in ' + esc(con.name) : ''}.</p>`);
            if (STAR_LINES[id]) parts.push(`<p>${STAR_LINES[id]}</p>`);
        } else {
            let first = `${esc(name)} is a ${color} star${con ? ' in ' + esc(con.name) + (con.english ? ', the ' + esc(con.english) : '') : ''}.`;
            if (i < 5) first += ` It is the ${RANK_WORDS[i]} star in the night sky.`;
            else if (i < 25) first += ` It is among the 25 brightest stars in the night sky.`;
            parts.push(`<p>${first}</p>`);
            if (STAR_LINES[id]) parts.push(`<p>${STAR_LINES[id]}</p>`);
            if (dist) parts.push(`<p>It is about ${dist.toLocaleString('en-US')} light-years away: the light you see tonight left it about ${Math.round(dist).toLocaleString('en-US')} years ago.</p>`);
        }
        const where = whereWords(ctx, aa.alt, aa.az);
        let rs = null;
        if (!where || astro) rs = S.starRiseSet(p.place, p.when.date, S.RA[i], S.DEC[i]);
        if (where) parts.push(`<p>${where}</p>`);
        else if (rs && rs.rise) parts.push(`<p>It is under the horizon right now. It rises about ${timeAt(rs.rise, zone)} in the ${S.compassWord(S.horToAltAz(...riseHor(ctx, i)).az)}.</p>`);
        else parts.push('<p>It is under the horizon all night from here.</p>');
        if (astro) {
            const t = S.bvTemperature(bv);
            parts.push('<div class="nums">' +
                `<b>Magnitude</b><span>${S.MAG[i].toFixed(2)}</span>` +
                `<b>Color B-V</b><span>${Number.isFinite(bv) ? bv.toFixed(2) + (t ? ', about ' + t.toLocaleString('en-US') + ' K' : '') : 'not in the catalog'}</span>` +
                (dist ? `<b>Distance</b><span>${dist.toLocaleString('en-US')} light-years</span>` : '') +
                `<b>RA, Dec (J2000)</b><span>${hms(S.RA[i] / 15)}, ${dms(S.DEC[i])}</span>` +
                (rs && rs.rise ? `<b>Rises, sets</b><span>${timeAt(rs.rise, zone, true)}, ${rs.set ? timeAt(rs.set, zone, true) : '—'}</span>` : (rs && rs.always ? `<b>Rises, sets</b><span>${rs.always === 'up' ? 'never sets from here' : 'never rises from here'}</span>` : '')) +
                (S.BAYER[S.HR[i]] && S.NAMES[S.HR[i]] ? `<b>Designation</b><span>${esc(S.BAYER[S.HR[i]])}, HR ${S.HR[i]}</span>` : `<b>Catalog</b><span>HR ${S.HR[i]}</span>`) +
                '</div>');
        }
        return {
            name, kind: con ? 'star in ' + con.name : 'star', html: parts.join(''), hor, ringR: 12,
            found: S.NAMES[S.HR[i]] ? { kind: 'star', id } : null,
            numbers: astro ? () => numbersText(ctx, name, S.RA[i], S.DEC[i]) : null
        };
    }
    if (hit.kind === 'constellation') {
        const c = S.CONST_BY_ID[hit.id];
        if (!c) return null;
        const isDipper = hit.id === 'uma';
        const name = isDipper ? 'Big Dipper' : c.name;
        const hor = ctx.constellationHor(c);
        const aa = S.horToAltAz(hor[0], hor[1], hor[2]);
        const parts = [];
        if (little) parts.push(`<p>This is the ${esc(isDipper ? 'Big Dipper' : (c.english || c.name))}.</p>`);
        else parts.push(`<p>${isDipper ? 'The Big Dipper is part of Ursa Major, the Great Bear.' : esc(c.name) + (c.english ? ', the ' + esc(c.english) + '.' : '.')}</p>`);
        if (CON_LINES[hit.id]) parts.push(`<p>${CON_LINES[hit.id]}</p>`);
        const segs = isDipper ? S.ASTERISMS.dipper : S.LINES[hit.id];
        const stars = [...new Set(segs.flat())].map(S.indexOfHr);
        const up = stars.filter(i => ctx.hor[i * 3 + 2] > 0).length;
        const where = whereWords(ctx, aa.alt, aa.az);
        if (up === 0) parts.push('<p>It is under the horizon right now. Try another hour, or another month.</p>');
        else if (where) parts.push(`<p>${where}${up < stars.length ? ' Part of it is still below the horizon.' : ''}</p>`);
        if (astro) parts.push(`<div class="nums"><b>IAU abbreviation</b><span>${c.iau}</span><b>Figure</b><span>${stars.length} stars, ${segs.length} lines</span><b>Center RA, Dec</b><span>${hms(c.ra / 15)}, ${dms(c.dec)}</span></div>`);
        return { name, kind: isDipper ? 'star picture' : 'constellation', html: parts.join(''), hor, ringR: 0, found: { kind: 'constellation', id: hit.id } };
    }
    if (hit.kind === 'planet' || hit.kind === 'moon' || hit.kind === 'sun') {
        const b = ctx.bodies.find(x => x.id === hit.id);
        if (!b) return null;
        const parts = [];
        if (b.id === 'sun') {
            parts.push(`<p><strong>${BODY_LINES.sun}</strong></p>`);
            const rs = S.bodyRiseSet(p.place, p.when.date, 'sun');
            if (rs.set) parts.push(`<p>It sets about ${timeAt(rs.set, zone)} today${rs.rise ? ' and rises about ' + timeAt(rs.rise, zone) + ' tomorrow' : ''}. Dark enough for the faint stars comes about an hour and a half after sunset.</p>`);
            return { name: 'The Sun', kind: 'our star', html: parts.join(''), hor: b.hor, ringR: 0, found: null };
        }
        if (b.id === 'moon') {
            parts.push(`<p>${little ? 'This is the Moon.' : BODY_LINES.moon}</p>`);
            parts.push(`<p>Tonight it is a <strong>${S.PHASE_WORDS[b.phase].toLowerCase()}</strong>, ${Math.round(b.fraction * 100)} percent lit.</p>`);
        } else {
            parts.push(`<p>${little ? 'This is ' + b.name + '. It is a planet, not a star.' : BODY_LINES[b.id]}</p>`);
            if (!little) parts.push(`<p>Planets shine with a steady light; stars twinkle more.</p>`);   // c27
        }
        const where = whereWords(ctx, b.alt, b.az);
        const rs = S.bodyRiseSet(p.place, p.when.date, b.id);
        if (where) parts.push(`<p>${where}${rs.set ? ' It sets about ' + timeAt(rs.set, zone) + '.' : ''}</p>`);
        else if (rs.rise) parts.push(`<p>It is under the horizon right now. It rises about ${timeAt(rs.rise, zone)}.</p>`);
        else parts.push('<p>It does not rise tonight from here.</p>');
        if (astro) parts.push('<div class="nums">' +
            (b.mag !== undefined ? `<b>Magnitude</b><span>${b.mag.toFixed(1)}</span>` : '') +
            (b.id !== 'moon' ? `<b>Lit</b><span>${Math.round(b.fraction * 100)} percent</span>` : `<b>Phase angle</b><span>${deg(b.phaseAngle, 1)} from new</span>`) +
            `<b>Altitude, azimuth</b><span>${deg(b.alt, 1)}, ${deg(b.az, 1)}</span>` +
            `<b>RA, Dec (of date)</b><span>${hms(b.ra)}, ${dms(b.dec)}</span>` +
            `<b>Distance</b><span>${b.id === 'moon' ? Math.round(b.dist * 149597870.7).toLocaleString('en-US') + ' km' : b.dist.toFixed(2) + ' AU'}</span>` +
            (rs.rise ? `<b>Rises, sets</b><span>${timeAt(rs.rise, zone, true)}, ${rs.set ? timeAt(rs.set, zone, true) : '—'}</span>` : '') +
            '</div>');
        return {
            name: b.name, kind: b.id === 'moon' ? 'our Moon' : 'planet', html: parts.join(''), hor: b.hor, ringR: b.id === 'moon' ? 18 : 12,
            found: { kind: b.id === 'moon' ? 'moon' : 'planet', id: b.id },
            numbers: astro ? () => numbersText(ctx, b.name, b.ra * 15, b.dec, true) : null
        };
    }
    return null;
}

// where on the horizon a star comes up: its hor vector at the rise instant is not kept, so use the
// textbook rising azimuth cos A = sin(dec) / cos(lat)
function riseHor(ctx, i) {
    const lat = ctx.project.place.lat * Math.PI / 180, dec = S.DEC[i] * Math.PI / 180;
    const c = Math.max(-1, Math.min(1, Math.sin(dec) / Math.cos(lat)));
    const az = Math.acos(c) * 180 / Math.PI;
    return S.altAzToHor(az, 0);
}

// Glassbox rung 2: the calculation behind the card, as plain lines (ofDate skips the precession step)
function numbersText(ctx, name, raDeg, decDeg, ofDate) {
    const n = S.skyNumbers(ctx.frame, raDeg, decDeg);
    const lat = ctx.project.place.lat;
    const lines = [];
    lines.push(`${name}, seen from latitude ${lat}°, longitude ${ctx.project.place.lon}°`);
    lines.push('');
    if (!ofDate) {
        lines.push(`1. Catalog position (J2000):        RA ${hms(n.raJ)}   Dec ${dms(n.decJ)}`);
        lines.push(`2. Precessed to tonight's equinox:   RA ${hms(n.raD)}   Dec ${dms(n.decD)}`);
        lines.push('   Earth’s axis wobbles once in about 26,000 years, so the grid itself drifts.');
    } else {
        lines.push(`1. Position tonight (equinox of date): RA ${hms(n.raD)}   Dec ${dms(n.decD)}`);
        lines.push('   A planet moves, so there is no fixed catalog line for it.');
    }
    lines.push(`3. Local sidereal time:               ${hms(n.lst)}`);
    lines.push('   The RA that is on your meridian right now. It runs 3 min 56 s ahead of the clock each day.');
    lines.push(`4. Hour angle = LST - RA:             ${hms(Math.abs(n.ha))} ${n.ha < 0 ? 'east of the meridian (still rising)' : 'west of the meridian (past its highest)'}`);
    lines.push('5. Altitude:   sin(alt) = sin(lat) sin(dec) + cos(lat) cos(dec) cos(HA)');
    lines.push(`               = ${deg(n.altAirless, 2)} airless, ${deg(n.alt, 2)} with refraction`);
    lines.push('   Air bends light upward near the horizon: about half a degree at the horizon, nothing overhead.');
    lines.push('6. Azimuth:    from north through east');
    lines.push(`               = ${deg(n.az, 2)} (${S.compassLetter(n.az)})`);
    lines.push('');
    lines.push(`Its highest point tonight is ${deg(90 - Math.abs(lat - n.decD), 1)} above the horizon (90 - |lat - dec|).`);
    return lines.join('\n');
}
