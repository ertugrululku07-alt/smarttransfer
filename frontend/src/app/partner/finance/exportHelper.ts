import { API_URL } from '@/lib/config';

function download(url: string, filename: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.blob())
    .then((blob) => {
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(u);
    });
}

export function exportResource(resource: string, name: string) {
  return download(`${API_URL}/api/partner-accounting/exports/${resource}`, `${name}-${new Date().toISOString().slice(0, 10)}.csv`);
}

export function exportResourceXlsx(resource: string, name: string) {
  return download(`${API_URL}/api/partner-accounting/exports/${resource}.xlsx`, `${name}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
