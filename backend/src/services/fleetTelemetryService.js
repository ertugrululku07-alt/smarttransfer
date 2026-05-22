/**
 * Fleet telemetry helpers — geofence checks, driving analysis, behavior scoring
 */

function haversineM(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInPolygon(lat, lng, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const pi = polygon[i];
        const pj = polygon[j];
        const latI = Array.isArray(pi) ? pi[0] : pi.lat;
        const lngI = Array.isArray(pi) ? pi[1] : pi.lng;
        const latJ = Array.isArray(pj) ? pj[0] : pj.lat;
        const lngJ = Array.isArray(pj) ? pj[1] : pj.lng;
        if (((lngI > lng) !== (lngJ > lng))
            && (lat < (latJ - latI) * (lng - lngI) / ((lngJ - lngI) || 1e-9) + latI)) {
            inside = !inside;
        }
    }
    return inside;
}

function isInsideGeofence(gf, lat, lng) {
    if (lat == null || lng == null) return false;
    if (gf.type === 'CIRCLE') {
        if (gf.centerLat == null || gf.centerLng == null || !gf.radiusM) return false;
        return haversineM(lat, lng, gf.centerLat, gf.centerLng) <= gf.radiusM;
    }
    if (gf.type === 'POLYGON') {
        return pointInPolygon(lat, lng, gf.polygon);
    }
    return false;
}

function geofenceAppliesToVehicle(gf, vehicleId) {
    if (!gf.vehicleIds) return true;
    const ids = Array.isArray(gf.vehicleIds) ? gf.vehicleIds : [];
    if (!ids.length) return true;
    return ids.includes(vehicleId);
}

function shouldAlert(gf, eventType) {
    if (gf.alertOn === 'BOTH') return true;
    return gf.alertOn === eventType;
}

