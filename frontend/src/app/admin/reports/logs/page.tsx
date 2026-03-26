'use client';

import React, { useState, useEffect } from 'react';
import {
  Typography, Card, message, Table, ConfigProvider,
  Tag, Space, Input, DatePicker, Row, Col, Modal, Button, Divider
} from 'antd';
import {
  FileTextOutlined, EyeOutlined, SearchOutlined,
  ReloadOutlined, DatabaseOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import trTR from 'antd/locale/tr_TR';
import 'dayjs/locale/tr';
import apiClient from '@/lib/api-client';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';

dayjs.locale('tr');
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface ActivityLog {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: any;
  ipAddress: string | null;
  createdAt: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const fetchLogs = async (p = page, s = pageSize) => {
    try {
      setLoading(true);
      const params: any = { page: p, limit: s };
      if (search) params.search = search;
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].toISOString();
        params.endDate = dateRange[1].toISOString();
      }

      const res = await apiClient.get('/api/admin/logs', { params });
      if (res.data?.success) {
        setLogs(res.data.data);
        setTotal(res.data.pagination.total);
      } else {
        message.warning(res.data?.error || 'Loglar alınamadı');
      }
    } catch (err: any) {
      if (err.response?.status !== 403) {
        message.error('Bağlantı hatası oluştu');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, dateRange]);

  const handleTableChange = (pagination: any) => {
    setPage(pagination.current);
    setPageSize(pagination.pageSize);
    fetchLogs(pagination.current, pagination.pageSize);
  };

  const showLogDetails = (log: ActivityLog) => {
    setSelectedLog(log);
    setDetailModalVisible(true);
  };

  const getActionColor = (action: string) => {
    if (action.includes('DELETE') || action.includes('CANCEL')) return 'red';
    if (action.includes('CREATE')) return 'green';
    if (action.includes('UPDATE')) return 'blue';
    return 'default';
  };

  const columns = [
    {
      title: 'Tarih',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (val: string) => dayjs(val).format('DD MMM YYYY HH:mm:ss')
    },
    {
      title: 'Kullanıcı',
      dataIndex: 'userEmail',
      key: 'userEmail',
      width: 200,
      render: (val: string) => val || <Text type="secondary">Sistem</Text>
    },
    {
      title: 'İşlem Tipi',
      dataIndex: 'action',
      key: 'action',
      width: 160,
      render: (action: string) => (
        <Tag color={getActionColor(action)}>{action}</Tag>
      )
    },
    {
      title: 'Modül',
      dataIndex: 'entityType',
      key: 'entityType',
      width: 120,
      render: (val: string) => val || '-'
    },
    {
      title: 'Açıklama / Mesaj',
      key: 'message',
      render: (_: any, record: ActivityLog) => {
        let msg = record.details?.message || '-';
        if (msg === '-' && record.details?.payload) {
          msg = "API payload gönderildi";
        }
        return (
          <Text ellipsis style={{ maxWidth: 350, display: 'inline-block' }}>
            {msg}
          </Text>
        );
      }
    },
    {
      title: 'IP Adresi',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      width: 140,
    },
    {
      title: 'Detay',
      key: 'actions',
      width: 90,
      align: 'center' as const,
      render: (_: any, record: ActivityLog) => (
        <Button 
          type="text" 
          icon={<EyeOutlined />} 
          onClick={() => showLogDetails(record)}
        />
      )
    }
  ];

  return (
    <ConfigProvider locale={trTR}>
      <AdminGuard>
        <AdminLayout selectedKey="logs">
          <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <Title level={4} style={{ margin: 0 }}>
                  <DatabaseOutlined style={{ marginRight: 8, color: '#1677ff' }} />
                  Sistem İşlem Logları (Audit Trail)
                </Title>
                <Text type="secondary">Sistemdeki tüm veri değişikliklerini ve kullanıcı hareketlerini anlık takip edin.</Text>
              </div>
              <Button icon={<ReloadOutlined />} onClick={() => fetchLogs()} loading={loading}>
                Yenile
              </Button>
            </div>

            <Card variant="borderless" className="shadow-sm" style={{ marginBottom: 24, borderRadius: 12 }}>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Input
                    placeholder="İşlem adı, kullanıcı e-postası veya mesaj ara..."
                    prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    allowClear
                    size="large"
                  />
                </Col>
                <Col xs={24} md={12}>
                  <RangePicker 
                    style={{ width: '100%' }} 
                    size="large" 
                    onChange={(val: any) => setDateRange(val)}
                  />
                </Col>
              </Row>
            </Card>

            <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 0 } }} style={{ borderRadius: 12, overflow: 'hidden' }}>
              <Table
                columns={columns}
                dataSource={logs}
                rowKey="id"
                loading={loading}
                pagination={{
                  current: page,
                  pageSize: pageSize,
                  total: total,
                  showSizeChanger: true,
                  showTotal: (total) => `Toplam ${total} kayıt`
                }}
                onChange={handleTableChange}
                scroll={{ x: 1000 }}
              />
            </Card>

            <Modal
              title={
                <Space>
                  <FileTextOutlined /> 
                  <span>Log Detayı</span>
                  <Tag color={selectedLog ? getActionColor(selectedLog.action) : 'default'}>
                    {selectedLog?.action}
                  </Tag>
                </Space>
              }
              open={detailModalVisible}
              onCancel={() => setDetailModalVisible(false)}
              footer={null}
              width={800}
            >
              {selectedLog && (
                <div style={{ marginTop: 16 }}>
                  <Row gutter={[16, 16]}>
                    <Col span={12}>
                      <Text type="secondary">İşlemi Yapan:</Text><br />
                      <Text strong>{selectedLog.userEmail || 'Bilinmiyor / Sistem'}</Text>
                    </Col>
                    <Col span={12}>
                      <Text type="secondary">Tarih & Saat:</Text><br />
                      <Text strong>{dayjs(selectedLog.createdAt).format('DD MMMM YYYY, HH:mm:ss')}</Text>
                    </Col>
                    <Col span={12}>
                      <Text type="secondary">Hedef Modül:</Text><br />
                      <Text strong>{selectedLog.entityType || '-'}</Text>
                    </Col>
                    <Col span={12}>
                      <Text type="secondary">Kayıt ID:</Text><br />
                      <Text strong copyable>{selectedLog.entityId || '-'}</Text>
                    </Col>
                    <Col span={24}>
                      <Text type="secondary">Mesaj:</Text><br />
                      <Text strong>{selectedLog.details?.message || '-'}</Text>
                    </Col>
                  </Row>

                  <Divider />

                  {(selectedLog.details?.previousState || selectedLog.details?.payload) && (
                    <>
                      <Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>
                        Veri Paketi (JSON):
                      </Text>
                      <div style={{ 
                        background: '#1e1e1e', 
                        color: '#d4d4d4', 
                        padding: 16, 
                        borderRadius: 8, 
                        fontFamily: 'monospace',
                        maxHeight: 400,
                        overflowY: 'auto',
                        fontSize: 13
                      }}>
                        <pre style={{ margin: 0 }}>
                          {JSON.stringify(
                            selectedLog.details?.previousState || selectedLog.details?.payload || selectedLog.details, 
                            null, 
                            2
                          )}
                        </pre>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Modal>

          </div>
        </AdminLayout>
      </AdminGuard>
    </ConfigProvider>
  );
}
