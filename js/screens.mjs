// Every dialog: the place picker and map, the calendar, the Moon, planets, dark sky, the star
// party plan, the observing log, the tour builder and the printable chart.
import * as S from './sky.mjs?v=4';
import { View, render, skyLimit } from './draw.mjs?v=4';
import { esc, timeAt, dateWords, clock } from './words.mjs?v=4';
import { drawPhase } from './moonface.mjs?v=4';

export function initScreens(ctx) {
    const { $ } = ctx;
    const p = () => ctx.project;
    const zone = () => ctx.project.place.zone;
    const open = (id) => { for (const d of document.querySelectorAll('dialog[open]')) if (d.id !== id) d.close(); $(id).showModal(); };

    // ---- the More menu -------------------------------------------------------------------
    const menu = { btnMoon: showMoon, btnPlanets: showPlanets, btnCalendar: () => open('whenDialog'), btnDark: showDark, btnParty: showParty, btnLog: showLog, btnTour: showTour, btnChart: showChart, btnAbout: () => open('aboutDialog'), btnNew: () => open('newDialog') };
    for (const [id, fn] of Object.entries(menu)) $(id).addEventListener('click', fn);
    $('btnGuideAgain').addEventListener('click', () => { $('moreDialog').close(); ctx.guide.start(); });
    $('newYes').addEventListener('click', () => { $('newDialog').close(); window.NightSky.loadProjectData(null); ctx.markDirty(); ctx.guide.start(); });

    // ---- place ------------------------------------------------------------------------------
    let cities = null, land = null;
    const search = $('citySearch'), list = $('cityList');
    async function loadCities() { if (!cities) cities = await import('./data/cities.mjs?v=4'); return cities; }
    $('placeDialog').addEventListener('close', () => { search.value = ''; list.innerHTML = ''; });
    $('btnPlace').addEventListener('click', () => setTimeout(() => search.focus(), 50));
    search.addEventListener('input', async () => {
        const q = search.value.trim().toLowerCase();
        list.innerHTML = '';
        if (q.length < 2) return;
        const { CITIES, ZONES } = await loadCities();
        if (search.value.trim().toLowerCase() !== q) return;   // a later keystroke owns the list now
        // cities whose name starts with the letters come first, then ones with a later word that does
        const first = [], later = [];
        for (const c of CITIES) {
            const name = c[0].toLowerCase();
            if (name.startsWith(q)) first.push(c);
            else if (name.split(/[\s-]/).some(w => w.startsWith(q))) later.push(c);
            if (first.length >= 12) break;
        }
        const hits = first.concat(later).slice(0, 12);
        if (!hits.length) { list.innerHTML = '<li class="muted">Nothing yet. Try the start of the city’s name, or the map.</li>'; return; }
        for (const c of hits) {
            const li = document.createElement('li');
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = `${c[0]}, ${c[1]}`;
            b.addEventListener('click', () => {
                ctx.setPlace({ name: c[0], country: c[1], lat: c[2] / 10, lon: c[3] / 10, zone: ZONES[c[4]] });
                $('placeDialog').close();
                placed();
            });
            li.appendChild(b); list.appendChild(li);
        }
    });
    const map = $('mapCanvas'), mg = map.getContext('2d');
    $('btnMap').addEventListener('click', async () => {
        $('mapWrap').hidden = !$('mapWrap').hidden;
        if ($('mapWrap').hidden) return;
        if (!land) land = await import('./data/land.mjs?v=4');
        drawMap();
    });
    function drawMap(mark) {
        mg.fillStyle = '#0e2a4a'; mg.fillRect(0, 0, 720, 360);
        mg.fillStyle = '#2f6b3c';
        for (const ring of land.LAND) {
            mg.beginPath();
            for (let i = 0; i < ring.length; i += 2) { const x = (ring[i] + 180) * 2, y = (90 - ring[i + 1]) * 2; if (i === 0) mg.moveTo(x, y); else mg.lineTo(x, y); }
            mg.closePath(); mg.fill();
        }
        mg.strokeStyle = 'rgba(255,255,255,0.15)';
        for (let lat = -60; lat <= 60; lat += 30) { mg.beginPath(); mg.moveTo(0, (90 - lat) * 2); mg.lineTo(720, (90 - lat) * 2); mg.stroke(); }
        if (mark) { mg.fillStyle = '#ffd66e'; mg.beginPath(); mg.arc((mark.lon + 180) * 2, (90 - mark.lat) * 2, 5, 0, Math.PI * 2); mg.fill(); }
    }
    map.addEventListener('click', async (e) => {
        const r = map.getBoundingClientRect();
        const lon = Math.round((e.clientX - r.left) / r.width * 360 - 180);
        const lat = Math.round(90 - (e.clientY - r.top) / r.height * 180);
        const { CITIES, ZONES } = await loadCities();
        // the zone and a name come from the nearest city in the list
        let best = null, bestD = 1e9;
        for (const c of CITIES) {
            const d = Math.hypot((c[2] / 10 - lat), ((c[3] / 10 - lon + 540) % 360 - 180) * Math.cos(lat * Math.PI / 180));
            if (d < bestD) { bestD = d; best = c; }
        }
        drawMap({ lat, lon });
        $('mapSay').textContent = `Latitude ${lat}°, longitude ${lon}°, clock of ${best[0]}.`;
        ctx.setPlace({ name: bestD < 1.5 ? best[0] : `Near ${best[0]}`, country: best[1], lat, lon, zone: ZONES[best[4]] });
        setTimeout(() => { $('placeDialog').close(); placed(); }, 700);
    });
    // the guide starts over only for a student who has not found anything yet
    function placed() {
        if (p().found.length) ctx.toast(`This is the sky over ${p().place.name} now.`);
        else ctx.guide.start();
    }

    // ---- when: date, time, the turn of the year --------------------------------------------
    const wd = $('whenDate'), wt = $('whenTime');
    let monthSteps = 0;
    $('whenDialog').addEventListener('close', () => {});
    $('btnWhen').addEventListener('click', syncWhen);
    $('btnCalendar').addEventListener('click', syncWhen);
    function syncWhen() { wd.value = p().when.date; wt.value = p().when.time; $('monthCount').textContent = monthSteps ? `${monthSteps} month${monthSteps === 1 ? '' : 's'} turned so far.` : ''; }
    wd.addEventListener('change', () => { if (wd.value) ctx.setWhen(wd.value, p().when.time, false); });
    wt.addEventListener('change', () => { if (wt.value) ctx.setWhen(p().when.date, wt.value.slice(0, 5), false); });
    $('whenNow').addEventListener('click', () => { const lp = ctx.localNow(); ctx.setWhen(lp.date, lp.time, true); syncWhen(); });
    $('whenTonight').addEventListener('click', () => { const lp = S.localParts(new Date(Date.now() - 4 * 3600000), zone()); ctx.setWhen(lp.date, '20:00', false); syncWhen(); });
    function stepMonth(n) {
        monthSteps += 1;
        ctx.setWhen(S.addMonths(p().when.date, n), p().when.time, false);
        if (monthSteps >= 6) ctx.addDid('turn-year');
        syncWhen();
    }
    $('monthStep').addEventListener('click', () => stepMonth(1));
    $('monthBack').addEventListener('click', () => stepMonth(-1));

    // ---- the Moon ------------------------------------------------------------------------
    let moonDays = 0;
    const southUp = () => p().place.lat < 0;
    const moonOf = (date) => S.bodyAt(S.makeFrame(p().place, date), 'moon');
    function showMoon() {
        open('moonDialog');
        renderMoon();
        if (!$('moonPick').children.length) buildMoonPick();
        renderMoonLog();
    }
    function renderMoon() {
        const m = ctx.bodies.find(b => b.id === 'moon');
        const g = $('moonBig').getContext('2d');
        g.clearRect(0, 0, 180, 180);
        drawPhase(g, 90, 90, 80, m.phaseAngle, southUp());
        $('moonName').textContent = S.PHASE_WORDS[m.phase];
        $('moonPct').textContent = `${Math.round(m.fraction * 100)} percent lit, ${dateWords(p().when.date)}`;
        const rs = S.bodyRiseSet(p().place, p().when.date, 'moon');
        $('moonTimes').textContent = (rs.rise ? 'Rises ' + timeAt(rs.rise, zone()) : 'No moonrise this day') + (rs.set ? ', sets ' + timeAt(rs.set, zone()) : '');
        $('moonWhere').textContent = m.alt > 0 ? `Up now: look ${S.compassWord(m.az)}, ${S.fistWords(m.alt)}.` : 'Under the horizon at this hour.';
        // the month strip: thirty days from the first of the month, today marked
        const sg = $('moonStrip').getContext('2d');
        sg.clearRect(0, 0, 664, 72);
        const first = p().when.date.slice(0, 8) + '01';
        for (let d = 0; d < 31; d++) {
            const ds = S.addDays(first, d);
            if (ds.slice(0, 7) !== first.slice(0, 7)) break;
            const mm = moonOf(S.localToDate(ds, '21:00', zone()));
            const x = 12 + d * 21;
            drawPhase(sg, x, 30, 8, mm.phaseAngle, southUp());
            sg.fillStyle = ds === p().when.date ? '#ffd66e' : 'rgba(255,255,255,0.45)';
            sg.font = '10px system-ui, sans-serif'; sg.textAlign = 'center';
            sg.fillText(String(d + 1), x, 58);
        }
        $('moonMonthCount').textContent = moonDays ? `${moonDays} day${moonDays === 1 ? '' : 's'} stepped` : '';
    }
    $('moonStrip').addEventListener('click', (e) => {
        const r = $('moonStrip').getBoundingClientRect();
        const d = Math.floor((e.clientX - r.left) / r.width * 664 / 21);
        const first = p().when.date.slice(0, 8) + '01';
        const ds = S.addDays(first, d);
        if (ds.slice(0, 7) !== first.slice(0, 7)) return;
        moonDays += Math.abs(d + 1 - Number(p().when.date.slice(8)));
        ctx.setWhen(ds, p().when.time, false);
        if (moonDays >= 29) ctx.addDid('moon-month');
        renderMoon();
    });
    function stepDay(n) { moonDays += 1; ctx.setWhen(S.addDays(p().when.date, n), p().when.time, false); if (moonDays >= 29) ctx.addDid('moon-month'); renderMoon(); }
    $('moonPrev').addEventListener('click', () => stepDay(-1));
    $('moonNext').addEventListener('click', () => stepDay(1));
    function buildMoonPick() {
        const wrap = $('moonPick');
        S.PHASES.forEach((ph, k) => {
            const b = document.createElement('button');
            b.type = 'button';
            const c = document.createElement('canvas'); c.width = c.height = 44;
            drawPhase(c.getContext('2d'), 22, 22, 20, k * 45, southUp());
            b.appendChild(c);
            const s = document.createElement('span'); s.textContent = S.PHASE_WORDS[ph]; b.appendChild(s);
            b.addEventListener('click', () => {
                const m = ctx.bodies.find(x => x.id === 'moon');
                const right = m.phase === ph;
                p().moonLog.push({ date: p().when.date, picked: ph, right });
                ctx.markDirty();
                $('moonLogResult').textContent = right ? `Yes: tonight’s Moon is a ${S.PHASE_WORDS[ph].toLowerCase()}. Logged.` : `Logged as ${S.PHASE_WORDS[ph].toLowerCase()}. The app makes it a ${S.PHASE_WORDS[m.phase].toLowerCase()} for this date. Clouds and horizons fool everyone; look again tomorrow.`;
                renderMoonLog();
            });
            wrap.appendChild(b);
        });
    }
    function renderMoonLog() {
        $('moonLogList').innerHTML = p().moonLog.slice().reverse().map(l => `<li>${esc(dateWords(l.date))}: ${esc(S.PHASE_WORDS[l.picked])}${l.right ? '' : ' (the app had it different)'}</li>`).join('');
    }

    // ---- planets -------------------------------------------------------------------------
    function showPlanets() {
        open('planetsDialog');
        const rows = [];
        const upNow = ctx.bodies.filter(b => S.PLANETS.includes(b.id) && b.alt > 0);
        const dark = skyLimit(ctx.sunAlt) < 0;
        $('planetsIntro').textContent = dark
            ? 'The Sun is up, so no planet shows yet. Rise and set times are for this day.'
            : (upNow.length ? `${upNow.length === 1 ? 'One planet is' : upNow.length + ' planets are'} up at this hour.` : 'No planet is up at this hour. The times say when they come round.');
        rows.push('<tr><th>Planet</th><th>Now</th><th>Rises</th><th>Sets</th><th>Brightness</th><th></th></tr>');
        for (const b of ctx.bodies) {
            if (!S.PLANETS.includes(b.id)) continue;
            const rs = S.bodyRiseSet(p().place, p().when.date, b.id);
            const now = b.alt > 0 ? `${S.compassLetter(b.az)}, ${p().mode === 'astronomer' ? b.alt.toFixed(0) + '° up' : S.fistWords(b.alt)}` : 'under the horizon';
            const nearSun = Math.abs(((b.az - ctx.bodies[0].az + 540) % 360) - 180) < 20 && Math.abs(b.alt - ctx.bodies[0].alt) < 20;
            rows.push(`<tr><td>${b.name}</td><td>${now}${nearSun ? ' (too near the Sun)' : ''}</td><td>${rs.rise ? timeAt(rs.rise, zone()) : '—'}</td><td>${rs.set ? timeAt(rs.set, zone()) : '—'}</td><td>${brightWords(b.mag)}</td><td>${b.alt > 0 ? `<button type="button" data-go="${b.id}">Point me at it</button>` : ''}</td></tr>`);
        }
        $('planetList').innerHTML = rows.join('');
        $('planetList').querySelectorAll('button[data-go]').forEach(b => b.addEventListener('click', () => window.NightSky.goTo('body', b.dataset.go)));
    }
    function brightWords(mag) {
        if (p().mode === 'astronomer') return 'magnitude ' + mag.toFixed(1);
        if (mag < -3) return 'brighter than any star';
        if (mag < -1) return 'as bright as the brightest stars';
        if (mag < 1) return 'bright';
        return 'faint, needs a dark sky';
    }

    // ---- dark sky --------------------------------------------------------------------------
    const slider = $('darkSlider');
    let sawCity = false, sawPark = false;
    function showDark() { open('darkDialog'); slider.value = Math.round(p().view.dark * 10); $('darkNote').value = p().darkSky.note || ''; $('darkCompare').checked = ctx.compare; renderDark(); }
    function darkWord(v) { return v <= 3.6 ? 'Big city' : v <= 4.4 ? 'Suburb' : v <= 5.2 ? 'Small town' : v <= 5.9 ? 'Countryside' : 'Dark park'; }
    function countStars(limit) {
        const lim = Math.min(limit, skyLimit(ctx.sunAlt));
        let n = 0;
        for (let i = 0; i < S.N; i++) { if (S.MAG[i] > lim) break; if (ctx.hor[i * 3 + 2] > 0) n++; }
        return n;
    }
    function renderDark() {
        const v = p().view.dark;
        $('darkWord').textContent = darkWord(v);
        const n = countStars(v);
        $('darkCount').textContent = skyLimit(ctx.sunAlt) < 0 ? 'The Sun is up. Come back after dark.'
            : ctx.compare ? `City: ${countStars(p().darkSky.city).toLocaleString('en-US')} stars above the horizon. Park: ${countStars(p().darkSky.park).toLocaleString('en-US')}.`
                : `${n.toLocaleString('en-US')} star${n === 1 ? '' : 's'} above the horizon at this darkness`;
    }
    slider.addEventListener('input', () => {
        p().view.dark = Number(slider.value) / 10;
        if (p().view.dark <= ctx.DARK.city) sawCity = true;
        if (p().view.dark >= ctx.DARK.park - 0.2) sawPark = true;
        if (sawCity && sawPark) ctx.addDid('dark-compare');
        renderDark();
        ctx.draw();
    });
    slider.addEventListener('change', ctx.markDirty);
    $('darkCompare').addEventListener('change', () => { ctx.compare = $('darkCompare').checked; if (ctx.compare) ctx.addDid('dark-compare'); renderDark(); ctx.draw(); });
    $('darkNote').addEventListener('input', () => { p().darkSky.note = $('darkNote').value.slice(0, 600); ctx.markDirty(); });
    // the split is for looking while the panel is open; closing it gives the whole sky back
    $('darkDialog').addEventListener('close', () => { if (ctx.compare) { ctx.compare = false; $('darkCompare').checked = false; ctx.draw(); } });

    // ---- star party --------------------------------------------------------------------------
    const BRING = [['red-light', 'a red flashlight'], ['layers', 'warm layers'], ['blanket', 'a chair or blanket'], ['water', 'water'], ['binoculars', 'binoculars, if you have some'], ['chart', 'a printed sky chart'], ['grown-up', 'a grown-up'], ['snack', 'a snack']];
    const partyFields = ['title', 'date', 'from', 'to', 'where', 'who'];
    for (const f of partyFields) $('party' + f[0].toUpperCase() + f.slice(1)).addEventListener('input', (e) => { p().party[f] = e.target.value.slice(0, 120); ctx.markDirty(); if (f === 'date' || f === 'from' || f === 'to') renderPartyUp(); });
    function showParty() {
        open('partyDialog');
        const pa = p().party;
        if (!pa.date) { pa.date = p().when.date; pa.from = '20:00'; pa.to = '22:00'; pa.where = p().place.sample ? '' : p().place.name; }
        for (const f of partyFields) $('party' + f[0].toUpperCase() + f.slice(1)).value = pa[f] || '';
        const bring = $('partyBring');
        bring.innerHTML = '';
        for (const [id, label] of BRING) {
            const l = document.createElement('label');
            const c = document.createElement('input'); c.type = 'checkbox'; c.checked = pa.bring.includes(id);
            c.addEventListener('change', () => { const set = new Set(pa.bring); if (c.checked) set.add(id); else set.delete(id); pa.bring = [...set]; ctx.markDirty(); });
            l.appendChild(c); l.appendChild(document.createTextNode(' ' + label));
            bring.appendChild(l);
        }
        renderPartyUp();
    }
    function partyMid() {
        const pa = p().party;
        const from = pa.from || '20:00', to = pa.to || '22:00';
        const [fh, fm] = from.split(':').map(Number), [th, tm] = to.split(':').map(Number);
        let mins = (fh * 60 + fm + ((th * 60 + tm - fh * 60 - fm + 1440) % 1440) / 2) % 1440;
        return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(Math.round(mins % 60)).padStart(2, '0')}`;
    }
    function renderPartyUp() {
        const pa = p().party;
        if (!pa.date) return;
        const mid = partyMid();
        const date = S.localToDate(pa.date, mid, zone());
        const frame = S.makeFrame(p().place, date);
        const bodies = S.bodiesAt(frame);
        const items = [];
        const sun = bodies.find(b => b.id === 'sun');
        if (sun.alt > -6) items.push({ text: `At ${clock(S.localParts(date, zone()))} the sky is still bright. Start later, or wait for the stars.`, kind: null });
        const moon = bodies.find(b => b.id === 'moon');
        const rs = S.bodyRiseSet(p().place, pa.date, 'moon');
        if (moon.alt > 0) items.push({ text: `The Moon, a ${S.PHASE_WORDS[moon.phase].toLowerCase()} (${Math.round(moon.fraction * 100)} percent), in the ${S.compassWord(moon.az)}${rs.set ? ', setting about ' + timeAt(rs.set, zone()) : ''}.`, kind: 'moon', id: 'moon' });
        else items.push({ text: `No Moon in the sky at ${clock(S.localParts(date, zone()))}${rs.rise ? ' (it rises about ' + timeAt(rs.rise, zone()) + ')' : ''}. Good for faint things.`, kind: null });
        $('partyWarn').hidden = !(moon.alt > 0 && moon.fraction > 0.75);
        $('partyWarn').textContent = 'A bright Moon washes out the faint stars and the Milky Way. Plan on the Moon, the planets and the bright constellations, or pick a night nearer new Moon.';
        for (const b of bodies) if (S.PLANETS.includes(b.id) && b.alt > 5 && sun.alt < -3) items.push({ text: `${b.name}, ${S.compassWord(b.az)}, ${S.fistWords(b.alt)}.`, kind: 'planet', id: b.id });
        // constellations standing high at the middle of the party, brightest figures first
        const cons = [];
        for (const c of S.CONSTELLATIONS) {
            const stars = [...new Set(S.LINES[c.id].flat())].map(S.indexOfHr);
            const bright = stars.filter(i => S.MAG[i] < 3);
            if (bright.length < 2) continue;
            const aa = S.horToAltAz(...constellationHorIn(frame, c));
            if (aa.alt > 30) cons.push({ c, alt: aa.alt, az: aa.az, bright: bright.length });
        }
        cons.sort((a, b) => b.bright - a.bright || b.alt - a.alt);
        for (const x of cons.slice(0, 5)) items.push({ text: `${x.c.id === 'uma' ? 'The Big Dipper' : x.c.name}, ${S.compassWord(x.az)}, ${S.fistWords(x.alt)}.`, kind: 'constellation', id: x.c.id });
        $('partyUp').innerHTML = items.map((it, k) => `<li>${esc(it.text)} ${it.kind ? `<button type="button" class="small" data-add="${k}">Add to targets</button>` : ''}</li>`).join('');
        $('partyUp').querySelectorAll('button[data-add]').forEach(b => b.addEventListener('click', () => {
            const it = items[Number(b.dataset.add)];
            if (!pa.targets.some(t => t.kind === it.kind && t.id === it.id)) { pa.targets.push({ kind: it.kind, id: it.id }); ctx.markDirty(); }
            renderTargets();
        }));
        renderTargets();
    }
    function constellationHorIn(frame, c) {
        const r = frame.rot, a = c.ra * Math.PI / 180, d = c.dec * Math.PI / 180, k = Math.cos(d);
        const x = k * Math.cos(a), y = k * Math.sin(a), z = Math.sin(d);
        return [r[0] * x + r[1] * y + r[2] * z, r[3] * x + r[4] * y + r[5] * z, r[6] * x + r[7] * y + r[8] * z];
    }
    function renderTargets() {
        const pa = p().party;
        $('partyTargets').innerHTML = pa.targets.length ? pa.targets.map((t, k) => `<li>${esc(ctx.labelFor(t.kind, t.id))} <button type="button" class="x" data-rm="${k}" title="Take it off the list">&times;</button></li>`).join('') : '<li class="muted">Nothing yet. Add from the list above, at least three.</li>';
        $('partyTargets').querySelectorAll('button[data-rm]').forEach(b => b.addEventListener('click', () => { pa.targets.splice(Number(b.dataset.rm), 1); ctx.markDirty(); renderTargets(); }));
    }

    // ---- observing log ---------------------------------------------------------------------
    function showLog() {
        open('logDialog');
        $('logDate').value = ctx.localNow().date;
        const saw = $('logSaw');
        saw.innerHTML = p().found.map(f => `<option value="${esc(f.id)}">${esc(ctx.labelFor(f.kind, f.id))}</option>`).join('') + '<option value="moon">the Moon</option><option value="other">something else</option>';
        renderLog();
    }
    $('logAdd').addEventListener('click', () => {
        if (!$('logDate').value) return;
        p().log.push({ date: $('logDate').value, saw: $('logSaw').value, sky: $('logSky').value, note: $('logNote').value.trim().slice(0, 200) });
        $('logNote').value = '';
        ctx.markDirty();
        renderLog();
    });
    const SKY_WORDS = { clear: 'clear', 'some-clouds': 'partly cloudy', hazy: 'hazy', cloudy: 'cloudy' };
    function renderLog() {
        $('logList').innerHTML = p().log.slice().reverse().map(l => `<li><strong>${esc(dateWords(l.date))}</strong>: ${esc(sawWords(l.saw))}, sky ${SKY_WORDS[l.sky] || l.sky}${l.note ? '. ' + esc(l.note) : ''}</li>`).join('') || '<li class="muted">No lines yet.</li>';
    }
    function sawWords(id) {
        if (id === 'other') return 'something else';
        const f = p().found.find(x => x.id === id);
        return f ? ctx.labelFor(f.kind, f.id) : (id === 'moon' ? 'the Moon' : id);
    }

    // ---- the tour: step cards --------------------------------------------------------------
    const tourDo = $('tourDo'), tourArg = $('tourArg');
    function showTour() { open('tourDialog'); fillArgs(); renderTour(); }
    function fillArgs() {
        const kind = tourDo.value;
        let opts = [];
        if (kind === 'face') opts = [['n', 'north'], ['e', 'east'], ['s', 'south'], ['w', 'west']];
        else if (kind === 'time') opts = ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00', '05:00'].map(t => [t, t]);
        else if (kind === 'find') {
            opts.push(['constellation:uma', 'Big Dipper']);
            for (const id of ['umi', 'ori', 'cas', 'leo', 'sco', 'cyg', 'cru', 'tau', 'gem', 'boo']) opts.push(['constellation:' + id, S.CONST_BY_ID[id].name]);
            for (const id of ['polaris', 'sirius', 'vega', 'betelgeuse', 'rigel', 'arcturus', 'antares', 'capella', 'acrux']) opts.push(['star:' + id, ctx.labelFor('star', id)]);
            opts.push(['moon:moon', 'the Moon']);
            for (const id of S.PLANETS) opts.push(['planet:' + id, S.bodyName(id)]);
        }
        else if (kind === 'wait') opts = [['1h', 'one hour']];
        else if (kind === 'pointer') opts = [['', 'to Polaris']];
        else if (kind === 'say') opts = ctx.guide.SAY_LINES.map(s => [s, s]);
        tourArg.innerHTML = opts.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
        tourArg.hidden = kind === 'pointer';
    }
    tourDo.addEventListener('change', fillArgs);
    const DO_WORDS = { face: 'Face', time: 'Set time', find: 'Find', pointer: 'Draw the pointer line', wait: 'Wait', say: 'Say' };
    function argWords(st) {
        if (st.do === 'face') return { n: 'north', e: 'east', s: 'south', w: 'west' }[st.arg] || st.arg;
        if (st.do === 'find') { const [k, id] = st.arg.split(':'); return ctx.labelFor(k, id); }
        if (st.do === 'wait') return 'one hour';
        if (st.do === 'pointer') return '';
        return st.arg;
    }
    function renderTour() {
        const t = p().tour;
        $('tourList').innerHTML = t.length ? t.map((st, k) => `<li><span><strong>${DO_WORDS[st.do] || st.do}</strong> ${esc(argWords(st))}</span><button type="button" class="x" data-up="${k}" title="Move up">&uarr;</button><button type="button" class="x" data-rm="${k}" title="Remove">&times;</button></li>`).join('') : '<li class="muted">No cards yet.</li>';
        $('tourList').querySelectorAll('button[data-rm]').forEach(b => b.addEventListener('click', () => { t.splice(Number(b.dataset.rm), 1); ctx.markDirty(); renderTour(); }));
        $('tourList').querySelectorAll('button[data-up]').forEach(b => b.addEventListener('click', () => { const k = Number(b.dataset.up); if (k > 0) { [t[k - 1], t[k]] = [t[k], t[k - 1]]; ctx.markDirty(); renderTour(); } }));
        $('tourPlay').disabled = !t.length;
    }
    $('tourAdd').addEventListener('click', () => {
        if (p().tour.length >= 30) return;
        p().tour.push({ do: tourDo.value, arg: tourArg.value });
        ctx.markDirty();
        renderTour();
    });
    $('tourClear').addEventListener('click', () => { p().tour = []; ctx.markDirty(); renderTour(); });
    $('tourPlay').addEventListener('click', () => { $('tourDialog').close(); ctx.guide.hide(); ctx.guide.playTour(p().tour.slice()); });

    // ---- the printable chart ---------------------------------------------------------------
    function showChart() {
        open('chartDialog');
        const c = $('chartCanvas'), g = c.getContext('2d');
        const v = new View(); v.setSize(720, 720); v.chart = true;
        g.fillStyle = '#fff'; g.fillRect(0, 0, 720, 780);
        g.save();
        g.translate(0, 60);
        g.beginPath(); g.arc(360, 360, 352, 0, Math.PI * 2); g.clip();
        const scene = ctx.buildScene(Math.min(p().view.dark, 5.0));
        const segs = []; for (const id of Object.keys(S.LINES)) segs.push(...S.LINES[id]);
        scene.lineSets = [{ segs, color: 'rgba(60,80,160,0.7)', width: 1 }];
        scene.labels = S.CONSTELLATIONS.map(cc => ({ kind: 'con', hor: ctx.constellationHor(cc), text: cc.name, size: 11, color: '#334' })).concat(ctx.bodies.filter(b => b.id !== 'sun').map(b => ({ kind: 'body', hor: b.hor, text: b.name, size: 12, color: '#7a4a00' })));
        scene.rings = [];
        scene.grids = null;
        scene.pointer = null;
        scene.sunAlt = -30;
        scene.big = false;
        render(g, v, scene);
        // paper wants dark on light: invert the sky, keep the ink
        g.globalCompositeOperation = 'difference';
        g.fillStyle = '#fff'; g.fillRect(0, 0, 720, 720);
        g.restore();
        g.fillStyle = '#111';
        g.font = '600 20px system-ui, sans-serif'; g.textAlign = 'left';
        g.fillText('Night Sky Lab chart', 20, 34);
        g.font = '14px system-ui, sans-serif';
        const lp = S.localParts(ctx.placeTime(), zone());
        g.fillText(`${p().place.sample ? 'Sample sky' : p().place.name}, latitude ${p().place.lat}°, longitude ${p().place.lon}°`, 20, 52);
        g.textAlign = 'right';
        g.fillText(`${dateWords(p().when.date)}, ${clock(lp)}`, 700, 34);
        g.fillText('Hold overhead with N toward north. East is on the left, as the sky is.', 700, 52);
    }
    $('chartPrint').addEventListener('click', () => {
        const area = $('printArea');
        area.innerHTML = '';
        const img = document.createElement('img');
        img.src = $('chartCanvas').toDataURL('image/png');
        img.alt = 'Sky chart';
        area.appendChild(img);
        area.hidden = false;
        const after = () => { area.hidden = true; window.removeEventListener('afterprint', after); };
        window.addEventListener('afterprint', after);
        img.onload = () => window.print();
    });

    // ---- a loaded project refreshes whatever is open -----------------------------------------
    document.addEventListener('nightsky:loaded', () => { monthSteps = 0; moonDays = 0; sawCity = sawPark = false; ctx.compare = false; $('darkCompare').checked = false; });
    document.addEventListener('nightsky:frame', () => { if ($('moonDialog').open) renderMoon(); if ($('darkDialog').open) renderDark(); });
}
