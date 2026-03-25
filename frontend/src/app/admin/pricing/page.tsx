'use client';

import React, { useState, useEffect } from 'react';
import { 
  Typography, Card, message, Row, Col, List, Avatar, 
  Button, Form, InputNumber, Select, Spin, Empty, 
  Switch, Divider 
} from 'antd';
import { 
  CarOutlined, PlusOutlined, CloseCircleOutlined, SaveOutlined 
} from '@ant-design/icons';
import AdminLayout from '../AdminLayout';
import AdminGuard from '../AdminGuard';
import apiClient from '../../../lib/api-client';

const { Title, Text } = Typography;
const { Option } = Select;

export default function PricingPage() {
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [hubs, setHubs] = useState<any[]>([]);
  const [currencies, setCurrencies] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState<any | null>(null);
  
  const [form] = Form.useForm();

  const fetchData = async () => {
    try {
      setLoading(true);
      const [vtRes, zonesRes, settingsRes, defsRes] = await Promise.all([
        apiClient.get('/api/vehicle-types'),
        apiClient.get('/api/zones'),
        apiClient.get('/api/tenant/settings'),
        apiClient.get('/api/tenant/definitions')
      ]);

      if (vtRes.data?.success) setVehicleTypes(vtRes.data.data);
      if (zonesRes.data?.success) setZones(zonesRes.data.data);
      
      const st = settingsRes.data?.data;
      if (st?.hubs) setHubs(st.hubs);
      
      const df = defsRes.data?.data;
      if (df?.currencies) setCurrencies(df.currencies);
      else setCurrencies([{ code: 'TRY', symbol: '₺' }, { code: 'EUR', symbol: '€' }, { code: 'USD', symbol: '$' }, { code: 'GBP', symbol: '£' }]);

    } catch (err: any) {
      console.error('Fetch error:', err);
      message.error('Veriler yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectType = (vt: any) => {
    setSelectedType(vt);
    
    // Set form values
    form.setFieldsValue({
      metadata: {
        openingFee: vt.metadata?.openingFee,
        basePricePerKm: vt.metadata?.basePricePerKm,
        fixedPrice: vt.metadata?.fixedPrice,
        basePricePerHour: vt.metadata?.basePricePerHour,
        currency: vt.metadata?.currency || 'EUR'
      },
      zonePrices: (vt.zonePrices || []).map((zp: any) => ({
        ...zp,
        price: zp.price ? Number(zp.price) : undefined,
        childPrice: zp.childPrice ? Number(zp.childPrice) : undefined,
        babyPrice: zp.babyPrice ? Number(zp.babyPrice) : undefined,
        fixedPrice: zp.fixedPrice ? Number(zp.fixedPrice) : undefined,
        cost: zp.cost ? Number(zp.cost) : undefined,
        extraKmPrice: zp.extraKmPrice ? Number(zp.extraKmPrice) : undefined
      }))
    });
  };

  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      // Create new metadata object with only pricing
      const newMetadata = {
        ...(selectedType.metadata || {}),
        openingFee: values.metadata?.openingFee,
        basePricePerKm: values.metadata?.basePricePerKm,
        fixedPrice: values.metadata?.fixedPrice,
        basePricePerHour: values.metadata?.basePricePerHour,
        currency: values.metadata?.currency
      };

      const payload = {
        name: selectedType.name,
        category: selectedType.category,
        capacity: selectedType.capacity,
        luggage: selectedType.luggage,
        description: selectedType.description,
        features: selectedType.features,
        image: selectedType.image,
        metadata: newMetadata,
        zonePrices: values.zonePrices
      };

      await apiClient.put(`/api/vehicle-types/${selectedType.id}`, payload);
      message.success('Fiyatlandırma başarıyla kaydedildi');
      
      // Update local state without full reload
      setVehicleTypes(prev => prev.map(t => t.id === selectedType.id ? { ...t, metadata: newMetadata, zonePrices: values.zonePrices } : t));
      
    } catch (err: any) {
      console.error('Save error:', err);
      message.error(err.response?.data?.error || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminGuard>
      <AdminLayout selectedKey="pricing">
        <div style={{ marginBottom: 20 }}>
          <Title level={2} style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
            Araç Tipi Fiyatlandırması
          </Title>
          <Text type="secondary">
            Müşterilerinize sunulan araç tipleri için baz fiyatları ve bölge (poligon) fiyatlarını yönebilirsiniz.
          </Text>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}>
            <Spin size="large" />
          </div>
        ) : (
          <Row gutter={[24, 24]}>
            {/* Left side: Vehicle Types List */}
            <Col xs={24} md={8} lg={6}>
              <Card 
                title={<span style={{ fontWeight: 600 }}>Araç Tipleri</span>}
                bodyStyle={{ padding: '12px 0' }}
                style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
              >
                <List
                  dataSource={vehicleTypes}
                  renderItem={item => {
                    const isSelected = selectedType?.id === item.id;
                    return (
                      <List.Item
                        onClick={() => handleSelectType(item)}
                        style={{
                          padding: '12px 20px',
                          cursor: 'pointer',
                          background: isSelected ? '#eff6ff' : 'transparent',
                          borderLeft: isSelected ? '4px solid #3b82f6' : '4px solid transparent',
                          transition: 'all 0.2s',
                        }}
                      >
                        <List.Item.Meta
                          avatar={
                            <Avatar src={item.image} icon={<CarOutlined />} style={{ background: '#cbd5e1' }} />
                          }
                          title={<Text strong style={{ color: isSelected ? '#1d4ed8' : 'inherit' }}>{item.name}</Text>}
                          description={<Text type="secondary" style={{ fontSize: 12 }}>{item.categoryDisplay} • {item.capacity} Yolcu</Text>}
                        />
                      </List.Item>
                    );
                  }}
                />
              </Card>
            </Col>

            {/* Right side: Pricing Details */}
            <Col xs={24} md={16} lg={18}>
              {selectedType ? (
                <Card 
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontWeight: 600 }}>{selectedType.name} - Fiyatlandırma Yönetimi</span>
                    </div>
                  }
                  style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                  extra={
                    <Button type="primary" icon={<SaveOutlined />} onClick={() => form.submit()} loading={saving} style={{ borderRadius: 6 }}>
                      Kaydet
                    </Button>
                  }
                >
                  <Form form={form} layout="vertical" onFinish={handleSave}>
                    {/* BASE PRICING */}
                    <Title level={5}>Genel / Mesafe Bazlı Formül Fiyatlandırması (Opsiyonel)</Title>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
                      Bu fiyatlar, transfer rotası hiçbir poligonla (bölge) eşleşmezse uygulanacak kilometre veya saat bazlı yedek hesaplama fiyatlarıdır.
                    </Text>
                    
                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item label="Para Birimi" name={['metadata', 'currency']}>
                          <Select placeholder="Örn: EUR" allowClear>
                            {currencies.map(c => <Option key={c.code} value={c.code}>{c.code} ({c.symbol})</Option>)}
                          </Select>
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={6}>
                        <Form.Item label="Açılış/Başlangıç Ücreti" name={['metadata', 'openingFee']}>
                          <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item label="Km Başı Ücret" name={['metadata', 'basePricePerKm']}>
                          <InputNumber min={0} step={0.1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item label="Hizmet Başı Sabit (Yedek)" name={['metadata', 'fixedPrice']}>
                          <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item label="Saatlik Fiyat (Şoförlü vb.)" name={['metadata', 'basePricePerHour']}>
                          <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Divider />

                    {/* ZONE PRICING */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div>
                        <Title level={5} style={{ margin: 0 }}>Bölge (Poligon) Fiyatları</Title>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                          Poligonlar arası transfer yapıldığında uygulanacak asıl fiyat tarifeleri.
                        </Text>
                      </div>
                    </div>

                    <Form.List name="zonePrices">
                      {(fields, { add, remove }) => (
                        <>
                          {fields.length === 0 && (
                            <Empty description="Bu araç tipi için henüz bölge fiyatı eklenmemiş" />
                          )}

                          {fields.map(({ key, name, ...restField }) => (
                            <div key={key} style={{ 
                              padding: '16px 20px', 
                              background: '#f8fafc', 
                              border: '1px solid #e2e8f0', 
                              borderRadius: 12, 
                              marginBottom: 16,
                              position: 'relative'
                            }}>
                              <Button 
                                type="text" 
                                danger 
                                icon={<CloseCircleOutlined />} 
                                onClick={() => remove(name)} 
                                style={{ position: 'absolute', top: 12, right: 12 }} 
                              />
                              
                              <Row gutter={16}>
                                <Col span={8}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'baseLocation']}
                                    label="Merkez (Kalkış / Varış)"
                                    rules={[{ required: true, message: 'Seçiniz' }]}
                                  >
                                    <Select placeholder="Örn: AYT">
                                      {hubs.map((h: any) => (
                                        <Option key={h.code} value={h.code}>{h.name} ({h.code})</Option>
                                      ))}
                                    </Select>
                                  </Form.Item>
                                </Col>
                                <Col span={10}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'zoneId']}
                                    label="Bölge (Poligon)"
                                    rules={[{ required: true, message: 'Seçiniz' }]}
                                  >
                                    <Select placeholder="Poligon Seç" showSearch optionFilterProp="children">
                                      {zones.map(z => (
                                        <Option key={z.id} value={z.id}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: z.color }}></div>
                                            {z.name}
                                          </div>
                                        </Option>
                                      ))}
                                    </Select>
                                  </Form.Item>
                                </Col>
                              </Row>

                              {/* PRICING INPUTS */}
                              <div style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #f1f5f9' }}>
                                <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 12, color: '#475569' }}>Fiyat ve Maliyet Detayları</Text>
                                <Row gutter={[16, 16]}>
                                  <Col span={6}>
                                    <Form.Item
                                      {...restField}
                                      name={[name, 'price']}
                                      label="Yetişkin / Baz Fiyat"
                                      rules={[{ required: true, message: 'Zorunlu' }]}
                                      tooltip="Kişi başı yetişkin fiyatıdır. Eğer sistem kişi başı değil sadece araç bazlı satıyorsa Fix Fiyat giriniz."
                                    >
                                      <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                    </Form.Item>
                                  </Col>
                                  <Col span={6}>
                                    <Form.Item
                                      {...restField}
                                      name={[name, 'childPrice']}
                                      label="Çocuk Fiyatı"
                                    >
                                      <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                    </Form.Item>
                                  </Col>
                                  <Col span={6}>
                                    <Form.Item
                                      {...restField}
                                      name={[name, 'babyPrice']}
                                      label="Bebek Fiyatı"
                                    >
                                      <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                    </Form.Item>
                                  </Col>
                                  <Col span={6}>
                                    <Form.Item
                                      {...restField}
                                      name={[name, 'fixedPrice']}
                                      label="Fix (Araç) Fiyatı"
                                      tooltip="Bu girildiğinde yolcu sayısı ve çocuk/bebek fiyatı yok sayılır! Direkt aracın satış fiyatı olur."
                                    >
                                      <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                    </Form.Item>
                                  </Col>
                                  
                                  <Col span={6}>
                                    <Form.Item
                                      {...restField}
                                      name={[name, 'cost']}
                                      label="Güzergah Maliyeti"
                                      tooltip="Bu güzergaha araç gönderildiğinde oluşan maliyet (partner ödemesi, yakıt vb.)"
                                    >
                                      <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                    </Form.Item>
                                  </Col>
                                  <Col span={6}>
                                    <Form.Item
                                      {...restField}
                                      name={[name, 'extraKmPrice']}
                                      label="Aşım Km Fiyatı"
                                      tooltip="Poligon sınırından çıktıktan sonra km başına eklenecek ücret."
                                    >
                                      <InputNumber min={0} step={0.1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                    </Form.Item>
                                  </Col>
                                </Row>
                              </div>

                            </div>
                          ))}
                          <Form.Item>
                            <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} size="large" style={{ borderRadius: 8 }}>
                              Yeni Bölge Fiyatı Ekle
                            </Button>
                          </Form.Item>
                        </>
                      )}
                    </Form.List>

                  </Form>
                </Card>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400, color: '#94a3b8' }}>
                  <CarOutlined style={{ fontSize: 64, marginBottom: 16, opacity: 0.5 }} />
                  <Title level={4} style={{ color: '#64748b', margin: 0 }}>Araç Tipi Seçin</Title>
                  <Text type="secondary">Fiyatlandırmasını yönetmek için soldan bir araç tipi seçiniz.</Text>
                </div>
              )}
            </Col>
          </Row>
        )}
      </AdminLayout>
    </AdminGuard>
  );
}
