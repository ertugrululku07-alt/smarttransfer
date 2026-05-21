'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  DatePicker,
  Drawer,
  Dropdown,
  Empty,
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
  AppstoreOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  CalendarOutlined,
  CarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  FormOutlined,
  HolderOutlined,
  InfoCircleOutlined,
  LoginOutlined,
  LogoutOutlined,
  MailOutlined,
  MessageOutlined,
  MoreOutlined,
  PhoneOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SearchOutlined,
  StopOutlined,
  SwapOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';

const { Option } = Select;
const { RangePicker } = DatePicker;

type Driver = {
  id: string;
  name: string;
  phone?: string;
  avatar?: string | null;
  isOnline?: boolean;
  lastSeenAt?: string | null;
};

type Vehicle = {
  id: string;
  plate: string;
  brand?: string;
  model?: string;
  capacity?: number;
  category?: string | null;
  driverId?: string | null;
};

type PartnerBooking = {
  id: string;
  bookingNumber: string;
  customer: { name: string; phone?: string; email?: string; avatar?: string };
  pickup: {
    location: string;
    time: string;
    timeDate?: string;
    lat?: number | null;
    lng?: number | null;
    note?: string;
    zoneCode?: string | null;
    iata?: string | null;
  };
  dropoff: {
    location: string;
    lat?: number | null;
    lng?: number | null;
    zoneCode?: string | null;
    iata?: string | null;
  };
  vehicle: { type: string; pax?: number; children?: number; infants?: number; luggage?: number };
  assignedVehicle?: Vehicle | null;
  driver?: Driver | null;
  price: { amount: number; currency: string };
  status: string;
  operationalStatus?: string;
  paymentStatus?: string;
  flightNumber?: string;
  flightTime?: string;
  internalNotes?: string;
  specialRequests?: string;
  completedAt?: string;
  pickedUpAt?: string | null;
  droppedOffAt?: string | null;
  agencyName?: string;
};

type TabKey = 'active' | 'pool' | 'completed';
type StatusFilter = 'all' | 'CONFIRMED' | 'DRIVER_ASSIGNED' | 'IN_OPERATION' | 'PASSENGER_PICKED_UP' | 'ON_THE_WAY';

