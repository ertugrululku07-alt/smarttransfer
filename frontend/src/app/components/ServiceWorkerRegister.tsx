'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker on production builds only.
 * Should be rendered once in the root layout.
 */
export default function ServiceWorkerRegister() {
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') return;
        if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

        const onLoad = () => {
            navigator.serviceWorker
                .register('/sw.js', { scope: '/' })
                .then((reg) => {
                    // Check for updates every hour
                    setInterval(() => reg.update(), 60 * 60 * 1000);
                })
                .catch((err) => {
                    console.warn('ServiceWorker registration failed:', err);
                });
        };

        if (document.readyState === 'complete') {
            onLoad();
        } else {
            window.addEventListener('load', onLoad, { once: true });
            return () => window.removeEventListener('load', onLoad);
        }
    }, []);

    return null;
}
