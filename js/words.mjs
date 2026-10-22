// Small formatting helpers shared by the screens.
import * as S from './sky.mjs?v=4';

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function clock(lp) {
    const h12 = lp.h % 12 === 0 ? 12 : lp.h % 12;
    return `${h12}:${String(lp.m).padStart(2, '0')} ${lp.h < 12 ? 'am' : 'pm'}`;
}
// an instant as a wall clock in the place's zone; rounded to five minutes unless exact is asked
export function timeAt(date, zone, exact) {
    if (!date) return null;
    const lp = S.localParts(date, zone);
    if (!exact) { const m = Math.round(lp.m / 5) * 5; if (m === 60) { lp.h = (lp.h + 1) % 24; lp.m = 0; } else lp.m = m; }
    return clock(lp);
}
export function dateWords(dateStr) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
export function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
export const deg = (x, places = 0) => x.toFixed(places) + '°';
export function hms(hours) {
    const h = Math.floor(hours), m = Math.floor((hours - h) * 60), s = Math.round(((hours - h) * 60 - m) * 60);
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}
export function dms(d) {
    const sign = d < 0 ? '-' : '+', a = Math.abs(d), dd = Math.floor(a), m = Math.floor((a - dd) * 60), s = Math.round(((a - dd) * 60 - m) * 60);
    return `${sign}${dd}° ${String(m).padStart(2, '0')}' ${String(s).padStart(2, '0')}"`;
}
