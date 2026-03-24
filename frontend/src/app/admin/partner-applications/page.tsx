'use client';

import React, { useEffect, useState } from 'react';
import { Table, Card, Tag, Button, Typography, message, Space, Avatar } from 'antd';
import apiClient from '@/lib/api-client';
import AdminLayout from '../AdminLayout';
import { CheckOutlined, CloseOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title } = Typography;

interface Application {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    status: string;
    createdAt: string;
    vehicles: {
        plateNumber: string;
        brand: string;
        model: string;
        year: number;
        vehicleType: {
            name: string;
        }
    }[];
}

const PartnerApplicationsPage = () => {
    const [data, setData] = useState<Application[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get('/api/admin/partner-applications');
            if (res.data.success) {
                setData(res.data.data);
            }
        } catch (err) {
            console.error(err);
            message.error('Veriler yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const columns = [
        {
            title: 'Sürücü',
            key: 'driver',
            render: (text: any, record: Application) => (
                <Space>
                    <Avatar icon={<UserOutlined />} />
                    <div>
                        <div style={{ fontWeight: 600 }}>{record.firstName} {record.lastName}</div>
                        <div style={{ fontSize: 12, color: '#888' }}>{dayjs(record.createdAt).format('DD.MM.YYYY')}</div>
                    </div>
                </Space>
            )
        },
        {
            title: 'İletişim',
            key: 'contact',
            render: (text: any, record: Application) => (
                <div>
                    <div>{record.email}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{record.phone}</div>
                </div>
            )
        },
        {
            title: 'Araç Bilgisi',
            key: 'vehicle',
            width: 250,
            render: (text: any, record: Application) => {
                if (!record.vehicles || record.vehicles.length === 0) return <Tag color="red">Araç Yok</Tag>;
                const v = record.vehicles[0]; // Assuming one vehicle for now
                return (
                    <div style={{ padding: 4, background: '#f5f5f5', borderRadius: 4 }}>
                        <div style={{ fontWeight: 'bold' }}>{v.plateNumber}</div>
                        <div style={{ fontSize: 13 }}>{v.brand} {v.model} ({v.year})</div>
                        <Tag color="geekblue" style={{ marginTop: 4 }}>{v.vehicleType?.name}</Tag>
                    </div>
                );
            }
        },
        {
            title: 'Durum',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => {
                let color = 'default';
                if (status === 'ACTIVE') color = 'success';
                if (status === 'PENDING') color = 'processing';
                return <Tag color={color}>{status}</Tag>;
            }
        },
        {
            title: 'İşlemler',
            key: 'actions',
            render: (text: any, record: Application) => (
                <Space>
                    <Button size="small" type="primary" icon={<CheckOutlined />}>Onayla</Button>
                    <Button size="small" danger icon={<CloseOutlined />}>Reddet</Button>
                </Space>
            )
        }
    ];

    return (
        <AdminLayout selectedKey="partner-applications">
            <Card bordered={false}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div>
                        <Title level={4} style={{ margin: 0 }}>Partner Sürücü Başvuruları</Title>
                        <Typography.Text type="secondary">Onay bekleyen ve aktif sürücü partner listesi</Typography.Text>
                    </div>
                    <Button onClick={fetchData}>Yenile</Button>
                </div>
                <Table
                    dataSource={data}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                />
            </Card>
        </AdminLayout>
    );
};

export default PartnerApplicationsPage;
