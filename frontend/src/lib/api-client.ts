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

    // Rewrite old/wrong domain uploads to current API domain
    if (normalizedUrl.includes('/uploads/')) {
        try {
            const u = new URL(normalizedUrl);
            const currentHost = new URL(currentApiUrl).hostname;
            if (u.hostname !== currentHost && u.hostname !== 'localhost') {
                return `${currentApiUrl}${u.pathname}`;
            }
        } catch {}
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
    (response) => response,
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
