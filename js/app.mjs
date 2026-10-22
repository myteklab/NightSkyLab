// Night Sky Lab: the app shell. State, the save shape, the frame (place and time), the canvas
// and its drags, the time strip, the found list. Screens live in screens.mjs, the first-minute
// guide and the tour player in guide.mjs, card text in cards.mjs. The platform adapter talks
// only to window.NightSky.
import * as S from './sky.mjs?v=1';
import { View, render, pick, skyLimit } from './draw.mjs?v=1';
import { cardFor } from './cards.mjs?v=1';
import { initGuide } from './guide.mjs?v=1';
import { initScreens } from './screens.mjs?v=1';
import { esc, clock } from './words.mjs?v=1';

S.useEngine(window.Astronomy);

const $ = (id) => document.getElementById(id);
export const SAMPLE_PLACE = { name: 'Denver', country: 'US', lat: 40, lon: -105, zone: 'America/Denver', sample: true };
export const LITTLE_SET = ['uma', 'umi', 'ori', 'cas', 'leo', 'sco', 'cyg', 'cru'];
export const DARK = { city: 4.0, park: 6.0 };

export function blankProject() {
    return {
        v: 1, mode: 'explorer',
        place: { ...SAMPLE_PLACE },
        when: { date: '', time: '20:00', now: false },
        view: { az: 0, alt: 25, zoom: 1, layers: ['starnames'], dark: 4.5 },
        found: [], did: [], moonLog: [], dipper: [],
        darkSky: { city: DARK.city, park: DARK.park, note: '' },
        party: { title: '', date: '', from: '', to: '', where: '', targets: [], bring: [], who: '' },
        log: [],
        mine: { name: '', story: '', lines: [] },
        tour: [],
        programs: { code: '' }
    };
}

// "tonight" in a zone: the evening that has started or is about to; before 4 am it is still last night
function tonight(zone) {
    const now = new Date(Date.now() - 4 * 3600000);
    return S.localParts(now, zone).date;
}

const ctx = {
    S, $, DARK, LITTLE_SET,
    project: blankProject(),
    view: new View(),
    frame: null,
    hor: new Float32Array(S.N * 3),
    bodies: [],
    sunAlt: -30,
    dirty: false,
    dirtyCb: null,
    name: 'Night sky',
    compare: false,
    pointer: null,         // {from, to, t} the guided pointer line
    highlight: new Set(),  // constellation ids drawn in gold
    ringsExtra: [],
    guideLines: null,      // line segs the guide wants drawn when no layer is on
    draw, recompute, markDirty, setPlace, setWhen, setMode, openCard, closeCard, flyTo, addFound, addDid, hasDid,
    chip, say, localNow, placeTime, stripToWhen, whenToStrip, syncStrip, strip: $('timeStrip')
};

// ---- dirty and names -----------------------------------------------------------------------
function markDirty() { if (!ctx.dirty) { ctx.dirty = true; if (ctx.dirtyCb) ctx.dirtyCb(true); } }
function markClean() { if (ctx.dirty) { ctx.dirty = false; if (ctx.dirtyCb) ctx.dirtyCb(false); } }

// ---- place and time -------------------------------------------------------------------------
function placeTime() { return S.localToDate(ctx.project.when.date, ctx.project.when.time, ctx.project.place.zone); }
function localNow() { return S.localParts(new Date(), ctx.project.place.zone); }

function setPlace(p) {
    ctx.project.place = S.roundPlace(p);
    if (p.sample) ctx.project.place.sample = true;
    $('sample').hidden = !ctx.project.place.sample;
    $('btnPlace').innerHTML = ctx.project.place.sample ? 'Where are you? <u>Pick a city</u>' : esc(ctx.project.place.name) + (ctx.project.place.country ? ', ' + esc(ctx.project.place.country) : '');
    if (!ctx.project.when.date) ctx.project.when.date = tonight(ctx.project.place.zone);
    recompute();
    if (!p.sample) markDirty();
}
function setWhen(date, time, now) {
    ctx.project.when = { date, time, now: !!now };
    recompute();
    markDirty();
}

