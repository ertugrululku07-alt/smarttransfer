// API client with authentication
import axios from 'axios';

const rawApiUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim();
const rawTenantSlug = process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo';

// Defensive check: Railway URLs use dashes, never underscores. 
// If an underscore is found in the domain part, it's likely a typo in the environment variable.
const sanitizeUrl = (url: string) => {
    if (url.includes('up.railway.app') && url.includes('_')) {
        // Only replace underscores in the hostname part
        const parts = url.split('/');
        if (parts.length >= 3) {
            parts[2] = parts[2].replace(/_/g, '-');
            return parts.join('/');
        }
    }
    return url;
};

const API_URL = sanitizeUrl(rawApiUrl);
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
    
    // Version: 2.3.6 (Prod-Ready)
    const normalizedUrl = url.trim();
    
    if (normalizedUrl.startsWith('data:image')) {
        return normalizedUrl;
    }
    
    // 1. Handle localhost/127.0.0.1 legacy URLs
    if (normalizedUrl.includes('localhost') || normalizedUrl.includes('127.0.0.1')) {
        // Find the index of /uploads to preserve the path
        const uploadIndex = normalizedUrl.indexOf('/uploads');
        if (uploadIndex !== -1) {
            return `${API_URL}${normalizedUrl.substring(uploadIndex)}`;
        }
    }
    
    // 2. Handle relative paths
    if (normalizedUrl.startsWith('/uploads')) {
        return `${API_URL}${normalizedUrl}`;
    }
    
    // 3. Handle just the filename (if somehow the prefix was lost)
    if (!normalizedUrl.startsWith('http') && !normalizedUrl.startsWith('/')) {
        return `${API_URL}/uploads/${normalizedUrl}`;
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
