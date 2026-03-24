'use client';

import React, { useEffect, useState } from 'react';
import { Typography, Card, Table, Button, Space, Modal, Form, Input, ColorPicker, message, Popconfirm, Tabs } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EnvironmentOutlined, GlobalOutlined } from '@ant-design/icons';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import apiClient from '@/lib/api-client';
import AdminMapPickerModal from '../components/AdminMapPickerModal';

const { Title, Text } = Typography;

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
  // Zones State
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [form] = Form.useForm();
  const [currentPolygon, setCurrentPolygon] = useState<{lat: number, lng: number}[]>([]);

  // Hubs State
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
      
      if (zonesRes.data.success) {
        setZones(zonesRes.data.data);
      }
      
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

  useEffect(() => {
    fetchData();
  }, []);

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
    form.setFieldsValue({
      name: zone.name,
      color: zone.color,
    });
    setModalVisible(true);
  };

  const handleDeleteZone = async (id: string) => {
    try {
      const res = await apiClient.delete(`/api/zones/${id}`);
      if (res.data.success) {
        message.success('Bölge silindi');
        fetchData();
      }
    } catch (err) {
      message.error('Bölge silinirken hata oluştu');
    }
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
        if (res.data.success) {
          message.success('Bölge güncellendi');
        }
      } else {
        const res = await apiClient.post('/api/zones', payload);
        if (res.data.success) {
          message.success('Yeni bölge eklendi');
        }
      }
      
      setModalVisible(false);
      fetchData();
    } catch (err) {
      console.error(err);
      message.error('Kaydedilirken hata oluştu');
    }
  };

  // --- HUBS LOGIC ---
  const saveHubsToSettings = async (newHubs: Hub[]) => {
      setSavingHubs(true);
      try {
          const res = await apiClient.put('/api/tenant/settings', { hubs: newHubs });
          if(res.data.success) {
              setHubs(newHubs);
              message.success('Kalkış noktaları güncellendi');
          }
      } catch (err) {
          message.error('Kaydedilirken hata oluştu');
      } finally {
          setSavingHubs(false);
      }
  };

  const handleNewHub = () => {
      setEditingHubIndex(null);
      hubForm.resetFields();
      setHubModalVisible(true);
  };

  const handleEditHub = (hub: Hub, index: number) => {
      setEditingHubIndex(index);
      hubForm.setFieldsValue(hub);
      setHubModalVisible(true);
  };

  const handleHubSubmit = async () => {
      try {
          const values = await hubForm.validateFields();
          let newHubs = [...hubs];
          if (editingHubIndex !== null) {
              newHubs[editingHubIndex] = values;
          } else {
              newHubs.push(values);
          }
          await saveHubsToSettings(newHubs);
          setHubModalVisible(false);
      } catch (err) {
          console.error(err);
      }
  };

  const handleDeleteHub = async (index: number) => {
      const newHubs = hubs.filter((_, i) => i !== index);
      await saveHubsToSettings(newHubs);
  };

  // --- COLUMNS ---
  const zoneColumns = [
    {
      title: 'Bölge Adı',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Zone) => (
        <Space>
           <div style={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: record.color }}></div>
           <Text strong>{text}</Text>
        </Space>
      )
    },
    {
      title: 'Poligon Nokta Sayısı',
      key: 'points',
      render: (_: any, record: Zone) => (
         <Text>{record.polygon?.length || 0} Nokta</Text>
      )
    },
    {
      title: 'Oluşturulma',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text: string) => new Date(text).toLocaleDateString('tr-TR'),
    },
    {
      title: 'İşlemler',
      key: 'actions',
      render: (_: any, record: Zone) => (
        <Space size="middle">
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEditZone(record)}>
            Düzenle
          </Button>
           <Popconfirm
            title="Emin misiniz?"
            description="Bu bölgeyi silmek istediğinize emin misiniz? Fiyatlar etkilenebilir."
            onConfirm={() => handleDeleteZone(record.id)}
            okText="Evet, Sil"
            cancelText="İptal"
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              Sil
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const hubColumns = [
    {
      title: 'Kalkış Noktası Adı',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Kısaltma (Kod)',
      dataIndex: 'code',
      key: 'code',
      render: (text: string) => <Text code>{text}</Text>,
    },
    {
      title: 'Arama Anahtar Kelimeleri',
      dataIndex: 'keywords',
      key: 'keywords',
      render: (text: string) => <Text type="secondary">{text}</Text>,
    },
    {
      title: 'İşlemler',
      key: 'actions',
      render: (_: any, record: Hub, index: number) => (
        <Space size="middle">
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEditHub(record, index)}>
            Düzenle
          </Button>
           <Popconfirm
            title="Emin misiniz?"
            description="Bu kalkış noktasını silmek istediğinize emin misiniz?"
            onConfirm={() => handleDeleteHub(index)}
            okText="Evet, Sil"
            cancelText="İptal"
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              Sil
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <AdminGuard>
      <AdminLayout selectedKey="zones">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Title level={2} style={{ margin: 0, fontWeight: 700 }}>Lokasyon Yönetimi</Title>
        </div>

        <Tabs
          defaultActiveKey="hubs"
          items={[
            {
              key: 'hubs',
              label: (<span><GlobalOutlined /> Kalkış Noktaları (Hubs)</span>),
              children: (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text type="secondary">Müşterilerin araç aramalarında seçeceği havalimanı veya merkez noktalarını (Bases) buradan yönetebilirsiniz.</Text>
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleNewHub} style={{ background: '#1890ff', border: 'none', fontWeight: 600, borderRadius: 8 }}>
                      Yeni Kalkış Noktası Ekle
                    </Button>
                  </div>
                  <Card style={{ borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }} bodyStyle={{ padding: 0 }}>
                    <Table dataSource={hubs} columns={hubColumns} rowKey={(r) => r.code} pagination={false} loading={loading || savingHubs} />
                  </Card>
                </>
              )
            },
            {
              key: 'zones',
              label: (<span><EnvironmentOutlined /> Varış Bölgeleri (Zones)</span>),
              children: (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text type="secondary">Harita üzerinde belirlenmiş poligon alanları. Araç fiyatlandırmalarında varış noktası olarak kullanılır.</Text>
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleNewZone} style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', fontWeight: 600, borderRadius: 8 }}>
                      Yeni Bölge Ekle
                    </Button>
                  </div>
                  <Card style={{ borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }} bodyStyle={{ padding: 0 }}>
                    <Table dataSource={zones} columns={zoneColumns} rowKey="id" pagination={{ pageSize: 15 }} loading={loading} />
                  </Card>
                </>
              )
            }
          ]}
        />

        {/* ZONE MODAL */}
        <Modal
          title={<div style={{display:'flex', alignItems:'center', gap:8}}><EnvironmentOutlined style={{color:'#1890ff'}}/><span>{editingZone ? 'Bölge Düzenle' : 'Yeni Bölge Ekle'}</span></div>}
          open={modalVisible}
          onCancel={() => setModalVisible(false)}
          onOk={handleZoneSubmit}
          okText="Kaydet"
          cancelText="İptal"
          width={500}
        >
          <Form form={form} layout="vertical" style={{ marginTop: 20 }}>
            <Form.Item name="name" label="Bölge Adı" rules={[{ required: true, message: 'Bölge adı zorunludur' }]}>
              <Input placeholder="Örn: Lara Bölgesi" size="large" />
            </Form.Item>
            <Form.Item name="color" label="Harita Renk Kodu">
               <ColorPicker showText />
            </Form.Item>
            <Form.Item label="Harita Sınırları (Poligon)">
                <Button type="dashed" block icon={<EnvironmentOutlined />} size="large" onClick={() => setMapVisible(true)}
                   style={{
                      borderColor: currentPolygon.length > 2 ? '#10b981' : undefined,
                      color: currentPolygon.length > 2 ? '#10b981' : undefined,
                   }}
                >
                    {currentPolygon.length > 2 ? `${currentPolygon.length} Noktalı Alan Çizildi (Düzenle)` : 'Haritadan Alan Çiz'}
                </Button>
                {currentPolygon.length < 3 && (
                    <div style={{marginTop: 8, fontSize: 12, color: '#dc2626'}}>Lütfen geçerli bir sınır çiziniz.</div>
                )}
            </Form.Item>
          </Form>
        </Modal>

        {/* HUB MODAL */}
        <Modal
          title={<div style={{display:'flex', alignItems:'center', gap:8}}><GlobalOutlined style={{color:'#1890ff'}}/><span>{editingHubIndex !== null ? 'Kalkış Noktası Düzenle' : 'Yeni Kalkış Noktası'}</span></div>}
          open={hubModalVisible}
          onCancel={() => setHubModalVisible(false)}
          onOk={handleHubSubmit}
          confirmLoading={savingHubs}
          okText="Kaydet"
          cancelText="İptal"
          width={500}
        >
          <Form form={hubForm} layout="vertical" style={{ marginTop: 20 }}>
            <Form.Item name="name" label="Nokta Adı" rules={[{ required: true, message: 'Ad zorunludur' }]}>
              <Input placeholder="Örn: Sabiha Gökçen Havalimanı" size="large" />
            </Form.Item>
            <Form.Item name="code" label="Kısaltma (Kod)" rules={[{ required: true, message: 'Kod zorunludur' }]}>
              <Input placeholder="Örn: SAW" size="large" style={{ textTransform: 'uppercase' }} />
            </Form.Item>
            <Form.Item name="keywords" label="Arama Anahtar Kelimeleri (Virgülle ayırın)" rules={[{ required: true, message: 'En az 1 kelime zorunludur' }]}>
              <Input.TextArea placeholder="Örn: saw, sabiha, pendik" rows={3} />
            </Form.Item>
            <div style={{ fontSize: 13, color: '#888' }}>
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
      </AdminLayout>
    </AdminGuard>
  );
};

export default ZonesPage;
