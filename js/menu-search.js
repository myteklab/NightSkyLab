// Menu search: one box that finds menu items, settings and help pages, then opens
// the dialog, switches to the tab and flashes the field.
//
// Every app that has this file carries the same copy. The canonical one lives in
// the platform repo (shared/menu-search/menu-search.js), and
// scripts/menu-search-check.cjs fails when an app's copy drifts from it.
// What differs per app goes in that app's menu-search-config.js, which calls
// MenuSearch.init().
//
// The index is read from the page every time the box opens, never written by
// hand. A new menu item, or a new <label> inside an indexed dialog, can be found
// with no change here or in the config. A new dialog is the one thing the config
// has to name, and the check script catches one that it does not.
(function () {
    'use strict';

    var cfg = null;
    var ui = {};
    var shown = [];
    var active = 0;
    var problems = [];
    var helpTextCache = {};

    var STOP = {
        a: 1, an: 1, the: 1, to: 1, my: 1, i: 1, how: 1, do: 1, can: 1, where: 1,
        is: 1, of: 1, make: 1, change: 1, set: 1, add: 1, put: 1, get: 1, in: 1,
        for: 1, it: 1, me: 1, want: 1
    };

    function clean(s) {
        return String(s || '').replace(/\s+/g, ' ').replace(/[\s:]+$/, '').trim();
    }

    // Text that belongs to the element itself. A label like
    // "Music Volume <span>50%</span> <button>Preview</button>" reads as "Music Volume".
    function ownText(el) {
        var s = '';
        for (var i = 0; i < el.childNodes.length; i++) {
            if (el.childNodes[i].nodeType === 3) s += el.childNodes[i].textContent;
        }
        s = clean(s);
        return s || clean(el.textContent);
    }

    function words(s) {
        return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(Boolean);
    }

    // Hidden on purpose, as opposed to inside a dialog that is closed or a tab
    // that is not showing: an inline display:none or the hidden attribute.
    function hiddenWithin(el, stop) {
        return !!hiddenBy(el, stop);
    }

    function hiddenBy(el, stop) {
        for (var n = el; n && n !== stop; n = n.parentElement) {
            if (n.hidden || (n.style && n.style.display === 'none')) return n;
        }
        return null;
    }

    // Two kinds of hidden field. One matching cfg.offSelector (the other game
    // mode, a feature the class has blocked) does not exist for this project
    // and is not found. Any other is waiting on a switch in its dialog, like
    // Scroll Speed under Autoscroll: it is found, and the result says so.
    function fieldState(el, stop) {
        var off = false, waits = false;
        for (var n = el; n && n !== stop; n = n.parentElement) {
            if (!(n.hidden || (n.style && n.style.display === 'none'))) continue;
            if (cfg.offSelector && n.matches(cfg.offSelector)) off = true;
            else waits = true;
        }
        return off ? 'off' : (waits ? 'waits' : 'shown');
    }

    function isOpen(el) {
        return !!el && getComputedStyle(el).display !== 'none' && !el.hidden;
    }

    function dialogTitle(d, el) {
        if (d.title) return d.title;
        var h = el.querySelector(cfg.titleSelector);
        return h ? ownText(h) : d.id;
    }

    function closeOpenDialogs(except) {
        cfg.dialogs.forEach(function (d) {
            var el = document.getElementById(d.id);
            if (d === except || !isOpen(el)) return;
            if (d.close) { d.close(); return; }
            var btn = el.querySelector(cfg.closeSelector);
            if (btn) btn.click();
        });
    }

    function flash(target, control) {
        if (typeof target === 'function') target = target();
        if (!target) return;
        if (control && hiddenWithin(control, null)) control = null;
        target.scrollIntoView({ block: 'center' });
        if (control && control.focus) control.focus({ preventScroll: true });
        target.classList.remove('ms-flash');
        void target.offsetWidth;
        target.classList.add('ms-flash');
        setTimeout(function () { target.classList.remove('ms-flash'); }, 1400);
    }

    // A dialog that is already open is left open, so switching tabs inside it
    // never throws away what the student has typed.
    function openDialogAt(d, tabKey, target, control) {
        closeOpenDialogs(d);
        if (!isOpen(document.getElementById(d.id))) d.open();
        if (tabKey != null && d.showTab) d.showTab(tabKey);
        // Openers fill their fields and toggle mode rows as they run, so the row
        // is measured after that has happened.
        setTimeout(function () { flash(target, control); }, 30);
    }

    function buildIndex() {
        var items = [];
        var seen = {};
        problems = [];

        function add(it) {
            it.label = clean(it.label);
            it.path = it.path || '';
            // A one-letter label is a swatch's "x" or a step's "+", never something to look for.
            if (it.label.length < 2) return;
            var key = it.label.toLowerCase() + '|' + it.path.toLowerCase();
            if (seen[key]) return;
            // A dialog the menus already open is listed once, as the menu item.
            if (it.kind === 'dialog' && items.some(function (o) { return o.kind === 'menu' && o.label.toLowerCase() === it.label.toLowerCase(); })) return;
            seen[key] = 1;
            it.hay = words(it.label).concat(words(it.path));
            it.say = words(it.said || '');
            it.means = it.said ? 15 : 0;
            items.push(it);
        }

        if (cfg.menus) {
            document.querySelectorAll(cfg.menus.items).forEach(function (btn) {
                var menu = btn.closest(cfg.menus.menu);
                if (hiddenWithin(btn, menu)) return;
                var name = menu && menu.parentElement.querySelector(cfg.menus.toggle);
                add({
                    kind: 'menu',
                    label: ownText(btn),
                    path: name ? ownText(name) : '',
                    controlId: btn.id || '',
                    run: function () { btn.click(); }
                });
            });
        }

        // Toolbars: each button is found by its own text, or by its tooltip when
        // it is an icon. Running one is the same as clicking it.
        (cfg.buttons || []).forEach(function (src) {
            document.querySelectorAll(src.items).forEach(function (btn) {
                // Not drawn at all (a Stop button outside a run, a tab page not open) is not offered.
                if (hiddenWithin(btn, null) || !btn.getClientRects().length) return;
                var lab = src.label ? btn.querySelector(src.label) : null;
                var text = lab ? ownText(lab) : (clean(btn.textContent) || clean(btn.title).replace(/\s*\([^)]*\)$/, ''));
                add({
                    kind: 'menu', label: text, path: src.path || '',
                    controlId: btn.id || '',
                    run: function () { btn.click(); }
                });
            });
        });

        cfg.dialogs.forEach(function (d) {
            var el = document.getElementById(d.id);
            if (!el) { problems.push('dialog #' + d.id + ' is not on the page'); return; }
            if (d.when && !d.when()) return;
            var title = dialogTitle(d, el);
            var tabNames = {};

            add({
                kind: 'dialog', dialogId: d.id, label: title, path: d.path || '', sectionId: d.id,
                run: function () { openDialogAt(d, null, null, null); }
            });

            if (!d.fields) return;
            // A panel an app builds only when it opens is built once, out of sight, to be read.
            if (d.prime && !isOpen(el)) d.prime();
            var fieldSel = d.fieldSelector || cfg.fieldSelector;
            var groups = d.groupSelector ? Array.prototype.slice.call(el.querySelectorAll(d.groupSelector)) : [];

            if (d.tabs) {
                el.querySelectorAll(d.tabs.nav).forEach(function (nav) {
                    var key = nav.dataset[d.tabs.navKey || 'section'];
                    tabNames[key] = ownText(nav);
                    if (fieldState(nav, el) === 'off') return;
                    var sec = document.getElementById(d.tabs.sectionPrefix + key);
                    add({
                        kind: 'tab', dialogId: d.id, label: ownText(nav), path: title, sectionId: sec ? sec.id : '',
                        run: function () { openDialogAt(d, key, sec, null); }
                    });
                });
            }

            el.querySelectorAll(fieldSel).forEach(function (f, at) {
                var state = fieldState(f, el);
                if (state === 'off') return;
                var key = null;
                if (d.tabs) {
                    var sec = f.closest(d.tabs.section);
                    if (!sec) return;
                    key = sec.id.slice(d.tabs.sectionPrefix.length);
                }
                var rowSel = d.rowSelector || cfg.rowSelector;
                var row = f.closest(rowSel) || f.parentElement;
                // The heading this field sits under, for the path: "Course > Music".
                var group = null;
                if (groups.indexOf(f) < 0) {
                    groups.forEach(function (g) { if (g.compareDocumentPosition(f) & 4) group = g; });
                }
                // Nothing to flash while the row is hidden, so the result lands on
                // the nearest part of the tab that shows, which holds the switch.
                // An opener that rebuilds its panel replaces this row, so it is found
                // again by its place in the rebuilt one.
                function landing() {
                    var now = row;
                    if (!el.contains(row)) {
                        var again = el.querySelectorAll(fieldSel)[at];
                        now = again ? (again.closest(rowSel) || again.parentElement) : null;
                    }
                    if (!now) return el;
                    var h = hiddenBy(now, el);
                    return h ? (h.parentElement || now) : now;
                }
                var control = (f.htmlFor && document.getElementById(f.htmlFor)) ||
                    (f.tagName === 'LABEL' ? row.querySelector('input, select, textarea') : null);
                add({
                    kind: 'field',
                    dialogId: d.id,
                    label: ownText(f),
                    path: title + (key != null && tabNames[key] ? ' > ' + tabNames[key] : '') + (group ? ' > ' + ownText(group) : ''),
                    note: state === 'waits' ? (cfg.waitsNote || 'shows when its option is turned on') : '',
                    // A panel with no ids on its fields names them for the words list instead.
                    controlId: (d.keyOf && d.keyOf(f)) || (control && control.id ? control.id : ''),
                    run: function () { openDialogAt(d, key, landing, control); }
                });
            });
        });

        if (cfg.extras) {
            cfg.extras().forEach(function (x) {
                add({ kind: x.kind || 'extra', label: x.label, path: x.path || '', body: x.body || '', said: x.say || '', note: x.note || '', controlId: x.key || '', run: x.run });
            });
        }

        // Students type "song" and "jump higher", the labels say BGM and Jump Power.
        (cfg.words || []).forEach(function (w) {
            var say = words(w.say);
            // The first id is what the words mean most often, and it ranks first.
            w.find.forEach(function (id, n) {
                var hit = items.filter(function (it) { return it.controlId === id || it.sectionId === id; });
                if (!hit.length && !document.getElementById(id)) problems.push('words "' + w.say + '" point at #' + id + ', which is not on the page');
                hit.forEach(function (it) { it.say = it.say.concat(say); it.means = Math.max(it.means, n === 0 ? 15 : 5); });
            });
        });

        return items;
    }

    function helpText(it) {
        if (!it.body) return [];
        if (!helpTextCache[it.label]) {
            var div = document.createElement('div');
            div.innerHTML = it.body;
            helpTextCache[it.label] = words(div.textContent);
        }
        return helpTextCache[it.label];
    }

    var KIND_RANK = { field: 0, tab: 1, dialog: 2, menu: 3, extra: 4, help: 5 };
    function rank(kind) { return kind in KIND_RANK ? KIND_RANK[kind] : KIND_RANK.extra; }

    function search(q) {
        var qw = words(q).filter(function (w) { return !STOP[w]; });
        if (!qw.length) return [];
        var phrase = qw.join(' ');
        var out = [];
        buildIndex().forEach(function (it) {
            var label = words(it.label);
            var score = 0;
            var said = false;
            var all = qw.every(function (t) {
                function has(list) { return list.some(function (w) { return w.indexOf(t) === 0; }); }
                var inSay = has(it.say);
                if (inSay) said = true;
                if (has(label)) { score += 6; return true; }
                if (inSay) { score += 5; return true; }
                if (has(it.hay)) { score += 2; return true; }
                if (has(helpText(it))) { score += 1; return true; }
                return false;
            });
            if (!all) return;
            if (said) score += it.means;
            if (label.join(' ') === phrase) score += 20;
            else if (label.join(' ').indexOf(phrase) === 0) score += 8;
            out.push({ it: it, score: score });
        });
        out.sort(function (a, b) {
            return b.score - a.score || rank(a.it.kind) - rank(b.it.kind) || a.it.label.length - b.it.label.length;
        });
        return out.slice(0, cfg.limit || 8).map(function (r) { return r.it; });
    }

    function render() {
        var q = ui.input.value;
        shown = search(q);
        active = 0;
        ui.list.innerHTML = '';
        if (!q.trim()) { ui.list.hidden = true; return; }
        ui.list.hidden = false;
        if (!shown.length) {
            var none = document.createElement('div');
            none.className = 'ms-empty';
            none.textContent = 'Nothing called "' + q.trim() + '". ' + (cfg.emptyHint || 'Try a shorter word.');
            ui.list.appendChild(none);
            return;
        }
        shown.forEach(function (it, i) {
            var row = document.createElement('button');
            row.type = 'button';
            row.className = 'ms-row' + (i === 0 ? ' ms-active' : '');
            var l = document.createElement('span');
            l.className = 'ms-label';
            l.textContent = it.label;
            var p = document.createElement('span');
            p.className = 'ms-path';
            p.textContent = (it.kind === 'help' ? 'Help' + (it.path ? ' > ' + it.path : '') : it.path) + (it.note ? ' (' + it.note + ')' : '');
            row.appendChild(l);
            row.appendChild(p);
            row.addEventListener('mousedown', function (e) { e.preventDefault(); });
            row.addEventListener('click', function () { choose(i); });
            row.addEventListener('mousemove', function () { setActive(i); });
            ui.list.appendChild(row);
        });
    }

    function setActive(i) {
        var rows = ui.list.querySelectorAll('.ms-row');
        if (!rows.length) return;
        active = (i + rows.length) % rows.length;
        rows.forEach(function (r, j) { r.classList.toggle('ms-active', j === active); });
        rows[active].scrollIntoView({ block: 'nearest' });
    }

    // Some dialogs only keep changes when Save is pressed, and closing them is
    // Cancel. While one of those is open, a result elsewhere waits for it.
    function heldBy(it) {
        if (it.kind === 'help') return null;
        for (var i = 0; i < cfg.dialogs.length; i++) {
            var d = cfg.dialogs[i];
            if (d.holdOpen && d.id !== it.dialogId && isOpen(document.getElementById(d.id))) return d;
        }
        return null;
    }

    function choose(i) {
        var it = shown[i];
        if (!it) return;
        var held = heldBy(it);
        if (held) {
            ui.list.innerHTML = '';
            var msg = document.createElement('div');
            msg.className = 'ms-empty';
            msg.textContent = held.holdOpen;
            ui.list.appendChild(msg);
            shown = [];
            return;
        }
        if (cfg.onChoose) cfg.onChoose(ui.input.value, it);
        close();
        it.run();
    }

    function place() {
        var b = ui.trigger.getBoundingClientRect();
        var w = Math.min(340, window.innerWidth - 32);
        ui.panel.style.top = (b.bottom + 6) + 'px';
        ui.panel.style.left = Math.max(16, Math.min(b.right - w, window.innerWidth - w - 16)) + 'px';
    }

    function open() {
        place();
        ui.panel.hidden = false;
        ui.trigger.setAttribute('aria-expanded', 'true');
        ui.input.focus();
        ui.input.select();
        render();
    }

    function close() {
        ui.panel.hidden = true;
        ui.trigger.setAttribute('aria-expanded', 'false');
        if (document.activeElement === ui.input) ui.input.blur();
    }

    function typingIn(el) {
        if (!el) return false;
        var t = el.tagName;
        return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable;
    }

    function buildUI() {
        var mount = document.querySelector(cfg.mount);
        if (!mount) { problems.push('mount ' + cfg.mount + ' is not on the page'); return false; }

        ui.root = document.createElement('div');
        ui.root.className = 'ms-root';
        ui.root.innerHTML =
            '<button type="button" class="ms-trigger" aria-haspopup="true" aria-expanded="false" title="Search menus and settings (/ or Ctrl+K)">' +
                '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/></svg>' +
                '<span class="ms-trigger-text">Search</span>' +
            '</button>' +
            '<div class="ms-panel" hidden>' +
                '<input type="text" class="ms-input" placeholder="' + (cfg.placeholder || 'Search menus and settings') + '" autocomplete="off" spellcheck="false" aria-label="Search menus and settings">' +
                '<div class="ms-list" role="listbox" hidden></div>' +
                '<div class="ms-foot">Up and Down to pick, Enter to open, Esc to close</div>' +
            '</div>';
        var ref = cfg.before ? mount.querySelector(cfg.before) : null;
        if (ref) mount.insertBefore(ui.root, ref);
        else if (cfg.mountAt === 'end') mount.appendChild(ui.root);
        else mount.insertBefore(ui.root, mount.firstChild);

        ui.trigger = ui.root.querySelector('.ms-trigger');
        ui.panel = ui.root.querySelector('.ms-panel');
        // On the body, not in the menubar: a menubar is its own stacking context,
        // and the panel has to sit above whatever dialog is open.
        document.body.appendChild(ui.panel);
        ui.input = ui.panel.querySelector('.ms-input');
        ui.list = ui.panel.querySelector('.ms-list');

        ui.trigger.addEventListener('click', function () { ui.panel.hidden ? open() : close(); });
        ui.input.addEventListener('input', render);
        // Handled here and stopped, so the app's own Esc (play test, deselect)
        // and arrow keys (pan) never see keys meant for the box.
        ui.input.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown') { setActive(active + 1); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { setActive(active - 1); e.preventDefault(); }
            else if (e.key === 'Enter') { choose(active); e.preventDefault(); }
            else if (e.key === 'Escape') {
                if (ui.input.value) { ui.input.value = ''; render(); } else close();
                e.preventDefault();
            } else if (e.key === 'Tab') close();
            e.stopPropagation();
        });
        ui.input.addEventListener('keyup', function (e) { e.stopPropagation(); });
        document.addEventListener('mousedown', function (e) {
            if (!ui.panel.hidden && !ui.root.contains(e.target) && !ui.panel.contains(e.target)) close();
        });
        // Capture phase, so the app's single-key shortcuts never see these.
        document.addEventListener('keydown', function (e) {
            var slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !typingIn(document.activeElement);
            var ctrlK = (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K');
            if (!slash && !ctrlK) return;
            if (cfg.enabled && !cfg.enabled()) return;
            e.preventDefault();
            e.stopPropagation();
            open();
        }, true);
        return true;
    }

    function injectStyle() {
        if (document.getElementById('ms-style')) return;
        var st = document.createElement('style');
        st.id = 'ms-style';
        st.textContent =
            '.ms-root{position:relative;display:inline-flex;align-items:center}' +
            '.ms-trigger{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:6px;cursor:pointer;' +
                'background:var(--ms-bg,#1a1e26);color:var(--ms-text-2,#a4acb9);border:1px solid var(--ms-line,#2a303b);font:inherit;font-size:12px}' +
            '.ms-trigger:hover,.ms-trigger[aria-expanded="true"]{color:var(--ms-text,#e6e9ef);border-color:var(--ms-line-strong,#3a4250)}' +
            '.ms-panel{position:fixed;z-index:100000;width:340px;max-width:calc(100vw - 32px);box-sizing:border-box;' +
                'background:var(--ms-bg,#1a1e26);border:1px solid var(--ms-line-strong,#3a4250);border-radius:8px;' +
                'box-shadow:0 10px 30px rgba(0,0,0,.45);padding:8px}' +
            '.ms-panel[hidden],.ms-list[hidden]{display:none}' +
            '.ms-input{width:100%;box-sizing:border-box;height:32px;padding:0 10px;border-radius:6px;font:inherit;font-size:13px;' +
                'background:var(--ms-input-bg,#0f1115);color:var(--ms-text,#e6e9ef);border:1px solid var(--ms-line,#2a303b);outline:none}' +
            '.ms-input:focus{border-color:var(--ms-accent,#4f8cff)}' +
            '.ms-list{margin-top:6px;max-height:320px;overflow-y:auto}' +
            '.ms-row{display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;text-align:left;padding:6px 8px;' +
                'border:0;border-radius:5px;background:none;color:var(--ms-text,#e6e9ef);font:inherit;cursor:pointer}' +
            '.ms-row.ms-active{background:var(--ms-accent-soft,rgba(79,140,255,.15))}' +
            '.ms-label{font-size:13px}' +
            '.ms-path{font-size:11px;color:var(--ms-text-3,#7c8594)}' +
            '.ms-empty{padding:8px;font-size:12px;color:var(--ms-text-2,#a4acb9)}' +
            '.ms-foot{margin-top:6px;font-size:10px;color:var(--ms-text-3,#7c8594)}' +
            '@keyframes ms-flash{0%,50%,100%{box-shadow:0 0 0 2px transparent}25%,75%{box-shadow:0 0 0 2px var(--ms-accent,#4f8cff)}}' +
            '.ms-flash{animation:ms-flash 1.2s ease-in-out;border-radius:4px}' +
            '@media (max-width:1180px){.ms-trigger-text{display:none}.ms-trigger{padding:0 8px}}';
        document.head.appendChild(st);
    }

    window.MenuSearch = {
        init: function (config) {
            cfg = Object.assign({
                dialogs: [],
                titleSelector: 'h2',
                closeSelector: '.modal-close-btn',
                fieldSelector: 'label, h3, h4',
                rowSelector: '.form-group'
            }, config);
            injectStyle();
            buildUI();
        },
        open: open,
        close: close,
        // For an app's own result that opens something itself and then wants
        // the same flash on what it opened.
        flash: function (el, control) { flash(el, control); },
        // For check scripts and tests: what the box would find right now, and
        // anything in the config that no longer matches the page.
        items: function () { return buildIndex(); },
        search: function (q) { return search(q); },
        problems: function () { buildIndex(); return problems.slice(); }
    };
})();
