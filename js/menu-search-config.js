// What Night Sky Lab's menu search covers. The engine (menu-search.js) is shared with the other
// apps and is not edited here.
//
// The 88 constellations, the named stars, the planets and the Moon come from
// NightSky.searchData(), so a new name is found without touching this file. Picking one turns
// the sky toward it and opens its card. A new ...Dialog in index.html needs a line in `dialogs`
// or `skip`, and scripts/menu-search-check.cjs in the platform repo fails until it has one.
(function () {
    function dialog(id, more) {
        var d = { id: id, fields: true, open: function () { document.getElementById(id).showModal(); }, close: function () { document.getElementById(id).close(); } };
        for (var k in more) d[k] = more[k];
        return d;
    }
    // the More buttons open the real screens, which fill themselves; opening the dialog bare would show it empty
    function viaButton(id, btn) {
        return dialog(id, { open: function () { document.getElementById(btn).click(); } });
    }

    function fromApp() {
        if (!window.NightSky || !NightSky.searchData) return [];
        var data = NightSky.searchData(), out = [];
        data.constellations.forEach(function (c) {
            out.push({ kind: 'constellation', key: 'con:' + c.id, label: c.id === 'uma' ? 'Big Dipper (Ursa Major)' : c.name, path: 'Constellations', body: c.english || '', run: function () { NightSky.goTo('constellation', c.id); } });
        });
        data.stars.forEach(function (s) {
            out.push({ kind: 'star', key: 'star:' + s.id, label: s.name, path: 'Stars' + (s.con ? ' > ' + s.con.name : ''), body: '', run: function () { NightSky.goTo('star', s.id); } });
        });
        data.bodies.forEach(function (b) {
            out.push({ kind: 'planet', key: 'body:' + b.id, label: b.name, path: b.id === 'moon' ? 'The Moon' : 'Planets', body: '', run: function () { NightSky.goTo('body', b.id); } });
        });
        // things students ask for that come in a later version: say so instead of finding nothing
        out.push({ kind: 'note', key: 'note:meteors', label: 'Shooting stars (meteor showers)', path: 'Coming later', body: 'Meteor shower dates are not in this version yet.', run: function () { document.getElementById('btnAbout').click(); } });
        out.push({ kind: 'note', key: 'note:mine', label: 'My constellation (draw your own)', path: 'Coming later', body: 'Joining stars into your own picture is not in this version yet. The tour cards are the first step.', run: function () { document.getElementById('btnTour').click(); } });
        return out;
    }

    MenuSearch.init({
        mount: '#bar',
        before: '#btnMore',
        placeholder: 'Search stars, constellations, planets and screens',
        emptyHint: 'Try one word, like "orion", "moon" or "party".',
        fieldSelector: 'label',
        rowSelector: '.row',
        titleSelector: 'h3',
        closeSelector: 'form[method=dialog] button',

        buttons: [
            { items: '#bar > button', path: 'Top bar' },
            { items: '#compass > button', path: 'Compass' },
            { items: '#strip > button', path: 'Time strip' }
        ],

        dialogIdPattern: 'Dialog$',
        dialogs: [
            dialog('moreDialog'),
            dialog('placeDialog'),
            dialog('whenDialog'),
            viaButton('moonDialog', 'btnMoon'),
            viaButton('planetsDialog', 'btnPlanets'),
            viaButton('darkDialog', 'btnDark'),
            viaButton('partyDialog', 'btnParty'),
            viaButton('logDialog', 'btnLog'),
            viaButton('tourDialog', 'btnTour'),
            viaButton('chartDialog', 'btnChart'),
            dialog('aboutDialog', { fields: false })
        ],
        skip: {
            numbersDialog: 'the Sky numbers panel for one star; opened from its card, found through "sky numbers" in the words below',
            newDialog: 'the Start over question; "start over" in the words below finds the button that asks it'
        },

        extras: fromApp,

        words: [
            { say: 'north star polaris pole', find: ['star:polaris'] },
            { say: 'big dipper plough great bear ursa major pointers', find: ['con:uma'] },
            { say: 'little dipper ursa minor', find: ['con:umi'] },
            { say: 'southern cross crux', find: ['con:cru'] },
            { say: 'orion belt hunter', find: ['con:ori'] },
            { say: 'cassiopeia w shape', find: ['con:cas'] },
            { say: 'moon phase full moon new moon crescent gibbous quarter moonrise', find: ['btnMoon', 'body:moon'] },
            { say: 'planets planet tonight jupiter saturn mars venus mercury', find: ['btnPlanets'] },
            { say: 'time clock tonight now date calendar month year season winter summer stars', find: ['btnCalendar', 'whenDate', 'monthStep'] },
            { say: 'light pollution dark sky city park how many stars compare', find: ['btnDark', 'darkSlider'] },
            { say: 'star party plan night out bring list targets', find: ['btnParty'] },
            { say: 'log journal observing diary what i saw', find: ['btnLog'] },
            { say: 'tour steps cards program play code glassbox', find: ['btnTour'] },
            { say: 'print chart paper map of the sky printable', find: ['btnChart'] },
            { say: 'where city place location map country', find: ['btnPlace'] },
            { say: 'lines constellation lines figures pictures', find: ['layerLines'] },
            { say: 'names labels', find: ['layerNames', 'layerStarNames'] },
            { say: 'grid coordinates altitude azimuth right ascension declination', find: ['layerAltAz', 'layerRaDec'] },
            { say: 'mode little kids young read aloud explorer astronomer advanced degrees', find: ['modeExplorer', 'modeLittle', 'modeAstronomer'] },
            { say: 'zoom binoculars closer', find: ['zoomIn'] },
            { say: 'shooting star meteor shower', find: ['note:meteors'] },
            { say: 'zodiac', find: ['con:leo', 'con:sco', 'con:tau'] },
            { say: 'sky numbers calculation math how it is worked out', find: ['modeAstronomer'] },
            { say: 'start over new reset', find: ['btnNew'] },
            { say: 'guide help first minute again', find: ['btnGuideAgain'] },
            { say: 'credits sources license data about', find: ['btnAbout'] },
            { say: 'my constellation draw my own', find: ['note:mine'] }
        ]
    });
})();
