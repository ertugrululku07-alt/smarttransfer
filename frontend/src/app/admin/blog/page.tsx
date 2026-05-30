'use client';

import React, { useState, useEffect } from 'react';
import {
    Card, Typography, Button, Input, message, Form, Row, Col,
    Table, Tag, Modal, Select, Upload, Space, Alert, Switch,
} from 'antd';
import {
    PlusOutlined, DeleteOutlined, SaveOutlined, EditOutlined, EyeOutlined,
    UploadOutlined, FileTextOutlined,
} from '@ant-design/icons';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import apiClient, { getImageUrl } from '@/lib/api-client';

const { Title, Text } = Typography;

interface BlogPost {
    slug: string;
    title: string;
    excerpt?: string;
    content?: string;
    coverImage?: string;
    category?: string;
    tags?: string[];
    keywords?: string[];
    author?: { name?: string; image?: string };
    publishedAt?: string;
    updatedAt?: string;
    status?: 'draft' | 'published';
    readingTime?: number;
}

function slugify(s: string): string {
    return s
        .toLowerCase()
        .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
}

const AdminBlogPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [posts, setPosts] = useState<BlogPost[]>([]);
    const [editing, setEditing] = useState<BlogPost | null>(null);
    const [editIdx, setEditIdx] = useState<number | null>(null);
    const [uploading, setUploading] = useState(false);
    const [blogHeroImage, setBlogHeroImage] = useState('');
    const [heroUploading, setHeroUploading] = useState(false);
    const [form] = Form.useForm();

    useEffect(() => { load(); }, []);

    const load = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get('/api/tenant/info');
            const settings = res.data?.data?.tenant?.settings || {};
            const blogData = settings.seo?.blog || {};
            const blogPosts = Array.isArray(blogData.posts) ? blogData.posts : [];
            setPosts(blogPosts);
            setBlogHeroImage(blogData.heroImage || '');
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const savePosts = async (next: BlogPost[], heroImg?: string) => {
        try {
            setSaving(true);
            const hero = heroImg !== undefined ? heroImg : blogHeroImage;
            const res = await apiClient.put('/api/tenant/settings', { seo: { blog: { posts: next, heroImage: hero } } });
            if (res.data.success) {
                message.success('Kaydedildi');
                setPosts(next);
            }
        } catch {
            message.error('Kaydedilemedi');
        } finally {
            setSaving(false);
        }
    };

    const handleHeroUpload = async (file: File) => {
        try {
            setHeroUploading(true);
            const fd = new FormData();
            fd.append('file', file);
            const res = await apiClient.post('/api/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            if (res.data.success) {
                const url = res.data.data.url;
                setBlogHeroImage(url);
                // Save immediately
                await apiClient.put('/api/tenant/settings', { seo: { blog: { posts, heroImage: url } } });
                message.success('Blog hero görseli kaydedildi');
            }
        } catch {
            message.error('Görsel yüklenemedi');
        } finally {
            setHeroUploading(false);
        }
        return false;
    };

    const removeHeroImage = async () => {
        setBlogHeroImage('');
        try {
            await apiClient.put('/api/tenant/settings', { seo: { blog: { posts, heroImage: '' } } });
            message.success('Hero görseli kaldırıldı');
        } catch {
            message.error('Kaydedilemedi');
        }
    };

    const openEditor = (post?: BlogPost, idx?: number) => {
        const data: BlogPost = post || {
            slug: '',
            title: '',
            excerpt: '',
            content: '',
            category: '',
            tags: [],
            keywords: [],
            author: { name: '' },
            status: 'draft',
            publishedAt: new Date().toISOString(),
        };
        setEditing(data);
        setEditIdx(idx ?? null);
        form.setFieldsValue(data);
    };

    const closeEditor = () => {
        setEditing(null);
        setEditIdx(null);
        form.resetFields();
    };

    const handleSavePost = async () => {
        try {
            const values = await form.validateFields();
            const now = new Date().toISOString();
            const cleaned: BlogPost = {
                ...editing,
                ...values,
                slug: values.slug || slugify(values.title),
                updatedAt: now,
                publishedAt: values.publishedAt || editing?.publishedAt || now,
                status: values.status || 'draft',
            };
            // Check slug uniqueness
            const existsIdx = posts.findIndex(p => p.slug === cleaned.slug);
            const next = [...posts];
            if (editIdx === null) {
                if (existsIdx !== -1) {
                    message.error('Bu slug zaten kullanılıyor');
                    return;
                }
                next.push(cleaned);
            } else {
                if (existsIdx !== -1 && existsIdx !== editIdx) {
                    message.error('Bu slug başka bir yazıda kullanılıyor');
                    return;
                }
                next[editIdx] = cleaned;
            }
            await savePosts(next);
            closeEditor();
        } catch {
            // validation handled
        }
    };

    const handleDeletePost = async (idx: number) => {
        Modal.confirm({
            title: 'Yazıyı silmek istediğinize emin misiniz?',
            content: posts[idx].title,
            okText: 'Sil', okType: 'danger', cancelText: 'İptal',
            onOk: async () => {
                const next = posts.filter((_, i) => i !== idx);
                await savePosts(next);
            },
        });
    };

    const handleCoverUpload = async (file: File) => {
        try {
            setUploading(true);
            const fd = new FormData();
            fd.append('file', file);
            const res = await apiClient.post('/api/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            if (res.data.success) {
                const url = res.data.data.url;
                form.setFieldsValue({ coverImage: url });
                setEditing(prev => prev ? { ...prev, coverImage: url } : prev);
                message.success('Görsel yüklendi');
            }
        } catch {
            message.error('Görsel yüklenemedi');
        } finally {
            setUploading(false);
        }
        return false;
    };

    const columns = [
        {
            title: 'Başlık',
            dataIndex: 'title',
            key: 'title',
            render: (t: string, r: BlogPost) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{t || 'İsimsiz'}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>/blog/{r.slug}</Text>
                </Space>
            ),
        },
        { title: 'Kategori', dataIndex: 'category', key: 'category', width: 140, render: (c: string) => c ? <Tag color="blue">{c}</Tag> : '-' },
        {
            title: 'Durum',
            dataIndex: 'status',
            key: 'status',
            width: 110,
            render: (s: string) => s === 'published'
                ? <Tag color="green">Yayında</Tag>
                : <Tag color="orange">Taslak</Tag>,
        },
        {
            title: 'Tarih',
            dataIndex: 'publishedAt',
            key: 'publishedAt',
            width: 140,
            render: (d: string) => d ? new Date(d).toLocaleDateString('tr-TR') : '-',
        },
        {
            title: 'İşlemler',
            key: 'actions',
            width: 200,
            render: (_: any, r: BlogPost, idx: number) => (
                <Space>
                    <Button size="small" icon={<EyeOutlined />} href={`/blog/${r.slug}`} target="_blank">Önizle</Button>
                    <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openEditor(r, idx)}>Düzenle</Button>
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeletePost(idx)} />
                </Space>
            ),
        },
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="blog">
                <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <Title level={2} style={{ marginBottom: 4 }}>Blog Yönetimi</Title>
                        <Text type="secondary">Blog yazılarınızı yönetin. SEO açısından düzenli içerik üretimi siteniz için kritiktir.</Text>
                    </div>
                    <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => openEditor()}>Yeni Yazı</Button>
                </div>

                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="SEO İpucu"
                    description="Düzenli blog yazıları (haftada en az 1) Google sıralamanızı önemli ölçüde artırır. Long-tail keyword'lere odaklı, 800+ kelimelik içerikler en etkilidir."
                />

                {/* Blog Page Hero Image */}
                <Card
                    title="Blog Sayfası Hero Görseli"
                    size="small"
                    style={{ marginBottom: 16 }}
                    extra={blogHeroImage && (
                        <Button size="small" danger onClick={removeHeroImage}>Kaldır</Button>
                    )}
                >
                    <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
                        Blog ana sayfasının (/blog) üst kısmındaki hero alanının arka plan görseli. Önerilen: 1920×600px yatay bir fotoğraf.
                    </Text>
                    {blogHeroImage ? (
                        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', maxHeight: 200, marginBottom: 8 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={getImageUrl(blogHeroImage)}
                                alt="Blog Hero"
                                style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }}
                            />
                            <div style={{
                                position: 'absolute', inset: 0,
                                background: 'linear-gradient(135deg, rgba(15,23,42,0.6), rgba(30,41,59,0.5))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4,
                            }}>
                                <span style={{ color: '#fff', fontSize: 28, fontWeight: 700, fontFamily: 'Georgia, serif' }}>Blog</span>
                                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Transfer, seyahat ve şehir rehberleri</span>
                            </div>
                            <div style={{ position: 'absolute', bottom: 8, right: 8 }}>
                                <Upload showUploadList={false} accept="image/*" beforeUpload={handleHeroUpload}>
                                    <Button size="small" icon={<UploadOutlined />} loading={heroUploading} style={{ background: 'rgba(255,255,255,0.9)' }}>Değiştir</Button>
                                </Upload>
                            </div>
                        </div>
                    ) : (
                        <Upload.Dragger
                            showUploadList={false}
                            accept="image/*"
                            beforeUpload={handleHeroUpload}
                            style={{ borderRadius: 12 }}
                        >
                            <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
                                <UploadOutlined style={{ fontSize: 32, color: '#667eea' }} />
                            </p>
                            <p style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                                {heroUploading ? 'Yükleniyor...' : 'Blog hero görseli yüklemek için tıklayın veya sürükleyin'}
                            </p>
                            <p style={{ fontSize: 12, color: '#94a3b8' }}>JPG, PNG, WebP • Önerilen: 1920×600px</p>
                        </Upload.Dragger>
                    )}
                </Card>

                <Card>
                    <Table
                        loading={loading}
                        rowKey={(r) => r.slug || Math.random().toString()}
                        dataSource={posts}
                        columns={columns as any}
                        pagination={{ pageSize: 20 }}
                        locale={{ emptyText: 'Henüz blog yazısı eklenmemiş' }}
                    />
                </Card>

                <Modal
                    open={editing !== null}
                    title={editIdx === null ? 'Yeni Blog Yazısı' : 'Blog Yazısı Düzenle'}
                    onCancel={closeEditor}
                    onOk={handleSavePost}
                    confirmLoading={saving}
                    width={900}
                    okText="Kaydet"
                    cancelText="İptal"
                    destroyOnHidden
                >
                    <Form form={form} layout="vertical">
                        <Row gutter={16}>
                            <Col xs={24}>
                                <Form.Item name="title" label="Başlık" rules={[{ required: true, message: 'Başlık zorunlu' }]}>
                                    <Input placeholder="Antalya'da Mutlaka Görülmesi Gereken 10 Yer" maxLength={120} showCount onChange={e => {
                                        if (!form.getFieldValue('slug')) {
                                            form.setFieldsValue({ slug: slugify(e.target.value) });
                                        }
                                    }} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={16}>
                                <Form.Item name="slug" label="URL Slug" rules={[{ required: true, message: 'Slug zorunlu' }]} extra="Yalnızca harf, rakam, tire">
                                    <Input
                                        placeholder="antalya-mutlaka-gorulmesi-gereken-yerler"
                                        onChange={e => form.setFieldsValue({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') })}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item name="status" label="Durum">
                                    <Select options={[
                                        { value: 'draft', label: 'Taslak' },
                                        { value: 'published', label: 'Yayında' },
                                    ]} />
                                </Form.Item>
                            </Col>
                            <Col xs={24}>
                                <Form.Item name="excerpt" label="Özet (Excerpt)" extra="Liste sayfasında ve meta description olarak kullanılır">
                                    <Input.TextArea placeholder="Yazının kısa özeti..." rows={2} maxLength={300} showCount />
                                </Form.Item>
                            </Col>
                            <Col xs={24}>
                                <Form.Item label="Kapak Görseli (Hero)" extra="Blog yazısının en üstünde tam genişlikte görünecek resim. Önerilen boyut: 1200×630 piksel.">
                                    <Form.Item name="coverImage" noStyle>
                                        <Input style={{ display: 'none' }} />
                                    </Form.Item>
                                    {form.getFieldValue('coverImage') ? (
                                        <div style={{
                                            position: 'relative',
                                            width: '100%',
                                            maxHeight: 280,
                                            borderRadius: 12,
                                            overflow: 'hidden',
                                            border: '2px solid #e2e8f0',
                                            marginBottom: 12,
                                            background: '#f1f5f9',
                                        }}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={getImageUrl(form.getFieldValue('coverImage'))}
                                                alt="Kapak Görseli Önizleme"
                                                style={{ width: '100%', height: 280, objectFit: 'cover', display: 'block' }}
                                            />
                                            <div style={{
                                                position: 'absolute', bottom: 0, left: 0, right: 0,
                                                background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                                                padding: '24px 16px 12px',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                                            }}>
                                                <Text style={{ color: '#fff', fontSize: 12 }}>
                                                    {form.getFieldValue('coverImage')}
                                                </Text>
                                                <Space>
                                                    <Upload showUploadList={false} accept="image/*" beforeUpload={handleCoverUpload}>
                                                        <Button size="small" icon={<UploadOutlined />} loading={uploading} style={{ background: 'rgba(255,255,255,0.9)' }}>Değiştir</Button>
                                                    </Upload>
                                                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => { form.setFieldsValue({ coverImage: '' }); setEditing(prev => prev ? {...prev, coverImage: ''} : prev); }} style={{ background: 'rgba(255,255,255,0.9)' }}>Kaldır</Button>
                                                </Space>
                                            </div>
                                        </div>
                                    ) : (
                                        <Upload.Dragger
                                            showUploadList={false}
                                            accept="image/*"
                                            beforeUpload={handleCoverUpload}
                                            style={{ borderRadius: 12, padding: '20px 16px' }}
                                        >
                                            <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
                                                <UploadOutlined style={{ fontSize: 36, color: '#667eea' }} />
                                            </p>
                                            <p style={{ fontSize: 15, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                                                {uploading ? 'Yükleniyor...' : 'Kapak görseli yüklemek için tıklayın veya sürükleyin'}
                                            </p>
                                            <p style={{ fontSize: 12, color: '#94a3b8' }}>
                                                JPG, PNG, WebP • Önerilen: 1200×630px
                                            </p>
                                        </Upload.Dragger>
                                    )}
                                    <Input
                                        placeholder="veya direkt URL yapıştırın: https://..."
                                        size="small"
                                        style={{ marginTop: 8, borderRadius: 6 }}
                                        value={form.getFieldValue('coverImage') || ''}
                                        onChange={e => { form.setFieldsValue({ coverImage: e.target.value }); setEditing(prev => prev ? {...prev, coverImage: e.target.value} : prev); }}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={6}>
                                <Form.Item name="category" label="Kategori">
                                    <Input placeholder="Seyahat Rehberi" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={6}>
                                <Form.Item name={['author', 'name']} label="Yazar">
                                    <Input placeholder="Adınız" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="tags" label="Etiketler">
                                    <Select mode="tags" placeholder="antalya, gezi, tatil" tokenSeparators={[',']} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="keywords" label="SEO Anahtar Kelimeler">
                                    <Select mode="tags" placeholder="antalya gezi, antalya tatil" tokenSeparators={[',']} />
                                </Form.Item>
                            </Col>
                            <Col xs={24}>
                                <Form.Item
                                    name="content"
                                    label="İçerik (HTML)"
                                    extra={
                                        <span>
                                            HTML olarak girin. Desteklenenler: <code>&lt;h2&gt;</code>, <code>&lt;h3&gt;</code>, <code>&lt;p&gt;</code>, <code>&lt;a&gt;</code>, <code>&lt;img&gt;</code>, <code>&lt;ul&gt;</code>, <code>&lt;ol&gt;</code>, <code>&lt;blockquote&gt;</code>, <code>&lt;code&gt;</code>, <code>&lt;pre&gt;</code>, <code>&lt;table&gt;</code>
                                        </span>
                                    }
                                >
                                    <Input.TextArea rows={14} placeholder={`<h2>Bölüm Başlığı</h2>\n<p>Paragraf metni...</p>\n<h3>Alt Başlık</h3>\n<p>Devam metni...</p>\n<ul>\n  <li>Madde 1</li>\n  <li>Madde 2</li>\n</ul>`} style={{ fontFamily: 'monospace', fontSize: 13 }} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="publishedAt" label="Yayın Tarihi">
                                    <Input type="datetime-local" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="readingTime" label="Okuma Süresi (dk)" extra="Boş bırakılırsa otomatik hesaplanır">
                                    <Input type="number" placeholder="5" />
                                </Form.Item>
                            </Col>
                        </Row>
                    </Form>
                </Modal>
            </AdminLayout>
        </AdminGuard>
    );
};

export default AdminBlogPage;
