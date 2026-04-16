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
    Tag,
    Popconfirm,
    message,
    Upload,
    Spin,
    Tooltip
} from 'antd';
import type { UploadChangeParam } from 'antd/es/upload';
import type { UploadFile, UploadProps } from 'antd/es/upload/interface';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    CarOutlined,
    LoadingOutlined,
    HolderOutlined,
    UserOutlined,
    ShoppingOutlined,
    DragOutlined,
    StarOutlined,
    ToolOutlined
} from '@ant-design/icons';
import apiClient, { getImageUrl } from '../../../lib/api-client';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// ── Category style map ──
const CATEGORY_STYLES: Record<string, { color: string; bg: string; gradient: string }> = {
    SEDAN: { color: '#6366f1', bg: '#eef2ff', gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)' },
    VAN: { color: '#0891b2', bg: '#ecfeff', gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)' },
    VIP_VAN: { color: '#7c3aed', bg: '#f5f3ff', gradient: 'linear-gradient(135deg, #7c3aed, #a855f7)' },
    MINIBUS: { color: '#2563eb', bg: '#eff6ff', gradient: 'linear-gradient(135deg, #2563eb, #3b82f6)' },
    BUS: { color: '#ea580c', bg: '#fff7ed', gradient: 'linear-gradient(135deg, #ea580c, #f97316)' },
    LUXURY: { color: '#ca8a04', bg: '#fefce8', gradient: 'linear-gradient(135deg, #ca8a04, #eab308)' },
};

const getCategoryStyle = (cat: string) => CATEGORY_STYLES[cat] || CATEGORY_STYLES.SEDAN;

interface VehicleType {
    id: string;
    name: string;
    category: string;
    categoryDisplay: string;
    capacity: number;
    luggage: number;
    description?: string;
    image?: string;
    features: string[];
    vehicleCount: number;
    order: number;
    metadata?: { openingFee?: number; basePricePerKm?: number };
}

// ── Sortable Card Component ──
interface SortableCardProps {
    item: VehicleType;
    onEdit: (item: VehicleType) => void;
    onDelete: (id: string) => void;
}