function analyzeDrivingTelemetry(rows, opts = {}) {
    const speedLimit = opts.speedLimit || 120;
    const harshBrakeDelta = opts.harshBrakeDelta || 25;
    const harshAccelDelta = opts.harshAccelDelta || 20;
    const maxGapSec = opts.maxGapSec || 30;

    let distanceKm = 0;
    let speedViolations = 0;
    let harshBrakes = 0;
    let harshAccels = 0;
    let maxSpeed = 0;
    let speedSum = 0;
    let speedCount = 0;
    const route = [];

    const sorted = [...rows].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    for (let i = 0; i < sorted.length; i++) {
        const r = sorted[i];
        if (r.lat != null && r.lng != null) {
            route.push({
                lat: r.lat,
                lng: r.lng,
                speed: r.speed,
                timestamp: r.timestamp,
            });
        }

        if (r.payload?.harshBrake) harshBrakes++;
        if (r.payload?.harshAccel) harshAccels++;
        if (r.payload?.speedViolation) speedViolations++;

        if (r.speed != null) {
            if (r.speed > speedLimit && !r.payload?.speedViolation) speedViolations++;
            maxSpeed = Math.max(maxSpeed, r.speed);
            speedSum += r.speed;
            speedCount++;
        }

        if (i > 0) {
            const prev = sorted[i - 1];
            const dt = (new Date(r.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
            if (dt > 0 && dt <= maxGapSec && prev.speed != null && r.speed != null) {
                const delta = r.speed - prev.speed;
                if (delta <= -harshBrakeDelta) harshBrakes++;
                else if (delta >= harshAccelDelta) harshAccels++;
            }
            if (prev.lat != null && prev.lng != null && r.lat != null && r.lng != null) {
                distanceKm += haversineM(prev.lat, prev.lng, r.lat, r.lng) / 1000;
            }
        }
    }

    const odometers = sorted.filter((r) => r.odometer != null).map((r) => Number(r.odometer));
    if (odometers.length >= 2) {
        const odoDist = Math.max(0, odometers[odometers.length - 1] - odometers[0]);
        if (odoDist > distanceKm) distanceKm = odoDist;
    }

    const avgSpeed = speedCount ? speedSum / speedCount : 0;
    const score = computeBehaviorScore({ speedViolations, harshBrakes, harshAccels });

    return {
        pointCount: sorted.length,
        distanceKm: Math.round(distanceKm * 100) / 100,
        speedViolations,
        harshBrakes,
        harshAccels,
        maxSpeed: Math.round(maxSpeed),
        avgSpeed: Math.round(avgSpeed * 10) / 10,
        score,
        route,
        startAt: sorted[0]?.timestamp || null,
        endAt: sorted[sorted.length - 1]?.timestamp || null,
    };
}

function computeBehaviorScore({ speedViolations = 0, harshBrakes = 0, harshAccels = 0 }) {
    let score = 100;
    score -= Math.min(35, speedViolations * 2);
    score -= Math.min(30, harshBrakes * 5);
    score -= Math.min(25, harshAccels * 3);
    return Math.max(0, Math.round(score));
}

function gradeFromScore(score) {
    if (score >= 90) return { grade: 'A', label: 'Mükemmel', color: '#10b981' };
    if (score >= 75) return { grade: 'B', label: 'İyi', color: '#22c55e' };
    if (score >= 60) return { grade: 'C', label: 'Orta', color: '#f59e0b' };
    if (score >= 40) return { grade: 'D', label: 'Zayıf', color: '#f97316' };
    return { grade: 'F', label: 'Kritik', color: '#ef4444' };
}

function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildDrivingReportHtml({ report, vehicle, partner, profile, dateLabel }) {
    const grade = gradeFromScore(report.score);
    const routeRows = (report.route || []).slice(0, 200).map((p, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${new Date(p.timestamp).toLocaleString('tr-TR')}</td>
            <td>${p.lat?.toFixed?.(5) ?? '-'}</td>
            <td>${p.lng?.toFixed?.(5) ?? '-'}</td>
            <td>${p.speed != null ? Math.round(p.speed) : '-'}</td>
        </tr>
    `).join('');

    return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/>
<title>Sürüş Raporu · ${escapeHtml(vehicle?.plate)} · ${escapeHtml(dateLabel)}</title>
<style>
body{font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px;color:#0f172a}
.wrap{max-width:920px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 8px 30px rgba(15,23,42,.08)}
h1{margin:0 0 6px;font-size:24px}
.sub{color:#64748b;margin:0 0 20px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}
.kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px}
.kpi .l{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.4px}
.kpi .v{font-size:22px;font-weight:800;margin-top:4px}
.score{display:inline-block;padding:8px 14px;border-radius:999px;color:#fff;font-weight:800;background:${grade.color}}
table{width:100%;border-collapse:collapse;margin-top:18px;font-size:12px}
th,td{border:1px solid #e2e8f0;padding:8px;text-align:left}
th{background:#f1f5f9}
.foot{margin-top:24px;font-size:11px;color:#94a3b8;text-align:center}
@media print{body{background:#fff;padding:0}.wrap{box-shadow:none}}
</style></head><body><div class="wrap">
<h1>Sürüş Raporu</h1>
<p class="sub">${escapeHtml(profile?.companyName || partner?.fullName || 'Partner')} · ${escapeHtml(vehicle?.plate || '')} · ${escapeHtml(dateLabel)}</p>
<div class="score">Skor ${report.score}/100 · ${grade.grade} · ${grade.label}</div>
<div class="grid">
  <div class="kpi"><div class="l">Mesafe</div><div class="v">${report.distanceKm} km</div></div>
  <div class="kpi"><div class="l">Ort. Hız</div><div class="v">${report.avgSpeed} km/sa</div></div>
  <div class="kpi"><div class="l">Maks. Hız</div><div class="v">${report.maxSpeed} km/sa</div></div>
  <div class="kpi"><div class="l">Hız İhlali</div><div class="v">${report.speedViolations}</div></div>
  <div class="kpi"><div class="l">Ani Fren</div><div class="v">${report.harshBrakes}</div></div>
  <div class="kpi"><div class="l">Ani Hızlanma</div><div class="v">${report.harshAccels}</div></div>
  <div class="kpi"><div class="l">Yakıt (gün)</div><div class="v">${report.fuelLiters ?? 0} L</div></div>
  <div class="kpi"><div class="l">Yakıt Tutarı</div><div class="v">${report.fuelTotal ?? 0} ₺</div></div>
</div>
<h3>Rota Noktaları</h3>
<table><thead><tr><th>#</th><th>Zaman</th><th>Enlem</th><th>Boylam</th><th>Hız</th></tr></thead><tbody>${routeRows || '<tr><td colspan="5">Veri yok</td></tr>'}</tbody></table>
<div class="foot">SmartTransfer · ${new Date().toLocaleString('tr-TR')}</div>
</div></body></html>`;
}

module.exports = {
    haversineM,
    pointInPolygon,
    isInsideGeofence,
    geofenceAppliesToVehicle,
    shouldAlert,
    analyzeDrivingTelemetry,
    computeBehaviorScore,
    gradeFromScore,
    buildDrivingReportHtml,
};
