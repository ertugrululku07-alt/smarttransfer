'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Typography, message, Row, Col,
  Button, Form, InputNumber, Select, Spin,
  Badge, Switch, Tooltip, Modal
} from 'antd';
import {
  CarOutlined, PlusOutlined, CloseCircleOutlined, SaveOutlined,
  DollarOutlined, EnvironmentOutlined,
  DashboardOutlined, SwapOutlined, DeleteOutlined,
  CopyOutlined, FilterOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import AdminLayout from '../AdminLayout';
import AdminGuard from '../AdminGuard';
import apiClient, { getImageUrl } from '../../../lib/api-client';

const { Text } = Typography;
const { Option } = Select;

export default function PricingPage() {
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [currencies, setCurrencies] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState<any | null>(null);
  const [defaultCurrency, setDefaultCurrency] = useState<string>('EUR');

  const [form] = Form.useForm();
  const [routeFilter, setRouteFilter] = useState<string>('');  // zone code filter for airports
  const [copyModalVisible, setCopyModalVisible] = useState(false);
  const [copySourceId, setCopySourceId] = useState<string>('');

  // Helper: build zone lookup
  const zoneByCode = useCallback((code: string) => zones.find(z => z.code === code), [zones]);
  const zoneById = useCallback((id: string) => zones.find(z => z.id === id), [zones]);

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

  // Detect bidirectional pairs on load
  const detectBidirectional = (zonePrices: any[]) => {
    const pairs = new Set<string>();
    const biRows = new Set<number>();
    zonePrices.forEach((zp, i) => {
      if (biRows.has(i)) return;
      const reverseIdx = zonePrices.findIndex((r, j) => j > i && r.baseLocation === zones.find(z => z.id === zp.zoneId)?.code && zones.find(z => z.code === zp.baseLocation)?.id === r.zoneId);
      if (reverseIdx !== -1) {
        biRows.add(i);
        biRows.add(reverseIdx);
      }
    });
    return biRows;
  };

  const handleSelectType = (vt: any) => {
    setSelectedType(vt);
    const rawPrices = (vt.zonePrices || []).map((zp: any) => ({
      ...zp,
      price: zp.price ? Number(zp.price) : undefined,
      childPrice: zp.childPrice ? Number(zp.childPrice) : undefined,
      babyPrice: zp.babyPrice ? Number(zp.babyPrice) : undefined,
      fixedPrice: zp.fixedPrice ? Number(zp.fixedPrice) : undefined,
      cost: zp.cost ? Number(zp.cost) : undefined,
      extraKmPrice: zp.extraKmPrice ? Number(zp.extraKmPrice) : undefined,
      pickupLeadHours: zp.pickupLeadHours ? Number(zp.pickupLeadHours) : undefined,
      bidirectional: false
    }));

    // Detect and merge bidirectional pairs
    const merged: any[] = [];
    const used = new Set<number>();
    rawPrices.forEach((zp: any, i: number) => {
      if (used.has(i)) return;
      const reverseIdx = rawPrices.findIndex((r: any, j: number) => 
        j > i && !used.has(j) &&
        zones.find((z: any) => z.id === zp.zoneId)?.code === r.baseLocation &&
        zones.find((z: any) => z.code === zp.baseLocation)?.id === r.zoneId
      );
      if (reverseIdx !== -1) {
        used.add(reverseIdx);
        merged.push({ ...zp, bidirectional: true });
      } else {
        merged.push({ ...zp, bidirectional: false });
      }
    });

    form.setFieldsValue({
      metadata: {
        openingFee: vt.metadata?.openingFee,
        basePricePerKm: vt.metadata?.basePricePerKm,
        fixedPrice: vt.metadata?.fixedPrice,
        basePricePerHour: vt.metadata?.basePricePerHour,
        currency: vt.metadata?.currency || defaultCurrency
      },
      zonePrices: merged
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

      // Expand bidirectional rows into two entries
      const expandedPrices: any[] = [];
      (values.zonePrices || []).forEach((zp: any) => {
        const { bidirectional, ...priceData } = zp;
        expandedPrices.push(priceData);
        if (bidirectional) {
          const fromZone = zones.find(z => z.code === zp.baseLocation);
          const toZone = zones.find(z => z.id === zp.zoneId);
          if (fromZone && toZone?.code) {
            expandedPrices.push({
              ...priceData,
              baseLocation: toZone.code,
              zoneId: fromZone.id,
            });
          }
        }
      });

      // ── Duplicate route detection ──
      const seen = new Set<string>();
      const duplicates: string[] = [];
      for (const zp of expandedPrices) {
        const routeKey = `${zp.baseLocation}→${zp.zoneId}`;
        if (seen.has(routeKey)) {
          const fromZone = zones.find(z => z.code === zp.baseLocation);
          const toZone = zoneById(zp.zoneId);
          duplicates.push(`${fromZone?.name || zp.baseLocation} → ${toZone?.name || zp.zoneId}`);
        }
        seen.add(routeKey);
      }
      if (duplicates.length > 0) {
        message.error(`Aynı güzergah birden fazla tanımlanmış: ${duplicates.join(', ')}`);
        setSaving(false);
        return;
      }

      const payload = {
        name: selectedType.name, category: selectedType.category,
        capacity: selectedType.capacity, luggage: selectedType.luggage,
        description: selectedType.description, features: selectedType.features,
        image: selectedType.image, metadata: newMetadata,
        zonePrices: expandedPrices
      };
      await apiClient.put(`/api/vehicle-types/${selectedType.id}`, payload);
      message.success('Fiyatlandırma başarıyla kaydedildi');
      setVehicleTypes(prev => prev.map(t => t.id === selectedType.id ? { ...t, metadata: newMetadata, zonePrices: expandedPrices } : t));
      // Re-select to refresh form with merged pairs
      const updated = { ...selectedType, metadata: newMetadata, zonePrices: expandedPrices };
      setTimeout(() => handleSelectType(updated), 100);
    } catch (err: any) {
      console.error('Save error:', err);
      message.error(err.response?.data?.error || 'Kaydedilemedi');
    } finally { setSaving(false); }
  };

  // ── Copy routes from another vehicle type ──
  const handleCopyRoutes = () => {
    if (!copySourceId || !selectedType) return;
    const source = vehicleTypes.find(vt => vt.id === copySourceId);
    if (!source || !source.zonePrices?.length) {
      message.warning('Kaynak araç tipinde güzergah bulunamadı');
      return;
    }
    const currentPrices = form.getFieldValue('zonePrices') || [];
    const existingKeys = new Set(currentPrices.map((zp: any) => `${zp.baseLocation}→${zp.zoneId}`));

    // Detect bidirectional pairs in source
    const rawPrices = source.zonePrices;
    const merged: any[] = [];
    const used = new Set<number>();
    rawPrices.forEach((zp: any, i: number) => {
      if (used.has(i)) return;
      const reverseIdx = rawPrices.findIndex((r: any, j: number) =>
        j > i && !used.has(j) &&
        zones.find((z: any) => z.id === zp.zoneId)?.code === r.baseLocation &&
        zones.find((z: any) => z.code === zp.baseLocation)?.id === r.zoneId
      );
      if (reverseIdx !== -1) {
        used.add(reverseIdx);
        merged.push({ ...zp, bidirectional: true });
      } else {
        merged.push({ ...zp, bidirectional: false });
      }
    });

    let addedCount = 0;
    const newPrices = [...currentPrices];
    for (const zp of merged) {
      const routeKey = `${zp.baseLocation}→${zp.zoneId}`;
      if (existingKeys.has(routeKey)) continue; // skip duplicates
      newPrices.push({
        baseLocation: zp.baseLocation,
        zoneId: zp.zoneId,
        bidirectional: zp.bidirectional || false,
        price: undefined,
        childPrice: undefined,
        babyPrice: undefined,
        fixedPrice: undefined,
        cost: undefined,
        extraKmPrice: undefined,
        pickupLeadHours: undefined,
      });
      existingKeys.add(routeKey);
      addedCount++;
    }
    form.setFieldsValue({ zonePrices: newPrices });
    setCopyModalVisible(false);
    setCopySourceId('');
    message.success(`${addedCount} güzergah kopyalandı (fiyatsız). Zaten var olan güzergahlar atlandı.`);
  };

  // ── Detect airport zones for filtering ──
  const airportZones = zones.filter(z => {
    const name = (z.name || '').toLowerCase();
    const code = (z.code || '').toLowerCase();
    return name.includes('havaliman') || name.includes('airport') ||
      ['ayt', 'gzp', 'dlm', 'bjv', 'adb', 'esb', 'ist', 'saw'].includes(code);
  });

  const CAT_COLORS: Record<string, string> = {
    SEDAN: '#6366f1', VAN: '#0891b2', VIP_VAN: '#7c3aed',
    MINIBUS: '#2563eb', BUS: '#ea580c', LUXURY: '#ca8a04',
  };

  // Compact label style
  const thStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
    letterSpacing: 0.5, padding: '8px 4px', whiteSpace: 'nowrap', textAlign: 'center',
  };

  return (
    <AdminGuard>
      <AdminLayout selectedKey="pricing">
        <div style={{ paddingBottom: 40 }}>

          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', margin: 0, letterSpacing: -0.5 }}>
              Araç Tipi Fiyatlandırması
            </h1>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Araç tipleri için baz fiyatları ve bölge fiyatlarını yönetin.
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
                        <div key={item.id} onClick={() => handleSelectType(item)}
                          style={{
                            padding: '12px 16px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 12,
                            background: isSelected ? `${catColor}08` : 'transparent',
                            borderLeft: isSelected ? `4px solid ${catColor}` : '4px solid transparent',
                            transition: 'all 0.15s', borderBottom: '1px solid #f8fafc',
                          }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <div style={{
                            width: 40, height: 40, borderRadius: 12, overflow: 'hidden',
                            background: item.image ? 'transparent' : `${catColor}15`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
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
                            }}>{item.name}</div>
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
                    border: '1px solid #f0f0f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
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

                    <div style={{ padding: '24px' }}>
                      <Form form={form} layout="vertical" onFinish={handleSave} requiredMark={false}>

                        {/* ── BASE PRICING — COMPACT TABLE ── */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <DashboardOutlined style={{ fontSize: 15, color: '#2563eb' }} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>Mesafe Bazlı Formül</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>Rota hiçbir bölge ile eşleşmezse uygulanacak yedek fiyatlar</div>
                          </div>
                        </div>

                        <div style={{ borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 28 }}>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
                            background: 'linear-gradient(135deg, #f8fafc, #eef2ff)',
                            borderBottom: '1px solid #e2e8f0',
                          }}>
                            <div style={thStyle}>Para Birimi</div>
                            <div style={thStyle}>Başlangıç Ücreti</div>
                            <div style={thStyle}>Km Başı Ücret</div>
                            <div style={thStyle}>Sabit Fiyat</div>
                            <div style={thStyle}>Saatlik Fiyat</div>
                          </div>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
                            padding: '8px 0', background: '#fff',
                          }}>
                            <div style={{ padding: '0 6px' }}>
                              <Form.Item name={['metadata', 'currency']} style={{ marginBottom: 0 }}>
                                <Select placeholder={defaultCurrency || 'Seçiniz'} allowClear size="small">
                                  {currencies.map(c => <Option key={c.code} value={c.code}>{c.symbol} {c.code}</Option>)}
                                </Select>
                              </Form.Item>
                            </div>
                            <div style={{ padding: '0 6px' }}>
                              <Form.Item name={['metadata', 'openingFee']} style={{ marginBottom: 0 }}>
                                <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} size="small" controls={false} />
                              </Form.Item>
                            </div>
                            <div style={{ padding: '0 6px' }}>
                              <Form.Item name={['metadata', 'basePricePerKm']} style={{ marginBottom: 0 }}>
                                <InputNumber min={0} step={0.1} precision={2} placeholder="0.00" style={{ width: '100%' }} size="small" controls={false} />
                              </Form.Item>
                            </div>
                            <div style={{ padding: '0 6px' }}>
                              <Form.Item name={['metadata', 'fixedPrice']} style={{ marginBottom: 0 }}>
                                <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} size="small" controls={false} />
                              </Form.Item>
                            </div>
                            <div style={{ padding: '0 6px' }}>
                              <Form.Item name={['metadata', 'basePricePerHour']} style={{ marginBottom: 0 }}>
                                <InputNumber min={0} step={1} precision={2} placeholder="0.00" style={{ width: '100%' }} size="small" controls={false} />
                              </Form.Item>
                            </div>
                          </div>
                        </div>

                        {/* ── ZONE PRICING — COMPACT TABLE ── */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <EnvironmentOutlined style={{ fontSize: 15, color: '#16a34a' }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>Bölge Fiyatları</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              Bölgeler arası transfer fiyat tarifeleri · <SwapOutlined /> Çift yön işaretlenen rotalar ters yönde de aynı fiyatla kaydedilir
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {/* Airport filter */}
                            <Select
                              placeholder={<><FilterOutlined /> Havalimanı Filtrele</>}
                              allowClear
                              size="small"
                              value={routeFilter || undefined}
                              onChange={(val) => setRouteFilter(val || '')}
                              style={{ minWidth: 180 }}
                            >
                              {airportZones.map(z => (
                                <Option key={z.code || z.id} value={z.code || z.name}>
                                  {z.name} {z.code ? `(${z.code})` : ''}
                                </Option>
                              ))}
                            </Select>
                            {/* Copy routes button */}
                            <Button
                              size="small"
                              icon={<CopyOutlined />}
                              onClick={() => setCopyModalVisible(true)}
                              style={{ borderRadius: 8, fontWeight: 600, fontSize: 12 }}
                            >
                              Kopyala
                            </Button>
                          </div>
                        </div>

                        <Form.List name="zonePrices">
                          {(fields, { add, remove }) => (
                            <div style={{ borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                              {/* Table Header */}
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: '2fr 24px 2fr 42px 1fr 1fr 1fr 1fr 1fr 1fr 1fr 32px',
                                background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                                borderBottom: '1px solid #e2e8f0',
                                alignItems: 'center',
                              }}>
                                <div style={thStyle}>Kalkış</div>
                                <div style={thStyle}></div>
                                <div style={thStyle}>Varış</div>
                                <div style={{ ...thStyle, fontSize: 9 }}>
                                  <Tooltip title="Çift yön: Ters yönde de aynı fiyat">↔</Tooltip>
                                </div>
                                <div style={thStyle}>Fix</div>
                                <div style={thStyle}>Yetişkin</div>
                                <div style={thStyle}>Çocuk</div>
                                <div style={thStyle}>Bebek</div>
                                <div style={thStyle}>Maliyet</div>
                                <div style={thStyle}>Aşım</div>
                                <div style={thStyle}>
                                  <Tooltip title="Uçuştan kaç saat önce alınacak">⏰ Saat</Tooltip>
                                </div>
                                <div style={thStyle}></div>
                              </div>

                              {/* Table Body */}
                              {fields.length === 0 && (
                                <div style={{ padding: '32px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                                  <EnvironmentOutlined style={{ fontSize: 24, color: '#d1d5db', marginBottom: 6, display: 'block' }} />
                                  Henüz bölge fiyatı eklenmemiş
                                </div>
                              )}

                              {fields.map(({ key, name, ...restField }) => {
                                // Filter logic: if routeFilter is set, only show rows matching that zone
                                const rowValues = form.getFieldValue(['zonePrices', name]);
                                if (routeFilter && rowValues) {
                                  const baseMatch = rowValues.baseLocation === routeFilter;
                                  const zoneMatch = zones.find(z => z.id === rowValues.zoneId)?.code === routeFilter;
                                  if (!baseMatch && !zoneMatch) return null;
                                }
                                return (
                                <div key={key} style={{
                                  display: 'grid',
                                  gridTemplateColumns: '2fr 24px 2fr 42px 1fr 1fr 1fr 1fr 1fr 1fr 1fr 32px',
                                  alignItems: 'center',
                                  borderBottom: '1px solid #f1f5f9',
                                  padding: '4px 0',
                                  background: key % 2 === 0 ? '#fff' : '#fafbfc',
                                  transition: 'background 0.1s',
                                }}>
                                  {/* Kalkış */}
                                  <div style={{ padding: '0 4px', overflow: 'hidden', minWidth: 0 }}>
                                    <Form.Item {...restField} name={[name, 'baseLocation']} rules={[{ required: true, message: '' }]} style={{ marginBottom: 0 }}>
                                      <Select placeholder="Kalkış" showSearch optionFilterProp="children" size="small"
                                        style={{ width: '100%' }}
                                        dropdownStyle={{ minWidth: 240 }}>
                                        {zones.map(z => (
                                          <Option key={z.code || z.id} value={z.code || z.name}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: z.color || '#94a3b8', flexShrink: 0 }} />
                                              <span style={{ fontSize: 12 }}>{z.name}</span>
                                              {z.code && <span style={{ fontSize: 10, color: '#94a3b8' }}>({z.code})</span>}
                                            </div>
                                          </Option>
                                        ))}
                                      </Select>
                                    </Form.Item>
                                  </div>

                                  {/* Arrow */}
                                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>→</div>

                                  {/* Varış */}
                                  <div style={{ padding: '0 4px', overflow: 'hidden', minWidth: 0 }}>
                                    <Form.Item {...restField} name={[name, 'zoneId']} rules={[{ required: true, message: '' }]} style={{ marginBottom: 0 }}>
                                      <Select placeholder="Varış" showSearch optionFilterProp="children" size="small"
                                        style={{ width: '100%' }}
                                        dropdownStyle={{ minWidth: 240 }}>
                                        {zones.map(z => (
                                          <Option key={z.id} value={z.id}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: z.color || '#94a3b8', flexShrink: 0 }} />
                                              <span style={{ fontSize: 12 }}>{z.name}</span>
                                              {z.code && <span style={{ fontSize: 10, color: '#94a3b8' }}>({z.code})</span>}
                                            </div>
                                          </Option>
                                        ))}
                                      </Select>
                                    </Form.Item>
                                  </div>

                                  {/* Çift Yön */}
                                  <div style={{ textAlign: 'center' }}>
                                    <Form.Item {...restField} name={[name, 'bidirectional']} valuePropName="checked" style={{ marginBottom: 0 }}>
                                      <Switch size="small" checkedChildren="↔" unCheckedChildren="→" />
                                    </Form.Item>
                                  </div>

                                  {/* Fix Fiyat */}
                                  <div style={{ padding: '0 2px' }}>
                                    <Form.Item {...restField} name={[name, 'fixedPrice']} style={{ marginBottom: 0 }}>
                                      <InputNumber min={0} step={1} precision={2} placeholder="0" size="small" style={{ width: '100%' }} controls={false} />
                                    </Form.Item>
                                  </div>

                                  {/* Yetişkin */}
                                  <div style={{ padding: '0 2px' }}>
                                    <Form.Item {...restField} name={[name, 'price']} style={{ marginBottom: 0 }}>
                                      <InputNumber min={0} step={1} precision={2} placeholder="0" size="small" style={{ width: '100%' }} controls={false} />
                                    </Form.Item>
                                  </div>

                                  {/* Çocuk */}
                                  <div style={{ padding: '0 2px' }}>
                                    <Form.Item {...restField} name={[name, 'childPrice']} style={{ marginBottom: 0 }}>
                                      <InputNumber min={0} step={1} precision={2} placeholder="0" size="small" style={{ width: '100%' }} controls={false} />
                                    </Form.Item>
                                  </div>

                                  {/* Bebek */}
                                  <div style={{ padding: '0 2px' }}>
                                    <Form.Item {...restField} name={[name, 'babyPrice']} style={{ marginBottom: 0 }}>
                                      <InputNumber min={0} step={1} precision={2} placeholder="0" size="small" style={{ width: '100%' }} controls={false} />
                                    </Form.Item>
                                  </div>

                                  {/* Maliyet */}
                                  <div style={{ padding: '0 2px' }}>
                                    <Form.Item {...restField} name={[name, 'cost']} style={{ marginBottom: 0 }}>
                                      <InputNumber min={0} step={1} precision={2} placeholder="0" size="small" style={{ width: '100%' }} controls={false} />
                                    </Form.Item>
                                  </div>

                                  {/* Aşım/km */}
                                  <div style={{ padding: '0 2px' }}>
                                    <Form.Item {...restField} name={[name, 'extraKmPrice']} style={{ marginBottom: 0 }}>
                                      <InputNumber min={0} step={0.1} precision={2} placeholder="0" size="small" style={{ width: '100%' }} controls={false} />
                                    </Form.Item>
                                  </div>

                                  {/* Alınış Saati */}
                                  <div style={{ padding: '0 2px' }}>
                                    <Form.Item {...restField} name={[name, 'pickupLeadHours']} style={{ marginBottom: 0 }}>
                                      <InputNumber min={0} max={24} step={0.5} precision={1} placeholder="0" size="small" style={{ width: '100%' }} controls={false} />
                                    </Form.Item>
                                  </div>

                                  {/* Delete */}
                                  <div style={{ textAlign: 'center' }}>
                                    <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(name)}
                                      style={{ width: 28, height: 28, padding: 0, borderRadius: 6 }} />
                                  </div>
                                </div>
                              );
                              })}

                              {/* Add button */}
                              <div style={{ padding: '8px 12px', background: '#fafbfc' }}>
                                <Button type="dashed" onClick={() => add({ bidirectional: true })} block icon={<PlusOutlined />} size="small"
                                  style={{ borderRadius: 8, fontWeight: 600, fontSize: 12, color: '#64748b', height: 36 }}>
                                  Yeni Güzergah Ekle
                                </Button>
                              </div>
                            </div>
                          )}
                        </Form.List>
                      </Form>

                      {/* Copy routes modal */}
                      <Modal
                        title={<><CopyOutlined /> Güzergahları Başka Araçtan Kopyala</>}
                        open={copyModalVisible}
                        onCancel={() => { setCopyModalVisible(false); setCopySourceId(''); }}
                        onOk={handleCopyRoutes}
                        okText="Kopyala"
                        cancelText="Vazgeç"
                        okButtonProps={{ disabled: !copySourceId }}
                      >
                        <div style={{ marginBottom: 16 }}>
                          <Text type="secondary" style={{ fontSize: 13 }}>
                            Seçilen araç tipinin güzergahları (kalkış-varış noktaları) mevcut araca kopyalanır.
                            Fiyatlar kopyalanmaz, sadece güzergah bilgileri aktarılır.
                            Zaten var olan güzergahlar tekrar eklenmez.
                          </Text>
                        </div>
                        <Select
                          placeholder="Kaynak araç tipi seçin"
                          value={copySourceId || undefined}
                          onChange={setCopySourceId}
                          style={{ width: '100%' }}
                          showSearch
                          optionFilterProp="children"
                        >
                          {vehicleTypes.filter(vt => vt.id !== selectedType?.id).map(vt => (
                            <Option key={vt.id} value={vt.id}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>{vt.name}</span>
                                <Badge count={vt.zonePrices?.length || 0} style={{ backgroundColor: '#6366f1', fontSize: 10 }} />
                              </div>
                            </Option>
                          ))}
                        </Select>
                      </Modal>
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
