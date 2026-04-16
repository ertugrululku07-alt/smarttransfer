'use client';

import React, { useEffect, useState } from 'react';
import {
  Typography, Button, Modal, Form, Input, ColorPicker,
  message, Popconfirm, Tabs, Spin, Tag, Tooltip, Badge
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  EnvironmentOutlined, GlobalOutlined, SearchOutlined,
  CodeOutlined, AimOutlined
} from '@ant-design/icons';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import apiClient from '@/lib/api-client';
import AdminMapPickerModal from '../components/AdminMapPickerModal';

const { Text } = Typography;

interface Zone {
  id: string;
  name: string;
  color: string;
  polygon: { lat: number; lng: number }[];
  createdAt: string;
}

interface Hub {
  name: string;
  code: string;
  keywords: string;
}

const ZonesPage: React.FC = () => {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [form] = Form.useForm();
  const [currentPolygon, setCurrentPolygon] = useState<{lat: number, lng: number}[]>([]);

  const [hubs, setHubs] = useState<Hub[]>([]);
  const [hubModalVisible, setHubModalVisible] = useState(false);
  const [editingHubIndex, setEditingHubIndex] = useState<number | null>(null);
  const [hubForm] = Form.useForm();
  const [savingHubs, setSavingHubs] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [zonesRes, infoRes] = await Promise.all([
        apiClient.get('/api/zones'),
        apiClient.get('/api/tenant/info')
      ]);
      if (zonesRes.data.success) setZones(zonesRes.data.data);
      if (infoRes.data.success && infoRes.data.data.tenant?.settings) {
        setHubs(infoRes.data.data.tenant.settings.hubs || []);
      }
    } catch (err) {
      console.error(err);
      message.error('Veriler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // --- ZONES LOGIC ---
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
    form.setFieldsValue({ name: zone.name, color: zone.color });
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
      if (!currentPolygon || currentPolygon.length < 3) {
        message.error('Lütfen haritadan geçerli bir poligon alanı çizin (En az 3 nokta)');
        return;
      }
      const payload = {
        name: values.name,
        color: typeof values.color === 'string' ? values.color : values.color.toHexString(),
        polygon: currentPolygon,
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

  // --- HUBS LOGIC ---
  const saveHubsToSettings = async (newHubs: Hub[]) => {
    setSavingHubs(true);
    try {
      const res = await apiClient.put('/api/tenant/settings', { hubs: newHubs });
      if (res.data.success) { setHubs(newHubs); message.success('Kalkış noktaları güncellendi'); }
    } catch (err) { message.error('Kaydedilirken hata oluştu'); }
    finally { setSavingHubs(false); }
  };

  const handleNewHub = () => { setEditingHubIndex(null); hubForm.resetFields(); setHubModalVisible(true); };
  const handleEditHub = (hub: Hub, index: number) => { setEditingHubIndex(index); hubForm.setFieldsValue(hub); setHubModalVisible(true); };

  const handleHubSubmit = async () => {
    try {
      const values = await hubForm.validateFields();
      let newHubs = [...hubs];
      if (editingHubIndex !== null) { newHubs[editingHubIndex] = values; } else { newHubs.push(values); }
      await saveHubsToSettings(newHubs);
      setHubModalVisible(false);
    } catch (err) { console.error(err); }
  };

  const handleDeleteHub = async (index: number) => {
    const newHubs = hubs.filter((_, i) => i !== index);
    await saveHubsToSettings(newHubs);
  };

  // ── Hub Card ──
  const renderHubCard = (hub: Hub, index: number) => (
    <div key={hub.code} style={{
      background: '#fff', borderRadius: 16, overflow: 'hidden',
      border: '1px solid #f0f0f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
      transition: 'all 0.2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.07)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{
        padding: '16px 20px',
        background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(37,99,235,0.25)',
          }}>
            <GlobalOutlined style={{ fontSize: 18, color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{hub.name}</div>
            <Tag style={{
              borderRadius: 6, fontWeight: 700, fontSize: 11, margin: 0, marginTop: 2,
              background: '#e0e7ff', color: '#4f46e5', border: 'none', fontFamily: 'monospace',
            }}>
              {hub.code}
            </Tag>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleEditHub(hub, index)} style={{ borderRadius: 8, color: '#64748b' }} />
          <Popconfirm title="Bu kalkış noktasını silmek istediğinize emin misiniz?" onConfirm={() => handleDeleteHub(index)}
            okText="Sil" cancelText="Vazgeç" okButtonProps={{ danger: true }}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ borderRadius: 8 }} />
          </Popconfirm>
        </div>
      </div>
      <div style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <SearchOutlined style={{ fontSize: 12, color: '#94a3b8' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Arama Anahtar Kelimeleri
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(hub.keywords || '').split(',').filter(Boolean).map((kw, i) => (
            <Tag key={i} style={{
              borderRadius: 6, fontSize: 11, fontWeight: 500, margin: 0,
              background: '#f1f5f9', color: '#475569', border: 'none', padding: '2px 8px',
            }}>
              {kw.trim()}
            </Tag>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Zone Card ──
  const renderZoneCard = (zone: Zone) => (
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
      <div style={{ height: 6, background: zone.color || '#3388ff' }} />
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: `${zone.color || '#3388ff'}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `2px solid ${zone.color || '#3388ff'}40`,
            }}>
              <EnvironmentOutlined style={{ fontSize: 18, color: zone.color || '#3388ff' }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{zone.name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                {new Date(zone.createdAt).toLocaleDateString('tr-TR')}
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
        {/* Stats row */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{
            flex: 1, padding: '8px 12px', borderRadius: 10,
            background: '#f8fafc', border: '1px solid #f1f5f9', textAlign: 'center',
          }}>
            <AimOutlined style={{ fontSize: 13, color: zone.color || '#6366f1', display: 'block', marginBottom: 2 }} />
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{zone.polygon?.length || 0}</div>
            <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Nokta</div>
          </div>
          <div style={{
            flex: 1, padding: '8px 12px', borderRadius: 10,
            background: '#f8fafc', border: '1px solid #f1f5f9', textAlign: 'center',
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%', background: zone.color || '#3388ff',
              margin: '0 auto 4px', border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            }} />
            <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', fontFamily: 'monospace' }}>{zone.color}</div>
            <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Renk</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <AdminGuard>
      <AdminLayout selectedKey="zones">
        <div style={{ paddingBottom: 40 }}>

          {/* ── Header ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', margin: 0, letterSpacing: -0.5 }}>
                Lokasyon Yönetimi
              </h1>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {hubs.length} kalkış noktası, {zones.length} varış bölgesi
              </Text>
            </div>
          </div>

          {/* ── Tabs ── */}
          <Tabs
            defaultActiveKey="hubs"
            items={[
              {
                key: 'hubs',
                label: (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                    <GlobalOutlined /> Kalkış Noktaları
                    <Badge count={hubs.length} style={{ backgroundColor: '#6366f1', fontSize: 10, boxShadow: 'none' }} />
                  </span>
                ),
                children: (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        Müşterilerin araç aramalarında seçeceği havalimanı veya merkez noktalarını yönetin.
                      </Text>
                      <Button type="primary" icon={<PlusOutlined />} onClick={handleNewHub} size="large"
                        style={{
                          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                          border: 'none', borderRadius: 12, fontWeight: 600,
                          height: 44, paddingInline: 24,
                          boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                        }}>
                        Yeni Kalkış Noktası
                      </Button>
                    </div>

                    {loading && hubs.length === 0 && (
                      <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
                    )}

                    {hubs.length === 0 && !loading && (
                      <div style={{
                        textAlign: 'center', padding: '80px 40px',
                        background: '#fff', borderRadius: 20, border: '2px dashed #e2e8f0',
                      }}>
                        <div style={{
                          width: 72, height: 72, borderRadius: 20, margin: '0 auto 20px',
                          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <GlobalOutlined style={{ fontSize: 32, color: '#fff' }} />
                        </div>
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                          Henüz kalkış noktası eklenmemiş
                        </h3>
                        <Text type="secondary" style={{ fontSize: 14, display: 'block', marginBottom: 20 }}>
                          Havalimanı, otogar gibi merkez noktalarını ekleyerek başlayın
                        </Text>
                        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={handleNewHub}
                          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 10, fontWeight: 600, height: 42 }}>
                          İlk Noktayı Ekle
                        </Button>
                      </div>
                    )}

                    {hubs.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
                        {hubs.map((hub, index) => renderHubCard(hub, index))}
                      </div>
                    )}
                  </>
                )
              },
              {
                key: 'zones',
                label: (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                    <EnvironmentOutlined /> Varış Bölgeleri
                    <Badge count={zones.length} style={{ backgroundColor: '#10b981', fontSize: 10, boxShadow: 'none' }} />
                  </span>
                ),
                children: (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        Harita üzerinde belirlenmiş poligon alanları. Fiyatlandırmada varış noktası olarak kullanılır.
                      </Text>
                      <Button type="primary" icon={<PlusOutlined />} onClick={handleNewZone} size="large"
                        style={{
                          background: 'linear-gradient(135deg, #10b981, #059669)',
                          border: 'none', borderRadius: 12, fontWeight: 600,
                          height: 44, paddingInline: 24,
                          boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
                        }}>
                        Yeni Bölge Ekle
                      </Button>
                    </div>

                    {loading && zones.length === 0 && (
                      <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
                    )}

                    {zones.length === 0 && !loading && (
                      <div style={{
                        textAlign: 'center', padding: '80px 40px',
                        background: '#fff', borderRadius: 20, border: '2px dashed #e2e8f0',
                      }}>
                        <div style={{
                          width: 72, height: 72, borderRadius: 20, margin: '0 auto 20px',
                          background: 'linear-gradient(135deg, #10b981, #059669)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <EnvironmentOutlined style={{ fontSize: 32, color: '#fff' }} />
                        </div>
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                          Henüz varış bölgesi eklenmemiş
                        </h3>
                        <Text type="secondary" style={{ fontSize: 14, display: 'block', marginBottom: 20 }}>
                          Harita üzerinde poligon çizerek bölge tanımlarını oluşturun
                        </Text>
                        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={handleNewZone}
                          style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 10, fontWeight: 600, height: 42 }}>
                          İlk Bölgeyi Ekle
                        </Button>
                      </div>
                    )}

                    {zones.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                        {zones.map(zone => renderZoneCard(zone))}
                      </div>
                    )}
                  </>
                )
              }
            ]}
          />

          {/* ── ZONE MODAL ── */}
          <Modal
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <EnvironmentOutlined style={{ fontSize: 18, color: '#fff' }} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{editingZone ? 'Bölge Düzenle' : 'Yeni Bölge Ekle'}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>Bölge bilgilerini girin</div>
                </div>
              </div>
            }
            open={modalVisible}
            onCancel={() => setModalVisible(false)}
            onOk={handleZoneSubmit}
            okText={editingZone ? 'Güncelle' : 'Kaydet'}
            cancelText="İptal"
            okButtonProps={{ style: { background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 8, fontWeight: 600 } }}
            cancelButtonProps={{ style: { borderRadius: 8 } }}
            styles={{ body: { paddingTop: 20 } }}
            width={520}
          >
            <Form form={form} layout="vertical" requiredMark={false}>
              <Form.Item name="name" label={<span style={{ fontWeight: 600, color: '#334155' }}>Bölge Adı</span>} rules={[{ required: true, message: 'Bölge adı zorunludur' }]}>
                <Input placeholder="Örn: Lara Bölgesi" size="large" style={{ borderRadius: 10 }}
                  prefix={<EnvironmentOutlined style={{ color: '#94a3b8' }} />} />
              </Form.Item>
              <Form.Item name="color" label={<span style={{ fontWeight: 600, color: '#334155' }}>Harita Renk Kodu</span>}>
                <ColorPicker showText />
              </Form.Item>
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
                {currentPolygon.length < 3 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>Lütfen geçerli bir sınır çiziniz.</div>
                )}
              </Form.Item>
            </Form>
          </Modal>

          {/* ── HUB MODAL ── */}
          <Modal
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <GlobalOutlined style={{ fontSize: 18, color: '#fff' }} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{editingHubIndex !== null ? 'Kalkış Noktası Düzenle' : 'Yeni Kalkış Noktası'}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>Nokta bilgilerini girin</div>
                </div>
              </div>
            }
            open={hubModalVisible}
            onCancel={() => setHubModalVisible(false)}
            onOk={handleHubSubmit}
            confirmLoading={savingHubs}
            okText={editingHubIndex !== null ? 'Güncelle' : 'Kaydet'}
            cancelText="İptal"
            okButtonProps={{ style: { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 8, fontWeight: 600 } }}
            cancelButtonProps={{ style: { borderRadius: 8 } }}
            styles={{ body: { paddingTop: 20 } }}
            width={520}
          >
            <Form form={hubForm} layout="vertical" requiredMark={false}>
              <Form.Item name="name" label={<span style={{ fontWeight: 600, color: '#334155' }}>Nokta Adı</span>} rules={[{ required: true, message: 'Ad zorunludur' }]}>
                <Input placeholder="Örn: Sabiha Gökçen Havalimanı" size="large" style={{ borderRadius: 10 }}
                  prefix={<GlobalOutlined style={{ color: '#94a3b8' }} />} />
              </Form.Item>
              <Form.Item name="code" label={<span style={{ fontWeight: 600, color: '#334155' }}>Kısaltma (Kod)</span>} rules={[{ required: true, message: 'Kod zorunludur' }]}>
                <Input placeholder="Örn: SAW" size="large" style={{ borderRadius: 10, textTransform: 'uppercase' }}
                  prefix={<CodeOutlined style={{ color: '#94a3b8' }} />} />
              </Form.Item>
              <Form.Item name="keywords" label={<span style={{ fontWeight: 600, color: '#334155' }}>Arama Anahtar Kelimeleri</span>} rules={[{ required: true, message: 'En az 1 kelime zorunludur' }]}>
                <Input.TextArea placeholder="Örn: saw, sabiha, pendik (virgülle ayırın)" rows={3} style={{ borderRadius: 10 }} />
              </Form.Item>
              <div style={{
                padding: '10px 14px', borderRadius: 10,
                background: '#f8fafc', border: '1px solid #f1f5f9',
                fontSize: 12, color: '#64748b', lineHeight: 1.5,
              }}>
                <SearchOutlined style={{ marginRight: 6, color: '#6366f1' }} />
                Müşteri arama çubuğuna bu kelimelerden birini yazdığında bu kalkış noktası fiyatı devreye girecektir.
              </div>
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
