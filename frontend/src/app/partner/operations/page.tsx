'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  DatePicker,
  Dropdown,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  PhoneOutlined,
  CheckCircleOutlined,
  StopOutlined,
  EnvironmentOutlined,
  CalendarOutlined,
  AppstoreOutlined,
  DownloadOutlined,
  EyeOutlined,
  SaveOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';

const { Option } = Select;
const { RangePicker } = DatePicker;

type PartnerBooking = {
  id: string;
  bookingNumber: string;
  customer: { name: string; phone?: string };
  pickup: { location: string; time: string };
  dropoff: { location: string };
  vehicle: { type: string; pax: number };
  price: { amount: number; currency: string };
  status: string;
  operationalStatus?: string;
  paymentStatus?: string;
  completedAt?: string;
};

type StatusFilter = 'all' | 'inop' | 'pool';

type FilterPreset = {
  id: string;
  name: string;
  tab: 'active' | 'shuttle' | 'completed';
  search: string;
  pickupFilter: string;
  dropoffFilter: string;
  statusFilter: StatusFilter;
  dateRange: [string | null, string | null];
};

type ColumnConfig = {
  key: string;
  title: string;
  visible: boolean;
};

const FILTER_PRESETS_STORAGE_KEY = 'partner-operations-filter-presets-v1';
const COLUMN_CONFIG_STORAGE_KEY = 'partner-operations-columns-v1';

const STATUS_COLOR_PRESET: Record<string, string> = {
  COMPLETED: 'green',
  IN_OPERATION: 'blue',
  POOL: 'purple',
  IN_POOL: 'purple',
  CANCELLED: 'red',
};

function routeDirection(pickup: string, dropoff: string) {
  const p = String(pickup || '').toLocaleLowerCase('tr');
  const d = String(dropoff || '').toLocaleLowerCase('tr');
  const airportWords = ['havaliman', 'airport', 'havaalan'];
  const pAir = airportWords.some((w) => p.includes(w));
  const dAir = airportWords.some((w) => d.includes(w));
  if (pAir && !dAir) return 'GELİŞ';
  if (!pAir && dAir) return 'GİDİŞ';
  return 'ARA';
}

