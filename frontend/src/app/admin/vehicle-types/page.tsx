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
    Upload
} from 'antd';
import type { UploadChangeParam } from 'antd/es/upload';
import type { RcFile, UploadFile, UploadProps } from 'antd/es/upload/interface';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    CarOutlined,
    LoadingOutlined
} from '@ant-design/icons';
import apiClient, { getImageUrl } from '../../../lib/api-client';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';

// ... existing imports

const { Title } = Typography;
const { Option } = Select;
const { TextArea } = Input;

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

const VehicleTypesPage: React.FC = () => {
    // ... existing state ...
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
                distance: 1,
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

    // ... existing handlers (handleAdd, handleEdit, handleUploadChange ...)
    const handleAdd = () => {
        setEditingId(null);
        setImageUrl(undefined);
        form.resetFields();
        setModalVisible(true);
    };

    const handleEdit = (record: VehicleType) => {
        setEditingId(record.id);
        setImageUrl(record.image);
        form.setFieldsValue({
            name: record.name,
            category: record.category,
            capacity: record.capacity,
            luggage: record.luggage,
            description: record.description,
            features: record.features,
            image: record.image
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

            if (editingId) {
                await apiClient.put(`/api/vehicle-types/${editingId}`, values);
                message.success('Araç tipi güncellendi');
            } else {
                await apiClient.post('/api/vehicle-types', values);
                message.success('Araç tipi oluşturuldu');
            }

            setModalVisible(false);
            fetchVehicleTypes();
        } catch (error: any) {
            console.error('Error saving vehicle type:', error);
            if (!error.errorFields) { // Not validation error
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

            // Call API to persist order
            try {
                // Get the new order after state update
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
                fetchVehicleTypes(); // Revert
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
            title: 'Araç Tipi',
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: VehicleType) => (
                <Space>
                    {record.image ? (
                        <img src={getImageUrl(record.image)} alt={text} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                    ) : (
                        <CarOutlined style={{ fontSize: 24, color: '#1890ff' }} />
                    )}
                    <span style={{ fontWeight: 500 }}>{text}</span>
                </Space>
            )
        },
        {
            title: 'Kategori',
            dataIndex: 'categoryDisplay',
            key: 'category',
            render: (text: string) => <Tag color="blue">{text}</Tag>
        },
        {
            title: 'Kapasite',
            key: 'capacity',
            render: (_: any, record: VehicleType) => (
                <span>{record.capacity} Yolcu / {record.luggage} Bagaj</span>
            )
        },
        {
            title: 'Kayıtlı Araç',
            dataIndex: 'vehicleCount',
            key: 'vehicleCount',
            render: (count: number) => (
                <Tag color={count > 0 ? 'green' : 'default'}>{count} Araç</Tag>
            )
        },
        {
            title: 'İşlemler',
            key: 'actions',
            render: (_: any, record: VehicleType) => (
                <Space>
                    <Button
                        icon={<EditOutlined />}
                        size="small"
                        onClick={() => handleEdit(record)}
                        onMouseDown={(e) => e.stopPropagation()} // Prevent drag start
                    >
                        Düzenle
                    </Button>
                    <Popconfirm
                        title="Araç tipini silmek istediğinize emin misiniz?"
                        description={record.vehicleCount > 0 ? "Bu tipe bağlı araçlar var, önce onları güncellemelisiniz." : "Bu işlem geri alınamaz."}
                        onConfirm={() => handleDelete(record.id)}
                        okText="Evet"
                        cancelText="Hayır"
                        disabled={record.vehicleCount > 0}
                    >
                        <Button
                            icon={<DeleteOutlined />}
                            size="small"
                            danger
                            disabled={record.vehicleCount > 0}
                            onMouseDown={(e) => e.stopPropagation()} // Prevent drag start
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
            <AdminLayout selectedKey="vehicle-types">
                <Row gutter={[16, 16]}>
                    <Col xs={24}>
                        <Card
                            title={<Title level={3} style={{ margin: 0 }}>Araç Tipleri</Title>}
                            extra={
                                <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                                    Yeni Ekle
                                </Button>
                            }
                        >
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={onDragEnd}
                            >
                                <SortableContext
                                    items={vehicleTypes.map((i) => i.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <Table
                                        columns={columns}
                                        dataSource={vehicleTypes}
                                        rowKey="id"
                                        loading={loading}
                                        pagination={false} // Pagination and Sortable don't play well together easily
                                        components={{
                                            body: {
                                                row: DraggableRow,
                                            },
                                        }}
                                    />
                                </SortableContext>
                            </DndContext>
                        </Card>
                    </Col>
                </Row>

                <Modal
                    title={editingId ? "Araç Tipi Düzenle" : "Yeni Araç Tipi Ekle"}
                    open={modalVisible}
                    onOk={handleSubmit}
                    onCancel={() => setModalVisible(false)}
                    okText="Kaydet"
                    cancelText="İptal"
                >
                    <Form form={form} layout="vertical">
                        <Form.Item
                            name="name"
                            label="Tip Adı"
                            rules={[{ required: true, message: 'Lütfen tip adı giriniz' }]}
                        >
                            <Input placeholder="Örn: Mercedes Vito VIP" />
                        </Form.Item>

                        <Form.Item
                            name="category"
                            label="Kategori"
                            rules={[{ required: true, message: 'Lütfen kategori seçiniz' }]}
                        >
                            <Select placeholder="Kategori seçiniz">
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
                                    label="Yolcu Kapasitesi"
                                    rules={[{ required: true, message: 'Gerekli' }]}
                                >
                                    <InputNumber min={1} style={{ width: '100%' }} />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    name="luggage"
                                    label="Bagaj Kapasitesi"
                                    rules={[{ required: true, message: 'Gerekli' }]}
                                >
                                    <InputNumber min={0} style={{ width: '100%' }} />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Form.Item label="Fotoğraf">
                            <Upload
                                name="file"
                                listType="picture-card"
                                className="avatar-uploader"
                                showUploadList={false}
                                action={`${(process.env.NEXT_PUBLIC_API_URL || 'https://smarttransfer-backend-production.up.railway.app').replace(/[\r\n]+/g, '').trim()}/api/upload`}
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
                            label="Özellikler"
                        >
                            <Select mode="tags" placeholder="Özellik ekleyin (WiFi, Deri Koltuk vb.)" tokenSeparators={[',']} />
                        </Form.Item>

                        <Form.Item
                            name="description"
                            label="Açıklama"
                        >
                            <TextArea rows={3} />
                        </Form.Item>
                    </Form>
                </Modal>
            </AdminLayout>
        </AdminGuard>
    );
};

export default VehicleTypesPage;
