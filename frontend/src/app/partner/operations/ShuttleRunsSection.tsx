'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Avatar, Badge, Button, Card, DatePicker, Empty, Input, Modal, Popconfirm, Space, Spin, Table, Tag, Tooltip, message,
} from 'antd';
import {
  AppstoreOutlined, ArrowDownOutlined, ArrowUpOutlined, CarOutlined, CheckCircleOutlined, ClockCircleOutlined,
  EditOutlined, EnvironmentOutlined, MailOutlined, PhoneOutlined, ReloadOutlined, RightOutlined, TeamOutlined,
  ThunderboltOutlined, UserOutlined, WhatsAppOutlined,
} from '@ant-design/icons';
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import dayjs, { type Dayjs } from 'dayjs';
import apiClient from '@/lib/api-client';

type Driver = { id: string; name: string; phone?: string; avatar?: string | null; isOnline?: boolean };
type Vehicle = { id: string; plate: string; brand?: string; model?: string; capacity?: number };

type ShuttleBooking = {
  id: string;
  bookingNumber: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  adults: number;
  children: number;
  infants: number;
  pickup: string;
  dropoff: string;
  pickupDateTime: string;
  status: string;
  operationalStatus?: string | null;
  paymentStatus?: string;
  driverId?: string | null;
  assignedVehicleId?: string | null;
  flightNumber?: string;
  flightTime?: string;
  pickupRegionCode?: string | null;
  dropoffRegionCode?: string | null;
  shuttleSortOrder?: number | null;
  notes?: string | null;
  agencyName?: string | null;
  total?: number;
  currency?: string;
};

type ShuttleRun = {
  runKey: string;
  shuttleRouteId?: string | null;
  manualRunId?: string | null;
  routeName: string;
  fromName: string;
  toName: string;
  tripType: 'ARV' | 'DEP' | 'TRF' | 'ARA';
  departureTime: string;
  driverId?: string | null;
  vehicleId?: string | null;
  bookings: ShuttleBooking[];
  passengerCount: number;
  totalAmount: number;
  currency: string;
  allReady: boolean;
  driverAssigned: boolean;
};

function trip(t: string) {
  if (t === 'ARV') return { label: 'GELİŞ', color: 'green' };
  if (t === 'DEP') return { label: 'GİDİŞ', color: 'orange' };
  return { label: 'ARA', color: 'default' };
}

function fmt(v: number, c = 'TRY') {
  return `${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${c}`;
}

function SortablePassengerRow({ b, index, onAck }: { b: ShuttleBooking; index: number; onAck?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: b.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    background: isDragging ? 'var(--brand-primary-08)' : '#fff',
  };
  return (
    <tr ref={setNodeRef} style={style} {...attributes}>
      <td style={{ padding: '6px 8px', width: 40, color: '#94a3b8', cursor: 'grab' }} {...listeners}>≡</td>
      <td style={{ padding: '6px 8px', width: 36, color: '#64748b' }}>{index + 1}</td>
      <td style={{ padding: '6px 8px' }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{b.contactName}</div>
        <div style={{ fontSize: 11, color: '#64748b' }}>{b.bookingNumber}</div>
      </td>
      <td style={{ padding: '6px 8px' }}>
        <div style={{ fontSize: 11, color: '#334155' }}>
          <EnvironmentOutlined style={{ color: '#10b981', marginRight: 4 }} />
          {b.pickup}
        </div>
        <div style={{ fontSize: 11, color: '#334155', marginTop: 2 }}>
          <EnvironmentOutlined style={{ color: '#ef4444', marginRight: 4 }} />
          {b.dropoff}
        </div>
      </td>
      <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: 11 }}>
        {dayjs(b.pickupDateTime).format('HH:mm')}
      </td>
      <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: 11 }}>{b.flightTime || '-'}</td>
      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
        <Tag color="cyan" style={{ fontSize: 10, margin: 0 }}>{b.pickupRegionCode || '-'}</Tag>
      </td>
      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
        <Tag color="purple" style={{ fontSize: 10, margin: 0 }}>{b.dropoffRegionCode || '-'}</Tag>
      </td>
      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>
        {b.adults + b.children}
        {(b.children > 0 || b.infants > 0) && (
          <span style={{ fontSize: 10, color: '#94a3b8', display: 'block' }}>
            {b.adults}Y {b.children > 0 ? `+${b.children}Ç` : ''}{b.infants > 0 ? ` +${b.infants}B` : ''}
          </span>
        )}
      </td>
      <td style={{ padding: '6px 8px', fontSize: 11 }}>
        {b.contactPhone || '-'}
      </td>
      <td style={{ padding: '6px 8px' }}>
        <Space size={2}>
          {b.contactPhone && (
            <Tooltip title="Ara"><Button size="small" icon={<PhoneOutlined />} onClick={() => window.open(`tel:${b.contactPhone}`)} /></Tooltip>
          )}
          {b.contactPhone && (
            <Tooltip title="WhatsApp"><Button size="small" icon={<WhatsAppOutlined style={{ color: '#22c55e' }} />} onClick={() => window.open(`https://wa.me/${(b.contactPhone || '').replace(/\D/g, '')}`)} /></Tooltip>
          )}
          {b.contactEmail && (
            <Tooltip title="E-posta"><Button size="small" icon={<MailOutlined />} onClick={() => window.open(`mailto:${b.contactEmail}`)} /></Tooltip>
          )}
        </Space>
      </td>
    </tr>
  );
}

