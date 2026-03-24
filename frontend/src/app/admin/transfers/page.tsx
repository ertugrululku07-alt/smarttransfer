'use client';

import React, { useState, useEffect } from 'react';
import {
    Table,
    Tag,
    Space,
    Button,
    Input,
    Typography,
    Card,
    Tooltip,
    Modal,
    Descriptions,
    message,
    Dropdown,
    MenuProps
} from 'antd';
import {
    SearchOutlined,
    EyeOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    CarOutlined,
    CalendarOutlined,
    UserOutlined,
    PhoneOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    TeamOutlined,
    MoreOutlined,
    DownOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';

const { Title, Text } = Typography;

interface Booking {
    id: string;
    bookingNumber: string;
    vehicleType: string;
    pickup: string;
    dropoff: string;
    pickupDateTime: string;
    passengerName: string;
    passengerPhone: string;
    price: number;
    status: string;
    paymentStatus: string;
    createdAt: string;
    notes?: string;
    flightNumber?: string;
    operationalStatus?: string; // Added
    metadata?: any;
}

const EnvironmentItem = ({ text, color }: { text: string, color: string }) => (
    <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color === 'green' ? '#52c41a' : '#f5222d', marginRight: 8 }} />
        {text}
    </div>
);

const TransfersPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [searchText, setSearchText] = useState('');
    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
    const [detailModalVisible, setDetailModalVisible] = useState(false);

    useEffect(() => {
        fetchBookings();
    }, []);

    const fetchBookings = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/transfer/bookings');
            if (res.data.success) {
                setBookings(res.data.data);
            }
        } catch (error) {
            console.error('Fetch error:', error);
            message.error('Rezervasyonlar yüklenemedi');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (id: string, status: string, subStatus?: string) => {
        try {
            const res = await apiClient.put(`/api/transfer/bookings/${id}/status`, { status, subStatus });
            if (res.data.success) {
                message.success(subStatus ? `Durum güncellendi: ${subStatus === 'IN_OPERATION' ? 'Operasyona Aktarıldı' : 'Havuza Aktarıldı'}` : 'Durum güncellendi');
                fetchBookings(); // Refresh list
                if (selectedBooking && selectedBooking.id === id) {
                    setDetailModalVisible(false); // Close modal if open
                }
            }
        } catch (error) {
            console.error('Update status error:', error);
            message.error('İşlem başarısız');
        }
    };

    const handleViewDetail = (record: Booking) => {
        setSelectedBooking(record);
        setDetailModalVisible(true);
    };

    const statusColors: Record<string, string> = {
        PENDING: 'orange',
        CONFIRMED: 'green',
        COMPLETED: 'blue',
        CANCELLED: 'red',
        NO_SHOW: 'purple'
    };

    const columns = [
        {
            title: 'No',
            dataIndex: 'bookingNumber',
            key: 'bookingNumber',
            render: (text: string) => <Text strong>{text}</Text>,
        },
        {
            title: 'Tarih',
            dataIndex: 'pickupDateTime',
            key: 'pickupDateTime',
            render: (date: string) => (
                <Space direction="vertical" size={0}>
                    <Text>{dayjs(date).format('DD.MM.YYYY')}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(date).format('HH:mm')}</Text>
                </Space>
            ),
            sorter: (a: Booking, b: Booking) => dayjs(a.pickupDateTime).unix() - dayjs(b.pickupDateTime).unix(),
        },
        {
            title: 'Acente',
            key: 'agency',
            render: (_: any, record: any) => {
                const name = record.agencyName || record.agency?.name || record.partnerName || record.metadata?.agencyName || record.metadata?.partnerName || 'Direkt';
                return <Text strong>{name}</Text>;
            },
        },
        {
            title: 'Yolcu',
            dataIndex: 'passengerName',
            key: 'passengerName',
            render: (text: string, record: Booking) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{text}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{record.passengerPhone}</Text>
                </Space>
            ),
        },
        {
            title: 'Rota',
            key: 'route',
            render: (_: any, record: Booking) => (
                <div style={{ maxWidth: 250 }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#52c41a', marginRight: 8 }} />
                        <Text ellipsis>{record.metadata?.pickup || 'Belirtilmedi'}</Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f5222d', marginRight: 8 }} />
                        <Text ellipsis>{record.metadata?.dropoff || 'Belirtilmedi'}</Text>
                    </div>
                </div>
            ),
        },
        {
            title: 'Araç',
            key: 'vehicleType',
            render: (_: any, record: Booking) => {
                const type = record.metadata?.vehicleType || 'Bilinmiyor';
                return <Tag icon={<CarOutlined />}>{type}</Tag>;
            }
        },
        {
            title: 'Tutar',
            dataIndex: 'price',
            key: 'price',
            render: (price: number) => <Text strong>₺{price}</Text>,
        },
        {
            title: 'Durum',
            dataIndex: 'status',
            key: 'status',
            render: (status: string, record: Booking) => {
                // Determine display logic based on operationalStatus if CONFIRMED
                let displayStatus = status;
                let color = statusColors[status] || 'default';

                if (status === 'CONFIRMED') {
                    if (record.operationalStatus === 'IN_OPERATION') {
                        displayStatus = 'OPERASYONDA';
                        color = 'cyan';
                    } else if (record.operationalStatus === 'IN_POOL') {
                        displayStatus = 'HAVUZDA';
                        color = 'geekblue';
                    }
                }

                return (
                    <Tag color={color}>
                        {displayStatus}
                    </Tag>
                );
            },
            filters: [
                { text: 'Pending', value: 'PENDING' },
                { text: 'Confirmed', value: 'CONFIRMED' },
                { text: 'Cancelled', value: 'CANCELLED' },
            ],
            onFilter: (value: any, record: Booking) => record.status === value,
        },
        {
            title: 'İşlem',
            key: 'action',
            render: (_: any, record: Booking) => (
                <Space size="small">
                    <Tooltip title="Detaylar">
                        <Button
                            type="text"
                            icon={<EyeOutlined />}
                            onClick={() => handleViewDetail(record)}
                        />
                    </Tooltip>

                    {record.status === 'PENDING' && (
                        <>
                            <Dropdown
                                menu={{
                                    items: [
                                        {
                                            key: 'op',
                                            label: 'Onayla & Operasyona Aktar',
                                            icon: <SafetyCertificateOutlined />,
                                            onClick: () => handleUpdateStatus(record.id, 'CONFIRMED', 'IN_OPERATION')
                                        },
                                        {
                                            key: 'pool',
                                            label: 'Onayla & Havuza Aktar',
                                            icon: <TeamOutlined />,
                                            onClick: () => handleUpdateStatus(record.id, 'CONFIRMED', 'IN_POOL')
                                        }
                                    ]
                                }}
                            >
                                <Button
                                    type="text"
                                    icon={<CheckCircleOutlined />}
                                    style={{ color: '#52c41a' }}
                                />
                            </Dropdown>
                            <Tooltip title="İptal Et">
                                <Button
                                    type="text"
                                    icon={<CloseCircleOutlined />}
                                    style={{ color: '#f5222d' }}
                                    onClick={() => handleUpdateStatus(record.id, 'CANCELLED')}
                                />
                            </Tooltip>
                        </>
                    )}

                    {record.status === 'CONFIRMED' && (
                        <Tooltip title="Tamamlandı İşaretle">
                            <Button
                                type="text"
                                icon={<CheckCircleOutlined />}
                                style={{ color: '#1890ff' }}
                                onClick={() => handleUpdateStatus(record.id, 'COMPLETED')}
                            />
                        </Tooltip>
                    )}
                </Space>
            ),
        },
    ];

    const filteredBookings = bookings.filter(b =>
        b.bookingNumber.toLowerCase().includes(searchText.toLowerCase()) ||
        b.passengerName.toLowerCase().includes(searchText.toLowerCase())
    );

    return (
        <AdminGuard>
            <AdminLayout selectedKey="transfers">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <Title level={2} style={{ margin: 0 }}>Transfer Rezervasyonları</Title>
                    <Space>
                        <Input
                            placeholder="Ara (No, İsim)"
                            prefix={<SearchOutlined />}
                            onChange={e => setSearchText(e.target.value)}
                            style={{ width: 250 }}
                        />
                        <Button icon={<ReloadOutlined />} onClick={fetchBookings}>Yenile</Button>
                        <Button type="primary" icon={<CarOutlined />}>Yeni Transfer</Button>
                    </Space>
                </div>

                <Card styles={{ body: { padding: 0 } }} bordered={false}>
                    <Table
                        columns={columns}
                        dataSource={filteredBookings}
                        rowKey="id"
                        loading={loading}
                        pagination={{ pageSize: 10 }}
                    />
                </Card>

                {/* Detail Modal */}
                <Modal
                    title={`Rezervasyon Detayı - ${selectedBooking?.bookingNumber}`}
                    open={detailModalVisible}
                    onCancel={() => setDetailModalVisible(false)}
                    footer={[
                        <Button key="close" onClick={() => setDetailModalVisible(false)}>
                            Kapat
                        </Button>,
                        <Button key="print" type="primary" onClick={() => window.print()}>
                            Yazdır
                        </Button>
                    ]}
                    width={700}
                >
                    {selectedBooking && (
                        <Space direction="vertical" size="large" style={{ width: '100%' }}>

                            <Descriptions title="Rezervasyon Bilgileri" bordered column={2}>
                                <Descriptions.Item label="Rezervasyon No">{selectedBooking.bookingNumber}</Descriptions.Item>
                                <Descriptions.Item label="Oluşturulma">{dayjs(selectedBooking.createdAt).format('DD.MM.YYYY HH:mm')}</Descriptions.Item>
                                <Descriptions.Item label="Durum">
                                    <Tag color={statusColors[selectedBooking.status]}>{selectedBooking.status}</Tag>
                                </Descriptions.Item>
                                <Descriptions.Item label="Ödeme">
                                    <Tag color={selectedBooking.paymentStatus === 'PAID' ? 'green' : 'orange'}>
                                        {selectedBooking.paymentStatus}
                                    </Tag>
                                </Descriptions.Item>
                            </Descriptions>

                            <Descriptions title="Transfer Detayları" bordered column={1}>
                                {(selectedBooking as any).agencyName || selectedBooking.metadata?.agencyName ? (
                                    <Descriptions.Item label="Acente">
                                        <Text strong>{(selectedBooking as any).agencyName || selectedBooking.metadata?.agencyName}</Text>
                                    </Descriptions.Item>
                                ) : null}
                                <Descriptions.Item label="Alış Noktası">
                                    <EnvironmentItem text={selectedBooking.pickup} color="green" />
                                </Descriptions.Item>
                                <Descriptions.Item label="Bırakış Noktası">
                                    <EnvironmentItem text={selectedBooking.dropoff} color="red" />
                                </Descriptions.Item>
                                <Descriptions.Item label="Tarih & Saat">
                                    <CalendarOutlined /> {dayjs(selectedBooking.pickupDateTime).format('DD MMMM YYYY')} - {dayjs(selectedBooking.pickupDateTime).format('HH:mm')}
                                </Descriptions.Item>
                                <Descriptions.Item label="Araç Tipi">
                                    <CarOutlined /> {selectedBooking.vehicleType}
                                </Descriptions.Item>
                            </Descriptions>

                            <Descriptions title="Yolcu Bilgileri" bordered column={2}>
                                <Descriptions.Item label="Ad Soyad">
                                    <UserOutlined /> {selectedBooking.passengerName}
                                </Descriptions.Item>
                                <Descriptions.Item label="Telefon">
                                    <PhoneOutlined /> {selectedBooking.passengerPhone}
                                </Descriptions.Item>
                                <Descriptions.Item label="Uçuş No">{selectedBooking.flightNumber || '-'}</Descriptions.Item>
                                <Descriptions.Item label="Notlar">{selectedBooking.notes || '-'}</Descriptions.Item>
                            </Descriptions>

                            <div style={{ textAlign: 'right', marginTop: 16 }}>
                                <Text type="secondary">Toplam Tutar</Text>
                                <Title level={3} style={{ margin: 0, color: '#667eea' }}>₺{selectedBooking.price}</Title>
                            </div>

                            {/* Quick Actions inside Modal */}
                            {selectedBooking.status === 'PENDING' && (
                                <div style={{ borderTop: '1px solid #eee', paddingTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                    <Button danger onClick={() => handleUpdateStatus(selectedBooking.id, 'CANCELLED')}>Reddet / İptal</Button>
                                    <Button
                                        type="primary"
                                        onClick={() => handleUpdateStatus(selectedBooking.id, 'CONFIRMED', 'IN_POOL')}
                                        style={{ background: '#1890ff', borderColor: '#1890ff' }}
                                        icon={<TeamOutlined />}
                                    >
                                        Havuza Aktar
                                    </Button>
                                    <Button
                                        type="primary"
                                        onClick={() => handleUpdateStatus(selectedBooking.id, 'CONFIRMED', 'IN_OPERATION')}
                                        style={{ background: '#52c41a', borderColor: '#52c41a' }}
                                        icon={<SafetyCertificateOutlined />}
                                    >
                                        Operasyona Aktar
                                    </Button>
                                </div>
                            )}

                        </Space>
                    )}
                </Modal>
            </AdminLayout>
        </AdminGuard>
    );
};

export default TransfersPage;
