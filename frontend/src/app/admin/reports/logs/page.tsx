'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Typography, Card, message, Table, ConfigProvider,
  Tag, Space, Input, DatePicker, Row, Col, Modal, Button, Divider,
  Select, Badge, Tooltip, Avatar, Drawer
} from 'antd';
import {
  FileTextOutlined, EyeOutlined, SearchOutlined,
  ReloadOutlined, DatabaseOutlined, DeleteOutlined,
  EditOutlined, PlusCircleOutlined, UserOutlined,
  WarningOutlined, DollarOutlined, ClockCircleOutlined,
  SafetyCertificateOutlined, GlobalOutlined, SwapOutlined,
  ExclamationCircleOutlined, FilterOutlined
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

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; bg: string }> = {
  CREATE: { label: 'Oluşturma', color: '#10b981', icon: <PlusCircleOutlined />, bg: '#ecfdf5' },
  UPDATE: { label: 'Güncelleme', color: '#3b82f6', icon: <EditOutlined />, bg: '#eff6ff' },
  PATCH: { label: 'Değişiklik', color: '#8b5cf6', icon: <SwapOutlined />, bg: '#f5f3ff' },
  DELETE: { label: 'Silme', color: '#ef4444', icon: <DeleteOutlined />, bg: '#fef2f2' },
  CANCEL: { label: 'İptal', color: '#f59e0b', icon: <ExclamationCircleOutlined />, bg: '#fffbeb' },
};

const ENTITY_LABELS: Record<string, string> = {
  'USERS': 'Kullanıcı', 'BOOKINGS': 'Rezervasyon', 'VEHICLES': 'Araç',
  'VEHICLE-TYPES': 'Araç Tipi', 'TENANT': 'Sistem Ayarları', 'AGENCY': 'Acente',
  'DRIVERS': 'Şoför', 'OPERATIONS': 'Operasyon', 'KASA': 'Kasa',
  'TRANSFER': 'Transfer', 'SHUTTLE-ROUTES': 'Shuttle Rota', 'ZONES': 'Bölge',
  'PAYMENT': 'Ödeme', 'AUTH': 'Giriş/Çıkış', 'ADMIN': 'Yönetim',
  'SYSTEM': 'Sistem', 'MESSAGES': 'Mesaj',
};

const PRICE_FIELDS = ['price', 'amount', 'basePrice', 'providerPrice', 'totalPrice', 'fixedPrice', 'commission', 'markup', 'discount'];

function getActionType(action: string): string {
  if (action.includes('DELETE')) return 'DELETE';
  if (action.includes('CANCEL')) return 'CANCEL';
  if (action.includes('CREATE') || action.includes('POST')) return 'CREATE';
  if (action.includes('UPDATE') || action.includes('PUT')) return 'UPDATE';
  if (action.includes('PATCH')) return 'PATCH';
  return 'UPDATE';
}

function getActionConfig(action: string) {
  const type = getActionType(action);
  return ACTION_CONFIG[type] || ACTION_CONFIG.UPDATE;
}

function getEntityLabel(entityType: string | null): string {
  if (!entityType) return 'Sistem';
  const upper = entityType.toUpperCase();
  return ENTITY_LABELS[upper] || entityType;
}

function hasPriceChange(details: any): boolean {
  if (!details) return false;
  if (details.priceChanges && Object.keys(details.priceChanges).length > 0) return true;
  const payload = details.payload;
  if (!payload) return false;
  return PRICE_FIELDS.some(f => payload[f] !== undefined);
}

