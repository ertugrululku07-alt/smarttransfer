// ── SmartTransfer Partner App — Central Configuration ──
// All API URLs are defined here. Change ONLY this file when deploying to a new server.
//
// DEPLOYMENT: Before building a new APK, update API_URL and SOCKET_URL below
// to match your production backend domain.

export const API_URL = 'http://localhost:4000/api';
export const SOCKET_URL = 'http://localhost:4000';
export const TENANT_SLUG = 'smarttravel-demo';
export const BASE_URL = API_URL.replace(/\/api$/, '');
