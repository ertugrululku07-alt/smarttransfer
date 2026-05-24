import type { Metadata } from 'next';
import HomePageClient from './HomePageClient';
import HomeJsonLd from './components/HomeJsonLd';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'home',
        pathname: '/',
    });
}

export default function HomePage() {
    return (
        <>
            <HomeJsonLd />
            <HomePageClient />
        </>
    );
}
