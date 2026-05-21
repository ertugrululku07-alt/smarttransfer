'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Input,
  DatePicker,
  Select,
  Tabs,
  Spin,
  Tag,
  Modal,
  Form,
  InputNumber,
  message,
  Tooltip,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  CalendarOutlined,
  EnvironmentOutlined,
  UserOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';

const { RangePicker } = DatePicker;
const { Option } = Select;

type MarketplaceJob = {
  id: string;
  bookingNumber: string;
  startDate: string;
  b2bPriceType: 'OPEN_BID' | 'FIXED_PRICE';
  b2bPrice: number | null;
  currency: string;
  ownerPartnerId: string | null;
  ownerPartner?: { id: string; fullName?: string; partnerProfile?: { companyName?: string } };
  marketplaceOffers?: Array<any>;
  marketplaceStatus?: string;
  metadata?: Record<string, any>;
  adults?: number;
  children?: number;
  infants?: number;
  marketplaceMeta?: {
    deadlineAt?: string;
    remainingMs?: number | null;
    offerCount?: number;
    highestOfferAmount?: number | null;
    highestOfferCurrency?: string | null;
  };
};

const tr = (n: number) => Number(n || 0).toLocaleString('tr-TR');

function RemainingTime({ iso }: { iso?: string }) {
  const [left, setLeft] = useState<number>(0);
  useEffect(() => {
    if (!iso) return;
    const tick = () => setLeft(Math.max(0, new Date(iso).getTime() - Date.now()));
    tick();
    const timer = setInterval(tick, 1000 * 30);
    return () => clearInterval(timer);
  }, [iso]);

  if (!iso) return <span className="ps-badge ps-badge--neutral">Süre yok</span>;
  if (left <= 0) return <span className="ps-badge ps-badge--danger">Süre doldu</span>;

  const h = Math.floor(left / (1000 * 60 * 60));
  const m = Math.floor((left % (1000 * 60 * 60)) / (1000 * 60));
  return (
    <span className="ps-badge ps-badge--warning">
      <ClockCircleOutlined style={{ fontSize: 10, marginRight: 4 }} />
      {h}s {m}dk
    </span>
  );
}

