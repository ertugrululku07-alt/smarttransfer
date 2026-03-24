// API client with authentication
import axios from 'axios';

const rawApiUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://smarttransfer-backend-production.up.railway.app').replace(/[\r\n]+/g, '').trim();
const rawTenantSlug = process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo';

const API_URL = rawApiUrl.replace(/[\r\n]+/g, '').trim();
const TENANT_SLUG = rawTenantSlug.replace(/[\r\n]+/g, '').trim();

// Create axios instance
const apiClient = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Slug': TENANT_SLUG,
    },
});

export const getImageUrl = (url?: string | null) => {
    if (!url) return undefined;
    if (url.startsWith('http://localhost:4000')) {
        return url.replace('http://localhost:4000', API_URL);
    }
    if (url.startsWith('/uploads')) {
        return `${API_URL}${url}`;
    }
    return url;
};

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
    // Log for debugging
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);

    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    }
    return config;
});

// Handle response errors
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Unauthorized - redirect to login
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
