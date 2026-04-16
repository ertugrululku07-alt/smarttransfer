'use client';

import React, { useState, useEffect } from 'react';
import {
  Typography, message, Row, Col, Avatar,
  Button, Form, InputNumber, Select, Spin, Empty,
  Divider, Input, Tag, Badge
} from 'antd';
import {
  CarOutlined, PlusOutlined, CloseCircleOutlined, SaveOutlined,
  DollarOutlined, EnvironmentOutlined, UserOutlined,
  FieldTimeOutlined, DashboardOutlined
} from '@ant-design/icons';
import AdminLayout from '../AdminLayout';
import AdminGuard from '../AdminGuard';
import apiClient, { getImageUrl } from '../../../lib/api-client';

const { Text } = Typography;
const { Option } = Select;

export default function PricingPage() {
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [hubs, setHubs] = useState<any[]>([]);
  const [currencies, setCurrencies] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState<any | null>(null);
  const [defaultCurrency, setDefaultCurrency] = useState<string>('EUR');

  const [form] = Form.useForm();

  const fetchData = async () => {
    try {
      setLoading(true);
      const [vtRes, zonesRes, tenantRes] = await Promise.allSettled([
        apiClient.get('/api/vehicle-types'),
        apiClient.get('/api/zones'),
        apiClient.get('/api/tenant/info')
      ]);

      if (vtRes.status === 'fulfilled' && vtRes.value.data?.success) {
        setVehicleTypes(vtRes.value.data.data);
      }
      if (zonesRes.status === 'fulfilled' && zonesRes.value.data?.success) {
        setZones(zonesRes.value.data.data);
      }
      if (tenantRes.status === 'fulfilled' && tenantRes.value.data?.success) {
        const tenant = tenantRes.value.data.data.tenant;
        const st = tenant.settings || {};
        if (st.hubs && Array.isArray(st.hubs) && st.hubs.length > 0) {
          setHubs(st.hubs);
        } else { setHubs([]); }
        if (st.definitions?.currencies) {
          setCurrencies(st.definitions.currencies);
          const defCur = st.definitions.currencies.find((c: any) => c.isDefault);
          if (defCur) setDefaultCurrency(defCur.code);
        } else if (tenant.currency) {
          setCurrencies([{ code: tenant.currency, symbol: '' }]);
          setDefaultCurrency(tenant.currency);
        }
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
      message.error('Veriler yüklenirken hata oluştu.');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSelectType = (vt: any) => {
    setSelectedType(vt);
    form.setFieldsValue({
      metadata: {
        openingFee: vt.metadata?.openingFee,
        basePricePerKm: vt.metadata?.basePricePerKm,
        fixedPrice: vt.metadata?.fixedPrice,
        basePricePerHour: vt.metadata?.basePricePerHour,
        currency: vt.metadata?.currency || defaultCurrency
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
      const newMetadata = {
        ...(selectedType.metadata || {}),
        openingFee: values.metadata?.openingFee,
        basePricePerKm: values.metadata?.basePricePerKm,
        fixedPrice: values.metadata?.fixedPrice,
        basePricePerHour: values.metadata?.basePricePerHour,
        currency: values.metadata?.currency
      };
      const payload = {
        name: selectedType.name, category: selectedType.category,
        capacity: selectedType.capacity, luggage: selectedType.luggage,
        description: selectedType.description, features: selectedType.features,
        image: selectedType.image, metadata: newMetadata,
        zonePrices: values.zonePrices
      };
      await apiClient.put(`/api/vehicle-types/${selectedType.id}`, payload);
      message.success('Fiyatlandırma başarıyla kaydedildi');
      setVehicleTypes(prev => prev.map(t => t.id === selectedType.id ? { ...t, metadata: newMetadata, zonePrices: values.zonePrices } : t));
    } catch (err: any) {
      console.error('Save error:', err);
      message.error(err.response?.data?.error || 'Kaydedilemedi');
    } finally { setSaving(false); }
  };

  // ── Category colors ──
  const CAT_COLORS: Record<string, string> = {
    SEDAN: '#6366f1', VAN: '#0891b2', VIP_VAN: '#7c3aed',
    MINIBUS: '#2563eb', BUS: '#ea580c', LUXURY: '#ca8a04',
  };

  return (
    <AdminGuard>
      <AdminLayout selectedKey="pricing">
        <div style={{ paddingBottom: 40 }}>

          {/* ── Header ── */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', margin: 0, letterSpacing: -0.5 }}>
              Araç Tipi Fiyatlandırması
            </h1>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Araç tipleri için baz fiyatları ve bölge (poligon) fiyatlarını yönetin.
            </Text>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}>
              <Spin size="large" />
            </div>
          ) : (
            <Row gutter={[20, 20]}>
              {/* ── Left: Vehicle Types ── */}
              <Col xs={24} md={8} lg={6}>
                <div style={{
                  background: '#fff', borderRadius: 20, overflow: 'hidden',
                  border: '1px solid #f0f0f0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}>
                  <div style={{
                    padding: '16px 20px',
                    background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
                    borderBottom: '1px solid #e2e8f0',
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>Araç Tipleri</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{vehicleTypes.length} tip tanımlı</div>
                  </div>
                  <div style={{ padding: '8px 0' }}>
                    {vehicleTypes.map(item => {
                      const isSelected = selectedType?.id === item.id;
                      const catColor = CAT_COLORS[item.category] || '#6366f1';
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleSelectType(item)}
                          style={{
                            padding: '12px 16px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 12,
                            background: isSelected ? `${catColor}08` : 'transparent',
                            borderLeft: isSelected ? `4px solid ${catColor}` : '4px solid transparent',
                            transition: 'all 0.15s',
                            borderBottom: '1px solid #f8fafc',
                          }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <div style={{
                            width: 40, height: 40, borderRadius: 12, overflow: 'hidden',
                            background: item.image ? 'transparent' : `${catColor}15`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {item.image ? (
                              <img src={getImageUrl(item.image)} alt={item.name} style={{ width: 40, height: 40, objectFit: 'cover' }} />
                            ) : (
                              <CarOutlined style={{ fontSize: 18, color: catColor }} />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 13, fontWeight: isSelected ? 700 : 600,
                              color: isSelected ? catColor : '#1e293b',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {item.name}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              {item.categoryDisplay} · {item.capacity} Yolcu
                            </div>
                          </div>
                          {item.zonePrices?.length > 0 && (
                            <Badge count={item.zonePrices.length} style={{ backgroundColor: catColor, fontSize: 10, boxShadow: 'none' }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Col>

              {/* ── Right: Pricing Details ── */}
              <Col xs={24} md={16} lg={18}>
                {selectedType ? (
                  <div style={{
                    background: '#fff', borderRadius: 20, overflow: 'hidden',
                    border: '1px solid #f0f0f0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}>
                    {/* Title bar */}
                    <div style={{
                      padding: '16px 24px',
                      background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
                      borderBottom: '1px solid #e2e8f0',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 14,
                          background: `linear-gradient(135deg, ${CAT_COLORS[selectedType.category] || '#6366f1'}, ${CAT_COLORS[selectedType.category] || '#6366f1'}cc)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: `0 4px 12px ${CAT_COLORS[selectedType.category] || '#6366f1'}30`,
                        }}>
                          <CarOutlined style={{ fontSize: 20, color: '#fff' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>{selectedType.name}</div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>Fiyatlandırma Yönetimi</div>
                        </div>
                      </div>
                      <Button type="primary" icon={<SaveOutlined />} onClick={() => form.submit()} loading={saving}
                        style={{
                          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                          border: 'none', borderRadius: 10, fontWeight: 600, height: 40,
                          boxShadow: '0 4px 12px rgba(99,102,241,0.25)',
                        }}>
                        Kaydet
                      </Button>
                    </div>

                    {/* Form content */}
                    <div style={{ padding: '24px' }}>
                      <Form form={form} layout="vertical" onFinish={handleSave} requiredMark={false}>

                        {/* ── BASE PRICING ── */}
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
                        }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <DashboardOutlined style={{ fontSize: 15, color: '#2563eb' }} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>Mesafe Bazlı Formül Fiyatlandırması</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              Transfer rotası hiçbir bölge ile eşleşmezse uygulanacak yedek fiyatlar
                            </div>
                          </div>
                        </div>

                        <div style={{
                          padding: '20px', borderRadius: 16,
                          background: '#f8fafc', border: '1px solid #f1f5f9',
                          marginBottom: 28,
                        }}>
                          <Row gutter={16}>
                            <Col span={6}>
                              <Form.Item label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 12 }}>Para Birimi</span>} name={['metadata', 'currency']}>
                                <Select placeholder={defaultCurrency || 'Seçiniz'} allowClear size="large"
                                  loading={currencies.length === 0} notFoundContent={currencies.length === 0 ? 'Yükleniyor...' : 'Tanımsız'}>
                                  {currencies.map(c => <Option key={c.code} value={c.code}>{c.symbol} {c.code}</Option>)}
                                </Select>
                              </Form.Item>
                            </Col>
                            <Col span={6}>
                              <Form.Item label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 12 }}>Başlangıç Ücreti</span>} name={['metadata', 'openingFee']}>
                                <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} size="large" />
                              </Form.Item>
                            </Col>
                            <Col span={6}>
                              <Form.Item label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 12 }}>Km Başı Ücret</span>} name={['metadata', 'basePricePerKm']}>
                                <InputNumber min={0} step={0.1} precision={2} placeholder="0.00" style={{ width: '100%' }} size="large" />
                              </Form.Item>
                            </Col>
                            <Col span={6}>
                              <Form.Item label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 12 }}>Sabit Fiyat</span>} name={['metadata', 'fixedPrice']}>
                                <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} size="large" />
                              </Form.Item>
                            </Col>
                          </Row>
                          <Row gutter={16}>
                            <Col span={6}>
                              <Form.Item label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 12 }}>Saatlik Fiyat</span>} name={['metadata', 'basePricePerHour']} style={{ marginBottom: 0 }}>
                                <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} size="large" />
                              </Form.Item>
                            </Col>
                          </Row>
                        </div>

                        {/* ── ZONE PRICING ── */}
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
                        }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <EnvironmentOutlined style={{ fontSize: 15, color: '#16a34a' }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>Bölge (Poligon) Fiyatları</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              Poligonlar arası transfer fiyat tarifeleri
                            </div>
                          </div>
                        </div>

                        <Form.List name="zonePrices">
                          {(fields, { add, remove }) => (
                            <>
                              {fields.length === 0 && (
                                <div style={{
                                  textAlign: 'center', padding: '40px 20px',
                                  borderRadius: 16, border: '2px dashed #e2e8f0', background: '#fafafa',
                                  marginBottom: 16,
                                }}>
                                  <EnvironmentOutlined style={{ fontSize: 32, color: '#d1d5db', marginBottom: 8, display: 'block' }} />
                                  <div style={{ fontSize: 14, color: '#94a3b8', fontWeight: 500 }}>Henüz bölge fiyatı eklenmemiş</div>
                                </div>
                              )}

                              {fields.map(({ key, name, ...restField }) => (
                                <div key={key} style={{
                                  padding: '18px 20px',
                                  background: '#fff',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: 16,
                                  marginBottom: 16,
                                  position: 'relative',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                                }}>
                                  <Button type="text" danger icon={<CloseCircleOutlined />} onClick={() => remove(name)}
                                    style={{ position: 'absolute', top: 12, right: 12, borderRadius: 8 }} />

                                  <Row gutter={16}>
                                    <Col span={10}>
                                      <Form.Item {...restField} name={[name, 'baseLocation']}
                                        label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 12 }}>Merkez (Kalkış / Varış)</span>}
                                        rules={[{ required: true, message: 'Gerekli' }]}>
                                        {hubs.length > 0 ? (
                                          <Select placeholder="Seçiniz" showSearch optionFilterProp="children" size="large">
                                            {hubs.map((h: any) => (
                                              <Option key={h.code} value={h.code}>{h.name} ({h.code})</Option>
                                            ))}
                                          </Select>
                                        ) : (
                                          <Input placeholder="Örn: AYT Havalimanı" size="large" />
                                        )}
                                      </Form.Item>
                                    </Col>
                                    <Col span={10}>
                                      <Form.Item {...restField} name={[name, 'zoneId']}
                                        label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 12 }}>Bölge (Poligon)</span>}
                                        rules={[{ required: true, message: 'Seçiniz' }]}>
                                        <Select placeholder="Poligon Seç" showSearch optionFilterProp="children" size="large">
                                          {zones.map(z => (
                                            <Option key={z.id} value={z.id}>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: z.color }} />
                                                {z.name}
                                              </div>
                                            </Option>
                                          ))}
                                        </Select>
                                      </Form.Item>
                                    </Col>
                                  </Row>

                                  {/* Price grid */}
                                  <div style={{
                                    padding: '16px', borderRadius: 12,
                                    background: '#f8fafc', border: '1px solid #f1f5f9',
                                  }}>
                                    <div style={{
                                      fontSize: 11, fontWeight: 700, color: '#94a3b8',
                                      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
                                    }}>
                                      <DollarOutlined style={{ marginRight: 6 }} />
                                      Fiyat & Maliyet Detayları
                                    </div>
                                    <Row gutter={[12, 0]}>
                                      <Col span={4}>
                                        <Form.Item {...restField} name={[name, 'fixedPrice']}
                                          label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 11 }}>Fix Fiyat</span>}
                                          tooltip="Araç başına sabit satış fiyatı">
                                          <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                        </Form.Item>
                                      </Col>
                                      <Col span={4}>
                                        <Form.Item {...restField} name={[name, 'price']}
                                          label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 11 }}>Yetişkin</span>}
                                          tooltip="Kişi başı yetişkin fiyatı">
                                          <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                        </Form.Item>
                                      </Col>
                                      <Col span={4}>
                                        <Form.Item {...restField} name={[name, 'childPrice']}
                                          label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 11 }}>Çocuk</span>}>
                                          <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                        </Form.Item>
                                      </Col>
                                      <Col span={4}>
                                        <Form.Item {...restField} name={[name, 'babyPrice']}
                                          label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 11 }}>Bebek</span>}>
                                          <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                        </Form.Item>
                                      </Col>
                                      <Col span={4}>
                                        <Form.Item {...restField} name={[name, 'cost']}
                                          label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 11 }}>Maliyet</span>}
                                          tooltip="Güzergah maliyeti">
                                          <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                        </Form.Item>
                                      </Col>
                                      <Col span={4}>
                                        <Form.Item {...restField} name={[name, 'extraKmPrice']}
                                          label={<span style={{ fontWeight: 600, color: '#334155', fontSize: 11 }}>Aşım/km</span>}
                                          tooltip="Poligon dışı km başına ek ücret">
                                          <InputNumber min={0} step={0.1} precision={2} placeholder="0.00" style={{ width: '100%' }} />
                                        </Form.Item>
                                      </Col>
                                    </Row>
                                  </div>
                                </div>
                              ))}

                              <Form.Item>
                                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} size="large"
                                  style={{
                                    borderRadius: 12, height: 48, fontWeight: 600, fontSize: 14,
                                    borderColor: '#d1d5db', color: '#64748b',
                                  }}>
                                  Yeni Bölge Fiyatı Ekle
                                </Button>
                              </Form.Item>
                            </>
                          )}
                        </Form.List>
                      </Form>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    height: '100%', minHeight: 450,
                    background: '#fff', borderRadius: 20, border: '2px dashed #e2e8f0',
                  }}>
                    <div style={{
                      width: 80, height: 80, borderRadius: 24, marginBottom: 20,
                      background: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <CarOutlined style={{ fontSize: 36, color: '#94a3b8' }} />
                    </div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: '#475569', margin: '0 0 8px' }}>Araç Tipi Seçin</h3>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      Fiyatlandırmasını yönetmek için soldan bir araç tipi seçiniz.
                    </Text>
                  </div>
                )}
              </Col>
            </Row>
          )}
        </div>
      </AdminLayout>
    </AdminGuard>
  );
}