export default function LogsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [userFilter, setUserFilter] = useState<string>('ALL');
  const [priceOnly, setPriceOnly] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      }
    } catch (err: any) {
      if (err.response?.status !== 403) message.error('Loglar yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1, pageSize);
  }, [search, dateRange]);

  const uniqueUsers = useMemo(() => {
    const emails = new Set(logs.map(l => l.userEmail).filter(Boolean));
    return Array.from(emails).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      if (actionFilter !== 'ALL' && getActionType(l.action) !== actionFilter) return false;
      if (userFilter !== 'ALL' && l.userEmail !== userFilter) return false;
      if (priceOnly && !hasPriceChange(l.details)) return false;
      return true;
    });
  }, [logs, actionFilter, userFilter, priceOnly]);

  const handleTableChange = (pagination: any) => {
    setPage(pagination.current);
    setPageSize(pagination.pageSize);
    fetchLogs(pagination.current, pagination.pageSize);
  };

  const showLogDetails = (log: ActivityLog) => {
    setSelectedLog(log);
    setDrawerOpen(true);
  };

  const stats = useMemo(() => ({
    total: logs.length,
    creates: logs.filter(l => getActionType(l.action) === 'CREATE').length,
    updates: logs.filter(l => ['UPDATE', 'PATCH'].includes(getActionType(l.action))).length,
    deletes: logs.filter(l => ['DELETE', 'CANCEL'].includes(getActionType(l.action))).length,
    priceChanges: logs.filter(l => hasPriceChange(l.details)).length,
  }), [logs]);

  const columns = [
    {
      title: 'Zaman',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (val: string) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
            {dayjs(val).format('DD MMM YYYY')}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            <ClockCircleOutlined style={{ marginRight: 3 }} />
            {dayjs(val).format('HH:mm:ss')}
          </div>
        </div>
      )
    },
    {
      title: 'Kullanıcı',
      dataIndex: 'userEmail',
      key: 'userEmail',
      width: 200,
      render: (val: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar size={28} style={{
            background: val ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#e2e8f0',
            fontSize: 11, fontWeight: 700
          }}>
            {val ? val[0].toUpperCase() : <SafetyCertificateOutlined />}
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {val || 'Sistem'}
            </div>
          </div>
        </div>
      )
    },
    {
      title: 'İşlem',
      dataIndex: 'action',
      key: 'action',
      width: 140,
      render: (action: string) => {
        const cfg = getActionConfig(action);
        return (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: cfg.bg, border: `1px solid ${cfg.color}30`,
            borderRadius: 8, padding: '3px 10px'
          }}>
            <span style={{ color: cfg.color, fontSize: 12 }}>{cfg.icon}</span>
            <span style={{ fontWeight: 600, color: cfg.color, fontSize: 11 }}>{cfg.label}</span>
          </div>
        );
      }
    },
    {
      title: 'Modül',
      dataIndex: 'entityType',
      key: 'entityType',
      width: 130,
      render: (val: string) => (
        <Tag style={{ borderRadius: 6, fontWeight: 600, fontSize: 11 }}>
          {getEntityLabel(val)}
        </Tag>
      )
    },
    {
      title: 'Açıklama',
      key: 'message',
      render: (_: any, record: ActivityLog) => {
        const msg = record.details?.message || '—';
        const isPriceChange = hasPriceChange(record.details);
        return (
          <div>
            <Text ellipsis style={{ maxWidth: 320, display: 'inline-block', fontSize: 12, color: '#334155' }}>
              {msg}
            </Text>
            {isPriceChange && (
              <Tooltip title="Fiyat değişikliği içeriyor">
                <Tag color="warning" style={{ marginLeft: 6, borderRadius: 6, fontSize: 10 }}>
                  <DollarOutlined /> Fiyat
                </Tag>
              </Tooltip>
            )}
            {record.entityId && (
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                ID: {record.entityId.substring(0, 12)}...
              </div>
            )}
          </div>
        );
      }
    },
    {
      title: 'IP',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      width: 110,
      render: (val: string) => (
        <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
          <GlobalOutlined style={{ marginRight: 3 }} />
          {val === '::1' ? 'localhost' : val || '—'}
        </span>
      )
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: any, record: ActivityLog) => (
        <Tooltip title="Detay Görüntüle">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => showLogDetails(record)}
            style={{ color: '#6366f1', borderRadius: 6 }}
          />
        </Tooltip>
      )
    }
  ];

  // Detail drawer helpers
  const renderPayloadField = (key: string, value: any) => {
    if (value === null || value === undefined) return null;
    const isPriceField = PRICE_FIELDS.includes(key);
    const isStatusField = ['status', 'isActive', 'role'].includes(key);
    const isSensitive = key === 'password' || key === 'passwordHash';

    return (
      <div key={key} style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 0', borderBottom: '1px solid #f1f5f9'
      }}>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{key}</span>
        <span style={{
          fontSize: 12, fontWeight: 600, fontFamily: typeof value === 'number' ? 'monospace' : 'inherit',
          color: isPriceField ? '#ef4444' : isStatusField ? '#6366f1' : isSensitive ? '#94a3b8' : '#1e293b',
          background: isPriceField ? '#fef2f2' : isStatusField ? '#eef2ff' : 'transparent',
          padding: isPriceField || isStatusField ? '1px 8px' : '0',
          borderRadius: 4
        }}>
          {typeof value === 'object' ? JSON.stringify(value) :
            typeof value === 'boolean' ? (value ? 'Evet' : 'Hayır') : String(value)}
        </span>
      </div>
    );
  };

  return (
    <ConfigProvider locale={trTR}>
      <AdminGuard>
        <AdminLayout selectedKey="logs">
          <div style={{ padding: '0 24px 24px 24px', maxWidth: 1400 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 22, boxShadow: '0 4px 14px #6366f140'
                }}><DatabaseOutlined /></div>
                <div>
                  <Title level={3} style={{ margin: 0, color: '#1e293b' }}>Sistem İşlem Logları</Title>
                  <Text style={{ color: '#94a3b8', fontSize: 13 }}>
                    Tüm veri değişikliklerini ve kullanıcı hareketlerini takip edin
                  </Text>
                </div>
              </div>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => fetchLogs()}
                loading={loading}
                style={{ borderRadius: 8 }}
              >Yenile</Button>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Toplam Log', value: stats.total, color: '#6366f1', icon: <DatabaseOutlined />, key: 'total' },
                { label: 'Oluşturma', value: stats.creates, color: '#10b981', icon: <PlusCircleOutlined />, key: 'CREATE' },
                { label: 'Güncelleme', value: stats.updates, color: '#3b82f6', icon: <EditOutlined />, key: 'UPDATE' },
                { label: 'Silme / İptal', value: stats.deletes, color: '#ef4444', icon: <DeleteOutlined />, key: 'DELETE' },
                { label: 'Fiyat Değişikliği', value: stats.priceChanges, color: '#f59e0b', icon: <DollarOutlined />, key: 'price' },
              ].map((s, i) => {
                const isActive = (s.key === 'price' && priceOnly) ||
                  (s.key === 'total' && actionFilter === 'ALL' && !priceOnly) ||
                  (s.key !== 'total' && s.key !== 'price' && actionFilter === s.key);
                return (
                <div key={i} style={{
                  background: isActive ? `linear-gradient(135deg, ${s.color}20, ${s.color}30)` : `linear-gradient(135deg, ${s.color}08, ${s.color}15)`,
                  border: `1px solid ${isActive ? s.color + '60' : s.color + '25'}`, borderRadius: 12, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  transition: 'all 0.2s', boxShadow: isActive ? `0 2px 8px ${s.color}30` : 'none'
                }} onClick={() => {
                  if (s.key === 'price') {
                    setPriceOnly(!priceOnly);
                    setActionFilter('ALL');
                  } else if (s.key === 'total') {
                    setActionFilter('ALL');
                    setPriceOnly(false);
                  } else {
                    setActionFilter(actionFilter === s.key ? 'ALL' : s.key);
                    setPriceOnly(false);
                  }
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, background: `${s.color}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: s.color, fontSize: 16
                  }}>{s.icon}</div>
                  <div>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{s.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>{s.value}</div>
                  </div>
                </div>
              )})}
            </div>

            {/* Filters */}
            <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 16 }} bodyStyle={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <Input
                  prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                  placeholder="Kullanıcı, işlem veya mesaj ara..."
                  style={{ width: 280, borderRadius: 8 }}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  allowClear
                />
                <Select
                  value={actionFilter}
                  style={{ width: 160 }}
                  onChange={(val) => { setActionFilter(val); if (val !== 'ALL') setPriceOnly(false); }}
                  options={[
                    { value: 'ALL', label: 'Tüm İşlemler' },
                    { value: 'CREATE', label: '🟢 Oluşturma' },
                    { value: 'UPDATE', label: '🔵 Güncelleme' },
                    { value: 'DELETE', label: '🔴 Silme' },
                    { value: 'PATCH', label: '🟣 Değişiklik' },
                  ]}
                />
                <Select
                  value={userFilter}
                  style={{ width: 200 }}
                  onChange={setUserFilter}
                  showSearch
                  optionFilterProp="label"
                  placeholder="Kullanıcı Filtresi"
                  options={[
                    { value: 'ALL', label: '👥 Tüm Kullanıcılar' },
                    ...uniqueUsers.map(email => ({ value: email, label: email }))
                  ]}
                />
                {priceOnly && (
                  <Tag color="warning" closable onClose={() => setPriceOnly(false)} style={{ borderRadius: 6, margin: 0, height: 28, display: 'flex', alignItems: 'center' }}>
                    <DollarOutlined /> Fiyat Değişiklikleri
                  </Tag>
                )}
                <RangePicker
                  style={{ borderRadius: 8 }}
                  onChange={(val: any) => setDateRange(val)}
                  placeholder={['Başlangıç', 'Bitiş']}
                />
                <div style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>
                  {filteredLogs.length} / {total} kayıt
                </div>
              </div>
            </Card>

            {/* Table */}
            <Card style={{ borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,0.03)' }} bodyStyle={{ padding: 0 }}>
              <Table
                columns={columns}
                dataSource={filteredLogs}
                rowKey="id"
                loading={loading}
                size="middle"
                pagination={{
                  current: page,
                  pageSize: pageSize,
                  total: total,
                  showSizeChanger: true,
                  showTotal: (t, range) => `${range[0]}-${range[1]} / ${t} kayıt`,
                  style: { padding: '12px 16px', margin: 0 }
                }}
                onChange={handleTableChange}
                scroll={{ x: 1000 }}
                rowClassName={(record) => {
                  if (getActionType(record.action) === 'DELETE') return '';
                  return '';
                }}
              />
            </Card>

            {/* Detail Drawer */}
            <Drawer
              title={
                selectedLog ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: `linear-gradient(135deg, ${getActionConfig(selectedLog.action).color}, ${getActionConfig(selectedLog.action).color}cc)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 16
                    }}>{getActionConfig(selectedLog.action).icon}</div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
                        {getActionConfig(selectedLog.action).label} — {getEntityLabel(selectedLog.entityType)}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {dayjs(selectedLog.createdAt).format('DD MMMM YYYY, HH:mm:ss')}
                      </div>
                    </div>
                  </div>
                ) : 'Log Detayı'
              }
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              styles={{ wrapper: { width: 520 } }}
            >
              {selectedLog && (
                <div>
                  {/* Meta Info */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                    {[
                      { label: 'Kullanıcı', value: selectedLog.userEmail || 'Sistem', icon: <UserOutlined /> },
                      { label: 'IP Adresi', value: selectedLog.ipAddress === '::1' ? 'localhost' : (selectedLog.ipAddress || '—'), icon: <GlobalOutlined /> },
                      { label: 'Modül', value: getEntityLabel(selectedLog.entityType), icon: <DatabaseOutlined /> },
                      { label: 'Kayıt ID', value: selectedLog.entityId || '—', icon: <FileTextOutlined /> },
                    ].map((item, i) => (
                      <div key={i} style={{
                        background: '#f8fafc', borderRadius: 10, padding: '10px 14px',
                        border: '1px solid #e2e8f0'
                      }}>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginBottom: 2 }}>
                          {item.icon} {item.label}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', wordBreak: 'break-all' }}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Message */}
                  <div style={{
                    background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10,
                    padding: '12px 16px', marginBottom: 20
                  }}>
                    <div style={{ fontSize: 10, color: '#0369a1', fontWeight: 600, marginBottom: 4 }}>AÇIKLAMA</div>
                    <div style={{ fontSize: 13, color: '#0c4a6e', fontWeight: 500 }}>
                      {selectedLog.details?.message || 'Detay yok'}
                    </div>
                  </div>

                  {/* Price Changes */}
                  {selectedLog.details?.priceChanges && Object.keys(selectedLog.details.priceChanges).length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <WarningOutlined /> FİYAT DEĞİŞİKLİKLERİ
                      </div>
                      <div style={{
                        background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
                        padding: '12px 16px'
                      }}>
                        {Object.entries(selectedLog.details.priceChanges).map(([field, change]: [string, any]) => (
                          <div key={field} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '6px 0', borderBottom: '1px solid #fde8e8'
                          }}>
                            <span style={{ fontSize: 12, color: '#991b1b', fontWeight: 600 }}>{field}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {change.old !== null && (
                                <span style={{
                                  fontSize: 12, color: '#dc2626', textDecoration: 'line-through',
                                  fontFamily: 'monospace', background: '#fee2e2', padding: '1px 6px', borderRadius: 4
                                }}>{change.old}</span>
                              )}
                              <span style={{ color: '#94a3b8' }}>→</span>
                              <span style={{
                                fontSize: 12, color: '#059669', fontWeight: 700,
                                fontFamily: 'monospace', background: '#d1fae5', padding: '1px 6px', borderRadius: 4
                              }}>{change.new}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Previous State */}
                  {selectedLog.details?.previousState && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ClockCircleOutlined /> ÖNCEKİ DURUM
                      </div>
                      <div style={{
                        background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
                        padding: '12px 16px'
                      }}>
                        {typeof selectedLog.details.previousState === 'object' ?
                          Object.entries(selectedLog.details.previousState).map(([k, v]) => renderPayloadField(k, v)) :
                          <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(selectedLog.details.previousState, null, 2)}</pre>
                        }
                      </div>
                    </div>
                  )}

                  {/* Payload */}
                  {selectedLog.details?.payload && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FileTextOutlined /> GÖNDERİLEN VERİ
                      </div>
                      <div style={{
                        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
                        padding: '12px 16px'
                      }}>
                        {typeof selectedLog.details.payload === 'object' ?
                          Object.entries(selectedLog.details.payload)
                            .filter(([, v]) => v !== undefined && v !== null)
                            .slice(0, 30)
                            .map(([k, v]) => renderPayloadField(k, v)) :
                          <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(selectedLog.details.payload, null, 2)}</pre>
                        }
                      </div>
                    </div>
                  )}

                  {/* Raw JSON */}
                  <Divider style={{ margin: '16px 0' }} />
                  <details>
                    <summary style={{ cursor: 'pointer', fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 8 }}>
                      Ham JSON Verisi
                    </summary>
                    <div style={{
                      background: '#1e293b', color: '#e2e8f0', padding: 14, borderRadius: 10,
                      fontFamily: 'monospace', fontSize: 11, maxHeight: 300, overflowY: 'auto'
                    }}>
                      <pre style={{ margin: 0 }}>
                        {JSON.stringify(selectedLog.details, null, 2)}
                      </pre>
                    </div>
                  </details>
                </div>
              )}
            </Drawer>

          </div>
        </AdminLayout>
      </AdminGuard>
    </ConfigProvider>
  );
}