function RunCard({
  run, drivers, vehicles, onAssign, onUpdate, onSort, onComplete, onReload,
}: {
  run: ShuttleRun;
  drivers: Driver[];
  vehicles: Vehicle[];
  onAssign: (runKey: string, fields: { driverId?: string | null; vehicleId?: string | null }) => Promise<void>;
  onUpdate: (runKey: string, fields: { departureTime?: string; routeName?: string }) => Promise<void>;
  onSort: (runKey: string, bookingIds: string[]) => Promise<void>;
  onComplete: (runKey: string) => Promise<void>;
  onReload: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [bookings, setBookings] = useState<ShuttleBooking[]>(run.bookings);
  const [editTimeOpen, setEditTimeOpen] = useState(false);
  const [timeValue, setTimeValue] = useState(run.departureTime || '');
  const [nameValue, setNameValue] = useState(run.routeName || '');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => { setBookings(run.bookings); }, [run.bookings]);

  const t = trip(run.tripType);
  const driver = drivers.find((d) => d.id === run.driverId);
  const vehicle = vehicles.find((v) => v.id === run.vehicleId);
  const capacityOver = vehicle && vehicle.capacity && run.passengerCount > vehicle.capacity;

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = bookings.findIndex((b) => b.id === active.id);
    const newIdx = bookings.findIndex((b) => b.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(bookings, oldIdx, newIdx);
    setBookings(next);
    await onSort(run.runKey, next.map((x) => x.id));
  };

  return (
    <div className="ps-card" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexWrap: 'wrap' }}>
        <div
          onClick={() => { setTimeValue(run.departureTime || ''); setNameValue(run.routeName || ''); setEditTimeOpen(true); }}
          style={{
            border: '2px solid var(--brand-primary)', color: 'var(--brand-accent)', borderRadius: 10, padding: '4px 14px',
            textAlign: 'center', fontWeight: 900, fontSize: 18, minWidth: 76, cursor: 'pointer',
          }}
          title="Saati / sefer adını düzenle"
        >
          {run.departureTime}
          <div style={{ fontSize: 9, fontWeight: 700, marginTop: 2, opacity: 0.7 }}>DEPARTURE</div>
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 15 }}>{run.routeName}</span>
            <Tag color={t.color}>{t.label}</Tag>
            {run.allReady ? <Tag color="green"><CheckCircleOutlined /> Hazır</Tag> : run.driverAssigned ? <Tag color="blue">Atandı</Tag> : <Tag>Atanmadı</Tag>}
            {capacityOver && <Tag color="red">⚠ Kapasite Aşıldı</Tag>}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
            <TeamOutlined style={{ marginRight: 4 }} /> {run.passengerCount} yolcu · {bookings.length} rezervasyon
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <ShuttleAssignSelector
            label="Şoför"
            value={run.driverId || undefined}
            placeholder="Şoför seç"
            options={drivers.map((d) => ({ value: d.id, label: d.name, data: d }))}
            onChange={(v) => onAssign(run.runKey, { driverId: v || null })}
            renderOption={(opt) => {
              const d = (opt.data as any)?.data as Driver | undefined;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge dot status={d?.isOnline ? 'success' : 'default'}>
                    <Avatar size={22} icon={<UserOutlined />} src={d?.avatar || undefined} />
                  </Badge>
                  <span style={{ fontWeight: 600 }}>{d?.name}</span>
                  {d?.phone && <span style={{ color: '#64748b', fontSize: 11 }}>· {d.phone}</span>}
                </div>
              );
            }}
          />
          <ShuttleAssignSelector
            label="Araç"
            value={run.vehicleId || undefined}
            placeholder="Araç seç"
            options={vehicles.map((v) => ({ value: v.id, label: `${v.plate} · ${v.brand || ''} ${v.model || ''}`.trim() }))}
            onChange={(v) => onAssign(run.runKey, { vehicleId: v || null })}
          />
          <Tooltip title={run.allReady ? 'Operasyona al' : 'Şoför ve araç atayın'}>
            <Button
              size="middle"
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={() => onComplete(run.runKey)}
              disabled={!run.allReady}
            >
              Operasyona Al
            </Button>
          </Tooltip>
          <Button size="middle" icon={<RightOutlined rotate={expanded ? -90 : 0} />} onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Gizle' : 'Göster'}
          </Button>
        </div>
      </div>

      {/* Passenger Table */}
      {expanded && (
        <div style={{ padding: '8px 16px 14px' }}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={bookings.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569', fontSize: 11 }}>
                    <th style={{ padding: '8px', textAlign: 'left', width: 40 }}></th>
                    <th style={{ padding: '8px', textAlign: 'left', width: 36 }}>SIRA</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>MÜŞTERİ</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>GÜZERGAH</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: 70 }}>ALIŞ SAATİ</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: 70 }}>UÇUŞ</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: 80 }}>A.BÖLGE</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: 80 }}>V.BÖLGE</th>
                    <th style={{ padding: '8px', textAlign: 'right', width: 60 }}>PAX</th>
                    <th style={{ padding: '8px', textAlign: 'left', width: 120 }}>TELEFON</th>
                    <th style={{ padding: '8px', textAlign: 'left', width: 110 }}>İLETİŞİM</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b, i) => (
                    <SortablePassengerRow key={b.id} b={b} index={i} />
                  ))}
                </tbody>
              </table>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Edit time/name modal */}
      <Modal
        title="Sefer Düzenle"
        open={editTimeOpen}
        onCancel={() => setEditTimeOpen(false)}
        onOk={async () => {
          await onUpdate(run.runKey, { departureTime: timeValue || undefined, routeName: nameValue || undefined });
          setEditTimeOpen(false);
        }}
        okText="Kaydet"
        cancelText="Vazgeç"
      >
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Hareket Saati</div>
            <Input value={timeValue} onChange={(e) => setTimeValue(e.target.value)} placeholder="HH:MM" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Sefer / Rota Adı</div>
            <Input value={nameValue} onChange={(e) => setNameValue(e.target.value)} placeholder="örn: ALY MRKZ - AYT" />
          </div>
        </Space>
      </Modal>
    </div>
  );
}

