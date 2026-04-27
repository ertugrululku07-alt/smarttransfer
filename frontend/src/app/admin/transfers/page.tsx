'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    Table, Tag, Space, Button, Input, Typography, Card, Tooltip, Modal,
    Descriptions, message, Dropdown, MenuProps, Checkbox, Popover,
    DatePicker, InputNumber, Divider, Switch, Badge, Form, Select,
    Spin, Radio
} from 'antd';
import {
    SearchOutlined, EyeOutlined, CheckCircleOutlined, CloseCircleOutlined,
    CarOutlined, CalendarOutlined, UserOutlined, PhoneOutlined, ReloadOutlined,
    SafetyCertificateOutlined, TeamOutlined, DownloadOutlined, PrinterOutlined,
    FilterOutlined, SettingOutlined, FileExcelOutlined, FilePdfOutlined,
    FilterFilled, ClearOutlined, BgColorsOutlined, ReloadOutlined as ResetOutlined,
    EditOutlined, RocketOutlined, MoreOutlined, ThunderboltOutlined, HolderOutlined,
    PlusOutlined, MinusOutlined, DeleteOutlined, DollarOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import apiClient from '@/lib/api-client';
import CallCenterBookingWizard from './CallCenterBookingWizard';
import { useSocket } from '@/app/context/SocketContext';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Resizable } from 'react-resizable';
import DynamicLocationSearchInput from '@/app/components/DynamicLocationSearchInput';

dayjs.locale('tr');
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// ─── Draggable + Resizable Column Header ────────────────────────────────────
// Global drag state for column reorder (shared across all headers)
let __dragColKey: string | null = null;

const DraggableResizableTitle = (props: any) => {
    const { onResize, width, colKey, onColDrop, onResetWidth, ...restProps } = props;

    const handleDragStart = (e: React.DragEvent) => {
        if (!colKey || colKey === 'action') return;
        __dragColKey = colKey;
        e.dataTransfer.effectAllowed = 'move';
        (e.currentTarget as HTMLElement).style.opacity = '0.5';
    };
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (!colKey || colKey === 'action' || !__dragColKey || __dragColKey === colKey) return;
        e.dataTransfer.dropEffect = 'move';
        (e.currentTarget as HTMLElement).style.borderLeft = '3px solid #6366f1';
    };
    const handleDragLeave = (e: React.DragEvent) => {
        (e.currentTarget as HTMLElement).style.borderLeft = '';
    };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).style.borderLeft = '';
        if (!__dragColKey || __dragColKey === colKey || !colKey || colKey === 'action') return;
        onColDrop?.(__dragColKey, colKey);
        __dragColKey = null;
    };
    const handleDragEnd = (e: React.DragEvent) => {
        (e.currentTarget as HTMLElement).style.opacity = '1';
        __dragColKey = null;
    };

    const draggable = colKey && colKey !== 'action';

    if (!width) return (
        <th {...restProps}
            draggable={draggable}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            style={{ ...restProps.style, cursor: draggable ? 'grab' : undefined }}
        />
    );
    return (
        <Resizable
            width={width}
            height={0}
            handle={
                <span
                    className="react-resizable-handle"
                    onClick={e => e.stopPropagation()}
                    onDoubleClick={e => { e.stopPropagation(); if (colKey) onResetWidth?.(colKey); }}
                    title="Çift tıkla → bu kolon genişliğini varsayılana sıfırla"
                />
            }
            onResize={onResize}
            draggableOpts={{ enableUserSelectHack: false }}
        >
            <th {...restProps}
                draggable={draggable}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                style={{ ...restProps.style, position: 'relative', cursor: draggable ? 'grab' : undefined }}
            />
        </Resizable>
    );
};

const DEFAULT_COL_WIDTHS: Record<string, number> = {
    bookingNumber: 110, pickupDateTime: 110, createdAt: 110,
    agency: 100, passengerName: 130, pickupLoc: 200, dropoffLoc: 200,
    airportCode: 100, pickupRegionCode: 80, dropoffRegionCode: 80,
    vehicleType: 130, price: 90, status: 120,
    paymentType: 110, paymentStatus: 100, flightNumber: 90, adults: 90, extraServices: 150, action: 50,
};

// ─── Types ───────────────────────────────────────────────────────────────────
interface Booking {
    id: string;
    bookingNumber: string;
    vehicleType: string;
    pickup: string;
    dropoff: string;
    pickupDateTime: string;
    passengerName: string;
    passengerPhone: string;
    price: number;
    currency?: string;
    status: string;
    paymentStatus: string;
    createdAt: string;
    notes?: string;
    flightNumber?: string;
    flightTime?: string;
    operationalStatus?: string;
    metadata?: any;
    adults?: number;
    children?: number;
    infants?: number;
    agencyName?: string;
    agency?: { name: string };
    partnerName?: string;
    internalNotes?: string;
    pickupRegionCode?: string;
    dropoffRegionCode?: string;
}

interface ColFilter {
    text?: string;          // legacy, kept for backwards compat
    values?: string[];      // checkbox-based filter (Excel-style); empty => no filter
    dateRange?: [dayjs.Dayjs, dayjs.Dayjs] | null;
    minPrice?: number | null;
    maxPrice?: number | null;
    statuses?: string[];
}
interface ColFilters { [key: string]: ColFilter; }

// ─── Status Config & Colors ──────────────────────────────────────────────────
interface StatusConf { label: string; color: string; bg: string; }

const DEFAULT_STATUS_COLORS: Record<string, StatusConf> = {
    PENDING:      { label: 'Beklemede',   color: '#f59e0b', bg: '#fef9ec' },
    CONFIRMED:    { label: 'Onaylı',      color: '#6366f1', bg: '#f5f3ff' },
    IN_POOL:      { label: 'Havuzda',     color: '#06b6d4', bg: '#ecfeff' },
    IN_OPERATION: { label: 'Operasyonda', color: '#10b981', bg: '#f0fdf4' },
    IN_PROGRESS:  { label: 'Yolda',       color: '#8b5cf6', bg: '#faf5ff' },
    COMPLETED:    { label: 'Tamamlandı',  color: '#10b981', bg: '#f0fdf4' },
    CANCELLED:    { label: 'İptal',       color: '#ef4444', bg: '#fff5f5' },
    NO_SHOW:      { label: 'Gelmedi',     color: '#9ca3af', bg: '#f9fafb' },
};

const STORAGE_KEY = 'booking_status_colors';

function loadColors(): Record<string, StatusConf> {
    if (typeof window === 'undefined') return DEFAULT_STATUS_COLORS;
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? { ...DEFAULT_STATUS_COLORS, ...JSON.parse(saved) } : DEFAULT_STATUS_COLORS;
    } catch { return DEFAULT_STATUS_COLORS; }
}

// ─── Airport Code Detection ──────────────────────────────────────────────────
const AIRPORT_MAP: Record<string, string> = {
    'gazipaşa': 'GZP', 'alanya havalimanı': 'GZP',
    'antalya havalimanı': 'AYT', 'ayt': 'AYT', 'antalya': 'AYT',
    'sabiha gökçen': 'SAW', 'sabiha': 'SAW',
    'istanbul havalimanı': 'IST', 'atatürk havalimanı': 'IST', 'istanbul': 'IST',
    'dalaman': 'DLM',
    'bodrum': 'BJV', 'milas': 'BJV',
    'adnan menderes': 'ADB', 'izmir': 'ADB',
    'esenboğa': 'ESB', 'ankara': 'ESB',
    'trabzon': 'TZX',
    'adana': 'ADA',
    'konya': 'KYA',
    'kayseri': 'ASR',
    'nevşehir': 'NAV', 'kapadokya': 'NAV',
    'fethiye': 'DLM',
    'van': 'VAN',
    'erzurum': 'ERZ',
    'samsun': 'SZF',
    'malatya': 'MLX',
    'diyarbakır': 'DIY',
    'gaziantep': 'GZT',
};

function getAirportCode(location: string): string | null {
    if (!location) return null;
    const lower = location.toLocaleLowerCase('tr');
    // Must contain "havalimanı" or "airport" or "havaalanı"
    const isAirport = lower.includes('havalimanı') || lower.includes('havaalanı') || lower.includes('airport');
    if (!isAirport) return null;
    let bestCode: string | null = null;
    let bestPos = Infinity;
    let bestLen = 0;
    for (const [keyword, code] of Object.entries(AIRPORT_MAP)) {
        const pos = lower.indexOf(keyword);
        if (pos !== -1 && (pos < bestPos || (pos === bestPos && keyword.length > bestLen))) {
            bestCode = code;
            bestPos = pos;
            bestLen = keyword.length;
        }
    }
    return bestCode || '✈';
}

// ─── Column Definitions ──────────────────────────────────────────────────────
const ALL_COL_KEYS = [
    'action', 'bookingNumber', 'pickupDateTime', 'createdAt', 'agency',
    'passengerName', 'pickupLoc', 'dropoffLoc', 'airportCode',
    'pickupRegionCode', 'dropoffRegionCode',
    'vehicleType', 'price', 'status', 'paymentType', 'paymentStatus',
    'flightNumber', 'adults', 'extraServices', 'customerNote', 'internalNotes'
];
const DEFAULT_VISIBLE_COLS = [
    'action', 'bookingNumber', 'pickupDateTime', 'createdAt', 'agency',
    'passengerName', 'pickupLoc', 'dropoffLoc', 'airportCode',
    'pickupRegionCode', 'dropoffRegionCode',
    'vehicleType', 'price', 'status', 'customerNote', 'internalNotes', 'extraServices'
];
const DEFAULT_COL_TITLES: Record<string, string> = {
    bookingNumber:  'No',
    pickupDateTime: 'Transfer Zamanı',
    createdAt:      'Kayıt Tarihi',
    agency:         'Acente',
    passengerName:  'Yolcu',
    pickupLoc:      'Alış Yeri',
    dropoffLoc:     'Bırakış Yeri',
    airportCode:    'Iata',
    pickupRegionCode: 'Alış Bölge',
    dropoffRegionCode: 'Varış Bölge',
    vehicleType:    'Araç',
    price:          'Tutar',
    status:         'Durum',
    paymentType:    'Ödeme Tipi',
    paymentStatus:  'Ödeme',
    flightNumber:   'Uçuş No',
    adults:         'Yolcu Sayısı',
    extraServices:  'Ekstra Hizmet',
    customerNote:   'Müşteri Notu',
    internalNotes:  'Op. Notu',
    action:         'İşlem',
};

// ─── Editable Header ─────────────────────────────────────────────────────────
interface EditableHeaderProps {
    colKey: string; title: string; filter: ColFilter;
    onTitleChange: (k: string, v: string) => void;
    onFilter: (k: string, f: ColFilter) => void;
    onClearFilter: (k: string) => void;
}
const FILTERABLE = ['bookingNumber','passengerName','agency','status','pickupDateTime','createdAt','price','pickupLoc','dropoffLoc','pickupRegionCode','dropoffRegionCode','airportCode', 'vehicleType', 'paymentType', 'paymentStatus', 'flightNumber', 'adults'];

