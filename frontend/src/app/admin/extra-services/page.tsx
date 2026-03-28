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
import { MenuOutlined } from '@ant-design/icons';

import React, { useEffect, useState } from 'react';
import {
    Typography,
    Card,
    Row,
    Col,
    Table,
    Button,
    Modal,
    Form,
    Input,
    InputNumber,
    Select,
    Space,
    Popconfirm,
    Tag,
    message,
    Upload,
    Switch
} from 'antd';
import type { UploadChangeParam } from 'antd/es/upload';
import type { RcFile, UploadFile, UploadProps } from 'antd/es/upload/interface';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    LoadingOutlined,
    ShoppingOutlined
} from '@ant-design/icons';
import apiClient from '../../../lib/api-client';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';

const { Title } = Typography;
const { Option } = Select;
const { TextArea } = Input;

interface ExtraService {
    id: string;
    name: string;
    price: number;
    currency: string;
    isPerPerson: boolean;
    image?: string;
    order: number;
}

// Draggable Row Component
interface DraggableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
    'data-row-key': string;
}

const DraggableRow = (props: DraggableRowProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: props['data-row-key'],
    });

    const style: React.CSSProperties = {
        ...props.style,
        transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
        transition,
        cursor: 'move',
        ...(isDragging ? { position: 'relative', zIndex: 9999 } : {}),
    };

    return <tr {...props} ref={setNodeRef} style={style} {...attributes} {...listeners} />;
};

const ExtraServicesPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [services, setServices] = useState<ExtraService[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form] = Form.useForm();
    const [uploadLoading, setUploadLoading] = useState(false);
    const [imageUrl, setImageUrl] = useState<string>();

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 1,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const fetchServices = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get('/api/extra-services');
            if (res.data.success) {
                setServices(res.data.data);
            }
        } catch (error) {
            console.error('Error fetching extra services:', error);
            message.error('Ekstra hizmetler yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchServices();
    }, []);

    const handleAdd = () => {
        setEditingId(null);
        setImageUrl(undefined);
        form.resetFields();
        form.setFieldsValue({ currency: 'EUR', isPerPerson: false, excludeFromShuttle: true });
        setModalVisible(true);
    };

    const handleEdit = (record: ExtraService) => {
        setEditingId(record.id);
        setImageUrl(record.image);
        form.setFieldsValue({
            name: record.name,
            price: record.price,
            currency: record.currency,
            isPerPerson: record.isPerPerson,
            image: record.image,
            excludeFromShuttle: (record as any).excludeFromShuttle
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
            if (!error.errorFields) {
                message.error(error.response?.data?.error || 'Kaydetme işlemi başarısız');
            }
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

                const orderData = reorderedList.map((item, index) => ({
                    id: item.id,
                    order: index + 1
                }));

                await apiClient.put('/api/extra-services/reorder', { items: orderData });
                message.success('Sıralama güncellendi');
            } catch (error) {
                console.error('Reorder error:', error);
                message.error('Sıralama kaydedilemedi');
                fetchServices();
            }
        }
    };

    const columns = [
        {
            key: 'sort',
            width: 30,
            render: () => <MenuOutlined style={{ cursor: 'grab', color: '#999' }} />,
        },
        {
            title: 'Hizmet Adı',
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: ExtraService) => (
                <Space>
                    {record.image ? (
                        <img src={record.image} alt={text} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                    ) : (
                        <ShoppingOutlined style={{ fontSize: 24, color: '#1890ff' }} />
                    )}
                    <span style={{ fontWeight: 500 }}>{text}</span>
                </Space>
            )
        },
        {
            title: 'Fiyat',
            key: 'price',
            render: (_: any, record: ExtraService) => (
                <Tag color="green">{record.price} {record.currency}</Tag>
            )
        },
        {
            title: 'Tip',
            key: 'type',
            render: (_: any, record: ExtraService) => (
                <Tag color={record.isPerPerson ? "blue" : "orange"}>
                    {record.isPerPerson ? "Kişi Başı" : "Adet Başı"}
                </Tag>
            )
        },
        {
            title: 'İşlemler',
            key: 'actions',
            render: (_: any, record: ExtraService) => (
                <Space>
                    <Button
                        icon={<EditOutlined />}
                        size="small"
                        onClick={() => handleEdit(record)}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        Düzenle
                    </Button>
                    <Popconfirm
                        title="Hizmeti silmek istediğinize emin misiniz?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Evet"
                        cancelText="Hayır"
                    >
                        <Button
                            icon={<DeleteOutlined />}
                            size="small"
                            danger
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            Sil
                        </Button>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="extra-services">
                <Row gutter={[16, 16]}>
                    <Col xs={24}>
                        <Card
                            title={<Title level={3} style={{ margin: 0 }}>Ekstra Hizmetler</Title>}
                            extra={
                                <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                                    Yeni Ekle
                                </Button>
                            }
                        >
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={onDragEnd}
                                >
                                    <SortableContext
                                        items={services.map((i) => i.id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <Table
                                            columns={columns}
                                            dataSource={services}
                                            rowKey="id"
                                            loading={loading}
                                            pagination={false}
                                            locale={{ emptyText: 'Veri Yok' }}
                                            components={{
                                                body: {
                                                    row: DraggableRow,
                                                },
                                            }}
                                        />
                                    </SortableContext>
                                </DndContext>
                            </div>
                        </Card>
                    </Col>
                </Row>

                <Modal
                    title={editingId ? "Hizmet Düzenle" : "Yeni Hizmet Ekle"}
                    open={modalVisible}
                    onOk={handleSubmit}
                    onCancel={() => setModalVisible(false)}
                    okText="Kaydet"
                    cancelText="İptal"
                >
                    <Form form={form} layout="vertical">
                        <Form.Item
                            name="name"
                            label="Hizmet Adı"
                            rules={[{ required: true, message: 'Lütfen hizmet adı giriniz' }]}
                        >
                            <Input placeholder="Örn: Bebek Koltuğu" />
                        </Form.Item>

                        <div style={{ display: 'flex', gap: 16 }}>
                            <Form.Item
                                name="price"
                                label="Fiyat"
                                rules={[{ required: true, message: 'Gerekli' }]}
                                style={{ flex: 1 }}
                            >
                                <InputNumber min={0} style={{ width: '100%' }} />
                            </Form.Item>

                            <Form.Item
                                name="currency"
                                label="Para Birimi"
                                initialValue="EUR"
                                rules={[{ required: true, message: 'Gerekli' }]}
                                style={{ width: 120 }}
                            >
                                <Select
                                    options={[
                                        { label: 'EUR', value: 'EUR' },
                                        { label: 'USD', value: 'USD' },
                                        { label: 'TRY', value: 'TRY' },
                                        { label: 'GBP', value: 'GBP' }
                                    ]}
                                />
                            </Form.Item>
                        </div>

                        <Form.Item
                            name="isPerPerson"
                            label="Ücretlendirme Tipi"
                            valuePropName="checked"
                        >
                            <Switch checkedChildren="Kişi Başı" unCheckedChildren="Adet Başı" />
                        </Form.Item>

                        <Form.Item
                            name="excludeFromShuttle"
                            label="Shuttle Transferde Gösterimi"
                            valuePropName="checked"
                            tooltip="İşaretlenirse bu hizmet Shuttle transferlerde müşteriye gösterilmez."
                        >
                            <Switch checkedChildren="Gösterme" unCheckedChildren="Göster" />
                        </Form.Item>

                        <Form.Item label="Fotoğraf">
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
                                {imageUrl ? <img src={imageUrl} alt="img" style={{ width: '100%', objectFit: 'contain' }} /> : uploadButton}
                            </Upload>
                        </Form.Item>
                        <Form.Item name="image" hidden>
                            <Input />
                        </Form.Item>
                    </Form>
                </Modal>
            </AdminLayout>
        </AdminGuard>
    );
};

export default ExtraServicesPage;
