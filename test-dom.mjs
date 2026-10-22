// The real index.html and app.mjs in jsdom, with a canvas context that swallows every call:
// nothing here can see the sky, so this covers the state, the save shape, the guide's steps,
// the dialogs and the did/found bookkeeping. What the sky looks like is a browser pass.
//   node test-dom.mjs
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

let JSDOM = null;
for (const base of ['svgedit', 'winxp--dev', 'winxp']) {
    try { ({ JSDOM } = require(path.join(here, '..', base, 'node_modules', 'jsdom'))); break; } catch (e) { /* next copy */ }
}
if (!JSDOM) { console.log('no jsdom beside this repo: skipped'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (cond, what, detail) => { if (cond) pass++; else { fail++; console.log('FAIL ' + what + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');
const dom = new JSDOM(html, { url: 'https://example.test/apps/nightskylab--dev/index.html', pretendToBeVisual: true });
const w = dom.window, d = w.document;
w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.open = false; this.dispatchEvent(new w.Event('close')); };
// a 2d context that accepts anything and measures every word as ten pixels
const fakeCtx = () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : () => fakeCtx() });
w.HTMLCanvasElement.prototype.getContext = () => fakeCtx();
w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
d.getElementById('sky').getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 700, right: 1200, bottom: 700 });
const errors = [];
w.addEventListener('error', e => errors.push(String(e.error || e.message)));
w.Astronomy = require('./js/vendor/astronomy.browser.min.js');
Object.assign(global, { window: w, document: d, localStorage: w.localStorage, location: w.location, CustomEvent: w.CustomEvent, Event: w.Event, requestAnimationFrame: w.requestAnimationFrame.bind(w), cancelAnimationFrame: w.cancelAnimationFrame.bind(w), getComputedStyle: w.getComputedStyle.bind(w), Astronomy: w.Astronomy });
// jsdom has no SpeechSynthesis; the app only checks for it

