'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Table, Tag, Space, Button, Input, Typography, Card, Tooltip, Modal,
    Descriptions, message, Dropdown, MenuProps, Checkbox, Popover,
    DatePicker, InputNumber, Divider, Switch, Badge, Form, Select
} from 'antd';
import {
    SearchOutlined, EyeOutlined, CheckCircleOutlined, CloseCircleOutlined,
    CarOutlined, CalendarOutlined, UserOutlined, PhoneOutlined, ReloadOutlined,
    SafetyCertificateOutlined, TeamOutlined, DownloadOutlined, PrinterOutlined,
    FilterOutlined, SettingOutlined, FileExcelOutlined, FilePdfOutlined,
    FilterFilled, ClearOutlined, BgColorsOutlined, ReloadOutlined as ResetOutlined,
    EditOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import apiClient from '@/lib/api-client';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Resizable } from 'react-resizable';
import HereLocationSearchInput from '@/app/components/HereLocationSearchInput';

dayjs.locale('tr');
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// ─── Resizable Column Header ─────────────────────────────────────────────────
const ResizableTitle = (props: any) => {
    const { onResize, width, ...restProps } = props;
    if (!width) return <th {...restProps} />;
    return (
        <Resizable
            width={width}
            height={0}
            handle={
                <span
                    className="react-resizable-handle"
                    onClick={e => e.stopPropagation()}
                />
            }
            onResize={onResize}
            draggableOpts={{ enableUserSelectHack: false }}
        >
            <th {...restProps} style={{ ...restProps.style, position: 'relative' }} />
        </Resizable>
    );
};

const DEFAULT_COL_WIDTHS: Record<string, number> = {
    bookingNumber: 110, pickupDateTime: 110, createdAt: 110,
    agency: 100, passengerName: 130, pickupLoc: 200, dropoffLoc: 200,
    airportCode: 100, vehicleType: 130, price: 90, status: 120,
    paymentStatus: 100, flightNumber: 90, adults: 90, action: 120,
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
    operationalStatus?: string;
    metadata?: any;
    adults?: number;
    agencyName?: string;
    agency?: { name: string };
    partnerName?: string;
}

interface ColFilter {
    text?: string;
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
    const lower = location.toLowerCase();
    // Must contain "havalimanı" or "airport" or "havaalanı"
    const isAirport = lower.includes('havalimanı') || lower.includes('havaalanı') || lower.includes('airport');
    if (!isAirport) return null;
    for (const [keyword, code] of Object.entries(AIRPORT_MAP)) {
        if (lower.includes(keyword)) return code;
    }
    return '✈';
}

// ─── Column Definitions ──────────────────────────────────────────────────────
const ALL_COL_KEYS = [
    'bookingNumber', 'pickupDateTime', 'createdAt', 'agency',
    'passengerName', 'pickupLoc', 'dropoffLoc', 'airportCode',
    'vehicleType', 'price', 'status', 'paymentStatus',
    'flightNumber', 'adults', 'action'
];
const DEFAULT_VISIBLE_COLS = [
    'bookingNumber', 'pickupDateTime', 'createdAt', 'agency',
    'passengerName', 'pickupLoc', 'dropoffLoc', 'airportCode',
    'vehicleType', 'price', 'status', 'action'
];
const DEFAULT_COL_TITLES: Record<string, string> = {
    bookingNumber:  'No',
    pickupDateTime: 'Transfer Zamanı',
    createdAt:      'Kayıt Tarihi',
    agency:         'Acente',
    passengerName:  'Yolcu',
    pickupLoc:      'Alış Yeri',
    dropoffLoc:     'Bırakış Yeri',
    airportCode:    'İste Kodu',
    vehicleType:    'Araç',
    price:          'Tutar',
    status:         'Durum',
    paymentStatus:  'Ödeme',
    flightNumber:   'Uçuş No',
    adults:         'Yolcu Sayısı',
    action:         'İşlem',
};

// ─── Editable Header ─────────────────────────────────────────────────────────
interface EditableHeaderProps {
    colKey: string; title: string; filter: ColFilter;
    onTitleChange: (k: string, v: string) => void;
    onFilter: (k: string, f: ColFilter) => void;
    onClearFilter: (k: string) => void;
}
const FILTERABLE = ['bookingNumber','passengerName','agency','status','pickupDateTime','createdAt','price','pickupLoc','dropoffLoc','airportCode', 'vehicleType', 'paymentStatus', 'flightNumber', 'adults'];

