'use client';

import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, DatePicker, Empty, Form, Input, InputNumber, Modal, Select, Space, Spin, Switch, Tag, TimePicker, message,
} from 'antd';
import { FilePdfOutlined, MailOutlined, ReloadOutlined, CarOutlined, SettingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import dynamic from 'next/dynamic';
import apiClient, { API_URL } from '@/lib/api-client';

const FleetLiveMap = dynamic(() => import('../FleetLiveMap'), { ssr: false, loading: () => <Spin /> });

export default function FleetReportsPage() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehicleId, setVehicleId] = useState<string | undefined>();
  const [date, setDate] = useState(dayjs());
  const [speedLimit, setSpeedLimit] = useState(120);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [autoConfig, setAutoConfig] = useState<any>({
    autoEmail: false,
    recipients: [],
    speedLimit: 120,
    sendHour: 20,
    sendMinute: 0,
    includeAllVehicles: true,
    vehicleIds: [],
    minPointCount: 5,
  });
  const [configForm] = Form.useForm();

  useEffect(() => {
    Promise.all([
      apiClient.get('/api/partner-fleet/vehicles'),
      apiClient.get('/api/partner-fleet/driving-report/config'),
    ]).then(([veh, cfg]) => {
      if (veh.data?.success) {
        const list = veh.data.data || [];
        setVehicles(list);
        if (list[0]) setVehicleId(list[0].id);
      }
      if (cfg.data?.success) {
        setAutoConfig(cfg.data.data);
        if (cfg.data.data.recipients?.[0]) setEmailTo(cfg.data.data.recipients[0]);
      }
    });
  }, []);

  const loadReport = async () => {
    if (!vehicleId) return message.warning('Araç seçin');
    setLoading(true);
    try {
      const r = await apiClient.get('/api/partner-fleet/driving-report', {
        params: { vehicleId, date: date.format('YYYY-MM-DD'), speedLimit },
      });
      if (r.data?.success) setReport(r.data.data);
      else message.error(r.data?.error || 'Rapor alınamadı');
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Hata');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (vehicleId) loadReport(); }, [vehicleId]);

  const openPdf = () => {
    if (!vehicleId) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const q = new URLSearchParams({
      vehicleId,
      date: date.format('YYYY-MM-DD'),
      speedLimit: String(speedLimit),
    });
    fetch(`${API_URL}/api/partner-fleet/driving-report/pdf?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.text())
      .then((html) => {
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
      })
      .catch(() => message.error('PDF açılamadı'));
  };

  const sendEmail = async () => {
    if (!vehicleId) return message.warning('Araç seçin');
    setSending(true);
    try {
      const r = await apiClient.post('/api/partner-fleet/driving-report/send-email', {
        vehicleId,
        date: date.format('YYYY-MM-DD'),
        speedLimit,
        to: emailTo || undefined,
        recipients: emailTo ? [emailTo] : autoConfig.recipients,
      });
      if (r.data?.success) message.success(`E-posta gönderildi: ${r.data.data.to?.join(', ')}`);
      else message.error(r.data?.error || 'Gönderilemedi');
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'SMTP hatası — Ayarlar > Tanımlamalar');
    } finally { setSending(false); }
  };

  const openConfig = () => {
    configForm.setFieldsValue({
      ...autoConfig,
      recipientsText: (autoConfig.recipients || []).join(', '),
      sendTime: dayjs().hour(autoConfig.sendHour || 20).minute(autoConfig.sendMinute || 0),
    });
    setConfigOpen(true);
  };

  const saveConfig = async () => {
    setConfigSaving(true);
    try {
      const v = await configForm.validateFields();
      const recipients = String(v.recipientsText || '')
        .split(/[,;]/)
        .map((s: string) => s.trim())
        .filter(Boolean);
      const sendTime = v.sendTime || dayjs().hour(20).minute(0);
      const payload = {
        autoEmail: !!v.autoEmail,
        recipients,
        speedLimit: v.speedLimit || 120,
        sendHour: sendTime.hour(),
        sendMinute: sendTime.minute(),
        includeAllVehicles: v.includeAllVehicles !== false,
        vehicleIds: v.vehicleIds || [],
        minPointCount: v.minPointCount || 5,
      };
      const r = await apiClient.put('/api/partner-fleet/driving-report/config', payload);
      if (r.data?.success) {
        setAutoConfig(r.data.data);
        if (recipients[0]) setEmailTo(recipients[0]);
        message.success('Otomatik rapor ayarları kaydedildi');
        setConfigOpen(false);
      }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Kaydedilemedi');
    } finally { setConfigSaving(false); }
  };

  const rep = report?.report;
  const grade = rep?.grade;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {autoConfig.autoEmail && (
        <Alert
          showIcon
          type="success"
          message={`Otomatik günlük rapor aktif — her gün ${String(autoConfig.sendHour || 20).padStart(2, '0')}:${String(autoConfig.sendMinute || 0).padStart(2, '0')} · ${autoConfig.recipients?.length || 0} alıcı`}
          description="Telemetri verisi olan araçlar için HTML sürüş raporu e-posta ile gönderilir. SMTP: Ayarlar > Tanımlamalar."
        />
      )}

      <Card size="small" title={<span><FilePdfOutlined style={{ marginRight: 8, color: 'var(--brand-primary)' }} /> Günlük Sürüş Raporu</span>}
        extra={
          <Space wrap>
            <Button icon={<SettingOutlined />} onClick={openConfig}>Otomatik E-posta</Button>
            <Button icon={<ReloadOutlined />} onClick={loadReport} loading={loading}>Hesapla</Button>
          </Space>
        }
      >
        <Space wrap style={{ marginBottom: 14 }}>
          <Select style={{ width: 220 }} showSearch optionFilterProp="label" value={vehicleId} onChange={setVehicleId}
            options={vehicles.map((v: any) => ({ value: v.id, label: `${v.plate} · ${v.brand || ''} ${v.model || ''}` }))} />
          <DatePicker value={date} onChange={(d) => d && setDate(d)} format="DD.MM.YYYY" />
          <Select style={{ width: 160 }} value={speedLimit} onChange={setSpeedLimit}
            options={[90, 100, 110, 120, 130].map((v) => ({ value: v, label: `Hız limiti ${v} km/sa` }))} />
          <Input style={{ width: 220 }} placeholder="E-posta alıcı" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} prefix={<MailOutlined />} />
          <Button type="primary" icon={<FilePdfOutlined />} onClick={openPdf} disabled={!rep}>PDF / Yazdır</Button>
          <Button icon={<MailOutlined />} onClick={sendEmail} loading={sending} disabled={!rep}>E-posta Gönder</Button>
        </Space>

        {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div> : !rep ? (
          <Empty description="Rapor için araç ve tarih seçin" />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
              <div className="ps-kpi"><div className="ps-kpi__label">Mesafe</div><div className="ps-kpi__value">{rep.distanceKm} km</div></div>
              <div className="ps-kpi"><div className="ps-kpi__label">Ort. Hız</div><div className="ps-kpi__value">{rep.avgSpeed} km/sa</div></div>
              <div className="ps-kpi"><div className="ps-kpi__label">Maks. Hız</div><div className="ps-kpi__value">{rep.maxSpeed} km/sa</div></div>
              <div className="ps-kpi" style={{ borderLeft: `3px solid ${grade?.color || 'var(--brand-primary)'}` }}>
                <div className="ps-kpi__label">Davranış Skoru</div>
                <div className="ps-kpi__value">{rep.score}/100 · {grade?.grade}</div>
              </div>
              <div className="ps-kpi"><div className="ps-kpi__label">Hız İhlali</div><div className="ps-kpi__value">{rep.speedViolations}</div></div>
              <div className="ps-kpi"><div className="ps-kpi__label">Ani Fren</div><div className="ps-kpi__value">{rep.harshBrakes}</div></div>
              <div className="ps-kpi"><div className="ps-kpi__label">Ani Hızlanma</div><div className="ps-kpi__value">{rep.harshAccels}</div></div>
              <div className="ps-kpi"><div className="ps-kpi__label">Yakıt</div><div className="ps-kpi__value">{rep.fuelLiters || 0} L · {Number(rep.fuelTotal || 0).toLocaleString('tr-TR')} ₺</div></div>
            </div>

            {rep.route?.length >= 2 ? (
              <FleetLiveMap markers={[]} route={rep.route} height={360} />
            ) : (
              <Empty description="Bu gün için rota noktası yok" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}

            <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
              <CarOutlined /> {report.vehicle?.plate} · {rep.pointCount} telemetri noktası ·
              {rep.startAt ? ` ${dayjs(rep.startAt).format('HH:mm')}` : ''} – {rep.endAt ? dayjs(rep.endAt).format('HH:mm') : ''}
              {grade && <Tag color={grade.color} style={{ marginLeft: 8 }}>{grade.label}</Tag>}
            </div>
          </>
        )}
      </Card>

      <Modal
        title={<span><SettingOutlined /> Otomatik Günlük Rapor Ayarları</span>}
        open={configOpen}
        onCancel={() => setConfigOpen(false)}
        onOk={saveConfig}
        confirmLoading={configSaving}
        okText="Kaydet"
        cancelText="Vazgeç"
        width={560}
      >
        <Alert showIcon type="info" style={{ marginBottom: 12 }}
          message="Belirlediğiniz saatte tüm araçlar (veya seçili araçlar) için sürüş raporu otomatik e-posta ile gönderilir."
          description="SMTP ayarlarının Tanımlamalar sekmesinde yapılandırılmış olması gerekir." />
        <Form form={configForm} layout="vertical">
          <Form.Item label="Otomatik e-posta" name="autoEmail" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item label="Alıcılar (virgülle ayırın)" name="recipientsText" rules={[{ required: true, message: 'En az bir alıcı' }]}>
            <Input placeholder="filo@sirket.com, operasyon@sirket.com" />
          </Form.Item>
          <Space wrap style={{ width: '100%' }}>
            <Form.Item label="Gönderim saati" name="sendTime"><TimePicker format="HH:mm" /></Form.Item>
            <Form.Item label="Varsayılan hız limiti" name="speedLimit"><InputNumber min={60} max={200} addonAfter="km/sa" /></Form.Item>
            <Form.Item label="Min. telemetri noktası" name="minPointCount" help="Bu sayının altında rapor gönderilmez"><InputNumber min={1} max={100} /></Form.Item>
          </Space>
          <Form.Item label="Tüm filo" name="includeAllVehicles" valuePropName="checked"><Switch checkedChildren="Tümü" unCheckedChildren="Seçili" /></Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.includeAllVehicles !== c.includeAllVehicles}>
            {({ getFieldValue }) => !getFieldValue('includeAllVehicles') && (
              <Form.Item label="Rapor gönderilecek araçlar" name="vehicleIds">
                <Select mode="multiple" showSearch optionFilterProp="label"
                  options={vehicles.map((v: any) => ({ value: v.id, label: v.plate }))} />
              </Form.Item>
            )}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