// the strip runs from noon to noon in five minute steps; the night's date is the strip's left end
function nightOf(when) { return Number(when.time.slice(0, 2)) < 12 ? S.addDays(when.date, -1) : when.date; }
function whenToStrip(when) {
    const [h, m] = when.time.split(':').map(Number);
    const mins = h < 12 ? (h + 12) * 60 + m : (h - 12) * 60 + m;
    return Math.round(mins / 5);
}
function stripToWhen(night, step) {
    const mins = step * 5;
    const h = Math.floor(mins / 60), m = mins % 60;
    const hh = (h + 12) % 24;
    return { date: h >= 12 ? S.addDays(night, 1) : night, time: `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
}
function syncStrip() {
    const w = ctx.project.when;
    ctx.strip.value = whenToStrip(w);
    const d = placeTime();
    const lp = S.localParts(d, ctx.project.place.zone);
    $('stripTime').textContent = clock(lp);
    const night = nightOf(w);
    const [y, mo, dd] = night.split('-').map(Number);
    const label = new Date(Date.UTC(y, mo - 1, dd)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
    $('stripDate').textContent = (night === tonight(ctx.project.place.zone) ? 'Tonight, ' : 'Night of ') + label;
    $('btnWhen').textContent = label + ', ' + clock(lp);
}

// ---- the frame ------------------------------------------------------------------------------
let raf = 0;
function recompute() {
    const p = ctx.project;
    if (!p.when.date) p.when.date = tonight(p.place.zone);
    ctx.frame = S.makeFrame(p.place, placeTime());
    S.starVectors(ctx.frame, ctx.hor);
    ctx.bodies = S.bodiesAt(ctx.frame);
    ctx.sunAlt = ctx.bodies.find(b => b.id === 'sun').alt;
    syncStrip();
    draw();
    document.dispatchEvent(new CustomEvent('nightsky:frame'));
}

function constellationHor(c) {
    const r = ctx.frame.rot, a = c.ra * Math.PI / 180, d = c.dec * Math.PI / 180, k = Math.cos(d);
    const x = k * Math.cos(a), y = k * Math.sin(a), z = Math.sin(d);
    return [r[0] * x + r[1] * y + r[2] * z, r[3] * x + r[4] * y + r[5] * z, r[6] * x + r[7] * y + r[8] * z];
}
export function starHor(i) { return [ctx.hor[i * 3], ctx.hor[i * 3 + 1], ctx.hor[i * 3 + 2]]; }
ctx.starHor = starHor;
ctx.constellationHor = constellationHor;

function layers() { return new Set(ctx.project.view.layers); }

function buildScene(limit) {
    const p = ctx.project, L = layers(), mode = p.mode;
    const lineSets = [];
    const little = mode === 'little';
    if (L.has('lines')) {
        const segs = [];
        for (const c of S.CONSTELLATIONS) {
            if (little && !LITTLE_SET.includes(c.id)) continue;
            if (ctx.highlight.has(c.id)) continue;
            if (little && c.id === 'uma') { segs.push(...S.ASTERISMS.dipper); continue; }
            segs.push(...S.LINES[c.id]);
        }
        lineSets.push({ segs, color: 'rgba(120,150,230,0.55)', width: 1 });
    }
    if (ctx.guideLines) lineSets.push({ segs: ctx.guideLines, color: 'rgba(255,214,110,0.9)', width: 1.6 });
    for (const id of ctx.highlight) lineSets.push({ segs: id === 'uma' ? S.ASTERISMS.dipper : (id === 'dipper' ? S.ASTERISMS.dipper : S.LINES[id]), color: 'rgba(255,214,110,0.9)', width: 1.6 });

    const labels = [];
    if (L.has('names')) for (const c of S.CONSTELLATIONS) {
        if (little && !LITTLE_SET.includes(c.id)) continue;
        labels.push({ kind: 'con', id: c.id, hor: constellationHor(c), text: c.id === 'uma' && little ? 'Big Dipper' : c.name });
    }
    for (const b of ctx.bodies) if (b.id !== 'sun' || b.alt > -1) labels.push({ kind: 'body', hor: b.hor, text: b.name, size: little ? 15 : 12 });
    if (L.has('starnames')) {
        const thresh = little ? 0.6 : (mode === 'astronomer' ? 2.2 : 1.6) + Math.log2(ctx.view.zoom) * 1.2;
        for (let i = 0; i < S.N; i++) {
            if (S.MAG[i] > thresh) break;
            const name = S.NAMES[S.HR[i]];
            if (!name || ctx.hor[i * 3 + 2] < 0) continue;
            labels.push({ kind: 'star', hor: starHor(i), text: name, size: little ? 14 : 12 });
        }
    }
    const rings = [...ctx.ringsExtra];
    for (const f of p.found) {
        if (f.kind === 'star') { const i = S.starIndexById(f.id); if (i !== undefined) rings.push({ hor: starHor(i), r: 10 }); }
        else if (f.kind === 'planet' || f.kind === 'moon') { const b = ctx.bodies.find(x => x.id === f.id); if (b) rings.push({ hor: b.hor, r: f.kind === 'moon' ? 16 : 9 }); }
    }
    return {
        hor: ctx.hor, bodies: ctx.bodies, sunAlt: ctx.sunAlt, limit,
        lineSets, labels, rings, pointer: ctx.pointer,
        grids: mode === 'astronomer' ? { altaz: L.has('altaz'), radec: L.has('radec'), rot: ctx.frame.rot } : null,
        big: little, compassAll: mode === 'astronomer'
    };
}
ctx.buildScene = buildScene;

const canvas = $('sky');
const g2d = canvas.getContext('2d');
function fit() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.view.setSize(r.width, r.height);
}
function draw() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
        raf = 0;
        if (!ctx.frame) return;
        const w = ctx.view.w, h = ctx.view.h;
        if (ctx.compare) {
            render(g2d, ctx.view, buildScene(ctx.project.darkSky.city), [0, 0, w / 2, h]);
            render(g2d, ctx.view, buildScene(ctx.project.darkSky.park), [w / 2, 0, w / 2, h]);
            g2d.fillStyle = 'rgba(255,255,255,0.5)'; g2d.fillRect(w / 2 - 0.5, 0, 1, h);
        } else {
            render(g2d, ctx.view, buildScene(ctx.project.view.dark));
        }
        $('compareLabels').hidden = !ctx.compare;
    });
}
window.addEventListener('resize', () => { fit(); draw(); });

// ---- drags, taps, wheel, keys --------------------------------------------------------------
let drag = null;
let pinch = null;
const pointers = new Map();
canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d0: Math.hypot(a[0] - b[0], a[1] - b[1]), z0: ctx.view.zoom };
        drag = null;
        return;
    }
    canvas.setPointerCapture(e.pointerId);
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    // the guide may claim the drag (the pointer line starts at Merak)
    if (ctx.guide && ctx.guide.claimDrag && ctx.guide.claimDrag(x, y)) { drag = { guide: true, x0: x, y0: y }; return; }
    drag = { x0: x, y0: y, az: ctx.view.az, alt: ctx.view.alt, moved: false };
    canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        setZoom(pinch.z0 * d / pinch.d0);
        return;
    }
    if (!drag) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (drag.guide) { ctx.guide.moveDrag(x, y); return; }
    const dx = x - drag.x0, dy = y - drag.y0;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    const k = ctx.view.degPerPx();
    ctx.view.look(drag.az - dx * k, drag.alt + dy * k);
    draw();
});
function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!drag) return;
    canvas.classList.remove('dragging');
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const d = drag; drag = null;
    if (d.guide) { ctx.guide.endDrag(x, y); return; }
    if (d.moved) { ctx.project.view.az = Math.round(ctx.view.az * 10) / 10; ctx.project.view.alt = Math.round(ctx.view.alt * 10) / 10; markDirty(); return; }
    if (e.type === 'pointercancel') return;
    tap(x, y);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(ctx.view.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
function setZoom(z) {
    ctx.view.zoom = Math.max(1, Math.min(8, z));
    ctx.project.view.zoom = Math.round(ctx.view.zoom * 100) / 100;
    draw();
}
$('zoomIn').addEventListener('click', () => setZoom(ctx.view.zoom * 1.5));
$('zoomOut').addEventListener('click', () => setZoom(ctx.view.zoom / 1.5));
document.querySelectorAll('#compass button[data-az]').forEach(b => b.addEventListener('click', () => flyTo({ az: Number(b.dataset.az), alt: 25 })));
document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, dialog')) return;
    const step = 5 / ctx.view.zoom;
    if (e.key === 'ArrowLeft') ctx.view.look(ctx.view.az - step, ctx.view.alt);
    else if (e.key === 'ArrowRight') ctx.view.look(ctx.view.az + step, ctx.view.alt);
    else if (e.key === 'ArrowUp') ctx.view.look(ctx.view.az, ctx.view.alt + step);
    else if (e.key === 'ArrowDown') ctx.view.look(ctx.view.az, ctx.view.alt - step);
    else if (e.key === '+' || e.key === '=') { setZoom(ctx.view.zoom * 1.3); return; }
    else if (e.key === '-') { setZoom(ctx.view.zoom / 1.3); return; }
    else return;
    e.preventDefault();
    draw();
});

function tap(x, y) {
    const hit = pick(ctx.view, buildScene(ctx.compare ? ctx.project.darkSky.park : ctx.project.view.dark), x, y);
    if (ctx.guide && ctx.guide.onTap && ctx.guide.onTap(hit)) return;
    if (hit) openCard(hit); else closeCard();
}

// smooth turn of the view toward a direction, or toward a thing on the sky
let flyAnim = 0;
function flyTo(target, done) {
    let az, alt;
    if (target.hor) { const aa = S.horToAltAz(target.hor[0], target.hor[1], target.hor[2]); az = aa.az; alt = Math.max(8, Math.min(70, aa.alt)); }
    else { az = target.az; alt = target.alt; }
    const a0 = ctx.view.az, e0 = ctx.view.alt;
    let daz = ((az - a0 + 540) % 360) - 180;
    let t0 = null;
    const dur = 600;
    cancelAnimationFrame(flyAnim);
    // the clock is the frame's own timestamp, so the first frame is t = 0 wherever it is called from
    const step = (now) => {
        if (t0 === null) t0 = now;
        const t = Math.min(1, (now - t0) / dur), k = t * t * (3 - 2 * t);
        ctx.view.look(a0 + daz * k, e0 + (alt - e0) * k);
        draw();
        if (t < 1) flyAnim = requestAnimationFrame(step);
        else { ctx.project.view.az = Math.round(ctx.view.az * 10) / 10; ctx.project.view.alt = Math.round(ctx.view.alt * 10) / 10; if (done) done(); }
    };
    flyAnim = requestAnimationFrame(step);
}

// ---- the card -------------------------------------------------------------------------------
let cardHit = null;
function openCard(hit) {
    const card = cardFor(ctx, hit);
    if (!card) return;
    cardHit = { ...hit, card };
    $('cardName').textContent = card.name;
    $('cardKind').textContent = card.kind;
    $('cardBody').innerHTML = card.html;
    const f = $('cardFound');
    f.hidden = !card.found;
    const already = card.found && ctx.project.found.some(x => x.kind === card.found.kind && x.id === card.found.id);
    f.textContent = already ? 'Found' : 'Found it';
    f.classList.toggle('done', already);
    $('cardFly').hidden = !card.hor;
    $('cardMoon').hidden = hit.kind !== 'moon';
    $('cardNumbers').hidden = !card.numbers;
    $('card').hidden = false;
    ctx.ringsExtra = card.hor ? [{ hor: card.hor, r: card.ringR || 14, color: 'rgba(110,168,255,0.9)' }] : [];
    draw();
}
function closeCard() { $('card').hidden = true; cardHit = null; ctx.ringsExtra = []; draw(); }
$('cardClose').addEventListener('click', closeCard);
$('cardFound').addEventListener('click', () => {
    if (!cardHit || !cardHit.card.found) return;
    addFound(cardHit.card.found.kind, cardHit.card.found.id);
    $('cardFound').textContent = 'Found'; $('cardFound').classList.add('done');
    if (cardHit.card.found.kind === 'constellation') ctx.highlight.add(cardHit.card.found.id);
    draw();
});
$('cardFly').addEventListener('click', () => { if (cardHit && cardHit.card.hor) flyTo({ hor: cardHit.card.hor }); });
$('cardSay').addEventListener('click', () => { if (cardHit) say(cardHit.card.name + '. ' + $('cardBody').textContent); });
$('cardNumbers').addEventListener('click', () => { if (cardHit && cardHit.card.numbers) { $('numbersBody').textContent = cardHit.card.numbers(); $('numbersDialog').showModal(); } });
$('cardMoon').addEventListener('click', () => { closeCard(); $('btnMoon').click(); });

function say(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    speechSynthesis.speak(u);
}

// ---- found and did ------------------------------------------------------------------------
function addFound(kind, id) {
    const p = ctx.project;
    if (p.found.some(f => f.kind === kind && f.id === id)) return false;
    p.found.push({ kind, id, date: p.when.date });
    chip(labelFor(kind, id));
    markDirty();
    document.dispatchEvent(new CustomEvent('nightsky:found', { detail: { kind, id } }));
    return true;
}
function hasDid(id) { return ctx.project.did.includes(id); }
function addDid(id) {
    if (hasDid(id)) return false;
    ctx.project.did.push(id);
    markDirty();
    document.dispatchEvent(new CustomEvent('nightsky:did', { detail: { id } }));
    return true;
}
export function labelFor(kind, id) {
    if (kind === 'constellation') return id === 'uma' ? 'Big Dipper' : (S.CONST_BY_ID[id] ? S.CONST_BY_ID[id].name : id);
    if (kind === 'star') { const i = S.starIndexById(id); return i === undefined ? id : S.starName(i); }
    if (kind === 'moon') return 'the Moon';
    return S.bodyName(id) || id;
}
ctx.labelFor = labelFor;
function chip(text) {
    const el = document.createElement('span');
    el.className = 'chip';
    el.textContent = 'Found: ' + text;
    $('chips').appendChild(el);
    while ($('chips').children.length > 6) $('chips').removeChild($('chips').firstChild);
}
function refreshChips() {
    $('chips').innerHTML = '';
    for (const f of ctx.project.found.slice(-6)) chip(labelFor(f.kind, f.id));
}

// ---- modes and layers -----------------------------------------------------------------------
function setMode(mode) {
    ctx.project.mode = mode;
    document.body.dataset.mode = mode;
    const r = $('mode' + mode[0].toUpperCase() + mode.slice(1));
    if (r) r.checked = true;
    if (mode === 'little' && !ctx.project.view.layers.includes('lines')) toggleLayer('lines', true);
    draw();
    markDirty();
}
document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => setMode(r.value)));
const LAYER_BOX = { lines: 'layerLines', names: 'layerNames', starnames: 'layerStarNames', altaz: 'layerAltAz', radec: 'layerRaDec' };
function toggleLayer(key, on) {
    const L = new Set(ctx.project.view.layers);
    if (on) L.add(key); else L.delete(key);
    ctx.project.view.layers = [...L];
    $(LAYER_BOX[key]).checked = on;
    draw();
    markDirty();
}
for (const [key, id] of Object.entries(LAYER_BOX)) $(id).addEventListener('change', () => toggleLayer(key, $(id).checked));
function syncLayerBoxes() { for (const [key, id] of Object.entries(LAYER_BOX)) $(id).checked = ctx.project.view.layers.includes(key); }
ctx.toggleLayer = toggleLayer;

// ---- time strip ---------------------------------------------------------------------------
let travel = 0, lastStep = null;
ctx.strip.addEventListener('input', () => {
    const step = Number(ctx.strip.value);
    if (lastStep !== null) travel += Math.abs(step - lastStep);
    lastStep = step;
    const w = stripToWhen(nightOf(ctx.project.when), step);
    ctx.project.when = { date: w.date, time: w.time, now: false };
    recompute();
    if (travel >= 36) addDid('turn-night');
});
ctx.strip.addEventListener('change', markDirty);
$('btnNow').addEventListener('click', () => { const lp = localNow(); setWhen(lp.date, lp.time, true); });
$('btnWhen').addEventListener('click', () => $('whenDialog').showModal());
$('btnPlace').addEventListener('click', () => $('placeDialog').showModal());
$('btnMore').addEventListener('click', () => $('moreDialog').showModal());

// ---- save and load ------------------------------------------------------------------------
function serializeProjectData() {
    const p = ctx.project;
    p.view.az = Math.round(ctx.view.az * 10) / 10;
    p.view.alt = Math.round(ctx.view.alt * 10) / 10;
    p.view.zoom = Math.round(ctx.view.zoom * 100) / 100;
    return JSON.parse(JSON.stringify(p));
}
function loadProjectData(data) {
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = null; } }
    const fresh = blankProject();
    if (!data || typeof data !== 'object' || !data.place) { applyProject(fresh); return; }
    // every key the shape knows, with the blank shape filling anything an older save lacks
    const p = { ...fresh, ...data };
    for (const k of ['view', 'darkSky', 'party', 'mine', 'programs', 'when']) p[k] = { ...fresh[k], ...(data[k] || {}) };
    for (const k of ['found', 'did', 'moonLog', 'dipper', 'log', 'tour']) if (!Array.isArray(p[k])) p[k] = [];
    p.place = S.roundPlace({ ...fresh.place, ...data.place });
    if (data.place.sample) p.place.sample = true;
    if (!['little', 'explorer', 'astronomer'].includes(p.mode)) p.mode = 'explorer';
    p.v = 1;
    applyProject(p);
}
function applyProject(p) {
    ctx.project = p;
    ctx.highlight = new Set(p.found.filter(f => f.kind === 'constellation').map(f => f.id));
    ctx.view.look(p.view.az, p.view.alt);
    ctx.view.zoom = Math.max(1, Math.min(8, p.view.zoom || 1));
    document.body.dataset.mode = p.mode;
    const r = $('mode' + p.mode[0].toUpperCase() + p.mode.slice(1)); if (r) r.checked = true;
    syncLayerBoxes();
    refreshChips();
    if (p.when.now) { const lp = S.localParts(new Date(), p.place.zone); p.when.date = lp.date; p.when.time = lp.time; }
    setPlace(p.place);
    closeCard();
    document.dispatchEvent(new CustomEvent('nightsky:loaded'));
    markClean();
}
function isRun(data) { return !!(data && (typeof data === 'string' ? data.length > 2 : data.place)); }

// a picture of the sky as saved, for the gallery: party targets ringed, no place name
function previewDataUrl() {
    const off = document.createElement('canvas');
    off.width = 800; off.height = 500;
    const v = new View(); v.setSize(800, 500); v.az = ctx.view.az; v.alt = ctx.view.alt; v.zoom = ctx.view.zoom;
    const scene = buildScene(ctx.project.view.dark);
    scene.rings = scene.rings.slice();
    for (const t of ctx.project.party.targets || []) {
        const b = ctx.bodies.find(x => x.id === t.id);
        if (b) scene.rings.push({ hor: b.hor, r: 14, color: 'rgba(255,214,110,0.95)' });
    }
    render(off.getContext('2d'), v, scene);
    return Promise.resolve(off.toDataURL('image/png'));
}

// what the menu search reads: every constellation, named star, planet and the Moon
function searchData() {
    return {
        constellations: S.CONSTELLATIONS.map(c => ({ id: c.id, name: c.name, english: c.english })),
        stars: Object.entries(S.NAMES).map(([hr, name]) => ({ id: S.starId(S.indexOfHr(Number(hr))), name, con: S.CONST_BY_ID[S.starConstellation(S.indexOfHr(Number(hr)))] })).filter(s => s.id),
        bodies: ['moon', ...S.PLANETS].map(id => ({ id, name: S.bodyName(id) }))
    };
}
function goTo(kind, id) {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    if (kind === 'constellation') { const c = S.CONST_BY_ID[id]; if (!c) return; const hor = constellationHor(c); flyTo({ hor }, () => openCard({ kind: 'constellation', id })); }
    else if (kind === 'star') { const i = S.starIndexById(id); if (i === undefined) return; flyTo({ hor: starHor(i) }, () => openCard({ kind: 'star', i })); }
    else if (kind === 'body') { const b = ctx.bodies.find(x => x.id === id); if (!b) return; flyTo({ hor: b.hor }, () => openCard({ kind: id === 'moon' ? 'moon' : 'planet', id })); }
}

window.NightSky = {
    serializeProjectData, loadProjectData, isRun, previewDataUrl, searchData, goTo,
    setName(n) { ctx.name = n || 'Night sky'; },
    onDirty(cb) { ctx.dirtyCb = cb; },
    isDirty() { return ctx.dirty; },
    markClean,
    setDefaultTheme(t) { document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark'; },
    state: ctx
};
window.serializeProjectData = serializeProjectData;
window.loadProjectData = loadProjectData;

// ---- start ----------------------------------------------------------------------------------
fit();
initScreens(ctx);
ctx.guide = initGuide(ctx);
applyProject(blankProject());
ctx.guide.start();
window.dispatchEvent(new Event('nightskylab:ready'));
