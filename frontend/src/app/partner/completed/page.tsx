'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Spin, Input, DatePicker, Select, Empty } from 'antd';
import {
  SearchOutlined, FilterOutlined, ReloadOutlined,
  CheckCircleOutlined, CalendarOutlined, UserOutlined,
  CarOutlined, DollarOutlined,
} from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;

export default function CompletedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);

  const fetchCompleted = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/transfer/partner/completed-bookings?limit=50');
      if (res.data?.success) {
        setTransfers(res.data.data || []);
        setTotal(res.data.total || res.data.data?.length || 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCompleted(); }, []);

  const filtered = transfers.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.bookingNumber?.toLowerCase().includes(q) ||
      t.customer?.name?.toLowerCase().includes(q) ||
      t.pickup?.location?.toLowerCase().includes(q) ||
      t.dropoff?.location?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="ps-page-header">
        <div>
          <h1 className="ps-page-header__title">Tamamlanan Transferler</h1>
          <p className="ps-page-header__subtitle">{total} transfer tamamlandı</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchCompleted} loading={loading}>Yenile</Button>
      </div>

      {/* Search */}
      <div className="ps-card" style={{ marginBottom: 20, padding: '14px 20px' }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          placeholder="Rezervasyon no, müşteri adı veya adres ara…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          size="large"
          allowClear
          style={{ borderRadius: 10 }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : filtered.length === 0 ? (
        <div className="ps-empty">
          <div className="ps-empty__icon"><CheckCircleOutlined /></div>
          <p className="ps-empty__title">{search ? 'Sonuç bulunamadı' : 'Tamamlanan transfer yok'}</p>
          <p className="ps-empty__desc">{search ? 'Farklı bir arama terimi deneyin' : 'Tamamlanan transferler burada görünecek'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(t => (
            <div
              key={t.id}
              className="ps-card"
              onClick={() => router.push(`/partner/booking/${t.id}`)}
              style={{ cursor: 'pointer', transition: 'box-shadow 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--ps-shadow-md)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--ps-shadow-sm)')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', flexWrap: 'wrap' }}>
                {/* Status icon */}
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  <CheckCircleOutlined />
                </div>
                {/* Booking info */}
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ps-text)' }}>{t.bookingNumber}</span>
                    <span className="ps-badge ps-badge--success">Tamamlandı</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ps-text-3)' }}>
                    <CalendarOutlined style={{ marginRight: 4 }} />
                    {t.pickup?.time || (t.createdAt ? dayjs(t.createdAt).format('DD MMM YYYY') : '—')}
                  </div>
                </div>
                {/* Customer */}
                <div style={{ minWidth: 120 }}>
                  <div style={{ fontSize: 12, color: 'var(--ps-text-3)', marginBottom: 2 }}>
                    <UserOutlined style={{ marginRight: 4 }} />Müşteri
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t.customer?.name || '—'}</div>
                </div>
                {/* Route */}
                <div style={{ flex: 2, minWidth: 160 }}>
                  <div style={{ fontSize: 12, color: 'var(--ps-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.pickup?.location}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ps-text-3)', marginTop: 2 }}>↓</div>
                  <div style={{ fontSize: 12, color: 'var(--ps-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.dropoff?.location}
                  </div>
                </div>
                {/* Price */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--ps-text)' }}>
                    {t.price?.amount} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ps-text-3)' }}>{t.price?.currency}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
