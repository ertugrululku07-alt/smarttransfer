import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';
import ContactJsonLd from '../components/ContactJsonLd';

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'contact',
        pathname: '/contact',
        fallbackTitle: 'İletişim — Bize Ulaşın',
        fallbackDescription: '7/24 müşteri hizmetlerimize telefon, e-posta veya iletişim formu üzerinden ulaşabilirsiniz. Şubelerimiz ve adres bilgilerimiz için tıklayın.',
        fallbackKeywords: [
            'iletişim', 'müşteri hizmetleri', 'transfer iletişim', 'şube adresleri',
            'transfer telefon', 'transfer e-posta',
        ],
    });
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <ContactJsonLd />
            {children}
        </>
    );
}