export default function MarketplacePage() {
  const [partnerId, setPartnerId] = useState<string>('');
  const [activeTab, setActiveTab] = useState('discover');
  const [loading, setLoading] = useState(false);
  const [discover, setDiscover] = useState<MarketplaceJob[]>([]);
  const [myListings, setMyListings] = useState<MarketplaceJob[]>([]);
  const [searchFrom, setSearchFrom] = useState('');
  const [searchTo, setSearchTo] = useState('');
  const [dateRange, setDateRange] = useState<any>(null);
  const [sort, setSort] = useState('latest');
  const [bidModalOpen, setBidModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<MarketplaceJob | null>(null);
  const [bidForm] = Form.useForm();
  const [bidLoading, setBidLoading] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed?.id) setPartnerId(parsed.id);
    } catch {
      /* ignore */
    }
  }, []);

  const loadDiscover = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchFrom) params.set('from', searchFrom);
      if (searchTo) params.set('to', searchTo);
      if (dateRange?.[0]) params.set('dateFrom', dateRange[0].toISOString());
      if (dateRange?.[1]) params.set('dateTo', dateRange[1].toISOString());
      if (sort) params.set('sort', sort);
      const res = await apiClient.get(`/api/transfer/partner/marketplace?${params.toString()}`);
      if (res.data?.success) setDiscover(res.data.data || []);
    } catch {
      message.error('Pazar yeri ilanları yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const loadMyListings = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/transfer/partner/marketplace/my-listings');
      if (res.data?.success) setMyListings(res.data.data || []);
    } catch {
      message.error('İlanlarım yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'discover') loadDiscover();
    else loadMyListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleBid = async () => {
    if (!selectedJob) return;
    try {
      const values = await bidForm.validateFields();
      setBidLoading(true);
      const res = await apiClient.post(`/api/transfer/partner/marketplace/${selectedJob.id}/bid`, {
        amount: values.amount,
        notes: values.notes,
        currency: selectedJob.currency || 'EUR',
      });
      if (res.data?.success) {
        message.success('Teklif kaydedildi');
        setBidModalOpen(false);
        loadDiscover();
      }
    } catch (e: any) {
      if (!e?.errorFields) message.error(e?.response?.data?.error || 'Teklif gönderilemedi');
    } finally {
      setBidLoading(false);
    }
  };

  const acceptOpenBidOffer = async (bookingId: string, offerId: string) => {
    try {
      const res = await apiClient.post(`/api/transfer/partner/marketplace/${bookingId}/offers/${offerId}/accept`);
      if (res.data?.success) {
        message.success('Teklif kabul edildi, iş partnere atandı');
        loadMyListings();
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Teklif kabul edilemedi');
    }
  };

  const closeListing = async (bookingId: string) => {
    try {
      const res = await apiClient.post(`/api/transfer/partner/marketplace/${bookingId}/close`);
      if (res.data?.success) {
        message.success('İlan kapatıldı');
        loadMyListings();
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'İlan kapatılamadı');
    }
  };

  const discoverCards = useMemo(
    () =>
      discover.map((job) => {
        const pickup = job.metadata?.pickup || '—';
        const dropoff = job.metadata?.dropoff || '—';
        const owner = job.ownerPartner?.partnerProfile?.companyName || job.ownerPartner?.fullName || 'Partner';
        const pax = Number(job.adults || 0) + Number(job.children || 0) + Number(job.infants || 0);
        const myOffer = job.marketplaceOffers?.find((o: any) => o.status === 'PENDING' && o.partnerId === partnerId);
        return (
          <div key={job.id} className="ps-card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{job.bookingNumber}</div>
                <div style={{ fontSize: 11, color: 'var(--ps-text-3)' }}>
                  <UserOutlined style={{ marginRight: 4 }} />
                  {owner}
                </div>
              </div>
              {job.b2bPriceType === 'FIXED_PRICE' ? (
                <span className="ps-badge ps-badge--success">Sabit Fiyat</span>
              ) : (
                <span className="ps-badge ps-badge--accent">Açık Artırma</span>
              )}
            </div>

            <div style={{ marginTop: 10 }} className="ps-route">
              <div className="ps-route__line">
                <div className="ps-route__dot ps-route__dot--from" />
                <div className="ps-route__connector" />
                <div className="ps-route__dot ps-route__dot--to" />
              </div>
              <div className="ps-route__detail">
                <div className="ps-route__from">
                  <div className="ps-route__label">Alış</div>
                  <div className="ps-route__address">{pickup}</div>
                </div>
                <div>
                  <div className="ps-route__label">Varış</div>
                  <div className="ps-route__address">{dropoff}</div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className="ps-badge ps-badge--neutral">
                <CalendarOutlined style={{ marginRight: 4, fontSize: 10 }} />
                {dayjs(job.startDate).format('DD MMM HH:mm')}
              </span>
              <span className="ps-badge ps-badge--neutral">{pax} yolcu</span>
              {job.b2bPriceType === 'OPEN_BID' && <RemainingTime iso={job.metadata?.marketplaceBidDeadlineAt} />}
            </div>

            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div>
                {job.b2bPriceType === 'FIXED_PRICE' ? (
                  <div style={{ fontWeight: 800, fontSize: 18 }}>
                    {tr(Number(job.b2bPrice || 0))} {job.currency}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--ps-text-3)' }}>
                    En yüksek teklif:{' '}
                    <b>
                      {job.marketplaceOffers?.[0]
                        ? `${tr(Number(job.marketplaceOffers[0].amount))} ${job.marketplaceOffers[0].currency}`
                        : 'Henüz yok'}
                    </b>
                  </div>
                )}
              </div>

              {job.b2bPriceType === 'FIXED_PRICE' ? (
                <Button type="primary" onClick={() => apiClient.post(`/api/transfer/partner/marketplace/${job.id}/accept`).then(() => {
                  message.success('İş alındı');
                  loadDiscover();
                }).catch((e) => message.error(e?.response?.data?.error || 'İş alınamadı'))}>
                  İşi Al
                </Button>
              ) : (
                <Button
                  type={myOffer ? 'default' : 'primary'}
                  onClick={() => {
                    setSelectedJob(job);
                    bidForm.setFieldsValue({ amount: myOffer ? Number(myOffer.amount) : undefined, notes: myOffer?.notes || '' });
                    setBidModalOpen(true);
                  }}
                >
                  {myOffer ? 'Teklifimi Güncelle' : 'Teklif Ver'}
                </Button>
              )}
            </div>
          </div>
        );
      }),
    [discover, bidForm]
  );

  const myListingCards = useMemo(
    () =>
      myListings.map((job) => {
        const pickup = job.metadata?.pickup || '—';
        const dropoff = job.metadata?.dropoff || '—';
        const offers = job.marketplaceOffers || [];
        const isOpen = job.b2bPriceType === 'OPEN_BID';
        const canAssign = job.marketplaceStatus === 'PUBLISHED' || job.marketplaceStatus === 'EXPIRED';
        return (
          <div key={job.id} className="ps-card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{job.bookingNumber}</div>
                <div style={{ fontSize: 11, color: 'var(--ps-text-3)' }}>
                  <CalendarOutlined style={{ marginRight: 4 }} />
                  {dayjs(job.startDate).format('DD MMM YYYY HH:mm')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span className={`ps-badge ${job.marketplaceStatus === 'ASSIGNED' ? 'ps-badge--success' : job.marketplaceStatus === 'EXPIRED' ? 'ps-badge--danger' : 'ps-badge--accent'}`}>
                  {job.marketplaceStatus || 'PUBLISHED'}
                </span>
                {isOpen && <RemainingTime iso={job.metadata?.marketplaceBidDeadlineAt} />}
              </div>
            </div>

            <div style={{ marginTop: 10 }} className="ps-route">
              <div className="ps-route__line">
                <div className="ps-route__dot ps-route__dot--from" />
                <div className="ps-route__connector" />
                <div className="ps-route__dot ps-route__dot--to" />
              </div>
              <div className="ps-route__detail">
                <div className="ps-route__from">
                  <div className="ps-route__label">Alış</div>
                  <div className="ps-route__address">{pickup}</div>
                </div>
                <div>
                  <div className="ps-route__label">Varış</div>
                  <div className="ps-route__address">{dropoff}</div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--ps-text-3)' }}>
                {isOpen ? (
                  <>
                    Teklif sayısı: <b>{offers.length}</b>{' '}
                    {offers[0] && (
                      <>
                        · En yüksek: <b>{tr(Number(offers[0].amount))} {offers[0].currency}</b>
                      </>
                    )}
                  </>
                ) : (
                  <>Sabit fiyat: <b>{tr(Number(job.b2bPrice || 0))} {job.currency}</b></>
                )}
              </div>
              {job.marketplaceStatus === 'PUBLISHED' && (
                <Button danger icon={<StopOutlined />} onClick={() => closeListing(job.id)}>
                  İlanı Kapat
                </Button>
              )}
            </div>

            {isOpen && offers.length > 0 && canAssign && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--ps-border)', paddingTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>Gelen Teklifler</div>
                  {offers[0] && (
                    <Button
                      type="primary"
                      size="small"
                      onClick={() => acceptOpenBidOffer(job.id, offers[0].id)}
                    >
                      En Yüksek Teklifi Pasla
                    </Button>
                  )}
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {offers.map((offer: any) => (
                    <div key={offer.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, background: 'var(--ps-surface-2)', border: '1px solid var(--ps-border)', borderRadius: 10, padding: '8px 10px' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>
                          {offer.partner?.partnerProfile?.companyName || offer.partner?.fullName || 'Partner'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ps-text-3)' }}>
                          {dayjs(offer.createdAt).format('DD MMM HH:mm')}
                          {offer.notes ? ` · ${offer.notes}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <b style={{ fontSize: 13 }}>{tr(Number(offer.amount))} {offer.currency}</b>
                        <Button type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => acceptOpenBidOffer(job.id, offer.id)}>
                          Pasla
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      }),
    [myListings]
  );

  return (
    <div>
      <div className="ps-page-header">
        <div>
          <h1 className="ps-page-header__title">B2B Pazar Yeri</h1>
          <p className="ps-page-header__subtitle">Açık artırma, teklif süresi, tekliflerden seçip işi paslama</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => (activeTab === 'discover' ? loadDiscover() : loadMyListings())} loading={loading}>
          Yenile
        </Button>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'discover',
            label: 'İş Al',
            children: (
              <>
                <div className="ps-card" style={{ padding: 12, marginBottom: 14 }}>
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '2fr 2fr 2fr 1fr auto' }}>
                    <Input
                      allowClear
                      prefix={<EnvironmentOutlined style={{ color: '#94a3b8' }} />}
                      placeholder="Alış lokasyonu (örn: Antalya Havalimanı)"
                      value={searchFrom}
                      onChange={(e) => setSearchFrom(e.target.value)}
                    />
                    <Input
                      allowClear
                      prefix={<EnvironmentOutlined style={{ color: '#94a3b8' }} />}
                      placeholder="Varış lokasyonu (örn: Alanya)"
                      value={searchTo}
                      onChange={(e) => setSearchTo(e.target.value)}
                    />
                    <RangePicker
                      showTime
                      style={{ width: '100%' }}
                      value={dateRange}
                      onChange={(v) => setDateRange(v)}
                    />
                    <Select value={sort} onChange={setSort}>
                      <Option value="latest">En Yeni</Option>
                      <Option value="date_asc">Tarih (Yakın)</Option>
                      <Option value="price_desc">Fiyat (Yüksek)</Option>
                      <Option value="price_asc">Fiyat (Düşük)</Option>
                    </Select>
                    <Button type="primary" icon={<SearchOutlined />} onClick={loadDiscover}>
                      Filtrele
                    </Button>
                  </div>
                </div>

                {loading ? (
                  <div style={{ textAlign: 'center', padding: 60 }}>
                    <Spin size="large" />
                  </div>
                ) : discoverCards.length === 0 ? (
                  <div className="ps-empty">
                    <div className="ps-empty__icon">
                      <SearchOutlined />
                    </div>
                    <p className="ps-empty__title">Uygun ilan bulunamadı</p>
                    <p className="ps-empty__desc">Filtreleri değiştirip tekrar deneyin</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>{discoverCards}</div>
                )}
              </>
            ),
          },
          {
            key: 'mine',
            label: 'İlanlarım',
            children: loading ? (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <Spin size="large" />
              </div>
            ) : myListingCards.length === 0 ? (
              <div className="ps-empty">
                <div className="ps-empty__icon">
                  <UserOutlined />
                </div>
                <p className="ps-empty__title">İlanınız yok</p>
                <p className="ps-empty__desc">Yeni iş ekle bölümünden açık artırma ilanı oluşturabilirsiniz</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))' }}>{myListingCards}</div>
            ),
          },
        ]}
      />

      <Modal
        open={bidModalOpen}
        title="Teklif Ver / Güncelle"
        onCancel={() => setBidModalOpen(false)}
        onOk={handleBid}
        okText="Teklifi Kaydet"
        confirmLoading={bidLoading}
        centered
      >
        <Form form={bidForm} layout="vertical">
          <Form.Item name="amount" label={`Teklif Tutarı (${selectedJob?.currency || 'EUR'})`} rules={[{ required: true, message: 'Tutar giriniz' }]}>
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
          <Form.Item name="notes" label="Not (Opsiyonel)">
            <Input.TextArea rows={3} placeholder="Örn: VIP araç + İngilizce konuşan sürücü" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

