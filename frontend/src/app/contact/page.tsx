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
import { fetchTenantInfo } from '@/lib/tenant-info-cache';
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
  heroImage?: string;
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
  heroImage: '',
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
        const res = await fetchTenantInfo();
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

  const accent = theme.primaryColor || 'var(--brand-primary)';
  const accentAlt = theme.accentColor || 'var(--brand-accent)';

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <Spin size="large" />
      </div>
    );
  }

  const heroStyle: React.CSSProperties = contactData.heroImage
    ? {
        backgroundImage: `url(${getImageUrl(contactData.heroImage)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    : {
        background: theme.heroGradient || `linear-gradient(135deg, ${accent} 0%, ${accentAlt} 100%)`,
      };

  return (
    <Layout style={{ minHeight: '100vh', background: '#fff', overflowX: 'hidden' }}>
      <style>{`
        .ci-info-card {
          display: flex; align-items: flex-start; gap: 16px; padding: 20px;
          background: #fff; border-radius: 16px; border: 1px solid #e5e7eb;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: all 0.3s ease;
        }
        .ci-info-card:hover {
          border-color: ${accent}50; transform: translateY(-3px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.1);
        }
        @media (max-width: 600px) { .contact-info-grid { grid-template-columns: 1fr !important; } }
        .ci-form-wrap { background: #fff; border-radius: 24px; border: 1px solid #e5e7eb; box-shadow: 0 4px 20px rgba(0,0,0,0.07); padding: clamp(24px, 4vw, 40px); }
        .ci-social-btn {
          display: inline-flex; align-items: center; gap: 10px; padding: 14px 24px;
          background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 14px;
          color: #374151; text-decoration: none; font-weight: 500; transition: all 0.25s ease;
          min-width: 150px; justify-content: center; font-size: 15px;
        }
        .ci-social-btn:hover { transform: translateY(-4px); box-shadow: 0 10px 28px rgba(0,0,0,0.12); }
        .ci-branch-card {
          background: #fff; border: 1px solid #e5e7eb; border-radius: 20px;
          overflow: hidden; transition: all 0.35s ease;
          box-shadow: 0 2px 10px rgba(0,0,0,0.06);
        }
        .ci-branch-card:hover { transform: translateY(-6px); border-color: ${accent}40; box-shadow: 0 16px 40px rgba(0,0,0,0.12); }
      `}</style>

      <TopBar />

      {/* ─── Hero ─── */}
      <div style={{ ...heroStyle, paddingTop: 80, position: 'relative', overflowX: 'hidden' }}>
        {contactData.heroImage && (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(15,23,42,0.65) 0%, rgba(15,23,42,0.45) 100%)' }} />
        )}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 860, margin: '0 auto', padding: 'clamp(60px, 8vw, 100px) 24px clamp(50px, 7vw, 80px)', textAlign: 'center' }}>
          <Title level={1} style={{
            color: '#fff', marginBottom: 18,
            fontSize: 'clamp(2rem, 5vw, 3.4rem)', fontWeight: 800,
            textShadow: '0 2px 20px rgba(0,0,0,0.3)', lineHeight: 1.2,
          }}>
            {contactData.heroTitle}
          </Title>
          <Paragraph style={{ fontSize: 'clamp(1rem, 2vw, 1.2rem)', color: 'rgba(255,255,255,0.82)', lineHeight: 1.8, margin: 0 }}>
            {contactData.heroSubtitle}
          </Paragraph>
        </div>
      </div>

      {/* ─── White Body ─── */}
      <Content style={{ background: '#fff', overflowX: 'hidden' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(48px, 6vw, 80px) 20px clamp(64px, 8vw, 100px)' }}>

          {/* Contact Info Grid */}
          <div className="contact-info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, maxWidth: 820, margin: '0 auto 56px' }}>
            {contactData.phone && (
              <div className="ci-info-card">
                <div style={{ width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${accent}, ${accentAlt})`, fontSize: 20, color: '#fff', flexShrink: 0 }}>
                  <PhoneOutlined />
                </div>
                <div>
                  <Text strong style={{ color: '#111827', fontSize: 15, display: 'block', marginBottom: 2 }}>Telefon</Text>
                  <a href={`tel:${contactData.phone.replace(/\s/g, '')}`} style={{ color: accent, textDecoration: 'none', fontSize: 14 }}>{contactData.phone}</a>
                  {contactData.phoneHours && <Text style={{ color: '#6b7280', fontSize: 13, display: 'block', marginTop: 2 }}>{contactData.phoneHours}</Text>}
                </div>
              </div>
            )}
            {contactData.email && (
              <div className="ci-info-card">
                <div style={{ width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${accent}, ${accentAlt})`, fontSize: 20, color: '#fff', flexShrink: 0 }}>
                  <MailOutlined />
                </div>
                <div>
                  <Text strong style={{ color: '#111827', fontSize: 15, display: 'block', marginBottom: 2 }}>E-posta</Text>
                  <a href={`mailto:${contactData.email}`} style={{ color: accent, textDecoration: 'none', fontSize: 14 }}>{contactData.email}</a>
                  {contactData.emailNote && <Text style={{ color: '#6b7280', fontSize: 13, display: 'block', marginTop: 2 }}>{contactData.emailNote}</Text>}
                </div>
              </div>
            )}
            {contactData.address && (
              <div className="ci-info-card">
                <div style={{ width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${accent}, ${accentAlt})`, fontSize: 20, color: '#fff', flexShrink: 0 }}>
                  <EnvironmentOutlined />
                </div>
                <div>
                  <Text strong style={{ color: '#111827', fontSize: 15, display: 'block', marginBottom: 2 }}>Merkez Ofis</Text>
                  <Text style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.5 }}>{contactData.address}</Text>
                </div>
              </div>
            )}
            {contactData.workingHours?.length > 0 && (
              <div className="ci-info-card">
                <div style={{ width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${accent}, ${accentAlt})`, fontSize: 20, color: '#fff', flexShrink: 0 }}>
                  <ClockCircleOutlined />
                </div>
                <div>
                  <Text strong style={{ color: '#111827', fontSize: 15, display: 'block', marginBottom: 2 }}>Çalışma Saatleri</Text>
                  {contactData.workingHours.map((h, i) => (
                    <Text key={i} style={{ color: '#6b7280', fontSize: 14, display: 'block' }}>{h}</Text>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Contact Form */}
          <div style={{ maxWidth: 820, margin: '0 auto 72px' }}>
            <div className="ci-form-wrap">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${accent}, ${accentAlt})`, fontSize: 18, color: '#fff' }}>
                  <SendOutlined />
                </div>
                <Title level={3} style={{ color: '#111827', margin: 0, fontSize: 'clamp(1.15rem, 2.5vw, 1.4rem)' }}>Mesaj Gönderin</Title>
              </div>
              <Form form={form} layout="vertical" onFinish={handleSubmit}>
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="name" label="Ad Soyad" rules={[{ required: true, message: 'Ad soyad zorunlu' }]}>
                      <Input placeholder="Adınız ve soyadınız" size="large" style={{ borderRadius: 10 }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="email" label="E-posta" rules={[{ required: true, type: 'email', message: 'Geçerli e-posta girin' }]}>
                      <Input placeholder="ornek@email.com" size="large" style={{ borderRadius: 10 }} />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="phone" label="Telefon">
                      <Input placeholder="+90 5XX XXX XX XX" size="large" style={{ borderRadius: 10 }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="subject" label="Konu" rules={[{ required: true, message: 'Konu seçin' }]}>
                      <Select placeholder="Konu seçiniz" size="large" style={{ borderRadius: 10 }}>
                        {(contactData.formSubjects || DEFAULT_CONTACT.formSubjects).map(s => (
                          <Select.Option key={s.value} value={s.value}>{s.label}</Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="message" label="Mesajınız" rules={[{ required: true, message: 'Mesaj yazın' }]}>
                  <TextArea rows={5} placeholder="Mesajınızı buraya yazın..." style={{ borderRadius: 10 }} />
                </Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={submitting}
                  block size="large"
                  icon={<SendOutlined />}
                  style={{
                    height: 52, fontSize: 16, fontWeight: 600, borderRadius: 12,
                    background: `linear-gradient(135deg, ${accent}, ${accentAlt})`,
                    border: 'none', boxShadow: `0 6px 20px ${accent}40`,
                  }}
                >
                  Gönder
                </Button>
              </Form>
            </div>
          </div>

          {/* Social Media */}
          {Object.values(socialMedia).some(v => v) && (
            <section style={{ textAlign: 'center', marginBottom: 72 }}>
              <Title level={2} style={{ color: '#111827', fontWeight: 700, marginBottom: 10 }}>Sosyal Medya</Title>
              <Text style={{ color: '#6b7280', fontSize: 16, display: 'block', marginBottom: 36 }}>
                Bizi sosyal medyada takip edin veya anlık mesajlaşma uygulamalarından ulaşın
              </Text>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
                {socialMedia.whatsapp && <a href={socialMedia.whatsapp} target="_blank" rel="noopener noreferrer" className="ci-social-btn" style={{ color: '#25d366', borderColor: '#25d366' }}><WhatsAppOutlined style={{ fontSize: 18 }} /> WhatsApp</a>}
                {socialMedia.telegram && <a href={socialMedia.telegram} target="_blank" rel="noopener noreferrer" className="ci-social-btn" style={{ color: '#0088cc', borderColor: '#0088cc' }}><SendOutlined style={{ fontSize: 18 }} /> Telegram</a>}
                {socialMedia.instagram && <a href={socialMedia.instagram} target="_blank" rel="noopener noreferrer" className="ci-social-btn" style={{ color: '#e1306c', borderColor: '#e1306c' }}><InstagramOutlined style={{ fontSize: 18 }} /> Instagram</a>}
                {socialMedia.facebook && <a href={socialMedia.facebook} target="_blank" rel="noopener noreferrer" className="ci-social-btn" style={{ color: '#1877f2', borderColor: '#1877f2' }}><FacebookOutlined style={{ fontSize: 18 }} /> Facebook</a>}
                {socialMedia.twitter && <a href={socialMedia.twitter} target="_blank" rel="noopener noreferrer" className="ci-social-btn" style={{ color: '#1da1f2', borderColor: '#1da1f2' }}><TwitterOutlined style={{ fontSize: 18 }} /> X (Twitter)</a>}
                {socialMedia.youtube && <a href={socialMedia.youtube} target="_blank" rel="noopener noreferrer" className="ci-social-btn" style={{ color: '#ff0000', borderColor: '#ff0000' }}><YoutubeOutlined style={{ fontSize: 18 }} /> YouTube</a>}
                {socialMedia.linkedin && <a href={socialMedia.linkedin} target="_blank" rel="noopener noreferrer" className="ci-social-btn" style={{ color: '#0077b5', borderColor: '#0077b5' }}><LinkedinOutlined style={{ fontSize: 18 }} /> LinkedIn</a>}
              </div>
            </section>
          )}

          {/* Branches */}
          {contactData.branches?.length > 0 && (
            <section style={{ marginBottom: 72 }}>
              <Title level={2} style={{ color: '#111827', fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>Şubelerimiz & Konumlarımız</Title>
              <Text style={{ color: '#6b7280', fontSize: 16, display: 'block', textAlign: 'center', marginBottom: 36 }}>Size en yakın şubemizi ziyaret edin</Text>
              <Row gutter={[24, 24]}>
                {contactData.branches.map((branch, idx) => (
                  <Col xs={24} sm={12} lg={contactData.branches.length >= 3 ? 8 : 12} key={idx}>
                    <div className="ci-branch-card" style={{ height: '100%' }}>
                      {branch.mapEmbedUrl && (
                        <iframe src={extractMapSrc(branch.mapEmbedUrl)} style={{ width: '100%', height: 200, border: 'none' }} allowFullScreen loading="lazy" />
                      )}
                      <div style={{ padding: 'clamp(18px, 3vw, 28px)' }}>
                        {branch.badge && (
                          <span style={{ display: 'inline-block', padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, background: `${accent}12`, border: `1px solid ${accent}30`, color: accent }}>
                            {branch.badge}
                          </span>
                        )}
                        <Title level={4} style={{ color: '#111827', marginBottom: 12, marginTop: branch.badge ? 0 : undefined }}>{branch.name}</Title>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {branch.address && <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><EnvironmentOutlined style={{ color: accent, flexShrink: 0 }} /><Text style={{ color: '#6b7280', fontSize: 14 }}>{branch.address}</Text></div>}
                          {branch.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><PhoneOutlined style={{ color: accent, flexShrink: 0 }} /><a href={`tel:${branch.phone.replace(/\s/g, '')}`} style={{ color: '#6b7280', textDecoration: 'none', fontSize: 14 }}>{branch.phone}</a></div>}
                          {branch.hours && <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><ClockCircleOutlined style={{ color: accent, flexShrink: 0 }} /><Text style={{ color: '#6b7280', fontSize: 14 }}>{branch.hours}</Text></div>}
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
            <section style={{ marginBottom: 40 }}>
              <Title level={2} style={{ color: '#111827', fontWeight: 700, textAlign: 'center', marginBottom: 28 }}>Tüm Konumlarımız</Title>
              <iframe
                src={extractMapSrc(contactData.mainMapUrl)}
                style={{ width: '100%', height: 400, border: 'none', borderRadius: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                allowFullScreen loading="lazy"
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
