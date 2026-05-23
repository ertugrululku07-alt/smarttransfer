'use client';

import React, { useState, useEffect } from 'react';
import {
  Layout,
  Typography,
  Row,
  Col,
  Input,
  Button,
  Select,
  Form,
  Space,
  message,
  Spin,
} from 'antd';
import {
  PhoneOutlined,
  MailOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
  SendOutlined,
  FacebookOutlined,
  InstagramOutlined,
  TwitterOutlined,
  LinkedinOutlined,
  WhatsAppOutlined,
  YoutubeOutlined,
} from '@ant-design/icons';
import apiClient, { getImageUrl } from '@/lib/api-client';
import { useTheme } from '@/app/context/ThemeContext';
import { useBranding } from '@/app/context/BrandingContext';
import TopBar from '@/app/components/TopBar';
import SiteFooter from '@/app/components/SiteFooter';

const { Title, Text, Paragraph } = Typography;
const { Content } = Layout;
const { TextArea } = Input;

interface Branch {
  name: string;
  badge: string;
  address: string;
  phone: string;
  hours: string;
  mapEmbedUrl: string;
}

interface ContactPageData {
  heroTitle: string;
  heroSubtitle: string;
  phone: string;
  phoneHours: string;
  email: string;
  emailNote: string;
  address: string;
  workingHours: string[];
  branches: Branch[];
  mainMapUrl: string;
  formSubjects: { value: string; label: string }[];
}

const extractMapSrc = (value: string): string => {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.startsWith('<')) {
    const match = trimmed.match(/src=["']([^"']+)["']/);
    return match ? match[1] : '';
  }
  return trimmed;
};

const DEFAULT_CONTACT: ContactPageData = {
  heroTitle: 'Bizimle İletişime Geçin',
  heroSubtitle: 'Sorularınız, önerileriniz veya iş birliği talepleriniz için aşağıdaki kanallardan bize ulaşabilirsiniz.',
  phone: '',
  phoneHours: 'Hafta içi 09:00 - 18:00',
  email: '',
  emailNote: '7/24 e-posta desteği',
  address: '',
  workingHours: ['Pzt - Cmt: 09:00 - 19:00', 'Pazar: 10:00 - 16:00'],
  branches: [],
  mainMapUrl: '',
  formSubjects: [
    { value: 'genel', label: 'Genel Bilgi' },
    { value: 'destek', label: 'Teknik Destek' },
    { value: 'isbirligi', label: 'İş Birliği' },
    { value: 'sikayet', label: 'Şikayet / Öneri' },
    { value: 'diger', label: 'Diğer' },
  ],
};

