'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  UserOutlined, CarOutlined, ShopOutlined, ArrowRightOutlined,
  SafetyCertificateOutlined, GlobalOutlined, TeamOutlined
} from '@ant-design/icons';

const roles = [
  {
    key: 'customer',
    title: 'Müşteri',
    subtitle: 'Bireysel Hesap',
    description: 'Transfer hizmetlerinden faydalanmak, rezervasyon yapmak ve özel fırsatlardan yararlanmak için kayıt olun.',
    icon: UserOutlined,
    color: '#6366f1',
    gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    features: ['Online rezervasyon', 'Fiyat karşılaştırma', 'Geçmiş siparişler'],
    href: '/register/customer',
  },
  {
    key: 'partner',
    title: 'Partner / Sürücü',
    subtitle: 'İş Ortağı Başvurusu',
    description: 'Kendi aracınızla ekibimize katılın, transfer taleplerini alın ve düzenli gelir elde edin.',
    icon: CarOutlined,
    color: '#0891b2',
    gradient: 'linear-gradient(135deg, #0891b2, #06b6d4)',
    features: ['Transfer talepleri', 'Esnek çalışma', 'Anlık ödemeler'],
    href: '/register/partner',
  },
  {
    key: 'agency',
    title: 'Alt Acenta',
    subtitle: 'B2B İş Ortaklığı',
    description: 'Kendi müşterilerinize transfer hizmeti sunun. Özel fiyatlar, komisyon ve yönetim paneline erişin.',
    icon: ShopOutlined,
    color: '#7c3aed',
    gradient: 'linear-gradient(135deg, #7c3aed, #a855f7)',
    features: ['Özel B2B fiyatlar', 'Komisyon sistemi', 'Acenta paneli'],
    href: '/register/agency',
  },
];

export default function RegisterPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  return (
    <>
      <style>{`
        @keyframes regFadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .reg-page { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 50%, #f8fafc 100%); padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .reg-header { text-align: center; margin-bottom: 48px; animation: regFadeUp 0.5s ease both; }
        .reg-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 1000px; width: 100%; }
        .reg-card { background: #fff; border-radius: 24px; overflow: hidden; cursor: pointer; border: 2px solid #f0f0f0; transition: all 0.3s ease; position: relative; animation: regFadeUp 0.5s ease both; }
        .reg-card:hover { border-color: transparent; transform: translateY(-6px); }
        @media (max-width: 900px) { .reg-grid { grid-template-columns: 1fr; max-width: 420px; } }
        @media (max-width: 480px) { .reg-page { padding: 24px 16px; } .reg-grid { gap: 16px; } }
      `}</style>

      <div className="reg-page">
        <div className="reg-header" style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.3s' }}>
          {/* Logo */}
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(99,102,241,0.25)',
          }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>ST</span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1a1a2e', margin: '0 0 8px', letterSpacing: -0.5 }}>
            Kayıt Ol
          </h1>
          <p style={{ fontSize: 15, color: '#64748b', margin: 0, maxWidth: 460, lineHeight: 1.5 }}>
            Size en uygun hesap tipini seçerek SmartTransfer ailesine katılın
          </p>
        </div>

        <div className="reg-grid">
          {roles.map((role, i) => {
            const Icon = role.icon;
            const isHovered = hoveredKey === role.key;
            return (
              <div
                key={role.key}
                className="reg-card"
                style={{
                  animationDelay: `${0.1 + i * 0.1}s`,
                  boxShadow: isHovered
                    ? `0 20px 40px ${role.color}20, 0 0 0 2px ${role.color}`
                    : '0 1px 3px rgba(0,0,0,0.04)',
                }}
                onMouseEnter={() => setHoveredKey(role.key)}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={() => router.push(role.href)}
              >
                {/* Header gradient */}
                <div style={{
                  height: 6,
                  background: role.gradient,
                  transition: 'height 0.3s',
                  ...(isHovered ? { height: 8 } : {}),
                }} />

                <div style={{ padding: '28px 24px 24px' }}>
                  {/* Icon */}
                  <div style={{
                    width: 56, height: 56, borderRadius: 16,
                    background: `${role.color}10`,
                    border: `2px solid ${role.color}25`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 20,
                    transition: 'all 0.3s',
                    ...(isHovered ? { background: role.gradient, border: 'none' } : {}),
                  }}>
                    <Icon style={{
                      fontSize: 24,
                      color: isHovered ? '#fff' : role.color,
                      transition: 'color 0.3s',
                    }} />
                  </div>

                  {/* Text */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: role.color, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
                    {role.subtitle}
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', margin: '0 0 10px' }}>
                    {role.title}
                  </h3>
                  <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, margin: '0 0 20px' }}>
                    {role.description}
                  </p>

                  {/* Features */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                    {role.features.map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569', fontWeight: 500 }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: role.color, flexShrink: 0,
                        }} />
                        {f}
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '12px 0', borderRadius: 14,
                    background: isHovered ? role.gradient : '#f8fafc',
                    border: isHovered ? 'none' : '1px solid #e2e8f0',
                    color: isHovered ? '#fff' : '#64748b',
                    fontSize: 14, fontWeight: 700,
                    transition: 'all 0.3s',
                    gap: 8,
                  }}>
                    Kayıt Ol <ArrowRightOutlined style={{ fontSize: 12 }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 40, textAlign: 'center', animation: 'regFadeUp 0.5s ease 0.5s both' }}>
          <p style={{ fontSize: 13, color: '#94a3b8' }}>
            Zaten hesabınız var mı?{' '}
            <a href="/login" style={{ color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>
              Giriş Yapın
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
