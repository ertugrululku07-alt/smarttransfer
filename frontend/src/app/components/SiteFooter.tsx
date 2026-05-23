'use client';

import React, { useEffect, useState } from 'react';
import { Row, Col, Space, Typography } from 'antd';
import {
    PhoneOutlined,
    MailOutlined,
    FacebookOutlined,
    InstagramOutlined,
    TwitterOutlined,
    YoutubeOutlined,
    LinkedinOutlined,
    WhatsAppOutlined,
    SendOutlined,
} from '@ant-design/icons';
import { useBranding } from '../context/BrandingContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { getImageUrl } from '@/lib/api-client';
import apiClient from '@/lib/api-client';

const { Text, Title } = Typography;

const SiteFooter: React.FC = () => {
    const { branding, fullName } = useBranding();
    const { theme } = useTheme();
    const { t } = useLanguage();
    const [socialMedia, setSocialMedia] = useState<Record<string, string>>({});
    const [tursab, setTursab] = useState<{ enabled: boolean; belgeNo: string; verificationUrl: string }>({ enabled: false, belgeNo: '', verificationUrl: '' });

    useEffect(() => {
        apiClient.get('/api/tenant/info').then(res => {
            if (res.data.success) {
                const settings = res.data.data.tenant.settings || {};
                setSocialMedia(settings.socialMedia || {});
                if (settings.tursab) setTursab(settings.tursab);
            }
        }).catch(() => {});
    }, []);

    return (
        <footer style={{ background: '#020617', color: '#fff', padding: 'clamp(48px, 6vw, 72px) 16px 0', position: 'relative', overflow: 'hidden' }}>
            {/* Top gradient border */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${theme.sectionAccent}55, transparent)` }} />
            <style>{`
                .sf-footer-link { color: rgba(255,255,255,0.5); text-decoration: none; font-size: 14px; transition: all 0.3s; display: inline-block; }
                .sf-footer-link:hover { color: ${theme.sectionAccent}; transform: translateX(4px); }
                .sf-footer-social { width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); display: inline-flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.6); text-decoration: none; transition: all 0.3s; font-size: 16px; }
                .sf-footer-social:hover { background: ${theme.primaryColor}; border-color: ${theme.primaryColor}; color: white; transform: translateY(-3px); }
            `}</style>
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                <Row gutter={[48, 40]} style={{ marginBottom: 56 }}>
                    <Col xs={24} md={10}>
                        <div style={{ marginBottom: 20 }}>
                            {branding.logoUrl ? (
                                <img
                                    src={getImageUrl(branding.logoUrl)}
                                    alt={fullName}
                                    style={{ maxHeight: 38, maxWidth: 180, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.9 }}
                                />
                            ) : (
                                <span style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', fontSize: 26, fontWeight: 700 }}>
                                    <span style={{ color: theme.sectionAccent }}>{branding.siteNameHighlight}</span>
                                    <span style={{ color: '#fff' }}>{branding.siteName}</span>
                                </span>
                            )}
                        </div>
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.8, display: 'block', marginBottom: 20, fontWeight: 300 }}>
                            {branding.slogan}. {t('footer.available')}
                        </Text>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {branding.phone && <Space size={8}><PhoneOutlined style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }} /><Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>{branding.phone}</Text></Space>}
                            {branding.email && <Space size={8}><MailOutlined style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }} /><Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>{branding.email}</Text></Space>}
                        </div>
                    </Col>
                    <Col xs={12} sm={8} md={5}>
                        <Text strong style={{ color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, display: 'block', marginBottom: 20 }}>{t('footer.quickLinks')}</Text>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <a href="/" className="sf-footer-link">{t('footer.home')}</a>
                            <a href="/sayfa/hakkimizda" className="sf-footer-link">{t('footer.about')}</a>
                            <a href="/contact" className="sf-footer-link">{t('footer.contact')}</a>
                            <a href="/sayfa/seyahat-rehberi" className="sf-footer-link">{t('footer.travelGuide')}</a>
                        </div>
                    </Col>
                    <Col xs={12} sm={8} md={4}>
                        <Text strong style={{ color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, display: 'block', marginBottom: 20 }}>{t('footer.legal')}</Text>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <a href="/sayfa/gizlilik-politikasi" className="sf-footer-link">{t('footer.privacy')}</a>
                            <a href="/sayfa/kullanim-kosullari" className="sf-footer-link">{t('footer.terms')}</a>
                            <a href="/sayfa/iptal-iade-politikasi" className="sf-footer-link">{t('footer.refund')}</a>
                        </div>
                    </Col>
                    <Col xs={24} sm={8} md={5}>
                        <Text strong style={{ color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, display: 'block', marginBottom: 20 }}>{t('footer.services')}</Text>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <span className="sf-footer-link">{t('footer.vipTransfer')}</span>
                            <span className="sf-footer-link">{t('footer.airportTransfer')}</span>
                            <span className="sf-footer-link">{t('footer.intercityTransfer')}</span>
                            <span className="sf-footer-link">{t('footer.groupTransfer')}</span>
                        </div>
                    </Col>
                </Row>
                {/* TÜRSAB Badge */}
                {tursab.enabled && tursab.belgeNo && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '20px 0' }}>
                        <a
                            href={tursab.verificationUrl || 'https://www.tursab.org.tr/tr/dds'}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 10, padding: '10px 18px', textDecoration: 'none', transition: 'all 0.3s', border: '2px solid #e5e7eb' }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ fontWeight: 900, fontSize: 16, color: '#dc2626', letterSpacing: 2, lineHeight: 1 }}>TÜRSAB</span>
                                <span style={{ fontSize: 7, color: '#666', fontWeight: 600, letterSpacing: 0.5, marginTop: 2 }}>DİJİTAL DOĞRULAMA</span>
                            </div>
                            <div style={{ width: 1, height: 32, background: '#e5e7eb' }} />
                            <div>
                                <div style={{ fontSize: 10, color: '#888' }}>Belge No</div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{tursab.belgeNo}</div>
                            </div>
                        </a>
                    </div>
                )}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '20px 0 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.32)', fontSize: 13 }}>&copy; {new Date().getFullYear()} {branding.companyName}. {t('footer.rights')}</Text>
                    <div style={{ display: 'flex', gap: 10 }}>
                        {socialMedia.facebook && <a href={socialMedia.facebook} target="_blank" rel="noopener noreferrer" className="sf-footer-social"><FacebookOutlined /></a>}
                        {socialMedia.instagram && <a href={socialMedia.instagram} target="_blank" rel="noopener noreferrer" className="sf-footer-social"><InstagramOutlined /></a>}
                        {socialMedia.twitter && <a href={socialMedia.twitter} target="_blank" rel="noopener noreferrer" className="sf-footer-social"><TwitterOutlined /></a>}
                        {socialMedia.youtube && <a href={socialMedia.youtube} target="_blank" rel="noopener noreferrer" className="sf-footer-social"><YoutubeOutlined /></a>}
                        {socialMedia.linkedin && <a href={socialMedia.linkedin} target="_blank" rel="noopener noreferrer" className="sf-footer-social"><LinkedinOutlined /></a>}
                        {socialMedia.whatsapp && <a href={socialMedia.whatsapp} target="_blank" rel="noopener noreferrer" className="sf-footer-social"><WhatsAppOutlined /></a>}
                        {socialMedia.telegram && <a href={socialMedia.telegram} target="_blank" rel="noopener noreferrer" className="sf-footer-social"><SendOutlined /></a>}
                        {!Object.values(socialMedia).some(v => v) && (
                            <>
                                <a href="#" className="sf-footer-social"><FacebookOutlined /></a>
                                <a href="#" className="sf-footer-social"><InstagramOutlined /></a>
                                <a href="#" className="sf-footer-social"><TwitterOutlined /></a>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default SiteFooter;
