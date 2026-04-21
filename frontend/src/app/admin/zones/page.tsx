'use client';

import React, { useEffect, useState } from 'react';
import {
  Typography, Button, Modal, Form, Input, ColorPicker,
  message, Popconfirm, Spin, Tag, Badge, Alert, Row, Col, Divider, Table, Switch, Tooltip
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  EnvironmentOutlined, SearchOutlined,
  CodeOutlined, AimOutlined, SwapOutlined,
  UnorderedListOutlined, AppstoreOutlined, CheckCircleFilled, CloseCircleFilled,
  GlobalOutlined
} from '@ant-design/icons';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import apiClient from '@/lib/api-client';
import AdminMapPickerModal from '../components/AdminMapPickerModal';
import dynamic from 'next/dynamic';

const AllZonesMap = dynamic(() => import('../components/AllZonesMap'), {
    ssr: false,
    loading: () => (
        <div style={{ height: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRadius: 16 }}>
            <Spin size="large" />
        </div>
    )
});

const { Text } = Typography;

interface Zone {
  id: string;
  name: string;
  code: string | null;
  keywords: string | null;
  color: string | null;
  polygon: { lat: number; lng: number }[] | null;
  createdAt: string;
}

const ZonesPage: React.FC = () => {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [form] = Form.useForm();
  const [currentPolygon, setCurrentPolygon] = useState<{lat: number, lng: number}[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'map'>('list');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [zonesRes, infoRes] = await Promise.all([
        apiClient.get('/api/zones'),
        apiClient.get('/api/tenant/info')
      ]);
      if (zonesRes.data.success) setZones(zonesRes.data.data);
    } catch (err) {
      console.error(err);
      message.error('Veriler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleNewZone = () => {
    setEditingZone(null);
    setCurrentPolygon([]);
    form.resetFields();
    form.setFieldsValue({ color: '#3388ff' });
    setModalVisible(true);
  };

  const handleEditZone = (zone: Zone) => {
    setEditingZone(zone);
    setCurrentPolygon(zone.polygon || []);
    form.setFieldsValue({
      name: zone.name,
      code: zone.code || '',
      keywords: zone.keywords || '',
      color: zone.color || '#3388ff',
    });
    setModalVisible(true);
  };

  const handleDeleteZone = async (id: string) => {
    try {
      const res = await apiClient.delete(`/api/zones/${id}`);
      if (res.data.success) { message.success('Bölge silindi'); fetchData(); }
    } catch (err) { message.error('Bölge silinirken hata oluştu'); }
  };

  const handleZoneSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        name: values.name,
        code: values.code?.trim().toUpperCase() || null,
        keywords: values.keywords?.trim() || null,
        color: typeof values.color === 'string' ? values.color : values.color?.toHexString?.() || '#3388ff',
        polygon: currentPolygon.length >= 3 ? currentPolygon : null,
      };
      if (editingZone) {
        const res = await apiClient.put(`/api/zones/${editingZone.id}`, payload);
        if (res.data.success) message.success('Bölge güncellendi');
      } else {
        const res = await apiClient.post('/api/zones', payload);
        if (res.data.success) message.success('Yeni bölge eklendi');
      }
      setModalVisible(false);
      fetchData();
    } catch (err) { console.error(err); message.error('Kaydedilirken hata oluştu'); }
  };

  // ── View Toggle Button ──
  const ViewToggle = () => (
    <div style={{
      display: 'flex', gap: 2, padding: 3, borderRadius: 10,
      background: '#f1f5f9', border: '1px solid #e2e8f0',
    }}>
      <Tooltip title="Liste Görünümü">
        <button
          onClick={() => setViewMode('list')}
          style={{
            border: 'none', cursor: 'pointer', padding: '6px 12px', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 6,
            background: viewMode === 'list' ? '#fff' : 'transparent',
            boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            color: viewMode === 'list' ? '#6366f1' : '#94a3b8',
            fontWeight: 600, fontSize: 13, transition: 'all 0.2s',
          }}
        >
          <UnorderedListOutlined style={{ fontSize: 14 }} />
        </button>
      </Tooltip>
      <Tooltip title="Kart Görünümü">
        <button
          onClick={() => setViewMode('grid')}
          style={{
            border: 'none', cursor: 'pointer', padding: '6px 12px', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 6,
            background: viewMode === 'grid' ? '#fff' : 'transparent',
            boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            color: viewMode === 'grid' ? '#6366f1' : '#94a3b8',
            fontWeight: 600, fontSize: 13, transition: 'all 0.2s',
          }}
        >
          <AppstoreOutlined style={{ fontSize: 14 }} />
        </button>
      </Tooltip>
      <Tooltip title="Harita Görünümü">
        <button
          onClick={() => setViewMode('map')}
          style={{
            border: 'none', cursor: 'pointer', padding: '6px 12px', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 6,
            background: viewMode === 'map' ? '#fff' : 'transparent',
            boxShadow: viewMode === 'map' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            color: viewMode === 'map' ? '#6366f1' : '#94a3b8',
            fontWeight: 600, fontSize: 13, transition: 'all 0.2s',
          }}
        >
          <GlobalOutlined style={{ fontSize: 14 }} />
        </button>
      </Tooltip>
    </div>
  );

  // ── List View Columns ──
  const listColumns = [
    {
      title: '',
      dataIndex: 'color',
      key: 'color',
      width: 6,
      render: (color: string) => (
        <div style={{ width: 4, height: 40, borderRadius: 4, background: color || '#3388ff' }} />
      ),
    },
    {
      title: 'BÖLGE ADI',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Zone) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: `${record.color || '#3388ff'}14`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1.5px solid ${record.color || '#3388ff'}30`,
            flexShrink: 0,
          }}>
            <EnvironmentOutlined style={{ fontSize: 16, color: record.color || '#3388ff' }} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.3 }}>{name}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              {new Date(record.createdAt).toLocaleDateString('tr-TR')}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'KOD',
      dataIndex: 'code',
      key: 'code',
      width: 100,
      render: (code: string | null) => code ? (
        <Tag style={{
          borderRadius: 6, fontWeight: 700, fontSize: 11, margin: 0,
          background: '#e0e7ff', color: '#4f46e5', border: 'none', fontFamily: 'monospace',
          padding: '2px 10px',
        }}>
          {code}
        </Tag>
      ) : <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>,
    },
    {
      title: 'ANAHTAR KELİMELER',
      dataIndex: 'keywords',
      key: 'keywords',
      render: (keywords: string | null) => keywords ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {keywords.split(',').filter(Boolean).slice(0, 3).map((kw, i) => (
            <Tag key={i} style={{
              borderRadius: 6, fontSize: 11, fontWeight: 500, margin: 0,
              background: '#f1f5f9', color: '#475569', border: 'none', padding: '1px 8px',
            }}>
              {kw.trim()}
            </Tag>
          ))}
          {keywords.split(',').filter(Boolean).length > 3 && (
            <Tag style={{
              borderRadius: 6, fontSize: 11, fontWeight: 600, margin: 0,
              background: '#e0e7ff', color: '#6366f1', border: 'none', padding: '1px 8px',
            }}>
              +{keywords.split(',').filter(Boolean).length - 3}
            </Tag>
          )}
        </div>
      ) : <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>,
    },
    {
      title: 'POLİGON',
      dataIndex: 'polygon',
      key: 'polygon',
      width: 110,
      align: 'center' as const,
      render: (polygon: any[] | null) => {
        const has = polygon && polygon.length >= 3;
        return (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 20,
            background: has ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${has ? '#bbf7d0' : '#fecaca'}`,
          }}>
            {has ? (
              <CheckCircleFilled style={{ fontSize: 12, color: '#16a34a' }} />
            ) : (
              <CloseCircleFilled style={{ fontSize: 12, color: '#dc2626' }} />
            )}
            <span style={{ fontSize: 12, fontWeight: 600, color: has ? '#16a34a' : '#dc2626' }}>
              {has ? `${polygon!.length} nokta` : 'Yok'}
            </span>
          </div>
        );
      },
    },
    {
      title: 'RENK',
      dataIndex: 'color',
      key: 'colorDisplay',
      width: 90,
      align: 'center' as const,
      render: (color: string | null) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
          <div style={{
            width: 18, height: 18, borderRadius: 6,
            background: color || '#3388ff',
            border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
          }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b', fontFamily: 'monospace' }}>
            {(color || '#3388ff').slice(0, 7)}
          </span>
        </div>
      ),
    },
    {
      title: 'KALIKIŞ',
      key: 'isDeparture',
      width: 80,
      align: 'center' as const,
      render: (_: any, record: Zone) => {
        const is = !!record.code;
        return (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', borderRadius: 20,
            background: is ? '#eff6ff' : '#f8fafc',
            border: `1px solid ${is ? '#bfdbfe' : '#f1f5f9'}`,
          }}>
            <SwapOutlined style={{ fontSize: 11, color: is ? '#2563eb' : '#94a3b8' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: is ? '#2563eb' : '#94a3b8' }}>
              {is ? 'Evet' : 'Hayır'}
            </span>
          </div>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: any, record: Zone) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <Tooltip title="Düzenle">
            <Button
              size="small" type="text"
              icon={<EditOutlined />}
              onClick={() => handleEditZone(record)}
              style={{ borderRadius: 8, color: '#64748b', width: 34, height: 34 }}
            />
          </Tooltip>
          <Popconfirm title="Bu bölgeyi silmek istediğinize emin misiniz?" description="Fiyatlar etkilenebilir."
            onConfirm={() => handleDeleteZone(record.id)} okText="Sil" cancelText="Vazgeç" okButtonProps={{ danger: true }}>
            <Tooltip title="Sil">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ borderRadius: 8, width: 34, height: 34 }} />
            </Tooltip>
          </Popconfirm>
        </div>
      ),
    },
  ];

  // ── Zone Card (Grid) ──
  const renderZoneCard = (zone: Zone) => {
    const color = zone.color || '#3388ff';
    const hasPolygon = zone.polygon && zone.polygon.length >= 3;
    const hasCode = !!zone.code;
    const hasKeywords = !!zone.keywords;

    return (
      <div key={zone.id} style={{
        background: '#fff', borderRadius: 16, overflow: 'hidden',
        border: '1px solid #f0f0f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
        transition: 'all 0.2s',
      }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.07)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        {/* Top color strip */}
        <div style={{ height: 6, background: color }} />
        <div style={{ padding: '16px 20px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: `${color}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `2px solid ${color}40`,
              }}>
                <EnvironmentOutlined style={{ fontSize: 18, color }} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{zone.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  {hasCode && (
                    <Tag style={{
                      borderRadius: 6, fontWeight: 700, fontSize: 11, margin: 0,
                      background: '#e0e7ff', color: '#4f46e5', border: 'none', fontFamily: 'monospace',
                    }}>
                      {zone.code}
                    </Tag>
                  )}
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    {new Date(zone.createdAt).toLocaleDateString('tr-TR')}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleEditZone(zone)} style={{ borderRadius: 8, color: '#64748b' }} />
              <Popconfirm title="Bu bölgeyi silmek istediğinize emin misiniz?" description="Fiyatlar etkilenebilir."
                onConfirm={() => handleDeleteZone(zone.id)} okText="Sil" cancelText="Vazgeç" okButtonProps={{ danger: true }}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ borderRadius: 8 }} />
              </Popconfirm>
            </div>
          </div>

          {/* Keywords */}
          {hasKeywords && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <SearchOutlined style={{ fontSize: 11, color: '#94a3b8' }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Arama Kelimeleri
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(zone.keywords || '').split(',').filter(Boolean).map((kw, i) => (
                  <Tag key={i} style={{
                    borderRadius: 6, fontSize: 11, fontWeight: 500, margin: 0,
                    background: '#f1f5f9', color: '#475569', border: 'none', padding: '2px 8px',
                  }}>
                    {kw.trim()}
                  </Tag>
                ))}
              </div>
            </div>
          )}

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              flex: 1, padding: '6px 10px', borderRadius: 10,
              background: hasPolygon ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${hasPolygon ? '#bbf7d0' : '#fecaca'}`,
              textAlign: 'center',
            }}>
              <AimOutlined style={{ fontSize: 12, color: hasPolygon ? '#16a34a' : '#dc2626', display: 'block', marginBottom: 2 }} />
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{zone.polygon?.length || 0}</div>
              <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Poligon</div>
            </div>
            <div style={{
              flex: 1, padding: '6px 10px', borderRadius: 10,
              background: '#f8fafc', border: '1px solid #f1f5f9', textAlign: 'center',
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%', background: color,
                margin: '1px auto 4px', border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              }} />
              <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', fontFamily: 'monospace' }}>{color}</div>
              <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Renk</div>
            </div>
            <div style={{
              flex: 1, padding: '6px 10px', borderRadius: 10,
              background: hasCode ? '#eff6ff' : '#f8fafc',
              border: `1px solid ${hasCode ? '#bfdbfe' : '#f1f5f9'}`,
              textAlign: 'center',
            }}>
              <SwapOutlined style={{ fontSize: 12, color: hasCode ? '#2563eb' : '#94a3b8', display: 'block', marginBottom: 2 }} />
              <div style={{ fontSize: 11, fontWeight: 700, color: hasCode ? '#2563eb' : '#94a3b8' }}>
                {hasCode ? 'Evet' : 'Hayır'}
              </div>
              <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Kalkış</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AdminGuard>
      <AdminLayout selectedKey="zones">
        <div style={{ paddingBottom: 40 }}>

          {/* ── Header ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', margin: 0, letterSpacing: -0.5 }}>
                Bölge Yönetimi
              </h1>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {zones.length} bölge tanımlı
                {zones.filter(z => z.code).length > 0 && ` • ${zones.filter(z => z.code).length} kalkış noktası`}
                {zones.filter(z => z.polygon && z.polygon.length >= 3).length > 0 && ` • ${zones.filter(z => z.polygon && z.polygon.length >= 3).length} poligon alanı`}
              </Text>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <ViewToggle />
              <Button type="primary" icon={<PlusOutlined />} onClick={handleNewZone} size="large"
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none', borderRadius: 12, fontWeight: 600,
                  height: 44, paddingInline: 24,
                  boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                }}>
                Yeni Bölge
              </Button>
            </div>
          </div>

          {/* Info box */}
          <div style={{
            padding: '14px 20px', borderRadius: 12, marginBottom: 20,
            background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
            border: '1px solid #e2e8f0',
          }}>
            <Text style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
              Her bölge hem <b>kalkış noktası</b> hem <b>varış bölgesi</b> olarak kullanılabilir.
              <b> Kısaltma (Kod)</b> ve <b>Anahtar Kelimeler</b> tanımlanan bölgeler kalkış noktası olarak algılanır.
              <b> Poligon çizilen</b> bölgeler fiyatlandırmada varış noktası olarak kullanılır.
              Bir bölgeye hem kod hem poligon vererek iki yönlü kullanabilirsiniz.
            </Text>
          </div>

          {/* Loading */}
          {loading && zones.length === 0 && (
            <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
          )}

          {/* Empty state */}
          {zones.length === 0 && !loading && (
            <div style={{
              textAlign: 'center', padding: '80px 40px',
              background: '#fff', borderRadius: 20, border: '2px dashed #e2e8f0',
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: 20, margin: '0 auto 20px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <EnvironmentOutlined style={{ fontSize: 32, color: '#fff' }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                Henüz bölge eklenmemiş
              </h3>
              <Text type="secondary" style={{ fontSize: 14, display: 'block', marginBottom: 20 }}>
                Havalimanları, şehirler ve varış bölgelerini ekleyerek başlayın
              </Text>
              <Button type="primary" size="large" icon={<PlusOutlined />} onClick={handleNewZone}
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 10, fontWeight: 600, height: 42 }}>
                İlk Bölgeyi Ekle
              </Button>
            </div>
          )}

          {/* ── LIST VIEW ── */}
          {zones.length > 0 && viewMode === 'list' && (
            <div style={{
              background: '#fff', borderRadius: 16, overflow: 'hidden',
              border: '1px solid #f0f0f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <Table
                dataSource={zones}
                columns={listColumns}
                rowKey="id"
                pagination={false}
                size="middle"
                style={{ }}
                rowClassName={() => 'zone-list-row'}
              />
              <style jsx global>{`
                .zone-list-row td { border-bottom: 1px solid #f8fafc !important; padding: 12px 16px !important; }
                .zone-list-row:hover td { background: #fafafe !important; }
                .zone-list-row:last-child td { border-bottom: none !important; }
                .ant-table-thead > tr > th {
                  background: #f8fafc !important;
                  border-bottom: 1px solid #f0f0f0 !important;
                  font-size: 11px !important;
                  font-weight: 700 !important;
                  color: #94a3b8 !important;
                  text-transform: uppercase !important;
                  letter-spacing: 0.5px !important;
                  padding: 10px 16px !important;
                }
              `}</style>
            </div>
          )}

          {/* ── GRID VIEW ── */}
          {zones.length > 0 && viewMode === 'grid' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
              {zones.map(zone => renderZoneCard(zone))}
            </div>
          )}

          {/* ── MAP VIEW ── */}
          {zones.length > 0 && viewMode === 'map' && (
            <AllZonesMap zones={zones} height={640} />
          )}

          {/* ── UNIFIED ZONE MODAL ── */}
          <Modal
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <EnvironmentOutlined style={{ fontSize: 18, color: '#fff' }} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{editingZone ? 'Bölge Düzenle' : 'Yeni Bölge'}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>Bölge bilgilerini girin</div>
                </div>
              </div>
            }
            open={modalVisible}
            onCancel={() => setModalVisible(false)}
            onOk={handleZoneSubmit}
            okText={editingZone ? 'Güncelle' : 'Kaydet'}
            cancelText="İptal"
            okButtonProps={{ style: { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 8, fontWeight: 600 } }}
            cancelButtonProps={{ style: { borderRadius: 8 } }}
            styles={{ body: { paddingTop: 20 } }}
            width={560}
          >
            <Form form={form} layout="vertical" requiredMark={false}>
              <Form.Item name="name" label={<span style={{ fontWeight: 600, color: '#334155' }}>Bölge Adı</span>} rules={[{ required: true, message: 'Bölge adı zorunludur' }]}>
                <Input placeholder="Örn: Antalya Havalimanı, Alanya, Side" size="large" style={{ borderRadius: 10 }}
                  prefix={<EnvironmentOutlined style={{ color: '#94a3b8' }} />} />
              </Form.Item>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="code" label={<span style={{ fontWeight: 600, color: '#334155' }}>Kısaltma (Kod)</span>}
                    tooltip="Kalkış noktası olarak kullanılacaksa zorunlu (Örn: AYT, GZP, ALY)">
                    <Input placeholder="Örn: AYT" size="large" style={{ borderRadius: 10, textTransform: 'uppercase' }}
                      prefix={<CodeOutlined style={{ color: '#94a3b8' }} />} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="color" label={<span style={{ fontWeight: 600, color: '#334155' }}>Harita Renk Kodu</span>}>
                    <ColorPicker showText />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="keywords" label={<span style={{ fontWeight: 600, color: '#334155' }}>Arama Anahtar Kelimeleri</span>}
                tooltip="Müşteri arama çubuğuna bu kelimelerden birini yazarsa bu bölge kalkış noktası olarak algılanır">
                <Input.TextArea placeholder="Örn: ayt, antalya havalimanı, airport (virgülle ayırın)" rows={2} style={{ borderRadius: 10 }} />
              </Form.Item>

              <div style={{
                padding: '10px 14px', borderRadius: 10, marginBottom: 16,
                background: '#f8fafc', border: '1px solid #f1f5f9',
                fontSize: 12, color: '#64748b', lineHeight: 1.5,
              }}>
                <SearchOutlined style={{ marginRight: 6, color: '#6366f1' }} />
                Kod ve anahtar kelime girildiğinde bu bölge <b>kalkış noktası</b> olarak da çalışır.
                Boş bırakılırsa sadece varış bölgesi olarak kullanılır.
              </div>

              <Divider style={{ margin: '12px 0 16px' }} />

              <Form.Item label={<span style={{ fontWeight: 600, color: '#334155' }}>Harita Sınırları (Poligon)</span>}>
                <Button type="dashed" block icon={<EnvironmentOutlined />} size="large" onClick={() => setMapVisible(true)}
                  style={{
                    borderRadius: 10, height: 48,
                    borderColor: currentPolygon.length > 2 ? '#10b981' : undefined,
                    color: currentPolygon.length > 2 ? '#10b981' : undefined,
                    fontWeight: 600,
                  }}
                >
                  {currentPolygon.length > 2 ? `${currentPolygon.length} Noktalı Alan Çizildi (Düzenle)` : 'Haritadan Alan Çiz'}
                </Button>
                {currentPolygon.length > 0 && currentPolygon.length < 3 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>Poligon için en az 3 nokta gereklidir.</div>
                )}
                {currentPolygon.length === 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
                    Poligon çizimi isteğe bağlıdır. Fiyatlandırmada varış bölgesi olarak kullanmak için çizin.
                  </div>
                )}
              </Form.Item>
            </Form>
          </Modal>

          {mapVisible && (
            <AdminMapPickerModal
              visible={mapVisible}
              onCancel={() => setMapVisible(false)}
              title="Bölge Sınırlarını Çiz"
              initialDrawingMode={currentPolygon && currentPolygon.length > 2 ? "polygon" : "circle"}
              initialPolygonPath={currentPolygon}
              onConfirm={(address, lat, lng, radius, polygonPath) => {
                if (polygonPath && polygonPath.length >= 3) {
                  setCurrentPolygon(polygonPath);
                  message.success('Poligon alanı başarıyla alındı');
                } else {
                  message.warning('Poligon çizimi alana eklenmedi veya yetersiz!');
                }
              }}
            />
          )}
        </div>
      </AdminLayout>
    </AdminGuard>
  );
};

export default ZonesPage;
