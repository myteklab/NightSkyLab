// The first minute (find the Dipper, drag the pointers to Polaris, turn the night) and the
// tour player, which is Glassbox rung 1: a list of step cards the sky follows.
import * as S from './sky.mjs?v=4';

export function initGuide(ctx) {
    const { $ } = ctx;
    const el = $('guide'), text = $('guideText'), act = $('guideAct'), skip = $('guideSkip');
    let step = 'off';
    let south = false;          // the Southern Cross version of the first minute
    let dragGap = 0, dragDir = null, dragFrom = null;
    let extraButtons = [];
    let shownAt = 0;           // a second tap right after the guide changes must not hit the new button
    const tooSoon = () => performance.now() - shownAt < 450;

    const pointerStars = () => south ? ['gacrux', 'acrux'] : ['merak', 'dubhe'];
    const targetId = () => south ? 'cru' : 'uma';
    const targetName = () => south ? 'Southern Cross' : 'Big Dipper';
    const figure = () => south ? S.LINES.cru : S.ASTERISMS.dipper;
    const figureStars = () => [...new Set(figure().flat())].map(S.indexOfHr);

    function show(msg, button, onAct, extras) {
        text.textContent = msg;
        act.hidden = !button;
        act.textContent = button || '';
        act.onclick = onAct || null;
        for (const b of extraButtons) b.remove();
        extraButtons = [];
        for (const x of extras || []) {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'small'; b.textContent = x.label; b.onclick = () => { if (!tooSoon()) x.run(); };
            el.insertBefore(b, skip);
            extraButtons.push(b);
        }
        el.hidden = false;
        shownAt = performance.now();
    }
    function hide() { el.hidden = true; step = 'off'; ctx.guideLines = null; ctx.pointer = null; ctx.draw(); }
    skip.addEventListener('click', () => { if (!tooSoon()) hide(); });

    function figureUp() {
        let best = -90;
        for (const i of figureStars()) best = Math.max(best, S.horToAltAz(ctx.hor[i * 3], ctx.hor[i * 3 + 1], ctx.hor[i * 3 + 2]).alt);
        return best;
    }
    // the strip position in this night when the figure stands highest
    function bestStripStep() {
        const night = ctx.project.when;
        let bestStep = 96, bestAlt = -90;
        const stars = figureStars();
        for (let st = 60; st <= 240; st += 6) {
            const w = ctx.stripToWhen(Number(night.time.slice(0, 2)) < 12 ? S.addDays(night.date, -1) : night.date, st);
            const frame = S.makeFrame(ctx.project.place, S.localToDate(w.date, w.time, ctx.project.place.zone));
            const sun = S.bodyAt(frame, 'sun');
            if (sun.alt > -9) continue;
            let alt = -90;
            for (const i of stars) alt = Math.max(alt, S.starAltAz(frame, i).alt);
            if (alt > bestAlt) { bestAlt = alt; bestStep = st; }
        }
        return { step: bestStep, alt: bestAlt };
    }

    function start() {
        const lat = ctx.project.place.lat;
        south = lat < -10;
        ctx.highlight.delete('uma'); ctx.highlight.delete('cru');
        ctx.guideLines = figure();
        ctx.pointer = null;
        ctx.view.look(south ? 180 : 0, 25);
        ctx.draw();
        if (ctx.sunAlt > -6) {
            step = 'wait';
            show('The Sun is up at this hour, so the stars are hidden. Slide the time strip into the night.', 'Show me', () => {
                ctx.strip.value = 108;
                ctx.strip.dispatchEvent(new Event('input'));
                ctx.markDirty();
            });
            const onDark = () => { if (ctx.sunAlt <= -6) { document.removeEventListener('nightsky:frame', onDark); start(); } };
            document.addEventListener('nightsky:frame', onDark);
            return;
        }
        if (figureUp() < 4) {
            const best = bestStripStep();
            if (best.alt < 4) {
                show(`From here the ${targetName()} stays under the horizon tonight. Try the ${south ? 'Big Dipper' : 'Southern Cross'} instead, or another month.`, 'Find the Moon', () => doors());
                return;
            }
            show(`At this hour the ${targetName()} is under the horizon from here. Slide the time strip until it climbs up.`, 'Show me', () => {
                ctx.strip.value = best.step;
                ctx.strip.dispatchEvent(new Event('input'));
                ctx.markDirty();
                stepFind();
            });
            const onFrame = () => { if (figureUp() > 4) { document.removeEventListener('nightsky:frame', onFrame); stepFind(); } };
            document.addEventListener('nightsky:frame', onFrame);
            step = 'wait';
            return;
        }
        stepFind();
    }

    function stepFind() {
        step = 'find';
        const lat = ctx.project.place.lat;
        let msg = `This is your sky tonight. Can you find the ${targetName()}?`;
        if (!south && lat < 25) msg += ' From here it sits low in the north.';
        show(msg, 'Show me', () => {
            const c = S.CONST_BY_ID[targetId()];
            const stars = figureStars();
            let x = 0, y = 0, z = 0;
            for (const i of stars) { x += ctx.hor[i * 3]; y += ctx.hor[i * 3 + 1]; z += ctx.hor[i * 3 + 2]; }
            const n = Math.hypot(x, y, z);
            ctx.flyTo({ hor: [x / n, y / n, z / n] }, () => found());
        });
    }
    function found() {
        if (step !== 'find') return;
        ctx.addFound('constellation', targetId());
        ctx.highlight.add(targetId());
        ctx.guideLines = null;
        ctx.draw();
        stepPointers();
    }
    function onTap(hit) {
        if (step !== 'find' || !hit) return false;
        if (hit.kind === 'constellation' && hit.id === targetId()) { found(); return true; }
        if (hit.kind === 'star' && figureStars().includes(hit.i)) { found(); return true; }
        return false;
    }

    function stepPointers() {
        step = 'pointers';
        const [a, b] = pointerStars();
        const msg = south
            ? 'The long axis of the Cross points the way. Drag from Gacrux, at the top, through Acrux, at the foot, and keep going.'
            : 'The two stars at the front of the cup are the Pointers. Drag from Merak, through Dubhe, and keep going.';
        show(msg, 'Show me', () => animatePointer(() => pointed()));
        void a; void b;
    }
    function pointerEnds() {
        const [a, b] = pointerStars().map(S.starIndexById);
        return { a, b, from: ctx.starHor(a), to: ctx.starHor(b) };
    }
    function claimDrag(x, y) {
        if (step !== 'pointers') return false;
        const P = ctx.view.projector();
        const { a, b, from, to } = pointerEnds();
        const pa = P(from[0], from[1], from[2]), pb = P(to[0], to[1], to[2]);
        if (!pa || !pb) return false;
        if (Math.hypot(pa[0] - x, pa[1] - y) > 28) return false;
        dragGap = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
        dragDir = [(pb[0] - pa[0]) / dragGap, (pb[1] - pa[1]) / dragGap];
        dragFrom = pa;
        ctx.pointer = { a, b, t: 0.001 };
        return true;
    }
    function moveDrag(x, y) {
        const along = (x - dragFrom[0]) * dragDir[0] + (y - dragFrom[1]) * dragDir[1];
        const t = Math.max(0.001, Math.min(1, (along - dragGap) / (dragGap * (south ? 4.5 : 5))));
        ctx.pointer.t = t;
        ctx.draw();
    }
    function endDrag() {
        if (!ctx.pointer) return;
        if (ctx.pointer.t >= 0.75) { ctx.pointer.t = 1; pointed(); }
        else { ctx.pointer = null; ctx.draw(); show(south ? 'Keep dragging, about four and a half Cross lengths.' : 'Keep dragging, about five times the gap between the two Pointers.', 'Show me', () => animatePointer(() => pointed())); }
    }
    function animatePointer(done) {
        const { a, b } = pointerEnds();
        let t0 = null;
        const tick = (now) => {
            if (t0 === null) t0 = now;
            const t = Math.min(1, (now - t0) / 1200);
            ctx.pointer = { a, b, t: Math.max(0.001, t) };
            ctx.draw();
            if (t < 1) requestAnimationFrame(tick); else if (done) done();
        };
        requestAnimationFrame(tick);
    }
    function pointed() {
        if (step !== 'pointers') return;
        if (south) {
            ctx.addDid('southern-cross');
            show('That spot is the south pole of the sky. No bright star marks it, which is why sailors learned the Cross.', 'Next', stepTurn);
        } else {
            ctx.addDid('pointers');
            const ip = S.starIndexById('polaris');
            ctx.ringsExtra = [{ hor: ctx.starHor(ip), r: 14, color: 'rgba(255,214,110,0.95)' }];
            ctx.draw();
            show('Polaris, the North Star. It is almost exactly north. Tap it to add it to your found list.', 'Next', stepTurn);
            step = 'polaris';
            const onFound = (e) => { if (e.detail.id === 'polaris') { document.removeEventListener('nightsky:found', onFound); stepTurn(); } };
            document.addEventListener('nightsky:found', onFound);
        }
    }
    function stepTurn() {
        step = 'turn';
        ctx.ringsExtra = [];
        const strip = ctx.strip;
        const start = Number(strip.value);
        show(south ? 'Now drag the time strip. The whole sky wheels around that empty spot.' : 'Now drag the time strip. The Dipper swings round, and Polaris stays put.', 'Show me', () => {
            // three hours forward, a step every frame
            let s = start;
            const tick = () => {
                s += 1;
                strip.value = Math.min(287, s);
                strip.dispatchEvent(new Event('input'));
                if (s < start + 36 && s < 287) requestAnimationFrame(tick); else { ctx.markDirty(); turned(); }
            };
            requestAnimationFrame(tick);
        });
        const onDid = (e) => { if (e.detail.id === 'turn-night') { document.removeEventListener('nightsky:did', onDid); turned(); } };
        document.addEventListener('nightsky:did', onDid);
        if (ctx.hasDid('turn-night')) {
            let moved = 0, last = Number(strip.value);
            const onInput = () => { moved += Math.abs(Number(strip.value) - last); last = Number(strip.value); if (moved >= 24) { strip.removeEventListener('input', onInput); turned(); } };
            strip.addEventListener('input', onInput);
        }
    }
    function turned() {
        if (step !== 'turn') return;
        ctx.addDid('turn-night');
        doors(south ? 'The sky turns around the pole because Earth turns. Where next?' : 'The sky turns around Polaris because Earth turns. Where next?');
    }
    // no Next button and no timer here: a late or doubled click used to land on whatever moved under it
    function doors(msg) {
        step = 'doors';
        ctx.pointer = null;
        ctx.draw();
        show(msg || 'Where next?', null, null, [
            { label: 'Moon tonight', run: () => { hide(); $('btnMoon').click(); } },
            { label: 'Planets up tonight', run: () => { hide(); $('btnPlanets').click(); } },
            { label: 'Plan a star party', run: () => { hide(); $('btnParty').click(); } }
        ]);
    }

    // ---- the tour player ----------------------------------------------------------------
    let playing = false;
    let viewBefore = null;     // the tour moves the view around; it is put back when the tour ends
    const SAY_LINES = [
        'Look up.', 'This is the Big Dipper.', 'Follow the Pointers.', 'There is Polaris, the North Star.', 'The sky turns around it.',
        'Here is the Moon.', 'That bright one is a planet.', 'Planets do not twinkle.', 'Wait for your eyes to get used to the dark.',
        'Red light keeps your night eyes.', 'Three stars in a row: Orion’s belt.', 'The W is Cassiopeia.', 'Count the stars in the cup.',
        'Find the Southern Cross.', 'Find the brightest star you can.', 'Which way is north?', 'Look east: that is where things rise.',
        'Look west: that is where things set.', 'Now turn the clock.', 'The end. Go outside and check.'
    ];
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    async function playTour(steps) {
        if (playing || !steps.length) return;
        playing = true;
        viewBefore = { az: ctx.view.az, alt: ctx.view.alt, zoom: ctx.view.zoom };
        document.body.classList.add('playing');
        $('tourBar').hidden = false;
        const bar = $('tourSay');
        for (const st of steps) {
            if (!playing) break;
            if (st.do === 'face') { bar.textContent = 'Face ' + S.compassWord({ n: 0, e: 90, s: 180, w: 270 }[st.arg] || 0); ctx.flyTo({ az: { n: 0, e: 90, s: 180, w: 270 }[st.arg] || 0, alt: 25 }); await wait(1500); }
            else if (st.do === 'time') { bar.textContent = 'Set the clock to ' + st.arg; ctx.setWhen(ctx.project.when.date, st.arg, false); await wait(1500); }
            else if (st.do === 'find') {
                const [kind, id] = st.arg.split(':');
                bar.textContent = 'Find ' + ctx.labelFor(kind, id);
                let hor = null;
                if (kind === 'constellation') { hor = ctx.constellationHor(S.CONST_BY_ID[id]); ctx.highlight.add(id); }
                else if (kind === 'star') { const i = S.starIndexById(id); if (i !== undefined) { hor = ctx.starHor(i); ctx.ringsExtra = [{ hor, r: 14 }]; } }
                else { const b = ctx.bodies.find(x => x.id === id); if (b) { hor = b.hor; ctx.ringsExtra = [{ hor, r: 16 }]; } }
                if (hor && hor[2] > 0) ctx.flyTo({ hor }); else bar.textContent += ' (under the horizon right now)';
                await wait(2200);
                ctx.ringsExtra = [];
            }
            else if (st.do === 'pointer') { bar.textContent = 'The Pointers lead to Polaris'; south = ctx.project.place.lat < -10; await new Promise(r => animatePointer(r)); await wait(1200); ctx.pointer = null; }
            else if (st.do === 'wait') {
                bar.textContent = 'An hour goes by';
                const strip = ctx.strip, start = Number(strip.value);
                for (let s = 1; s <= 12 && playing; s++) { strip.value = Math.min(287, start + s); strip.dispatchEvent(new Event('input')); await wait(90); }
                await wait(800);
            }
            else if (st.do === 'say') { bar.textContent = st.arg; await wait(2600); }
        }
        stopTour();
    }
    function stopTour() {
        playing = false;
        document.body.classList.remove('playing');
        $('tourBar').hidden = true;
        ctx.pointer = null; ctx.ringsExtra = [];
        if (viewBefore) { ctx.view.look(viewBefore.az, viewBefore.alt); ctx.view.zoom = viewBefore.zoom; viewBefore = null; }
        ctx.draw();
    }
    $('tourStop').addEventListener('click', stopTour);

    return { start, hide, claimDrag, moveDrag, endDrag, onTap, playTour, stopTour, SAY_LINES, isPlaying: () => playing };
}
