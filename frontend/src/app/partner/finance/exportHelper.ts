import { API_URL } from '@/lib/config';

export function exportResource(resource: string, name: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  fetch(`${API_URL}/api/partner-accounting/exports/${resource}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((r) => r.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
}
