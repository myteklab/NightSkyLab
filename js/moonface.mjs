// One Moon face at a phase angle (0 new, 90 first quarter, 180 full, 270 last quarter).
// A waxing Moon is lit on the right as seen from the north; the south sees it the other way up.
export function drawPhase(g, cx, cy, r, phaseAngle, mirror, light = '#f1efe4', dark = '#3a3f52') {
    const k = Math.cos(phaseAngle * Math.PI / 180);
    // past full the lit side has moved to the left
    if (((phaseAngle % 360) + 360) % 360 > 180) mirror = !mirror;
    g.save();
    g.translate(cx, cy);
    if (mirror) g.scale(-1, 1);
    g.fillStyle = dark;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = light;
    g.beginPath();
    g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    const a = Math.max(0.01, Math.abs(k)) * r;
    if (k < 0) g.ellipse(0, 0, a, r, 0, Math.PI / 2, Math.PI * 1.5, false);
    else g.ellipse(0, 0, a, r, 0, Math.PI / 2, Math.PI * 1.5, true);
    g.closePath(); g.fill();
    g.restore();
}
