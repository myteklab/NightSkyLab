// The sky on a canvas. Positions come in as horizontal unit vectors from sky.mjs; this file
// only projects and paints. Stereographic around the view direction, so a constellation near
// the edge keeps its shape. Canvas 2D on purpose: about three thousand dots and seven hundred
// short lines is light work, and there is no GPU context to lose on a school Chromebook.
import * as S from './sky.mjs?v=1';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const FOV1 = 100;          // degrees across the long side at zoom 1

export class View {
    constructor() { this.az = 0; this.alt = 25; this.zoom = 1; this.w = 800; this.h = 500; this.chart = false; }
    setSize(w, h) { this.w = w; this.h = h; }
    fov() { return this.chart ? 190 : FOV1 / this.zoom; }
    // pixels per unit of the stereographic plane
    scale() { return (Math.max(this.w, this.h) / 2) / (2 * Math.tan(this.fov() / 4 * D2R)); }
    basis() {
        const az = (this.chart ? 180 : this.az) * D2R, alt = (this.chart ? 89.999 : this.alt) * D2R;
        const ca = Math.cos(alt), sa = Math.sin(alt), cz = Math.cos(az), sz = Math.sin(az);
        const c = [ca * cz, -ca * sz, sa];
        const up = [-sa * cz, sa * sz, ca];
        const right = [c[1] * up[2] - c[2] * up[1], c[2] * up[0] - c[0] * up[2], c[0] * up[1] - c[1] * up[0]];
        return { c, up, right };
    }
    // a projector closed over the current basis: returns [px, py, cosTheta] or null when behind
    projector() {
        const { c, up, right } = this.basis();
        const s = this.scale(), cx = this.w / 2, cy = this.h / 2;
        const limit = this.chart ? -0.35 : -0.6;
        return (x, y, z) => {
            const d = x * c[0] + y * c[1] + z * c[2];
            if (d < limit) return null;
            const k = s * 2 / (1 + d);
            return [cx + k * (x * right[0] + y * right[1] + z * right[2]), cy - k * (x * up[0] + y * up[1] + z * up[2]), d];
        };
    }
    unproject(px, py) {
        const { c, up, right } = this.basis();
        const s = this.scale();
        const X = (px - this.w / 2) / s, Y = (this.h / 2 - py) / s;
        const r = Math.hypot(X, Y);
        const theta = 2 * Math.atan(r / 2);
        if (r < 1e-9) return c;
        const st = Math.sin(theta), ct = Math.cos(theta);
        return [ct * c[0] + st * (X * right[0] + Y * up[0]) / r, ct * c[1] + st * (X * right[1] + Y * up[1]) / r, ct * c[2] + st * (X * right[2] + Y * up[2]) / r];
    }
    // degrees of sky per pixel at the center
    degPerPx() { return 1 / (this.scale() * D2R); }
    look(az, alt) {
        this.az = ((az % 360) + 360) % 360;
        this.alt = Math.max(-12, Math.min(89, alt));
    }
}