export default function PartnerOperationsPage() {
  const [tab, setTab] = useState<'active' | 'shuttle' | 'completed'>('active');
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<PartnerBooking[]>([]);
  const [completed, setCompleted] = useState<PartnerBooking[]>([]);
  const [search, setSearch] = useState('');
  const [pickupFilter, setPickupFilter] = useState('');
  const [dropoffFilter, setDropoffFilter] = useState('');
  const [dateRange, setDateRange] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isColumnsModalOpen, setIsColumnsModalOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([]);
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([
    { key: 'index', title: '#', visible: true },
    { key: 'bookingNumber', title: 'T.KOD', visible: true },
    { key: 'direction', title: 'YÖN', visible: true },
    { key: 'customer', title: 'AD SOYAD', visible: true },
    { key: 'pickupTime', title: 'TRF. SAATİ', visible: true },
    { key: 'pickupLocation', title: 'ALIŞ BÖLGE', visible: true },
    { key: 'dropoffLocation', title: 'VARIŞ BÖLGE', visible: true },
    { key: 'pax', title: 'PAX', visible: true },
    { key: 'vehicleType', title: 'ARAÇ TİPİ', visible: true },
    { key: 'amount', title: 'TUTAR', visible: true },
    { key: 'status', title: 'DURUM', visible: true },
    { key: 'actions', title: 'İŞLEMLER', visible: true },
  ]);

  const load = async () => {
    setLoading(true);
    try {
      const [aRes, cRes] = await Promise.allSettled([
        apiClient.get('/api/transfer/partner/active-bookings'),
        apiClient.get('/api/transfer/partner/completed-bookings'),
      ]);
      if (aRes.status === 'fulfilled' && aRes.value.data?.success) setActive(aRes.value.data.data || []);
      if (cRes.status === 'fulfilled' && cRes.value.data?.success) setCompleted(cRes.value.data.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTER_PRESETS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setFilterPresets(parsed);
      }
    } catch {
      setFilterPresets([]);
    }

    try {
      const raw = localStorage.getItem(COLUMN_CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setColumnConfigs((prev) =>
            prev.map((cfg) => {
              const found = parsed.find((p: ColumnConfig) => p.key === cfg.key);
              return found ? { ...cfg, visible: !!found.visible } : cfg;
            })
          );
        }
      }
    } catch {
      // keep defaults
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(FILTER_PRESETS_STORAGE_KEY, JSON.stringify(filterPresets));
  }, [filterPresets]);

  useEffect(() => {
    localStorage.setItem(COLUMN_CONFIG_STORAGE_KEY, JSON.stringify(columnConfigs));
  }, [columnConfigs]);

  const source = useMemo(() => {
    if (tab === 'completed') return completed;
    if (tab === 'shuttle') return active.filter((b) => b.operationalStatus === 'POOL' || b.operationalStatus === 'IN_POOL');
    return active;
  }, [tab, active, completed]);

  const filtered = useMemo(() => {
    let rows = [...source];
    if (statusFilter === 'inop') rows = rows.filter((r) => r.operationalStatus === 'IN_OPERATION');
    if (statusFilter === 'pool') rows = rows.filter((r) => r.operationalStatus === 'POOL' || r.operationalStatus === 'IN_POOL');

    if (search.trim()) {
      const q = search.trim().toLocaleLowerCase('tr');
      rows = rows.filter((r) =>
        r.bookingNumber?.toLocaleLowerCase('tr').includes(q) ||
        r.customer?.name?.toLocaleLowerCase('tr').includes(q) ||
        r.customer?.phone?.includes(q)
      );
    }

    if (pickupFilter.trim()) {
      const q = pickupFilter.trim().toLocaleLowerCase('tr');
      rows = rows.filter((r) => String(r.pickup?.location || '').toLocaleLowerCase('tr').includes(q));
    }
    if (dropoffFilter.trim()) {
      const q = dropoffFilter.trim().toLocaleLowerCase('tr');
      rows = rows.filter((r) => String(r.dropoff?.location || '').toLocaleLowerCase('tr').includes(q));
    }

    if (dateRange?.[0] && dateRange?.[1]) {
      const from = dayjs(dateRange[0]).startOf('day').valueOf();
      const to = dayjs(dateRange[1]).endOf('day').valueOf();
      rows = rows.filter((r) => {
        const time = dayjs(r.completedAt || r.pickup?.time).valueOf();
        return time >= from && time <= to;
      });
    }
    return rows;
  }, [source, search, pickupFilter, dropoffFilter, dateRange, statusFilter]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const inOperation = filtered.filter((r) => r.operationalStatus === 'IN_OPERATION').length;
    const inPool = filtered.filter((r) => r.operationalStatus === 'POOL' || r.operationalStatus === 'IN_POOL').length;
    const gross = filtered.reduce((sum, r) => sum + Number(r.price?.amount || 0), 0);
    return { total, inOperation, inPool, gross };
  }, [filtered]);

  const applyPreset = (preset: FilterPreset) => {
    setTab(preset.tab);
    setSearch(preset.search);
    setPickupFilter(preset.pickupFilter);
    setDropoffFilter(preset.dropoffFilter);
    setStatusFilter(preset.statusFilter);
    const [from, to] = preset.dateRange;
    if (from && to) {
      setDateRange([dayjs(from), dayjs(to)]);
    } else {
      setDateRange(null);
    }
  };

  const saveCurrentFilterPreset = () => {
    const name = newPresetName.trim();
    if (!name) {
      message.warning('Preset adı gerekli');
      return;
    }

    const preset: FilterPreset = {
      id: `${Date.now()}`,
      name,
      tab,
      search,
      pickupFilter,
      dropoffFilter,
      statusFilter,
      dateRange: [dateRange?.[0]?.toISOString?.() || null, dateRange?.[1]?.toISOString?.() || null],
    };

    setFilterPresets((prev) => [preset, ...prev].slice(0, 8));
    setNewPresetName('');
    message.success('Filtre preset kaydedildi');
  };

  const removePreset = (id: string) => {
    setFilterPresets((prev) => prev.filter((p) => p.id !== id));
    message.success('Preset silindi');
  };

  const setColumnVisibility = (key: string, visible: boolean) => {
    setColumnConfigs((prev) => prev.map((cfg) => (cfg.key === key ? { ...cfg, visible } : cfg)));
  };

  const moveColumn = (key: string, direction: 'up' | 'down') => {
    setColumnConfigs((prev) => {
      const idx = prev.findIndex((cfg) => cfg.key === key);
      if (idx < 0) return prev;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const exportCsv = () => {
    if (!filtered.length) {
      message.warning('Disa aktarim icin kayit bulunamadi');
      return;
    }

    const rows = filtered.map((r) => ({
      bookingNumber: r.bookingNumber || '',
      customer: r.customer?.name || '',
      phone: r.customer?.phone || '',
      pickupTime: r.pickup?.time || '',
      pickup: r.pickup?.location || '',
      dropoff: r.dropoff?.location || '',
      pax: r.vehicle?.pax || '',
      vehicleType: r.vehicle?.type || '',
      amount: Number(r.price?.amount || 0),
      currency: r.price?.currency || '',
      status: r.operationalStatus || r.status || '',
    }));
    const header = Object.keys(rows[0]).join(',');
    const body = rows
      .map((row) =>
        Object.values(row)
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');
    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `partner-operations-${dayjs().format('YYYYMMDD-HHmm')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    message.success('CSV export tamamlandi');
  };

  const handleStatus = async (row: PartnerBooking, target: 'COMPLETED' | 'CANCELLED') => {
    setActionLoading(row.id + target);
    try {
      const payload =
        target === 'COMPLETED'
          ? { status: 'COMPLETED', subStatus: 'COMPLETED' }
          : { status: 'CANCELLED', subStatus: 'PARTNER_REJECTED' };
      const res = await apiClient.put(`/api/transfer/bookings/${row.id}/status`, payload);
      if (res.data?.success) {
        message.success(target === 'COMPLETED' ? 'Operasyon tamamlandı' : 'Operasyon iptal edildi');
        await load();
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'İşlem başarısız');
    } finally {
      setActionLoading(null);
    }
  };

  const columnsByKey: Record<string, any> = {
    index: {
      key: 'index',
      title: '#',
      width: 55,
      render: (_: any, __: any, i: number) => i + 1,
      fixed: 'left',
    },
    bookingNumber: {
      key: 'bookingNumber',
      title: 'T.KOD',
      dataIndex: 'bookingNumber',
      width: 130,
      render: (v: string) => <b>{v}</b>,
    },
    direction: {
      key: 'direction',
      title: 'YÖN',
      width: 70,
      render: (_: any, r: PartnerBooking) => {
        const dir = routeDirection(r.pickup?.location, r.dropoff?.location);
        const color = dir === 'GELİŞ' ? 'green' : dir === 'GİDİŞ' ? 'blue' : 'default';
        return <Tag color={color}>{dir}</Tag>;
      },
    },
    customer: {
      key: 'customer',
      title: 'AD SOYAD',
      width: 180,
      render: (_: any, r: PartnerBooking) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.customer?.name}</div>
          {r.customer?.phone && (
            <div style={{ fontSize: 11, color: '#64748b' }}>
              <PhoneOutlined style={{ marginRight: 4 }} />
              {r.customer.phone}
            </div>
          )}
        </div>
      ),
    },
    pickupTime: {
      key: 'pickupTime',
      title: 'TRF. SAATİ',
      width: 150,
      render: (_: any, r: PartnerBooking) => (
        <span>
          <CalendarOutlined style={{ marginRight: 5, color: '#64748b' }} />
          {r.pickup?.time || '-'}
        </span>
      ),
    },
    pickupLocation: {
      key: 'pickupLocation',
      title: 'ALIŞ BÖLGE',
      dataIndex: ['pickup', 'location'],
      width: 250,
      ellipsis: true,
    },
    dropoffLocation: {
      key: 'dropoffLocation',
      title: 'VARIŞ BÖLGE',
      dataIndex: ['dropoff', 'location'],
      width: 250,
      ellipsis: true,
    },
    pax: {
      key: 'pax',
      title: 'PAX',
      width: 70,
      render: (_: any, r: PartnerBooking) => r.vehicle?.pax || '-',
    },
    vehicleType: {
      key: 'vehicleType',
      title: 'ARAÇ TİPİ',
      width: 120,
      render: (_: any, r: PartnerBooking) => r.vehicle?.type || '-',
    },
    amount: {
      key: 'amount',
      title: 'TUTAR',
      width: 120,
      render: (_: any, r: PartnerBooking) => (
        <b>
          {Number(r.price?.amount || 0).toLocaleString('tr-TR')} {r.price?.currency || ''}
        </b>
      ),
    },
    status: {
      key: 'status',
      title: 'DURUM',
      width: 130,
      render: (_: any, r: PartnerBooking) => {
        if (tab === 'completed') return <Tag color="green">TAMAMLANDI</Tag>;
        if (r.operationalStatus === 'IN_OPERATION') {
          return <Tag color={STATUS_COLOR_PRESET.IN_OPERATION}>OPERASYONDA</Tag>;
        }
        if (r.operationalStatus === 'POOL' || r.operationalStatus === 'IN_POOL') {
          return <Tag color={STATUS_COLOR_PRESET.POOL}>HAVUZDA</Tag>;
        }
        return <Tag color={STATUS_COLOR_PRESET[r.status] || 'default'}>{r.status || '-'}</Tag>;
      },
    },
    actions: {
      key: 'actions',
      title: 'İŞLEMLER',
      fixed: 'right',
      width: tab === 'completed' ? 110 : 210,
      render: (_: any, r: PartnerBooking) =>
        tab === 'completed' ? (
          <Button size="small" onClick={() => window.open(`tel:${r.customer?.phone || ''}`)} disabled={!r.customer?.phone}>
            Ara
          </Button>
        ) : (
          <Space>
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={actionLoading === r.id + 'COMPLETED'}
              onClick={() => handleStatus(r, 'COMPLETED')}
            >
              Bitir
            </Button>
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              loading={actionLoading === r.id + 'CANCELLED'}
              onClick={() => handleStatus(r, 'CANCELLED')}
            >
              İptal
            </Button>
          </Space>
        ),
    },
  };

  const columns = useMemo(() => {
    return columnConfigs
      .filter((cfg) => cfg.visible)
      .map((cfg) => columnsByKey[cfg.key])
      .filter(Boolean);
  }, [columnConfigs, tab, actionLoading]);

  return (
    <div className="partner-page partner-page--wide">
      <div className="ps-page-header">
        <div>
          <h1 className="ps-page-header__title">
            <AppstoreOutlined style={{ color: '#6366f1', marginRight: 8 }} />
            Operasyon
          </h1>
          <p className="ps-page-header__subtitle">Süper admin görünümüne yakın partner operasyon ekranı</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Yenile
        </Button>
      </div>

      <div className="ps-card" style={{ padding: 12, marginBottom: 10 }}>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
          <Segmented
            value={tab}
            onChange={(v) => setTab(v as any)}
            options={[
              { label: 'Özel Transferler', value: 'active' },
              { label: 'Shuttle Seferleri', value: 'shuttle' },
              { label: 'Tamamlanan Operasyonlar', value: 'completed' },
            ]}
          />
          <Select value={statusFilter} style={{ width: 150 }} onChange={(v) => setStatusFilter(v)}>
            <Option value="all">Hepsi</Option>
            <Option value="inop">Operasyonda</Option>
            <Option value="pool">Havuzda</Option>
          </Select>
          </Space>
          <Space wrap>
            <Tooltip title="Filtrelenen kayitlari CSV olarak indir">
              <Button icon={<DownloadOutlined />} onClick={exportCsv}>
                Export
              </Button>
            </Tooltip>
            <Button icon={<EyeOutlined />} onClick={() => setIsColumnsModalOpen(true)}>
              Kolonlar
            </Button>
          </Space>
        </Space>
      </div>

      <div className="ps-card" style={{ padding: 12, marginBottom: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr 2fr 1.5fr', gap: 8, marginBottom: 10 }}>
          <Input
            allowClear
            placeholder="Ara (T.KOD / Ad Soyad / Telefon)"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Input
            allowClear
            placeholder="Alış bölge (örn: AYT)"
            prefix={<EnvironmentOutlined />}
            value={pickupFilter}
            onChange={(e) => setPickupFilter(e.target.value)}
          />
          <Input
            allowClear
            placeholder="Varış bölge (örn: Alanya)"
            prefix={<EnvironmentOutlined />}
            value={dropoffFilter}
            onChange={(e) => setDropoffFilter(e.target.value)}
          />
          <RangePicker style={{ width: '100%' }} value={dateRange} onChange={(v) => setDateRange(v)} />
          <Button onClick={() => {
            setSearch('');
            setPickupFilter('');
            setDropoffFilter('');
            setDateRange(null);
            setStatusFilter('all');
          }}>
            Temizle
          </Button>
        </div>
        <Space wrap>
          <Input
            style={{ width: 210 }}
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder="Yeni preset adi"
            suffix={<SaveOutlined />}
          />
          <Button type="primary" onClick={saveCurrentFilterPreset}>
            Preset Kaydet
          </Button>
          <Select
            style={{ minWidth: 240 }}
            placeholder="Kayitli filtreyi uygula"
            onChange={(id: string) => {
              const preset = filterPresets.find((p) => p.id === id);
              if (preset) applyPreset(preset);
            }}
            options={filterPresets.map((preset) => ({
              label: preset.name,
              value: preset.id,
            }))}
          />
          <Dropdown
            menu={{
              items: filterPresets.map((preset) => ({
                key: preset.id,
                label: preset.name,
                icon: <DeleteOutlined />,
              })),
              onClick: ({ key }) => removePreset(String(key)),
            }}
            disabled={!filterPresets.length}
          >
            <Button danger>Preset Sil</Button>
          </Dropdown>
        </Space>
      </div>

      <div
        className="ps-card"
        style={{ padding: 12, marginBottom: 10, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}
      >
        <div className="ps-kpi">
          <div className="ps-kpi__label">Toplam Kayıt</div>
          <div className="ps-kpi__value">{stats.total}</div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi__label">Operasyonda</div>
          <div className="ps-kpi__value">{stats.inOperation}</div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi__label">Havuzda</div>
          <div className="ps-kpi__value">{stats.inPool}</div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi__label">Toplam Tutar</div>
          <div className="ps-kpi__value">{stats.gross.toLocaleString('tr-TR')}</div>
        </div>
      </div>

      <div className="ps-card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <Spin size="large" />
          </div>
        ) : (
          <Table
            rowKey="id"
            dataSource={filtered}
            columns={columns}
            pagination={{ pageSize: 20 }}
            scroll={{ x: 1700 }}
            size="small"
            locale={{ emptyText: 'Kayıt listeleniyor: 0' }}
          />
        )}
      </div>

      <Modal
        title="Kolon Yönetimi"
        open={isColumnsModalOpen}
        onCancel={() => setIsColumnsModalOpen(false)}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={6}>
          {columnConfigs.map((cfg, idx) => (
            <div
              key={cfg.key}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                alignItems: 'center',
                gap: 8,
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '8px 10px',
              }}
            >
              <Checkbox checked={cfg.visible} onChange={(e) => setColumnVisibility(cfg.key, e.target.checked)}>
                {cfg.title}
              </Checkbox>
              <Space size={4}>
                <Button
                  size="small"
                  icon={<ArrowUpOutlined />}
                  onClick={() => moveColumn(cfg.key, 'up')}
                  disabled={idx === 0}
                />
                <Button
                  size="small"
                  icon={<ArrowDownOutlined />}
                  onClick={() => moveColumn(cfg.key, 'down')}
                  disabled={idx === columnConfigs.length - 1}
                />
              </Space>
              <span style={{ color: '#64748b', fontSize: 12 }}>{idx + 1}</span>
            </div>
          ))}
        </Space>
      </Modal>
    </div>
  );
}