function ShuttleAssignSelector({
  label, value, options, placeholder, onChange, renderOption,
}: {
  label: string;
  value?: string;
  options: { value: string; label: string; data?: any }[];
  placeholder: string;
  onChange: (v: string | undefined) => void;
  renderOption?: (opt: any) => React.ReactNode;
}) {
  // Inline AntD-like select wrapper using built-in <select>-style — but with AntD for rich UI
  return (
    <div style={{ minWidth: 200 }}>
      <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
      <AntdSelect value={value} placeholder={placeholder} options={options} onChange={onChange} renderOption={renderOption} />
    </div>
  );
}

// Wrap AntD Select dynamically
import { Select as AntSelectComp } from 'antd';
function AntdSelect({
  value, options, placeholder, onChange, renderOption,
}: {
  value?: string;
  options: { value: string; label: string; data?: any }[];
  placeholder: string;
  onChange: (v: string | undefined) => void;
  renderOption?: (opt: any) => React.ReactNode;
}) {
  return (
    <AntSelectComp
      value={value}
      onChange={(v) => onChange(v || undefined)}
      placeholder={placeholder}
      allowClear
      showSearch
      optionFilterProp="label"
      style={{ width: 220 }}
      options={options}
      optionRender={renderOption}
    />
  );
}

export default function ShuttleRunsSection() {
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [runs, setRuns] = useState<ShuttleRun[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [rRes, fRes] = await Promise.allSettled([
        apiClient.get(`/api/transfer/partner/shuttle-runs?date=${date.format('YYYY-MM-DD')}`),
        apiClient.get('/api/transfer/partner/operations/fleet'),
      ]);
      if (rRes.status === 'fulfilled' && rRes.value.data?.success) setRuns(rRes.value.data.data || []);
      if (fRes.status === 'fulfilled' && fRes.value.data?.success) {
        setDrivers(fRes.value.data.data?.drivers || []);
        setVehicles(fRes.value.data.data?.vehicles || []);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);

  const handleAssign = async (runKey: string, fields: { driverId?: string | null; vehicleId?: string | null }) => {
    const run = runs.find((r) => r.runKey === runKey);
    if (!run) return;
    try {
      const res = await apiClient.patch('/api/transfer/partner/shuttle-runs/assign', {
        bookingIds: run.bookings.map((b) => b.id),
        ...fields,
      });
      if (res.data?.success) { message.success('Atama uygulandı'); load(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const handleUpdate = async (runKey: string, fields: { departureTime?: string; routeName?: string }) => {
    const run = runs.find((r) => r.runKey === runKey);
    if (!run) return;
    try {
      const res = await apiClient.patch('/api/transfer/partner/shuttle-runs/update', {
        bookingIds: run.bookings.map((b) => b.id),
        ...fields,
      });
      if (res.data?.success) { message.success('Güncellendi'); load(); }
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const handleSort = async (runKey: string, bookingIds: string[]) => {
    try {
      const res = await apiClient.post('/api/transfer/partner/shuttle-runs/sort', { bookingIds });
      if (res.data?.success) message.success('Sıralama kaydedildi');
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  const handleComplete = async (runKey: string) => {
    const run = runs.find((r) => r.runKey === runKey);
    if (!run) return;
    try {
      // Set all bookings to IN_OPERATION
      for (const b of run.bookings) {
        await apiClient.patch(`/api/transfer/partner/operations/${b.id}/status`, { operationalStatus: 'IN_OPERATION' });
      }
      message.success(`${run.bookings.length} kayıt operasyona alındı`);
      load();
    } catch (e: any) { message.error(e?.response?.data?.error || 'Hata'); }
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card size="small" title={<span><AppstoreOutlined style={{ marginRight: 8, color: 'var(--brand-primary)' }} /> Shuttle Seferleri</span>}
        extra={
          <Space>
            <DatePicker value={date} onChange={(v) => v && setDate(v)} format="DD.MM.YYYY" />
            <Button icon={<ReloadOutlined />} onClick={load}>Yenile</Button>
          </Space>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <div className="ps-kpi"><div className="ps-kpi__label">Sefer Sayısı</div><div className="ps-kpi__value">{runs.length}</div></div>
          <div className="ps-kpi"><div className="ps-kpi__label">Toplam Yolcu</div><div className="ps-kpi__value">{runs.reduce((s, r) => s + r.passengerCount, 0)}</div></div>
          <div className="ps-kpi"><div className="ps-kpi__label">Hazır Seferler</div><div className="ps-kpi__value">{runs.filter((r) => r.allReady).length}</div></div>
          <div className="ps-kpi"><div className="ps-kpi__label">Bekleyen</div><div className="ps-kpi__value">{runs.filter((r) => !r.allReady).length}</div></div>
        </div>
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : runs.length === 0 ? (
        <Card><Empty description={`${date.format('DD.MM.YYYY')} tarihinde shuttle seferi yok`} /></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {runs.map((run) => (
            <RunCard
              key={run.runKey}
              run={run}
              drivers={drivers}
              vehicles={vehicles}
              onAssign={handleAssign}
              onUpdate={handleUpdate}
              onSort={handleSort}
              onComplete={handleComplete}
              onReload={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