const SortableCard: React.FC<SortableCardProps> = ({ item, onEdit, onDelete }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
    const catStyle = getCategoryStyle(item.category);

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 9999 : 'auto',
    };

    return (
        <div ref={setNodeRef} style={style}>
            <div style={{
                background: '#fff',
                borderRadius: 20,
                overflow: 'hidden',
                border: isDragging ? '2px solid #6366f1' : '1px solid #f0f0f0',
                boxShadow: isDragging
                    ? '0 20px 40px rgba(99,102,241,0.2)'
                    : '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
                transition: 'all 0.2s ease',
            }}
                onMouseEnter={e => {
                    if (!isDragging) {
                        e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.08)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                }}
                onMouseLeave={e => {
                    if (!isDragging) {
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)';
                        e.currentTarget.style.transform = 'translateY(0)';
                    }
                }}
            >
                {/* Card Top - Image / Gradient */}
                <div style={{
                    height: 120,
                    background: item.image ? `url(${getImageUrl(item.image)}) center/cover no-repeat` : catStyle.gradient,
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    {!item.image && (
                        <CarOutlined style={{ fontSize: 44, color: 'rgba(255,255,255,0.5)' }} />
                    )}
                    {/* Drag handle */}
                    <div
                        {...attributes}
                        {...listeners}
                        style={{
                            position: 'absolute', top: 10, left: 10,
                            width: 32, height: 32, borderRadius: 10,
                            background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'grab', color: '#fff',
                        }}
                        title="Sıralamak için sürükleyin"
                    >
                        <DragOutlined style={{ fontSize: 14 }} />
                    </div>
                    {/* Category badge */}
                    <div style={{
                        position: 'absolute', top: 10, right: 10,
                        padding: '4px 12px', borderRadius: 20,
                        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
                        fontSize: 11, fontWeight: 700, color: catStyle.color,
                        letterSpacing: 0.3,
                    }}>
                        {item.categoryDisplay}
                    </div>
                    {/* Order badge */}
                    <div style={{
                        position: 'absolute', bottom: 10, left: 10,
                        width: 28, height: 28, borderRadius: 8,
                        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 800, color: '#fff',
                    }}>
                        {item.order || '#'}
                    </div>
                </div>

                {/* Card Body */}
                <div style={{ padding: '16px 20px 20px' }}>
                    {/* Name */}
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', marginBottom: 12, lineHeight: 1.3 }}>
                        {item.name}
                    </div>

                    {/* Stats Row */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                        <div style={{
                            flex: 1, padding: '10px 12px', borderRadius: 12,
                            background: '#f8fafc', border: '1px solid #f1f5f9',
                            textAlign: 'center',
                        }}>
                            <UserOutlined style={{ fontSize: 14, color: '#6366f1', display: 'block', marginBottom: 4 }} />
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{item.capacity}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Yolcu</div>
                        </div>
                        <div style={{
                            flex: 1, padding: '10px 12px', borderRadius: 12,
                            background: '#f8fafc', border: '1px solid #f1f5f9',
                            textAlign: 'center',
                        }}>
                            <ShoppingOutlined style={{ fontSize: 14, color: '#0891b2', display: 'block', marginBottom: 4 }} />
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{item.luggage}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bagaj</div>
                        </div>
                        <div style={{
                            flex: 1, padding: '10px 12px', borderRadius: 12,
                            background: item.vehicleCount > 0 ? '#f0fdf4' : '#f8fafc',
                            border: `1px solid ${item.vehicleCount > 0 ? '#bbf7d0' : '#f1f5f9'}`,
                            textAlign: 'center',
                        }}>
                            <CarOutlined style={{ fontSize: 14, color: item.vehicleCount > 0 ? '#16a34a' : '#94a3b8', display: 'block', marginBottom: 4 }} />
                            <div style={{ fontSize: 16, fontWeight: 800, color: item.vehicleCount > 0 ? '#16a34a' : '#94a3b8' }}>{item.vehicleCount}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Araç</div>
                        </div>
                    </div>

                    {/* Features */}
                    {item.features && item.features.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
                            {item.features.slice(0, 4).map((f, i) => (
                                <Tag key={i} style={{
                                    borderRadius: 6, fontSize: 10, fontWeight: 600, margin: 0,
                                    background: '#f1f5f9', color: '#64748b', border: 'none',
                                    padding: '2px 8px',
                                }}>
                                    {f}
                                </Tag>
                            ))}
                            {item.features.length > 4 && (
                                <Tag style={{
                                    borderRadius: 6, fontSize: 10, fontWeight: 600, margin: 0,
                                    background: '#e0e7ff', color: '#6366f1', border: 'none',
                                    padding: '2px 8px',
                                }}>
                                    +{item.features.length - 4}
                                </Tag>
                            )}
                        </div>
                    )}

                    {/* Km Pricing Info */}
                    {(item.metadata?.openingFee || item.metadata?.basePricePerKm) && (
                        <div style={{
                            padding: '8px 12px', borderRadius: 10,
                            background: '#fffbeb', border: '1px solid #fef3c7',
                            fontSize: 11, color: '#92400e', fontWeight: 500,
                            marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <ToolOutlined style={{ fontSize: 12 }} />
                            <span>
                                {item.metadata?.openingFee != null && `Başlangıç: ${item.metadata.openingFee}`}
                                {item.metadata?.openingFee != null && item.metadata?.basePricePerKm != null && ' | '}
                                {item.metadata?.basePricePerKm != null && `${item.metadata.basePricePerKm}/km`}
                            </span>
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Button
                            block
                            icon={<EditOutlined />}
                            onClick={() => onEdit(item)}
                            style={{
                                borderRadius: 10, fontWeight: 600, fontSize: 13,
                                height: 38, border: '1px solid #e2e8f0', color: '#475569',
                            }}
                        >
                            Düzenle
                        </Button>
                        <Popconfirm
                            title="Araç tipini silmek istediğinize emin misiniz?"
                            description={item.vehicleCount > 0 ? "Bu tipe bağlı araçlar var, önce onları güncellemelisiniz." : "Bu işlem geri alınamaz."}
                            onConfirm={() => onDelete(item.id)}
                            okText="Evet, Sil"
                            cancelText="Vazgeç"
                            okButtonProps={{ danger: true }}
                            disabled={item.vehicleCount > 0}
                        >
                            <Tooltip title={item.vehicleCount > 0 ? 'Bağlı araçlar mevcut' : ''}>
                                <Button
                                    danger
                                    icon={<DeleteOutlined />}
                                    disabled={item.vehicleCount > 0}
                                    style={{
                                        borderRadius: 10, width: 38, height: 38, minWidth: 38,
                                    }}
                                />
                            </Tooltip>
                        </Popconfirm>
                    </div>
                </div>
            </div>
        </div>
    );
};

const VehicleTypesPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form] = Form.useForm();
    const [uploadLoading, setUploadLoading] = useState(false);
    const [imageUrl, setImageUrl] = useState<string>();

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const fetchVehicleTypes = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get('/api/vehicle-types');
            if (res.data.success) {
                setVehicleTypes(res.data.data);
            }
        } catch (error) {
            console.error('Error fetching vehicle types:', error);
            message.error('Araç tipleri yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVehicleTypes();
    }, []);

    const handleAdd = () => {
        setEditingId(null);
        setImageUrl(undefined);
        form.resetFields();
        setModalVisible(true);
    };

    const handleEdit = (record: any) => {
        setEditingId(record.id);
        setImageUrl(record.image);
        form.setFieldsValue({
            name: record.name,
            category: record.category,
            capacity: record.capacity,
            luggage: record.luggage,
            description: record.description,
            features: record.features,
            image: record.image,
            openingFee: record.metadata?.openingFee ?? null,
            basePricePerKm: record.metadata?.basePricePerKm ?? null,
        });
        setModalVisible(true);
    };

    const handleUploadChange: UploadProps['onChange'] = (info: UploadChangeParam<UploadFile>) => {
        if (info.file.status === 'uploading') {
            setUploadLoading(true);
            return;
        }
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
            await apiClient.delete(`/api/vehicle-types/${id}`);
            message.success('Araç tipi silindi');
            fetchVehicleTypes();
        } catch (error: any) {
            console.error('Error deleting vehicle type:', error);
            message.error(error.response?.data?.error || 'Silme işlemi başarısız');
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();

            // Build metadata from km pricing fields
            const { openingFee, basePricePerKm, ...rest } = values;
            const metadata: Record<string, any> = {};
            if (openingFee != null && openingFee !== '') metadata.openingFee = Number(openingFee);
            if (basePricePerKm != null && basePricePerKm !== '') metadata.basePricePerKm = Number(basePricePerKm);

            const payload = { ...rest, metadata };

            if (editingId) {
                await apiClient.put(`/api/vehicle-types/${editingId}`, payload);
                message.success('Araç tipi güncellendi');
            } else {
                await apiClient.post('/api/vehicle-types', payload);
                message.success('Araç tipi oluşturuldu');
            }

            setModalVisible(false);
            fetchVehicleTypes();
        } catch (error: any) {
            console.error('Error saving vehicle type:', error);
            if (!error.errorFields) {
                message.error(error.response?.data?.error || 'Kaydetme işlemi başarısız');
            }
        }
    };

    const onDragEnd = async ({ active, over }: DragEndEvent) => {
        if (active.id !== over?.id) {
            setVehicleTypes((previous) => {
                const activeIndex = previous.findIndex((i) => i.id === active.id);
                const overIndex = previous.findIndex((i) => i.id === over?.id);
                return arrayMove(previous, activeIndex, overIndex);
            });

            try {
                const reorderedList = arrayMove(vehicleTypes,
                    vehicleTypes.findIndex((i) => i.id === active.id),
                    vehicleTypes.findIndex((i) => i.id === over?.id)
                );

                const orderData = reorderedList.map((item, index) => ({
                    id: item.id,
                    order: index + 1
                }));

                await apiClient.put('/api/vehicle-types/reorder', { items: orderData });
                message.success('Sıralama güncellendi');
            } catch (error) {
                console.error('Reorder error:', error);
                message.error('Sıralama kaydedilemedi');
                fetchVehicleTypes();
            }
        }
    };

    const totalVehicles = vehicleTypes.reduce((s, v) => s + (v.vehicleCount || 0), 0);

    return (
        <AdminGuard>
            <AdminLayout selectedKey="vehicle-types">
                <div style={{ paddingBottom: 40 }}>

                    {/* ── Header ── */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <div>
                            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', margin: 0, letterSpacing: -0.5 }}>
                                Araç Tipleri
                            </h1>
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                {vehicleTypes.length} araç tipi, {totalVehicles} kayıtlı araç
                            </Text>
                        </div>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleAdd}
                            size="large"
                            style={{
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                border: 'none', borderRadius: 12, fontWeight: 600,
                                height: 44, paddingInline: 24,
                                boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                            }}
                        >
                            Yeni Araç Tipi
                        </Button>
                    </div>

                    {/* ── Summary Stats ── */}
                    {vehicleTypes.length > 0 && (
                        <div style={{
                            display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap',
                        }}>
                            {Object.entries(
                                vehicleTypes.reduce((acc, v) => {
                                    acc[v.categoryDisplay] = (acc[v.categoryDisplay] || 0) + 1;
                                    return acc;
                                }, {} as Record<string, number>)
                            ).map(([cat, count]) => (
                                <div key={cat} style={{
                                    padding: '8px 16px', borderRadius: 12,
                                    background: '#fff', border: '1px solid #f0f0f0',
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>{cat}</span>
                                    <span style={{
                                        background: '#6366f115', color: '#6366f1',
                                        fontSize: 11, fontWeight: 700, padding: '2px 8px',
                                        borderRadius: 6,
                                    }}>
                                        {count}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Drag hint ── */}
                    {vehicleTypes.length > 1 && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '10px 16px', borderRadius: 12,
                            background: '#f8fafc', border: '1px solid #f1f5f9',
                            marginBottom: 20, fontSize: 12, color: '#94a3b8', fontWeight: 500,
                        }}>
                            <DragOutlined style={{ fontSize: 14, color: '#6366f1' }} />
                            Kartların sol üst köşesindeki tutamağı sürükleyerek sıralamayı değiştirebilirsiniz
                        </div>
                    )}

                    {/* ── Loading ── */}
                    {loading && vehicleTypes.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 80 }}>
                            <Spin size="large" />
                        </div>
                    )}

                    {/* ── Empty State ── */}
                    {vehicleTypes.length === 0 && !loading && (
                        <div style={{
                            textAlign: 'center', padding: '80px 40px',
                            background: '#fff', borderRadius: 20, border: '2px dashed #e2e8f0',
                        }}>
                            <div style={{
                                width: 80, height: 80, borderRadius: 24, margin: '0 auto 20px',
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <CarOutlined style={{ fontSize: 36, color: '#fff' }} />
                            </div>
                            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                                Henüz araç tipi eklenmemiş
                            </h3>
                            <Text type="secondary" style={{ fontSize: 14, display: 'block', marginBottom: 20 }}>
                                Araç tiplerini tanımlayarak filo yönetiminizi başlatın
                            </Text>
                            <Button type="primary" size="large" icon={<PlusOutlined />} onClick={handleAdd}
                                style={{
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    border: 'none', borderRadius: 10, fontWeight: 600, height: 42,
                                }}>
                                İlk Araç Tipini Ekle
                            </Button>
                        </div>
                    )}

                    {/* ── Vehicle Type Cards Grid ── */}
                    {vehicleTypes.length > 0 && (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={onDragEnd}
                        >
                            <SortableContext
                                items={vehicleTypes.map((i) => i.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                                    gap: 20,
                                }}>
                                    {vehicleTypes.map(vt => (
                                        <SortableCard
                                            key={vt.id}
                                            item={vt}
                                            onEdit={handleEdit}
                                            onDelete={handleDelete}
                                        />
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
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <CarOutlined style={{ fontSize: 18, color: '#fff' }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                                        {editingId ? 'Araç Tipini Düzenle' : 'Yeni Araç Tipi Ekle'}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>
                                        Araç tipi bilgilerini girin
                                    </div>
                                </div>
                            </div>
                        }
                        open={modalVisible}
                        onOk={handleSubmit}
                        onCancel={() => setModalVisible(false)}
                        okText={editingId ? 'Güncelle' : 'Kaydet'}
                        cancelText="İptal"
                        okButtonProps={{
                            style: {
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                border: 'none', borderRadius: 8, fontWeight: 600,
                            }
                        }}
                        cancelButtonProps={{ style: { borderRadius: 8 } }}
                        styles={{ body: { paddingTop: 20 } }}
                        width={560}
                    >
                        <Form form={form} layout="vertical" requiredMark={false}>
                            <Form.Item
                                name="name"
                                label={<span style={{ fontWeight: 600, color: '#334155' }}>Tip Adı</span>}
                                rules={[{ required: true, message: 'Lütfen tip adı giriniz' }]}
                            >
                                <Input placeholder="Örn: Mercedes Vito VIP" size="large" style={{ borderRadius: 10 }}
                                    prefix={<CarOutlined style={{ color: '#94a3b8' }} />} />
                            </Form.Item>

                            <Form.Item
                                name="category"
                                label={<span style={{ fontWeight: 600, color: '#334155' }}>Kategori</span>}
                                rules={[{ required: true, message: 'Lütfen kategori seçiniz' }]}
                            >
                                <Select placeholder="Kategori seçiniz" size="large">
                                    <Option value="SEDAN">Sedan</Option>
                                    <Option value="VAN">Van</Option>
                                    <Option value="VIP_VAN">VIP Van</Option>
                                    <Option value="MINIBUS">Minibüs</Option>
                                    <Option value="BUS">Otobüs</Option>
                                    <Option value="LUXURY">Lüks / Premium</Option>
                                </Select>
                            </Form.Item>

                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item
                                        name="capacity"
                                        label={<span style={{ fontWeight: 600, color: '#334155' }}>Yolcu Kapasitesi</span>}
                                        rules={[{ required: true, message: 'Gerekli' }]}
                                    >
                                        <InputNumber min={1} style={{ width: '100%', borderRadius: 10 }} size="large" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item
                                        name="luggage"
                                        label={<span style={{ fontWeight: 600, color: '#334155' }}>Bagaj Kapasitesi</span>}
                                        rules={[{ required: true, message: 'Gerekli' }]}
                                    >
                                        <InputNumber min={0} style={{ width: '100%', borderRadius: 10 }} size="large" />
                                    </Form.Item>
                                </Col>
                            </Row>

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
                            <Form.Item name="image" hidden>
                                <Input />
                            </Form.Item>

                            <Form.Item
                                name="features"
                                label={<span style={{ fontWeight: 600, color: '#334155' }}>Özellikler</span>}
                            >
                                <Select mode="tags" placeholder="Özellik ekleyin (WiFi, Deri Koltuk vb.)" tokenSeparators={[',']} size="large" />
                            </Form.Item>

                            <Form.Item
                                name="description"
                                label={<span style={{ fontWeight: 600, color: '#334155' }}>Açıklama</span>}
                            >
                                <TextArea rows={3} style={{ borderRadius: 10 }} />
                            </Form.Item>

                            {/* Km pricing section */}
                            <div style={{
                                borderTop: '1px solid #f0f0f0', paddingTop: 16, marginTop: 8, marginBottom: 12,
                                display: 'flex', alignItems: 'center', gap: 10,
                            }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: 8,
                                    background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <ToolOutlined style={{ fontSize: 15, color: '#ca8a04' }} />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>Km Bazlı Fallback Fiyatlandırma</div>
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                        Özel bölge fiyatı eşleşmezse km ile fiyat verilir. Boş bırakırsanız araç listede çıkmaz.
                                    </div>
                                </div>
                            </div>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item
                                        name="openingFee"
                                        label={<span style={{ fontWeight: 600, color: '#334155' }}>Başlangıç Ücreti</span>}
                                    >
                                        <InputNumber min={0} step={0.5} style={{ width: '100%', borderRadius: 10 }} size="large" placeholder="Örn: 10" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item
                                        name="basePricePerKm"
                                        label={<span style={{ fontWeight: 600, color: '#334155' }}>Km Başı Ücret</span>}
                                    >
                                        <InputNumber min={0} step={0.1} style={{ width: '100%', borderRadius: 10 }} size="large" placeholder="Örn: 1.5" />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Form>
                    </Modal>
                </div>
            </AdminLayout>
        </AdminGuard>
    );
};

export default VehicleTypesPage;
