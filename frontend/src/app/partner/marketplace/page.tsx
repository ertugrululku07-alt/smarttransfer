'use client';

import React, { useState, useEffect } from 'react';
import {
  Button, Modal, Form, InputNumber, Input, message, Spin, Row, Col, Tag,
} from 'antd';
import {
  GlobalOutlined, EnvironmentOutlined, CalendarOutlined, CarOutlined,
  DollarOutlined, UserOutlined, ReloadOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';

dayjs.locale('tr');

interface Booking {
  id: string;
  bookingNumber: string;
  startDate: string;
  metadata: any;
  adults: number;
  children: number;
  infants: number;
  b2bPriceType: 'FIXED_PRICE' | 'OPEN_BID';
  b2bPrice: number;
  currency: string;
  ownerPartnerId: string;
  ownerPartner: { id: string; companyName: string };
  marketplaceOffers: any[];
}

export default function MarketplacePage() {
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [partnerId, setPartnerId] = useState('');
  const [bidModalVisible, setBidModalVisible] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Booking | null>(null);
  const [bidForm] = Form.useForm();
  const [bidding, setBidding] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) { try { setPartnerId(JSON.parse(stored).id); } catch {} }
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/transfer/partner/marketplace');
      if (res.data.success) setJobs(res.data.data || []);
    } catch { message.error('İlanlar yüklenemedi'); }
    finally { setLoading(false); }
  };

  const submitBid = async () => {
    try {
      const values = await bidForm.validateFields();
      setBidding(true);
      const res = await apiClient.post(`/api/transfer/partner/marketplace/${selectedJob?.id}/bid`, {
        amount: values.amount, currency: selectedJob?.currency || 'EUR', notes: values.notes,
      });
      if (res.data.success) { message.success('Teklifiniz gönderildi!'); setBidModalVisible(false); fetchJobs(); }
    } catch (err: any) {
      if (!err?.errorFields) message.error(err.response?.data?.error || 'Teklif gönderilemedi');
    } finally { setBidding(false); }
  };

  const acceptFixed = (job: Booking) => {
    Modal.confirm({
      title: 'Bu işi almak istediğinize emin misiniz?',
      content: `${job.b2bPrice} ${job.currency} karşılığında doğrudan size atanacaktır.`,
      okText: 'Evet, İşi Al', cancelText: 'Vazgeç',
      onOk: async () => {
        try {
          const res = await apiClient.post(`/api/transfer/partner/marketplace/${job.id}/accept`);
          if (res.data.success) { message.success('İş başarıyla alındı!'); fetchJobs(); }
        } catch (err: any) { message.error(err.response?.data?.error || 'İş alınamadı'); }
      },
    });
  };

  return (
    <div>
      <div className="ps-page-header">
        <div>
          <h1 className="ps-page-header__title">B2B Pazar Yeri</h1>
          <p className="ps-page-header__subtitle">Partner ilanlarını görüntüle, teklif ver veya direkt al</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchJobs} loading={loading}>Yenile</Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : jobs.length === 0 ? (
        <div className="ps-empty">
          <div className="ps-empty__icon"><GlobalOutlined /></div>
          <p className="ps-empty__title">Şu an ilan yok</p>
          <p className="ps-empty__desc">Yeni iş ilanları geldiğinde burada listelenir</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {jobs.map(job => {
            const isMyJob = job.ownerPartnerId === partnerId;
            const hasBid = job.marketplaceOffers?.some((o: any) => o.partnerId === partnerId);
            const pax = (job.adults || 0) + (job.children || 0);

            return (
              <div key={job.id} className="ps-card" style={{ overflow: 'hidden' }}>
                <div style={{ height: 3, background: job.b2bPriceType === 'FIXED_PRICE' ? '#10b981' : '#6366f1' }} />
                <div style={{ padding: '18px 20px' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ps-text)' }}>{job.bookingNumber}</span>
                        <span className={`ps-badge ${job.b2bPriceType === 'FIXED_PRICE' ? 'ps-badge--success' : 'ps-badge--accent'}`}>
                          {job.b2bPriceType === 'FIXED_PRICE' ? 'Sabit Fiyat' : 'Açık Teklif'}
                        </span>
                        {isMyJob && <span className="ps-badge ps-badge--neutral">Sizin İlanınız</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ps-text-3)' }}>
                        <UserOutlined style={{ marginRight: 4 }} />{job.ownerPartner?.companyName}
                        <span style={{ margin: '0 6px' }}>·</span>
                        <CalendarOutlined style={{ marginRight: 4 }} />{dayjs(job.startDate).format('DD MMM YYYY HH:mm')}
                        <span style={{ margin: '0 6px' }}>·</span>
                        <UserOutlined style={{ marginRight: 4 }} />{pax} yolcu
                      </div>
                    </div>
                    {job.b2bPriceType === 'FIXED_PRICE' && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: 'var(--ps-text-3)', marginBottom: 2 }}>Fiyat</div>
                        <div style={{ fontWeight: 900, fontSize: 22, color: 'var(--ps-text)' }}>
                          {Number(job.b2bPrice).toLocaleString('tr-TR')} {job.currency}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Route */}
                  <div className="ps-route" style={{ marginBottom: 16 }}>
                    <div className="ps-route__line">
                      <div className="ps-route__dot ps-route__dot--from" />
                      <div className="ps-route__connector" />
                      <div className="ps-route__dot ps-route__dot--to" />
                    </div>
                    <div className="ps-route__detail">
                      <div className="ps-route__from">
                        <div className="ps-route__label">Alış</div>
                        <div className="ps-route__address">{job.metadata?.pickup || '—'}</div>
                      </div>
                      <div>
                        <div className="ps-route__label">Varış</div>
                        <div className="ps-route__address">{job.metadata?.dropoff || '—'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--ps-text-3)' }}>
                      {job.marketplaceOffers?.length > 0
                        ? `${job.marketplaceOffers.length} teklif var`
                        : 'Henüz teklif yok'}
                    </div>
                    {!isMyJob && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        {job.b2bPriceType === 'OPEN_BID' && (
                          <Button
                            type="primary" ghost disabled={hasBid}
                            icon={<DollarOutlined />}
                            onClick={() => { setSelectedJob(job); bidForm.resetFields(); setBidModalVisible(true); }}
                          >
                            {hasBid ? 'Teklifiniz Gönderildi' : 'Teklif Ver'}
                          </Button>
                        )}
                        {job.b2bPriceType === 'FIXED_PRICE' && (
                          <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => acceptFixed(job)}>
                            İşi Al
                          </Button>
                        )}
                      </div>
                    )}
                    {isMyJob && (
                      <span className="ps-badge ps-badge--neutral">Bu ilan size ait</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        title="Fiyat Teklifi Ver"
        open={bidModalVisible}
        onCancel={() => setBidModalVisible(false)}
        onOk={submitBid}
        confirmLoading={bidding}
        okText="Teklifi Gönder"
        cancelText="İptal"
        centered
      >
        <p style={{ color: 'var(--ps-text-3)', marginBottom: 20, fontSize: 13 }}>
          B2B fiyatınızı girin. İlan sahibi en uygun teklifi seçecektir.
        </p>
        <Form form={bidForm} layout="vertical">
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="amount" label="Teklif Tutarı" rules={[{ required: true, message: 'Tutar giriniz' }]}>
                <InputNumber style={{ width: '100%' }} size="large" min={1} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Para Birimi">
                <Input value={selectedJob?.currency || 'EUR'} disabled size="large" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Not (Opsiyonel)">
            <Input.TextArea placeholder="Varsa notunuz…" rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
