import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'track',
        pathname: '/track',
        fallbackTitle: 'Rezervasyon Sorgula — Transferinizi Anlık Takip Edin',
        fallbackDescription: 'Rezervasyon numaranız ve e-posta/telefon bilginizle transferinizin anlık durumunu, sürücü konumunu ve detaylarını canlı olarak takip edin.',
        fallbackKeywords: [
            'rezervasyon sorgula', 'transfer takip', 'anlık takip', 'rezervasyon durumu',
            'sürücü konumu', 'transfer durumu', 'havalimanı transfer takip',
        ],
    });
}

export default function TrackLayout({ children }: { children: React.ReactNode }) {
    return children;
}
