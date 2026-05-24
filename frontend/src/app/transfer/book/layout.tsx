import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'book',
        pathname: '/transfer/book',
        fallbackTitle: 'Transfer Rezervasyonu — Online Anında Booking',
        fallbackDescription: 'Havalimanı, otel ve şehirler arası transfer rezervasyonu yapın. Fiyat karşılaştırma, anında onay, esnek ödeme seçenekleri.',
        fallbackKeywords: [
            'transfer rezervasyon', 'online rezervasyon', 'havalimanı transfer rezervasyon',
            'otel transferi rezervasyon', 'transfer fiyatları', 'vip transfer rezervasyon',
        ],
    });
}

export default function BookLayout({ children }: { children: React.ReactNode }) {
    return children;
}
