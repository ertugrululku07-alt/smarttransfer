'use client';

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import React, { useEffect, useState } from 'react';
import {
    Typography,
    Row,
    Col,
    Button,
    Modal,
    Form,
    Input,
    InputNumber,
    Select,
    Popconfirm,
    Tag,
    message,
    Upload,
    Switch,
    Spin,
    Tooltip
} from 'antd';
import type { UploadChangeParam } from 'antd/es/upload';
import type { UploadFile, UploadProps } from 'antd/es/upload/interface';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    LoadingOutlined,
    ShoppingOutlined,
    DragOutlined,
    UserOutlined,
    AppstoreOutlined,
    DollarOutlined,
    StopOutlined
} from '@ant-design/icons';
import apiClient, { getImageUrl } from '../../../lib/api-client';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';

const { Text } = Typography;

interface ExtraService {
    id: string;
    name: string;
    price: number;
    currency: string;
    isPerPerson: boolean;
    image?: string;
    order: number;
    excludeFromShuttle?: boolean;
}

// ── Sortable Card ──
interface SortableServiceCardProps {
    item: ExtraService;
    onEdit: (item: ExtraService) => void;
    onDelete: (id: string) => void;
}

const SortableServiceCard: React.FC<SortableServiceCardProps> = ({ item, onEdit, onDelete }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 9999 : 'auto',
    };

    return (
        <div ref={setNodeRef} style={style}>
            <div style={{
                background: '#fff', borderRadius: 20, overflow: 'hidden',
                border: isDragging ? '2px solid #6366f1' : '1px solid #f0f0f0',
                boxShadow: isDragging ? '0 20px 40px rgba(99,102,241,0.2)' : '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
                transition: 'all 0.2s ease',
            }}
                onMouseEnter={e => { if (!isDragging) { e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
                onMouseLeave={e => { if (!isDragging) { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; } }}
            >
                {/* Top - Image / Gradient */}
                <div style={{
                    height: 100,
                    background: item.image ? `url(${getImageUrl(item.image)}) center/cover no-repeat` : 'linear-gradient(135deg, #f59e0b, #d97706)',
                    position: 'relative',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    {!item.image && <ShoppingOutlined style={{ fontSize: 36, color: 'rgba(255,255,255,0.5)' }} />}
                    {/* Drag handle */}
                    <div {...attributes} {...listeners} style={{
                        position: 'absolute', top: 8, left: 8,
                        width: 30, height: 30, borderRadius: 8,
                        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'grab', color: '#fff',
                    }} title="Sıralamak için sürükleyin">
                        <DragOutlined style={{ fontSize: 13 }} />
                    </div>
                    {/* Price badge */}
                    <div style={{
                        position: 'absolute', bottom: 8, right: 8,
                        padding: '4px 12px', borderRadius: 20,
                        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
                        fontSize: 13, fontWeight: 800, color: '#16a34a',
                    }}>
                        {item.price} {item.currency}
                    </div>
                    {/* Order badge */}
                    <div style={{
                        position: 'absolute', bottom: 8, left: 8,
                        width: 26, height: 26, borderRadius: 7,
                        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800, color: '#fff',
                    }}>
                        {item.order || '#'}
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: '14px 18px 18px' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', marginBottom: 10, lineHeight: 1.3 }}>
                        {item.name}
                    </div>

                    {/* Tags row */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                        <Tag style={{
                            borderRadius: 6, fontSize: 11, fontWeight: 600, margin: 0, border: 'none', padding: '2px 10px',
                            background: item.isPerPerson ? '#eff6ff' : '#fff7ed',
                            color: item.isPerPerson ? '#2563eb' : '#ea580c',
                        }}>
                            {item.isPerPerson ? (
                                <><UserOutlined style={{ marginRight: 4 }} />Kişi Başı</>
                            ) : (
                                <><AppstoreOutlined style={{ marginRight: 4 }} />Adet Başı</>
                            )}
                        </Tag>
                        {item.excludeFromShuttle && (
                            <Tag style={{
                                borderRadius: 6, fontSize: 11, fontWeight: 600, margin: 0, border: 'none', padding: '2px 10px',
                                background: '#fef2f2', color: '#dc2626',
                            }}>
                                <StopOutlined style={{ marginRight: 4 }} />Shuttle Hariç
                            </Tag>
                        )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Button block icon={<EditOutlined />} onClick={() => onEdit(item)}
                            style={{ borderRadius: 10, fontWeight: 600, fontSize: 13, height: 36, border: '1px solid #e2e8f0', color: '#475569' }}>
                            Düzenle
                        </Button>
                        <Popconfirm title="Hizmeti silmek istediğinize emin misiniz?" onConfirm={() => onDelete(item.id)}
                            okText="Evet, Sil" cancelText="Vazgeç" okButtonProps={{ danger: true }}>
                            <Button danger icon={<DeleteOutlined />}
                                style={{ borderRadius: 10, width: 36, height: 36, minWidth: 36 }} />
                        </Popconfirm>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ExtraServicesPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [services, setServices] = useState<ExtraService[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form] = Form.useForm();
    const [uploadLoading, setUploadLoading] = useState(false);
    const [imageUrl, setImageUrl] = useState<string>();
    const [currencies, setCurrencies] = useState<any[]>([]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const fetchServices = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get('/api/extra-services');
            if (res.data.success) setServices(res.data.data);
        } catch (error) {
            console.error('Error fetching extra services:', error);
            message.error('Ekstra hizmetler yüklenirken hata oluştu');
        } finally { setLoading(false); }
    };

    const fetchDefinitions = async () => {
        try {
            const res = await apiClient.get('/api/tenant/info');
            const settings = res.data?.data?.tenant?.settings || {};
            const defs = settings.definitions || { currencies: [] };
            const sortedCurrencies = [...(defs.currencies || [])].sort((a: any, b: any) => {
                if (a.isDefault) return -1;
                if (b.isDefault) return 1;
                return 0;
            });
            setCurrencies(sortedCurrencies);
        } catch (error) { console.error('Error fetching definitions:', error); }
    };

    useEffect(() => { fetchServices(); fetchDefinitions(); }, []);

    const handleAdd = () => {
        setEditingId(null);
        setImageUrl(undefined);
        form.resetFields();
        const defaultCurrency = currencies.find(c => c.isDefault)?.code || currencies[0]?.code || 'TRY';
        form.setFieldsValue({ currency: defaultCurrency, isPerPerson: false, excludeFromShuttle: true });
        setModalVisible(true);
    };

    const handleEdit = (record: ExtraService) => {
        setEditingId(record.id);
        setImageUrl(record.image);
        form.setFieldsValue({
            name: record.name, price: record.price, currency: record.currency,
            isPerPerson: record.isPerPerson, image: record.image,
            excludeFromShuttle: record.excludeFromShuttle
        });
        setModalVisible(true);
    };

    const handleUploadChange: UploadProps['onChange'] = (info: UploadChangeParam<UploadFile>) => {
        if (info.file.status === 'uploading') { setUploadLoading(true); return; }
        if (info.file.status === 'done') {
            setUploadLoading(false);
            const url = info.file.response?.data?.url;
            setImageUrl(url);
            form.setFieldValue('image', url);
            message.success('Resim yüklendi');
        } else if (info.file.status === 'error') {
            setUploadLoading(false);
            message.error('Resim yüklenemedi');
        }
    };

    const uploadButton = (
        <div>
            {uploadLoading ? <LoadingOutlined /> : <PlusOutlined />}
            <div style={{ marginTop: 8 }}>Yükle</div>
        </div>
    );

    const handleDelete = async (id: string) => {
        try {
            await apiClient.delete(`/api/extra-services/${id}`);
            message.success('Hizmet silindi');
            fetchServices();
        } catch (error: any) {
            console.error('Error deleting extra service:', error);
            message.error(error.response?.data?.error || 'Silme işlemi başarısız');
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            if (editingId) {
                await apiClient.put(`/api/extra-services/${editingId}`, values);
                message.success('Hizmet güncellendi');
            } else {
                await apiClient.post('/api/extra-services', values);
                message.success('Hizmet oluşturuldu');
            }
            setModalVisible(false);
            fetchServices();
        } catch (error: any) {
            console.error('Error saving extra service:', error);
            if (!error.errorFields) message.error(error.response?.data?.error || 'Kaydetme işlemi başarısız');
        }
    };

    const onDragEnd = async ({ active, over }: DragEndEvent) => {
        if (active.id !== over?.id) {
            setServices((previous) => {
                const activeIndex = previous.findIndex((i) => i.id === active.id);
                const overIndex = previous.findIndex((i) => i.id === over?.id);
                return arrayMove(previous, activeIndex, overIndex);
            });
            try {
                const reorderedList = arrayMove(services,
                    services.findIndex((i) => i.id === active.id),
                    services.findIndex((i) => i.id === over?.id)
                );
                const orderData = reorderedList.map((item, index) => ({ id: item.id, order: index + 1 }));
                await apiClient.put('/api/extra-services/reorder', { items: orderData });
                message.success('Sıralama güncellendi');
            } catch (error) {
                console.error('Reorder error:', error);
                message.error('Sıralama kaydedilemedi');
                fetchServices();
            }
        }
    };

    return (
        <AdminGuard>
            <AdminLayout selectedKey="extra-services">
                <div style={{ paddingBottom: 40 }}>

                    {/* ── Header ── */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <div>
                            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', margin: 0, letterSpacing: -0.5 }}>
                                Ekstra Hizmetler
                            </h1>
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                {services.length} hizmet tanımlı
                            </Text>
                        </div>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size="large"
                            style={{
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                border: 'none', borderRadius: 12, fontWeight: 600,
                                height: 44, paddingInline: 24,
                                boxShadow: '0 4px 14px rgba(245,158,11,0.3)',
                            }}>
                            Yeni Hizmet Ekle
                        </Button>
                    </div>

                    {/* ── Drag hint ── */}
                    {services.length > 1 && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '10px 16px', borderRadius: 12,
                            background: '#f8fafc', border: '1px solid #f1f5f9',
                            marginBottom: 20, fontSize: 12, color: '#94a3b8', fontWeight: 500,
                        }}>
                            <DragOutlined style={{ fontSize: 14, color: '#f59e0b' }} />
                            Kartların sol üst köşesindeki tutamağı sürükleyerek sıralamayı değiştirebilirsiniz
                        </div>
                    )}

                    {/* ── Loading ── */}
                    {loading && services.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
                    )}

                    {/* ── Empty State ── */}
                    {services.length === 0 && !loading && (
                        <div style={{
                            textAlign: 'center', padding: '80px 40px',
                            background: '#fff', borderRadius: 20, border: '2px dashed #e2e8f0',
                        }}>
                            <div style={{
                                width: 80, height: 80, borderRadius: 24, margin: '0 auto 20px',
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <ShoppingOutlined style={{ fontSize: 36, color: '#fff' }} />
                            </div>
                            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                                Henüz ekstra hizmet eklenmemiş
                            </h3>
                            <Text type="secondary" style={{ fontSize: 14, display: 'block', marginBottom: 20 }}>
                                Bebek koltuğu, VIP karşılama gibi ek hizmetleri tanımlayın
                            </Text>
                            <Button type="primary" size="large" icon={<PlusOutlined />} onClick={handleAdd}
                                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: 10, fontWeight: 600, height: 42 }}>
                                İlk Hizmeti Ekle
                            </Button>
                        </div>
                    )}

                    {/* ── Cards Grid ── */}
                    {services.length > 0 && (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                            <SortableContext items={services.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                                    {services.map(svc => (
                                        <SortableServiceCard key={svc.id} item={svc} onEdit={handleEdit} onDelete={handleDelete} />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    )}

                    {/* ── Modal ── */}
                    <Modal
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: 12,
                                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <ShoppingOutlined style={{ fontSize: 18, color: '#fff' }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 16, fontWeight: 700 }}>{editingId ? 'Hizmet Düzenle' : 'Yeni Hizmet Ekle'}</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>Hizmet bilgilerini girin</div>
                                </div>
                            </div>
                        }
                        open={modalVisible}
                        onOk={handleSubmit}
                        onCancel={() => setModalVisible(false)}
                        okText={editingId ? 'Güncelle' : 'Kaydet'}
                        cancelText="İptal"
                        okButtonProps={{ style: { background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: 8, fontWeight: 600 } }}
                        cancelButtonProps={{ style: { borderRadius: 8 } }}
                        styles={{ body: { paddingTop: 20 } }}
                        width={520}
                    >
                        <Form form={form} layout="vertical" requiredMark={false}>
                            <Form.Item name="name" label={<span style={{ fontWeight: 600, color: '#334155' }}>Hizmet Adı</span>}
                                rules={[{ required: true, message: 'Lütfen hizmet adı giriniz' }]}>
                                <Input placeholder="Örn: Bebek Koltuğu" size="large" style={{ borderRadius: 10 }}
                                    prefix={<ShoppingOutlined style={{ color: '#94a3b8' }} />} />
                            </Form.Item>

                            <Row gutter={16}>
                                <Col flex="1">
                                    <Form.Item name="price" label={<span style={{ fontWeight: 600, color: '#334155' }}>Fiyat</span>}
                                        rules={[{ required: true, message: 'Gerekli' }]}>
                                        <InputNumber min={0} style={{ width: '100%', borderRadius: 10 }} size="large"
                                            prefix={<DollarOutlined style={{ color: '#94a3b8' }} />} />
                                    </Form.Item>
                                </Col>
                                <Col style={{ width: 140 }}>
                                    <Form.Item name="currency" label={<span style={{ fontWeight: 600, color: '#334155' }}>Para Birimi</span>}
                                        rules={[{ required: true, message: 'Gerekli' }]}>
                                        <Select size="large" loading={currencies.length === 0}
                                            notFoundContent={currencies.length === 0 ? 'Yükleniyor...' : 'Tanımsız'}
                                            options={currencies.map(c => ({ label: `${c.symbol} ${c.code}`, value: c.code }))} />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <div style={{
                                display: 'flex', gap: 16, marginBottom: 16,
                                padding: '14px 16px', borderRadius: 12,
                                background: '#f8fafc', border: '1px solid #f1f5f9',
                            }}>
                                <Form.Item name="isPerPerson" label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Ücretlendirme</span>}
                                    valuePropName="checked" style={{ margin: 0, flex: 1 }}>
                                    <Switch checkedChildren="Kişi Başı" unCheckedChildren="Adet Başı" />
                                </Form.Item>
                                <Form.Item name="excludeFromShuttle"
                                    label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 13 }}>Shuttle Hariç</span>}
                                    valuePropName="checked" style={{ margin: 0, flex: 1 }}
                                    tooltip="İşaretlenirse Shuttle transferlerde gösterilmez.">
                                    <Switch checkedChildren="Evet" unCheckedChildren="Hayır" />
                                </Form.Item>
                            </div>

                            <Form.Item label={<span style={{ fontWeight: 600, color: '#334155' }}>Fotoğraf</span>}>
                                <Upload
                                    name="file"
                                    listType="picture-card"
                                    className="avatar-uploader"
                                    showUploadList={false}
                                    action={`${(process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-69e7.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/upload`}
                                    headers={{
                                        Authorization: typeof window !== 'undefined' ? `Bearer ${localStorage.getItem('token')}` : '',
                                    }}
                                    onChange={handleUploadChange}
                                >
                                    {imageUrl ? <img src={getImageUrl(imageUrl)} alt="img" style={{ width: '100%', objectFit: 'contain' }} /> : uploadButton}
                                </Upload>
                            </Form.Item>
                            <Form.Item name="image" hidden><Input /></Form.Item>
                        </Form>
                    </Modal>
                </div>
            </AdminLayout>
        </AdminGuard>
    );
};

export default ExtraServicesPage;