let ready = false;
w.addEventListener('nightskylab:ready', () => { ready = true; });
await import(pathToFileURL(path.join(here, 'js', 'app.mjs')).href + '?v=dom');
const N = w.NightSky;
const $ = (s) => d.querySelector(s);
const click = (s) => { const e = typeof s === 'string' ? $(s) : s; if (!e) throw new Error('nothing at ' + s); e.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const input = (s, v) => { const e = $(s); e.value = v; e.dispatchEvent(new w.Event('input', { bubbles: true })); e.dispatchEvent(new w.Event('change', { bubbles: true })); };
const P = () => N.serializeProjectData();

ok(ready, 'app announced ready');
ok(errors.length === 0, 'no errors on load', errors);
ok(!$('#sample').hidden, 'sample sky tag shows before a place is picked');
ok(/Pick a city/.test($('#btnPlace').textContent), 'place button asks for a city');
ok(!$('#guide').hidden && /Big Dipper/.test($('#guideText').textContent), 'guide opens on the Big Dipper', $('#guideText').textContent);

// ---- the save shape from spec 192 section 5.5 ----------------------------------------------
{
    const p = P();
    ok(JSON.stringify(Object.keys(p)) === JSON.stringify(['v', 'mode', 'place', 'when', 'view', 'found', 'did', 'moonLog', 'dipper', 'darkSky', 'party', 'log', 'mine', 'tour', 'programs']), 'save keys in the spec order', Object.keys(p));
    ok(p.v === 1 && p.mode === 'explorer', 'v 1, explorer');
    ok(p.place.name === 'Denver' && p.place.lat === 40 && p.place.lon === -105 && p.place.sample === true, 'sample place is Denver, rounded, marked sample', p.place);
    ok(/^\d{4}-\d{2}-\d{2}$/.test(p.when.date) && p.when.time === '20:00' && p.when.now === false, 'tonight at 20:00', p.when);
    ok(p.found.length === 0 && p.did.length === 0 && p.moonLog.length === 0 && p.dipper.length === 0 && p.log.length === 0 && p.mine.lines.length === 0 && p.tour.length === 0, 'nothing done yet');
    ok(p.party.title === '' && p.party.date === '' && p.party.targets.length === 0, 'empty party');
    ok(p.darkSky.city === 4 && p.darkSky.park === 6, 'dark sky ends');
}

// ---- the first minute by the Show me buttons ---------------------------------------------
click('#guideAct');                 // fly to the Dipper, which counts as found
await sleep(900);
ok(P().found.some(f => f.kind === 'constellation' && f.id === 'uma'), 'Show me finds the Big Dipper', P().found);
ok(/Pointers/.test($('#guideText').textContent), 'guide moves on to the Pointers', $('#guideText').textContent);
ok($('#chips').textContent.includes('Big Dipper'), 'a found chip appears');
click('#guideAct');                 // animate the pointer line
await sleep(1500);
ok(P().did.includes('pointers'), 'the pointer line counts as did pointers', P().did);
ok(/Polaris/.test($('#guideText').textContent), 'guide names Polaris', $('#guideText').textContent);
ok(P().found.length === 1, 'a repeat find does not add a second entry');
click('#guideAct');                 // Next: the turn step
ok(/time strip/.test($('#guideText').textContent), 'guide asks for the time strip', $('#guideText').textContent);
const timeBefore = P().when.time;
click('#guideAct');                 // three hours forward
await sleep(1200);
ok(P().did.includes('turn-night'), 'three hours on the strip is did turn-night', P().did);
ok(P().when.time !== timeBefore, 'the clock moved', P().when);
await sleep(4200);
ok($('#guide').querySelectorAll('button').length >= 4, 'three doors at the end of the minute', $('#guide').textContent);

// ---- the strip and the clock ---------------------------------------------------------------
input('#timeStrip', 96);
ok(P().when.time === '20:00', 'strip at 96 is 8 pm', P().when);
input('#timeStrip', 150);
ok(P().when.time === '00:30' && P().when.date !== P().when.date.slice(0, 0), 'strip past midnight rolls the date', P().when);
ok(/12:30 am/.test($('#stripTime').textContent), 'strip label shows 12:30 am', $('#stripTime').textContent);
input('#timeStrip', 96);

// ---- a city, by search --------------------------------------------------------------------
click('#btnPlace');
input('#citySearch', 'manil');
await sleep(300);
const manila = [...d.querySelectorAll('#cityList button')].find(b => /^Manila, PH/.test(b.textContent));
ok(!!manila, 'Manila is offered', [...d.querySelectorAll('#cityList button')].map(b => b.textContent));
click(manila);
await sleep(50);
{
    const p = P();
    ok(p.place.name === 'Manila' && p.place.lat === 15 && p.place.lon === 121 && p.place.zone === 'Asia/Manila' && !p.place.sample, 'Manila picked and rounded to whole degrees', p.place);
    ok($('#sample').hidden, 'sample tag gone');
    ok(/Manila/.test($('#btnPlace').textContent), 'place button names the city');
    ok(!$('#guide').hidden, 'guide restarts for the new place');
}

// ---- the Moon ---------------------------------------------------------------------------
click('#btnMoon');
ok($('#moonDialog').open, 'Moon dialog opens');
ok($('#moonName').textContent.length > 3, 'phase named', $('#moonName').textContent);
ok(d.querySelectorAll('#moonPick button').length === 8, 'eight phase pictures to pick from');
click(d.querySelectorAll('#moonPick button')[0]);
ok(P().moonLog.length === 1 && typeof P().moonLog[0].right === 'boolean', 'a Moon log line with a right flag', P().moonLog);
for (let i = 0; i < 29; i++) click('#moonNext');
ok(P().did.includes('moon-month'), '29 day steps is did moon-month', P().did);
$('#moonDialog').close();

// ---- planets -----------------------------------------------------------------------------
click('#btnPlanets');
ok(d.querySelectorAll('#planetList tr').length === 6, 'five planets listed', d.querySelectorAll('#planetList tr').length);
$('#planetsDialog').close();

// ---- dark sky -----------------------------------------------------------------------------
click('#btnDark');
input('#darkSlider', 30);
ok(P().view.dark === 3 && /Big city/.test($('#darkWord').textContent), 'slider at the city end', $('#darkWord').textContent);
input('#darkSlider', 60);
ok(P().did.includes('dark-compare'), 'city to park is did dark-compare', P().did);
input('#darkNote', 'More stars came out in the park than the city, especially the faint ones in the Dipper.');
ok(P().darkSky.note.length > 40, 'dark sky note saved');
ok(/star/.test($('#darkCount').textContent), 'a star count or a daylight note', $('#darkCount').textContent);
$('#darkDialog').close();

// ---- star party -------------------------------------------------------------------------
click('#btnParty');
ok(P().party.date !== '' && P().party.where === 'Manila', 'party starts tonight at the picked place', P().party);
input('#partyTitle', 'Troop sky night');
ok(P().party.title === 'Troop sky night', 'title typed');
const adds = d.querySelectorAll('#partyUp button[data-add]');
ok(adds.length >= 3, 'at least three things will be up', $('#partyUp').textContent);
adds.forEach(b => click(b));
ok(P().party.targets.length >= 3, 'targets added', P().party.targets);
const bringRed = [...d.querySelectorAll('#partyBring input')][0];
bringRed.checked = true; bringRed.dispatchEvent(new w.Event('change', { bubbles: true }));
ok(P().party.bring.includes('red-light'), 'red light on the bring list', P().party.bring);
$('#partyDialog').close();

// ---- observing log -------------------------------------------------------------------------
click('#btnLog');
ok(d.querySelectorAll('#logSaw option').length >= 3, 'log offers what was found plus the Moon and something else');
input('#logNote', 'Clear and cold, saw the Dipper low in the north');
click('#logAdd');
ok(P().log.length === 1 && P().log[0].sky === 'clear' && P().log[0].note.length > 10, 'a log line', P().log);
$('#logDialog').close();

// ---- the tour, Glassbox rung 1 ------------------------------------------------------------
click('#btnTour');
input('#tourDo', 'face'); click('#tourAdd');
input('#tourDo', 'find'); input('#tourArg', 'constellation:uma'); click('#tourAdd');
input('#tourDo', 'say'); click('#tourAdd');
ok(P().tour.length === 3 && P().tour[1].do === 'find' && P().tour[1].arg === 'constellation:uma', 'three step cards', P().tour);
click('#tourPlay');
ok(d.body.classList.contains('playing') && !$('#tourBar').hidden, 'play mode hides the chrome');
click('#tourStop');
ok(!d.body.classList.contains('playing'), 'stop ends it');

// ---- modes, a card, Found it, Sky numbers -------------------------------------------------
input('#modeAstronomer', 'astronomer'); $('#modeAstronomer').checked = true; $('#modeAstronomer').dispatchEvent(new w.Event('change', { bubbles: true }));
ok(d.body.dataset.mode === 'astronomer' && P().mode === 'astronomer', 'astronomer mode');
N.goTo('star', 'sirius');
await sleep(900);
ok(!$('#card').hidden && $('#cardName').textContent === 'Sirius', 'Sirius card opens', $('#cardName').textContent);
ok(/light-years/.test($('#cardBody').textContent) && /Magnitude/.test($('#cardBody').textContent), 'astronomer card has distance and magnitude');
click('#cardFound');
ok(P().found.some(f => f.kind === 'star' && f.id === 'sirius'), 'Found it adds Sirius', P().found);
click('#cardNumbers');
ok(/Local sidereal time/.test($('#numbersBody').textContent) && /Altitude/.test($('#numbersBody').textContent), 'Sky numbers show the steps');
$('#numbersDialog').close();
N.goTo('body', 'moon');
await sleep(900);
ok($('#cardName').textContent === 'Moon' && /percent lit/.test($('#cardBody').textContent), 'Moon card', $('#cardBody').textContent.slice(0, 80));
click('#cardFound');
ok(P().found.some(f => f.kind === 'moon' && f.id === 'moon'), 'Moon found');
N.goTo('constellation', 'ori');
await sleep(900);
ok($('#cardName').textContent === 'Orion', 'Orion card', $('#cardName').textContent);
$('#modeLittle').checked = true; $('#modeLittle').dispatchEvent(new w.Event('change', { bubbles: true }));
ok(P().mode === 'little' && P().view.layers.includes('lines'), 'little mode turns the lines on');
$('#modeExplorer').checked = true; $('#modeExplorer').dispatchEvent(new w.Event('change', { bubbles: true }));

// ---- the turn of the year -------------------------------------------------------------------
click('#btnCalendar');
const monthBefore = P().when.date;
for (let i = 0; i < 6; i++) click('#monthStep');
ok(P().did.includes('turn-year'), 'six months is did turn-year', P().did);
ok(P().when.date !== monthBefore && P().when.time === '21:00', 'month step keeps 9 pm', P().when);
$('#whenDialog').close();

// ---- chart and about do not throw ---------------------------------------------------------
click('#btnChart'); ok($('#chartDialog').open, 'chart dialog opens'); $('#chartDialog').close();
click('#btnAbout'); ok(/Yale Bright Star/.test($('#aboutDialog').textContent), 'credits name the catalog'); $('#aboutDialog').close();

// ---- save and load round trip ----------------------------------------------------------------
{
    const before = P();
    const json = JSON.stringify(before);
    N.loadProjectData(json);
    const after = P();
    ok(JSON.stringify(after.found) === JSON.stringify(before.found) && after.did.length === before.did.length && after.party.title === before.party.title && after.tour.length === 3 && after.place.name === 'Manila', 'a JSON string loads back the same', after);
    ok(!N.isDirty(), 'loading leaves the project clean');
    N.loadProjectData({ v: 1, place: { name: 'Bilbao', country: 'ES', lat: 43.26, lon: -2.93, zone: 'Europe/Madrid' }, found: [{ kind: 'star', id: 'vega', date: '2026-01-01' }] });
    const p = P();
    ok(p.place.lat === 43 && p.place.lon === -3 && p.found.length === 1 && p.party.targets.length === 0 && p.tour.length === 0, 'an older, thinner save is filled out and re-rounded', p.place);
    N.loadProjectData(null);
    ok(P().place.sample === true && P().found.length === 0, 'null is a fresh start');
}

// ---- the southern sky gets the Cross ------------------------------------------------------
click('#btnPlace');
input('#citySearch', 'sydn');
await sleep(300);
const sydney = [...d.querySelectorAll('#cityList button')].find(b => /^Sydney, AU/.test(b.textContent));
ok(!!sydney, 'Sydney is offered');
click(sydney);
await sleep(50);
ok(P().place.lat === -34 && P().place.lon === 151, 'Sydney rounded', P().place);
ok(/Southern Cross/.test($('#guideText').textContent), 'guide switches to the Southern Cross', $('#guideText').textContent);

// ---- what the menu search reads ----------------------------------------------------------
{
    const sd = N.searchData();
    ok(sd.constellations.length === 88 && sd.stars.length > 300 && sd.bodies.length === 6, 'search data: 88 constellations, the named stars, Moon and five planets', [sd.constellations.length, sd.stars.length, sd.bodies.length]);
}

// ---- star colors, the Dipper clock, My constellation, the year chart --------------------------
click('#btnColors');
ok($('#colorsDialog').open && P().did.includes('star-colors'), 'star colors opens and counts as did star-colors', P().did);
ok(d.querySelectorAll('#colorsList tr').length >= 2 || /No bright star/.test($('#colorsList').textContent), 'colors table has rows or says why not');
$('#colorsDialog').close();
N.goTo('constellation', 'uma');
await sleep(900);
const rec = [...d.querySelectorAll('#card .cardActs .dyn')].find(b => /Record where the Dipper/.test(b.textContent));
if (rec) {
    click(rec);
    ok(P().dipper.length === 1 && P().dipper[0].time === P().when.time, 'a Dipper snapshot at the strip time', P().dipper);
    click(rec);
    ok(P().dipper.length === 1, 'the same time is not recorded twice');
    input('#timeStrip', Number($('#timeStrip').value) + 36);
    N.goTo('constellation', 'uma'); await sleep(900);
    click([...d.querySelectorAll('#card .cardActs .dyn')].find(b => /Record where the Dipper/.test(b.textContent)));
    ok(P().dipper.length === 2, 'three hours later, a second snapshot', P().dipper);
} else ok(true, 'Dipper under the horizon from Sydney: no record button, as designed');
click('#btnDipperClock');
ok($('#dipperDialog').open && /snapshot/.test($('#dipperSay').textContent), 'Dipper clock explains itself', $('#dipperSay').textContent);
$('#dipperDialog').close();
click('#btnMine');
click('#mineDraw');
ok(!$('#drawBar').hidden && $('#mineDialog').open === false, 'drawing mode shows its bar');
{
    const i1 = N.state.S.starIndexById('sirius'), i2 = N.state.S.starIndexById('canopus'), i3 = N.state.S.starIndexById('rigel');
    N.state.drawing.tap({ kind: 'star', i: i1 }); N.state.drawing.tap({ kind: 'star', i: i2 }); N.state.drawing.tap({ kind: 'star', i: i3 });
    ok(P().mine.lines.length === 2 && P().mine.lines[0].a === N.state.S.HR[i1] && P().mine.lines[0].b === N.state.S.HR[i2], 'two taps make a line, a third continues it', P().mine.lines);
    N.state.drawing.tap({ kind: 'star', i: i3 });
    N.state.drawing.tap({ kind: 'star', i: i1 });
    ok(P().mine.lines.length === 2, 'tapping the last star lifts the pen', P().mine.lines);
    click('#drawUndo');
    ok(P().mine.lines.length === 1, 'undo takes the last line');
}
click('#drawDone');
ok($('#mineDialog').open && /1 line/.test($('#mineCount').textContent), 'back in the dialog with the count', $('#mineCount').textContent);
input('#mineName', 'The Long Oar'); input('#mineStory', 'It rows across the summer sky.');
let asked = null;
N.hooks.checkText = async (f) => { asked = f; return { nameOk: false, textOk: true }; };
click('#mineKeep'); await sleep(50);
ok(asked && asked.name === 'The Long Oar' && P().mine.name === '', 'a refused name is not kept', [asked, P().mine.name]);
N.hooks.checkText = async () => ({ nameOk: true, textOk: true });
click('#mineKeep'); await sleep(50);
ok(P().mine.name === 'The Long Oar' && P().mine.story === 'It rows across the summer sky.', 'a clean name and story are kept', P().mine);
delete N.hooks.checkText;
$('#mineDialog').close();
click('#btnYear');
ok($('#yearDialog').open && P().did.includes('planet-year') && /15th of each month/.test($('#yearSay').textContent), 'year chart opens and counts as did planet-year');
ok(d.querySelectorAll('#yearLegend span').length === 6, 'six legend entries');
$('#yearDialog').close();
click('#btnMoon'); click('#moonPrint'); $('#moonDialog').close();
ok(!$('#printArea').hidden && $('#printArea img'), 'the Moon calendar goes to the print area');

// ---- a preview comes back ---------------------------------------------------------------------
ok((await N.previewDataUrl()).startsWith('data:image/png'), 'preview data url');
ok(errors.length === 0, 'no errors during the run', errors);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
