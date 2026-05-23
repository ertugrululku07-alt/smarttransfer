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

    useEffect(() => {
        apiClient.get('/api/tenant/info').then(res => {
            if (res.data.success) {
                setSocialMedia(res.data.data.tenant.settings?.socialMedia || {});
            }
        }).catch(() => {});
    }, []);

    return (
        <footer style={{ background: theme.footerBg, color: '#fff', padding: 'clamp(40px, 6vw, 64px) 16px 28px' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                <Row gutter={[32, 32]}>
                    <Col xs={24} md={8}>
                        <div style={{ marginBottom: 14 }}>
                            {branding.logoUrl ? (
                                <img
                                    src={getImageUrl(branding.logoUrl)}
                                    alt={fullName}
                                    style={{ maxHeight: 36, maxWidth: 160, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.9 }}
                                />
                            ) : (
                                <>
                                    <span style={{ color: theme.primaryColor, fontWeight: 800, fontSize: 22 }}>{branding.siteNameHighlight}</span>
                                    <span style={{ color: '#fff', fontWeight: 600, fontSize: 22 }}>{branding.siteName}</span>
                                </>
                            )}
                        </div>
                        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 1.7, display: 'block', marginBottom: 16 }}>
                            {branding.slogan}. {t('footer.available')}
                        </Text>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {branding.phone && <Space size="small"><PhoneOutlined style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }} /><Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{branding.phone}</Text></Space>}
                            {branding.email && <Space size="small"><MailOutlined style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }} /><Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{branding.email}</Text></Space>}
                        </div>
                    </Col>
                    <Col xs={12} md={5}>
                        <Title level={5} style={{ color: '#fff', marginBottom: 16, fontSize: 14 }}>{t('footer.quickLinks')}</Title>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <a href="/" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>{t('footer.home')}</a>
                            <a href="/sayfa/hakkimizda" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>{t('footer.about')}</a>
                            <a href="/contact" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>{t('footer.contact')}</a>
                            <a href="/sayfa/seyahat-rehberi" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>{t('footer.travelGuide')}</a>
                        </div>
                    </Col>
                    <Col xs={12} md={5}>
                        <Title level={5} style={{ color: '#fff', marginBottom: 16, fontSize: 14 }}>{t('footer.legal')}</Title>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <a href="/sayfa/gizlilik-politikasi" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>{t('footer.privacy')}</a>
                            <a href="/sayfa/kullanim-kosullari" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>{t('footer.terms')}</a>
                            <a href="/sayfa/iptal-iade-politikasi" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 13 }}>{t('footer.refund')}</a>
                        </div>
                    </Col>
                    <Col xs={24} md={6}>
                        <Title level={5} style={{ color: '#fff', marginBottom: 16, fontSize: 14 }}>{t('footer.services')}</Title>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>{t('footer.vipTransfer')}</span>
                            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>{t('footer.airportTransfer')}</span>
                            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>{t('footer.intercityTransfer')}</span>
                            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>{t('footer.groupTransfer')}</span>
                        </div>
                    </Col>
                </Row>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 36, paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>&copy; {new Date().getFullYear()} {branding.companyName}. {t('footer.rights')}</Text>
                    <Space size={12}>
                        {socialMedia.facebook && <a href={socialMedia.facebook} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18 }}><FacebookOutlined /></a>}
                        {socialMedia.instagram && <a href={socialMedia.instagram} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18 }}><InstagramOutlined /></a>}
                        {socialMedia.twitter && <a href={socialMedia.twitter} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18 }}><TwitterOutlined /></a>}
                        {socialMedia.youtube && <a href={socialMedia.youtube} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18 }}><YoutubeOutlined /></a>}
                        {socialMedia.linkedin && <a href={socialMedia.linkedin} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18 }}><LinkedinOutlined /></a>}
                        {socialMedia.whatsapp && <a href={socialMedia.whatsapp} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18 }}><WhatsAppOutlined /></a>}
                        {socialMedia.telegram && <a href={socialMedia.telegram} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18 }}><SendOutlined /></a>}
                        {!Object.values(socialMedia).some(v => v) && (
                            <>
                                <a href="#" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 18 }}><FacebookOutlined /></a>
                                <a href="#" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 18 }}><InstagramOutlined /></a>
                                <a href="#" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 18 }}><TwitterOutlined /></a>
                            </>
                        )}
                    </Space>
                </div>
            </div>
        </footer>
    );
};

export default SiteFooter;