// ---- sprites: one glow per size bin and color class, drawn once --------------------------
const sprites = new Map();
function sprite(radius, color) {
    const key = radius + color;
    let sp = sprites.get(key);
    if (sp) return sp;
    const size = Math.ceil(radius * 5) + 2;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const m = size / 2;
    const grad = g.createRadialGradient(m, m, 0, m, m, m);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(Math.min(0.5, 0.9 / radius), color);
    grad.addColorStop(Math.min(0.9, 1.6 / radius), hexAlpha(color, 0.35));
    grad.addColorStop(1, hexAlpha(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    sp = { c, half: m };
    sprites.set(key, sp);
    return sp;
}
function hexAlpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

const BODY_COLOR = { mercury: '#d9d2c5', venus: '#fff9e6', mars: '#ff9a5c', jupiter: '#f5e6c8', saturn: '#f2e2b0' };

// sky colors by how dark it is: 1 is full night, 0 is day
function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// how faint a star the sky itself allows, before the dark sky slider
export function skyLimit(sunAlt) {
    if (sunAlt <= -18) return 99;
    if (sunAlt <= -12) return 6.5;
    if (sunAlt <= -6) return 3.2 + (-6 - sunAlt) / 6 * 3.3;
    if (sunAlt <= 0) return -1.5 + (-sunAlt) / 6 * 4.7;
    return -5;
}

// radius in pixels for a magnitude at this zoom
export function starRadius(mag, limit, view, big) {
    const z = 1 + 0.35 * Math.log2(view.zoom);
    const r = (Math.min(limit, 6.5) + 1.2 - mag) * 0.42 * z * (big ? 1.5 : 1);
    return Math.max(0.7, Math.min(10, r));
}

/**
 * scene: everything the frame decided.
 *   hor            Float32Array of star vectors
 *   bodies         [{id, hor, alt, az, mag, fraction, phaseAngle, sunDir}]
 *   sunAlt         degrees
 *   limit          the dark sky limiting magnitude
 *   lineSets       [{segs: [[hr, hr]], color, width, alpha}]
 *   labels         [{hor, text, kind: 'con'|'star'|'body', size}]
 *   rings          [{hor, r, color}]  soft rings around found things
 *   pointer        {from: hor, to: hor, t: 0..1, color}  the guided pointer line
 *   grids          {altaz: bool, radec: bool, rot: frame.rot}
 *   big            Little mode: bigger stars and Moon
 *   compassAll     show NE SE SW NW too
 */
export function render(ctx, view, scene, clip) {
    const { w, h } = view;
    const P = view.projector();
    ctx.save();
    if (clip) { ctx.beginPath(); ctx.rect(clip[0], clip[1], clip[2], clip[3]); ctx.clip(); }

    // sky
    const dark = S.darkness(scene.sunAlt);
    const twilight = scene.sunAlt > -18 && scene.sunAlt < 2 ? 1 - Math.abs(scene.sunAlt + 8) / 10 : 0;
    const top = mix(mix('#4a90e2', '#070b16', dark), '#2b3a6a', Math.max(0, twilight) * 0.3);
    const low = mix(mix('#a9d0f5', '#101a33', dark), '#d9823b', Math.max(0, twilight) * 0.55);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, top);
    grad.addColorStop(1, low);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // milky glow toward the horizon at night helps the ground read as ground
    const limit = Math.min(scene.limit, skyLimit(scene.sunAlt));

    if (scene.grids && (scene.grids.altaz || scene.grids.radec)) drawGrids(ctx, P, scene.grids, view);

    // constellation lines
    for (const set of scene.lineSets) {
        ctx.strokeStyle = set.color;
        ctx.lineWidth = set.width || 1;
        ctx.globalAlpha = set.alpha === undefined ? 1 : set.alpha;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const [a, b] of set.segs) {
            const i = S.indexOfHr(a), j = S.indexOfHr(b);
            if (i === undefined || j === undefined) continue;
            const pa = P(scene.hor[i * 3], scene.hor[i * 3 + 1], scene.hor[i * 3 + 2]);
            const pb = P(scene.hor[j * 3], scene.hor[j * 3 + 1], scene.hor[j * 3 + 2]);
            if (!pa || !pb) continue;
            if (pa[2] < 0.05 && pb[2] < 0.05) continue;
            ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // stars, brightest first, until the limit cuts the loop
    const hor = scene.hor;
    const fade = 0.8;
    for (let i = 0; i < S.N; i++) {
        const mag = S.MAG[i];
        if (mag > limit) break;
        const z = hor[i * 3 + 2];
        if (z < -0.02) continue;
        const p = P(hor[i * 3], hor[i * 3 + 1], z);
        if (!p || p[0] < -12 || p[1] < -12 || p[0] > w + 12 || p[1] > h + 12) continue;
        const r = starRadius(mag, limit, view, scene.big);
        const sp = sprite(Math.round(r * 4) / 4, S.STAR_COLORS[S.bvClass(S.BV[i])]);
        if (limit - mag < fade) ctx.globalAlpha = Math.max(0.15, (limit - mag) / fade);
        ctx.drawImage(sp.c, p[0] - sp.half, p[1] - sp.half);
        if (limit - mag < fade) ctx.globalAlpha = 1;
    }

    // Sun, Moon, planets
    for (const b of scene.bodies) {
        if (b.id === 'sun' && b.alt < -1) continue;
        if (b.hor[2] < -0.03) continue;
        const p = P(b.hor[0], b.hor[1], b.hor[2]);
        if (!p) continue;
        if (b.id === 'sun') drawSun(ctx, p, view);
        else if (b.id === 'moon') drawMoon(ctx, p, b, view, P, scene.big);
        else {
            const r = Math.max(2.4, starRadius(b.mag, limit, view, scene.big) * 1.1);
            const sp = sprite(Math.round(r * 4) / 4, BODY_COLOR[b.id]);
            ctx.drawImage(sp.c, p[0] - sp.half, p[1] - sp.half);
        }
    }

    // rings around found things, and the pointer line
    for (const ring of scene.rings || []) {
        const p = P(ring.hor[0], ring.hor[1], ring.hor[2]);
        if (!p || ring.hor[2] < 0) continue;
        ctx.strokeStyle = ring.color || 'rgba(255,214,110,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p[0], p[1], ring.r || 11, 0, Math.PI * 2); ctx.stroke();
    }
    if (scene.pointer && scene.pointer.t > 0) drawPointer(ctx, P, scene.pointer);

    // ground: everything outside the horizon circle, with a low treeline along it
    drawGround(ctx, view, P, dark);

    // compass letters sit on the horizon
    drawCompass(ctx, P, view, scene.compassAll || view.zoom > 2.5);

    // labels last, each one skipping any it would cover
    drawLabels(ctx, P, scene.labels || [], view, w, h);
    ctx.restore();
}

function drawSun(ctx, p, view) {
    const r = Math.max(9, 0.27 / view.degPerPx());
    const g = ctx.createRadialGradient(p[0], p[1], r * 0.4, p[0], p[1], r * 6);
    g.addColorStop(0, 'rgba(255,250,220,0.9)');
    g.addColorStop(0.3, 'rgba(255,240,180,0.35)');
    g.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p[0], p[1], r * 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff8dc';
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
}

function drawMoon(ctx, p, moon, view, P, big) {
    const r = Math.max(big ? 14 : 8, 0.26 / view.degPerPx());
    // the bright limb faces the Sun: take a short step from the Moon toward the Sun along the sky
    const sunHor = S.altAzToHor(moon.sunDir.az, moon.sunDir.alt);
    const d = [sunHor[0] - moon.hor[0], sunHor[1] - moon.hor[1], sunHor[2] - moon.hor[2]];
    const step = [moon.hor[0] + d[0] * 0.02, moon.hor[1] + d[1] * 0.02, moon.hor[2] + d[2] * 0.02];
    const len = Math.hypot(step[0], step[1], step[2]);
    const q = P(step[0] / len, step[1] / len, step[2] / len);
    const phi = q ? Math.atan2(q[1] - p[1], q[0] - p[0]) : 0;
    const k = Math.cos(moon.phaseAngle * D2R);   // 1 new, -1 full
    ctx.save();
    ctx.translate(p[0], p[1]);
    ctx.rotate(phi);
    // glow
    const g = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 2.4);
    const glow = Math.max(0.05, moon.fraction) * 0.45;
    g.addColorStop(0, `rgba(240,240,255,${glow})`);
    g.addColorStop(1, 'rgba(240,240,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2); ctx.fill();
    // dark disc, then the lit part
    ctx.fillStyle = 'rgba(60,64,80,0.95)';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4f2e8';
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    const a = Math.max(0.01, Math.abs(k)) * r;
    if (k < 0) ctx.ellipse(0, 0, a, r, 0, Math.PI / 2, Math.PI * 1.5, false);
    else ctx.ellipse(0, 0, a, r, 0, Math.PI / 2, Math.PI * 1.5, true);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawPointer(ctx, P, ptr) {
    // the line runs from `from` through `to`, stretched by t times five gaps
    const a = P(ptr.from[0], ptr.from[1], ptr.from[2]);
    const dir = [ptr.to[0] - ptr.from[0], ptr.to[1] - ptr.from[1], ptr.to[2] - ptr.from[2]];
    const end = [ptr.from[0] + dir[0] * (1 + 5 * ptr.t), ptr.from[1] + dir[1] * (1 + 5 * ptr.t), ptr.from[2] + dir[2] * (1 + 5 * ptr.t)];
    const len = Math.hypot(end[0], end[1], end[2]);
    const b = P(end[0] / len, end[1] / len, end[2] / len);
    if (!a || !b) return;
    ctx.save();
    ctx.strokeStyle = ptr.color || 'rgba(255,214,110,0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.restore();
}

// a low treeline, the same for every place, so the horizon reads as ground and not as a line
function bump(az) {
    const a = az * D2R;
    let v = 0.5 + 0.35 * Math.sin(a * 3 + 1) + 0.25 * Math.sin(a * 7.3 + 2) + 0.15 * Math.sin(a * 17.1);
    // trees every few degrees, heights from a fixed hash
    const t = Math.floor(az / 2.5);
    const hsh = ((t * 2654435761) >>> 0) % 100 / 100;
    const frac = az / 2.5 - t;
    if (hsh > 0.45) v += (0.5 + hsh) * Math.max(0, 1 - Math.abs(frac - 0.5) * 3.5);
    return Math.max(0.15, v);
}

function drawGround(ctx, view, P, dark) {
    const { w, h } = view;
    const groundColor = mix('#243b1e', '#06090a', dark);
    const alt0 = view.chart ? 89.999 : view.alt;
    ctx.fillStyle = groundColor;
    // the horizon great circle projects to a circle; three points fix it
    const az0 = view.chart ? 180 : view.az;
    const pts = [0, 90, 180].map(d => S.altAzToHor(az0 + d, 0)).map(v => P(v[0], v[1], v[2]));
    if (Math.abs(alt0) < 0.4 || pts.some(p => !p)) {
        // the horizon is a straight line through the middle (or nearly): fill below it
        const y = pts[0] ? pts[0][1] : h / 2;
        ctx.fillRect(0, y - 0.5, w, h - y + 1);
    } else {
        const [a, b, c] = pts;
        const circ = circleThrough(a, b, c);
        ctx.beginPath();
        if (alt0 > 0) { ctx.rect(0, 0, w, h); ctx.arc(circ.x, circ.y, circ.r, 0, Math.PI * 2, true); ctx.fill('evenodd'); }
        else { ctx.arc(circ.x, circ.y, circ.r, 0, Math.PI * 2); ctx.fill(); }
    }
    if (view.chart || alt0 > 72 || view.zoom > 3.5) return;
    // the treeline, as a strip over the 340 degrees that can be on screen
    ctx.beginPath();
    const span = 170;
    let first = true;
    for (let d = -span; d <= span; d += 0.5) {
        const v = S.altAzToHor(az0 + d, bump(((az0 + d) % 360 + 360) % 360) * Math.min(1, 1.2 / Math.sqrt(view.zoom)));
        const p = P(v[0], v[1], v[2]);
        if (!p) continue;
        if (first) { ctx.moveTo(p[0], p[1]); first = false; } else ctx.lineTo(p[0], p[1]);
    }
    for (let d = span; d >= -span; d -= 2) {
        const v = S.altAzToHor(az0 + d, -0.6);
        const p = P(v[0], v[1], v[2]);
        if (p) ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
    ctx.fill();
}

function circleThrough(a, b, c) {
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    const a2 = a[0] * a[0] + a[1] * a[1], b2 = b[0] * b[0] + b[1] * b[1], c2 = c[0] * c[0] + c[1] * c[1];
    const x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
    const y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
    return { x, y, r: Math.hypot(a[0] - x, a[1] - y) };
}

function drawCompass(ctx, P, view, all) {
    const marks = all ? [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']] : [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']];
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [az, t] of marks) {
        const v = S.altAzToHor(az, view.chart ? -3 : 0);
        const p = P(v[0], v[1], v[2]);
        if (!p || p[2] < 0.2) continue;
        const y = view.chart ? p[1] : p[1] + 14;
        if (y < -10 || y > view.h + 10 || p[0] < -20 || p[0] > view.w + 20) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        roundRect(ctx, p[0] - 12, y - 10, 24, 20, 6);
        ctx.fill();
        ctx.fillStyle = t === 'N' ? '#ffd66e' : '#e8ecf5';
        ctx.fillText(t, p[0], y + 0.5);
    }
}
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawLabels(ctx, P, labels, view, w, h) {
    const placed = [];
    ctx.textBaseline = 'middle';
    for (const l of labels) {
        if (l.hor[2] < 0.005) continue;
        const p = P(l.hor[0], l.hor[1], l.hor[2]);
        if (!p || p[2] < 0.1) continue;
        const size = l.size || (l.kind === 'con' ? 13 : 12);
        ctx.font = (l.kind === 'con' ? '500 ' : '400 ') + size + 'px system-ui, sans-serif';
        const tw = ctx.measureText(l.text).width;
        const x = l.kind === 'con' ? p[0] - tw / 2 : p[0] + (l.dx === undefined ? 9 : l.dx);
        const y = l.kind === 'con' ? p[1] : p[1] - (l.dy === undefined ? 9 : l.dy);
        if (x + tw < 0 || x > w || y < 0 || y > h) continue;
        const box = [x - 2, y - size / 2 - 1, tw + 4, size + 2];
        if (placed.some(b => b[0] < box[0] + box[2] && b[0] + b[2] > box[0] && b[1] < box[1] + box[3] && b[1] + b[3] > box[1])) continue;
        placed.push(box);
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillText(l.text, x + 1, y + 1);
        ctx.fillStyle = l.color || (l.kind === 'con' ? 'rgba(170,190,255,0.85)' : l.kind === 'body' ? '#ffe9b0' : 'rgba(235,238,250,0.9)');
        ctx.fillText(l.text, x, y);
    }
}

function drawGrids(ctx, P, grids, view) {
    ctx.save();
    ctx.lineWidth = 1;
    if (grids.altaz) {
        ctx.strokeStyle = 'rgba(120,160,255,0.22)';
        for (let alt = 0; alt < 90; alt += 10) path(ctx, P, Array.from({ length: 121 }, (_, k) => S.altAzToHor(k * 3, alt)));
        for (let az = 0; az < 360; az += 30) path(ctx, P, Array.from({ length: 31 }, (_, k) => S.altAzToHor(az, k * 3)));
    }
    if (grids.radec && grids.rot) {
        ctx.strokeStyle = 'rgba(255,170,120,0.22)';
        const r = grids.rot;
        const eq = (raDeg, decDeg) => {
            const a = raDeg * D2R, d = decDeg * D2R, c = Math.cos(d);
            const x = c * Math.cos(a), y = c * Math.sin(a), z = Math.sin(d);
            return [r[0] * x + r[1] * y + r[2] * z, r[3] * x + r[4] * y + r[5] * z, r[6] * x + r[7] * y + r[8] * z];
        };
        for (let dec = -75; dec <= 75; dec += 15) path(ctx, P, Array.from({ length: 121 }, (_, k) => eq(k * 3, dec)));
        for (let ra = 0; ra < 360; ra += 30) path(ctx, P, Array.from({ length: 61 }, (_, k) => eq(ra, -90 + k * 3)));
    }
    ctx.restore();
}
function path(ctx, P, pts) {
    ctx.beginPath();
    let pen = false;
    for (const v of pts) {
        const p = v[2] < -0.02 ? null : P(v[0], v[1], v[2]);
        if (!p || p[2] < 0.05) { pen = false; continue; }
        if (!pen) { ctx.moveTo(p[0], p[1]); pen = true; } else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
}

// the nearest thing to a screen point: a star, a body or a constellation label
export function pick(view, scene, px, py, radius = 16) {
    const P = view.projector();
    let best = null, bestD = radius;
    const limit = Math.min(scene.limit, skyLimit(scene.sunAlt));
    for (const b of scene.bodies) {
        if (b.id === 'sun' && b.alt < -1) continue;
        if (b.hor[2] < 0) continue;
        const p = P(b.hor[0], b.hor[1], b.hor[2]);
        if (!p) continue;
        const d = Math.hypot(p[0] - px, p[1] - py) - (b.id === 'moon' ? 8 : 2);
        if (d < bestD) { bestD = d; best = { kind: b.id === 'moon' || b.id === 'sun' ? b.id : 'planet', id: b.id }; }
    }
    const hor = scene.hor;
    for (let i = 0; i < S.N; i++) {
        if (S.MAG[i] > limit) break;
        if (hor[i * 3 + 2] < 0) continue;
        const p = P(hor[i * 3], hor[i * 3 + 1], hor[i * 3 + 2]);
        if (!p) continue;
        // brighter stars are easier to hit
        const d = Math.hypot(p[0] - px, p[1] - py) - Math.max(0, (4 - S.MAG[i]) * 1.2);
        if (d < bestD) { bestD = d; best = { kind: 'star', i }; }
    }
    for (const l of scene.labels || []) {
        if (l.kind !== 'con' || !l.id) continue;
        const p = P(l.hor[0], l.hor[1], l.hor[2]);
        if (!p || l.hor[2] < 0) continue;
        const d = Math.hypot(p[0] - px, p[1] - py) - 20;
        if (d < bestD) { bestD = d; best = { kind: 'constellation', id: l.id }; }
    }
    return best;
}