const FilterPopover: React.FC<{ colKey: string; filter: ColFilter; availableValues?: string[]; onFilter: (k:string,f:ColFilter)=>void; onClear:(k:string)=>void }> = ({ colKey, filter, availableValues = [], onFilter, onClear }) => {
    const [local, setLocal] = useState<ColFilter>({ ...filter });
    const [search, setSearch] = useState('');
    const isActive = !!(filter.text || (filter.values?.length) || (filter.statuses?.length) || filter.dateRange || filter.minPrice != null || filter.maxPrice != null);
    const statusOptions = Object.entries(DEFAULT_STATUS_COLORS);

    const checkboxCols = ['bookingNumber','passengerName','agency','pickupLoc','dropoffLoc','pickupRegionCode','dropoffRegionCode','airportCode','vehicleType','paymentStatus','flightNumber','adults'];
    const filteredValues = availableValues.filter(v => v.toLowerCase().includes(search.toLowerCase()));
    const allChecked = filteredValues.length > 0 && filteredValues.every(v => (local.values || []).includes(v));
    const someChecked = filteredValues.some(v => (local.values || []).includes(v));

    const toggleAll = (checked: boolean) => {
        const cur = new Set(local.values || []);
        filteredValues.forEach(v => { if (checked) cur.add(v); else cur.delete(v); });
        setLocal(p => ({ ...p, values: Array.from(cur) }));
    };
    const toggleOne = (v: string, checked: boolean) => {
        const cur = new Set(local.values || []);
        if (checked) cur.add(v); else cur.delete(v);
        setLocal(p => ({ ...p, values: Array.from(cur) }));
    };

    const content = (
        <div style={{ width: 280, padding: 4 }}>
            {checkboxCols.includes(colKey) && (
                <div style={{ marginBottom: 10 }}>
                    <Input
                        size="small"
                        prefix={<SearchOutlined />}
                        placeholder="Listede ara..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        allowClear
                        style={{ marginBottom: 8 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid #f0f0f0' }}>
                        <Checkbox
                            checked={allChecked}
                            indeterminate={!allChecked && someChecked}
                            onChange={e => toggleAll(e.target.checked)}
                        >
                            <Text style={{ fontSize: 12, fontWeight: 600 }}>(Tümünü Seç)</Text>
                        </Checkbox>
                        <Text type="secondary" style={{ fontSize: 11 }}>{filteredValues.length} öğe</Text>
                    </div>
                    <div style={{ maxHeight: 240, overflowY: 'auto', paddingRight: 4 }}>
                        {filteredValues.length === 0 && (
                            <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic', display: 'block', textAlign: 'center', padding: 12 }}>
                                Eşleşen değer yok
                            </Text>
                        )}
                        {filteredValues.map(v => (
                            <div key={v} style={{ display: 'flex', alignItems: 'center', padding: '2px 0' }}>
                                <Checkbox
                                    checked={(local.values || []).includes(v)}
                                    onChange={e => toggleOne(v, e.target.checked)}
                                    style={{ width: '100%' }}
                                >
                                    <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: v }}>{v || <span style={{ color: '#bbb', fontStyle: 'italic' }}>(boş)</span>}</Text>
                                </Checkbox>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {colKey === 'status' && (
                <div style={{ marginBottom: 10 }}>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>Durum</Text>
                    {statusOptions.map(([s, conf]) => (
                        <label key={s} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:5 }}>
                            <Checkbox checked={(local.statuses||[]).includes(s)} onChange={e => {
                                const cur = local.statuses||[];
                                setLocal(p => ({...p, statuses: e.target.checked ? [...cur,s] : cur.filter(x=>x!==s)}));
                            }} />
                            <Tag color={conf.color} style={{ margin:0, fontSize:11 }}>{conf.label}</Tag>
                        </label>
                    ))}
                </div>
            )}
            {['pickupDateTime','createdAt'].includes(colKey) && (
                <div style={{ marginBottom: 10 }}>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Tarih Aralığı</Text>
                    <RangePicker size="small" style={{ width:'100%' }} value={local.dateRange||null} onChange={v=>setLocal(p=>({...p,dateRange:v as any}))} format="DD.MM.YYYY" />
                </div>
            )}
            {colKey === 'price' && (
                <div style={{ marginBottom: 10 }}>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Tutar Aralığı (₺)</Text>
                    <Space>
                        <InputNumber size="small" placeholder="Min" style={{ width:108 }} value={local.minPrice} onChange={v=>setLocal(p=>({...p,minPrice:v}))} />
                        <span>–</span>
                        <InputNumber size="small" placeholder="Max" style={{ width:108 }} value={local.maxPrice} onChange={v=>setLocal(p=>({...p,maxPrice:v}))} />
                    </Space>
                </div>
            )}
            <Divider style={{ margin:'8px 0' }} />
            <Space style={{ width:'100%', justifyContent:'flex-end' }}>
                <Button size="small" icon={<ClearOutlined />} onClick={() => { setLocal({}); onClear(colKey); }}>Temizle</Button>
                <Button size="small" type="primary" onClick={() => onFilter(colKey, local)}>Uygula</Button>
            </Space>
        </div>
    );
    return (
        <Popover content={content} title={null} trigger="click" placement="bottomRight" destroyOnHidden>
            <Button type="text" size="small" style={{ padding:'0 2px', color: isActive ? '#6366f1' : '#ccc', marginLeft:2 }}
                icon={isActive ? <FilterFilled style={{fontSize:11}} /> : <FilterOutlined style={{fontSize:11}} />} />
        </Popover>
    );
};

const EditableHeader: React.FC<EditableHeaderProps & { availableValues?: string[] }> = ({ colKey, title, filter, availableValues, onTitleChange, onFilter, onClearFilter }) => {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(title);
    useEffect(() => setVal(title), [title]);
    const save = () => { setEditing(false); if (val.trim()) onTitleChange(colKey, val.trim()); };
    return (
        <div style={{ display:'flex', alignItems:'center', gap:2, userSelect:'none' }}>
            {editing ? (
                <Input size="small" value={val} onChange={e=>setVal(e.target.value)} onBlur={save} onPressEnter={save} style={{ width:90, fontSize:12 }} autoFocus />
            ) : (
                <span onDoubleClick={()=>setEditing(true)} title="Çift tıkla → adı düzenle" style={{ cursor:'text', fontWeight:600 }}>{title}</span>
            )}
            {FILTERABLE.includes(colKey) && <FilterPopover colKey={colKey} filter={filter} availableValues={availableValues} onFilter={onFilter} onClear={onClearFilter} />}
        </div>
    );
};

// ─── Color Settings Modal ────────────────────────────────────────────────────
const ColorSettingsModal: React.FC<{
    open: boolean; colors: Record<string, StatusConf>;
    onChange: (k: string, field: 'color'|'bg', v: string) => void;
    onReset: () => void; onClose: () => void; onSave: () => void;
}> = ({ open, colors, onChange, onReset, onClose, onSave }) => (
    <Modal title={<Space><BgColorsOutlined style={{color:'#6366f1'}}/>Renk Ayarları — Duruma Göre Satır Rengi</Space>}
        open={open} onCancel={onClose} width={520}
        footer={[
            <Button key="reset" icon={<ResetOutlined />} onClick={onReset}>Varsayılana Sıfırla</Button>,
            <Button key="cancel" onClick={onClose}>İptal</Button>,
            <Button key="save" type="primary" onClick={onSave} style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',border:'none'}}>Renkleri Kaydet</Button>,
        ]}
    >
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:8 }}>
            {Object.entries(colors).map(([status, conf]) => (
                <div key={status} style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <Tag color={conf.color} style={{ width:110, textAlign:'center', fontWeight:600, margin:0 }}>{conf.label}</Tag>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <Text style={{ fontSize:11, color:'#888', width:40 }}>Renk:</Text>
                        <input type="color" value={conf.color} onChange={e=>onChange(status,'color',e.target.value)}
                            style={{ width:36, height:28, border:'1px solid #e5e7eb', borderRadius:6, cursor:'pointer', padding:2 }} />
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <Text style={{ fontSize:11, color:'#888', width:60 }}>Arka Plan:</Text>
                        <input type="color" value={conf.bg} onChange={e=>onChange(status,'bg',e.target.value)}
                            style={{ width:36, height:28, border:'1px solid #e5e7eb', borderRadius:6, cursor:'pointer', padding:2 }} />
                        <div style={{ width:80, height:24, borderRadius:6, background:conf.bg, border:`1px solid ${conf.color}40` }} />
                    </div>
                </div>
            ))}
        </div>
    </Modal>
);

// ─── Helper ───────────────────────────────────────────────────────────────────
const EnvironmentItem = ({ text, color }: { text: string; color: string }) => (
    <div style={{ display:'flex', alignItems:'center', width: '100%', overflow: 'hidden' }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background: color==='green'?'#10b981':'#ef4444', marginRight:8, flexShrink:0 }} />
        <Text ellipsis={{ tooltip: text }} style={{ fontSize:12, flex: 1, minWidth: 0 }}>{text}</Text>
    </div>
);

function getEffectiveStatus(r: Booking) {
    if (r.status === 'CONFIRMED') {
        if (r.operationalStatus === 'IN_OPERATION') return 'IN_OPERATION';
        if (r.operationalStatus === 'IN_POOL') return 'IN_POOL';
    }
    return r.status;
}