type FilterPreset = {
  id: string;
  name: string;
  tab: TabKey;
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

const FILTER_PRESETS_STORAGE_KEY = 'partner-operations-filter-presets-v2';
const COLUMN_CONFIG_STORAGE_KEY = 'partner-operations-columns-v2';

const STATUS_META: Record<string, { label: string; color: string }> = {
  CONFIRMED: { label: 'Onaylandı', color: 'gold' },
  DRIVER_ASSIGNED: { label: 'Şoför Atandı', color: 'geekblue' },
  IN_OPERATION: { label: 'Operasyonda', color: 'blue' },
  PASSENGER_PICKED_UP: { label: 'Yolcu Alındı', color: 'cyan' },
  ON_THE_WAY: { label: 'Yolda', color: 'purple' },
  COMPLETED: { label: 'Tamamlandı', color: 'green' },
  CANCELLED: { label: 'İptal', color: 'red' },
  POOL: { label: 'Havuzda', color: 'magenta' },
  IN_POOL: { label: 'Havuzda', color: 'magenta' },
};

const CANCEL_REASONS: { value: string; label: string }[] = [
  { value: 'CUSTOMER_NOT_FOUND', label: 'Müşteri bulunamadı / Gelmedi' },
  { value: 'PAYMENT_ISSUE', label: 'Ödeme problemi' },
  { value: 'DRIVER_UNAVAILABLE', label: 'Şoför hazırlanamadı' },
  { value: 'VEHICLE_PROBLEM', label: 'Araç arızası' },
  { value: 'WEATHER', label: 'Hava koşulları' },
  { value: 'OTHER', label: 'Diğer' },
];

const IATA_REGEX = /\b(AYT|GZP|IST|SAW|ESB|ADB|BJV|DLM|ADA|TZX|ASR|VAS|AOE|EZS|VAN|NAV|ECN|KCO|SZF)\b/i;
const ZONE_HINTS: Record<string, string> = {
  alanya: 'ALANYA',
  manavgat: 'MANAVGAT',
  side: 'SIDE',
  kemer: 'KEMER',
  belek: 'BELEK',
  konaklı: 'KONAKLI',
  antalya: 'ANTALYA',
  kalkan: 'KALKAN',
  kaş: 'KAS',
  kas: 'KAS',
  fethiye: 'FETHIYE',
  kundu: 'KUNDU',
  lara: 'LARA',
  okurcalar: 'OKURCALAR',
  gazipaşa: 'GZP',
  gazipasa: 'GZP',
  havaliman: 'HAVALIMANI',
};

function extractIataFallback(b: { pickup?: { location?: string }; dropoff?: { location?: string }; flightNumber?: string }) {
  const t = `${b.pickup?.location || ''} ${b.dropoff?.location || ''} ${b.flightNumber || ''}`;
  const m = IATA_REGEX.exec(t);
  return m ? m[1] : null;
}

function extractZoneFallback(location?: string) {
  if (!location) return null;
  const l = location.toLocaleLowerCase('tr');
  for (const key of Object.keys(ZONE_HINTS)) {
    if (l.includes(key)) return ZONE_HINTS[key];
  }
  return null;
}

function routeDirection(pickup?: string, dropoff?: string) {
  const p = String(pickup || '').toLocaleLowerCase('tr');
  const d = String(dropoff || '').toLocaleLowerCase('tr');
  const airportWords = ['havaliman', 'airport', 'havaalan', 'ayt', 'gzp'];
  const pAir = airportWords.some((w) => p.includes(w));
  const dAir = airportWords.some((w) => d.includes(w));
  if (pAir && !dAir) return 'GELİŞ';
  if (!pAir && dAir) return 'GİDİŞ';
  return 'ARA';
}

function openMaps(b: PartnerBooking) {
  const dest = encodeURIComponent(b.dropoff?.location || '');
  const origin = encodeURIComponent(b.pickup?.location || '');
  window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`, '_blank');
}

function formatPickupTime(value?: string) {
  if (!value) return '-';
  return value;
}

function RowActions({
  row,
  tab,
  actionLoading,
  onDetail,
  onEdit,
  onCall,
  onComplete,
  onCancel,
  onPool,
  onUnconfirm,
  onInOperation,
  onPickedUp,
  onOnWay,
  onUetds,
  onMessage,
  onNote,
}: {
  row: PartnerBooking;
  tab: TabKey;
  actionLoading: string | null;
  onDetail: () => void;
  onEdit: () => void;
  onCall: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onPool: () => void;
  onUnconfirm: () => void;
  onInOperation: () => void;
  onPickedUp: () => void;
  onOnWay: () => void;
  onUetds: () => void;
  onMessage: () => void;
  onNote: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (tab === 'completed') {
    return (
      <Space size={4}>
        <Tooltip title="Detay">
          <Button size="small" icon={<EyeOutlined />} onClick={onDetail} />
        </Tooltip>
        <Tooltip title="Müşteriyi ara">
          <Button size="small" icon={<PhoneOutlined />} disabled={!row.customer?.phone} onClick={onCall} />
        </Tooltip>
        <Tooltip title="UETDS'ye Gönder">
          <Button size="small" icon={<CloudUploadOutlined />} onClick={onUetds} />
        </Tooltip>
      </Space>
    );
  }

  const items = [
    { key: 'detail', icon: <EyeOutlined />, label: 'Detay Görüntüle' },
    { key: 'edit', icon: <FormOutlined />, label: 'Rezervasyonu Düzenle' },
    { type: 'divider' as const },
    { key: 'inop', icon: <ThunderboltOutlined style={{ color: '#6366f1' }} />, label: 'Operasyona Al' },
    { key: 'picked', icon: <CheckCircleOutlined style={{ color: '#10b981' }} />, label: 'Yolcu Alındı' },
    { key: 'onway', icon: <CarOutlined style={{ color: '#3b82f6' }} />, label: 'Yolda' },
    { key: 'complete', icon: <CheckCircleOutlined style={{ color: '#16a34a' }} />, label: 'Tamamla' },
    { type: 'divider' as const },
    { key: 'note', icon: <EditOutlined />, label: 'Operasyon Notu' },
    { key: 'pool', icon: <SwapOutlined />, label: 'Havuza Gönder' },
    { key: 'unconfirm', icon: <RollbackOutlined />, label: 'Geri Al (Rezervasyona)' },
    { type: 'divider' as const },
    { key: 'uetds', icon: <CloudUploadOutlined style={{ color: '#f59e0b' }} />, label: "UETDS'ye Gönder" },
    {
      key: 'message',
      icon: <MessageOutlined style={{ color: '#6366f1' }} />,
      label: 'Mesaj Gönder',
      disabled: !row.driver?.id,
    },
    { type: 'divider' as const },
    { key: 'cancel', icon: <StopOutlined />, danger: true, label: 'İptal Et' },
  ];

  const handleMenu = ({ key }: { key: string }) => {
    setOpen(false);
    switch (key) {
      case 'detail':
        onDetail();
        break;
      case 'edit':
        onEdit();
        break;
      case 'inop':
        onInOperation();
        break;
      case 'picked':
        onPickedUp();
        break;
      case 'onway':
        onOnWay();
        break;
      case 'complete':
        onComplete();
        break;
      case 'note':
        onNote();
        break;
      case 'pool':
        onPool();
        break;
      case 'unconfirm':
        onUnconfirm();
        break;
      case 'uetds':
        onUetds();
        break;
      case 'message':
        onMessage();
        break;
      case 'cancel':
        onCancel();
        break;
    }
  };

  return (
    <Space size={4} onClick={(e) => e.stopPropagation()}>
      <Tooltip title="Detay">
        <Button size="small" icon={<EyeOutlined />} onClick={onDetail} />
      </Tooltip>
      <Tooltip title="Tamamla">
        <Button
          size="small"
          type="primary"
          icon={<CheckCircleOutlined />}
          loading={actionLoading === `${row.id}:status:COMPLETED`}
          onClick={onComplete}
        />
      </Tooltip>
      <Tooltip title="Müşteriyi ara">
        <Button size="small" icon={<PhoneOutlined />} disabled={!row.customer?.phone} onClick={onCall} />
      </Tooltip>
      <Dropdown
        menu={{ items, onClick: handleMenu }}
        trigger={['click']}
        open={open}
        onOpenChange={setOpen}
        placement="bottomRight"
        getPopupContainer={() => document.body}
        destroyPopupOnHide
      >
        <Button size="small" icon={<MoreOutlined />} />
      </Dropdown>
    </Space>
  );
}

function SortableRow({
  cfg,
  onToggle,
}: {
  cfg: ColumnConfig;
  onToggle: (key: string, visible: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cfg.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        gap: 10,
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '8px 10px',
        background: '#fff',
      }}
    >
      <span
        {...attributes}
        {...listeners}
        style={{ cursor: 'grab', color: '#94a3b8', display: 'inline-flex' }}
        aria-label="Sürükle"
      >
        <HolderOutlined />
      </span>
      <Checkbox checked={cfg.visible} onChange={(e) => onToggle(cfg.key, e.target.checked)}>
        {cfg.title}
      </Checkbox>
      <span style={{ color: '#94a3b8', fontSize: 11 }}>{cfg.key}</span>
    </div>
  );
}

export default function PartnerOperationsPage() {
  const [tab, setTab] = useState<TabKey>('active');
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<PartnerBooking[]>([]);
  const [completed, setCompleted] = useState<PartnerBooking[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const [search, setSearch] = useState('');
  const [pickupFilter, setPickupFilter] = useState('');
  const [dropoffFilter, setDropoffFilter] = useState('');
  const [dateRange, setDateRange] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'GELİŞ' | 'GİDİŞ' | 'ARA'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [isColumnsDrawerOpen, setIsColumnsDrawerOpen] = useState(false);
  const [isPresetsDrawerOpen, setIsPresetsDrawerOpen] = useState(false);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<PartnerBooking | null>(null);
  const [cancelModal, setCancelModal] = useState<{ row: PartnerBooking; reason: string; note: string } | null>(null);
  const [editNoteRow, setEditNoteRow] = useState<{ row: PartnerBooking; value: string } | null>(null);
  const [messageModal, setMessageModal] = useState<{ row: PartnerBooking; text: string } | null>(null);
  const [uetdsModal, setUetdsModal] = useState<{
    row: PartnerBooking;
    vehiclePlate: string;
    driverTc: string;
    driverFirstName: string;
    driverLastName: string;
    driverPhone: string;
    passengerTc: string;
    passengerFirstName: string;
    passengerLastName: string;
    baslangicIl: string;
    bitisIl: string;
    baslangicIlce: string;
    bitisIlce: string;
  } | null>(null);

  const [newPresetName, setNewPresetName] = useState('');
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([]);

  const defaultColumnConfigs: ColumnConfig[] = [
    { key: 'index', title: '#', visible: true },
    { key: 'bookingNumber', title: 'T.KOD', visible: true },
    { key: 'direction', title: 'YÖN', visible: true },
    { key: 'agency', title: 'ACENTE', visible: true },
    { key: 'customer', title: 'AD SOYAD', visible: true },
    { key: 'pickupTime', title: 'TRF. SAATİ', visible: true },
    { key: 'flightTime', title: 'UÇUŞ SAATİ', visible: false },
    { key: 'pickupZone', title: 'A.BÖLGE', visible: true },
    { key: 'dropoffZone', title: 'V.BÖLGE', visible: true },
    { key: 'pickupLocation', title: 'ALIŞ NOKTASI', visible: false },
    { key: 'dropoffLocation', title: 'VARIŞ NOKTASI', visible: false },
    { key: 'pax', title: 'PAX', visible: true },
    { key: 'iata', title: 'IATA', visible: true },
    { key: 'vehicleType', title: 'ARAÇ TİPİ', visible: true },
    { key: 'driverInline', title: 'ŞOFÖR', visible: true },
    { key: 'vehicleInline', title: 'ARAÇ', visible: true },
    { key: 'note', title: 'OP. NOTU', visible: false },
    { key: 'amount', title: 'TUTAR', visible: true },
    { key: 'payment', title: 'ÖDEME', visible: false },
    { key: 'status', title: 'DURUM', visible: true },
    { key: 'actions', title: 'İŞLEMLER', visible: true },
  ];
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>(defaultColumnConfigs);
  const initialLoadDone = useRef(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const load = async () => {
    setLoading(true);
    try {
      const [aRes, cRes, fRes] = await Promise.allSettled([
        apiClient.get('/api/transfer/partner/active-bookings'),
        apiClient.get('/api/transfer/partner/completed-bookings'),
        apiClient.get('/api/transfer/partner/operations/fleet'),
      ]);
      if (aRes.status === 'fulfilled' && aRes.value.data?.success) setActive(aRes.value.data.data || []);
      if (cRes.status === 'fulfilled' && cRes.value.data?.success) setCompleted(cRes.value.data.data || []);
      if (fRes.status === 'fulfilled' && fRes.value.data?.success) {
        setDrivers(fRes.value.data.data?.drivers || []);
        setVehicles(fRes.value.data.data?.vehicles || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        if (Array.isArray(parsed) && parsed.length) {
          const next: ColumnConfig[] = [];
          parsed.forEach((p: ColumnConfig) => {
            const def = defaultColumnConfigs.find((d) => d.key === p.key);
            if (def) next.push({ ...def, visible: !!p.visible });
          });
          defaultColumnConfigs.forEach((d) => {
            if (!next.find((n) => n.key === d.key)) next.push(d);
          });
          setColumnConfigs(next);
        }
      }
    } catch {
      // ignore
    }
    initialLoadDone.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialLoadDone.current) return;
    localStorage.setItem(FILTER_PRESETS_STORAGE_KEY, JSON.stringify(filterPresets));
  }, [filterPresets]);

  useEffect(() => {
    if (!initialLoadDone.current) return;
    localStorage.setItem(COLUMN_CONFIG_STORAGE_KEY, JSON.stringify(columnConfigs));
  }, [columnConfigs]);

  const source = useMemo(() => {
    if (tab === 'completed') return completed;
    if (tab === 'pool') return active.filter((b) => b.operationalStatus === 'POOL' || b.operationalStatus === 'IN_POOL');
    return active;
  }, [tab, active, completed]);

  const filtered = useMemo(() => {
    let rows = [...source];
    if (statusFilter !== 'all') rows = rows.filter((r) => r.operationalStatus === statusFilter);
    if (directionFilter !== 'all') rows = rows.filter((r) => routeDirection(r.pickup?.location, r.dropoff?.location) === directionFilter);

    if (search.trim()) {
      const q = search.trim().toLocaleLowerCase('tr');
      rows = rows.filter(
        (r) =>
          r.bookingNumber?.toLocaleLowerCase('tr').includes(q) ||
          r.customer?.name?.toLocaleLowerCase('tr').includes(q) ||
          (r.customer?.phone || '').includes(q) ||
          (r.flightNumber || '').toLocaleLowerCase('tr').includes(q)
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
        const time = dayjs(r.pickup?.timeDate || r.completedAt || r.pickup?.time).valueOf();
        return time >= from && time <= to;
      });
    }
    return rows;
  }, [source, search, pickupFilter, dropoffFilter, dateRange, statusFilter, directionFilter]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const inOperation = filtered.filter((r) => r.operationalStatus === 'IN_OPERATION').length;
    const assigned = filtered.filter((r) => r.operationalStatus === 'DRIVER_ASSIGNED' || !!r.driver).length;
    const inPool = filtered.filter((r) => r.operationalStatus === 'POOL' || r.operationalStatus === 'IN_POOL').length;
    const gross = filtered.reduce((sum, r) => sum + Number(r.price?.amount || 0), 0);
    return { total, inOperation, assigned, inPool, gross };
  }, [filtered]);

  const applyPreset = (preset: FilterPreset) => {
    setTab(preset.tab);
    setSearch(preset.search);
    setPickupFilter(preset.pickupFilter);
    setDropoffFilter(preset.dropoffFilter);
    setStatusFilter(preset.statusFilter);
    const [from, to] = preset.dateRange;
    if (from && to) setDateRange([dayjs(from), dayjs(to)]);
    else setDateRange(null);
    setIsPresetsDrawerOpen(false);
    message.success(`"${preset.name}" filtresi uygulandı`);
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
    setFilterPresets((prev) => [preset, ...prev].slice(0, 12));
    setNewPresetName('');
    message.success('Filtre preset kaydedildi');
  };

  const removePreset = (id: string) => {
    setFilterPresets((prev) => prev.filter((p) => p.id !== id));
  };

  const setColumnVisibility = (key: string, visible: boolean) => {
    setColumnConfigs((prev) => prev.map((cfg) => (cfg.key === key ? { ...cfg, visible } : cfg)));
  };

  const onColumnDragEnd = (event: DragEndEvent) => {
    const { active: a, over } = event;
    if (!over || a.id === over.id) return;
    setColumnConfigs((prev) => {
      const oldIndex = prev.findIndex((c) => c.key === a.id);
      const newIndex = prev.findIndex((c) => c.key === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const resetColumns = () => {
    setColumnConfigs(defaultColumnConfigs);
    message.success('Kolonlar varsayılana döndürüldü');
  };

  const exportCsv = () => {
    if (!filtered.length) {
      message.warning('Dışa aktarım için kayıt yok');
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
      driver: r.driver?.name || '',
      vehiclePlate: r.assignedVehicle?.plate || '',
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
    message.success('CSV indirildi');
  };

  // ──────────────────────────────────────────────────────────
  // ACTIONS
  // ──────────────────────────────────────────────────────────
  const assignDriver = async (row: PartnerBooking, driverId: string | null) => {
    setActionLoading(`${row.id}:driver`);
    try {
      const res = await apiClient.patch(`/api/transfer/partner/operations/${row.id}/assign`, { driverId });
      if (res.data?.success) {
        message.success(driverId ? 'Şoför atandı' : 'Şoför kaldırıldı');
        await load();
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Şoför atanamadı');
    } finally {
      setActionLoading(null);
    }
  };

  const assignVehicle = async (row: PartnerBooking, vehicleId: string | null) => {
    setActionLoading(`${row.id}:vehicle`);
    try {
      const res = await apiClient.patch(`/api/transfer/partner/operations/${row.id}/assign`, { vehicleId });
      if (res.data?.success) {
        message.success(vehicleId ? 'Araç atandı' : 'Araç kaldırıldı');
        await load();
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Araç atanamadı');
    } finally {
      setActionLoading(null);
    }
  };

  const transitionStatus = async (row: PartnerBooking, operationalStatus: string) => {
    setActionLoading(`${row.id}:status:${operationalStatus}`);
    try {
      const payload: any = { operationalStatus };
      if (operationalStatus === 'COMPLETED') {
        payload.status = 'COMPLETED';
      } else if (operationalStatus === 'IN_OPERATION' || operationalStatus === 'PASSENGER_PICKED_UP' || operationalStatus === 'ON_THE_WAY') {
        payload.status = 'IN_PROGRESS';
      }
      const res = await apiClient.patch(`/api/transfer/partner/operations/${row.id}/status`, payload);
      if (res.data?.success) {
        message.success('Durum güncellendi');
        await load();
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Durum güncellenemedi');
    } finally {
      setActionLoading(null);
    }
  };

  const submitCancel = async () => {
    if (!cancelModal) return;
    const { row, reason, note } = cancelModal;
    if (!reason) {
      message.warning('İptal nedeni seçin');
      return;
    }
    setActionLoading(`${row.id}:cancel`);
    try {
      const res = await apiClient.patch(`/api/transfer/partner/operations/${row.id}/status`, {
        status: 'CANCELLED',
        subStatus: reason,
        cancelReason: note || CANCEL_REASONS.find((r) => r.value === reason)?.label,
      });
      if (res.data?.success) {
        message.success('İptal edildi');
        setCancelModal(null);
        await load();
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'İptal edilemedi');
    } finally {
      setActionLoading(null);
    }
  };

  const saveNote = async () => {
    if (!editNoteRow) return;
    setActionLoading(`${editNoteRow.row.id}:note`);
    try {
      const res = await apiClient.patch(`/api/transfer/partner/operations/${editNoteRow.row.id}/note`, {
        internalNotes: editNoteRow.value,
      });
      if (res.data?.success) {
        message.success('Not güncellendi');
        setEditNoteRow(null);
        await load();
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Not güncellenemedi');
    } finally {
      setActionLoading(null);
    }
  };

  const sendToPool = async (row: PartnerBooking) => {
    setActionLoading(`${row.id}:pool`);
    try {
      const res = await apiClient.patch(`/api/transfer/partner/operations/${row.id}/status`, {
        operationalStatus: 'POOL',
      });
      if (res.data?.success) {
        message.success('Havuza gönderildi');
        await load();
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Havuza gönderilemedi');
    } finally {
      setActionLoading(null);
    }
  };

  const sendBackToReservation = async (row: PartnerBooking) => {
    Modal.confirm({
      title: 'Rezervasyona geri al?',
      content:
        'Bu rezervasyon onaylı listenizden kalkacak, şoför ataması temizlenecek ve tekrar pazar yerine düşecek. Devam edilsin mi?',
      okText: 'Evet, geri al',
      cancelText: 'Vazgeç',
      okButtonProps: { danger: true },
      onOk: async () => {
        setActionLoading(`${row.id}:unconfirm`);
        try {
          const res = await apiClient.patch(`/api/transfer/partner/operations/${row.id}/status`, {
            status: 'PENDING',
          });
          if (res.data?.success) {
            message.success('Rezervasyona geri alındı');
            await load();
          }
        } catch (e: any) {
          message.error(e?.response?.data?.error || 'İşlem başarısız');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const submitMessage = async () => {
    if (!messageModal) return;
    if (!messageModal.row.driver?.id) {
      message.warning('Bu rezervasyona henüz şoför atanmamış');
      return;
    }
    if (!messageModal.text.trim()) {
      message.warning('Mesaj boş olamaz');
      return;
    }
    setActionLoading(`${messageModal.row.id}:msg`);
    try {
      const res = await apiClient.post('/api/messages', {
        receiverId: messageModal.row.driver.id,
        bookingId: messageModal.row.id,
        content: messageModal.text.trim(),
        format: 'TEXT',
      });
      if (res.data?.success) {
        message.success('Mesaj gönderildi');
        setMessageModal(null);
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Mesaj gönderilemedi');
    } finally {
      setActionLoading(null);
    }
  };

  const submitUetds = async () => {
    if (!uetdsModal) return;
    const m = uetdsModal;
    if (!m.vehiclePlate || !m.driverTc || !m.driverFirstName || !m.driverLastName || !m.passengerTc || !m.passengerFirstName || !m.passengerLastName) {
      message.warning('Lütfen zorunlu alanları doldurun');
      return;
    }
    setActionLoading(`${m.row.id}:uetds`);
    try {
      const res = await apiClient.post('/api/transfer/partner/uetds-submit', {
        bookingId: m.row.id,
        vehiclePlate: m.vehiclePlate.toUpperCase().replace(/\s+/g, ''),
        driverTc: m.driverTc,
        driverFirstName: m.driverFirstName,
        driverLastName: m.driverLastName,
        driverPhone: m.driverPhone,
        passengerTc: m.passengerTc,
        passengerFirstName: m.passengerFirstName,
        passengerLastName: m.passengerLastName,
        baslangicIl: m.baslangicIl,
        baslangicIlce: m.baslangicIlce,
        bitisIl: m.bitisIl,
        bitisIlce: m.bitisIlce,
      });
      if (res.data?.success) {
        message.success('UETDS bildirimi gönderildi. Sefer ID: ' + (res.data.data?.uetdsSeferId || ''));
        setUetdsModal(null);
        await load();
      } else {
        message.error(res.data?.error || 'UETDS gönderimi başarısız');
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'UETDS gönderilemedi');
    } finally {
      setActionLoading(null);
    }
  };

  const openUetdsModal = (row: PartnerBooking) => {
    const nameParts = (row.customer?.name || '').split(' ');
    setUetdsModal({
      row,
      vehiclePlate: row.assignedVehicle?.plate || '',
      driverTc: '',
      driverFirstName: row.driver?.name?.split(' ')[0] || '',
      driverLastName: row.driver?.name?.split(' ').slice(1).join(' ') || '',
      driverPhone: row.driver?.phone || '',
      passengerTc: '',
      passengerFirstName: nameParts[0] || '',
      passengerLastName: nameParts.slice(1).join(' ') || '',
      baslangicIl: 'Antalya',
      baslangicIlce: '',
      bitisIl: 'Antalya',
      bitisIlce: '',
    });
  };

  // ──────────────────────────────────────────────────────────
  // COLUMNS
  // ──────────────────────────────────────────────────────────
  const columnsByKey: Record<string, any> = {
    index: {
      key: 'index',
      title: '#',
      width: 50,
      fixed: 'left',
      render: (_: any, __: any, i: number) => <span style={{ color: '#64748b' }}>{i + 1}</span>,
    },
    bookingNumber: {
      key: 'bookingNumber',
      title: 'T.KOD',
      dataIndex: 'bookingNumber',
      width: 130,
      fixed: 'left',
      render: (v: string, r: PartnerBooking) => (
        <a
          onClick={() => {
            setDetailRow(r);
            setIsDetailDrawerOpen(true);
          }}
          style={{ fontWeight: 700, color: '#4f46e5' }}
        >
          {v}
        </a>
      ),
    },
    direction: {
      key: 'direction',
      title: 'YÖN',
      width: 90,
      render: (_: any, r: PartnerBooking) => {
        const dir = routeDirection(r.pickup?.location, r.dropoff?.location);
        if (dir === 'GELİŞ') {
          return (
            <Tag
              icon={<LoginOutlined />}
              color="green"
              style={{ fontWeight: 700, padding: '2px 8px', borderRadius: 12 }}
            >
              GELİŞ
            </Tag>
          );
        }
        if (dir === 'GİDİŞ') {
          return (
            <Tag
              icon={<LogoutOutlined />}
              color="orange"
              style={{ fontWeight: 700, padding: '2px 8px', borderRadius: 12 }}
            >
              GİDİŞ
            </Tag>
          );
        }
        return (
          <Tag icon={<SwapOutlined />} color="default" style={{ fontWeight: 700, padding: '2px 8px', borderRadius: 12 }}>
            ARA
          </Tag>
        );
      },
    },
    agency: {
      key: 'agency',
      title: 'ACENTE',
      width: 140,
      render: (_: any, r: PartnerBooking) => (
        <span style={{ fontWeight: 600, color: '#1e293b' }}>{r.agencyName || 'Direkt'}</span>
      ),
    },
    flightTime: {
      key: 'flightTime',
      title: 'UÇUŞ SAATİ',
      width: 120,
      render: (_: any, r: PartnerBooking) =>
        r.flightTime ? (
          <span style={{ color: '#1e293b' }}>
            <ClockCircleOutlined style={{ marginRight: 4, color: '#94a3b8' }} />
            {r.flightTime}
          </span>
        ) : (
          <span style={{ color: '#cbd5e1' }}>—</span>
        ),
    },
    pickupZone: {
      key: 'pickupZone',
      title: 'A.BÖLGE',
      width: 120,
      render: (_: any, r: PartnerBooking) => {
        const code = r.pickup?.zoneCode || extractZoneFallback(r.pickup?.location);
        return code ? (
          <Tag color="cyan" style={{ fontWeight: 700, letterSpacing: 0.5 }}>{String(code).toUpperCase()}</Tag>
        ) : (
          <span style={{ color: '#cbd5e1' }}>—</span>
        );
      },
    },
    dropoffZone: {
      key: 'dropoffZone',
      title: 'V.BÖLGE',
      width: 120,
      render: (_: any, r: PartnerBooking) => {
        const code = r.dropoff?.zoneCode || extractZoneFallback(r.dropoff?.location);
        return code ? (
          <Tag color="purple" style={{ fontWeight: 700, letterSpacing: 0.5 }}>{String(code).toUpperCase()}</Tag>
        ) : (
          <span style={{ color: '#cbd5e1' }}>—</span>
        );
      },
    },
    iata: {
      key: 'iata',
      title: 'IATA',
      width: 80,
      render: (_: any, r: PartnerBooking) => {
        const iata = r.pickup?.iata || r.dropoff?.iata || extractIataFallback(r);
        return iata ? <Tag color="blue" style={{ fontWeight: 700 }}>{String(iata).toUpperCase()}</Tag> : <span style={{ color: '#cbd5e1' }}>—</span>;
      },
    },
    customer: {
      key: 'customer',
      title: 'AD SOYAD',
      width: 200,
      render: (_: any, r: PartnerBooking) => (
        <div style={{ lineHeight: 1.25 }}>
          <div style={{ fontWeight: 600, color: '#1e293b' }}>{r.customer?.name || '-'}</div>
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
      width: 170,
      render: (_: any, r: PartnerBooking) => (
        <span style={{ color: '#1e293b', fontWeight: 500 }}>
          <CalendarOutlined style={{ marginRight: 5, color: '#94a3b8' }} />
          {formatPickupTime(r.pickup?.time)}
        </span>
      ),
    },
    pickupLocation: {
      key: 'pickupLocation',
      title: 'ALIŞ',
      width: 240,
      render: (_: any, r: PartnerBooking) => (
        <Tooltip title={r.pickup?.location} placement="topLeft">
          <span style={{ color: '#334155' }}>
            <EnvironmentOutlined style={{ color: '#10b981', marginRight: 5 }} />
            {r.pickup?.location}
          </span>
        </Tooltip>
      ),
    },
    dropoffLocation: {
      key: 'dropoffLocation',
      title: 'VARIŞ',
      width: 240,
      render: (_: any, r: PartnerBooking) => (
        <Tooltip title={r.dropoff?.location} placement="topLeft">
          <span style={{ color: '#334155' }}>
            <EnvironmentOutlined style={{ color: '#ef4444', marginRight: 5 }} />
            {r.dropoff?.location}
          </span>
        </Tooltip>
      ),
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
      width: 130,
      render: (_: any, r: PartnerBooking) => (
        <Tag style={{ background: '#f0f9ff', borderColor: '#bae6fd', color: '#0369a1', fontWeight: 600 }}>
          <CarOutlined style={{ marginRight: 4 }} />
          {r.vehicle?.type}
        </Tag>
      ),
    },
    driverInline: {
      key: 'driverInline',
      title: 'ŞOFÖR',
      width: 220,
      render: (_: any, r: PartnerBooking) => {
        if (tab === 'completed') return r.driver?.name || <span style={{ color: '#94a3b8' }}>-</span>;
        return (
          <Select
            value={r.driver?.id || undefined}
            onChange={(value) => assignDriver(r, value || null)}
            placeholder="Şoför seç"
            allowClear
            loading={actionLoading === `${r.id}:driver`}
            size="small"
            style={{ width: '100%' }}
            optionFilterProp="label"
            showSearch
            options={drivers.map((d) => ({
              value: d.id,
              label: d.name,
              data: d,
            }))}
            optionRender={(option) => {
              const d = (option.data as any)?.data as Driver | undefined;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge dot status={d?.isOnline ? 'success' : 'default'}>
                    <Avatar size={22} icon={<UserOutlined />} src={d?.avatar || undefined} />
                  </Badge>
                  <div style={{ lineHeight: 1.1 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{d?.name}</div>
                    {d?.phone && <div style={{ fontSize: 10, color: '#64748b' }}>{d.phone}</div>}
                  </div>
                </div>
              );
            }}
          />
        );
      },
    },
    vehicleInline: {
      key: 'vehicleInline',
      title: 'ARAÇ',
      width: 180,
      render: (_: any, r: PartnerBooking) => {
        if (tab === 'completed') {
          return r.assignedVehicle?.plate || <span style={{ color: '#94a3b8' }}>-</span>;
        }
        return (
          <Select
            value={r.assignedVehicle?.id || undefined}
            onChange={(value) => assignVehicle(r, value || null)}
            placeholder="Araç seç"
            allowClear
            loading={actionLoading === `${r.id}:vehicle`}
            size="small"
            style={{ width: '100%' }}
            optionFilterProp="label"
            showSearch
            options={vehicles.map((v) => ({
              value: v.id,
              label: `${v.plate} · ${v.brand || ''} ${v.model || ''}`.trim(),
            }))}
          />
        );
      },
    },
    note: {
      key: 'note',
      title: 'OP. NOTU',
      width: 200,
      render: (_: any, r: PartnerBooking) => {
        const note = r.internalNotes || '';
        return (
          <div
            style={{
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: 6,
              background: note ? '#fefce8' : 'transparent',
              border: note ? '1px solid #fde68a' : '1px dashed #e2e8f0',
              color: note ? '#854d0e' : '#94a3b8',
              fontSize: 12,
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            onClick={() => setEditNoteRow({ row: r, value: note })}
            title={note || 'Not eklemek için tıklayın'}
          >
            <EditOutlined style={{ marginRight: 4 }} />
            {note || 'Not ekle'}
          </div>
        );
      },
    },
    amount: {
      key: 'amount',
      title: 'TUTAR',
      width: 130,
      align: 'right',
      render: (_: any, r: PartnerBooking) => (
        <span style={{ fontWeight: 700, color: '#1e293b' }}>
          {Number(r.price?.amount || 0).toLocaleString('tr-TR')} {r.price?.currency || ''}
        </span>
      ),
    },
    payment: {
      key: 'payment',
      title: 'ÖDEME',
      width: 110,
      render: (_: any, r: PartnerBooking) => {
        const p = r.paymentStatus || 'PENDING';
        const color = p === 'PAID' ? 'green' : p === 'DISPUTED' ? 'red' : 'orange';
        return <Tag color={color}>{p}</Tag>;
      },
    },
    status: {
      key: 'status',
      title: 'DURUM',
      width: 150,
      render: (_: any, r: PartnerBooking) => {
        if (tab === 'completed') return <Tag color="green">TAMAMLANDI</Tag>;
        const op = r.operationalStatus || (r.driver ? 'DRIVER_ASSIGNED' : 'CONFIRMED');
        const meta = STATUS_META[op] || { label: op || '-', color: 'default' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    actions: {
      key: 'actions',
      title: 'İŞLEMLER',
      fixed: 'right',
      width: 170,
      render: (_: any, r: PartnerBooking) => (
        <RowActions
          row={r}
          tab={tab}
          actionLoading={actionLoading}
          onDetail={() => {
            setDetailRow(r);
            setIsDetailDrawerOpen(true);
          }}
          onEdit={() => {
            setDetailRow(r);
            setIsDetailDrawerOpen(true);
          }}
          onCall={() => window.open(`tel:${r.customer?.phone || ''}`)}
          onComplete={() => transitionStatus(r, 'COMPLETED')}
          onCancel={() => setCancelModal({ row: r, reason: '', note: '' })}
          onPool={() => sendToPool(r)}
          onUnconfirm={() => sendBackToReservation(r)}
          onInOperation={() => transitionStatus(r, 'IN_OPERATION')}
          onPickedUp={() => transitionStatus(r, 'PASSENGER_PICKED_UP')}
          onOnWay={() => transitionStatus(r, 'ON_THE_WAY')}
          onUetds={() => openUetdsModal(r)}
          onMessage={() => setMessageModal({ row: r, text: '' })}
          onNote={() => setEditNoteRow({ row: r, value: r.internalNotes || '' })}
        />
      ),
    },
  };

  const columns = useMemo(() => {
    return columnConfigs.filter((cfg) => cfg.visible).map((cfg) => columnsByKey[cfg.key]).filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnConfigs, tab, drivers, vehicles, actionLoading]);

  const scrollX = useMemo(() => columns.reduce((sum, c: any) => sum + (c?.width || 120), 0), [columns]);

  // ──────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────
  const detail = detailRow;

  return (
    <div className="partner-page partner-page--wide">
      <div className="ps-page-header">
        <div>
          <h1 className="ps-page-header__title">
            <AppstoreOutlined style={{ color: '#6366f1', marginRight: 8 }} />
            Operasyon
          </h1>
          <p className="ps-page-header__subtitle">
            Profesyonel operasyon yönetimi — şoför/araç atama, durum geçişi, iptal nedeni, presetler ve CSV export
          </p>
        </div>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={exportCsv}>
            CSV
          </Button>
          <Button icon={<EyeOutlined />} onClick={() => setIsColumnsDrawerOpen(true)}>
            Kolonlar
          </Button>
          <Button icon={<ThunderboltOutlined />} onClick={() => setIsPresetsDrawerOpen(true)}>
            Presetler
          </Button>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            Yenile
          </Button>
        </Space>
      </div>

      <div className="ps-card" style={{ padding: 12, marginBottom: 10 }}>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Segmented
              value={tab}
              onChange={(v) => setTab(v as TabKey)}
              options={[
                { label: `Özel (${active.filter((b) => b.operationalStatus !== 'POOL' && b.operationalStatus !== 'IN_POOL').length})`, value: 'active' },
                { label: `Havuz (${active.filter((b) => b.operationalStatus === 'POOL' || b.operationalStatus === 'IN_POOL').length})`, value: 'pool' },
                { label: `Tamamlanan (${completed.length})`, value: 'completed' },
              ]}
            />
            <Select
              value={statusFilter}
              style={{ width: 180 }}
              onChange={(v) => setStatusFilter(v)}
              options={[
                { value: 'all', label: 'Tüm Durumlar' },
                { value: 'CONFIRMED', label: 'Onaylandı' },
                { value: 'DRIVER_ASSIGNED', label: 'Şoför Atandı' },
                { value: 'IN_OPERATION', label: 'Operasyonda' },
                { value: 'PASSENGER_PICKED_UP', label: 'Yolcu Alındı' },
                { value: 'ON_THE_WAY', label: 'Yolda' },
              ]}
            />
          </Space>
          <Space wrap>
            <Button
              type={directionFilter === 'all' ? 'primary' : 'default'}
              size="small"
              onClick={() => setDirectionFilter('all')}
            >
              HEPSİ
            </Button>
            <Button
              type={directionFilter === 'GELİŞ' ? 'primary' : 'default'}
              size="small"
              icon={<LoginOutlined />}
              onClick={() => setDirectionFilter('GELİŞ')}
            >
              GELİŞ
            </Button>
            <Button
              type={directionFilter === 'GİDİŞ' ? 'primary' : 'default'}
              size="small"
              icon={<LogoutOutlined />}
              onClick={() => setDirectionFilter('GİDİŞ')}
            >
              GİDİŞ
            </Button>
            <Button
              type={directionFilter === 'ARA' ? 'primary' : 'default'}
              size="small"
              icon={<SwapOutlined />}
              onClick={() => setDirectionFilter('ARA')}
            >
              ARA
            </Button>
          </Space>
        </Space>
      </div>

      <div className="ps-card" style={{ padding: 12, marginBottom: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 2fr auto', gap: 8 }}>
          <Input
            allowClear
            placeholder="Ara: T.KOD / Müşteri / Telefon / Uçuş"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Input
            allowClear
            placeholder="Alış"
            prefix={<EnvironmentOutlined />}
            value={pickupFilter}
            onChange={(e) => setPickupFilter(e.target.value)}
          />
          <Input
            allowClear
            placeholder="Varış"
            prefix={<EnvironmentOutlined />}
            value={dropoffFilter}
            onChange={(e) => setDropoffFilter(e.target.value)}
          />
          <RangePicker style={{ width: '100%' }} value={dateRange} onChange={(v) => setDateRange(v)} />
          <Button
            onClick={() => {
              setSearch('');
              setPickupFilter('');
              setDropoffFilter('');
              setDateRange(null);
              setStatusFilter('all');
              setDirectionFilter('all');
            }}
          >
            Temizle
          </Button>
        </div>
      </div>

      <div
        className="ps-card"
        style={{ padding: 12, marginBottom: 10, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}
      >
        <div className="ps-kpi">
          <div className="ps-kpi__label">Toplam</div>
          <div className="ps-kpi__value">{stats.total}</div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi__label">Şoför Atandı</div>
          <div className="ps-kpi__value">{stats.assigned}</div>
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
          <div className="ps-kpi__label">Tutar Toplamı</div>
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
            pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['10', '25', '50', '100'] }}
            scroll={{ x: scrollX }}
            size="small"
            locale={{ emptyText: <Empty description="Kayıt bulunamadı" /> }}
          />
        )}
      </div>

      {/* COLUMNS DRAWER */}
      <Drawer
        title="Kolon Yönetimi"
        open={isColumnsDrawerOpen}
        onClose={() => setIsColumnsDrawerOpen(false)}
        width={420}
        extra={
          <Button size="small" onClick={resetColumns}>
            Varsayılana Dön
          </Button>
        }
      >
        <p style={{ color: '#64748b', fontSize: 12, marginBottom: 10 }}>
          Sürükle-bırak ile sırala. Kutu işaretini kaldırarak kolonu gizle. Tercihler otomatik kaydedilir.
        </p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onColumnDragEnd}>
          <SortableContext items={columnConfigs.map((c) => c.key)} strategy={verticalListSortingStrategy}>
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              {columnConfigs.map((cfg) => (
                <SortableRow key={cfg.key} cfg={cfg} onToggle={setColumnVisibility} />
              ))}
            </Space>
          </SortableContext>
        </DndContext>
      </Drawer>

      {/* PRESETS DRAWER */}
      <Drawer
        title="Filtre Presetleri"
        open={isPresetsDrawerOpen}
        onClose={() => setIsPresetsDrawerOpen(false)}
        width={400}
      >
        <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
          <Input
            placeholder="Mevcut filtre için isim"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
          />
          <Button type="primary" onClick={saveCurrentFilterPreset}>
            Kaydet
          </Button>
        </Space.Compact>
        {!filterPresets.length ? (
          <Empty description="Henüz preset yok" />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {filterPresets.map((p) => (
              <div
                key={p.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {p.tab} · {p.statusFilter} · {p.pickupFilter || '—'} → {p.dropoffFilter || '—'}
                  </div>
                </div>
                <Space>
                  <Button size="small" type="primary" onClick={() => applyPreset(p)}>
                    Uygula
                  </Button>
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removePreset(p.id)} />
                </Space>
              </div>
            ))}
          </Space>
        )}
      </Drawer>

      {/* DETAIL DRAWER */}
      <Drawer
        title={detail ? `${detail.bookingNumber} · ${detail.customer?.name || ''}` : 'Detay'}
        open={isDetailDrawerOpen}
        onClose={() => setIsDetailDrawerOpen(false)}
        width={560}
        extra={
          detail && (
            <Space>
              <Tooltip title="Haritada aç">
                <Button icon={<EnvironmentOutlined />} onClick={() => openMaps(detail)} />
              </Tooltip>
              <Tooltip title="Ara">
                <Button icon={<PhoneOutlined />} disabled={!detail.customer?.phone} onClick={() => window.open(`tel:${detail.customer?.phone}`)} />
              </Tooltip>
            </Space>
          )
        }
      >
        {!detail ? (
          <Empty />
        ) : (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="ps-card" style={{ padding: 12 }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>MÜŞTERİ</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{detail.customer?.name}</div>
                {detail.customer?.phone && (
                  <div style={{ marginTop: 4 }}>
                    <PhoneOutlined style={{ marginRight: 6, color: '#10b981' }} />
                    {detail.customer.phone}
                  </div>
                )}
                {detail.customer?.email && (
                  <div style={{ marginTop: 2, color: '#64748b' }}>
                    <MailOutlined style={{ marginRight: 6 }} />
                    {detail.customer.email}
                  </div>
                )}
              </div>
              <div className="ps-card" style={{ padding: 12 }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>TUTAR · ÖDEME</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#1e293b' }}>
                  {Number(detail.price?.amount || 0).toLocaleString('tr-TR')} {detail.price?.currency}
                </div>
                <Tag color={detail.paymentStatus === 'PAID' ? 'green' : 'orange'} style={{ marginTop: 6 }}>
                  {detail.paymentStatus || 'PENDING'}
                </Tag>
              </div>
            </div>

            <div className="ps-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>GÜZERGAH</div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <EnvironmentOutlined style={{ color: '#10b981', marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Alış</div>
                  <div style={{ fontWeight: 600 }}>{detail.pickup?.location}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    {detail.pickup?.time}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <EnvironmentOutlined style={{ color: '#ef4444', marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Varış</div>
                  <div style={{ fontWeight: 600 }}>{detail.dropoff?.location}</div>
                </div>
              </div>
              {(detail.flightNumber || detail.flightTime) && (
                <div style={{ marginTop: 8, color: '#64748b', fontSize: 12 }}>
                  Uçuş: <b style={{ color: '#1e293b' }}>{detail.flightNumber || '-'}</b> · {detail.flightTime || ''}
                </div>
              )}
            </div>

            <div className="ps-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>ATAMA</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Select
                  value={detail.driver?.id || undefined}
                  onChange={(value) => assignDriver(detail, value || null)}
                  placeholder="Şoför seç"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  loading={actionLoading === `${detail.id}:driver`}
                  options={drivers.map((d) => ({ value: d.id, label: d.name }))}
                />
                <Select
                  value={detail.assignedVehicle?.id || undefined}
                  onChange={(value) => assignVehicle(detail, value || null)}
                  placeholder="Araç seç"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  loading={actionLoading === `${detail.id}:vehicle`}
                  options={vehicles.map((v) => ({
                    value: v.id,
                    label: `${v.plate} · ${v.brand || ''} ${v.model || ''}`.trim(),
                  }))}
                />
              </div>
            </div>

            <div className="ps-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>OPERASYON DURUMU</div>
              <Space wrap>
                <Button
                  type={detail.operationalStatus === 'IN_OPERATION' ? 'primary' : 'default'}
                  size="small"
                  icon={<ThunderboltOutlined />}
                  onClick={() => transitionStatus(detail, 'IN_OPERATION')}
                  loading={actionLoading === `${detail.id}:status:IN_OPERATION`}
                >
                  Operasyona Al
                </Button>
                <Button
                  type={detail.operationalStatus === 'PASSENGER_PICKED_UP' ? 'primary' : 'default'}
                  size="small"
                  icon={<CheckCircleOutlined />}
                  onClick={() => transitionStatus(detail, 'PASSENGER_PICKED_UP')}
                  loading={actionLoading === `${detail.id}:status:PASSENGER_PICKED_UP`}
                >
                  Yolcu Alındı
                </Button>
                <Button
                  type={detail.operationalStatus === 'ON_THE_WAY' ? 'primary' : 'default'}
                  size="small"
                  icon={<CarOutlined />}
                  onClick={() => transitionStatus(detail, 'ON_THE_WAY')}
                  loading={actionLoading === `${detail.id}:status:ON_THE_WAY`}
                >
                  Yolda
                </Button>
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckCircleOutlined />}
                  onClick={() => transitionStatus(detail, 'COMPLETED')}
                  loading={actionLoading === `${detail.id}:status:COMPLETED`}
                >
                  Tamamla
                </Button>
                <Button
                  danger
                  size="small"
                  icon={<StopOutlined />}
                  onClick={() => setCancelModal({ row: detail, reason: '', note: '' })}
                >
                  İptal
                </Button>
              </Space>
            </div>

            <div className="ps-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>OPERASYON NOTU</div>
              <Input.TextArea
                rows={3}
                value={detail.internalNotes || ''}
                onChange={(e) => setDetailRow({ ...detail, internalNotes: e.target.value })}
              />
              <Button
                type="primary"
                size="small"
                style={{ marginTop: 8 }}
                onClick={() => setEditNoteRow({ row: detail, value: detail.internalNotes || '' })}
              >
                Notu Kaydet
              </Button>
            </div>

            {(detail.specialRequests || detail.internalNotes) && (
              <div className="ps-alert" style={{ padding: 12 }}>
                <InfoCircleOutlined style={{ marginRight: 6, color: '#f59e0b' }} />
                {detail.specialRequests || detail.internalNotes}
              </div>
            )}
          </Space>
        )}
      </Drawer>

      {/* CANCEL MODAL */}
      <Modal
        title="İptal Nedeni"
        open={!!cancelModal}
        onCancel={() => setCancelModal(null)}
        onOk={submitCancel}
        confirmLoading={!!cancelModal && actionLoading === `${cancelModal.row.id}:cancel`}
        okText="İptal Et"
        okButtonProps={{ danger: true }}
        cancelText="Vazgeç"
      >
        {cancelModal && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Select
              placeholder="Nedeni seçin"
              style={{ width: '100%' }}
              value={cancelModal.reason || undefined}
              onChange={(v) => setCancelModal({ ...cancelModal, reason: v })}
              options={CANCEL_REASONS}
            />
            <Input.TextArea
              rows={3}
              placeholder="Açıklama (opsiyonel)"
              value={cancelModal.note}
              onChange={(e) => setCancelModal({ ...cancelModal, note: e.target.value })}
            />
          </Space>
        )}
      </Modal>

      {/* QUICK NOTE MODAL */}
      <Modal
        title="Operasyon Notu"
        open={!!editNoteRow}
        onCancel={() => setEditNoteRow(null)}
        onOk={saveNote}
        confirmLoading={!!editNoteRow && actionLoading === `${editNoteRow.row.id}:note`}
        okText="Kaydet"
        cancelText="Vazgeç"
      >
        {editNoteRow && (
          <Input.TextArea
            rows={4}
            placeholder="Şoförün görebileceği operasyon notu"
            value={editNoteRow.value}
            onChange={(e) => setEditNoteRow({ ...editNoteRow, value: e.target.value })}
          />
        )}
      </Modal>

      {/* MESSAGE MODAL */}
      <Modal
        title={
          messageModal?.row.driver
            ? `Mesaj Gönder · ${messageModal.row.driver.name}`
            : 'Mesaj Gönder'
        }
        open={!!messageModal}
        onCancel={() => setMessageModal(null)}
        onOk={submitMessage}
        confirmLoading={!!messageModal && actionLoading === `${messageModal.row.id}:msg`}
        okText="Gönder"
        cancelText="Vazgeç"
      >
        {messageModal && (
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            {!messageModal.row.driver?.id && (
              <div className="ps-alert" style={{ padding: 10, color: '#92400e' }}>
                <InfoCircleOutlined style={{ marginRight: 6 }} />
                Bu rezervasyona henüz şoför atanmamış. Önce şoför atayın.
              </div>
            )}
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Rezervasyon: <b>{messageModal.row.bookingNumber}</b>
            </div>
            <Input.TextArea
              rows={4}
              placeholder="Şoföre iletilecek mesaj"
              value={messageModal.text}
              onChange={(e) => setMessageModal({ ...messageModal, text: e.target.value })}
            />
          </Space>
        )}
      </Modal>

      {/* UETDS MODAL */}
      <Modal
        title="UETDS'ye Gönder"
        open={!!uetdsModal}
        onCancel={() => setUetdsModal(null)}
        onOk={submitUetds}
        confirmLoading={!!uetdsModal && actionLoading === `${uetdsModal.row.id}:uetds`}
        okText="Gönder"
        cancelText="Vazgeç"
        width={680}
      >
        {uetdsModal && (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Rezervasyon: <b>{uetdsModal.row.bookingNumber}</b> · {uetdsModal.row.customer?.name}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <Input
                placeholder="Araç Plakası (zorunlu)"
                value={uetdsModal.vehiclePlate}
                onChange={(e) => setUetdsModal({ ...uetdsModal, vehiclePlate: e.target.value })}
              />
              <Input
                placeholder="Şoför TC No (zorunlu)"
                value={uetdsModal.driverTc}
                onChange={(e) => setUetdsModal({ ...uetdsModal, driverTc: e.target.value })}
              />
              <Input
                placeholder="Şoför Adı"
                value={uetdsModal.driverFirstName}
                onChange={(e) => setUetdsModal({ ...uetdsModal, driverFirstName: e.target.value })}
              />
              <Input
                placeholder="Şoför Soyadı"
                value={uetdsModal.driverLastName}
                onChange={(e) => setUetdsModal({ ...uetdsModal, driverLastName: e.target.value })}
              />
              <Input
                placeholder="Şoför Telefon"
                value={uetdsModal.driverPhone}
                onChange={(e) => setUetdsModal({ ...uetdsModal, driverPhone: e.target.value })}
              />
              <Input
                placeholder="Yolcu TC No (zorunlu)"
                value={uetdsModal.passengerTc}
                onChange={(e) => setUetdsModal({ ...uetdsModal, passengerTc: e.target.value })}
              />
              <Input
                placeholder="Yolcu Adı"
                value={uetdsModal.passengerFirstName}
                onChange={(e) => setUetdsModal({ ...uetdsModal, passengerFirstName: e.target.value })}
              />
              <Input
                placeholder="Yolcu Soyadı"
                value={uetdsModal.passengerLastName}
                onChange={(e) => setUetdsModal({ ...uetdsModal, passengerLastName: e.target.value })}
              />
              <Input
                placeholder="Başlangıç İl"
                value={uetdsModal.baslangicIl}
                onChange={(e) => setUetdsModal({ ...uetdsModal, baslangicIl: e.target.value })}
              />
              <Input
                placeholder="Başlangıç İlçe"
                value={uetdsModal.baslangicIlce}
                onChange={(e) => setUetdsModal({ ...uetdsModal, baslangicIlce: e.target.value })}
              />
              <Input
                placeholder="Bitiş İl"
                value={uetdsModal.bitisIl}
                onChange={(e) => setUetdsModal({ ...uetdsModal, bitisIl: e.target.value })}
              />
              <Input
                placeholder="Bitiş İlçe"
                value={uetdsModal.bitisIlce}
                onChange={(e) => setUetdsModal({ ...uetdsModal, bitisIlce: e.target.value })}
              />
            </div>
            <div className="ps-alert" style={{ padding: 10, color: '#92400e', fontSize: 12 }}>
              <InfoCircleOutlined style={{ marginRight: 6 }} />
              UETDS gönderimi için partner profilinizde UNet kullanıcı bilgisi tanımlı olmalıdır
              (UETDS sayfasından). Yetki Belge No’nuz yönetici tarafından girilmiş olmalıdır.
            </div>
          </Space>
        )}
      </Modal>
    </div>
  );
}