const FilterPopover: React.FC<{ colKey: string; filter: ColFilter; onFilter: (k:string,f:ColFilter)=>void; onClear:(k:string)=>void }> = ({ colKey, filter, onFilter, onClear }) => {
    const [local, setLocal] = useState<ColFilter>({ ...filter });
    const isActive = !!(filter.text || (filter.statuses?.length) || filter.dateRange || filter.minPrice != null || filter.maxPrice != null);
    const statusOptions = Object.entries(DEFAULT_STATUS_COLORS);

    const content = (
        <div style={{ width: 250, padding: 4 }}>
            {['bookingNumber','passengerName','agency','pickupLoc','dropoffLoc','airportCode','vehicleType','paymentStatus','flightNumber','adults'].includes(colKey) && (
                <div style={{ marginBottom: 10 }}>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Metin Ara</Text>
                    <Input size="small" prefix={<SearchOutlined />} placeholder="Filtrele..." value={local.text||''} onChange={e=>setLocal(p=>({...p,text:e.target.value}))} allowClear />
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
        <Popover content={content} title={null} trigger="click" placement="bottomRight" destroyTooltipOnHide>
            <Button type="text" size="small" style={{ padding:'0 2px', color: isActive ? '#6366f1' : '#ccc', marginLeft:2 }}
                icon={isActive ? <FilterFilled style={{fontSize:11}} /> : <FilterOutlined style={{fontSize:11}} />} />
        </Popover>
    );
};

const EditableHeader: React.FC<EditableHeaderProps> = ({ colKey, title, filter, onTitleChange, onFilter, onClearFilter }) => {
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
            {FILTERABLE.includes(colKey) && <FilterPopover colKey={colKey} filter={filter} onFilter={onFilter} onClear={onClearFilter} />}
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
    const [colManagerOpen, setColManagerOpen] = useState(false);
    const [colFilters, setColFilters] = useState<ColFilters>({});

    // Color settings
    const [statusColors, setStatusColors] = useState<Record<string,StatusConf>>(DEFAULT_STATUS_COLORS);
    const [colorModalOpen, setColorModalOpen] = useState(false);
    const [draftColors, setDraftColors] = useState<Record<string,StatusConf>>(DEFAULT_STATUS_COLORS);

    // Column widths (resizable)
    const [colWidths, setColWidths] = useState<Record<string, number>>(DEFAULT_COL_WIDTHS);
    const handleResize = useCallback((key: string) => (_: any, { size }: { size: { width: number } }) => {
        setColWidths(prev => ({ ...prev, [key]: Math.max(50, size.width) }));
    }, []);

    // Table components — enables resizable headers
    const tableComponents = {
        header: { cell: ResizableTitle },
    };

    const savePreferences = (updates: any) => {
        apiClient.get('/api/auth/metadata').then(res => {
            const currentMeta = res.data?.data || {};
            const currentPrefs = currentMeta.transfer_preferences || {};
            const newPrefs = { ...currentPrefs, ...updates };
            apiClient.put('/api/auth/metadata', { preferences: { transfer_preferences: newPrefs } });
        }).catch(()=>{});
    };

    useEffect(() => {
        apiClient.get('/api/auth/metadata').then(res => {
            if (res.data?.success && res.data?.data?.transfer_preferences) {
                const prefs = res.data.data.transfer_preferences;
                if (prefs.colTitles) setColTitles(prefs.colTitles);
                if (prefs.visibleCols) setVisibleCols(prefs.visibleCols);
                if (prefs.statusColors) setStatusColors(prefs.statusColors);
            } else {
                setStatusColors(loadColors());
            }
        }).catch(() => {
            setStatusColors(loadColors());
        });
        fetchBookings();
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

    // Filtered data
    const filteredBookings = bookings.filter(b => {
        if (searchText) {
            const s = searchText.toLowerCase();
            if (!b.bookingNumber.toLowerCase().includes(s) && !b.passengerName.toLowerCase().includes(s) && !(b.passengerPhone||'').includes(s)) return false;
        }
        for (const [key, f] of Object.entries(colFilters)) {
            if (key==='bookingNumber' && f.text && !b.bookingNumber.toLowerCase().includes(f.text.toLowerCase())) return false;
            if (key==='passengerName' && f.text && !b.passengerName.toLowerCase().includes(f.text.toLowerCase())) return false;
            if (key==='agency') {
                const n = b.agencyName||b.agency?.name||b.partnerName||b.metadata?.agencyName||'Direkt';
                if (f.text && !n.toLowerCase().includes(f.text.toLowerCase())) return false;
            }
            if (key==='pickupLoc' && f.text && !getPickup(b).toLowerCase().includes(f.text.toLowerCase())) return false;
            if (key==='dropoffLoc' && f.text && !getDropoff(b).toLowerCase().includes(f.text.toLowerCase())) return false;
            if (key==='airportCode' && f.text) {
                const code = getAirportForRow(b)||'';
                if (!code.toLowerCase().includes(f.text.toLowerCase())) return false;
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
            if (key==='vehicleType' && f.text) {
                const vt = b.metadata?.vehicleType||b.vehicleType||'';
                if (!vt.toLowerCase().includes(f.text.toLowerCase())) return false;
            }
            if (key==='paymentStatus' && f.text && !(b.paymentStatus||'').toLowerCase().includes(f.text.toLowerCase())) return false;
            if (key==='flightNumber' && f.text && !(b.flightNumber||'').toLowerCase().includes(f.text.toLowerCase())) return false;
            if (key==='adults' && f.text && !(b.adults?.toString()||'').toLowerCase().includes(f.text.toLowerCase())) return false;
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
            onTitleChange={handleTitleChange} onFilter={handleApplyFilter} onClearFilter={handleClearFilter} />,
        onHeaderCell: (col: any) => ({
            width: col.width,
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
          render:(d:string)=><Space direction="vertical" size={0}><Text style={{fontSize:12}}>{dayjs(d).format('DD.MM.YYYY')}</Text><Text type="secondary" style={{fontSize:11}}>{dayjs(d).format('HH:mm')}</Text></Space>},
        { ...makeHeader('createdAt'), dataIndex:'createdAt', key:'createdAt', width:colWidths.createdAt,
          sorter:(a:Booking,b:Booking)=>dayjs(a.createdAt).unix()-dayjs(b.createdAt).unix(),
          render:(d:string)=><Space direction="vertical" size={0}><Text style={{fontSize:12}}>{dayjs(d).format('DD.MM.YYYY')}</Text><Text type="secondary" style={{fontSize:11}}>{dayjs(d).format('HH:mm')}</Text></Space>},
        { ...makeHeader('agency'), key:'agency', width:colWidths.agency,
          sorter:(a:Booking,b:Booking)=>{const na=a.agencyName||a.agency?.name||'Direkt';const nb=b.agencyName||b.agency?.name||'Direkt';return na.localeCompare(nb);},
          render:(_:any,r:any)=>{const n=r.agencyName||r.agency?.name||r.partnerName||r.metadata?.agencyName||'Direkt';return <Text strong style={{fontSize:12}}>{n}</Text>;}},
        { ...makeHeader('passengerName'), dataIndex:'passengerName', key:'passengerName', width:colWidths.passengerName,
          sorter:(a:Booking,b:Booking)=>a.passengerName.localeCompare(b.passengerName),
          render:(text:string,r:Booking)=><Space direction="vertical" size={0}><Text strong style={{fontSize:12}}>{text}</Text><Text type="secondary" style={{fontSize:11}}>{r.passengerPhone}</Text></Space>},
        { ...makeHeader('pickupLoc'), key:'pickupLoc', width:colWidths.pickupLoc, ellipsis: true,
          render:(_:any,r:Booking)=><EnvironmentItem text={getPickup(r)} color="green" />},
        { ...makeHeader('dropoffLoc'), key:'dropoffLoc', width:colWidths.dropoffLoc, ellipsis: true,
          render:(_:any,r:Booking)=><EnvironmentItem text={getDropoff(r)} color="red" />},
        { ...makeHeader('airportCode'), key:'airportCode', width:colWidths.airportCode,
          sorter:(a:Booking,b:Booking)=>(getAirportForRow(a)||'').localeCompare(getAirportForRow(b)||''),
          render:(_:any,r:Booking)=>{
              const code=getAirportForRow(r);
              return code ? <Tag style={{fontWeight:700,fontSize:12,letterSpacing:1,background:'#eef2ff',borderColor:'#6366f1',color:'#6366f1',borderRadius:6}}>✈ {code}</Tag> : <Text type="secondary" style={{fontSize:11}}>-</Text>;
          }},
        { ...makeHeader('vehicleType'), key:'vehicleType', width:colWidths.vehicleType,
          sorter:(a:Booking,b:Booking)=>(a.metadata?.vehicleType||a.vehicleType||'').localeCompare(b.metadata?.vehicleType||b.vehicleType||''),
          render:(_:any,r:Booking)=><Space size={4}><CarOutlined style={{color:'#6366f1'}}/><Text style={{fontSize:11}}>{r.metadata?.vehicleType||r.vehicleType||'Bilinmiyor'}</Text></Space>},
        { ...makeHeader('price'), dataIndex:'price', key:'price', width:colWidths.price,
          sorter:(a:Booking,b:Booking)=>(a.price||0)-(b.price||0),
          render:(p:number)=><Text strong style={{color:'#6366f1',fontSize:13}}>₺{p?.toLocaleString('tr-TR')}</Text>},
        { ...makeHeader('status'), dataIndex:'status', key:'status', width:colWidths.status,
          sorter:(a:Booking,b:Booking)=>getEffectiveStatus(a).localeCompare(getEffectiveStatus(b)),
          render:(_:any,r:Booking)=>{const conf=getStatusConf(r);return(
              <Tag style={{background:conf.bg,borderColor:conf.color,color:conf.color,fontWeight:600,fontSize:11,padding:'2px 8px',borderRadius:20}}>{conf.label}</Tag>
          );}},
        { ...makeHeader('paymentStatus'), dataIndex:'paymentStatus', key:'paymentStatus', width:colWidths.paymentStatus,
          render:(ps:string)=><Tag color={ps==='PAID'?'green':ps==='REFUNDED'?'red':'orange'} style={{fontSize:11}}>{ps==='PAID'?'Ödendi':ps==='REFUNDED'?'İade':'Bekliyor'}</Tag>},
        { ...makeHeader('flightNumber'), dataIndex:'flightNumber', key:'flightNumber', width:colWidths.flightNumber,
          render:(fn:string)=><Text style={{fontSize:12}}>{fn||'-'}</Text>},
        { ...makeHeader('adults'), dataIndex:'adults', key:'adults', width:colWidths.adults,
          sorter:(a:Booking,b:Booking)=>(a.adults||0)-(b.adults||0),
          render:(n:number)=><Text style={{fontSize:12}}>{n?`${n} kişi`:'-'}</Text>},
        { ...makeHeader('action'), key:'action', width:colWidths.action,
          render:(_:any,record:Booking)=>(
              <Space size="small">
                  <Tooltip title="Detaylar"><Button type="text" size="small" icon={<EyeOutlined/>} onClick={()=>{setSelectedBooking(record);setDetailModalVisible(true);}}/></Tooltip>
                  {record.status==='PENDING'&&(<>
                      <Dropdown menu={{items:[
                          {key:'op',label:'Onayla & Operasyona',icon:<SafetyCertificateOutlined/>,onClick:()=>handleUpdateStatus(record.id,'CONFIRMED','IN_OPERATION')},
                          {key:'pool',label:'Onayla & Havuza Aktar',icon:<TeamOutlined/>,onClick:()=>{
                              setActivePoolBooking(record);
                              setPoolPriceInput(record.price || 0);
                              setPoolModalOpen(true);
                          }}
                      ]}}>
                          <Button type="text" size="small" icon={<CheckCircleOutlined/>} style={{color:'#10b981'}}/>
                      </Dropdown>
                      <Tooltip title="İptal Et"><Button type="text" size="small" icon={<CloseCircleOutlined/>} style={{color:'#ef4444'}} onClick={()=>handleUpdateStatus(record.id,'CANCELLED')}/></Tooltip>
                  </>)}
                  {record.status==='CONFIRMED' && !['IN_OPERATION', 'IN_POOL'].includes(record.operationalStatus || '') &&(
                      <Tooltip title="Tamamlandı"><Button type="text" size="small" icon={<CheckCircleOutlined/>} style={{color:'#6366f1'}} onClick={()=>handleUpdateStatus(record.id,'COMPLETED')}/></Tooltip>
                  )}
              </Space>
          )},
    ];

    const visibleColumns = ALL_COLUMNS.filter(c=>visibleCols.includes(c.key));
    const totalWidth = visibleColumns.reduce((sum, col) => sum + (col.width || 100), 0);
    const activeFilterCount = Object.values(colFilters).filter(f=>f.text||(f.statuses?.length)||f.dateRange||f.minPrice!=null||f.maxPrice!=null).length;

    const colManagerContent = (
        <div style={{width:260}}>
            <Text type="secondary" style={{fontSize:11,marginBottom:8,display:'block'}}>Kolon başlığına <b>çift tıklayarak</b> adını düzenleyebilirsiniz.</Text>
            <Divider style={{margin:'8px 0'}}/>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {ALL_COL_KEYS.filter(k=>k!=='action').map(key=>(
                    <div key={key} style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <Text style={{fontSize:12}}>{colTitles[key]||key}</Text>
                        <Switch size="small" checked={visibleCols.includes(key)} onChange={checked=>{
                            let next: string[];
                            if(checked) next = [...visibleCols, key];
                            else next = visibleCols.filter(k => k !== key);
                            setVisibleCols(next);
                            savePreferences({ visibleCols: next });
                        }}/>
                    </div>
                ))}
            </div>
            <Divider style={{margin:'8px 0'}}/>
            <Button size="small" block onClick={()=>{
                setVisibleCols(DEFAULT_VISIBLE_COLS);
                setColTitles(DEFAULT_COL_TITLES);
                savePreferences({ visibleCols: DEFAULT_VISIBLE_COLS, colTitles: DEFAULT_COL_TITLES });
            }}>Varsayılana Sıfırla</Button>
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
                            const has=f.text||(f.statuses?.length)||f.dateRange||f.minPrice!=null||f.maxPrice!=null;
                            if(!has) return null;
                            return <Tag key={key} closable onClose={()=>handleClearFilter(key)} color="blue" style={{borderRadius:20}}>{colTitles[key]||key}</Tag>;
                        })}
                        <Button size="small" type="link" onClick={()=>setColFilters({})} style={{color:'#ef4444'}}>Tümünü Temizle</Button>
                    </div>
                )}

                {/* Table */}
                <Card variant="borderless" style={{borderRadius:12,boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}} styles={{body:{padding:0}}}>
                    <Table
                        columns={visibleColumns} dataSource={filteredBookings} rowKey="id"
                        loading={loading} scroll={{x: Math.max(totalWidth, 1000)}}
                        components={tableComponents}
                        tableLayout="fixed"
                        pagination={{pageSize:15,showSizeChanger:true,
                            showTotal:(total,range)=>`${range[0]}-${range[1]} / ${total} kayıt`,
                            pageSizeOptions:['10','15','25','50','100']}}
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
                                    notes: selectedBooking.notes
                                });
                            }
                        }}>Düzenle</Button>,
                        !isEditing && <Button key="print" icon={<PrinterOutlined/>} onClick={handlePrint}>Yazdır</Button>,
                        !isEditing && <Button key="pdf" type="primary" icon={<FilePdfOutlined/>} onClick={handleExportPDF} style={{background:'#ef4444',border:'none'}}>PDF</Button>,
                        isEditing && <Button key="cancelEdit" onClick={()=>setIsEditing(false)}>İptal</Button>,
                        isEditing && <Button key="saveEdit" type="primary" onClick={()=>editForm.submit()} style={{background:'#10b981',borderColor:'#10b981'}}>Kaydet</Button>,
                    ].filter(Boolean)}
                    width={720}
                >
                    {selectedBooking&&(
                        <Space direction="vertical" size="middle" style={{width:'100%'}}>
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
                                        <Descriptions.Item label="Notlar" span={2}>{selectedBooking.notes||'-'}</Descriptions.Item>
                                    </Descriptions>
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
                                        <Form.Item name="pickup" label="Alış Yeri" rules={[{required:true, message:'Zorunlu'}]}><HereLocationSearchInput placeholder="Havaalanı, Otel, Adres..." country="TUR" /></Form.Item>
                                        <Form.Item name="dropoff" label="Bırakış Yeri" rules={[{required:true, message:'Zorunlu'}]}><HereLocationSearchInput placeholder="Havaalanı, Otel, Adres..." country="TUR" /></Form.Item>
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
                                        <Form.Item name="adults" label="Yolcu Sayısı"><InputNumber min={1} style={{width:'100%'}}/></Form.Item>
                                        <Form.Item name="price" label="Müşteri Fiyatı (₺)" rules={[{required:true, message:'Zorunlu'}]}><InputNumber min={0} style={{width:'100%'}}/></Form.Item>
                                        <Form.Item name="notes" label="Notlar (Özel İstekler)"><Input.TextArea rows={2}/></Form.Item>
                                    </div>
                                </Form>
                            )}
                        </Space>
                    )}
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

                {/* Create Transfer Modal */}
                <Modal
                    title={<Space><CarOutlined style={{color:'#6366f1'}}/>Yeni Transfer Oluştur</Space>}
                    open={createModalVisible}
                    onCancel={() => { setCreateModalVisible(false); createForm.resetFields(); }}
                    onOk={() => createForm.submit()}
                    okText="Oluştur" cancelText="İptal"
                    width={720}
                    okButtonProps={{ style: { background: '#6366f1' } }}
                >
                    <Form form={createForm} layout="vertical" onFinish={async (values) => {
                        try {
                            const res = await apiClient.post(`/api/transfer/bookings/admin`, {
                                ...values,
                                pickupDateTime: values.pickupDateTime.toISOString()
                            });
                            if (res.data.success) {
                                message.success('Yeni transfer oluşturuldu!');
                                setCreateModalVisible(false);
                                createForm.resetFields();
                                fetchBookings();
                            }
                        } catch { message.error('Rezervasyon oluşturulamadı'); }
                    }}>
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                            <Form.Item name="passengerName" label="Ad Soyad" rules={[{required:true, message:'Zorunlu'}]}><Input/></Form.Item>
                            <Form.Item name="passengerPhone" label="Telefon" rules={[{required:true, message:'Zorunlu'}]}><Input/></Form.Item>
                            <Form.Item name="passengerEmail" label="E-posta"><Input/></Form.Item>
                            <Form.Item name="adults" label="Yolcu Sayısı" initialValue={1}><InputNumber min={1} style={{width:'100%'}}/></Form.Item>
                            
                            <Divider style={{gridColumn:'1 / -1', margin:'4px 0'}}>Transfer Detayları</Divider>
                            
                            <Form.Item name="pickup" label="Nereden (Alış Yeri)" rules={[{required:true, message:'Zorunlu'}]}><HereLocationSearchInput placeholder="Havaalanı, Otel, Adres..." country="TUR" /></Form.Item>
                            <Form.Item name="dropoff" label="Nereye (Bırakış Yeri)" rules={[{required:true, message:'Zorunlu'}]}><HereLocationSearchInput placeholder="Havaalanı, Otel, Adres..." country="TUR" /></Form.Item>
                            <Form.Item name="pickupDateTime" label="Tarih & Saat" rules={[{required:true, message:'Zorunlu'}]}><DatePicker showTime format="DD.MM.YYYY HH:mm" style={{width:'100%'}}/></Form.Item>
                            <Form.Item name="flightNumber" label="Uçuş Kodu / PNR"><Input/></Form.Item>
                            
                            <Divider style={{gridColumn:'1 / -1', margin:'4px 0'}}>Araç ve Fiyat</Divider>
                            
                            <Form.Item name="vehicleType" label="Araç Tipi" rules={[{required:true, message:'Zorunlu'}]} initialValue="Standart">
                                <Select>
                                    <Select.Option value="Standart">Standart</Select.Option>
                                    <Select.Option value="VIP Minibüs">VIP Minibüs</Select.Option>
                                    <Select.Option value="Vito">Vito</Select.Option>
                                    <Select.Option value="Sprinter">Sprinter</Select.Option>
                                    <Select.Option value="Sedan">Sedan</Select.Option>
                                </Select>
                            </Form.Item>
                            <Form.Item name="price" label="Tahsilat / Toplam Ücret (₺)" rules={[{required:true, message:'Zorunlu'}]}><InputNumber min={0} style={{width:'100%'}}/></Form.Item>
                            <Form.Item name="notes" label="Ek Açıklama / Notlar" style={{gridColumn:'1 / -1'}}><Input.TextArea rows={2}/></Form.Item>
                        </div>
                    </Form>
                </Modal>

                 {/* Dynamic + Print Styles */}
                <style>{`
                    ${dynamicStyles}

                    /* ── Resizable column handle ── */
                    .react-resizable { position: relative; background-clip: padding-box; }
                    .react-resizable-handle {
                        position: absolute;
                        right: -4px;
                        bottom: 0;
                        top: 0;
                        width: 8px;
                        cursor: col-resize;
                        z-index: 10;
                    }
                    .react-resizable-handle::after {
                        content: '';
                        position: absolute;
                        right: 3px;
                        top: 50%;
                        transform: translateY(-50%);
                        width: 2px;
                        height: 16px;
                        background: #d1d5db;
                        border-radius: 2px;
                        transition: background 0.2s;
                    }
                    .react-resizable-handle:hover::after { background: #6366f1; }

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