const ContactPage: React.FC = () => {
  const { theme } = useTheme();
  const { branding, fullName } = useBranding();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [contactData, setContactData] = useState<ContactPageData>(DEFAULT_CONTACT);
  const [socialMedia, setSocialMedia] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await apiClient.get('/api/tenant/info');
        if (res.data.success) {
          const settings = res.data.data.tenant.settings || {};
          if (settings.contactPage) {
            setContactData(prev => ({ ...prev, ...settings.contactPage }));
          }
          // Use branding phone/email as fallback
          if (!settings.contactPage?.phone && settings.branding?.phone) {
            setContactData(prev => ({ ...prev, phone: settings.branding.phone }));
          }
          if (!settings.contactPage?.email && settings.branding?.email) {
            setContactData(prev => ({ ...prev, email: settings.branding.email }));
          }
          if (settings.socialMedia) {
            setSocialMedia(settings.socialMedia);
          }
        }
      } catch (e) {
        console.error('Failed to load contact data:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleSubmit = async (values: any) => {
    try {
      setSubmitting(true);
      const res = await apiClient.post('/api/tenant/contact', values);
      if (res.data.success) {
        message.success('Mesajınız başarıyla gönderildi! En kısa sürede dönüş yapacağız.');
        form.resetFields();
      }
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'Mesaj gönderilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  const accent = theme.primaryColor || '#667eea';
  const accentAlt = theme.accentColor || '#764ba2';

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent', position: 'relative', overflow: 'hidden' }}>
      {/* Background */}
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0,
        background: `linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)`,
      }}>
        <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', top: -200, left: -100, background: `radial-gradient(circle, ${accent}20 0%, transparent 70%)`, animation: 'contactFloat 20s infinite ease-in-out' }} />
        <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', bottom: -150, right: -100, background: `radial-gradient(circle, ${accentAlt}15 0%, transparent 70%)`, animation: 'contactFloat 20s infinite ease-in-out 5s' }} />
        <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', top: '50%', left: '50%', background: `radial-gradient(circle, ${accent}10 0%, transparent 70%)`, animation: 'contactFloat 20s infinite ease-in-out 10s' }} />
      </div>

      <style>{`
        @keyframes contactFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .contact-glass {
          background: rgba(30, 41, 59, 0.6);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 24px;
          transition: all 0.4s ease;
        }
        .contact-glass:hover {
          border-color: ${accent}40;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .contact-info-item {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding: 20px;
          background: rgba(15,23,42,0.3);
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.08);
          transition: all 0.3s ease;
        }
        .contact-info-item:hover {
          background: rgba(15,23,42,0.5);
          border-color: ${accent}30;
          transform: translateX(5px);
        }
        .contact-social-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 16px 28px;
          background: rgba(30,41,59,0.6);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          color: #f8fafc;
          text-decoration: none;
          font-weight: 500;
          transition: all 0.3s ease;
          min-width: 160px;
          justify-content: center;
          font-size: 15px;
          cursor: pointer;
        }
        .contact-social-btn:hover {
          transform: translateY(-5px);
          border-color: ${accent};
          box-shadow: 0 15px 40px rgba(0,0,0,0.3);
        }
        .contact-branch-card {
          background: rgba(30,41,59,0.6);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 24px;
          overflow: hidden;
          transition: all 0.4s ease;
        }
        .contact-branch-card:hover {
          transform: translateY(-10px);
          border-color: ${accent}40;
          box-shadow: 0 25px 60px rgba(0,0,0,0.4);
        }
        .contact-input .ant-input,
        .contact-input .ant-select-selector,
        .contact-input textarea.ant-input {
          background: rgba(15,23,42,0.5) !important;
          border: 1px solid rgba(255,255,255,0.08) !important;
          border-radius: 12px !important;
          color: #f8fafc !important;
          font-size: 15px !important;
          padding: 12px 16px !important;
          min-height: 48px !important;
        }
        .contact-input .ant-input:focus,
        .contact-input .ant-select-selector:focus,
        .contact-input .ant-input-focused,
        .contact-input .ant-select-focused .ant-select-selector {
          border-color: ${accent} !important;
          box-shadow: 0 0 0 3px ${accent}18 !important;
          background: rgba(15,23,42,0.8) !important;
        }
        .contact-input .ant-input::placeholder { color: #64748b !important; }
        .contact-input .ant-form-item-label > label { color: #94a3b8 !important; font-weight: 500; }
        .contact-input .ant-select-arrow { color: #94a3b8 !important; }
        .contact-input .ant-select-selection-placeholder { color: #64748b !important; }
      `}</style>

      <Content style={{ position: 'relative', zIndex: 1 }}>
        {/* Top Navigation */}
        <TopBar />

        {/* Hero */}
        <section style={{ textAlign: 'center', padding: '100px 20px 60px', maxWidth: 800, margin: '0 auto' }}>
          <Title style={{
            fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, marginBottom: 20, lineHeight: 1.2,
            background: `linear-gradient(135deg, #fff 0%, ${accent} 100%)`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            {contactData.heroTitle}
          </Title>
          <Paragraph style={{ fontSize: 'clamp(1rem, 2vw, 1.2rem)', color: '#94a3b8', lineHeight: 1.8 }}>
            {contactData.heroSubtitle}
          </Paragraph>
        </section>

        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px 80px' }}>
          {/* Contact Info + Form Stack */}
          <div style={{ maxWidth: 800, margin: '0 auto 80px', display: 'flex', flexDirection: 'column', gap: 40 }}>
            {/* Info Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {contactData.phone && (
                <div className="contact-info-item">
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `linear-gradient(135deg, ${accent}, ${accentAlt})`, fontSize: 20, color: '#0f172a', flexShrink: 0,
                  }}>
                    <PhoneOutlined />
                  </div>
                  <div>
                    <Text strong style={{ color: '#f8fafc', fontSize: 16, display: 'block', marginBottom: 2 }}>Telefon</Text>
                    <a href={`tel:${contactData.phone.replace(/\s/g, '')}`} style={{ color: accent, textDecoration: 'none', fontSize: 15 }}>{contactData.phone}</a>
                    {contactData.phoneHours && <Text style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginTop: 2 }}>{contactData.phoneHours}</Text>}
                  </div>
                </div>
              )}

              {contactData.email && (
                <div className="contact-info-item">
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `linear-gradient(135deg, ${accent}, ${accentAlt})`, fontSize: 20, color: '#0f172a', flexShrink: 0,
                  }}>
                    <MailOutlined />
                  </div>
                  <div>
                    <Text strong style={{ color: '#f8fafc', fontSize: 16, display: 'block', marginBottom: 2 }}>E-posta</Text>
                    <a href={`mailto:${contactData.email}`} style={{ color: accent, textDecoration: 'none', fontSize: 15 }}>{contactData.email}</a>
                    {contactData.emailNote && <Text style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginTop: 2 }}>{contactData.emailNote}</Text>}
                  </div>
                </div>
              )}

              {contactData.address && (
                <div className="contact-info-item">
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `linear-gradient(135deg, ${accent}, ${accentAlt})`, fontSize: 20, color: '#0f172a', flexShrink: 0,
                  }}>
                    <EnvironmentOutlined />
                  </div>
                  <div>
                    <Text strong style={{ color: '#f8fafc', fontSize: 16, display: 'block', marginBottom: 2 }}>Merkez Ofis</Text>
                    <Text style={{ color: '#94a3b8', fontSize: 15, lineHeight: 1.5 }}>{contactData.address}</Text>
                  </div>
                </div>
              )}

              {contactData.workingHours?.length > 0 && (
                <div className="contact-info-item">
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `linear-gradient(135deg, ${accent}, ${accentAlt})`, fontSize: 20, color: '#0f172a', flexShrink: 0,
                  }}>
                    <ClockCircleOutlined />
                  </div>
                  <div>
                    <Text strong style={{ color: '#f8fafc', fontSize: 16, display: 'block', marginBottom: 2 }}>Çalışma Saatleri</Text>
                    {contactData.workingHours.map((h, i) => (
                      <Text key={i} style={{ color: '#94a3b8', fontSize: 15, display: 'block' }}>{h}</Text>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Contact Form */}
            <div className="contact-glass" style={{ padding: 'clamp(24px, 4vw, 40px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 30 }}>
                <SendOutlined style={{ color: accent, fontSize: 20 }} />
                <Title level={3} style={{ color: '#f8fafc', margin: 0, fontSize: 'clamp(1.2rem, 2.5vw, 1.5rem)' }}>Mesaj Gönderin</Title>
              </div>
              <Form form={form} layout="vertical" onFinish={handleSubmit} className="contact-input">
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="name" label="Ad Soyad" rules={[{ required: true, message: 'Ad soyad zorunlu' }]}>
                      <Input placeholder="Adınız ve soyadınız" size="large" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="email" label="E-posta" rules={[{ required: true, type: 'email', message: 'Geçerli e-posta girin' }]}>
                      <Input placeholder="ornek@email.com" size="large" />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="phone" label="Telefon">
                      <Input placeholder="+90 5XX XXX XX XX" size="large" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="subject" label="Konu" rules={[{ required: true, message: 'Konu seçin' }]}>
                      <Select placeholder="Konu seçiniz" size="large" popupClassName="contact-select-dropdown">
                        {(contactData.formSubjects || DEFAULT_CONTACT.formSubjects).map(s => (
                          <Select.Option key={s.value} value={s.value}>{s.label}</Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="message" label="Mesajınız" rules={[{ required: true, message: 'Mesaj yazın' }]}>
                  <TextArea rows={5} placeholder="Mesajınızı buraya yazın..." />
                </Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={submitting}
                  block
                  size="large"
                  icon={<SendOutlined />}
                  style={{
                    height: 52, fontSize: 16, fontWeight: 600, borderRadius: 12,
                    background: `linear-gradient(135deg, ${accent}, ${accentAlt})`,
                    border: 'none', color: '#0f172a',
                    boxShadow: `0 8px 24px ${accent}40`,
                  }}
                >
                  Gönder
                </Button>
              </Form>
            </div>
          </div>

          {/* Social Media */}
          {Object.values(socialMedia).some(v => v) && (
            <section style={{ textAlign: 'center', marginBottom: 80 }}>
              <Title level={2} style={{ color: '#f8fafc', fontWeight: 700, marginBottom: 12 }}>Sosyal Medya & Anlık İletişim</Title>
              <Text style={{ color: '#94a3b8', fontSize: 16, display: 'block', marginBottom: 40 }}>
                Bizi sosyal medyada takip edin veya anlık mesajlaşma uygulamalarından ulaşın
              </Text>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
                {socialMedia.whatsapp && (
                  <a href={socialMedia.whatsapp} target="_blank" rel="noopener noreferrer" className="contact-social-btn"
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,211,102,0.15)'; e.currentTarget.style.borderColor = '#25d366'; e.currentTarget.style.color = '#25d366'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = ''; e.currentTarget.style.color = '#f8fafc'; }}
                  >
                    <WhatsAppOutlined style={{ fontSize: 20 }} /> WhatsApp
                  </a>
                )}
                {socialMedia.telegram && (
                  <a href={socialMedia.telegram} target="_blank" rel="noopener noreferrer" className="contact-social-btn"
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,136,204,0.15)'; e.currentTarget.style.borderColor = '#0088cc'; e.currentTarget.style.color = '#0088cc'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = ''; e.currentTarget.style.color = '#f8fafc'; }}
                  >
                    <SendOutlined style={{ fontSize: 20 }} /> Telegram
                  </a>
                )}
                {socialMedia.instagram && (
                  <a href={socialMedia.instagram} target="_blank" rel="noopener noreferrer" className="contact-social-btn"
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(225,48,108,0.15)'; e.currentTarget.style.borderColor = '#e1306c'; e.currentTarget.style.color = '#e1306c'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = ''; e.currentTarget.style.color = '#f8fafc'; }}
                  >
                    <InstagramOutlined style={{ fontSize: 20 }} /> Instagram
                  </a>
                )}
                {socialMedia.facebook && (
                  <a href={socialMedia.facebook} target="_blank" rel="noopener noreferrer" className="contact-social-btn"
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(24,119,242,0.15)'; e.currentTarget.style.borderColor = '#1877f2'; e.currentTarget.style.color = '#1877f2'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = ''; e.currentTarget.style.color = '#f8fafc'; }}
                  >
                    <FacebookOutlined style={{ fontSize: 20 }} /> Facebook
                  </a>
                )}
                {socialMedia.twitter && (
                  <a href={socialMedia.twitter} target="_blank" rel="noopener noreferrer" className="contact-social-btn"
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(29,161,242,0.15)'; e.currentTarget.style.borderColor = '#1da1f2'; e.currentTarget.style.color = '#1da1f2'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = ''; e.currentTarget.style.color = '#f8fafc'; }}
                  >
                    <TwitterOutlined style={{ fontSize: 20 }} /> X (Twitter)
                  </a>
                )}
                {socialMedia.youtube && (
                  <a href={socialMedia.youtube} target="_blank" rel="noopener noreferrer" className="contact-social-btn"
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,0,0,0.15)'; e.currentTarget.style.borderColor = '#ff0000'; e.currentTarget.style.color = '#ff0000'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = ''; e.currentTarget.style.color = '#f8fafc'; }}
                  >
                    <YoutubeOutlined style={{ fontSize: 20 }} /> YouTube
                  </a>
                )}
                {socialMedia.linkedin && (
                  <a href={socialMedia.linkedin} target="_blank" rel="noopener noreferrer" className="contact-social-btn"
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,119,181,0.15)'; e.currentTarget.style.borderColor = '#0077b5'; e.currentTarget.style.color = '#0077b5'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = ''; e.currentTarget.style.color = '#f8fafc'; }}
                  >
                    <LinkedinOutlined style={{ fontSize: 20 }} /> LinkedIn
                  </a>
                )}
              </div>
            </section>
          )}

          {/* Branches */}
          {contactData.branches?.length > 0 && (
            <section style={{ marginBottom: 80 }}>
              <Title level={2} style={{ color: '#f8fafc', fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>Şubelerimiz & Konumlarımız</Title>
              <Text style={{ color: '#94a3b8', fontSize: 16, display: 'block', textAlign: 'center', marginBottom: 40 }}>
                Size en yakın şubemizi ziyaret edin
              </Text>
              <Row gutter={[24, 24]}>
                {contactData.branches.map((branch, idx) => (
                  <Col xs={24} sm={12} lg={contactData.branches.length >= 3 ? 8 : 12} key={idx}>
                    <div className="contact-branch-card" style={{ height: '100%' }}>
                      {branch.mapEmbedUrl && (
                        <iframe
                          src={extractMapSrc(branch.mapEmbedUrl)}
                          style={{ width: '100%', height: 200, border: 'none', filter: 'grayscale(30%) contrast(1.1)' }}
                          allowFullScreen
                          loading="lazy"
                        />
                      )}
                      <div style={{ padding: 'clamp(20px, 3vw, 30px)' }}>
                        {branch.badge && (
                          <span style={{
                            display: 'inline-block', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14,
                            background: `${accent}20`, border: `1px solid ${accent}40`, color: accent,
                          }}>
                            {branch.badge}
                          </span>
                        )}
                        <Title level={4} style={{ color: '#f8fafc', marginBottom: 12, marginTop: branch.badge ? 0 : undefined }}>
                          {branch.name}
                        </Title>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {branch.address && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <EnvironmentOutlined style={{ color: accent, flexShrink: 0 }} />
                              <Text style={{ color: '#94a3b8', fontSize: 14 }}>{branch.address}</Text>
                            </div>
                          )}
                          {branch.phone && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <PhoneOutlined style={{ color: accent, flexShrink: 0 }} />
                              <a href={`tel:${branch.phone.replace(/\s/g, '')}`} style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14 }}>{branch.phone}</a>
                            </div>
                          )}
                          {branch.hours && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <ClockCircleOutlined style={{ color: accent, flexShrink: 0 }} />
                              <Text style={{ color: '#94a3b8', fontSize: 14 }}>{branch.hours}</Text>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>
            </section>
          )}

          {/* Main Map */}
          {contactData.mainMapUrl && (
            <section style={{ marginBottom: 60 }}>
              <Title level={2} style={{ color: '#f8fafc', fontWeight: 700, textAlign: 'center', marginBottom: 30 }}>Tüm Konumlarımız</Title>
              <iframe
                src={extractMapSrc(contactData.mainMapUrl)}
                style={{ width: '100%', height: 400, border: 'none', borderRadius: 24, filter: 'grayscale(40%) contrast(1.1)' }}
                allowFullScreen
                loading="lazy"
              />
            </section>
          )}
        </div>

      </Content>
      <SiteFooter />
    </Layout>
  );
};

export default ContactPage;
