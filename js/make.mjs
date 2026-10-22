// The making and measuring screens that came after the first minute: star colors, the Dipper
// clock, My constellation (tap stars to join them), the year planet chart, the Moon calendar print.
import * as S from './sky.mjs?v=4';
import { esc, clock, dateWords } from './words.mjs?v=4';
import { drawPhase } from './moonface.mjs?v=4';

export function initMake(ctx) {
    const { $ } = ctx;
    const p = () => ctx.project;
    const zone = () => ctx.project.place.zone;
    const open = (id) => { for (const d of document.querySelectorAll('dialog[open]')) if (d.id !== id) d.close(); $(id).showModal(); };

    // a short line over the sky that fades on its own
    let toastTimer = 0;
    ctx.toast = (msg) => {
        const t = $('toast');
        t.textContent = msg; t.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
    };

    // ---- star colors and temperatures --------------------------------------------------------
    $('btnColors').addEventListener('click', () => {
        open('colorsDialog');
        const rows = [];
        for (let i = 0; i < S.N && rows.length < 16; i++) {
            if (S.MAG[i] > 2.6) break;
            if (ctx.hor[i * 3 + 2] < 0.03) continue;
            const bv = S.BV[i], cls = S.bvClass(bv), t = S.bvTemperature(bv);
            rows.push(`<tr><td><span class="swatch" style="background:${S.STAR_COLORS[cls]}"></span></td><td>${esc(S.friendlyName(i))}</td><td>${cls.replace('-', ' ')}</td><td>${t ? 'about ' + t.toLocaleString('en-US') + ' K' : ''}</td>${p().mode === 'astronomer' ? `<td>${Number.isFinite(bv) ? bv.toFixed(2) : ''}</td>` : ''}<td><button type="button" data-go="${S.starId(i)}">Point me at it</button></td></tr>`);
        }
        $('colorsList').innerHTML = rows.length
            ? `<tr><th></th><th>Star</th><th>Color</th><th>Surface</th>${p().mode === 'astronomer' ? '<th>B-V</th>' : ''}<th></th></tr>` + rows.join('')
            : '<tr><td class="muted">No bright star is above the horizon at this hour. Turn the clock.</td></tr>';
        $('colorsList').querySelectorAll('button[data-go]').forEach(b => b.addEventListener('click', () => window.NightSky.goTo('star', b.dataset.go)));
        ctx.addDid('star-colors');
    });

    // ---- the Dipper clock ---------------------------------------------------------------------
    ctx.recordDipper = () => {
        const w = p().when;
        if (p().dipper.some(d => d.date === w.date && d.time === w.time)) { ctx.toast('Already recorded at this time. Move the time strip first.'); return; }
        p().dipper.push({ time: w.time, date: w.date });
        ctx.markDirty();
        ctx.toast(`Recorded the Dipper at ${clock(S.localParts(ctx.placeTime(), zone()))}. Move the clock a few hours and record it again.`);
    };
    const DIPPER = ['dubhe', 'merak', 'phecda', 'megrez', 'alioth', 'mizar', 'alkaid'].map(S.starIndexById);
    const POLARIS = S.starIndexById('polaris');
    $('btnDipperClock').addEventListener('click', () => { open('dipperDialog'); drawDipperClock(); });
    function drawDipperClock() {
        const c = $('dipperCanvas'), g = c.getContext('2d');
        const W = 420, cx = 210, cy = 210, R = 150;
        g.clearRect(0, 0, W, W);
        g.fillStyle = '#0b1532'; g.fillRect(0, 0, W, W);
        g.strokeStyle = 'rgba(255,255,255,0.15)';
        for (let k = 0; k < 24; k++) { const a = k * 15 * Math.PI / 180; g.beginPath(); g.moveTo(cx - R * Math.sin(a) * 0.96, cy - R * Math.cos(a) * 0.96); g.lineTo(cx - R * Math.sin(a) * 1.04, cy - R * Math.cos(a) * 1.04); g.stroke(); }
        g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#ffd66e'; g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill();
        g.font = '12px system-ui, sans-serif'; g.fillStyle = '#e8ecf5'; g.textAlign = 'center';
        g.fillText('Polaris', cx, cy + 18);
        const snaps = p().dipper.slice(-8);
        // the figure at each snapshot: each star placed by its hour angle around the pole, at its polar distance
        snaps.forEach((snap, n) => {
            const frame = S.makeFrame(p().place, S.localToDate(snap.date, snap.time, zone()));
            const pts = DIPPER.map(i => {
                const ha = ((frame.lst - S.RA[i] / 15) % 24 + 24) % 24 * 15 * Math.PI / 180;
                const r = R * (90 - S.DEC[i]) / 42;
                return [cx - r * Math.sin(ha), cy - r * Math.cos(ha)];
            });
            const alpha = 0.35 + 0.65 * (n + 1) / snaps.length;
            g.strokeStyle = `rgba(255,214,110,${alpha})`; g.lineWidth = 1.5;
            g.beginPath(); pts.forEach((q, k) => k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.stroke();
            g.fillStyle = `rgba(255,255,255,${alpha})`;
            for (const q of pts) { g.beginPath(); g.arc(q[0], q[1], 2.5, 0, Math.PI * 2); g.fill(); }
            const lab = pts[0];
            const dx = lab[0] - cx, dy = lab[1] - cy, len = Math.hypot(dx, dy) || 1;
            g.fillStyle = '#ffe9b0';
            g.fillText(clock(S.localParts(S.localToDate(snap.date, snap.time, zone()), zone())), cx + dx / len * (R + 22), cy + dy / len * (R + 22) + 4);
        });
        $('dipperSay').textContent = snaps.length
            ? `${snaps.length} snapshot${snaps.length === 1 ? '' : 's'}. The Dipper goes once around Polaris every 23 hours and 56 minutes, about 15 degrees an hour, because Earth turns. Three hours apart, the figures sit about 45 degrees apart.`
            : 'No snapshots yet. Open the Big Dipper’s card and press "Record where the Dipper is", then move the time strip a few hours and record it again.';
    }

    // ---- my constellation ---------------------------------------------------------------------
    const MINE_COLOR = 'rgba(255,140,220,0.95)';
    ctx.mineColor = MINE_COLOR;
    let pen = null;      // the HR number the next line starts from, while drawing
    $('btnMine').addEventListener('click', showMine);
    function showMine() {
        open('mineDialog');
        $('mineName').value = p().mine.name || '';
        $('mineStory').value = p().mine.story || '';
        $('mineSay').textContent = '';
        renderMineCount();
    }
    function renderMineCount() {
        const n = p().mine.lines.length;
        $('mineCount').textContent = n ? `${n} line${n === 1 ? '' : 's'} between ${new Set(p().mine.lines.flatMap(l => [l.a, l.b])).size} stars.` : 'No lines yet.';
        $('mineUndo').disabled = !n;
    }
    $('mineDraw').addEventListener('click', () => {
        $('mineDialog').close();
        ctx.guide.hide();
        ctx.closeCard();
        pen = null;
        ctx.drawing = { tap: drawTap };
        $('drawBar').hidden = false;
        $('drawSay').textContent = 'Tap a star, then another, to join them. Tap the last star again to lift the pen.';
        ctx.draw();
    });
    function drawTap(hit) {
        if (!hit || hit.kind !== 'star') { if (hit) ctx.toast('Only stars join. Tap a star.'); return; }
        const hr = S.HR[hit.i];
        if (pen === null) { pen = hr; }
        else if (pen === hr) { pen = null; }
        else {
            const dup = p().mine.lines.some(l => (l.a === pen && l.b === hr) || (l.a === hr && l.b === pen));
            if (!dup) { p().mine.lines.push({ a: pen, b: hr }); ctx.markDirty(); }
            pen = hr;
        }
        ctx.ringsExtra = pen === null ? [] : [{ hor: ctx.starHor(S.indexOfHr(pen)), r: 13, color: MINE_COLOR }];
        $('drawSay').textContent = pen === null ? 'Pen up. Tap a star to start a new line.' : `From ${S.friendlyName(S.indexOfHr(pen))}: tap the next star, or tap it again to lift the pen.`;
        ctx.draw();
    }
    function stopDrawing() {
        ctx.drawing = null;
        pen = null;
        ctx.ringsExtra = [];
        $('drawBar').hidden = true;
        ctx.draw();
    }
    $('drawDone').addEventListener('click', () => { stopDrawing(); showMine(); });
    $('drawUndo').addEventListener('click', () => { if (p().mine.lines.pop()) ctx.markDirty(); pen = null; ctx.ringsExtra = []; ctx.draw(); });
    $('mineUndo').addEventListener('click', () => { if (p().mine.lines.pop()) ctx.markDirty(); renderMineCount(); ctx.draw(); });
    $('mineClear').addEventListener('click', () => { p().mine.lines = []; ctx.markDirty(); renderMineCount(); ctx.draw(); });
    // the name and the story are kept only after the platform's word filters pass (standalone has none to ask)
    $('mineKeep').addEventListener('click', async () => {
        const name = $('mineName').value.trim().slice(0, 40), story = $('mineStory').value.trim().slice(0, 600);
        const say = $('mineSay');
        if (name.length < 2) { say.textContent = 'Give it a name of at least two letters.'; return; }
        say.textContent = 'Checking...';
        $('mineKeep').disabled = true;
        let ok = { nameOk: true, textOk: true };
        try { if (ctx.hooks.checkText) ok = await ctx.hooks.checkText({ name, text: story }); }
        catch (e) { ok = { nameOk: false, textOk: false, failed: true }; }
        $('mineKeep').disabled = false;
        if (ok.failed) { say.textContent = 'Could not check the words right now. Try again in a moment.'; return; }
        if (!ok.nameOk) { say.textContent = 'That name cannot go in the gallery. Pick another.'; return; }
        if (!ok.textOk) { say.textContent = 'Something in the story cannot go in the gallery. Change it and try again.'; return; }
        p().mine.name = name; p().mine.story = story;
        ctx.markDirty();
        say.textContent = 'Kept. Save the project and it goes to the gallery with your lines over the real stars.';
    });

    // ---- planets through the year ----------------------------------------------------------
    const YEAR_COLORS = { evening: '#f3b36b', all: '#7fd79a', morning: '#8fb7ff', late: '#c7a4ff', sun: '#5c6170', none: '#1c2440' };
    const YEAR_WORDS = { evening: 'evening', all: 'all night', morning: 'before dawn', late: 'late night', sun: 'too near the Sun', none: 'not up at night' };
    $('btnYear').addEventListener('click', () => { open('yearDialog'); drawYear(); ctx.addDid('planet-year'); });
    function cellState(planet, dateStr) {
        const at = (time) => {
            const frame = S.makeFrame(p().place, S.localToDate(dateStr, time, zone()));
            const sun = S.bodyAt(frame, 'sun'), pl = S.bodyAt(frame, planet);
            return { sun, pl, elong: S.angleBetween(sun.hor, pl.hor) };
        };
        const e = at('21:00'), l = at('01:00'), m = at('05:00');
        if (e.elong < 15) return 'sun';
        const ev = e.pl.alt > 8 && e.sun.alt < -6, la = l.pl.alt > 8 && l.sun.alt < -6, mo = m.pl.alt > 8 && m.sun.alt < -6;
        if (ev && mo) return 'all';
        if (ev) return 'evening';
        if (mo) return 'morning';
        if (la) return 'late';
        return 'none';
    }
    const yearCache = new Map();
    function drawYear() {
        const year = p().when.date.slice(0, 4);
        const key = `${p().place.lat},${p().place.lon},${zone()},${year}`;
        if (!yearCache.has(key)) {
            const grid = S.PLANETS.map(pl => Array.from({ length: 12 }, (_, m) => cellState(pl, `${year}-${String(m + 1).padStart(2, '0')}-15`)));
            yearCache.set(key, grid);
        }
        const grid = yearCache.get(key);
        const c = $('yearCanvas'), g = c.getContext('2d');
        const W = 720, H = 300, left = 90, top = 40, cw = (W - left - 10) / 12, ch = (H - top - 10) / 5;
        g.fillStyle = '#0b1020'; g.fillRect(0, 0, W, H);
        g.font = '12px system-ui, sans-serif'; g.textBaseline = 'middle';
        const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        g.fillStyle = '#9aa5c4'; g.textAlign = 'center';
        MONTHS.forEach((mo, m) => g.fillText(mo, left + cw * (m + 0.5), top - 14));
        S.PLANETS.forEach((pl, r) => {
            g.fillStyle = '#e9edf7'; g.textAlign = 'right';
            g.fillText(S.bodyName(pl), left - 8, top + ch * (r + 0.5));
            grid[r].forEach((st, m) => {
                g.fillStyle = YEAR_COLORS[st];
                g.fillRect(left + cw * m + 1, top + ch * r + 1, cw - 2, ch - 2);
            });
        });
        $('yearLegend').innerHTML = Object.keys(YEAR_WORDS).map(k => `<span><i style="background:${YEAR_COLORS[k]}"></i>${YEAR_WORDS[k]}</span>`).join('');
        $('yearSay').textContent = `${year}, from ${p().place.sample ? 'the sample sky' : p().place.name}, on the 15th of each month. Checked at 9 pm, 1 am and 5 am local time, a planet counts as up when it is more than eight degrees above the horizon in a dark sky.`;
    }
    $('yearPrint').addEventListener('click', () => printCanvas($('yearCanvas'), 'Planets through the year'));

    // ---- the Moon calendar print ---------------------------------------------------------------
    $('moonPrint').addEventListener('click', () => {
        const c = document.createElement('canvas');
        c.width = 720; c.height = 600;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, 720, 600);
        const first = p().when.date.slice(0, 8) + '01';
        const [y, mo] = first.split('-').map(Number);
        const start = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
        const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
        g.fillStyle = '#111'; g.font = '600 20px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        g.fillText(new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }) + ', the Moon at 9 pm', 20, 34);
        g.font = '13px system-ui, sans-serif'; g.fillStyle = '#555';
        g.fillText(`${p().place.sample ? 'Sample sky' : p().place.name}. Phases from Night Sky Lab.`, 20, 54);
        const cw = 97, chh = 86, left = 20, top = 70;
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d, k) => { g.textAlign = 'center'; g.fillText(d, left + cw * k + cw / 2, top + 14); });
        g.strokeStyle = '#bbb';
        for (let d = 1; d <= days; d++) {
            const slot = start + d - 1, col = slot % 7, row = Math.floor(slot / 7);
            const x = left + cw * col, yy = top + 24 + chh * row;
            g.strokeRect(x, yy, cw, chh);
            g.fillStyle = '#111'; g.textAlign = 'left'; g.fillText(String(d), x + 6, yy + 16);
            const ds = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const m = S.bodyAt(S.makeFrame(p().place, S.localToDate(ds, '21:00', zone())), 'moon');
            // on paper the lit part stays white and the shadow dark, with a rim so a new Moon is still a Moon
            drawPhase(g, x + cw / 2, yy + 50, 22, m.phaseAngle, p().place.lat < 0, '#ffffff', '#333333');
            g.strokeStyle = '#333'; g.lineWidth = 1;
            g.beginPath(); g.arc(x + cw / 2, yy + 50, 22, 0, Math.PI * 2); g.stroke();
            g.strokeStyle = '#bbb';
            g.fillStyle = '#555';
        }
        printCanvas(c, 'Moon calendar');
    });

    function printCanvas(canvas, alt) {
        const area = $('printArea');
        area.innerHTML = '';
        const img = document.createElement('img');
        img.src = canvas.toDataURL('image/png');
        img.alt = alt;
        area.appendChild(img);
        area.hidden = false;
        const after = () => { area.hidden = true; window.removeEventListener('afterprint', after); };
        window.addEventListener('afterprint', after);
        img.onload = () => window.print();
    }

    document.addEventListener('nightsky:loaded', () => { if (ctx.drawing) stopDrawing(); yearCache.clear(); });
}
