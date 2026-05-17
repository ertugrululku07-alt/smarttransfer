// API client with authentication
import axios from 'axios';

// ── Central API Configuration ──
// All URLs are dynamically managed to avoid baked-in build-time URLs (like Railway).
// Dev: http://localhost:4000
// Prod: Dynamically resolved from window.location.hostname (e.g. jet2home.com -> https://api.jet2home.com)
let dynamicApiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/[\r\n]+/g, '').trim();

if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        const baseDomain = hostname.replace('www.', '');
        // If the user visits jet2home.com, API will be api.jet2home.com
        dynamicApiUrl = `https://api.${baseDomain}`;
    }
}

const API_URL = dynamicApiUrl;
const SOCKET_URL = API_URL;
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
    const currentApiUrl = API_URL;
    
    // 1. Handle localhost/127.0.0.1 legacy URLs
    if (normalizedUrl.includes('localhost') || normalizedUrl.includes('127.0.0.1')) {
        const uploadIndex = normalizedUrl.indexOf('/uploads');
        if (uploadIndex !== -1) {
            return `${currentApiUrl}${normalizedUrl.substring(uploadIndex)}`;
        }
    }
    
    // 2. Handle relative paths
    if (normalizedUrl.startsWith('/uploads')) {
        return `${currentApiUrl}${normalizedUrl}`;
    }
    
    // 3. Handle just the filename (if somehow the prefix was lost)
    if (!normalizedUrl.startsWith('http') && !normalizedUrl.startsWith('/')) {
        return `${currentApiUrl}/uploads/${normalizedUrl}`;
    }
    
    // If it's a full URL but pointing to the old railway backend, rewrite it dynamically
    if (normalizedUrl.includes('railway.app') || normalizedUrl.includes('up.railway.app')) {
        const uploadIndex = normalizedUrl.indexOf('/uploads');
        if (uploadIndex !== -1) {
            return `${currentApiUrl}${normalizedUrl.substring(uploadIndex)}`;
        }
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