// ─── Main Page ───────────────────────────────────────────────────────────────
const TransfersPage: React.FC = () => {
    const { socket, isConnected } = useSocket();
    const [loading, setLoading] = useState(false);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [searchText, setSearchText] = useState('');
    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm] = Form.useForm();
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [createForm] = Form.useForm();
    const [poolModalOpen, setPoolModalOpen] = useState(false);
    const [activePoolBooking, setActivePoolBooking] = useState<Booking | null>(null);
    const [poolPriceInput, setPoolPriceInput] = useState<number | null>(null);

    const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_VISIBLE_COLS);
    const [colTitles, setColTitles] = useState<Record<string,string>>(DEFAULT_COL_TITLES);
    const [colOrder, setColOrder] = useState<string[]>(ALL_COL_KEYS);
    const [colManagerOpen, setColManagerOpen] = useState(false);
    const [colFilters, setColFilters] = useState<ColFilters>({});
    const [autoApprove, setAutoApprove] = useState<'off'|'operation'|'pool'>('off');
    const autoApproveRef = useRef<'off'|'operation'|'pool'>('off');
    const [dragColIdx, setDragColIdx] = useState<number|null>(null);
    const [pageSize, setPageSize] = useState<number>(15);
    const colOrderRef = useRef<string[]>(ALL_COL_KEYS);
    useEffect(() => { colOrderRef.current = colOrder; }, [colOrder]);

    // Cancel modal state
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [cancelTargetId, setCancelTargetId] = useState<string|null>(null);
    const [cancelReason, setCancelReason] = useState<string|null>(null);
    const [cancelNote, setCancelNote] = useState<string>('');
    const [cancelSaving, setCancelSaving] = useState(false);

    // Inline cell editing state
    const [editingCell, setEditingCell] = useState<{ id: string; field: string; value: any } | null>(null);
    const [cellSaving, setCellSaving] = useState(false);

    // Passenger edit modal state
    const [paxModalOpen, setPaxModalOpen] = useState(false);
    const [paxModalBooking, setPaxModalBooking] = useState<Booking | null>(null);
    const [paxAdults, setPaxAdults] = useState(1);
    const [paxChildren, setPaxChildren] = useState(0);
    const [paxInfants, setPaxInfants] = useState(0);
    const [paxList, setPaxList] = useState<{ firstName: string; lastName: string; nationality: string; type: string }[]>([]);
    const [paxPaymentMethod, setPaxPaymentMethod] = useState<'ADD_TO_BALANCE' | 'PAY_IN_VEHICLE'>('ADD_TO_BALANCE');
    const [paxSaving, setPaxSaving] = useState(false);
    // Pricing-aware fields
    const [paxIsPerPerson, setPaxIsPerPerson] = useState(false);
    const [paxPerSeatPrice, setPaxPerSeatPrice] = useState(0);
    const [paxOriginalPrice, setPaxOriginalPrice] = useState(0);
    const [paxOriginalPax, setPaxOriginalPax] = useState(0);
    const [paxPricingMode, setPaxPricingMode] = useState<'auto' | 'keep' | 'manual'>('keep');
    const [paxManualPrice, setPaxManualPrice] = useState(0);

    const saveCellEdit = async (bookingId: string, field: string, value: any) => {
        setCellSaving(true);
        try {
            const payload: any = {};
            if (field === 'contactName') payload.contactName = value;
            else if (field === 'contactPhone') payload.contactPhone = value;
            else if (field === 'pickupDateTime') payload.pickupDateTime = value;
            else if (field === 'pickup') payload.pickupLocation = value;
            else if (field === 'dropoff') payload.dropoffLocation = value;
            else if (field === 'flightNumber') payload.flightNumber = value;
            else if (field === 'flightTime') payload.flightTime = value;
            else if (field === 'adults') payload.adults = value;
            else if (field === 'price') payload.price = value;
            else if (field === 'internalNotes') payload.internalNotes = value;
            else if (field === 'status') payload.status = value;
            await apiClient.patch(`/api/transfer/bookings/${bookingId}`, payload);
            
            setBookings(prev => prev.map((b: any) => {
                if (b.id !== bookingId) return b;
                const updated: any = { ...b };
                if (field === 'contactName') { updated.contactName = value; updated.passengerName = value; }
                else if (field === 'contactPhone') { updated.contactPhone = value; updated.passengerPhone = value; if (updated.customer) updated.customer.phone = value; }
                else if (field === 'pickupDateTime') updated.pickupDateTime = value;
                else if (field === 'pickup') { updated.pickup = value; if(!updated.metadata) updated.metadata={}; updated.metadata.pickup = value; }
                else if (field === 'dropoff') { updated.dropoff = value; if(!updated.metadata) updated.metadata={}; updated.metadata.dropoff = value; }
                else if (field === 'flightNumber') updated.flightNumber = value;
                else if (field === 'flightTime') updated.flightTime = value;
                else if (field === 'adults') updated.adults = Number(value);
                else if (field === 'price') { updated.price = Number(value); updated.total = Number(value); }
                else if (field === 'internalNotes') updated.internalNotes = value;
                else if (field === 'status') updated.status = value;
                return updated;
            }));
            message.success('Güncellendi');
        } catch (e: any) {
            message.error('Hata: ' + (e?.response?.data?.error || e.message));
        } finally {
            setCellSaving(false);
            setEditingCell(null);
        }
    };

    // ── Passenger edit modal helpers ──
    const openPaxModal = (booking: Booking) => {
        const a = booking.adults || 1;
        const c = booking.children || 0;
        const inf = booking.infants || 0;
        setPaxAdults(a);
        setPaxChildren(c);
        setPaxInfants(inf);
        // Load existing passenger details
        const existing = booking.metadata?.passengerDetails || booking.metadata?.passengersList || [];
        const mapped = existing.map((p: any) => ({
            firstName: p.firstName || p.name?.split(' ')[0] || '',
            lastName: p.lastName || p.name?.split(' ').slice(1).join(' ') || '',
            nationality: p.nationality || p.country || '',
            type: p.type || 'adult',
        }));
        setPaxList(mapped);
        setPaxPaymentMethod('ADD_TO_BALANCE');

        // ── Detect per-person pricing & derive per-seat rate ──
        const md = booking.metadata || {};
        const isPerPerson = !!md.isShuttle || !!md.shuttleRouteId;
        const originalPax = a + c + inf;
        const currentPrice = Number(booking.price || 0);
        // Prefer stored pricePerSeat, else derive from current price ÷ original pax
        const storedPerSeat = Number(md.pricePerSeat || md.vehiclePrice || 0) / Math.max(1, originalPax);
        const derivedPerSeat = originalPax > 0 ? currentPrice / originalPax : 0;
        const perSeat = md.pricePerSeat ? Number(md.pricePerSeat) : derivedPerSeat;

        setPaxIsPerPerson(isPerPerson);
        setPaxPerSeatPrice(perSeat);
        setPaxOriginalPrice(currentPrice);
        setPaxOriginalPax(originalPax);
        setPaxPricingMode(isPerPerson ? 'auto' : 'keep');
        setPaxManualPrice(currentPrice);

        setPaxModalBooking(booking);
        setPaxModalOpen(true);
    };

    const syncPaxListToCount = (adults: number, children: number, infants: number, currentList: typeof paxList) => {
        const totalNeeded = adults + children + infants;
        // Build type array
        const types: string[] = [];
        for (let i = 0; i < adults; i++) types.push('adult');
        for (let i = 0; i < children; i++) types.push('child');
        for (let i = 0; i < infants; i++) types.push('infant');
        // Resize list
        const newList = types.map((type, idx) => {
            if (idx < currentList.length) return { ...currentList[idx], type };
            return { firstName: '', lastName: '', nationality: '', type };
        });
        return newList;
    };

    const handlePaxCountChange = (field: 'adults' | 'children' | 'infants', delta: number) => {
        let a = paxAdults, c = paxChildren, inf = paxInfants;
        if (field === 'adults') a = Math.max(1, a + delta);
        if (field === 'children') c = Math.max(0, c + delta);
        if (field === 'infants') inf = Math.max(0, inf + delta);
        setPaxAdults(a); setPaxChildren(c); setPaxInfants(inf);
        const newList = syncPaxListToCount(a, c, inf, paxList);
        setPaxList(newList);
    };

    const handlePaxFieldChange = (index: number, field: string, value: string) => {
        setPaxList(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
    };

    // Compute new price based on pricing mode
    const paxNewTotalPax = paxAdults + paxChildren + paxInfants;
    const paxComputedNewPrice = (() => {
        if (paxPricingMode === 'auto' && paxIsPerPerson) {
            return Math.round(paxPerSeatPrice * paxNewTotalPax);
        }
        if (paxPricingMode === 'manual') return paxManualPrice;
        return paxOriginalPrice; // 'keep'
    })();
    const paxPriceDiff = paxComputedNewPrice - paxOriginalPrice;

    const savePaxChanges = async () => {
        if (!paxModalBooking) return;
        setPaxSaving(true);
        try {
            const payload: any = {
                adults: paxAdults,
                children: paxChildren,
                infants: paxInfants,
                passengerDetails: paxList.map(p => ({
                    firstName: p.firstName,
                    lastName: p.lastName,
                    name: `${p.firstName} ${p.lastName}`.trim(),
                    nationality: p.nationality,
                    type: p.type,
                })),
            };
            // Apply new price only if the user chose ADD_TO_BALANCE (reflect into booking total).
            // If PAY_IN_VEHICLE, the price is kept as-is and the diff is recorded as a note for the driver.
            const reflectPrice = paxPriceDiff !== 0 && paxPaymentMethod === 'ADD_TO_BALANCE';
            if (reflectPrice) {
                payload.price = Math.max(0, paxComputedNewPrice);
            }
            await apiClient.patch(`/api/transfer/bookings/${paxModalBooking.id}`, payload);
            // Update local state
            setBookings(prev => prev.map((b: any) => {
                if (b.id !== paxModalBooking.id) return b;
                const updated = { ...b, adults: paxAdults, children: paxChildren, infants: paxInfants };
                if (reflectPrice) {
                    updated.price = Math.max(0, paxComputedNewPrice);
                    updated.total = updated.price;
                }
                if (!updated.metadata) updated.metadata = {};
                updated.metadata.passengerDetails = payload.passengerDetails;
                if (paxPriceDiff !== 0) {
                    updated.metadata.paxChangeNote = `${paxPaymentMethod === 'PAY_IN_VEHICLE' ? 'Araçta ödeme' : 'Bakiyeye eklendi'}: ${paxPriceDiff > 0 ? '+' : ''}${paxPriceDiff.toLocaleString('tr-TR')} ₺`;
                    updated.metadata.paxPaymentMethod = paxPaymentMethod;
                }
                return updated;
            }));
            message.success('Yolcu bilgileri güncellendi');
            setPaxModalOpen(false);
        } catch (e: any) {
            message.error('Hata: ' + (e?.response?.data?.error || e.message));
        } finally {
            setPaxSaving(false);
        }
    };

    const renderEditableCell = (record: any, field: string, displayValue: React.ReactNode, editComponent?: React.ReactNode) => {
        const isEditing = editingCell?.id === record.id && editingCell?.field === field;
        if (isEditing) {
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {editComponent || (
                        <Input
                            size="small"
                            autoFocus
                            defaultValue={editingCell.value}
                            onBlur={(e) => saveCellEdit(record.id, field, e.target.value)}
                            onPressEnter={(e) => saveCellEdit(record.id, field, (e.target as HTMLInputElement).value)}
                            style={{ minWidth: 80 }}
                        />
                    )}
                </div>
            );
        }
        return (
            <div
                onDoubleClick={() => {
                    let initVal: any = '';
                    if (field === 'contactName') initVal = record.contactName || record.customer?.name || record.passengerName || '';
                    else if (field === 'contactPhone') initVal = record.contactPhone || record.customer?.phone || record.passengerPhone || '';
                    else if (field === 'pickupDateTime') initVal = record.pickupDateTime ? dayjs(record.pickupDateTime).format('YYYY-MM-DDTHH:mm') : '';
                    else if (field === 'pickup') initVal = record.metadata?.pickup || record.pickup || record.pickupLocation || '';
                    else if (field === 'dropoff') initVal = record.metadata?.dropoff || record.dropoff || record.dropoffLocation || '';
                    else if (field === 'flightNumber') initVal = record.flightNumber || '';
                    else if (field === 'flightTime') initVal = record.flightTime || '';
                    else if (field === 'adults') initVal = record.adults || 1;
                    else if (field === 'price') initVal = record.price || record.total || 0;
                    else if (field === 'internalNotes') initVal = record.internalNotes || '';
                    else if (field === 'status') initVal = record.status || '';
                    setEditingCell({ id: record.id, field, value: initVal });
                }}
                title="Düzenlemek için çift tıklayın"
                style={{ cursor: 'text', minHeight: 20 }}
            >
                {displayValue}
            </div>
        );
    };

    // Color settings
    const [statusColors, setStatusColors] = useState<Record<string,StatusConf>>(DEFAULT_STATUS_COLORS);
    const [colorModalOpen, setColorModalOpen] = useState(false);
    const [draftColors, setDraftColors] = useState<Record<string,StatusConf>>(DEFAULT_STATUS_COLORS);

    // Column widths (resizable)
    const [colWidths, setColWidths] = useState<Record<string, number>>(DEFAULT_COL_WIDTHS);
    const handleResize = useCallback((key: string) => (_: any, { size }: { size: { width: number } }) => {
        setColWidths(prev => ({ ...prev, [key]: Math.max(50, size.width) }));
    }, []);
    const handleResetWidth = useCallback((key: string) => {
        setColWidths(prev => ({ ...prev, [key]: DEFAULT_COL_WIDTHS[key] || 100 }));
    }, []);
    const handleResetAllWidths = useCallback(() => {
        setColWidths({ ...DEFAULT_COL_WIDTHS });
        message.success('Kolon genişlikleri sıfırlandı');
    }, []);

    // Handle column drop (reorder)
    const handleColDrop = useCallback((dragKey: string, dropKey: string) => {
        const currentOrder = colOrderRef.current.length > 0 ? [...colOrderRef.current] : [...ALL_COL_KEYS];
        const dragIdx = currentOrder.indexOf(dragKey);
        const dropIdx = currentOrder.indexOf(dropKey);
        if (dragIdx === -1 || dropIdx === -1) return;
        const [removed] = currentOrder.splice(dragIdx, 1);
        currentOrder.splice(dropIdx, 0, removed);
        colOrderRef.current = currentOrder;
        setColOrder(currentOrder);
        savePreferences({ colOrder: currentOrder });
    }, []);

    // Table components — enables resizable + draggable headers
    const tableComponents = {
        header: {
            cell: (cellProps: any) => <DraggableResizableTitle {...cellProps} onColDrop={handleColDrop} onResetWidth={handleResetWidth} />
        },
    };

    const savePreferences = (updates: any) => {
        apiClient.get('/api/auth/metadata').then(res => {
            const currentMeta = res.data?.data || {};
            const currentPrefs = currentMeta.transfer_preferences || {};
            const newPrefs = { ...currentPrefs, ...updates };
            apiClient.put('/api/auth/metadata', { preferences: { transfer_preferences: newPrefs } });
        }).catch(()=>{});
    };

    useEffect(() => { autoApproveRef.current = autoApprove; }, [autoApprove]);

    useEffect(() => {
        const init = async () => {
            // 1. Load preferences
            let savedMode: 'off'|'operation'|'pool' = 'off';
            try {
                const metaRes = await apiClient.get('/api/auth/metadata');
                if (metaRes.data?.success && metaRes.data?.data?.transfer_preferences) {
                    const prefs = metaRes.data.data.transfer_preferences;
                    if (prefs.colTitles) setColTitles(prefs.colTitles);
                    if (prefs.visibleCols) setVisibleCols(prefs.visibleCols);
                    if (prefs.statusColors) setStatusColors(prefs.statusColors);
                    if (prefs.colOrder) setColOrder(prefs.colOrder);
                    if (prefs.autoApprove) { savedMode = prefs.autoApprove; setAutoApprove(savedMode); autoApproveRef.current = savedMode; }
                } else {
                    setStatusColors(loadColors());
                }
            } catch {
                setStatusColors(loadColors());
            }
            // 2. Load bookings
            setLoading(true);
            let bookingsList: Booking[] = [];
            try {
                const res = await apiClient.get('/api/transfer/bookings');
                if (res.data.success) { bookingsList = res.data.data; setBookings(bookingsList); }
            } catch { message.error('Rezervasyonlar yüklenemedi'); }
            finally { setLoading(false); }
            // 3. Bulk auto-approve existing pending bookings if mode is active
            if (savedMode !== 'off' && bookingsList.length > 0) {
                const pending = bookingsList.filter(b => b.status === 'PENDING');
                if (pending.length > 0) {
                    console.log(`[InitBulkAutoApprove] mode=${savedMode}, pending=${pending.length}`);
                    bulkAutoApprove(savedMode, bookingsList);
                }
            }
        };
        init();
    }, []);

    const getStatusConf = (r: Booking) => statusColors[getEffectiveStatus(r)] || statusColors['PENDING'];

    const fetchBookings = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/transfer/bookings');
            if (res.data.success) setBookings(res.data.data);
        } catch { message.error('Rezervasyonlar yüklenemedi'); }
        finally { setLoading(false); }
    };

    // Bulk auto-approve: process all PENDING bookings
    const bulkAutoApprove = async (mode: 'operation' | 'pool', list?: Booking[]) => {
        const pending = (list || bookings).filter(b => b.status === 'PENDING');
        if (pending.length === 0) return;
        const subStatus = mode === 'operation' ? 'IN_OPERATION' : 'IN_POOL';
        const label = mode === 'operation' ? 'Operasyona' : 'Havuza';
        console.log(`[BulkAutoApprove] Processing ${pending.length} pending bookings → ${subStatus}`);
        let ok = 0;
        for (const b of pending) {
            try {
                await apiClient.put(`/api/transfer/bookings/${b.id}/status`, { status: 'CONFIRMED', subStatus });
                ok++;
            } catch (err) {
                console.error(`[BulkAutoApprove] Failed for ${b.id}:`, err);
            }
        }
        if (ok > 0) {
            message.success(`${ok} bekleyen rezervasyon ${label} aktarıldı`);
            fetchBookings();
        }
    };

    useEffect(() => {
        if (!socket || !isConnected) return;
        const handleNewBooking = (data: any) => {
            console.log("Socket: New booking received, reloading list...", data);
            fetchBookings();
            // Auto-approve if enabled
            const mode = autoApproveRef.current;
            const bookingId = data?.id || data?.bookingId;
            if (mode !== 'off' && bookingId) {
                const subStatus = mode === 'operation' ? 'IN_OPERATION' : 'IN_POOL';
                console.log(`[AutoApprove] mode=${mode}, bookingId=${bookingId}, subStatus=${subStatus}`);
                setTimeout(() => {
                    apiClient.put(`/api/transfer/bookings/${bookingId}/status`, { status: 'CONFIRMED', subStatus })
                        .then(() => {
                            message.info(`Otomatik: ${mode === 'operation' ? 'Operasyona aktarıldı' : 'Havuza aktarıldı'}`);
                            fetchBookings();
                        }).catch((err) => {
                            console.error('[AutoApprove] Failed:', err);
                            message.error('Otomatik aktarım başarısız');
                        });
                }, 1500);
            } else if (mode !== 'off') {
                console.warn('[AutoApprove] No bookingId in socket payload:', data);
            }
        };
        socket.on('new_booking', handleNewBooking);
        return () => {
            socket.off('new_booking', handleNewBooking);
        };
    }, [socket, isConnected]);

    const handleUpdateStatus = async (id: string, status: string, subStatus?: string) => {
        try {
            const res = await apiClient.put(`/api/transfer/bookings/${id}/status`, { status, subStatus });
            if (res.data.success) {
                message.success(subStatus ? `Durum: ${subStatus==='IN_OPERATION'?'Operasyona Aktarıldı':'Havuza Aktarıldı'}` : 'Durum güncellendi');
                fetchBookings();
                if (selectedBooking?.id === id) setDetailModalVisible(false);
            }
        } catch { message.error('İşlem başarısız'); }
    };

    const openCancelModal = (id: string) => {
        setCancelTargetId(id);
        setCancelReason(null);
        setCancelNote('');
        setCancelModalOpen(true);
    };

    const handleConfirmCancel = async () => {
        if (!cancelTargetId || !cancelReason) { message.warning('Lütfen iptal sebebi seçin'); return; }
        setCancelSaving(true);
        try {
            const res = await apiClient.put(`/api/transfer/bookings/${cancelTargetId}/status`, {
                status: 'CANCELLED',
                cancellationReason: cancelReason,
                cancellationNote: cancelNote
            });
            if (res.data.success) {
                message.success('Rezervasyon iptal edildi');
                setCancelModalOpen(false);
                fetchBookings();
                if (selectedBooking?.id === cancelTargetId) setDetailModalVisible(false);
            }
        } catch { message.error('İptal işlemi başarısız'); }
        finally { setCancelSaving(false); }
    };

    const handleConfirmPool = async () => {
        if (!activePoolBooking) return;
        try {
            const res = await apiClient.put(`/api/transfer/bookings/${activePoolBooking.id}/status`, { 
                status: 'CONFIRMED', 
                subStatus: 'IN_POOL',
                poolPrice: poolPriceInput
            });
            if (res.data.success) {
                message.success('Havuza aktarıldı');
                setPoolModalOpen(false);
                fetchBookings();
            }
        } catch { message.error('İşlem başarısız'); }
    };

    // Color helpers
    const openColorModal = () => { setDraftColors({...statusColors}); setColorModalOpen(true); };
    const handleColorChange = (status: string, field: 'color'|'bg', val: string) => {
        setDraftColors(p => ({...p, [status]: {...p[status], [field]: val}}));
    };
    const handleColorSave = () => {
        setStatusColors(draftColors);
        savePreferences({ statusColors: draftColors });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draftColors));
        setColorModalOpen(false);
        message.success('Renkler kaydedildi');
    };
    const handleColorReset = () => setDraftColors({...DEFAULT_STATUS_COLORS});

    // Filter helpers
    const handleApplyFilter = (key: string, f: ColFilter) => setColFilters(p => ({...p, [key]: f}));
    const handleClearFilter = (key: string) => setColFilters(p => { const n={...p}; delete n[key]; return n; });
    const handleTitleChange = (key: string, val: string) => {
        setColTitles(p => {
            const next = {...p, [key]: val};
            savePreferences({ colTitles: next });
            return next;
        });
    };

    // Location helpers
    const getPickup = (r: Booking) => r.metadata?.pickup || r.pickup || '-';
    const getDropoff = (r: Booking) => r.metadata?.dropoff || r.dropoff || '-';
    const getAirportForRow = (r: Booking): string | null => {
        const p = getAirportCode(getPickup(r));
        const d = getAirportCode(getDropoff(r));
        if (p && d) return `${p} / ${d}`;
        return p || d || null;
    };

    // Extract displayed value for a column from a booking row (used by both filters & unique-value derivation)
    const extractColValue = (key: string, b: Booking): string => {
        switch (key) {
            case 'bookingNumber': return b.bookingNumber || '';
            case 'passengerName': return b.passengerName || '';
            case 'agency': return b.agencyName || b.agency?.name || b.partnerName || b.metadata?.agencyName || 'Direkt';
            case 'pickupLoc': return getPickup(b);
            case 'dropoffLoc': return getDropoff(b);
            case 'airportCode': return getAirportForRow(b) || '';
            case 'vehicleType': return b.metadata?.vehicleType || b.vehicleType || '';
            case 'paymentStatus': return b.paymentStatus || '';
            case 'flightNumber': return b.flightNumber || '';
            case 'adults': return b.adults != null ? b.adults.toString() : '';
            case 'pickupRegionCode': return b.pickupRegionCode || b.metadata?.pickupRegionCode || '';
            case 'dropoffRegionCode': return b.dropoffRegionCode || b.metadata?.dropoffRegionCode || '';
            default: return '';
        }
    };

    // Compute unique values per filterable column from all bookings (used for checkbox lists)
    const checkboxFilterCols = ['bookingNumber','passengerName','agency','pickupLoc','dropoffLoc','pickupRegionCode','dropoffRegionCode','airportCode','vehicleType','paymentStatus','flightNumber','adults'];
    const uniqueColValues = useMemo(() => {
        const out: Record<string, string[]> = {};
        checkboxFilterCols.forEach(key => {
            const set = new Set<string>();
            bookings.forEach(b => set.add(extractColValue(key, b)));
            out[key] = Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
        });
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookings]);

    // Filtered data
    const filteredBookings = bookings.filter(b => {
        if (searchText) {
            const s = searchText.toLowerCase();
            if (!b.bookingNumber.toLowerCase().includes(s) && !b.passengerName.toLowerCase().includes(s) && !(b.passengerPhone||'').includes(s)) return false;
        }
        for (const [key, f] of Object.entries(colFilters)) {
            // Excel-style checkbox filtering for text columns
            if (checkboxFilterCols.includes(key)) {
                if (f.values && f.values.length > 0) {
                    const v = extractColValue(key, b);
                    if (!f.values.includes(v)) return false;
                } else if (f.text) {
                    // Backwards-compat: legacy text filter
                    const v = extractColValue(key, b).toLowerCase();
                    if (!v.includes(f.text.toLowerCase())) return false;
                }
                continue;
            }
            if (key==='status' && f.statuses?.length) {
                if (!f.statuses.includes(getEffectiveStatus(b))) return false;
            }
            if (key==='pickupDateTime' && f.dateRange) {
                const dt = dayjs(b.pickupDateTime);
                if (dt.isBefore(f.dateRange[0],'day')||dt.isAfter(f.dateRange[1],'day')) return false;
            }
            if (key==='createdAt' && f.dateRange) {
                const dt = dayjs(b.createdAt);
                if (dt.isBefore(f.dateRange[0],'day')||dt.isAfter(f.dateRange[1],'day')) return false;
            }
            if (key==='price') {
                if (f.minPrice!=null && b.price<f.minPrice) return false;
                if (f.maxPrice!=null && b.price>f.maxPrice) return false;
            }
        }
        return true;
    });

    // Export
    const getExportRows = () => filteredBookings.map(b => ({
        'Rezervasyon No': b.bookingNumber,
        'Transfer Zamanı': dayjs(b.pickupDateTime).format('DD.MM.YYYY HH:mm'),
        'Kayıt Tarihi': dayjs(b.createdAt).format('DD.MM.YYYY HH:mm'),
        'Acente': b.agencyName||b.agency?.name||'Direkt',
        'Yolcu': b.passengerName,
        'Telefon': b.passengerPhone,
        'Alış Yeri': getPickup(b),
        'Bırakış Yeri': getDropoff(b),
        'İste Kodu': getAirportForRow(b)||'-',
        'Araç': b.metadata?.vehicleType||b.vehicleType||'-',
        'Tutar (₺)': b.price,
        'Durum': statusColors[getEffectiveStatus(b)]?.label||b.status,
        'Ödeme': b.paymentStatus,
        'Uçuş No': b.flightNumber||'-',
    }));

    const handleExportExcel = () => {
        const ws = XLSX.utils.json_to_sheet(getExportRows());
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Rezervasyonlar');
        XLSX.writeFile(wb, `rezervasyonlar_${dayjs().format('YYYY-MM-DD')}.xlsx`);
        message.success('Excel indirildi');
    };
    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation:'landscape' });
        doc.setFontSize(14); doc.text('Transfer Rezervasyonları', 14, 16);
        doc.setFontSize(9); doc.text(`${dayjs().format('DD.MM.YYYY HH:mm')}`, 14, 23);
        const rows = getExportRows();
        const headers = Object.keys(rows[0]||{});
        autoTable(doc, { startY:28, head:[headers], body:rows.map(r=>headers.map(h=>(r as any)[h])),
            styles:{fontSize:7,cellPadding:2}, headStyles:{fillColor:[99,102,241],textColor:255,fontStyle:'bold'},
            alternateRowStyles:{fillColor:[248,248,255]} });
        doc.save(`rezervasyonlar_${dayjs().format('YYYY-MM-DD')}.pdf`);
        message.success('PDF indirildi');
    };
    const handlePrint = () => { window.print(); };

    // Row class
    const rowClassName = (record: Booking) => `booking-row booking-row-${getEffectiveStatus(record).toLowerCase()}`;

    // Dynamic style block based on current colors
    const dynamicStyles = Object.entries(statusColors).map(([status, conf]) => {
        const cls = `.booking-row-${status.toLowerCase()}`;
        return `
            ${cls} td { background: ${conf.bg} !important; }
            ${cls}:hover td { background: ${conf.bg}dd !important; filter: brightness(0.96); }
            ${cls} td:first-child { border-left: 3px solid ${conf.color}; }
        `;
    }).join('\n');

    // Header builder — includes resize via onHeaderCell
    const makeHeader = (key: string) => ({
        title: <EditableHeader colKey={key} title={colTitles[key]||key} filter={colFilters[key]||{}}
            availableValues={uniqueColValues[key]}
            onTitleChange={handleTitleChange} onFilter={handleApplyFilter} onClearFilter={handleClearFilter} />,
        onHeaderCell: (col: any) => ({
            width: col.width,
            colKey: key,
            onResize: handleResize(key),
        }),
    });

    // All columns definition
    const ALL_COLUMNS: any[] = [
        { ...makeHeader('bookingNumber'), dataIndex:'bookingNumber', key:'bookingNumber', width:colWidths.bookingNumber,
          sorter:(a:Booking,b:Booking)=>a.bookingNumber.localeCompare(b.bookingNumber),
          render:(text:string,record:Booking)=>{
              const conf=getStatusConf(record);
              return <Text strong style={{color:record.status==='CANCELLED'?'#ef4444':conf.color,fontSize:12}}>{text}</Text>;
          }},
        { ...makeHeader('pickupDateTime'), dataIndex:'pickupDateTime', key:'pickupDateTime', width:colWidths.pickupDateTime,
          sorter:(a:Booking,b:Booking)=>dayjs(a.pickupDateTime).unix()-dayjs(b.pickupDateTime).unix(),
          render:(d:string, r:Booking)=>renderEditableCell(r, 'pickupDateTime', <Space orientation="vertical" size={0}><Text style={{fontSize:12}}>{dayjs(d).format('DD.MM.YYYY')}</Text><Text type="secondary" style={{fontSize:11}}>{dayjs(d).format('HH:mm')}</Text></Space>, <Input type="datetime-local" size="small" autoFocus defaultValue={dayjs(d).format('YYYY-MM-DDTHH:mm')} onBlur={(e) => saveCellEdit(r.id, 'pickupDateTime', e.target.value)} onPressEnter={(e) => saveCellEdit(r.id, 'pickupDateTime', (e.target as HTMLInputElement).value)} style={{width: 140}} />)},
        { ...makeHeader('createdAt'), dataIndex:'createdAt', key:'createdAt', width:colWidths.createdAt,
          sorter:(a:Booking,b:Booking)=>dayjs(a.createdAt).unix()-dayjs(b.createdAt).unix(),
          render:(d:string)=><Space orientation="vertical" size={0}><Text style={{fontSize:12}}>{dayjs(d).format('DD.MM.YYYY')}</Text><Text type="secondary" style={{fontSize:11}}>{dayjs(d).format('HH:mm')}</Text></Space>},
        { ...makeHeader('agency'), key:'agency', width:colWidths.agency,
          sorter:(a:Booking,b:Booking)=>{const na=a.agencyName||a.agency?.name||'Direkt';const nb=b.agencyName||b.agency?.name||'Direkt';return na.localeCompare(nb);},
          render:(_:any,r:any)=>{const n=r.agencyName||r.agency?.name||r.partnerName||r.metadata?.agencyName||'Direkt';return <Text strong style={{fontSize:12}}>{n}</Text>;}},
        { ...makeHeader('passengerName'), dataIndex:'passengerName', key:'passengerName', width:colWidths.passengerName,
          sorter:(a:Booking,b:Booking)=>a.passengerName.localeCompare(b.passengerName),
          render:(text:string,r:Booking)=><Space orientation="vertical" size={0}>{renderEditableCell(r, 'contactName', <Text strong style={{fontSize:12}}>{text}</Text>)}{renderEditableCell(r, 'contactPhone', <Text type="secondary" style={{fontSize:11}}>{r.passengerPhone}</Text>)}</Space>},
        { ...makeHeader('pickupLoc'), key:'pickupLoc', width:colWidths.pickupLoc, ellipsis: true,
          render:(_:any,r:Booking)=>renderEditableCell(r, 'pickup', <EnvironmentItem text={getPickup(r)} color="green" />)},
        { ...makeHeader('dropoffLoc'), key:'dropoffLoc', width:colWidths.dropoffLoc, ellipsis: true,
          render:(_:any,r:Booking)=>renderEditableCell(r, 'dropoff', <EnvironmentItem text={getDropoff(r)} color="red" />)},
        { ...makeHeader('airportCode'), key:'airportCode', width:colWidths.airportCode,
          sorter:(a:Booking,b:Booking)=>(getAirportForRow(a)||'').localeCompare(getAirportForRow(b)||''),
          render:(_:any,r:Booking)=>{
              const code=getAirportForRow(r);
              return code ? <Tag style={{fontWeight:700,fontSize:12,letterSpacing:1,background:'#eef2ff',borderColor:'#6366f1',color:'#6366f1',borderRadius:6}}>✈ {code}</Tag> : <Text type="secondary" style={{fontSize:11}}>-</Text>;
          }},
        { ...makeHeader('pickupRegionCode'), key:'pickupRegionCode', width:colWidths.pickupRegionCode,
          sorter:(a:Booking,b:Booking)=>((a as any).pickupRegionCode||(a as any).metadata?.pickupRegionCode||'').localeCompare((b as any).pickupRegionCode||(b as any).metadata?.pickupRegionCode||''),
          render:(_:any,r:Booking)=>{
              const code=(r as any).pickupRegionCode||(r as any).metadata?.pickupRegionCode;
              return code ? <Tag style={{margin:0,fontSize:11,fontWeight:700,fontFamily:'monospace',letterSpacing:0.5,background:'#f0fdf4',border:'1px solid #bbf7d0',color:'#166534',borderRadius:4,padding:'1px 6px'}}>{code}</Tag> : <Text type="secondary" style={{fontSize:11}}>-</Text>;
          }},
        { ...makeHeader('dropoffRegionCode'), key:'dropoffRegionCode', width:colWidths.dropoffRegionCode,
          sorter:(a:Booking,b:Booking)=>((a as any).dropoffRegionCode||(a as any).metadata?.dropoffRegionCode||'').localeCompare((b as any).dropoffRegionCode||(b as any).metadata?.dropoffRegionCode||''),
          render:(_:any,r:Booking)=>{
              const code=(r as any).dropoffRegionCode||(r as any).metadata?.dropoffRegionCode;
              return code ? <Tag style={{margin:0,fontSize:11,fontWeight:700,fontFamily:'monospace',letterSpacing:0.5,background:'#fef3c7',border:'1px solid #fde68a',color:'#92400e',borderRadius:4,padding:'1px 6px'}}>{code}</Tag> : <Text type="secondary" style={{fontSize:11}}>-</Text>;
          }},
        { ...makeHeader('vehicleType'), key:'vehicleType', width:colWidths.vehicleType,
          sorter:(a:Booking,b:Booking)=>(a.metadata?.vehicleType||a.vehicleType||'').localeCompare(b.metadata?.vehicleType||b.vehicleType||''),
          render:(_:any,r:Booking)=><Space size={4}><CarOutlined style={{color:'#6366f1'}}/><Text style={{fontSize:11}}>{r.metadata?.vehicleType||r.vehicleType||'Bilinmiyor'}</Text></Space>},
        { ...makeHeader('price'), dataIndex:'price', key:'price', width:colWidths.price,
          sorter:(a:Booking,b:Booking)=>(a.price||0)-(b.price||0),
          render:(p:number, r:Booking)=>renderEditableCell(r, 'price', <Text strong style={{color:'#6366f1',fontSize:13}}>₺{p?.toLocaleString('tr-TR')}</Text>)},
        { ...makeHeader('status'), dataIndex:'status', key:'status', width:colWidths.status,
          sorter:(a:Booking,b:Booking)=>getEffectiveStatus(a).localeCompare(getEffectiveStatus(b)),
          render:(_:any,r:Booking)=>{const conf=getStatusConf(r);return renderEditableCell(r, 'status', <Tag style={{background:conf.bg,borderColor:conf.color,color:conf.color,fontWeight:600,fontSize:11,padding:'2px 8px',borderRadius:20,cursor:'pointer'}}>{conf.label}</Tag>, <Select size="small" autoFocus defaultOpen defaultValue={r.status} style={{ width: 100 }} onChange={(val) => saveCellEdit(r.id, 'status', val)} onBlur={() => setEditingCell(null)} options={Object.keys(DEFAULT_STATUS_COLORS).map(k => ({ value: k, label: DEFAULT_STATUS_COLORS[k].label }))} />);}},
        { ...makeHeader('paymentType'), key:'paymentType', width:colWidths.paymentType || 110,
          render:(_:any,r:Booking)=>{
              const method = r.metadata?.paymentMethod;
              const ps = r.paymentStatus;
              if (!method) return <Text type="secondary" style={{fontSize:11}}>-</Text>;
              if (method === 'PAY_IN_VEHICLE') {
                  const paid = ps === 'PAID';
                  return <Tag color={paid ? 'green' : 'orange'} style={{fontSize:11}}>{paid ? 'Ödendi' : 'Araçta'}</Tag>;
              }
              if (method === 'CREDIT_CARD') return <Tag color="blue" style={{fontSize:11}}>Kart</Tag>;
              if (method === 'BALANCE') return <Tag color="green" style={{fontSize:11}}>Bakiye</Tag>;
              return <Tag style={{fontSize:11}}>{String(method)}</Tag>;
          }},
        { ...makeHeader('paymentStatus'), dataIndex:'paymentStatus', key:'paymentStatus', width:colWidths.paymentStatus,
          render:(ps:string)=><Tag color={ps==='PAID'?'green':ps==='REFUNDED'?'red':'orange'} style={{fontSize:11}}>{ps==='PAID'?'Ödendi':ps==='REFUNDED'?'İade':'Bekliyor'}</Tag>},
        { ...makeHeader('flightNumber'), key:'flightNumber', width:colWidths.flightNumber,
          render:(_:any, fn:Booking)=>(
              <Space orientation="vertical" size={2}>
                  {renderEditableCell(fn, 'flightNumber', fn.flightNumber ? <Text style={{fontSize:12}}>{fn.flightNumber}</Text> : <Text type="secondary" style={{fontSize:11}}>-</Text>)}
                  {renderEditableCell(fn, 'flightTime', fn.flightTime ? <Tag icon={<RocketOutlined />} color="cyan" style={{margin:0, fontSize: 10}}>{fn.flightTime}</Tag> : <Text type="secondary" style={{fontSize:11}}>-</Text>)}
              </Space>
          )},
        { ...makeHeader('adults'), key:'adults', width:colWidths.adults,
          sorter:(a:Booking,b:Booking)=>((a.adults||1)+(a.children||0)+(a.infants||0))-((b.adults||1)+(b.children||0)+(b.infants||0)),
          render:(_:any, r:Booking)=>{
              const adults = r.adults || (r as any).passengers || r.metadata?.passengerDetails?.length || r.metadata?.passengersList?.length || 1;
              const children = r.children || 0;
              const infants = r.infants || 0;
              const total = adults + children + infants;
              const parts: string[] = [];
              if (adults > 0) parts.push(`${adults}Y`);
              if (children > 0) parts.push(`${children}Ç`);
              if (infants > 0) parts.push(`${infants}B`);
              return (
                  <div
                      onDoubleClick={() => openPaxModal(r)}
                      title="Yolcu düzenlemek için çift tıklayın"
                      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}
                  >
                      <Text style={{fontSize:12, fontWeight: 500}}>{total ? `${total} kişi` : '-'}</Text>
                      <Text type="secondary" style={{fontSize:10, lineHeight: 1, letterSpacing: '-0.3px'}}>{parts.join('+') || `${adults}Y`}</Text>
                  </div>
              );
          }},
        { ...makeHeader('customerNote'), key:'customerNote', width:colWidths.customerNote || 120,
          render:(_:any,r:Booking)=>{
              const req = r.metadata?.specialRequests || '';
              return req ? (
                  <Popover content={<div style={{maxWidth:250,wordWrap:'break-word'}}>{req}</div>} title="Müşteri Notu">
                      <Tag color="purple" style={{fontSize:10,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'100%',cursor:'pointer'}}>
                          {req.substring(0, 15)}...
                      </Tag>
                  </Popover>
              ) : <span style={{fontSize:11,color:'#aaa'}}>-</span>;
          }},
        { ...makeHeader('internalNotes'), key:'internalNotes', width:colWidths.internalNotes || 150,
          render:(_:any,r:Booking)=>{
              const val = r.internalNotes || '';
              return renderEditableCell(r, 'internalNotes', val ? (
                  <Popover content={<div style={{maxWidth:250,wordWrap:'break-word'}}>{val}</div>} title="Operasyon Notu">
                      <Tag color="blue" style={{fontSize:10,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'100%',cursor:'pointer'}}>
                          {val.substring(0, 20)}...
                      </Tag>
                  </Popover>
              ) : <span style={{fontSize:11,color:'#aaa',cursor:'text'}}>- (Not Ekle) -</span>,
              <Input.TextArea size="small" autoFocus defaultValue={val} onBlur={(e) => saveCellEdit(r.id, 'internalNotes', e.target.value)} style={{ minWidth: 140 }} />
              );
          }},
        { ...makeHeader('extraServices'), key:'extraServices', width:colWidths.extraServices,
          render:(_:any,r:Booking)=>{
              const services = r.metadata?.extraServices || [];
              if (!services.length) return <Text type="secondary" style={{fontSize:11}}>-</Text>;
              return (
                  <Space orientation="vertical" size={2}>
                      {services.map((s:any, idx:number) => (
                         <div key={idx} style={{ fontSize: 11, background: '#f8fafc', padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                            {s.quantity}x {s.name}
                         </div>
                      ))}
                  </Space>
              );
          }},
        { ...makeHeader('action'), key:'action', width:colWidths.action, fixed: 'left',
          render:(_:any,record:Booking)=>{
              const items: MenuProps['items'] = [
                  {key:'detail',label:'Detaylar',icon:<EyeOutlined/>,onClick:()=>{setSelectedBooking(record);setDetailModalVisible(true);}},
                  {key:'editPax',label:'Yolcu & Fiyat Düzenle',icon:<TeamOutlined style={{color:'#6366f1'}}/>,onClick:()=>openPaxModal(record)},
              ];
              if (record.status==='PENDING') {
                  items.push({type:'divider'} as any);
                  items.push({key:'op',label:'Onayla & Operasyona',icon:<SafetyCertificateOutlined style={{color:'#10b981'}}/>,onClick:()=>handleUpdateStatus(record.id,'CONFIRMED','IN_OPERATION')});
                  items.push({key:'pool',label:'Onayla & Havuza',icon:<TeamOutlined style={{color:'#06b6d4'}}/>,onClick:()=>{setActivePoolBooking(record);setPoolPriceInput(record.price||0);setPoolModalOpen(true);}});
                  items.push({type:'divider'} as any);
                  items.push({key:'cancel',label:'İptal Et',icon:<CloseCircleOutlined style={{color:'#ef4444'}}/>,danger:true,onClick:()=>openCancelModal(record.id)});
              }
              if (record.status==='CONFIRMED' && !['IN_OPERATION','IN_POOL'].includes(record.operationalStatus||'')) {
                  items.push({type:'divider'} as any);
                  items.push({key:'op2',label:'Operasyona Aktar',icon:<SafetyCertificateOutlined style={{color:'#10b981'}}/>,onClick:()=>handleUpdateStatus(record.id,'CONFIRMED','IN_OPERATION')});
                  items.push({key:'pool2',label:'Havuza Aktar',icon:<TeamOutlined style={{color:'#06b6d4'}}/>,onClick:()=>{setActivePoolBooking(record);setPoolPriceInput(record.price||0);setPoolModalOpen(true);}});
                  items.push({key:'complete',label:'Tamamlandı',icon:<CheckCircleOutlined style={{color:'#6366f1'}}/>,onClick:()=>handleUpdateStatus(record.id,'COMPLETED')});
              }
              return (
                  <Dropdown menu={{items}} trigger={['click']} placement="bottomLeft">
                      <Button type="text" size="small" icon={<MoreOutlined style={{fontSize:16}}/>}
                          style={{width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:6,border:'1px solid #e5e7eb'}}/>
                  </Dropdown>
              );
          }},
    ];

    // Column ordering - use effective order (from user preferences or default)
    const effectiveColOrder = colOrder.length > 0 ? colOrder : ALL_COL_KEYS;

    // Sort columns by effectiveColOrder, then filter by visibility
    const sortedColumns = [...effectiveColOrder]
        .filter(k => visibleCols.includes(k))
        .map(k => ALL_COLUMNS.find(c => c.key === k))
        .filter(Boolean);
    const totalWidth = sortedColumns.reduce((sum: number, col: any) => sum + (col.width || 100), 0);
    const activeFilterCount = Object.values(colFilters).filter(f=>f.text||(f.values?.length)||(f.statuses?.length)||f.dateRange||f.minPrice!=null||f.maxPrice!=null).length;

    // Reorder-capable keys (action stays fixed at left)
    const reorderableKeys = effectiveColOrder.filter(k => k !== 'action');

    const colManagerContent = (
        <div style={{width:340}}>
            <Text type="secondary" style={{fontSize:11,marginBottom:8,display:'block'}}>
                <HolderOutlined /> Sürükle: sırala &nbsp;•&nbsp; Çift tıkla başlık: ad düzenle &nbsp;•&nbsp; Kenardaki çubuk: genişlik
            </Text>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6,padding:'4px 8px',background:'#f9fafb',borderRadius:6}}>
                <Text strong style={{fontSize:11,color:'#475569'}}>Kolon</Text>
                <Space size={16}>
                    <Text strong style={{fontSize:11,color:'#475569',width:60,textAlign:'center'}}>Genişlik</Text>
                    <Text strong style={{fontSize:11,color:'#475569',width:36,textAlign:'center'}}>Görün.</Text>
                </Space>
            </div>
            <Divider style={{margin:'8px 0'}}/>
            <div style={{display:'flex',flexDirection:'column',gap:2}}>
                {reorderableKeys.map((key, idx) => (
                    <div key={key}
                        draggable
                        onDragStart={() => setDragColIdx(idx)}
                        onDragOver={(e) => {
                            e.preventDefault();
                            if (dragColIdx === null || dragColIdx === idx) return;
                            // Reorder within reorderableKeys, then prepend fixed keys
                            const currentReorderable = colOrderRef.current.length > 0
                                ? colOrderRef.current.filter(k => k !== 'action')
                                : ALL_COL_KEYS.filter(k => k !== 'action');
                            const newReorderable = [...currentReorderable];
                            const [removed] = newReorderable.splice(dragColIdx, 1);
                            newReorderable.splice(idx, 0, removed);
                            const newOrder = ['action', ...newReorderable];
                            colOrderRef.current = newOrder;
                            setColOrder(newOrder);
                            setDragColIdx(idx);
                        }}
                        onDragEnd={() => {
                            setDragColIdx(null);
                            savePreferences({ colOrder: colOrderRef.current });
                        }}
                        style={{
                            display:'flex',alignItems:'center',justifyContent:'space-between',
                            padding:'6px 8px', borderRadius:6, cursor:'grab',
                            background: dragColIdx === idx ? '#eef2ff' : 'transparent',
                            border: dragColIdx === idx ? '1px dashed #6366f1' : '1px solid transparent',
                            transition: 'all 0.15s'
                        }}
                    >
                        <Space size={8} style={{flex:1,minWidth:0}}>
                            <HolderOutlined style={{color:'#9ca3af', fontSize:12}} />
                            <Text style={{fontSize:12}} ellipsis={{tooltip:colTitles[key]||DEFAULT_COL_TITLES[key]||key}}>
                                {colTitles[key]||DEFAULT_COL_TITLES[key]||key}
                            </Text>
                        </Space>
                        <Space size={8}>
                            <InputNumber
                                size="small"
                                min={50}
                                max={600}
                                step={10}
                                value={colWidths[key] ?? DEFAULT_COL_WIDTHS[key] ?? 100}
                                onChange={(v) => {
                                    if (v != null) setColWidths(prev => ({ ...prev, [key]: Math.max(50, v) }));
                                }}
                                onClick={(e) => e.stopPropagation()}
                                style={{ width: 60 }}
                                controls
                            />
                            <Switch size="small" checked={visibleCols.includes(key)} onChange={checked=>{
                                let next: string[];
                                if(checked) next = [...visibleCols, key];
                                else next = visibleCols.filter(k => k !== key);
                                setVisibleCols(next);
                                savePreferences({ visibleCols: next });
                            }}/>
                        </Space>
                    </div>
                ))}
            </div>
            <Divider style={{margin:'8px 0'}}/>
            <Space style={{width:'100%'}} direction="vertical" size={4}>
                <Button size="small" block icon={<ReloadOutlined />} onClick={handleResetAllWidths}>
                    Genişlikleri Sıfırla
                </Button>
                <Button size="small" block onClick={()=>{
                    setVisibleCols(DEFAULT_VISIBLE_COLS);
                    setColTitles(DEFAULT_COL_TITLES);
                    setColOrder(ALL_COL_KEYS);
                    setColWidths({ ...DEFAULT_COL_WIDTHS });
                    savePreferences({ visibleCols: DEFAULT_VISIBLE_COLS, colTitles: DEFAULT_COL_TITLES, colOrder: ALL_COL_KEYS });
                }}>Tümünü Varsayılana Sıfırla</Button>
            </Space>
        </div>
    );

    const exportMenuItems: MenuProps['items'] = [
        { key:'excel', label:'Excel (.xlsx)', icon:<FileExcelOutlined style={{color:'#10b981'}}/>, onClick:handleExportExcel },
        { key:'pdf',   label:'PDF (.pdf)',   icon:<FilePdfOutlined style={{color:'#ef4444'}}/>,   onClick:handleExportPDF },
        { key:'print', label:'Yazdır',       icon:<PrinterOutlined/>,                             onClick:handlePrint },
    ];

    return (
        <AdminGuard>
            <AdminLayout selectedKey="transfers">

                {/* Header */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,flexWrap:'wrap',gap:12}}>
                    <div>
                        <Title level={2} style={{margin:0,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
                            Transfer Rezervasyonları
                        </Title>
                        <Text type="secondary" style={{fontSize:12}}>
                            {filteredBookings.length} rezervasyon
                            {activeFilterCount>0&&<Badge count={activeFilterCount} style={{marginLeft:8,background:'#6366f1'}}/>}
                        </Text>
                    </div>
                    <Space wrap>
                        <Input placeholder="Ara (No, İsim, Tel)" prefix={<SearchOutlined style={{color:'#9ca3af'}}/>}
                            onChange={e=>setSearchText(e.target.value)} style={{width:220,borderRadius:8}} allowClear/>
                        <Button icon={<ReloadOutlined/>} onClick={fetchBookings} style={{borderRadius:8}}>Yenile</Button>

                        {/* Auto-Approve */}
                        <Select
                            value={autoApprove}
                            onChange={(val: 'off'|'operation'|'pool') => {
                                setAutoApprove(val);
                                autoApproveRef.current = val;
                                savePreferences({ autoApprove: val });
                                if (val === 'off') {
                                    message.info('Otomatik onaylama kapatıldı');
                                } else {
                                    message.success(`Otomatik: ${val === 'operation' ? 'Operasyona Aktar' : 'Havuza At'} aktif`);
                                    bulkAutoApprove(val);
                                }
                            }}
                            style={{width:200, borderRadius:8}}
                            suffixIcon={<ThunderboltOutlined style={{color: autoApprove !== 'off' ? '#10b981' : '#9ca3af'}} />}
                            options={[
                                {value:'off', label:'Otomatik Onay: Kapalı'},
                                {value:'operation', label:'⚡ Oto → Operasyona'},
                                {value:'pool', label:'⚡ Oto → Havuza At'},
                            ]}
                        />

                        {/* Column Manager */}
                        <Popover content={colManagerContent} title={<Space><SettingOutlined/>Kolon Ayarları</Space>}
                            trigger="click" placement="bottomRight" open={colManagerOpen} onOpenChange={setColManagerOpen}>
                            <Button icon={<SettingOutlined/>} style={{borderRadius:8}}>Kolonlar</Button>
                        </Popover>

                        {/* Color Settings */}
                        <Button icon={<BgColorsOutlined/>} style={{borderRadius:8}} onClick={openColorModal}>Renkler</Button>

                        {/* Export */}
                        <Dropdown menu={{ items: exportMenuItems }} placement="bottomRight" trigger={['click']}>
                            <Button icon={<DownloadOutlined/>} style={{borderRadius:8}}>Dışa Aktar</Button>
                        </Dropdown>

                        <Button type="primary" icon={<CarOutlined/>} onClick={() => setCreateModalVisible(true)}
                            style={{borderRadius:8,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',border:'none'}}>
                            Yeni Transfer
                        </Button>
                    </Space>
                </div>

                {/* Active Filter Chips */}
                {activeFilterCount>0&&(
                    <div style={{marginBottom:12,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                        <Text type="secondary" style={{fontSize:12}}>Aktif filtreler:</Text>
                        {Object.entries(colFilters).map(([key,f])=>{
                            const has=f.text||(f.values?.length)||(f.statuses?.length)||f.dateRange||f.minPrice!=null||f.maxPrice!=null;
                            if(!has) return null;
                            const label = (f.values?.length) ? `${colTitles[key]||key} (${f.values.length})` : (colTitles[key]||key);
                            return <Tag key={key} closable onClose={()=>handleClearFilter(key)} color="blue" style={{borderRadius:20}}>{label}</Tag>;
                        })}
                        <Button size="small" type="link" onClick={()=>setColFilters({})} style={{color:'#ef4444'}}>Tümünü Temizle</Button>
                    </div>
                )}

                {/* Table */}
                <Card variant="borderless" style={{borderRadius:12,boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}} styles={{body:{padding:0}}}>
                    <Table
                        columns={sortedColumns} dataSource={filteredBookings} rowKey="id"
                        loading={loading} scroll={{x: Math.max(totalWidth, 1000)}}
                        components={tableComponents}
                        tableLayout="fixed"
                        childrenColumnName="nested_children_disabled"
                        pagination={{
                            pageSize: pageSize,
                            showSizeChanger: true,
                            onShowSizeChange: (current, size) => setPageSize(size),
                            showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} kayıt`,
                            pageSizeOptions: ['10', '15', '25', '50', '100']
                        }}
                        rowClassName={rowClassName} size="middle" showSorterTooltip={false}
                    />
                </Card>

                {/* Color Settings Modal */}
                <ColorSettingsModal open={colorModalOpen} colors={draftColors}
                    onChange={handleColorChange} onReset={handleColorReset}
                    onClose={()=>setColorModalOpen(false)} onSave={handleColorSave} />

                {/* Detail Modal */}
                <Modal
                    title={<Space>
                        {selectedBooking&&<Tag style={{background:getStatusConf(selectedBooking).bg,borderColor:getStatusConf(selectedBooking).color,color:getStatusConf(selectedBooking).color,fontWeight:600,borderRadius:20}}>{getStatusConf(selectedBooking).label}</Tag>}
                        <span>Rezervasyon — {selectedBooking?.bookingNumber}</span>
                    </Space>}
                    open={detailModalVisible} onCancel={()=>{setDetailModalVisible(false); setIsEditing(false); editForm.resetFields();}}
                    footer={[
                        !isEditing && <Button key="close" onClick={()=>setDetailModalVisible(false)}>Kapat</Button>,
                        !isEditing && <Button key="edit" icon={<EditOutlined/>} onClick={()=>{
                            setIsEditing(true);
                            if (selectedBooking) {
                                editForm.setFieldsValue({
                                    passengerName: selectedBooking.passengerName,
                                    passengerPhone: selectedBooking.passengerPhone,
                                    pickupDateTime: dayjs(selectedBooking.pickupDateTime),
                                    flightNumber: selectedBooking.flightNumber,
                                    pickup: selectedBooking.metadata?.pickup || selectedBooking.pickup,
                                    dropoff: selectedBooking.metadata?.dropoff || selectedBooking.dropoff,
                                    vehicleType: selectedBooking.metadata?.vehicleType || selectedBooking.vehicleType,
                                    price: selectedBooking.price,
                                    adults: selectedBooking.adults,
                                    children: selectedBooking.children,
                                    infants: selectedBooking.infants,
                                    notes: selectedBooking.notes
                                });
                            }
                        }}>Düzenle</Button>,
                        !isEditing && <Button key="paxEdit" icon={<TeamOutlined/>} onClick={()=>{ if (selectedBooking) { setDetailModalVisible(false); openPaxModal(selectedBooking); } }} style={{background:'#eef2ff',borderColor:'#6366f1',color:'#6366f1',fontWeight:600}}>Yolcu &amp; Fiyat</Button>,
                        !isEditing && <Button key="print" icon={<PrinterOutlined/>} onClick={handlePrint}>Yazdır</Button>,
                        !isEditing && <Button key="pdf" type="primary" icon={<FilePdfOutlined/>} onClick={handleExportPDF} style={{background:'#ef4444',border:'none'}}>PDF</Button>,
                        isEditing && <Button key="cancelEdit" onClick={()=>setIsEditing(false)}>İptal</Button>,
                        isEditing && <Button key="saveEdit" type="primary" onClick={()=>editForm.submit()} style={{background:'#10b981',borderColor:'#10b981'}}>Kaydet</Button>,
                    ].filter(Boolean)}
                    width={720}
                >
                    {selectedBooking&&(
                        <Space orientation="vertical" size="middle" style={{width:'100%'}}>
                            <div style={{padding:'10px 16px',borderRadius:8,background:getStatusConf(selectedBooking).bg,borderLeft:`4px solid ${getStatusConf(selectedBooking).color}`,display:'flex',alignItems:'center',gap:12}}>
                                <Text strong style={{color:getStatusConf(selectedBooking).color,fontSize:15}}>{getStatusConf(selectedBooking).label}</Text>
                                <Text type="secondary" style={{fontSize:12}}>Transfer: {dayjs(selectedBooking.pickupDateTime).format('DD MMMM YYYY HH:mm')}</Text>
                                {getAirportForRow(selectedBooking)&&<Tag style={{fontWeight:700,background:'#eef2ff',borderColor:'#6366f1',color:'#6366f1'}}>✈ {getAirportForRow(selectedBooking)}</Tag>}
                            </div>
                            
                            {!isEditing ? (
                                <>
                                    <Descriptions title="Rezervasyon Bilgileri" bordered column={2} size="small">
                                        <Descriptions.Item label="Rezervasyon No">{selectedBooking.bookingNumber}</Descriptions.Item>
                                        <Descriptions.Item label="Oluşturulma">{dayjs(selectedBooking.createdAt).format('DD.MM.YYYY HH:mm')}</Descriptions.Item>
                                        <Descriptions.Item label="Ödeme">
                                            <Tag color={selectedBooking.paymentStatus==='PAID'?'green':'orange'}>{selectedBooking.paymentStatus==='PAID'?'Ödendi':'Bekliyor'}</Tag>
                                        </Descriptions.Item>
                                        <Descriptions.Item label="Uçuş No">{selectedBooking.flightNumber||'-'}</Descriptions.Item>
                                    </Descriptions>
                                    <Descriptions title="Transfer Detayları" bordered column={1} size="small">
                                        {((selectedBooking as any).agencyName||selectedBooking.metadata?.agencyName)&&(
                                            <Descriptions.Item label="Acente"><Text strong>{(selectedBooking as any).agencyName||selectedBooking.metadata?.agencyName}</Text></Descriptions.Item>
                                        )}
                                        <Descriptions.Item label="Alış Yeri"><EnvironmentItem text={getPickup(selectedBooking)} color="green"/></Descriptions.Item>
                                        <Descriptions.Item label="Bırakış Yeri"><EnvironmentItem text={getDropoff(selectedBooking)} color="red"/></Descriptions.Item>
                                        {getAirportForRow(selectedBooking)&&(
                                            <Descriptions.Item label="Havalimanı Kodu">
                                                <Tag style={{fontWeight:700,fontSize:13,letterSpacing:1,background:'#eef2ff',borderColor:'#6366f1',color:'#6366f1'}}>✈ {getAirportForRow(selectedBooking)}</Tag>
                                            </Descriptions.Item>
                                        )}
                                        <Descriptions.Item label="Tarih & Saat"><CalendarOutlined/> {dayjs(selectedBooking.pickupDateTime).format('DD MMMM YYYY')} — {dayjs(selectedBooking.pickupDateTime).format('HH:mm')}</Descriptions.Item>
                                        <Descriptions.Item label="Araç Tipi"><CarOutlined/> {selectedBooking.vehicleType}</Descriptions.Item>
                                    </Descriptions>
                                    <Descriptions title="Yolcu Bilgileri" bordered column={2} size="small">
                                        <Descriptions.Item label="Ad Soyad"><UserOutlined/> {selectedBooking.passengerName}</Descriptions.Item>
                                        <Descriptions.Item label="Telefon"><PhoneOutlined/> {selectedBooking.passengerPhone}</Descriptions.Item>
                                        <Descriptions.Item label="Yolcu Sayısı" span={2}>
                                            {(()=>{
                                                const a = selectedBooking.adults || 1;
                                                const c = selectedBooking.children || 0;
                                                const inf = selectedBooking.infants || 0;
                                                const total = a + c + inf;
                                                const parts: string[] = [];
                                                if (a > 0) parts.push(`${a} Yetişkin`);
                                                if (c > 0) parts.push(`${c} Çocuk`);
                                                if (inf > 0) parts.push(`${inf} Bebek`);
                                                return <span><strong>{total} kişi</strong> <span style={{color:'#64748b'}}>({parts.join(', ')})</span></span>;
                                            })()}
                                        </Descriptions.Item>
                                        <Descriptions.Item label="Notlar" span={2}>{selectedBooking.notes||'-'}</Descriptions.Item>
                                    </Descriptions>
                                    {(() => {
                                        const md = selectedBooking.metadata || {};
                                        const list = md.passengerDetails || md.passengers || md.passengersList || [];
                                        if (!Array.isArray(list) || list.length === 0) return null;
                                        return (
                                            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, background: '#fafafa' }}>
                                                <Text strong style={{ display: 'block', marginBottom: 8 }}>Diğer Yolcular:</Text>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                    {list.map((p: any, i: number) => {
                                                        const name = p.name || p.fullName || [p.firstName, p.lastName].filter(Boolean).join(' ') || '—';
                                                        const nationality = p.nationality || p.country || p.uyruk || null;
                                                        return (
                                                            <div key={i} style={{ display: 'flex', gap: 12, padding: '6px 10px', background: '#fff', border: '1px solid #f0f0f0', borderRadius: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                                                <Tag color="blue" style={{ margin: 0, fontWeight: 700 }}>{i + 1}</Tag>
                                                                <span style={{ fontWeight: 600 }}>{name}</span>
                                                                {p.phone && <span style={{ color: '#64748b', fontSize: 12 }}>📞 {p.phone}</span>}
                                                                {p.email && <span style={{ color: '#64748b', fontSize: 12 }}>✉️ {p.email}</span>}
                                                                {nationality && <Tag color="geekblue" style={{ margin: 0 }}>🌍 {nationality}</Tag>}
                                                                {p.tcNo && <span style={{ color: '#64748b', fontSize: 12 }}>🆔 {p.tcNo}</span>}
                                                                {p.passportNo && <span style={{ color: '#64748b', fontSize: 12 }}>🛂 {p.passportNo}</span>}
                                                                {p.age && <span style={{ color: '#64748b', fontSize: 12 }}>({p.age})</span>}
                                                                {p.type && <Tag style={{ margin: 0 }}>{p.type}</Tag>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    <div style={{textAlign:'right'}}>
                                        <Text type="secondary">Toplam Tutar</Text>
                                        <Title level={3} style={{margin:0,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>₺{selectedBooking.price?.toLocaleString('tr-TR')}</Title>
                                    </div>
                                    {selectedBooking.status==='PENDING'&&(
                                        <div style={{borderTop:'1px solid #f0f0f0',paddingTop:16,display:'flex',justifyContent:'flex-end',gap:8}}>
                                            <Button danger onClick={()=>handleUpdateStatus(selectedBooking.id,'CANCELLED')}>İptal Et</Button>
                                            <Button type="primary" icon={<TeamOutlined/>} style={{background:'#06b6d4',border:'none'}} onClick={()=>{
                                                setDetailModalVisible(false);
                                                setActivePoolBooking(selectedBooking);
                                                setPoolPriceInput(selectedBooking.price || 0);
                                                setPoolModalOpen(true);
                                            }}>Havuza Aktar</Button>
                                            <Button type="primary" icon={<SafetyCertificateOutlined/>} style={{background:'#10b981',border:'none'}} onClick={()=>handleUpdateStatus(selectedBooking.id,'CONFIRMED','IN_OPERATION')}>Operasyona Aktar</Button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <Form form={editForm} layout="vertical" onFinish={async (values) => {
                                    try {
                                        const res = await apiClient.put(`/api/transfer/bookings/admin/${selectedBooking.id}`, {
                                            ...values, 
                                            pickupDateTime: values.pickupDateTime ? values.pickupDateTime.toISOString() : undefined
                                        });
                                        if (res.data.success) {
                                            message.success('Rezervasyon güncellendi');
                                            setIsEditing(false);
                                            fetchBookings();
                                            setDetailModalVisible(false);
                                        }
                                    } catch { message.error('Güncelleme başarısız'); }
                                }}>
                                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                                        <Form.Item name="passengerName" label="Ad Soyad" rules={[{required:true, message:'Zorunlu'}]}><Input/></Form.Item>
                                        <Form.Item name="passengerPhone" label="Telefon"><Input/></Form.Item>
                                        <Form.Item name="pickup" label="Alış Yeri" rules={[{required:true, message:'Zorunlu'}]}><DynamicLocationSearchInput placeholder="Havaalanı, Otel, Adres..." country="TUR" /></Form.Item>
                                        <Form.Item name="dropoff" label="Bırakış Yeri" rules={[{required:true, message:'Zorunlu'}]}><DynamicLocationSearchInput placeholder="Havaalanı, Otel, Adres..." country="TUR" /></Form.Item>
                                        <Form.Item name="pickupDateTime" label="Tarih & Saat" rules={[{required:true, message:'Zorunlu'}]}><DatePicker showTime format="DD.MM.YYYY HH:mm" style={{width:'100%'}}/></Form.Item>
                                        <Form.Item name="flightNumber" label="Uçuş Kodu"><Input/></Form.Item>
                                        <Form.Item name="vehicleType" label="Araç Tipi" rules={[{required:true, message:'Zorunlu'}]}>
                                            <Select>
                                                <Select.Option value="Standart">Standart</Select.Option>
                                                <Select.Option value="VIP Minibüs">VIP Minibüs</Select.Option>
                                                <Select.Option value="Vito">Vito</Select.Option>
                                                <Select.Option value="Sprinter">Sprinter</Select.Option>
                                                <Select.Option value="Sedan">Sedan</Select.Option>
                                                <Select.Option value="SUV">SUV</Select.Option>
                                            </Select>
                                        </Form.Item>
                                        <div style={{display:'flex', gap:8}}>
                                            <Form.Item name="adults" label="Yetişkin" style={{flex:1, marginBottom:0}}><InputNumber min={1} style={{width:'100%'}}/></Form.Item>
                                            <Form.Item name="children" label="Çocuk" style={{flex:1, marginBottom:0}}><InputNumber min={0} defaultValue={0} style={{width:'100%'}}/></Form.Item>
                                            <Form.Item name="infants" label="Bebek" style={{flex:1, marginBottom:0}}><InputNumber min={0} defaultValue={0} style={{width:'100%'}}/></Form.Item>
                                        </div>
                                        <Form.Item name="price" label="Müşteri Fiyatı (₺)" rules={[{required:true, message:'Zorunlu'}]}><InputNumber min={0} style={{width:'100%'}}/></Form.Item>
                                        <Form.Item name="notes" label="Notlar (Özel İstekler)"><Input.TextArea rows={2}/></Form.Item>
                                    </div>
                                </Form>
                            )}
                        </Space>
                    )}
                </Modal>

                {/* Cancel Modal */}
                <Modal
                    title={<Space><CloseCircleOutlined style={{color:'#ef4444'}}/>Rezervasyon İptal</Space>}
                    open={cancelModalOpen}
                    onCancel={() => setCancelModalOpen(false)}
                    onOk={handleConfirmCancel}
                    okText="İptal Et" cancelText="Vazgeç"
                    okButtonProps={{ danger: true, loading: cancelSaving, disabled: !cancelReason }}
                    width={420}
                >
                    <div style={{display:'flex',flexDirection:'column',gap:16,marginTop:12}}>
                        <div>
                            <Text strong style={{display:'block',marginBottom:6}}>İptal Sebebi <span style={{color:'#ef4444'}}>*</span></Text>
                            <Select
                                style={{width:'100%'}}
                                placeholder="Sebep seçin..."
                                value={cancelReason}
                                onChange={(v) => setCancelReason(v)}
                                options={[
                                    {value:'customer_request', label:'Müşteri İsteği'},
                                    {value:'wrong_booking',    label:'Yanlış Rezervasyon'},
                                    {value:'no_operation',     label:'Operasyon Yapılamıyor'},
                                    {value:'other',            label:'Diğer'},
                                ]}
                            />
                        </div>
                        <div>
                            <Text strong style={{display:'block',marginBottom:6}}>Açıklama</Text>
                            <Input.TextArea
                                rows={3} placeholder="İptal detayı (opsiyonel)..."
                                value={cancelNote}
                                onChange={e => setCancelNote(e.target.value)}
                                style={{borderRadius:8}}
                            />
                        </div>
                    </div>
                </Modal>

                {/* Pool Modal */}
                <Modal
                    title={<Space><TeamOutlined style={{color:'#6366f1'}}/>Havuza Aktar</Space>}
                    open={poolModalOpen}
                    onCancel={() => setPoolModalOpen(false)}
                    onOk={handleConfirmPool}
                    okText="Onayla ve Havuza At" cancelText="İptal"
                    okButtonProps={{ style: { background: '#6366f1' } }}
                >
                    <div style={{ marginBottom: 16 }}>
                        <Text type="secondary">Rezervasyon No: </Text><Text strong>{activePoolBooking?.bookingNumber}</Text>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                        <Text type="secondary">Müşteri Fiyatı: </Text><Text strong>{activePoolBooking?.price?.toLocaleString('tr-TR')} {activePoolBooking?.currency||'TRY'}</Text>
                    </div>
                    <div>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>Veya Özel Havuz Fiyatı Belirle ({activePoolBooking?.currency||'TRY'}):</Text>
                        <InputNumber 
                            style={{ width: '100%', borderRadius: 8 }} size="large"
                            value={poolPriceInput} onChange={(v) => setPoolPriceInput(v)} min={0}
                        />
                        <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block', lineHeight: 1.5 }}>
                            * Partnerler/Acenteler bu rezervasyonu <b>{poolPriceInput?.toLocaleString('tr-TR')} {activePoolBooking?.currency||'TRY'}</b> üzerinden görecek ve kabul edeceklerdir.<br/>
                            * Sizin alacağınız orijinal müşteri fiyatı olan ({activePoolBooking?.price?.toLocaleString('tr-TR')} {activePoolBooking?.currency||'TRY'}) sizin hesaplarınızda ve panelinizde görünmeye devam edecektir.
                        </Text>
                    </div>
                </Modal>

                {/* ── Passenger Edit Modal ── */}
                <Modal
                    title={null}
                    closable={false}
                    open={paxModalOpen}
                    onCancel={() => setPaxModalOpen(false)}
                    width={760}
                    centered
                    footer={null}
                    styles={{ body: { padding: 0, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' } }}
                >
                    {paxModalBooking && (
                        <div>
                            {/* ─── HEADER ─── */}
                            <div style={{
                                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
                                padding: '16px 22px',
                                position: 'relative',
                                overflow: 'hidden',
                            }}>
                                <div style={{
                                    position: 'absolute', top: -30, right: -30,
                                    width: 140, height: 140, borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.08)',
                                }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: 8,
                                            background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <TeamOutlined style={{ fontSize: 16, color: '#fff' }} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                                                Yolcu &amp; Fiyat Düzenle
                                            </div>
                                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                                                {paxModalBooking.bookingNumber}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setPaxModalOpen(false)}
                                        style={{
                                            background: 'rgba(255,255,255,0.15)', border: 'none',
                                            width: 28, height: 28, borderRadius: 6, color: '#fff',
                                            fontSize: 14, cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}
                                    >×</button>
                                </div>
                            </div>

                            <div style={{ padding: '16px 22px 14px', background: '#fafbfc' }}>
                                {/* ─── Reservation Summary ─── */}
                                <div style={{
                                    background: '#fff', borderRadius: 12, padding: '12px 16px',
                                    border: '1px solid #e8ecf1', marginBottom: 12,
                                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                }}>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Müşteri</div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            <UserOutlined style={{ color: '#6366f1', marginRight: 4 }} />{paxModalBooking.passengerName}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Araç</div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            <CarOutlined style={{ color: '#6366f1', marginRight: 4 }} />{paxModalBooking.metadata?.vehicleType || paxModalBooking.vehicleType || '—'}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Mevcut Fiyat</div>
                                        <div style={{ fontSize: 16, fontWeight: 800, color: '#6366f1', marginTop: 2, fontFamily: 'monospace' }}>
                                            ₺{paxOriginalPrice.toLocaleString('tr-TR')}
                                        </div>
                                    </div>
                                </div>

                                {/* ─── Pricing Type Badge ─── */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    background: paxIsPerPerson ? '#eff6ff' : '#f5f3ff',
                                    border: `1px solid ${paxIsPerPerson ? '#bfdbfe' : '#ddd6fe'}`,
                                    borderRadius: 10, padding: '8px 12px', marginBottom: 12, fontSize: 12,
                                }}>
                                    <span style={{ fontSize: 16 }}>{paxIsPerPerson ? '👥' : '🚗'}</span>
                                    <div style={{ flex: 1 }}>
                                        <span style={{ fontWeight: 700, color: paxIsPerPerson ? '#1d4ed8' : '#6d28d9' }}>
                                            {paxIsPerPerson ? 'Kişi Başı Fiyatlı' : 'Sabit Araç Fiyatlı'}
                                        </span>
                                        <span style={{ color: '#64748b', marginLeft: 6 }}>
                                            {paxIsPerPerson
                                                ? `Birim: ₺${paxPerSeatPrice.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} / kişi  ·  Mevcut: ${paxOriginalPax} kişi`
                                                : 'Yolcu sayısı değişse bile araç fiyatı sabit kalır'}
                                        </span>
                                    </div>
                                </div>

                                {/* ─── Pax Counters (compact 3-col) ─── */}
                                <div style={{
                                    background: '#fff', borderRadius: 12, padding: '12px 14px',
                                    border: '1px solid #e8ecf1', marginBottom: 12,
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            Kişi Sayısı
                                        </span>
                                        <Tag color="purple" style={{ borderRadius: 999, margin: 0, fontWeight: 700 }}>
                                            Toplam: {paxNewTotalPax} kişi
                                        </Tag>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                                        {([
                                            { key: 'adults' as const, label: 'Yetişkin', sub: '13+ yaş', val: paxAdults, min: 1, color: '#6366f1', bg: '#eef2ff' },
                                            { key: 'children' as const, label: 'Çocuk', sub: '3-12 yaş', val: paxChildren, min: 0, color: '#f59e0b', bg: '#fef3c7' },
                                            { key: 'infants' as const, label: 'Bebek', sub: '0-2 yaş', val: paxInfants, min: 0, color: '#ec4899', bg: '#fce7f3' },
                                        ] as const).map(item => (
                                            <div key={item.key} style={{
                                                background: item.bg, borderRadius: 10, padding: '8px 10px',
                                                border: `1px solid ${item.color}22`,
                                            }}>
                                                <div style={{ fontSize: 11, fontWeight: 700, color: item.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                    {item.label}
                                                </div>
                                                <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 6 }}>{item.sub}</div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                                    <button
                                                        onClick={() => handlePaxCountChange(item.key, -1)}
                                                        disabled={item.val <= item.min}
                                                        style={{
                                                            width: 26, height: 26, borderRadius: 6,
                                                            background: '#fff', border: `1px solid ${item.color}66`,
                                                            color: item.color, cursor: item.val <= item.min ? 'not-allowed' : 'pointer',
                                                            opacity: item.val <= item.min ? 0.4 : 1,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                                                        }}
                                                    ><MinusOutlined style={{ fontSize: 11 }} /></button>
                                                    <span style={{ fontSize: 18, fontWeight: 800, color: item.color, minWidth: 22, textAlign: 'center' }}>{item.val}</span>
                                                    <button
                                                        onClick={() => handlePaxCountChange(item.key, 1)}
                                                        style={{
                                                            width: 26, height: 26, borderRadius: 6,
                                                            background: '#fff', border: `1px solid ${item.color}66`,
                                                            color: item.color, cursor: 'pointer',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                                                        }}
                                                    ><PlusOutlined style={{ fontSize: 11 }} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* ─── Pax Detail List ─── */}
                                {paxList.length > 0 && (
                                    <div style={{
                                        background: '#fff', borderRadius: 12, padding: '12px 14px',
                                        border: '1px solid #e8ecf1', marginBottom: 12,
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                    }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                                            Yolcu Bilgileri (Opsiyonel)
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {paxList.map((p, idx) => {
                                                const typeLabel = p.type === 'child' ? 'Çocuk' : p.type === 'infant' ? 'Bebek' : 'Yetişkin';
                                                const typeColor = p.type === 'child' ? '#f59e0b' : p.type === 'infant' ? '#ec4899' : '#6366f1';
                                                return (
                                                    <div key={idx} style={{
                                                        display: 'flex', gap: 6, alignItems: 'center',
                                                        background: '#f9fafb', borderRadius: 8, padding: '6px 8px',
                                                        border: '1px solid #f0f0f0',
                                                    }}>
                                                        <Tag color={typeColor} style={{ borderRadius: 10, fontSize: 10, minWidth: 64, textAlign: 'center', margin: 0, fontWeight: 700 }}>
                                                            {idx + 1}. {typeLabel}
                                                        </Tag>
                                                        <Input size="small" placeholder="Ad" value={p.firstName}
                                                            onChange={e => handlePaxFieldChange(idx, 'firstName', e.target.value)}
                                                            style={{ flex: 1 }} />
                                                        <Input size="small" placeholder="Soyad" value={p.lastName}
                                                            onChange={e => handlePaxFieldChange(idx, 'lastName', e.target.value)}
                                                            style={{ flex: 1 }} />
                                                        <Select size="small" placeholder="Uyruk" value={p.nationality || undefined}
                                                            onChange={v => handlePaxFieldChange(idx, 'nationality', v)}
                                                            style={{ width: 90 }} showSearch optionFilterProp="label"
                                                            options={[
                                                                { value: 'TR', label: '🇹🇷 TR' }, { value: 'DE', label: '🇩🇪 DE' },
                                                                { value: 'GB', label: '🇬🇧 GB' }, { value: 'US', label: '🇺🇸 US' },
                                                                { value: 'FR', label: '🇫🇷 FR' }, { value: 'NL', label: '🇳🇱 NL' },
                                                                { value: 'RU', label: '🇷🇺 RU' }, { value: 'UA', label: '🇺🇦 UA' },
                                                                { value: 'SA', label: '🇸🇦 SA' }, { value: 'AE', label: '🇦🇪 AE' },
                                                                { value: 'IR', label: '🇮🇷 IR' }, { value: 'IQ', label: '🇮🇶 IQ' },
                                                                { value: 'AZ', label: '🇦🇿 AZ' }, { value: 'KZ', label: '🇰🇿 KZ' },
                                                                { value: 'OTHER', label: 'Diğer' },
                                                            ]}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* ─── Pricing Mode Selector + Breakdown ─── */}
                                <div style={{
                                    background: '#fff', borderRadius: 12, padding: '14px 16px',
                                    border: `2px solid ${paxPriceDiff > 0 ? '#fca5a5' : paxPriceDiff < 0 ? '#86efac' : '#e8ecf1'}`,
                                    marginBottom: 4,
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            <DollarOutlined style={{ color: '#6366f1', marginRight: 6 }} />Fiyat Hesaplama
                                        </span>
                                    </div>

                                    {/* Mode buttons */}
                                    <div style={{ display: 'grid', gridTemplateColumns: paxIsPerPerson ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 6, marginBottom: 12 }}>
                                        {paxIsPerPerson && (
                                            <button
                                                onClick={() => setPaxPricingMode('auto')}
                                                style={{
                                                    padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                                    cursor: 'pointer', transition: 'all 0.2s',
                                                    border: paxPricingMode === 'auto' ? '2px solid #6366f1' : '1px solid #e5e7eb',
                                                    background: paxPricingMode === 'auto' ? '#eef2ff' : '#fff',
                                                    color: paxPricingMode === 'auto' ? '#4f46e5' : '#64748b',
                                                }}
                                            >
                                                ⚡ Otomatik
                                                <div style={{ fontSize: 9, fontWeight: 500, marginTop: 2, opacity: 0.8 }}>Kişi başına yansıt</div>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setPaxPricingMode('keep')}
                                            style={{
                                                padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                                cursor: 'pointer', transition: 'all 0.2s',
                                                border: paxPricingMode === 'keep' ? '2px solid #6366f1' : '1px solid #e5e7eb',
                                                background: paxPricingMode === 'keep' ? '#eef2ff' : '#fff',
                                                color: paxPricingMode === 'keep' ? '#4f46e5' : '#64748b',
                                            }}
                                        >
                                            🔒 Sabit Tut
                                            <div style={{ fontSize: 9, fontWeight: 500, marginTop: 2, opacity: 0.8 }}>Fiyatı değiştirme</div>
                                        </button>
                                        <button
                                            onClick={() => setPaxPricingMode('manual')}
                                            style={{
                                                padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                                cursor: 'pointer', transition: 'all 0.2s',
                                                border: paxPricingMode === 'manual' ? '2px solid #6366f1' : '1px solid #e5e7eb',
                                                background: paxPricingMode === 'manual' ? '#eef2ff' : '#fff',
                                                color: paxPricingMode === 'manual' ? '#4f46e5' : '#64748b',
                                            }}
                                        >
                                            ✏️ Elle Gir
                                            <div style={{ fontSize: 9, fontWeight: 500, marginTop: 2, opacity: 0.8 }}>Yeni toplam</div>
                                        </button>
                                    </div>

                                    {/* Manual price input */}
                                    {paxPricingMode === 'manual' && (
                                        <div style={{ marginBottom: 10 }}>
                                            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                                                Yeni Toplam Fiyat (₺)
                                            </Text>
                                            <InputNumber
                                                value={paxManualPrice}
                                                onChange={v => setPaxManualPrice(Number(v) || 0)}
                                                style={{ width: '100%' }}
                                                min={0}
                                                formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                                                parser={v => Number(v?.replace(/\./g, '') || 0)}
                                                addonAfter="₺"
                                            />
                                        </div>
                                    )}

                                    {/* Price breakdown */}
                                    <div style={{
                                        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
                                        gap: 12, alignItems: 'center',
                                        background: '#f9fafb', borderRadius: 10, padding: '10px 14px',
                                    }}>
                                        <div>
                                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Eski Fiyat</div>
                                            <div style={{ fontSize: 16, fontWeight: 700, color: '#64748b', fontFamily: 'monospace' }}>
                                                ₺{paxOriginalPrice.toLocaleString('tr-TR')}
                                            </div>
                                        </div>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: '50%',
                                            background: paxPriceDiff > 0 ? '#fee2e2' : paxPriceDiff < 0 ? '#dcfce7' : '#f1f5f9',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: paxPriceDiff > 0 ? '#dc2626' : paxPriceDiff < 0 ? '#16a34a' : '#94a3b8',
                                            fontSize: 14, fontWeight: 800,
                                        }}>
                                            {paxPriceDiff > 0 ? '↑' : paxPriceDiff < 0 ? '↓' : '='}
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Yeni Fiyat</div>
                                            <div style={{
                                                fontSize: 18, fontWeight: 800, fontFamily: 'monospace',
                                                color: paxPriceDiff > 0 ? '#dc2626' : paxPriceDiff < 0 ? '#16a34a' : '#1e293b',
                                            }}>
                                                ₺{paxComputedNewPrice.toLocaleString('tr-TR')}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Diff strip + payment method */}
                                    {paxPriceDiff !== 0 && (
                                        <>
                                            <div style={{
                                                marginTop: 10, padding: '8px 12px', borderRadius: 8,
                                                background: paxPriceDiff > 0 ? '#fef2f2' : '#f0fdf4',
                                                border: `1px solid ${paxPriceDiff > 0 ? '#fecaca' : '#bbf7d0'}`,
                                                fontSize: 12, fontWeight: 700,
                                                color: paxPriceDiff > 0 ? '#dc2626' : '#16a34a',
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            }}>
                                                <span>
                                                    {paxPriceDiff > 0 ? '+' : ''}{paxPriceDiff.toLocaleString('tr-TR')} ₺ {paxPriceDiff > 0 ? 'Ekstra Ücret' : 'İndirim'}
                                                </span>
                                                {paxIsPerPerson && paxPricingMode === 'auto' && (
                                                    <span style={{ fontSize: 10, fontWeight: 500, color: '#64748b' }}>
                                                        ({paxNewTotalPax - paxOriginalPax > 0 ? '+' : ''}{paxNewTotalPax - paxOriginalPax} kişi × ₺{paxPerSeatPrice.toLocaleString('tr-TR', { maximumFractionDigits: 2 })})
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ marginTop: 10 }}>
                                                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                                                    Tahsilat Yöntemi
                                                </Text>
                                                <Radio.Group
                                                    value={paxPaymentMethod}
                                                    onChange={e => setPaxPaymentMethod(e.target.value)}
                                                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '100%' }}
                                                >
                                                    <Radio.Button value="ADD_TO_BALANCE" style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>
                                                        💳 Fiyata Yansıt
                                                    </Radio.Button>
                                                    <Radio.Button value="PAY_IN_VEHICLE" style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>
                                                        🚗 Araçta Ödeme
                                                    </Radio.Button>
                                                </Radio.Group>
                                                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                                                    {paxPaymentMethod === 'ADD_TO_BALANCE'
                                                        ? 'Yeni fiyat rezervasyonun toplam tutarı olarak kaydedilecek.'
                                                        : 'Rezervasyon toplamı değişmeyecek; fark şoför tarafından araçta tahsil edilecek.'}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* ─── Footer Actions ─── */}
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '12px 22px', background: '#fff',
                                borderTop: '1px solid #f0f0f0',
                            }}>
                                <button
                                    onClick={() => setPaxModalOpen(false)}
                                    style={{
                                        height: 40, padding: '0 18px', borderRadius: 10,
                                        border: '1.5px solid #e2e8f0', background: '#fff',
                                        color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                    }}
                                >
                                    Vazgeç
                                </button>
                                <button
                                    onClick={savePaxChanges}
                                    disabled={paxSaving}
                                    style={{
                                        height: 44, padding: '0 24px', borderRadius: 10, border: 'none',
                                        background: paxPriceDiff !== 0
                                            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                            : 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)',
                                        color: '#fff', fontSize: 14, fontWeight: 700,
                                        cursor: paxSaving ? 'wait' : 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
                                        opacity: paxSaving ? 0.7 : 1,
                                    }}
                                >
                                    {paxSaving ? <Spin size="small" /> : <CheckCircleOutlined />}
                                    {paxPriceDiff !== 0
                                        ? `Kaydet  ·  ₺${paxComputedNewPrice.toLocaleString('tr-TR')}`
                                        : 'Kaydet'}
                                </button>
                            </div>
                        </div>
                    )}
                </Modal>

                {/* New Call-Center 2-Step Booking Wizard */}
                <CallCenterBookingWizard
                    open={createModalVisible}
                    onClose={() => setCreateModalVisible(false)}
                    onSuccess={() => fetchBookings()}
                />

                 {/* Dynamic + Print Styles */}
                <style>{`
                    ${dynamicStyles}

                    /* ── Resizable column handle ── */
                    .react-resizable { position: relative; background-clip: padding-box; }
                    .react-resizable-handle {
                        position: absolute;
                        right: -6px;
                        bottom: 0;
                        top: 0;
                        width: 14px;
                        cursor: col-resize;
                        z-index: 10;
                        touch-action: none;
                    }
                    .react-resizable-handle::after {
                        content: '';
                        position: absolute;
                        right: 5px;
                        top: 25%;
                        bottom: 25%;
                        width: 3px;
                        background: #cbd5e1;
                        border-radius: 2px;
                        transition: background 0.2s, width 0.2s;
                    }
                    .react-resizable-handle:hover::after { background: #6366f1; width: 4px; }
                    .react-resizable-handle:active::after { background: #4338ca; width: 4px; }

                    @media print {
                        .ant-layout-sider, .ant-layout-header, header, nav, aside,
                        [class*="ant-btn"], [class*="ant-input"], [class*="ant-popover"] { display:none!important; }
                        .ant-table { font-size:11px!important; }
                        body { background:white!important; }
                    }
                `}</style>

            </AdminLayout>
        </AdminGuard>
    );
};

export default TransfersPage;
