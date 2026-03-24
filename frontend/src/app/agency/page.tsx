'use client';

import React from 'react';
import { Card, Typography, Row, Col, Statistic, Alert } from 'antd';
import { ShopOutlined, TeamOutlined, CarOutlined, DollarOutlined } from '@ant-design/icons';
import AgencyGuard from './AgencyGuard';
import AgencyLayout from './AgencyLayout';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

const AgencyDashboard = () => {
    const { user } = useAuth();

    return (
        <AgencyGuard>
            <AgencyLayout selectedKey="dashboard">
                <Typography.Title level={3}>Hoş Geldiniz, {user?.fullName}</Typography.Title>
                <Typography.Text type="secondary">
                    B2B Acente Paneline hoş geldiniz. Buradan transfer taleplerinizi ve personellerinizi yönetebilirsiniz.
                </Typography.Text>

                <Alert
                    message="Bilgilendirme"
                    description="Acente paneli üzerinden yaptığınız tüm transfer talepleri, tarafımızca onaylandıktan sonra araca atanacaktır."
                    type="info"
                    showIcon
                    style={{ marginTop: 24, marginBottom: 24 }}
                />

                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} md={6}>
                        <Card variant="borderless" style={{ background: '#e6f7ff', borderRadius: 8 }}>
                            <Statistic
                                title="Toplam Transfer"
                                value={12}
                                valueStyle={{ color: '#1890ff' }}
                                prefix={<CarOutlined />}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        <Card variant="borderless" style={{ background: '#f6ffed', borderRadius: 8 }}>
                            <Statistic
                                title="Toplam Satış (TRY)"
                                value={4500.00}
                                precision={2}
                                valueStyle={{ color: '#52c41a' }}
                                prefix={<DollarOutlined />}
                            />
                        </Card>
                    </Col>
                    {user?.role?.type === 'AGENCY_ADMIN' && (
                        <Col xs={24} sm={12} md={6}>
                            <Card variant="borderless" style={{ background: '#fff0f6', borderRadius: 8 }}>
                                <Statistic
                                    title="Personel Sayısı"
                                    value={3}
                                    valueStyle={{ color: '#eb2f96' }}
                                    prefix={<TeamOutlined />}
                                />
                            </Card>
                        </Col>
                    )}
                </Row>
            </AgencyLayout>
        </AgencyGuard>
    );
};

export default AgencyDashboard;
