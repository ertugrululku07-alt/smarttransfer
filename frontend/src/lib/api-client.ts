// API client with authentication
import axios from 'axios';

// ── Central API Configuration ──
// All URLs come from environment variables. NO hardcoded domains.
// Dev: .env.local → http://localhost:4000
// Prod: .env.production → https://your-domain.com  (set during deployment)
const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/[\r\n]+/g, '').trim();
const SOCKET_URL = (process.env.NEXT_PUBLIC_SOCKET_URL || API_URL).replace(/[\r\n]+/g, '').trim();
const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();

export { API_URL, SOCKET_URL, TENANT_SLUG };

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
    
    // Version: 2.3.7 (Dynamic Absolute Path Resolver)
    const normalizedUrl = url.trim();
    
    if (normalizedUrl.startsWith('data:image')) {
        return normalizedUrl;
    }
    
    // Dynamically resolve API_URL at execution time to prevent Next.js build-time inline issues
    const currentApiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/[\r\n]+/g, '').trim();
    
    // 1. Handle localhost/127.0.0.1 legacy URLs
    if (normalizedUrl.includes('localhost') || normalizedUrl.includes('127.0.0.1')) {
        const uploadIndex = normalizedUrl.indexOf('/uploads');
        if (uploadIndex !== -1) {
            return `${currentApiUrl}${normalizedUrl.substring(uploadIndex)}`;
        }
    }
    
    // 2. Handle relative paths
    if (normalizedUrl.startsWith('/uploads')) {
        // Enforce that currentApiUrl is applied. If currentApiUrl is empty for some reason, we must prevent broken URLs.
        const safeApiUrl = currentApiUrl === '' ? (typeof window !== 'undefined' ? window.location.origin.replace('www.', 'api.') : '') : currentApiUrl;
        return `${safeApiUrl}${normalizedUrl}`;
    }
    
    // 3. Handle just the filename (if somehow the prefix was lost)
    if (!normalizedUrl.startsWith('http') && !normalizedUrl.startsWith('/')) {
        const safeApiUrl = currentApiUrl === '' ? (typeof window !== 'undefined' ? window.location.origin.replace('www.', 'api.') : '') : currentApiUrl;
        return `${safeApiUrl}/uploads/${normalizedUrl}`;
    }
    
    return normalizedUrl;
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
