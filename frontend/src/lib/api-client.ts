// API client with authentication
import axios from 'axios';
import { config } from './config';

export { API_URL, SOCKET_URL, TENANT_SLUG, HERE_API_KEY } from './config';

export const getImageUrl = (url?: string | null) => {
    if (!url) return undefined;

    const normalizedUrl = url.trim();
    const currentApiUrl = config.apiUrl;

    if (normalizedUrl.startsWith('data:image')) {
        return normalizedUrl;
    }

    if (normalizedUrl.includes('localhost') || normalizedUrl.includes('127.0.0.1')) {
        const uploadIndex = normalizedUrl.indexOf('/uploads');
        if (uploadIndex !== -1) {
            return `${currentApiUrl}${normalizedUrl.substring(uploadIndex)}`;
        }
    }

    if (normalizedUrl.startsWith('/uploads')) {
        return `${currentApiUrl}${normalizedUrl}`;
    }

    if (!normalizedUrl.startsWith('http') && !normalizedUrl.startsWith('/')) {
        return `${currentApiUrl}/uploads/${normalizedUrl}`;
    }

    if (normalizedUrl.includes('railway.app') || normalizedUrl.includes('up.railway.app')) {
        const uploadIndex = normalizedUrl.indexOf('/uploads');
        if (uploadIndex !== -1) {
            return `${currentApiUrl}${normalizedUrl.substring(uploadIndex)}`;
        }
    }

    return normalizedUrl;
};

const apiClient = axios.create({
    headers: {
        'Content-Type': 'application/json',
    },
});

apiClient.interceptors.request.use((requestConfig) => {
    requestConfig.baseURL = config.apiUrl;
    requestConfig.headers['X-Tenant-Slug'] = config.tenantSlug;

    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token) {
            requestConfig.headers.Authorization = `Bearer ${token}`;
        }
    }
    return requestConfig;
});

apiClient.interceptors.response.use(
    (response) => {
        // Auto-invalidate the in-memory tenant-info cache when tenant settings
        // are mutated, so subsequent reads pick up the fresh values immediately.
        try {
            const method = (response.config?.method || '').toLowerCase();
            const url = response.config?.url || '';
            if (
                method !== 'get' &&
                (url.includes('/api/tenant/settings') ||
                 url.includes('/api/tenant/info') ||
                 url.includes('/api/tenant/branding'))
            ) {
                // Lazy import to avoid circular dependency at module init time
                import('./tenant-info-cache').then(({ invalidateTenantInfo }) => {
                    invalidateTenantInfo();
                }).catch(() => {});
            }
        } catch {
            // ignore - never block the response on cache management
        }
        return response;
    },
    (error) => {
        if (error.response?.status === 401) {
            if (typeof window !== 'undefined') {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default apiClient;
