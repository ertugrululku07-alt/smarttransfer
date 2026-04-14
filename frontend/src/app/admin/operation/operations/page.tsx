'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    Table, Card, Tag, Button, Space, Typography, message,
    Row, Col, DatePicker, Select, Input, Checkbox, Popover, Badge,
    Avatar, Tooltip, Modal, Segmented, Spin
} from 'antd';
import { Resizable } from 'react-resizable';
import 'react-resizable/css/styles.css';
import {
    ReloadOutlined,
    CarOutlined,
    EnvironmentOutlined,
    CalendarOutlined,
    UserOutlined,
    SearchOutlined,
    FilterOutlined,
    FileExcelOutlined,
    SwapRightOutlined,
    InfoCircleOutlined,
    ManOutlined,
    WomanOutlined,
    SaveOutlined,
    UndoOutlined,
    DragOutlined,
    EditOutlined,
    BgColorsOutlined,
    MessageOutlined,
    FullscreenOutlined,
    FullscreenExitOutlined,
    EyeOutlined,
    EyeInvisibleOutlined,
    PlusOutlined,
    RocketOutlined,
    CaretUpOutlined,
    CaretDownOutlined,
    SettingOutlined,
    DeleteOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
dayjs.extend(require('dayjs/plugin/customParseFormat'));
dayjs.locale('tr');
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';
import type { ColumnsType } from 'antd/es/table';

import { useSocket } from '@/app/context/SocketContext';
import OperationsTable from './OperationsTable';

// DnD Imports
import type { DragEndEvent } from '@dnd-kit/core';
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable } from '@dnd-kit/core';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import {
    arrayMove,
    SortableContext,
    useSortable,
    horizontalListSortingStrategy,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

dayjs.locale('tr');

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

// Resizable Title Component using react-resizable
const ResizableTitle = (props: any) => {
    const { onResize, width, ...restProps } = props;

    if (!width) {
        return <th {...restProps} />;
    }

    return (
        <Resizable
            width={width}
            height={0}
            onResize={onResize}
            draggableOpts={{ enableUserSelectHack: false }}
        >
            <th {...restProps} style={{ ...restProps.style, userSelect: 'none' }} />
        </Resizable>
    );
};


// --- Shuttle DnD Components ---
const DroppableShuttleRun = ({ runId, children }: { runId: string, children: React.ReactNode }) => {
    const { isOver, setNodeRef } = useDroppable({ id: runId });
    return (
        <div ref={setNodeRef} style={{ transition: 'all 0.2s', border: isOver ? '2px dashed #6366f1' : 'none', borderRadius: 12 }}>
            {children}
        </div>
    );
};

// DraggablePassengerItem: Provide Sortable props to children.
const DraggablePassengerItem = ({
    booking,
    children,
}: {
    booking: any;
    children: (dndProps: { setNodeRef: any; style: any; attributes: any; listeners: any; isDragging: boolean }) => React.ReactNode;
}) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: booking.id,
        data: { booking },
    });
    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 999 : 1,
        opacity: isDragging ? 0.85 : 1,
    };
    
    return <>{children({ setNodeRef, style, attributes, listeners, isDragging })}</>;
};
// ------------------------------

// ColSortableItem: Sortable row for shuttle column reorder modal
const ColSortableItem = ({
    col,
    onLabelChange,
    onVisibilityChange,
}: {
    col: { key: string; label: string; hidden: boolean; width: number };
    onLabelChange: (v: string) => void;
    onVisibilityChange: (checked: boolean) => void;
}) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.key });
    const style: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 9999 : 1,
        opacity: isDragging ? 0.7 : 1,
    };
    return (
        <div
            ref={setNodeRef}
            style={{
                ...style,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: isDragging ? '#ede9fe' : '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: '8px 12px',
                cursor: 'auto',
                boxShadow: isDragging ? '0 4px 16px rgba(99,102,241,0.2)' : 'none',
            }}
        >
            <div
                {...attributes}
                {...listeners}
                style={{ cursor: 'grab', color: '#a78bfa', fontSize: 16, padding: '0 4px', flexShrink: 0 }}
                title="Sürükleyerek sırayı değiştir"
            >
                ⠿
            </div>
            <Checkbox
                checked={!col.hidden}
                onChange={(e) => onVisibilityChange(e.target.checked)}
            />
            <span style={{ fontSize: 11, color: '#64748b', width: 80, flexShrink: 0, fontWeight: 600 }}>{col.key}</span>
            <Input
                size="small"
                value={col.label}
                onChange={(e) => onLabelChange(e.target.value)}
                style={{ flex: 1 }}
            />
        </div>
    );
};
// ------------------------------

export default function OperationsPage() {
    const [bookings, setBookings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [currencies, setCurrencies] = useState<any[]>([]);
    const [defaultCurrency, setDefaultCurrency] = useState<string>('EUR');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem('operationsHiddenColumns');
            return saved ? new Set(JSON.parse(saved)) : new Set();
        } catch { return new Set(); }
    });
    const { socket } = useSocket();

    const shuttleActionTimeRef = useRef<number>(0);

    // ── Inline cell editing state ──
    const [editingCell, setEditingCell] = useState<{ id: string; field: string; value: any } | null>(null);
    const [cellSaving, setCellSaving] = useState(false);

    // ── Return to reservation modal state ──
    const [returnModal, setReturnModal] = useState<{ booking: any; reason: string } | null>(null);
    const [returnSaving, setReturnSaving] = useState(false);

    // ── Column titles from user metadata ──
    const [columnTitles, setColumnTitles] = useState<Record<string, string>>({});

    const saveColumnTitleToAPI = async (key: string, title: string) => {
        try {
            const res = await apiClient.get('/api/auth/metadata');
            const currentMeta = res.data?.data || {};
            const currentPrefs = currentMeta.operations_preferences || {};
            const newTitles = { ...(currentPrefs.columnTitles || {}), [key]: title };
            await apiClient.put('/api/auth/metadata', { preferences: { operations_preferences: { ...currentPrefs, columnTitles: newTitles } } });
        } catch (e) {
            // Fallback: save to localStorage only
            try {
                const saved = JSON.parse(localStorage.getItem('operationsColumnTitles') || '{}');
                localStorage.setItem('operationsColumnTitles', JSON.stringify({ ...saved, [key]: title }));
            } catch {}
        }
    };

    const handleColumnTitleChange = (key: string, newTitle: string) => {
        setColumnTitles(prev => ({ ...prev, [key]: newTitle }));
        setColumnConfig(prev => prev.map(c => c.key === key ? { ...c, title: newTitle } : c));
        
        // Let's also update the "operationsTableColumns" so it doesn't get reverted on refresh if we don't hit global Kaydet
        try {
            const savedColumns = localStorage.getItem('operationsTableColumns');
            if (savedColumns) {
                const parsed = JSON.parse(savedColumns);
                const updated = parsed.map((p: any) => p.key === key ? { ...p, title: newTitle } : p);
                localStorage.setItem('operationsTableColumns', JSON.stringify(updated));
            }
        } catch(e) {}
        
        saveColumnTitleToAPI(key, newTitle);
    };

    // ── Cell save helper ──
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
            else if (field === 'customerNote') payload.specialRequests = value;
            else if (field === 'status') { payload.status = value; payload.operationalStatus = value; }
            await apiClient.patch(`/api/transfer/bookings/${bookingId}`, payload);
            setBookings(prev => prev.map(b => {
                if (b.id !== bookingId) return b;
                const updated: any = { ...b };
                if (field === 'contactName') updated.contactName = value;
                else if (field === 'contactPhone') { updated.contactPhone = value; if (updated.customer) updated.customer.phone = value; }
                else if (field === 'pickupDateTime') updated.pickupDateTime = value;
                else if (field === 'pickup') { updated.pickup = { location: value, rawLocation: value }; }
                else if (field === 'dropoff') { updated.dropoff = { location: value, rawLocation: value }; }
                else if (field === 'flightNumber') updated.flightNumber = value;
                else if (field === 'flightTime') updated.flightTime = value;
                else if (field === 'adults') updated.adults = Number(value);
                else if (field === 'price') { updated.price = Number(value); updated.total = Number(value); }
                else if (field === 'internalNotes') updated.internalNotes = value;
                else if (field === 'customerNote') updated.specialRequests = value;
                else if (field === 'status') { updated.status = value; updated.operationalStatus = value; }
                return updated;
            }));
            message.success('✅ Güncellendi');
        } catch (e: any) {
            message.error('Güncelleme başarısız: ' + (e?.response?.data?.error || e.message));
        } finally {
            setCellSaving(false);
            setEditingCell(null);
        }
    };

    // ── Return to reservation handler ──
    const handleReturnToReservation = async () => {
        if (!returnModal) return;
        setReturnSaving(true);
        try {
            await apiClient.patch(`/api/transfer/bookings/${returnModal.booking.id}`, {
                returnToReservation: true,
                returnReason: returnModal.reason
            });
            message.success('Rezervasyon beklemede durumuna alındı');
            setReturnModal(null);
            fetchBookings();
        } catch (e: any) {
            message.error('İşlem başarısız: ' + (e?.response?.data?.error || e.message));
        } finally {
            setReturnSaving(false);
        }
    };

    // ── Inline editable cell renderer ──
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
                    if (field === 'contactName') initVal = record.contactName || record.customer?.name || '';
                    else if (field === 'contactPhone') initVal = record.contactPhone || record.customer?.phone || '';
                    else if (field === 'pickupDateTime') initVal = record.pickupDateTime ? dayjs(record.pickupDateTime).format('YYYY-MM-DDTHH:mm') : '';
                    else if (field === 'pickup') initVal = record.pickup?.rawLocation || record.pickup?.location || '';
                    else if (field === 'dropoff') initVal = record.dropoff?.rawLocation || record.dropoff?.location || '';
                    else if (field === 'flightNumber') initVal = record.flightNumber || '';
                    else if (field === 'flightTime') initVal = record.flightTime || '';
                    else if (field === 'adults') initVal = record.adults || 1;
                    else if (field === 'price') initVal = record.price || record.total || 0;
                    else if (field === 'internalNotes') initVal = record.internalNotes || '';
                    else if (field === 'customerNote') initVal = record.specialRequests || record.notes || record.agencyNote || '';
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

    const [isManualModalVisible, setIsManualModalVisible] = useState(false);
    const [manualRunTime, setManualRunTime] = useState('');
    const [manualRunName, setManualRunName] = useState('');

    // ── Inline header title editing state ──
    const [editingHeaderKey, setEditingHeaderKey] = useState<string | null>(null);
    const [editingHeaderValue, setEditingHeaderValue] = useState<string>('');

    const handleAddManualRun = () => {
        if (!manualRunTime || !manualRunName) {
            message.error("Lütfen saat ve rota adı girin.");
            return;
        }
        const newRunId = `MANUAL::${Date.now()}`;
        const dateStr = filters.dateRange[0].format('YYYY-MM-DD');
        const newRun = {
            runKey: newRunId,
            departureTime: manualRunTime,
            routeName: manualRunName,
            isManual: true,
            manualRunId: newRunId,
            date: dateStr,
            bookings: []
        };
        setPersistedManualRuns(prev => [newRun, ...prev]);
        setShuttleRuns(prev => {
            const arr = [newRun, ...prev];
            return arr.sort((a, b) => (a.departureTime || '').localeCompare(b.departureTime || ''));
        });
        setIsManualModalVisible(false);
        setManualRunTime('');
        setManualRunName('');
        message.success("Manuel sefer eklendi. Yolcuları bu sefere sürükleyebilirsiniz.");
    };

    // Conflict modal state
    const [conflictModal, setConflictModal] = useState<{
        visible: boolean;
        message: string;
        conflictWith: string;
        conflictPickup: string;
        conflictDropoff: string;
        conflictStart: string;
        freeAt: string;
        onForceAssign: () => void;
    } | null>(null);

    // AI Suggest modal state
    const [aiModal, setAiModal] = useState<{
        visible: boolean;
        loading: boolean;
        bookingId: string;
        suggestion: any;
    } | null>(null);

    // Complete Booking Modal state
    const [completeModalVisible, setCompleteModalVisible] = useState(false);
    const [selectedCompleteBooking, setSelectedCompleteBooking] = useState<any>(null);
    const [collectedAmount, setCollectedAmount] = useState<number>(0);
    const [completeLoading, setCompleteLoading] = useState(false);

    const handleOpenCompleteModal = (booking: any) => {
        setSelectedCompleteBooking(booking);
        setCollectedAmount(booking.total || booking.price || 0); // Suggest total price
        setCompleteModalVisible(true);
    };

    const handleCompleteTransfer = async () => {
        if (!selectedCompleteBooking) return;
        setCompleteLoading(true);
        try {
            await apiClient.put(`/api/transfer/bookings/${selectedCompleteBooking.id}/status`, {
                status: 'COMPLETED',
                collectedAmount: collectedAmount
            });
            message.success('Transfer başarıyla tamamlandı!');
            setCompleteModalVisible(false);
            fetchBookings(); // Refresh list to get new status
        } catch (e: any) {
            console.error(e);
            message.error(e.response?.data?.error || 'Transfer tamamlanırken bir hata oluştu');
        } finally {
            setCompleteLoading(false);
        }
    };

    // ── Shuttle Booking Detail Modal ──
    const [shuttleDetailModal, setShuttleDetailModal] = useState<{ booking: any; loading: boolean } | null>(null);
    const [shuttleDetailStatusSaving, setShuttleDetailStatusSaving] = useState(false);

    // ── Pool Transfer Modal (with price) ──
    const [poolTransferModal, setPoolTransferModal] = useState<{ booking: any; price: number; currency: string } | null>(null);
    const [poolTransferSaving, setPoolTransferSaving] = useState(false);

    const handleShuttleStatusChange = async (bookingId: string, newStatus: string) => {
        setShuttleDetailStatusSaving(true);
        shuttleActionTimeRef.current = Date.now();
        try {
            await apiClient.patch(`/api/transfer/bookings/${bookingId}`, {
                status: newStatus,
                operationalStatus: newStatus
            });
            // Optimistic update in shuttle runs
            setShuttleRuns(prev => prev.map(r => ({
                ...r,
                bookings: r.bookings.map((b: any) => b.id === bookingId ? { ...b, status: newStatus } : b)
            })));
            // Also update bookings array
            setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus, operationalStatus: newStatus } : b));
            // Update the modal state too
            setShuttleDetailModal(prev => prev ? { ...prev, booking: { ...prev.booking, status: newStatus } } : null);
            message.success('Durum güncellendi');
        } catch (e: any) {
            message.error('Durum güncellenemedi: ' + (e?.response?.data?.error || e.message));
        } finally {
            setShuttleDetailStatusSaving(false);
        }
    };

    const handlePoolTransfer = async () => {
        if (!poolTransferModal) return;
        setPoolTransferSaving(true);
        shuttleActionTimeRef.current = Date.now();
        try {
            await apiClient.patch(`/api/transfer/bookings/${poolTransferModal.booking.id}`, {
                operationalStatus: 'POOL',
                price: poolTransferModal.price,
                currency: poolTransferModal.currency
            });
            // Optimistic: remove from shuttle runs
            setShuttleRuns(prev => prev.map(r => ({
                ...r,
                bookings: r.bookings.filter((b: any) => b.id !== poolTransferModal.booking.id)
            })));
            setBookings(prev => prev.filter(b => b.id !== poolTransferModal.booking.id));
            setPoolTransferModal(null);
            setShuttleDetailModal(null);
            message.success('Transfer havuza aktarıldı!');
        } catch (e: any) {
            message.error('Havuza aktarma başarısız: ' + (e?.response?.data?.error || e.message));
        } finally {
            setPoolTransferSaving(false);
        }
    };

    // Fullscreen toggle
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => { });
        } else {
            document.exitFullscreen().catch(() => { });
        }
    };

    // Listen for fullscreen changes (ESC key auto-exits)
    React.useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    const toggleColumnVisibility = (key: string) => {
        setHiddenColumns(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            localStorage.setItem('operationsHiddenColumns', JSON.stringify([...next]));
            return next;
        });
    };

    // Transfer durumu renk ayarları
    const STATUS_LABELS: Record<string, string> = {
        PENDING: 'Beklemede',
        CONFIRMED: 'Onaylandı',
        PASSENGER_PICKED_UP: 'Yolcu Alındı',
        ON_THE_WAY: 'Yolda',
        COMPLETED: 'Tamamlandı',
        CANCELLED: 'İptal',
        // Operasyonel alt durumlar
        OPERASYONDA: 'Operasyonda',
        IN_OPERATION: 'Operasyonda',
        HAVUZDA: 'Havuzda',
    };
    const DEFAULT_COLORS: Record<string, string> = {
        PENDING: '#e6f4ff',
        CONFIRMED: '#f6ffed',
        PASSENGER_PICKED_UP: '#fff7e6',
        ON_THE_WAY: '#e6fffb',
        COMPLETED: '#f9f9f9',
        CANCELLED: '#fff1f0',
        OPERASYONDA: '#91caff',
        IN_OPERATION: '#91caff',
        HAVUZDA: '#fff0f6',
    };
    const [statusColors, setStatusColors] = useState<Record<string, string>>(DEFAULT_COLORS);
    const [airportColors, setAirportColors] = useState<Record<string, string>>({});
    const [colorModalVisible, setColorModalVisible] = useState(false);
    const [tempColors, setTempColors] = useState<Record<string, string>>(DEFAULT_COLORS);
    const [columnTitlesModalVisible, setColumnTitlesModalVisible] = useState(false);
    const [tempColumnTitles, setTempColumnTitles] = useState<Record<string, string>>({});


    // Filters — default to PRIVATE so only Özel Transferler show on load
    const [filters, setFilters] = useState({
        dateRange: [dayjs(), dayjs()],
        direction: 'ALL', // ALL, DEPARTURE, ARRIVAL, INTER
        transferType: 'PRIVATE', // ALL, SHUTTLE, PRIVATE — defaults to PRIVATE
        agency: 'ALL',
        status: 'ALL',
        driver: 'ALL',
        vehicle: 'ALL',
        pickup: '',
        dropoff: ''
    });

    // Default Columns Definition
    const defaultColumns = [
        {
            title: '#',
            key: 'index',
            width: 45,
            render: (_: any, __: any, index: number) => <Text style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{index + 1}</Text>,
        },
        {
            title: 'T.KOD',
            dataIndex: 'bookingNumber',
            key: 'bookingNumber',
            width: 105,
            render: (text: string) => <Tag color="blue" style={{ fontSize: 11, fontWeight: 600 }}>{text}</Tag>,
        },
        {
            title: 'YÖN',
            dataIndex: 'direction',
            key: 'direction',
            width: 95,
            render: (text: string, record: any) => {
                let color = 'default';
                if (text === 'Geliş') color = 'green';
                if (text === 'Gidiş') color = 'orange';
                const isShuttle = record.transferType === 'SHUTTLE';
                return (
                    <Space direction="vertical" size={2}>
                        <Tag color={color} style={{ margin: 0 }}>{text}</Tag>
                        <Tag color={isShuttle ? 'geekblue' : 'purple'} style={{ margin: 0, fontSize: 10 }}>
                            {isShuttle ? 'Shuttle' : 'Özel'}
                        </Tag>
                    </Space>
                );
            }
        },
        {
            title: 'ACENTE',
            key: 'partnerName',
            width: 130,
            render: (_: any, record: any) => {
                const name = record.agencyName || record.agency?.name || record.partnerName;
                return <Text strong>{name || 'Direkt'}</Text>;
            }
        },
        {
            title: 'MÜŞTERİ NOTU',
            key: 'customerNote',
            width: 120,
            render: (_: any, record: any) => {
                const note = record.specialRequests || record.notes || record.agencyNote || '';
                if (!note) return renderEditableCell(record, 'customerNote', <Text type="secondary" style={{ fontSize: 10, cursor: 'text' }}>⊕ Not ekle...</Text>);
                return renderEditableCell(
                    record, 'customerNote',
                    <Popover
                        content={<div style={{ maxWidth: 280, whiteSpace: 'pre-wrap' }}>{note}</div>}
                        title={<span style={{ color: '#6366f1' }}>✏️ Müşteri Notu</span>}
                    >
                        <div style={{
                            fontSize: 10, color: '#374151',
                            background: '#fffbeb', border: '1px solid #fde68a',
                            borderRadius: 5, padding: '2px 6px',
                            cursor: 'text', maxWidth: 105, overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>
                            💬 {note}
                        </div>
                    </Popover>
                );
            }
        },
        {
            title: 'OP. NOTU',
            key: 'internalNotes',
            width: 120,
            render: (_: any, record: any) => {
                const note = record.internalNotes || record.metadata?.internalNotes || '';
                return renderEditableCell(
                    record, 'internalNotes',
                    note ? (
                        <Popover
                            content={<div style={{ maxWidth: 280, whiteSpace: 'pre-wrap' }}>{note}</div>}
                            title={<span style={{ color: '#10b981' }}>📋 Operasyon Notu (Şoför Görecek)</span>}
                        >
                            <div style={{
                                fontSize: 10, color: '#065f46',
                                background: '#d1fae5', border: '1px solid #6ee7b7',
                                borderRadius: 5, padding: '2px 6px',
                                cursor: 'text', maxWidth: 105, overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}>
                                📋 {note}
                            </div>
                        </Popover>
                    ) : (
                        <Text type="secondary" style={{ fontSize: 10, cursor: 'text' }}>⊕ Not ekle...</Text>
                    )
                );
            }
        },
        {
            title: 'MÜŞTERİ ADI',
            key: 'customerName',
            width: 160,
            render: (_: any, record: any) => {
                const name = record.contactName || record.customer?.name || record.passengerName || '';
                return renderEditableCell(record, 'contactName',
                    <Text strong style={{ fontSize: 11, textTransform: 'uppercase', cursor: 'text' }}>{name || <Text type="secondary">—</Text>}</Text>
                );
            }
        },
        {
            title: 'TELEFON',
            key: 'contactPhone',
            width: 115,
            render: (_: any, record: any) => {
                const phone = record.contactPhone || record.customer?.phone || record.passengerPhone || '';
                return renderEditableCell(record, 'contactPhone',
                    <Text type="secondary" style={{ fontSize: 11, cursor: 'text' }} copyable>{phone || '-'}</Text>
                );
            }
        },
        {
            title: 'TARİH',
            dataIndex: 'pickupDateTime',
            key: 'date',
            width: 90,
            render: (val: string, record: any) => renderEditableCell(
                record, 'pickupDateTime',
                <Text style={{ fontSize: 11, cursor: 'text' }}>{val ? dayjs(val).format('DD.MM.YY') : '-'}</Text>
            )
        },
        {
            title: 'DURUM',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status: string, record: any) => {
                const map: any = { 'CONFIRMED': 'blue', 'PENDING': 'orange', 'COMPLETED': 'green', 'CANCELLED': 'red', 'IN_PROGRESS': 'purple' };
                const label: any = { 'CONFIRMED': 'Onaylı', 'PENDING': 'Bekliyor', 'COMPLETED': 'Tamamlandı', 'CANCELLED': 'İptal', 'IN_PROGRESS': 'Alındı' };
                return renderEditableCell(
                    record, 'status',
                    <Tag color={map[status]} style={{ fontSize: 10, margin: 0, cursor: 'text' }}>{label[status] || status}</Tag>,
                    <Select size="small" autoFocus defaultValue={status}
                        onBlur={(e: any) => saveCellEdit(record.id, 'status', e.target.value)}
                        onChange={(val) => saveCellEdit(record.id, 'status', val)}
                        style={{ width: 100 }}
                        options={[
                            { value: 'PENDING', label: 'Bekliyor' },
                            { value: 'CONFIRMED', label: 'Onaylı' },
                            { value: 'IN_PROGRESS', label: 'Alındı' },
                            { value: 'COMPLETED', label: 'Tamamlandı' },
                            { value: 'CANCELLED', label: 'İptal' }
                        ]}
                    />
                );
            }
        },
        {
            title: 'ŞOFÖR',
            dataIndex: 'driverId',
            key: 'driver',
            width: 155,
            render: (val: string, record: any) => {
                const isShuttle = record.transferType === 'SHUTTLE';

                const filteredDrivers = drivers;

                const options = filteredDrivers
                    .map((d: any) => ({
                        value: d.user?.id || d.id,
                        label: `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.user?.fullName || d.user?.email || `Şöför (${(d.user?.id || d.id).substring(0, 8)})`
                    }));

                // Ensure the currently assigned driver is ALWAYS in the options list so its name resolves properly
                if (record.driverId && !options.find((o: any) => o.value === record.driverId)) {
                    const currentDriver = drivers.find((d: any) => (d.user?.id || d.id) === record.driverId);
                    if (currentDriver) {
                        options.push({
                            value: record.driverId,
                            label: `${currentDriver.firstName || ''} ${currentDriver.lastName || ''}`.trim() || currentDriver.name || currentDriver.user?.name || currentDriver.user?.username || `Şöför (${record.driverId.substring(0, 8)})`
                        });
                    } else {
                        // Fallback if the driver isn't in drivers list yet
                        options.push({
                            value: record.driverId,
                            label: record.driverName !== 'Atanmadı' ? record.driverName : `Şöför (${record.driverId.substring(0, 8)})`
                        });
                    }
                }

                return (
                    <Space size={1}>
                        <Select
                            size="small"
                            placeholder="Seçiniz"
                            style={{ width: 110, fontSize: 11 }}
                            variant="borderless"
                            showSearch
                            optionFilterProp="children"
                            value={record.driverId || undefined}
                            onChange={(driverId) => handleDriverChange(record.id, driverId)}
                            options={options}
                        />
                        <Tooltip title="AI Öneri">
                            <Button
                                size="small"
                                type="text"
                                onClick={() => handleAISuggest(record.id)}
                                style={{ padding: '0 2px', fontSize: 12 }}
                            >
                                🤖
                            </Button>
                        </Tooltip>
                    </Space>
                );
            }
        },
        {
            title: 'ARAÇ',
            dataIndex: 'assignedVehicleId',
            key: 'vehicle',
            width: 165,
            render: (val: string, record: any) => {
                const isShuttle = record.transferType === 'SHUTTLE';

                // Filter by usageType (set in vehicle management)
                const hasUsageType = (v: any, type: string) => {
                    const ut = v.usageType || v.metadata?.usageType;
                    return Array.isArray(ut) ? ut.includes(type) : ut === type;
                };
                const shuttleVehicles = vehicles.filter((v: any) => hasUsageType(v, 'SHUTTLE') || v.shuttleMode || v.metadata?.shuttleMode);
                const privateVehicles = vehicles.filter((v: any) => hasUsageType(v, 'TRANSFER') || hasUsageType(v, 'PRIVATE') || hasUsageType(v, 'Özel Transfer') || (!hasUsageType(v, 'SHUTTLE') && !v.shuttleMode && !v.metadata?.shuttleMode));

                // Use filtered list strictly depending on Shuttle or Private
                const filteredVehicles = isShuttle ? shuttleVehicles : privateVehicles;
                const fallback = isShuttle && shuttleVehicles.length === 0 || !isShuttle && privateVehicles.length === 0;

                const options = filteredVehicles.map((v: any) => ({
                    value: v.id,
                    label: `${v.plateNumber} - ${v.model || ''}`
                }));

                // Ensure the currently assigned vehicle is ALWAYS in the options list so its plate resolves properly
                if (record.assignedVehicleId && !options.find((o: any) => o.value === record.assignedVehicleId)) {
                    const currentVehicle = vehicles.find((v: any) => v.id === record.assignedVehicleId);
                    if (currentVehicle) {
                        options.push({
                            value: record.assignedVehicleId,
                            label: `${currentVehicle.plateNumber} - ${currentVehicle.model || ''}`
                        });
                    }
                }

                return (
                    <Select
                        style={{ width: 150, fontSize: 11 }}
                        placeholder={isShuttle ? 'Shuttle' : 'Araç Seç'}
                        size="small"
                        value={record.assignedVehicleId || undefined}
                        onChange={(vehicleId) => handleVehicleChange(record.id, vehicleId)}
                        variant="borderless"
                        showSearch
                        optionFilterProp="children"
                        options={options}
                    />
                );
            }
        },
        {
            title: 'SAAT',
            dataIndex: 'pickupDateTime',
            key: 'time',
            width: 75,
            render: (val: string, record: any) => renderEditableCell(
                record, 'pickupDateTime',
                <Tag icon={<CarOutlined />} color="blue" style={{ margin: 0, cursor: 'text', fontSize: 11 }}>{val ? dayjs(val).format('HH:mm') : '-'}</Tag>,
                <Input
                    size="small"
                    type="time"
                    autoFocus
                    defaultValue={val ? dayjs(val).format('HH:mm') : ''}
                    onBlur={(e) => {
                        if (e.target.value && val) {
                            const date = dayjs(val).format('YYYY-MM-DD');
                            saveCellEdit(record.id, 'pickupDateTime', `${date}T${e.target.value}`);
                        }
                    }}
                    onPressEnter={(e) => {
                        if ((e.target as HTMLInputElement).value && val) {
                            const date = dayjs(val).format('YYYY-MM-DD');
                            saveCellEdit(record.id, 'pickupDateTime', `${date}T${(e.target as HTMLInputElement).value}`);
                        }
                    }}
                    style={{ width: 90 }}
                />
            )
        },
        {
            title: 'UÇUŞ',
            dataIndex: 'flightNumber',
            key: 'flightCode',
            width: 90,
            render: (text: string, record: any) => renderEditableCell(
                record, 'flightNumber',
                <Text style={{ fontSize: 11, cursor: 'text' }}>{text || '-'}</Text>
            )
        },
        {
            title: 'PAX',
            key: 'pax',
            width: 60,
            render: (_: any, record: any) => {
                const adults = record.adults || record.passengers || 0;
                const children = record.children || 0;
                const infants = record.infants || 0;
                const total = adults + children + infants;
                const parts: string[] = [];
                if (adults > 0) parts.push(`${adults}Y`);
                if (children > 0) parts.push(`${children}Ç`);
                if (infants > 0) parts.push(`${infants}B`);
                return renderEditableCell(record, 'adults',
                    <div style={{ cursor: 'text' }}>
                        <Text strong style={{ fontSize: 12, display: 'block' }}>{total || '-'}</Text>
                        {(children > 0 || infants > 0) && (
                            <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>{parts.join('+')}</span>
                        )}
                    </div>,
                    <Input size="small" type="number" autoFocus min={1}
                        defaultValue={adults || 1}
                        onBlur={(e) => saveCellEdit(record.id, 'adults', e.target.value)}
                        onPressEnter={(e) => saveCellEdit(record.id, 'adults', (e.target as HTMLInputElement).value)}
                        style={{ width: 50 }}
                    />
                );
            }
        },
        {
            title: 'ALIŞ YERİ',
            key: 'pickup',
            width: 180,
            render: (_: any, record: any) => {
                const loc = record.pickup?.rawLocation || record.pickup?.location || record.pickupLocation || '—';
                return renderEditableCell(record, 'pickup',
                    <Text ellipsis={{ tooltip: loc }} style={{ fontSize: 11, maxWidth: 165, cursor: 'text' }}>
                        <EnvironmentOutlined style={{ color: '#16a34a', marginRight: 3, fontSize: 10 }} />{loc}
                    </Text>
                );
            }
        },
        {
            title: 'BIRAKIŞ YERİ',
            key: 'dropoff',
            width: 180,
            render: (_: any, record: any) => {
                const loc = record.dropoff?.rawLocation || record.dropoff?.location || record.dropoffLocation || '—';
                return renderEditableCell(record, 'dropoff',
                    <Text ellipsis={{ tooltip: loc }} style={{ fontSize: 11, maxWidth: 165, cursor: 'text' }}>
                        <EnvironmentOutlined style={{ color: '#dc2626', marginRight: 3, fontSize: 10 }} />{loc}
                    </Text>
                );
            }
        },
        {
            title: 'EKSTRA',
            key: 'extraServices',
            width: 110,
            render: (_: any, record: any) => {
                const services = record.metadata?.extraServices || [];
                if (!services.length) return <Text type="secondary" style={{fontSize: 10}}>-</Text>;
                return (
                    <Popover
                        content={
                            <Space direction="vertical" size={2}>
                                {services.map((s:any, idx:number) => (
                                   <div key={idx} style={{ fontSize: 11, background: '#f8fafc', padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                                      {s.quantity}x {s.name}
                                   </div>
                                ))}
                            </Space>
                        }
                        title="Ekstra Hizmetler"
                    >
                        <Tag color="purple" style={{ fontSize: 10, margin: 0, cursor: 'pointer' }}>
                            {services.length} hizmet
                        </Tag>
                    </Popover>
                );
            }
        },
        {
            title: 'İŞLEM',
            key: 'actions',
            width: 140,
            render: (_: any, record: any) => {
                const isPayInVehicle = record.metadata?.paymentMethod === 'PAY_IN_VEHICLE';
                const isAgencyBooking = !!record.agencyId;
                const isCompleted = record.status === 'COMPLETED';
                const isCancelled = record.status === 'CANCELLED';
                const isInOperation = record.operationalStatus === 'IN_OPERATION' || record.metadata?.operationalStatus === 'IN_OPERATION';

                if (isCompleted || isCancelled) {
                    return (
                        <Tag color={isCompleted ? 'success' : 'error'} style={{ fontSize: 11 }}>
                            {isCompleted ? '✅ Tamamlandı' : '❌ İptal'}
                        </Tag>
                    );
                }

                return (
                    <Space direction="vertical" size={2}>
                        {isAgencyBooking && isPayInVehicle && (
                            <Tooltip title="Transferi tamamla">
                                <Button
                                    type="primary"
                                    size="small"
                                    style={{
                                        background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                                        border: 'none', fontSize: 10, fontWeight: 600, padding: '2px 8px'
                                    }}
                                    onClick={() => handleOpenCompleteModal(record)}
                                >
                                    💵 Tamamla
                                </Button>
                            </Tooltip>
                        )}
                        <Tooltip title="Rezervasyona geri al">
                            <Button
                                size="small"
                                danger
                                style={{ fontSize: 9, fontWeight: 600, borderRadius: 4, padding: '2px 6px' }}
                                onClick={() => setReturnModal({ booking: record, reason: '' })}
                            >
                                ↩ Geri Al
                            </Button>
                        </Tooltip>
                    </Space>
                );
            }
        },
    ];

    // Column config stores only METADATA (key, width, title, order) - NOT render functions
    // This prevents stale closure issues with drivers/vehicles state
    type ColConfig = { key: string; width?: number; title?: string };
    const [columnConfig, setColumnConfig] = useState<ColConfig[]>(
        defaultColumns.map(c => ({ key: c.key, width: c.width, title: c.title }))
    );
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [tempColumns, setTempColumns] = useState<ColConfig[]>([]);
    const [tempHiddenColumns, setTempHiddenColumns] = useState<Set<string>>(new Set());

    // Merge column config with fresh render functions from defaultColumns
    const columns = React.useMemo(() => {
        return columnConfig
            .filter(cfg => !hiddenColumns.has(cfg.key))
            .map(cfg => {
                const def = defaultColumns.find(d => d.key === cfg.key);
                if (!def) return null;
                return {
                    ...def,
                    width: cfg.width ?? def.width,
                    title: cfg.title ?? def.title,
                };
            }).filter(Boolean);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [columnConfig, drivers, vehicles, hiddenColumns, editingHeaderKey, editingHeaderValue]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 1,
            },
        })
    );

    // Initialize Columns from LocalStorage
    useEffect(() => {
        const savedColumns = localStorage.getItem('operationsTableColumns');
        if (savedColumns) {
            try {
                const parsed: ColConfig[] = JSON.parse(savedColumns);
                // Restore order & width from saved config
                const orderedKeys = parsed.map(p => p.key);
                const allKeys = defaultColumns.map(c => c.key);
                // Add new default columns not in saved storage
                const newKeys = allKeys.filter(k => !orderedKeys.includes(k));
                const finalConfig = [
                    ...parsed.filter(p => allKeys.includes(p.key)),
                    ...newKeys.map(k => {
                        const def = defaultColumns.find(c => c.key === k)!;
                        return { key: k, width: def.width, title: def.title };
                    })
                ];
                setColumnConfig(finalConfig);
            } catch (e) {
                console.error('Failed to parse saved columns', e);
            }
        }
    }, []);

    const fetchBookings = async () => {
        setLoading(true);
        try {
            const response = await apiClient.get('/api/transfer/bookings');
            if (response.data.success) {
                let data = response.data.data;

                // MOCKDATA: Enrich data with missing fields for UI demo
                data = data.map((item: any) => {
                    // Fix Backend Format Mismatch (Backend returns string, UI expects object or check)
                    const pickupVal = typeof item.pickup === 'string' ? item.pickup : (item.pickup?.location || '');
                    const dropoffVal = typeof item.dropoff === 'string' ? item.dropoff : (item.dropoff?.location || '');

                    // Infer Direction
                    let direction = 'Ara';
                    const p = pickupVal.toLowerCase();
                    const d = dropoffVal.toLowerCase();
                    if (p.includes('havaliman') || p.includes('airport')) direction = 'Geliş'; // Airport -> City
                    else if (d.includes('havaliman') || d.includes('airport')) direction = 'Gidiş'; // City -> Airport

                    // Detect shuttle/shared transfer type
                    const vtLower = (item.vehicleType || '').toLowerCase();
                    const isShuttle = vtLower.includes('shuttle')
                        || vtLower.includes('paylaşımlı')
                        || vtLower.includes('paylaşım')
                        || vtLower.includes('shared')
                        || vtLower.includes('mercedes sprinter')
                        || vtLower.includes('minibüs')
                        || vtLower.includes('minibus');

                    // Skip processing this if it's strictly PENDING. We filter them out below, but for clarity:
                    // we'll let it process then filter.

                    return {
                        ...item,
                        // Ensure UI components get the expected object structure
                        pickup: typeof item.pickup === 'string' ? { location: item.pickup, rawLocation: item.pickup } : item.pickup,
                        dropoff: typeof item.dropoff === 'string' ? { location: item.dropoff, rawLocation: item.dropoff } : item.dropoff,
                        direction,
                        transferType: isShuttle ? 'SHUTTLE' : 'PRIVATE',
                        driverName: 'Atanmadı',
                        plateNumber: '-',
                        passport: '-',
                        uetds: 'Gönderilmedi',
                        agencyNote: item.notes || item.metadata?.agencyNotes || '',
                        pax: item.adults || (item.vehicle?.pax) || 1,
                        vehicleId: item.assignedVehicleId || item.metadata?.vehicleId || null,
                        assignedVehicleId: item.assignedVehicleId || item.metadata?.vehicleId || null,
                        // Fix customer name mapping
                        contactName: item.contactName || item.customer?.name || item.passengerName || '',
                        // Fix agency name mapping
                        agencyName: item.agencyName || item.agency?.name || item.partnerName || (item.agencyId ? `Acente#${item.agencyId.slice(-4)}` : null),
                        customer: {
                            ...item.customer,
                            name: item.contactName || item.customer?.name || item.passengerName || '',
                            phone: item.passengerPhone || item.contactPhone || item.customer?.phone || '-'
                        }
                    };
                });

                // Apply Frontend Filters
                // Date Filter (Client-side)
                if (filters.dateRange && filters.dateRange[0] && filters.dateRange[1]) {
                    const start = filters.dateRange[0].startOf('day');
                    const end = filters.dateRange[1].endOf('day');
                    data = data.filter((i: any) => {
                        const date = dayjs(i.pickupDateTime);
                        return (date.isAfter(start) || date.isSame(start)) && (date.isBefore(end) || date.isSame(end));
                    });
                }

                // NEW: Exclude PENDING bookings (they haven't been confirmed onto operations yet)
                data = data.filter((i: any) => i.status !== 'PENDING');

                if (filters.transferType !== 'ALL') {
                    data = data.filter((i: any) => i.transferType === filters.transferType);
                }
                if (filters.direction !== 'ALL') {
                    data = data.filter((i: any) => i.direction === (filters.direction === 'DEPARTURE' ? 'Gidiş' : filters.direction === 'ARRIVAL' ? 'Geliş' : 'Ara'));
                }
                if (filters.pickup && filters.pickup.trim() !== '') {
                    const search = filters.pickup.toLowerCase().trim();
                    data = data.filter((i: any) => {
                        const loc = (i.pickup?.rawLocation || i.pickup?.location || i.pickupLocation || '').toLowerCase();
                        return loc.includes(search);
                    });
                }
                if (filters.dropoff && filters.dropoff.trim() !== '') {
                    const search = filters.dropoff.toLowerCase().trim();
                    data = data.filter((i: any) => {
                        const loc = (i.dropoff?.rawLocation || i.dropoff?.location || i.dropoffLocation || '').toLowerCase();
                        return loc.includes(search);
                    });
                }

                setBookings(data);
            } else {
                message.error('Veriler alınamadı');
            }
        } catch (error) {
            console.error('Fetch error:', error);
            message.error('Bağlantı hatası');
        } finally {
            setLoading(false);
        }
    };

    // Load colors from API on mount
    useEffect(() => {
        const loadPreferences = async () => {
            try {
                const res = await apiClient.get('/api/auth/metadata');
                const prefs = res.data?.data?.operations_preferences || {};
                if (prefs.statusColors) {
                    setStatusColors({ ...DEFAULT_COLORS, ...prefs.statusColors });
                }
                if (prefs.airportColors) {
                    setAirportColors(prefs.airportColors);
                }
            } catch (e) {
                console.error('Failed to load color preferences:', e);
            }
        };
        loadPreferences();
    }, []);

    useEffect(() => {
        fetchBookings();
    }, [filters.transferType, filters.direction]); // Re-fetch/filter when filters change

    // Listeners for Real-Time Updates
    useEffect(() => {
        if (!socket) return;

        const handleStatusUpdate = (data: { bookingId: string, status: string, driverId?: string }) => {
            setBookings(prev => prev.map(b =>
                b.id === data.bookingId
                    ? { ...b, status: data.status, driverId: data.driverId || b.driverId }
                    : b
            ));
        };

        const handleNewBooking = () => {
            // Trigger a re-fetch to ensure all nested relations (customer, metadata) are complete
            fetchBookings();
            fetchShuttleRuns(true);
        };

        const handleShuttleRunsUpdated = () => {
            if (Date.now() - shuttleActionTimeRef.current < 2500) {
                return; // Ignore echo from our own optimistic update
            }
            // Re-fetch without showing loading spinner
            fetchShuttleRuns(true);
        };

        const handleAcknowledged = () => {
            fetchShuttleRuns(true);
        };

        const handlePaymentUpdate = (data: { bookingId: string, paymentStatus: string }) => {
            // Update private bookings list
            setBookings(prev => prev.map(b =>
                b.id === data.bookingId
                    ? { ...b, paymentStatus: data.paymentStatus }
                    : b
            ));
            // Also refresh shuttle runs to reflect payment changes
            fetchShuttleRuns(true);
        };

        socket.on('booking_status_update', handleStatusUpdate);
        socket.on('new_booking', handleNewBooking);
        socket.on('shuttle_runs_updated', handleShuttleRunsUpdated);
        socket.on('booking_acknowledged', handleAcknowledged);
        socket.on('booking_payment_update', handlePaymentUpdate);

        return () => {
            socket.off('booking_status_update', handleStatusUpdate);
            socket.off('new_booking', handleNewBooking);
            socket.off('shuttle_runs_updated', handleShuttleRunsUpdated);
            socket.off('booking_acknowledged', handleAcknowledged);
            socket.off('booking_payment_update', handlePaymentUpdate);
        };
    }, [socket, filters.transferType, filters.direction]);

    const handleResize = (index: number) => (_e: any, { size }: any) => {
        const newColumns = [...columnConfig];
        newColumns[index] = {
            ...newColumns[index],
            width: size.width,
        };
        setColumnConfig(newColumns);
    };

    // Save Columns to LocalStorage
    const saveLayout = () => {
        // Save columnConfig (already has key/width/title, no nulls)
        localStorage.setItem('operationsTableColumns', JSON.stringify(columnConfig));
        message.success('Görünüm, başlıklar ve sıralama kaydedildi');
    };

    // Reset Layout
    const resetLayout = () => {
        localStorage.removeItem('operationsTableColumns');
        setColumnConfig(defaultColumns.map(c => ({ key: c.key, width: c.width, title: c.title })));
        message.info('Görünüm sıfırlandı');
    };

    // Handle Edit Modal Open
    const openEditModal = () => {
        setTempColumns([...columnConfig]); // Copy current config
        setTempHiddenColumns(new Set(hiddenColumns));
        setEditModalVisible(true);
    };

    // Handle Title Change in Modal
    const handleTitleChange = (key: string, newTitle: string) => {
        setTempColumns(prev => prev.map(col => col.key === key ? { ...col, title: newTitle } : col));
    };

    const handleVisibilityChange = (key: string, checked: boolean) => {
        setTempHiddenColumns(prev => {
            const next = new Set(prev);
            if (checked) next.delete(key); else next.add(key);
            return next;
        });
    };

    const fetchVehicles = async () => {
        try {
            const res = await apiClient.get('/api/vehicles');
            if (res.data.success) {
                setVehicles(res.data.data);
            }
        } catch (error) {
            console.error('Error fetching vehicles:', error);
        }
    };

    const fetchDrivers = async () => {
        try {
            const res = await apiClient.get('/api/personnel');
            if (res.data.success) {
                // Filter driver personnel - jobTitle keyword OR roleCode/isDriver flag
                const DRIVER_KEYWORDS = ['driver', 'şöför', 'sofor', 'sürücü', 'surucü', 'surücu', 'şoför', 'soför'];
                const driverList = res.data.data.filter((p: any) => {
                    const title = (p.jobTitle || '').toLowerCase().trim();
                    const byTitle = DRIVER_KEYWORDS.some(kw => title.includes(kw));
                    const byRole = p.roleCode === 'DRIVER' || p.user?.roleCode === 'DRIVER' || p.isDriver === true;
                    return byTitle || byRole;
                });
                setDrivers(driverList);
            }
        } catch (error) {
            console.error('Error fetching drivers:', error);
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await apiClient.get('/api/tenant/info');
            if (res.data?.success) {
                const tenant = res.data.data?.tenant || {};
                const settings = tenant.settings || {};
                const defs = settings.definitions || {};
                
                let defCur = tenant.currency || 'EUR';
                
                if (defs.currencies && Array.isArray(defs.currencies) && defs.currencies.length > 0) {
                    setCurrencies(defs.currencies);
                    const d = defs.currencies.find((c: any) => c.isDefault);
                    if (d) defCur = d.code;
                } else if (tenant.currency) {
                    setCurrencies([{ code: tenant.currency, symbol: '' }]);
                }

                setDefaultCurrency(defCur);
            }
        } catch (e) {
            console.error('Settings fetch error:', e);
            // Fallback for UI robustness only if fetch fails completely
            if (currencies.length === 0) {
                setCurrencies([{ code: 'EUR' }, { code: 'TRY' }, { code: 'USD' }, { code: 'GBP' }]);
            }
        }
    };

    useEffect(() => {
        fetchVehicles();
        fetchDrivers();
        fetchSettings();
    }, []);

    const doAssign = async (bookingId: string, payload: any) => {
        return apiClient.patch(`/api/transfer/bookings/${bookingId}`, payload);
    };

    const handleConflictResponse = (err: any, onForceAssign: () => void, label: string) => {
        if (err?.response?.status === 409) {
            const d = err.response.data;
            const freeAtStr = d.freeAt ? new Date(d.freeAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '?';
            const startStr = d.conflictStart ? new Date(d.conflictStart).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '?';
            setConflictModal({
                visible: true,
                message: d.error || 'Çakışma tespit edildi',
                conflictWith: d.conflictWith || '',
                conflictPickup: d.conflictPickup || '',
                conflictDropoff: d.conflictDropoff || '',
                conflictStart: startStr,
                freeAt: freeAtStr,
                onForceAssign
            });
        } else {
            message.error(`${label} atanamadı`);
        }
    };

    const handleVehicleChange = async (bookingId: string, vehicleId: string | null) => {
        const selectedVehicle = vehicleId ? vehicles.find((v: any) => v.id === vehicleId) : null;
        const autoDriverId = selectedVehicle?.driverId || null;

        const doSave = async (skip = false) => {
            shuttleActionTimeRef.current = Date.now();
            const payload: any = { assignedVehicleId: vehicleId || null, skipConflictCheck: skip };
            if (autoDriverId) payload.driverId = autoDriverId;
            await doAssign(bookingId, payload);
            setBookings(prev => prev.map((b: any) =>
                b.id === bookingId
                    ? { ...b, assignedVehicleId: vehicleId || null, vehicleId: vehicleId || null, ...(autoDriverId ? { driverId: autoDriverId } : {}) }
                    : b
            ));
            if (autoDriverId) {
                const driver = drivers.find((d: any) => (d.user?.id || d.id) === autoDriverId);
                message.success(`Araç atandı${driver ? ` — Şöför: ${driver.firstName} ${driver.lastName}` : ''}`);
            } else {
                message.success('Araç ataması güncellendi');
            }
            setConflictModal(null);
        };

        try {
            await doSave(false);
        } catch (err: any) {
            handleConflictResponse(err, () => doSave(true), 'Araç');
        }
    };

    const handleDriverChange = async (bookingId: string, driverId: string | null) => {
        // Match against both userId and personnelId since vehicle management may store either
        const selectedPersonnel = driverId ? drivers.find((d: any) => (d.user?.id || d.id) === driverId) : null;
        const personnelId = selectedPersonnel?.id || null;
        const cleanId = (id?: string | null) => id ? id.replace(/[-\s]/g, '').toLowerCase() : '';
        const targetUserId = driverId ? cleanId(driverId) : null;
        const targetStaffId = personnelId ? cleanId(personnelId) : null;

        const autoVehicle = driverId ? vehicles.find((v: any) => {
            const vDriver = cleanId(v.driverId);
            return (targetUserId && vDriver === targetUserId) || (targetStaffId && vDriver === targetStaffId);
        }) : null;
        const autoVehicleId = autoVehicle?.id || null;

        const doSave = async (skip = false) => {
            shuttleActionTimeRef.current = Date.now();
            const payload: any = { driverId: driverId || null, skipConflictCheck: skip };
            if (autoVehicleId) payload.assignedVehicleId = autoVehicleId;
            const res = await doAssign(bookingId, payload);
            const updatedBooking = res?.data?.data || res?.data;
            // Immediately update state from response
            setBookings((prev: any[]) => prev.map((b: any) =>
                b.id === bookingId
                    ? {
                        ...b,
                        driverId: driverId || null,
                        assignedVehicleId: autoVehicleId || (updatedBooking?.metadata?.assignedVehicleId ?? b.assignedVehicleId),
                        vehicleId: autoVehicleId || (updatedBooking?.metadata?.assignedVehicleId ?? b.vehicleId),
                      }
                    : b
            ));
            if (autoVehicleId) {
                message.success(`Şöför atandı — Araç: ${autoVehicle.plateNumber} otomatik seçildi`);
            } else {
                message.success('Şöför ataması güncellendi');
            }
            setConflictModal(null);
            fetchBookings();
        };

        try {
            await doSave(false);
        } catch (err: any) {
            handleConflictResponse(err, () => doSave(true), 'Şöför');
        }
    };

    const handleAISuggest = async (bookingId: string) => {
        setAiModal({ visible: true, loading: true, bookingId, suggestion: null });
        try {
            const res = await apiClient.post('/api/operations/ai-suggest', { bookingId });
            setAiModal(prev => prev ? { ...prev, loading: false, suggestion: res.data.data } : null);
        } catch (err: any) {
            message.error('AI önerisi alınamadı: ' + (err?.response?.data?.error || err.message));
            setAiModal(null);
        }
    };

    const applyAISuggestion = async () => {
        if (!aiModal?.suggestion || !aiModal.bookingId) return;
        const s = aiModal.suggestion;
        if (s.suggestedDriverId) await handleDriverChange(aiModal.bookingId, s.suggestedDriverId);
        if (s.suggestedVehicleId && !s.suggestedDriverId) await handleVehicleChange(aiModal.bookingId, s.suggestedVehicleId);
        setAiModal(null);
        message.success('AI önerisi uygulandı!');
    };

    // Save Edited Titles
    const saveColumnTitles = () => {
        setColumnConfig(tempColumns); // tempColumns is ColConfig[]
        setHiddenColumns(tempHiddenColumns);
        localStorage.setItem('operationsHiddenColumns', JSON.stringify([...tempHiddenColumns]));
        setEditModalVisible(false);
        message.success('Başlıklar ve görünürlük güncellendi. Kalıcı olması için "Görünümü Kaydet"e basınız.');
    };

    // Color modal handlers
    const openColorModal = () => {
        // Merge current statusColors with DEFAULT_COLORS to ensure all keys exist
        const mergedColors = { ...DEFAULT_COLORS, ...statusColors };
        console.log('Opening color modal with colors:', mergedColors);
        setTempColors(mergedColors);
        setColorModalVisible(true);
    };
    const saveColors = async () => {
        try {
            // Sync OPERASYONDA with IN_OPERATION
            const syncedColors = {
                ...tempColors,
                OPERASYONDA: tempColors.IN_OPERATION || tempColors.OPERASYONDA
            };
            console.log('Saving colors:', syncedColors);
            const res = await apiClient.get('/api/auth/metadata');
            const currentMeta = res.data?.data || {};
            const currentPrefs = currentMeta.operations_preferences || {};
            const newPrefs = { 
                ...currentPrefs, 
                statusColors: syncedColors 
            };
            await apiClient.put('/api/auth/metadata', { 
                preferences: { operations_preferences: newPrefs } 
            });
            console.log('Colors saved successfully');
            setStatusColors(syncedColors);
            setColorModalVisible(false);
            message.success('Renkler kaydedildi - Sayfa yenileniyor...');
            setTimeout(() => window.location.reload(), 1000);
        } catch (e) {
            console.error('Save colors error:', e);
            message.error('Kaydetme başarısız');
        }
    };
    const resetColors = async () => {
        try {
            const res = await apiClient.get('/api/auth/metadata');
            const currentMeta = res.data?.data || {};
            const currentPrefs = currentMeta.operations_preferences || {};
            const newPrefs = { 
                ...currentPrefs, 
                statusColors: DEFAULT_COLORS 
            };
            await apiClient.put('/api/auth/metadata', { 
                preferences: { operations_preferences: newPrefs } 
            });
            setTempColors(DEFAULT_COLORS);
            setStatusColors(DEFAULT_COLORS);
            message.success('Renkler varsayılana döndürüldü - Sayfa yenileniyor...');
            setTimeout(() => window.location.reload(), 1000);
        } catch (e) {
            console.error('Reset colors error:', e);
            setTempColors(DEFAULT_COLORS);
            message.error('Sıfırlama başarısız');
        }
    };

    // Airport color handler
    const handleAirportColorChange = async (airportCode: string, color: string) => {
        try {
            const newColors = { ...airportColors, [airportCode]: color };
            const res = await apiClient.get('/api/auth/metadata');
            const currentMeta = res.data?.data || {};
            const currentPrefs = currentMeta.operations_preferences || {};
            const newPrefs = { 
                ...currentPrefs, 
                airportColors: newColors 
            };
            await apiClient.put('/api/auth/metadata', { 
                preferences: { operations_preferences: newPrefs } 
            });
            setAirportColors(newColors);
            message.success(`${airportCode} rengi güncellendi`);
        } catch (e) {
            console.error('Save airport color error:', e);
            message.error('Kaydetme başarısız');
        }
    };

    // Row order handler
    const handleRowOrderChange = (newOrder: string[]) => {
        localStorage.setItem('operationsRowOrder', JSON.stringify(newOrder));
    };
    
    // Location modal handler
    const handleOpenLocationModal = (location: string, name: string) => {
        setMapModal({ name, pickup: location });
    };

    // Determine row background color based on booking status
    const getRowColor = (record: any): string | undefined => {
        const opStatus = record.operationalStatus as string | undefined;
        const status = record.status as string | undefined;
        // Prefer operational sub-status over main status
        if (opStatus && statusColors[opStatus]) return statusColors[opStatus];
        if (status && statusColors[status]) return statusColors[status];
        return undefined;
    };


    // Message Modal State
    const [messageModalVisible, setMessageModalVisible] = useState(false);
    const [messageLoading, setMessageLoading] = useState(false);
    const [messageContent, setMessageContent] = useState('');
    const [selectedDriver, setSelectedDriver] = useState<{ id: string, name: string } | null>(null);

    const handleOpenMessageModal = (driverId: string) => {
        const driver = drivers.find((d: any) => d.user?.id === driverId || d.id === driverId);
        if (driver) {
            setSelectedDriver({ id: driverId, name: `${driver.firstName} ${driver.lastName}` });
            setMessageModalVisible(true);
        }
    };

    const handleSendMessage = async () => {
        if (!selectedDriver || !messageContent.trim()) return;

        setMessageLoading(true);
        try {
            const res = await apiClient.post('/api/messages', {
                receiverId: selectedDriver.id,
                content: messageContent,
                format: 'TEXT'
            });
            if (res.data.success) {
                message.success('Mesaj gönderildi');
                setMessageModalVisible(false);
                setMessageContent('');
            }
        } catch (error) {
            console.error('Message send error:', error);
            message.error('Mesaj giderilemedi');
        } finally {
            setMessageLoading(false);
        }
    };

    // ---- Operations Mode (Private / Shuttle) ----
    const [operationsMode, setOperationsMode] = useState<'private' | 'shuttle' | 'completed'>('private');

    // Sync mode change → automatically update the transferType filter
    const handleModeChange = (mode: 'private' | 'shuttle' | 'completed') => {
        setOperationsMode(mode);
        if (mode === 'private') {
            setFilters(prev => ({ ...prev, transferType: 'PRIVATE' }));
        }
        if (mode === 'completed') {
            fetchCompletedBookings();
        }
    };

    // ---- SHUTTLE-SPECIFIC COLUMN CONFIG (completely separate from private) ----
    type ShuttleColCfg = { key: string; width: number; label: string; hidden: boolean };
    const SHUTTLE_DEFAULT_COLS: ShuttleColCfg[] = [
        { key: 'sort',       width: 40,  label: 'SIRA',           hidden: false },
        { key: 'index',      width: 36,  label: '#',              hidden: false },
        { key: 'customer',   width: 200, label: 'MÜŞTERİ',         hidden: false },
        { key: 'pickupTime', width: 80,  label: 'ALIŞ SAATİ',      hidden: false },
        { key: 'pickup',     width: 220, label: 'ALIŞ NOKTASI',    hidden: false },
        { key: 'flight',     width: 130, label: 'UÇUŞ',            hidden: false },
        { key: 'payment',    width: 90,  label: 'ÖDEME',           hidden: false },
        { key: 'pax',        width: 50,  label: 'PAX',            hidden: false },
        { key: 'phone',      width: 140, label: 'TELEFON',        hidden: false },
        { key: 'extras',     width: 160, label: 'EKSTRA HİZMET',   hidden: false },
        { key: 'status',     width: 100, label: 'DURUM',          hidden: false },
    ];
    const [shuttleCols, setShuttleCols] = useState<ShuttleColCfg[]>(SHUTTLE_DEFAULT_COLS);
    const [shuttleColEditVisible, setShuttleColEditVisible] = useState(false);
    const [tempShuttleCols, setTempShuttleCols] = useState<ShuttleColCfg[]>([]);

    // Load shuttle cols from API on mount
    useEffect(() => {
        const loadShuttleCols = async () => {
            try {
                const res = await apiClient.get('/api/auth/metadata');
                const prefs = res.data?.data?.shuttle_preferences || {};
                if (prefs.shuttleCols && Array.isArray(prefs.shuttleCols) && prefs.shuttleCols.length) {
                    // Merge saved with defaults to pick up any new columns
                    const saved = prefs.shuttleCols as ShuttleColCfg[];
                    const merged = saved.map((s: ShuttleColCfg) => {
                        const def = SHUTTLE_DEFAULT_COLS.find(d => d.key === s.key);
                        return def ? { ...def, width: s.width, label: s.label, hidden: s.hidden } : s;
                    });
                    // Add any new default cols not in saved
                    for (const def of SHUTTLE_DEFAULT_COLS) {
                        if (!merged.find((m: ShuttleColCfg) => m.key === def.key)) {
                            merged.push(def);
                        }
                    }
                    setShuttleCols(merged);
                }
            } catch (e) {
                console.error('Failed to load shuttle col preferences:', e);
            }
        };
        loadShuttleCols();
    }, []);

    const saveShuttleColsToAPI = async (cols: ShuttleColCfg[]) => {
        try {
            const res = await apiClient.get('/api/auth/metadata');
            const currentMeta = res.data?.data || {};
            const currentPrefs = currentMeta.shuttle_preferences || {};
            const newPrefs = { ...currentPrefs, shuttleCols: cols };
            await apiClient.put('/api/auth/metadata', {
                preferences: { shuttle_preferences: newPrefs }
            });
        } catch (e) {
            console.error('Failed to save shuttle col preferences:', e);
        }
    };

    const saveShuttleCols = async () => {
        setShuttleCols(tempShuttleCols);
        setShuttleColEditVisible(false);
        await saveShuttleColsToAPI(tempShuttleCols);
        message.success('Shuttle sütunları kaydedildi');
    };
    const resetShuttleCols = () => setTempShuttleCols(SHUTTLE_DEFAULT_COLS.map(c => ({...c})));
    const resizeShuttleCol = (key: string, newWidth: number) => {
        setShuttleCols(prev => prev.map(c => c.key === key ? { ...c, width: Math.max(30, newWidth) } : c));
    };
    const toggleShuttleCol = (key: string) => {
        setShuttleCols(prev => prev.map(c => c.key === key ? { ...c, hidden: !c.hidden } : c));
    };
    const saveShuttleColWidths = async () => {
        await saveShuttleColsToAPI(shuttleCols);
        message.success('Shuttle sütun genişlikleri kaydedildi');
    };

    // ---- SHUTTLE STATUS COLORS (separate from private) ----
    const SHUTTLE_DEFAULT_COLORS: Record<string,string> = {
        PENDING: '#fffbeb', CONFIRMED: '#f0fdf4', COMPLETED: '#ecfdf5', CANCELLED: '#fff1f0'
    };
    const [shuttleColors, setShuttleColors] = useState<Record<string,string>>(() => {
        try { return { ...SHUTTLE_DEFAULT_COLORS, ...JSON.parse(localStorage.getItem('shuttleStatusColors') || '{}') }; }
        catch { return SHUTTLE_DEFAULT_COLORS; }
    });
    const [shuttleColorVisible, setShuttleColorVisible] = useState(false);
    const [tempShuttleColors, setTempShuttleColors] = useState<Record<string,string>>({...SHUTTLE_DEFAULT_COLORS});
    const saveShuttleColors = () => {
        localStorage.setItem('shuttleStatusColors', JSON.stringify(tempShuttleColors));
        setShuttleColors(tempShuttleColors);
        setShuttleColorVisible(false);
        message.success('Shuttle renkleri kaydedildi');
    };

    // ---- SHUTTLE PICKUP TIME EDIT ----
    const [editingPickupTime, setEditingPickupTime] = useState<{ bookingId: string; value: string } | null>(null);
    const handlePickupTimeEdit = async (bookingId: string, newTime: string) => {
        try {
            await apiClient.put(`/api/transfer/bookings/${bookingId}`, { pickupDateTime: newTime });
            setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, pickupDateTime: newTime } : b));
            // Also update shuttle runs
            setShuttleRuns(prev => prev.map(r => ({
                ...r,
                bookings: r.bookings.map((b: any) => b.id === bookingId ? { ...b, pickupDateTime: newTime } : b)
            })));
            setEditingPickupTime(null);
            message.success('Alınış saati güncellendi');
        } catch (e) {
            console.error('Update pickup time error:', e);
            message.error('Güncelleme başarısız');
        }
    };

    // ---- SEFER DÜZENLE MODAL ----
    const [editRunModal, setEditRunModal] = useState<{ run: any; time: string; name: string } | null>(null);
    const handleEditRunSave = async () => {
        if (!editRunModal) return;
        try {
            const bookingIds = editRunModal.run.bookings.map((b: any) => b.id);
            await apiClient.patch('/api/operations/shuttle-runs/update', {
                runKey: editRunModal.run.runKey,
                departureTime: editRunModal.time,
                routeName: editRunModal.name,
                bookingIds,
            });
            // Optimistic UI update
            setShuttleRuns(prev => prev.map(r => {
                if (r.runKey !== editRunModal.run.runKey) return r;
                return { ...r, departureTime: editRunModal.time, routeName: editRunModal.name, toName: editRunModal.name };
            }));
            setEditRunModal(null);
            message.success('Sefer güncellendi ve kaydedildi');
            // Refresh to get latest data
            fetchShuttleRuns(true);
        } catch (e: any) {
            console.error('Edit run save error:', e);
            message.error('Sefer güncelleme başarısız: ' + (e?.response?.data?.error || e.message));
        }
    };

    // ---- HARİTA MODAL ----
    const [mapModal, setMapModal] = useState<{ name: string; pickup: string; lat?: number; lng?: number } | null>(null);

    // ---- Shuttle Runs State ----
    const [shuttleRuns, setShuttleRuns] = useState<any[]>([]);
    const [shuttleRunsLoading, setShuttleRunsLoading] = useState(false);
    const [expandedRunKeys, setExpandedRunKeys] = useState<string[]>([]);
    const [persistedManualRuns, setPersistedManualRuns] = useState<any[]>([]);

    // Load persisted runs safely on client-side only to prevent Hydration Mismatch
    useEffect(() => {
        try {
            const saved = localStorage.getItem('shuttlePersistedManualRuns');
            if (saved) setPersistedManualRuns(JSON.parse(saved));
        } catch(e) {}
    }, []);

    useEffect(() => {
        localStorage.setItem('shuttlePersistedManualRuns', JSON.stringify(persistedManualRuns));
    }, [persistedManualRuns]);

    const fetchShuttleRuns = async (silent = false) => {
        if (!silent) setShuttleRunsLoading(true);
        try {
            const date = filters.dateRange[0].format('YYYY-MM-DD');
            const res = await apiClient.get(`/api/operations/shuttle-runs?date=${date}`);
            if (res.data.success) {
                const backendRuns = res.data.data;
                const date = filters.dateRange[0].format('YYYY-MM-DD');
                
                // Filter persisted manual runs to only show those for the selected date
                // and highlight only those that DON'T have backend counterparts yet
                const localManualsForDate = persistedManualRuns.filter(r => r.date === date);
                
                // Merge: if a manual run now has bookings on the backend, remove it from local
                const updatedPersisted = persistedManualRuns.filter(lp => {
                    const existsOnBackend = backendRuns.some((br: any) => br.runKey === lp.runKey);
                    return !existsOnBackend;
                });
                if (updatedPersisted.length !== persistedManualRuns.length) {
                    setPersistedManualRuns(updatedPersisted);
                }

                // Final list: backend runs + remaining empty manual runs for this date
                const finalRuns = [...backendRuns, ...localManualsForDate.filter(lp => !backendRuns.some((br: any) => br.runKey === lp.runKey))];
                finalRuns.sort((a, b) => (a.departureTime || '99:99').localeCompare(b.departureTime || '99:99'));
                
                setShuttleRuns(finalRuns);
                setExpandedRunKeys(prev => {
                    if (prev.length > 0) {
                        const newKeys = finalRuns.map((r: any) => r.runKey).filter((k: string) => !prev.includes(k));
                        if (newKeys.length > 0) return [...prev, ...newKeys];
                        return prev;
                    }
                    return finalRuns.map((r: any) => r.runKey);
                });
            }
        } catch (err) {
            console.error('Shuttle runs fetch error:', err);
            message.error('Shuttle seferleri alınamadı');
        } finally {
            setShuttleRunsLoading(false);
        }
    };

    useEffect(() => {
        if (operationsMode === 'shuttle') {
            fetchShuttleRuns();
        }
    }, [operationsMode, filters.dateRange]);

    const handleShuttleAssign = async (run: any, driverId: string | null = null, vehicleId: string | null = null) => {
        const bookingIds = run.bookings.map((b: any) => b.id);
        if (bookingIds.length === 0) return;
        try {
            shuttleActionTimeRef.current = Date.now();
            await apiClient.patch('/api/operations/shuttle-runs/assign', { bookingIds, driverId, vehicleId });
            shuttleActionTimeRef.current = Date.now();
            // Optimistic update
            setShuttleRuns(prev => prev.map(r => {
                if (r.runKey !== run.runKey) return r;
                return {
                    ...r,
                    driverId: driverId,
                    vehicleId: vehicleId,
                    bookings: r.bookings.map((b: any) => ({
                        ...b,
                        driverId: driverId,
                        assignedVehicleId: vehicleId,
                    }))
                };
            }));
            message.success(`${bookingIds.length} yolcu için atama güncellendi`);
        } catch (err: any) {
            message.error('Atama başarısız: ' + (err?.response?.data?.error || err.message));
        }
    };

    const handleShuttleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;
        const passengerId = active.id as string;
        const overId = over.id as string;

        // Find source run and passenger
        let sourceRun: any = null;
        let passenger: any = null;
        for (const run of shuttleRuns) {
            const found = run.bookings.find((b: any) => b.id === passengerId);
            if (found) {
                sourceRun = run;
                passenger = found;
                break;
            }
        }
        if (!sourceRun || !passenger) return;

        // 1. Is it a SORT action ? (within the same run)
        const isSameRun = sourceRun.bookings.some((b: any) => b.id === overId) || sourceRun.runKey === overId;
        
        if (isSameRun && active.id !== over.id) {
            // Sort logic: Identify old and new indices
            const oldIndex = sourceRun.bookings.findIndex((b: any) => b.id === active.id);
            const newIndex = sourceRun.bookings.findIndex((b: any) => b.id === overId);
            
            if (newIndex >= 0) {
                const newBookings = arrayMove(sourceRun.bookings, oldIndex, newIndex);
                
                shuttleActionTimeRef.current = Date.now();
                // Optimistic Local Update
                setShuttleRuns(prev => prev.map(r => r.runKey === sourceRun.runKey ? { ...r, bookings: newBookings } : r));

                try {
                    const sortItems = newBookings.map((b: any, idx: number) => ({ bookingId: b.id, sortOrder: idx + 1 }));
                    const res = await apiClient.post('/api/operations/shuttle-runs/sort', { items: sortItems });
                    shuttleActionTimeRef.current = Date.now();
                    if (res.data.success) message.success('Sıralama güncellendi');
                } catch (err) {
                    message.error('Sıralama kaydedilemedi');
                    fetchShuttleRuns(true); // Revert silently
                }
            }
            return;
        }

        // 2. Is it a MOVE action ? (to a different run)
        if (!isSameRun) {
            const targetRun = shuttleRuns.find(r => r.runKey === overId || r.bookings.some((b: any) => b.id === overId));
            if (!targetRun) return;

            // --- DEP vs ARV Validation ---
            const determineType = (routeStr: string) => {
                const s = (routeStr || '').toUpperCase();
                if (s.includes(' DEP')) return 'DEP';
                if (s.includes(' ARV')) return 'ARV';
                return 'TRF';
            };
            const sType = determineType(sourceRun.routeName);
            const tType = determineType(targetRun.routeName);
            
            if ((sType === 'DEP' && tType === 'ARV') || (sType === 'ARV' && tType === 'DEP')) {
                 message.error(`Hata: ${sType === 'DEP' ? 'Gidiş (DEP)' : 'Geliş (ARV)'} müşterisini ${tType === 'DEP' ? 'Gidiş (DEP)' : 'Geliş (ARV)'} seferine taşıyamazsınız!`);
                 return;
            }

            try {
                const payload: any = { bookingIds: [passengerId] };
                payload.targetRun = {
                    manualRunId: targetRun.isManual ? (targetRun.manualRunId || targetRun.runKey) : null,
                    shuttleRouteId: targetRun.isManual ? null : (targetRun.shuttleRouteId || null),
                    shuttleMasterTime: targetRun.isManual ? targetRun.departureTime : (targetRun._originalMasterTime || null),
                    manualRunName: targetRun.isManual ? targetRun.routeName : (targetRun.routeName || null)
                };
                if (targetRun.bookings && targetRun.bookings.length > 0) {
                    payload.sampleBookingId = targetRun.bookings[0].id;
                    payload.targetBookingIds = targetRun.bookings.map((b: any) => b.id);
                }

                shuttleActionTimeRef.current = Date.now();
                const res = await apiClient.post('/api/operations/shuttle-runs/move', payload);
                if (res.data.success) {
                    shuttleActionTimeRef.current = Date.now();
                    // Optimistic update: move passenger between runs locally
                    setShuttleRuns(prev => {
                        return prev.map(r => {
                            if (r.runKey === sourceRun.runKey) {
                                return { ...r, bookings: r.bookings.filter((bb: any) => bb.id !== passengerId) };
                            }
                            if (r.runKey === targetRun.runKey) {
                                return { ...r, bookings: [...r.bookings, passenger] };
                            }
                            return r;
                        });
                    });
                    message.success('Yolcu taşındı');
                }
            } catch (err: any) {
                message.error('Taşıma başarısız');
            }
        }
    };

    const handleSortPassenger = async (runKey: string, bookingId: string, direction: 'up' | 'down') => {
        const run = shuttleRuns.find(r => r.runKey === runKey);
        if (!run || !run.bookings) return;
        
        const bIndex = run.bookings.findIndex((b: any) => b.id === bookingId);
        if (bIndex < 0) return;
        if (direction === 'up' && bIndex === 0) return;
        if (direction === 'down' && bIndex === run.bookings.length - 1) return;

        const newBookings = [...run.bookings];
        const swapIndex = direction === 'up' ? bIndex - 1 : bIndex + 1;
        [newBookings[bIndex], newBookings[swapIndex]] = [newBookings[swapIndex], newBookings[bIndex]];

        // Crucial: assign sortOrder to ALL items in the run to ensure persistence
        const items = newBookings.map((b, idx) => ({ bookingId: b.id, sortOrder: idx }));

        shuttleActionTimeRef.current = Date.now();
        setShuttleRuns(prev => prev.map(r => {
            if (r.runKey !== runKey) return r;
            return { ...r, bookings: newBookings };
        }));

        try {
            await apiClient.post('/api/operations/shuttle-runs/sort', { items });
        } catch (err: any) {
            message.error('Sıralama kaydedilemedi: ' + (err?.response?.data?.error || err.message));
            fetchShuttleRuns(true);
        }
    };

    const handleDeleteManualRun = (runKey: string) => {
        const run = shuttleRuns.find(r => r.runKey === runKey);
        if (run && run.bookings && run.bookings.length > 0) {
            message.error(`Bu seferde ${run.bookings.length} yolcu var. Önce yolcuları başka bir sefere taşıyın.`);
            return;
        }
        setPersistedManualRuns(prev => prev.filter(r => r.runKey !== runKey));
        setShuttleRuns(prev => prev.filter(r => r.runKey !== runKey));
        message.success('Manuel sefer silindi');
    };

    // ---- Tab State ----
    const [bookingTab, setBookingTab] = useState<'active' | 'completed'>('active');

    // ---- Completed Operations State ----
    const [completedBookings, setCompletedBookings] = useState<any[]>([]);
    const [completedLoading, setCompletedLoading] = useState(false);
    const [completedFilters, setCompletedFilters] = useState({
        dateRange: [dayjs().subtract(7, 'day'), dayjs()] as [any, any],
        transferType: 'ALL' as string,
        agency: 'ALL' as string,
        driver: 'ALL' as string,
        vehicle: 'ALL' as string,
        search: '' as string,
    });

    const fetchCompletedBookings = async () => {
        setCompletedLoading(true);
        try {
            const response = await apiClient.get('/api/transfer/bookings');
            if (response.data.success) {
                let data = response.data.data;
                // Map + enrich
                data = data.map((item: any) => {
                    const pickupVal = typeof item.pickup === 'string' ? item.pickup : (item.pickup?.location || '');
                    const dropoffVal = typeof item.dropoff === 'string' ? item.dropoff : (item.dropoff?.location || '');
                    let direction = 'Ara';
                    const p = pickupVal.toLowerCase();
                    const d = dropoffVal.toLowerCase();
                    if (p.includes('havaliman') || p.includes('airport')) direction = 'Geliş';
                    else if (d.includes('havaliman') || d.includes('airport')) direction = 'Gidiş';
                    const vtLower = (item.vehicleType || '').toLowerCase();
                    const isShuttle = vtLower.includes('shuttle') || vtLower.includes('paylaşımlı') || vtLower.includes('paylaşım') || vtLower.includes('shared') || vtLower.includes('mercedes sprinter') || vtLower.includes('minibüs') || vtLower.includes('minibus');
                    return {
                        ...item,
                        pickup: typeof item.pickup === 'string' ? { location: item.pickup, rawLocation: item.pickup } : item.pickup,
                        dropoff: typeof item.dropoff === 'string' ? { location: item.dropoff, rawLocation: item.dropoff } : item.dropoff,
                        direction,
                        transferType: isShuttle ? 'SHUTTLE' : 'PRIVATE',
                        pax: item.adults || (item.vehicle?.pax) || 1,
                        assignedVehicleId: item.assignedVehicleId || item.metadata?.vehicleId || null,
                        contactName: item.contactName || item.customer?.name || item.passengerName || '',
                        agencyName: item.agencyName || item.agency?.name || item.partnerName || (item.agencyId ? `Acente#${item.agencyId.slice(-4)}` : null),
                        customer: {
                            ...item.customer,
                            name: item.contactName || item.customer?.name || item.passengerName || '',
                            phone: item.passengerPhone || item.contactPhone || item.customer?.phone || '-'
                        }
                    };
                });
                // Only COMPLETED
                data = data.filter((i: any) => i.status === 'COMPLETED');
                // Date filter
                if (completedFilters.dateRange[0] && completedFilters.dateRange[1]) {
                    const start = completedFilters.dateRange[0].startOf('day');
                    const end = completedFilters.dateRange[1].endOf('day');
                    data = data.filter((i: any) => {
                        const date = dayjs(i.pickupDateTime);
                        return (date.isAfter(start) || date.isSame(start)) && (date.isBefore(end) || date.isSame(end));
                    });
                }
                // Transfer type
                if (completedFilters.transferType !== 'ALL') {
                    data = data.filter((i: any) => i.transferType === completedFilters.transferType);
                }
                // Agency
                if (completedFilters.agency !== 'ALL') {
                    data = data.filter((i: any) => (i.agencyName || '') === completedFilters.agency);
                }
                // Driver
                if (completedFilters.driver !== 'ALL') {
                    data = data.filter((i: any) => i.driverId === completedFilters.driver);
                }
                // Vehicle
                if (completedFilters.vehicle !== 'ALL') {
                    data = data.filter((i: any) => i.assignedVehicleId === completedFilters.vehicle);
                }
                // Search
                if (completedFilters.search.trim()) {
                    const q = completedFilters.search.toLowerCase().trim();
                    data = data.filter((i: any) => {
                        const contactName = (i.contactName || i.customer?.name || '').toLowerCase();
                        const phone = (i.customer?.phone || '').toLowerCase();
                        const pickup = (i.pickup?.rawLocation || i.pickup?.location || '').toLowerCase();
                        const dropoff = (i.dropoff?.rawLocation || i.dropoff?.location || '').toLowerCase();
                        const bookingNum = (i.bookingNumber || '').toLowerCase();
                        return contactName.includes(q) || phone.includes(q) || pickup.includes(q) || dropoff.includes(q) || bookingNum.includes(q);
                    });
                }
                setCompletedBookings(data);
            }
        } catch (error) {
            console.error('Fetch completed bookings error:', error);
            message.error('Tamamlanan operasyonlar alınamadı');
        } finally {
            setCompletedLoading(false);
        }
    };

    useEffect(() => {
        if (operationsMode === 'completed') {
            fetchCompletedBookings();
        }
    }, [completedFilters]);

    // ---- Auto-Assign State ----
    const [autoAssignModal, setAutoAssignModal] = useState<{
        visible: boolean;
        loading: boolean;
        applying: boolean;
        proposals: any[];
        skipped: any[];
        summary: any;
        errorMsg: string;
    } | null>(null);

    const handleAutoAssign = async () => {
        const startDate = filters.dateRange[0].format('YYYY-MM-DD');
        const endDate = filters.dateRange[1].format('YYYY-MM-DD');
        setAutoAssignModal({ visible: true, loading: true, applying: false, proposals: [], skipped: [], summary: null, errorMsg: '' });
        try {
            const res = await apiClient.post('/api/operations/auto-assign', {
                startDate,
                endDate,
                applyNow: false
            });
            const d = res.data;
            setAutoAssignModal(prev => prev ? {
                ...prev,
                loading: false,
                proposals: d.proposals || [],
                skipped: d.skipped || [],
                summary: d.summary || null,
                errorMsg: d.error || ''
            } : null);
        } catch (err: any) {
            setAutoAssignModal(prev => prev ? {
                ...prev,
                loading: false,
                errorMsg: err?.response?.data?.error || err.message
            } : null);
        }
    };

    const applyAutoAssign = async () => {
        if (!autoAssignModal?.proposals?.length) return;
        setAutoAssignModal(prev => prev ? { ...prev, applying: true } : null);
        const startDate = filters.dateRange[0].format('YYYY-MM-DD');
        const endDate = filters.dateRange[1].format('YYYY-MM-DD');
        try {
            await apiClient.post('/api/operations/auto-assign', { startDate, endDate, applyNow: true });
            message.success(`${autoAssignModal.proposals.length} transfer otomatik atandı!`);
            setAutoAssignModal(null);
            fetchBookings();
        } catch (err: any) {
            message.error('Uygulama başarısız: ' + (err?.response?.data?.error || err.message));
            setAutoAssignModal(prev => prev ? { ...prev, applying: false } : null);
        }
    };

    // ---- Derived: counts and tab-filtered bookings ----
    const activeCount = bookings.filter((b: any) => b.status !== 'COMPLETED' && b.status !== 'CANCELLED').length;
    const completedCount = bookings.filter((b: any) => b.status === 'COMPLETED').length;

    return (
        <AdminGuard>
            <AdminLayout selectedKey="operations-list" fullWidth>
                <style>{`
                    /* ── Global operations page overrides ── */
                    .ant-btn-sm {
                        font-size: 12px !important;
                        border-radius: 6px !important;
                    }
                    .ant-segmented {
                        border-radius: 8px !important;
                    }
                    .ant-select-sm .ant-select-selector {
                        border-radius: 6px !important;
                    }
                    .completed-row-shuttle td {
                        background: #f0f7ff !important;
                    }
                    .completed-row-shuttle:hover td {
                        background: #dbeafe !important;
                    }
                    .completed-row-private td {
                        background: #faf5ff !important;
                    }
                    .completed-row-private:hover td {
                        background: #f3e8ff !important;
                    }
                `}</style>

                <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>

                    {/* ── FILTER BAR ── */}
                    <div style={{
                        background: 'linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)',
                        borderBottom: '1px solid #e5e7eb',
                        padding: '8px 16px',
                        flexShrink: 0,
                    }}>
                        {/* Row 1: Mode toggle + Direction tabs + action buttons */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                            <Space size={8} wrap>
                                <Segmented
                                    value={operationsMode}
                                    onChange={(v) => handleModeChange(v as 'private' | 'shuttle' | 'completed')}
                                    options={[
                                        { label: '🚗 Özel Transferler', value: 'private' },
                                        { label: '🚌 Shuttle Seferleri', value: 'shuttle' },
                                        { label: '✅ Tamamlanan Operasyonlar', value: 'completed' },
                                    ]}
                                    style={{ fontWeight: 600, fontSize: 13, background: '#f0f4ff' }}
                                />

                                {operationsMode === 'private' && [
                                    { key: 'ALL', label: 'HEPSİ' },
                                    { key: 'DEPARTURE', label: '↗ GİDİŞ' },
                                    { key: 'ARRIVAL', label: '↙ GELİŞ' },
                                    { key: 'INTER', label: '→ ARA' },
                                ].map(({ key, label }) => (
                                    <button
                                        key={key}
                                        onClick={() => setFilters({ ...filters, direction: key })}
                                        style={{
                                            padding: '5px 14px',
                                            borderRadius: 6,
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontWeight: 600,
                                            fontSize: 12,
                                            background: filters.direction === key ? '#6366f1' : '#f3f4f6',
                                            color: filters.direction === key ? '#fff' : '#374151',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {label}
                                    </button>
                                ))}

                                {operationsMode === 'private' && (
                                    <Badge count={bookings.filter((b: any) => b.status === 'PENDING').length} size="small">
                                        <Button
                                            size="small"
                                            danger
                                            type={bookings.filter((b: any) => b.status === 'PENDING').length > 0 ? 'primary' : 'default'}
                                            style={{ borderRadius: 6, fontWeight: 600, fontSize: 12 }}
                                        >
                                            ONAY BEKLEYEN
                                        </Button>
                                    </Badge>
                                )}
                            </Space>

                            <Space size={4} wrap>
                                {operationsMode === 'private' && (
                                    <Button
                                        size="small"
                                        type="primary"
                                        onClick={handleAutoAssign}
                                        style={{
                                            borderRadius: 6,
                                            fontWeight: 600,
                                            fontSize: 12,
                                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                            border: 'none'
                                        }}
                                    >
                                        ⚡ Otomatik Operasyon Yap
                                    </Button>
                                )}
                                {operationsMode === 'shuttle' && (
                                    <>
                                        <Button
                                            size="small"
                                            type="primary"
                                            icon={<PlusOutlined />}
                                            onClick={() => setIsManualModalVisible(true)}
                                            style={{ borderRadius: 6, background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', fontWeight: 600 }}
                                        >
                                            Manuel Sefer Ekle
                                        </Button>
                                        <Button
                                            size="small"
                                            icon={<ReloadOutlined />}
                                            onClick={() => fetchShuttleRuns()}
                                            loading={shuttleRunsLoading}
                                            style={{ borderRadius: 6 }}
                                        >
                                            Yenile
                                        </Button>
                                    </>
                                )}
                                {/* ===== PRIVATE MODE TOOLS ===== */}
                                {operationsMode === 'private' && (<>
                                    <Popover
                                        trigger="click"
                                        title={<span style={{ fontWeight: 700 }}>Sütun Görünürlüğü</span>}
                                        content={
                                            <div style={{ maxHeight: 340, overflowY: 'auto', width: 200 }}>
                                                {[
                                                    { key: 'index', label: '#' },
                                                    { key: 'bookingNumber', label: 'T.KOD' },
                                                    { key: 'direction', label: 'YÖN' },
                                                    { key: 'partnerName', label: 'ACENTE' },
                                                    { key: 'paymentType', label: 'ÖDEME' },
                                                    { key: 'customerNote', label: 'MÜŞTERİ NOTU' },
                                                    { key: 'internalNotes', label: 'OP. NOTU' },
                                                    { key: 'customerName', label: 'AD SOYAD' },
                                                    { key: 'contactPhone', label: 'TELEFON' },
                                                    { key: 'date', label: 'TARİH' },
                                                    { key: 'status', label: 'DURUM' },
                                                    { key: 'driver', label: 'ŞOFÖR' },
                                                    { key: 'vehicle', label: 'ARAÇ' },
                                                    { key: 'time', label: 'TRANSFER SAATİ' },
                                                    { key: 'flightTime', label: 'UÇUŞ SAATİ' },
                                                    { key: 'airportCode', label: 'IATA' },
                                                    { key: 'pickupRegionCode', label: 'ALIŞ BÖLGE' },
                                                    { key: 'dropoffRegionCode', label: 'VARIŞ BÖLGE' },
                                                    { key: 'flightCode', label: 'UÇUŞ KODU' },
                                                    { key: 'pax', label: 'PAX' },
                                                    { key: 'pickup', label: 'ALIŞ YERİ' },
                                                    { key: 'dropoff', label: 'BIRAKIŞ YERİ' },
                                                    { key: 'extraServices', label: 'EKSTRA' },
                                                    { key: 'actions', label: 'İŞLEM' },
                                                ].map(col => {
                                                    const hc = (typeof window !== 'undefined' && (window as any).getOperationsHiddenColumns?.()) || new Set();
                                                    const isHidden = hc.has(col.key);
                                                    return (
                                                        <div key={col.key} onClick={() => {
                                                            (window as any).toggleOperationsColumn?.(col.key);
                                                            // Force re-render
                                                            setHiddenColumns(prev => {
                                                                const next = new Set(prev);
                                                                if (next.has(col.key)) next.delete(col.key); else next.add(col.key);
                                                                return next;
                                                            });
                                                        }}
                                                            style={{ padding: '5px 8px', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8, background: isHidden ? '#f9fafb' : '#fff', marginBottom: 2 }}
                                                        >
                                                            {isHidden ? <EyeInvisibleOutlined style={{ color: '#9ca3af' }} /> : <EyeOutlined style={{ color: '#6366f1' }} />}
                                                            <span style={{ fontSize: 12, color: isHidden ? '#9ca3af' : '#111' }}>{col.label}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        }
                                    >
                                        <Button size="small" icon={<EyeOutlined />} style={{ borderRadius: 6 }}>Sütunlar</Button>
                                    </Popover>
                                    <Button size="small" icon={<EditOutlined />} onClick={async () => {
                                        try {
                                            const res = await apiClient.get('/api/auth/metadata');
                                            const prefs = res.data?.data?.operations_preferences || {};
                                            setTempColumnTitles(prefs.columnTitles || {});
                                        } catch (e) {
                                            setTempColumnTitles({});
                                        }
                                        setColumnTitlesModalVisible(true);
                                    }} style={{ borderRadius: 6 }}>Başlıklar</Button>
                                    <Button size="small" icon={<BgColorsOutlined />} onClick={openColorModal} style={{ borderRadius: 6 }}>Renkler</Button>
                                    <Button size="small" icon={<SaveOutlined />} onClick={() => {
                                        if (typeof window !== 'undefined' && (window as any).saveOperationsColumnSettings) {
                                            (window as any).saveOperationsColumnSettings();
                                        }
                                        saveLayout();
                                    }} style={{ borderRadius: 6 }}>Kaydet</Button>
                                    <Tooltip title="Varsayılana Dön">
                                        <Button size="small" icon={<UndoOutlined />} onClick={resetLayout} style={{ borderRadius: 6 }} />
                                    </Tooltip>
                                    <Button size="small" icon={<ReloadOutlined />} onClick={fetchBookings} loading={loading} style={{ borderRadius: 6 }} />
                                </>)}

                                {/* ===== SHUTTLE MODE TOOLS ===== */}
                                {operationsMode === 'shuttle' && (<>
                                    <Popover
                                        trigger="click"
                                        title={<span style={{ fontWeight: 700 }}>Shuttle Sütunları</span>}
                                        content={
                                            <div style={{ maxHeight: 320, overflowY: 'auto', width: 200 }}>
                                                {shuttleCols.map(col => (
                                                    <div key={col.key} onClick={() => toggleShuttleCol(col.key)}
                                                        style={{ padding: '5px 8px', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8, background: col.hidden ? '#f9fafb' : '#fff', marginBottom: 2 }}
                                                    >
                                                        {col.hidden ? <EyeInvisibleOutlined style={{ color: '#9ca3af' }} /> : <EyeOutlined style={{ color: '#6366f1' }} />}
                                                        <span style={{ fontSize: 12, color: col.hidden ? '#9ca3af' : '#111' }}>{col.label}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        }
                                    >
                                        <Button size="small" icon={<EyeOutlined />} style={{ borderRadius: 6 }}>Sütunlar</Button>
                                    </Popover>
                                    <Button size="small" icon={<EditOutlined />} onClick={() => { setTempShuttleCols(shuttleCols.map(c=>({...c}))); setShuttleColEditVisible(true); }} style={{ borderRadius: 6 }}>Başlıklar</Button>
                                    <Button size="small" icon={<BgColorsOutlined />} onClick={() => { setTempShuttleColors({...shuttleColors}); setShuttleColorVisible(true); }} style={{ borderRadius: 6 }}>Renkler</Button>
                                    <Button size="small" icon={<SaveOutlined />} onClick={saveShuttleColWidths} style={{ borderRadius: 6 }}>Kaydet</Button>
                                    <Tooltip title="Varsayılana Dön">
                                        <Button size="small" icon={<UndoOutlined />} onClick={() => setShuttleCols(SHUTTLE_DEFAULT_COLS.map(c=>({...c})))} style={{ borderRadius: 6 }} />
                                    </Tooltip>
                                    <Button size="small" icon={<ReloadOutlined />} onClick={() => fetchShuttleRuns()} loading={shuttleRunsLoading} style={{ borderRadius: 6 }} />
                                </>)}

                                <Button size="small" icon={<FileExcelOutlined />} style={{ borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none' }}>Excel</Button>
                                <Tooltip title={isFullscreen ? 'Tam ekrandan çık (ESC)' : 'Tam ekran'}>
                                    <Button
                                        size="small"
                                        icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                                        onClick={toggleFullscreen}
                                        style={{
                                            borderRadius: 6,
                                            background: isFullscreen ? '#6366f1' : undefined,
                                            color: isFullscreen ? '#fff' : undefined,
                                            border: isFullscreen ? 'none' : undefined,
                                        }}
                                    />
                                </Tooltip>
                            </Space>
                        </div>

                        {/* Row 2: Compact filters (hidden in completed mode — has own filter bar) */}
                        <Row gutter={[8, 8]} align="middle" style={{ display: operationsMode === 'completed' ? 'none' : undefined }}>
                            <Col xs={12} sm={8} md={5} lg={4}>
                                <RangePicker
                                    size="small"
                                    style={{ width: '100%' }}
                                    value={filters.dateRange as any}
                                    onChange={(dates) => setFilters(prev => ({ ...prev, dateRange: dates as any }))}
                                    format="DD.MM.YY"
                                    allowClear={false}
                                    placeholder={['Başlangıç', 'Bitiş']}
                                />
                            </Col>
                            {operationsMode === 'private' && (
                            <Col xs={12} sm={6} md={3} lg={2}>
                                <Select
                                    size="small"
                                    style={{ width: '100%' }}
                                    value={filters.transferType}
                                    onChange={(val) => setFilters(prev => ({ ...prev, transferType: val }))}
                                    options={[
                                        { value: 'ALL', label: 'Tip: Hepsi' },
                                        { value: 'PRIVATE', label: 'Tip: Özel' },
                                        { value: 'SHUTTLE', label: 'Tip: Shuttle' },
                                    ]}
                                />
                            </Col>
                            )}
                            <Col xs={12} sm={8} md={4} lg={3}>
                                <Select
                                    size="small"
                                    style={{ width: '100%' }}
                                    placeholder="Acente"
                                    allowClear
                                >
                                    <Option value="direct">Direkt</Option>
                                </Select>
                            </Col>
                            <Col xs={12} sm={8} md={4} lg={3}>
                                <Select
                                    size="small"
                                    style={{ width: '100%' }}
                                    placeholder="Sürücü"
                                    showSearch
                                    allowClear
                                    optionFilterProp="label"
                                    options={drivers.map((d: any) => ({
                                        value: d.user?.id || d.id,
                                        label: `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.id
                                    }))}
                                    onChange={(val) => setFilters(prev => ({ ...prev, driver: val || 'ALL' }))}
                                />
                            </Col>
                            <Col xs={12} sm={8} md={4} lg={3}>
                                <Select
                                    size="small"
                                    style={{ width: '100%' }}
                                    placeholder="Araç"
                                    showSearch
                                    allowClear
                                    optionFilterProp="label"
                                    options={vehicles.map((v: any) => ({
                                        value: v.id,
                                        label: `${v.plateNumber} - ${v.model || v.vehicleType || ''}`
                                    }))}
                                    onChange={(val) => setFilters(prev => ({ ...prev, vehicle: val || 'ALL' }))}
                                />
                            </Col>
                            <Col xs={12} sm={6} md={3} lg={2}>
                                <Select size="small" style={{ width: '100%' }} placeholder="Durum" allowClear
                                    options={[
                                        { value: 'active', label: '🟢 Aktif' },
                                        { value: 'cancelled', label: '🔴 İptal' },
                                    ]}
                                />
                            </Col>
                            <Col xs={12} sm={8} md={4} lg={3}>
                                <Input
                                    size="small"
                                    placeholder="Alış Yeri (Örn: AYT)"
                                    allowClear
                                    value={filters.pickup}
                                    onChange={(e) => setFilters(prev => ({ ...prev, pickup: e.target.value }))}
                                    onPressEnter={fetchBookings}
                                    style={{ width: '100%', borderRadius: 6 }}
                                />
                            </Col>
                            <Col xs={12} sm={8} md={4} lg={3}>
                                <Input
                                    size="small"
                                    placeholder="Bırakış Yeri (Örn: Alanya)"
                                    allowClear
                                    value={filters.dropoff}
                                    onChange={(e) => setFilters(prev => ({ ...prev, dropoff: e.target.value }))}
                                    onPressEnter={fetchBookings}
                                    style={{ width: '100%', borderRadius: 6 }}
                                />
                            </Col>
                            <Col xs={24} sm={4} md={3} lg={2}>
                                <Button type="primary" size="small" icon={<FilterOutlined />} block onClick={fetchBookings} style={{ borderRadius: 6 }}>
                                    Filtrele
                                </Button>
                            </Col>
                        </Row>
                    </div>

                    {/* ── INFO: Active count (private mode) ── */}
                    {operationsMode === 'private' && (
                        <div style={{
                            background: '#fff',
                            borderBottom: '1px solid #e5e7eb',
                            padding: '6px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            flexShrink: 0,
                        }}>
                            <span style={{ fontWeight: 700, color: '#2563eb', fontSize: 13 }}>
                                Aktif Operasyonlar
                            </span>
                            <span style={{
                                background: '#2563eb',
                                color: '#fff',
                                borderRadius: 20,
                                padding: '1px 8px',
                                fontSize: 11,
                                fontWeight: 700,
                            }}>
                                {activeCount}
                            </span>
                        </div>
                    )}

                    {/* ── TABLE INFO BAR ── */}
                    {operationsMode === 'private' && (
                        <div style={{
                            background: '#f8fafc',
                            borderBottom: '1px solid #f1f5f9',
                            padding: '4px 16px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexShrink: 0,
                        }}>
                            <Space size={16}>
                                <Text style={{ fontSize: 12 }}>
                                    <strong>{bookings.length}</strong> kayıt listeleniyor
                                </Text>
                                {['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].map(s => {
                                    const cnt = bookings.filter((b: any) => b.status === s).length;
                                    if (!cnt) return null;
                                    const colors: Record<string, string> = { PENDING: '#d97706', CONFIRMED: '#2563eb', COMPLETED: '#16a34a', CANCELLED: '#dc2626' };
                                    const labels: Record<string, string> = { PENDING: 'Bekliyor', CONFIRMED: 'Onaylı', COMPLETED: 'Tamamlandı', CANCELLED: 'İptal' };
                                    return (
                                        <span key={s} style={{ fontSize: 11, color: colors[s], fontWeight: 600 }}>
                                            {labels[s]}: {cnt}
                                        </span>
                                    );
                                })}
                            </Space>
                            <Space size={6} style={{ fontSize: 10, color: '#94a3b8' }}>
                                <span>↔ Genişlik</span>
                                <span style={{ color: '#d1d5db' }}>·</span>
                                <span>⇄ Sırala</span>
                                <span style={{ color: '#d1d5db' }}>·</span>
                                <span>🔍 Filtre</span>
                                <span style={{ color: '#d1d5db' }}>·</span>
                                <span>✎ Çift tık = düzenle</span>
                            </Space>
                        </div>
                    )}

                    {/* ── SHUTTLE INFO BAR ── */}
                    {operationsMode === 'shuttle' && (
                        <div style={{
                            background: '#eff6ff',
                            borderBottom: '1px solid #bfdbfe',
                            padding: '6px 20px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexShrink: 0,
                        }}>
                            <Space size={16}>
                                {(() => {
                                    const activeRuns = shuttleRuns.filter(r => !(r.bookings.length > 0 && r.bookings.every((b: any) => b.status === 'COMPLETED')));
                                    return (<>
                                        <Text style={{ fontSize: 12 }}>
                                            <strong>{activeRuns.length}</strong> sefer listeleniyor
                                        </Text>
                                        <Text style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>
                                            Toplam Yolcu: {activeRuns.reduce((sum: number, r: any) => sum + r.bookings.length, 0)}
                                        </Text>
                                        <Text style={{ fontSize: 11, color: '#9333ea', fontWeight: 600 }}>
                                            Atanan Sefer: {activeRuns.filter((r: any) => r.driverId).length} / {activeRuns.length}
                                        </Text>
                                    </>);
                                })()}
                            </Space>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                🚌 Şöför ve araç atamak için sefer satırında açılır menüyü kullanın
                            </Text>
                        </div>
                    )}

                    {/* ── MAIN TABLE (Private mode) ── */}
                    {operationsMode === 'private' && (
                    <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
                        <OperationsTable
                            bookings={bookings.filter((b: any) => b.status !== 'COMPLETED')}
                            loading={loading}
                            drivers={drivers}
                            vehicles={vehicles}
                            statusColors={statusColors}
                            airportColors={airportColors}
                            onDriverChange={handleDriverChange}
                            onVehicleChange={handleVehicleChange}
                            onCellEdit={saveCellEdit}
                            onStatusChange={(bookingId, newStatus) => saveCellEdit(bookingId, 'status', newStatus)}
                            onAISuggest={handleAISuggest}
                            onOpenMessageModal={handleOpenMessageModal}
                            onOpenCompleteModal={handleOpenCompleteModal}
                            onReturnToReservation={(booking) => setReturnModal({ booking, reason: '' })}
                            onRowOrderChange={handleRowOrderChange}
                            onAirportColorChange={handleAirportColorChange}
                            onOpenLocationModal={handleOpenLocationModal}
                        />
                    </div>
                    )}

                    {/* ── SHUTTLE RUNS CARD PANEL (Shuttle mode) ── */}
                    {operationsMode === 'shuttle' && (
                    <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', background: '#f8fafc' }}>
                        
                        <DndContext onDragEnd={handleShuttleDragEnd}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                {shuttleRuns.filter((run: any) => {
                                    // Hide runs where ALL bookings are completed
                                    if (run.bookings.length > 0 && run.bookings.every((b: any) => b.status === 'COMPLETED')) return false;
                                    return true;
                                }).map((run: any) => {
                                    const totalPax = run.bookings.reduce((s: number, b: any) => s + (b.adults || 1), 0);
                                    const capacity = run.maxSeats || 0;
                                    const pct = capacity > 0 ? Math.round((totalPax / capacity) * 100) : 0;
                                    const fillColor = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#16a34a';
                                    const isAssigned = run.driverId && run.vehicleId;
                                    const isPartial = (run.driverId || run.vehicleId) && !isAssigned;
                                    const isExpanded = expandedRunKeys.includes(run.runKey);

                                    const driverName = run.driverId
                                        ? (() => { const d = drivers.find((dr: any) => (dr.user?.id || dr.id) === run.driverId); return d ? `${d.firstName} ${d.lastName}` : run.driverId.substring(0, 8); })()
                                        : null;

                                    const vehiclePlate = run.vehicleId
                                        ? (() => { const v = vehicles.find((vh: any) => vh.id === run.vehicleId); return v ? v.plateNumber : null; })()
                                        : null;

                                    return (
                                        <DroppableShuttleRun key={run.runKey} runId={run.runKey}>
                                        <div style={{
                                            background: '#fff',
                                            borderRadius: 14,
                                            overflow: 'hidden',
                                            boxShadow: isAssigned
                                                ? '0 2px 12px rgba(22,163,74,0.12), 0 0 0 1.5px #bbf7d0'
                                                : isPartial
                                                ? '0 2px 12px rgba(217,119,6,0.10), 0 0 0 1.5px #fde68a'
                                                : '0 2px 8px rgba(99,102,241,0.06), 0 0 0 1px #e0e7ff',
                                            marginBottom: 6,
                                            transition: 'box-shadow 0.2s'
                                        }}>
                                            {/* ── CARD HEADER ── */}
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                padding: '10px 16px',
                                                background: isAssigned
                                                    ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)'
                                                    : isPartial
                                                    ? 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)'
                                                    : 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
                                                borderBottom: `2px solid ${isAssigned ? '#86efac' : isPartial ? '#fcd34d' : '#c4b5fd'}`,
                                            }}>
                                                {/* Departure Time Badge */}
                                                <div
                                                    style={{
                                                        background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                                        color: '#fff',
                                                        borderRadius: 10,
                                                        padding: '6px 14px',
                                                        fontSize: 22,
                                                        fontWeight: 900,
                                                        letterSpacing: 1,
                                                        minWidth: 78,
                                                        textAlign: 'center',
                                                        flexShrink: 0,
                                                        cursor: 'pointer',
                                                        boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
                                                        lineHeight: 1.2,
                                                    }}
                                                    onClick={() => setEditRunModal({ run, time: run.departureTime, name: run.routeName || '' })}
                                                >
                                                    {run.departureTime}
                                                </div>

                                                {/* Route Info */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 800, fontSize: 14, color: '#1e1b4b', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                                                        <span style={{ color: '#7c3aed', fontSize: 13 }}>🚌</span>
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.routeName || 'İsimsiz Rota'}</span>
                                                        <Button
                                                            type="text" size="small"
                                                            icon={<EditOutlined />}
                                                            onClick={() => setEditRunModal({ run, time: run.departureTime, name: run.routeName || '' })}
                                                            style={{ padding: '0 4px', color: '#6366f1', fontSize: 11, flexShrink: 0 }}
                                                        />
                                                    </div>
                                                    <div style={{ fontSize: 11, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                                        <span style={{ fontWeight: 700, background: '#ede9fe', color: '#5b21b6', padding: '1px 7px', borderRadius: 8 }}>📍 {run.bookings.length} durak</span>
                                                        {run.bookings.slice(0, 4).map((b: any) => (
                                                            <span key={b.id} style={{ opacity: 0.75, background: '#f5f3ff', borderRadius: 4, padding: '1px 5px', fontSize: 10 }}>{b.contactName?.split(' ')[0]}</span>
                                                        ))}
                                                        {run.bookings.length > 4 && <span style={{ fontSize: 10, color: '#94a3b8' }}>+{run.bookings.length - 4}</span>}
                                                    </div>
                                                </div>

                                                {/* PAX Counter */}
                                                <div style={{ textAlign: 'center', flexShrink: 0, background: '#fff', borderRadius: 8, padding: '4px 10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                                                    <div style={{ fontWeight: 900, fontSize: 22, color: fillColor, lineHeight: 1 }}>{totalPax}</div>
                                                    <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginTop: 1 }}>/{capacity} PAX</div>
                                                </div>

                                                <div style={{ width: 1, height: 36, background: '#c4b5fd', margin: '0 4px' }} />

                                                {/* Assignment Controls */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <Select
                                                        placeholder="Şoför Seç"
                                                        value={run.driverId || undefined}
                                                        onChange={(val) => {
                                                            const dId = val !== undefined ? val : null;
                                                            const autoVehicle = dId ? vehicles.find((v: any) => v.driverId === dId) : null;
                                                            const vId = autoVehicle?.id || (run.vehicleId !== undefined ? run.vehicleId : null);
                                                            if (autoVehicle) message.success(`Şoför seçildi — Araç: ${autoVehicle.plateNumber} otomatik atandı`);
                                                            handleShuttleAssign(run, dId, vId);
                                                        }}
                                                        style={{ width: 150 }}
                                                        allowClear
                                                        size="small"
                                                    >
                                                        {drivers.map((d: any) => (
                                                            <Option key={d.id} value={d.user?.id || d.id}>{d.firstName} {d.lastName}</Option>
                                                        ))}
                                                    </Select>
                                                    <Select
                                                        placeholder="Araç Seç"
                                                        value={run.vehicleId || undefined}
                                                        onChange={(val) => {
                                                            const vId = val !== undefined ? val : null;
                                                            const selectedVehicle = vId ? vehicles.find((v: any) => v.id === vId) : null;
                                                            const autoDriverId = selectedVehicle?.driverId || null;
                                                            const dId = autoDriverId || (run.driverId !== undefined ? run.driverId : null);
                                                            if (autoDriverId) {
                                                                const drv = drivers.find((d: any) => (d.user?.id || d.id) === autoDriverId);
                                                                message.success(`Araç seçildi — Şoför: ${drv ? `${drv.firstName} ${drv.lastName}` : ''} otomatik atandı`);
                                                            }
                                                            handleShuttleAssign(run, dId, vId);
                                                        }}
                                                        style={{ width: 150 }}
                                                        allowClear
                                                        size="small"
                                                    >
                                                        {vehicles.map((v: any) => (
                                                            <Option key={v.id} value={v.id}>{v.plateNumber} — {v.brand} {v.model}</Option>
                                                        ))}
                                                    </Select>

                                                    {!run.driverId && !run.vehicleId && (
                                                        <span style={{
                                                            fontSize: 10, color: '#ef4444',
                                                            background: '#fff1f0', borderRadius: 6,
                                                            padding: '2px 7px', fontWeight: 700,
                                                            border: '1px solid #fecaca'
                                                        }}>✗ Atanmadı</span>
                                                    )}
                                                    
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={<EnvironmentOutlined />}
                                                        onClick={async () => {
                                                            if (!run.bookings || run.bookings.length < 2) {
                                                                message.info('En az 2 yolcu olmalı');
                                                                return;
                                                            }
                                                            message.loading({ content: 'Güzergah hesaplanıyor...', key: 'optimize', duration: 30 });
                                                            try {
                                                                const bookingIds = run.bookings.map((b: any) => b.id);
                                                                const dest = run.toName || run.routeName || 'Gazipaşa Alanya Havalimanı';
                                                                const res = await apiClient.post('/api/operations/shuttle-runs/optimize-route', {
                                                                    bookingIds,
                                                                    destinationAddress: dest
                                                                });
                                                                if (res.data.success) {
                                                                    message.success({ content: `Güzergah optimize edildi! ${res.data.optimizedOrder.length} yolcu sıralandı`, key: 'optimize' });
                                                                    fetchShuttleRuns(true); // Refresh to get new order
                                                                } else {
                                                                    message.error({ content: res.data.error || 'Optimizasyon başarısız', key: 'optimize' });
                                                                }
                                                            } catch (e: any) {
                                                                message.error({ content: 'Güzergah optimizasyonu başarısız: ' + (e?.response?.data?.error || e.message), key: 'optimize' });
                                                            }
                                                        }}
                                                        title="Güzergaha Göre Sırala"
                                                        style={{ borderRadius: 6, color: '#2563eb', fontWeight: 600 }}
                                                    >
                                                        🗺️ Güzergah Sırala
                                                    </Button>

                                                    <Button
                                                        type="text"
                                                        danger
                                                        size="small"
                                                        icon={<DeleteOutlined />}
                                                        onClick={() => handleDeleteManualRun(run.runKey)}
                                                        title="Seferi Sil"
                                                        style={{ borderRadius: 6 }}
                                                    />

                                                    <Button
                                                        size="small"
                                                        icon={isExpanded ? <CaretUpOutlined /> : <CaretDownOutlined />}
                                                        onClick={() => setExpandedRunKeys(prev => isExpanded ? prev.filter(k => k !== run.runKey) : [...prev, run.runKey])}
                                                        style={{ borderRadius: 6 }}
                                                    />
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div style={{ background: '#fcfaff', borderTop: '1px solid #e9d5ff', overflowX: 'auto' }}>
                                                    {/* Passenger Columns Header */}
                                                    <div style={{ 
                                                        display: 'grid', 
                                                        gridTemplateColumns: shuttleCols.filter(c => !c.hidden).map(c => `${c.width}px`).join(' '),
                                                        background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', borderBottom: '1px solid #c4b5fd', padding: '0 4px'
                                                    }}>
                                                        {shuttleCols.filter(c => !c.hidden).map((col, colIdx) => (
                                                            <div 
                                                                key={col.key} 
                                                                draggable={col.key !== 'sort'}
                                                                onDragStart={(e) => {
                                                                    e.dataTransfer.setData('shuttle-col-key', col.key);
                                                                }}
                                                                onDragOver={(e) => {
                                                                    e.preventDefault();
                                                                    e.currentTarget.style.borderLeft = '3px solid #7c3aed';
                                                                }}
                                                                onDragLeave={(e) => {
                                                                    e.currentTarget.style.borderLeft = 'none';
                                                                }}
                                                                onDrop={(e) => {
                                                                    e.preventDefault();
                                                                    e.currentTarget.style.borderLeft = 'none';
                                                                    const dragKey = e.dataTransfer.getData('shuttle-col-key');
                                                                    if (!dragKey || dragKey === col.key) return;
                                                                    setShuttleCols(prev => {
                                                                        const arr = [...prev];
                                                                        const fromIdx = arr.findIndex(c => c.key === dragKey);
                                                                        const toIdx = arr.findIndex(c => c.key === col.key);
                                                                        if (fromIdx === -1 || toIdx === -1) return prev;
                                                                        const [moved] = arr.splice(fromIdx, 1);
                                                                        arr.splice(toIdx, 0, moved);
                                                                        // Save to API
                                                                        saveShuttleColsToAPI(arr);
                                                                        return arr;
                                                                    });
                                                                }}
                                                                style={{ 
                                                                    padding: '7px 8px', fontSize: 10, fontWeight: 800, color: '#5b21b6', position: 'relative', 
                                                                    letterSpacing: 0.5, textTransform: 'uppercase',
                                                                    cursor: col.key !== 'sort' ? 'grab' : 'default',
                                                                    userSelect: 'none',
                                                                }}
                                                            >
                                                                {col.label}
                                                                {/* Belirgin resize handle */}
                                                                <div 
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        const startX = e.clientX;
                                                                        const startW = col.width;
                                                                        const onMove = (me: MouseEvent) => resizeShuttleCol(col.key, startW + me.clientX - startX);
                                                                        const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                                                                        window.addEventListener('mousemove', onMove);
                                                                        window.addEventListener('mouseup', onUp);
                                                                    }}
                                                                    style={{ 
                                                                        position: 'absolute', right: 0, top: '15%', bottom: '15%', width: 3, 
                                                                        cursor: 'col-resize',
                                                                        background: 'rgba(124, 58, 237, 0.3)',
                                                                        borderRadius: 2,
                                                                        transition: 'all 0.2s',
                                                                    }} 
                                                                    onMouseEnter={(e) => {
                                                                        e.currentTarget.style.background = '#7c3aed';
                                                                        e.currentTarget.style.width = '4px';
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        e.currentTarget.style.background = 'rgba(124, 58, 237, 0.3)';
                                                                        e.currentTarget.style.width = '3px';
                                                                    }}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Passenger Body Rows */}
                                                    <div style={{ minHeight: 20 }}>
                                                        <SortableContext items={run.bookings.map((b: any) => b.id)} strategy={verticalListSortingStrategy}>
                                                            {run.bookings.map((b: any, idx: number) => {
                                                                const rowBg = (shuttleColors as any)[b.status] || (idx % 2 === 0 ? '#fff' : '#fafafa');
                                                                const pickupTime = b.pickupDateTime ? new Date(b.pickupDateTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : run.departureTime;

                                                                const renderCell = (key: string) => {
                                                                    const statusMap: any = {
                                                                        CONFIRMED: { color: '#2563eb', label: 'Onaylı' },
                                                                        PENDING: { color: '#d97706', label: 'Bekliyor' },
                                                                        IN_PROGRESS: { color: '#0e7490', label: 'Yolcu Alındı' },
                                                                        NO_SHOW: { color: '#be123c', label: 'No-Show' },
                                                                        COMPLETED: { color: '#16a34a', label: 'Tamamlandı' },
                                                                        CANCELLED: { color: '#dc2626', label: 'İptal' },
                                                                    };
                                                                    // Override: if driver acknowledged, show "Okundu"
                                                                    const isAcknowledged = b.acknowledgedAt || b.metadata?.acknowledgedAt;
                                                                    let st = statusMap[b.status] || { color: '#6b7280', label: b.status };
                                                                    if (isAcknowledged && (b.status === 'CONFIRMED' || b.status === 'PENDING')) {
                                                                        st = { color: '#0369a1', label: 'Okundu ✓' };
                                                                    }
                                                                    
                                                                    switch(key) {
                                                                        case 'sort': return (
                                                                            <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                                                                                <span style={{ cursor: 'grab', color: '#9ca3af' }}>⠿</span>
                                                                            </div>
                                                                        );
                                                                        case 'index': return <span style={{ fontWeight: 800, color: '#5b21b6' }}>{idx + 1}</span>;
                                                                        case 'customer': {
                                                                            const agencyName = b.agencyName || b.agency?.name || b.partnerName;
                                                                            return (
                                                                                <div 
                                                                                    title="Rezervasyon detayını açmak için çift tıklayın"
                                                                                    style={{ cursor: 'pointer' }}
                                                                                    onDoubleClick={() => setShuttleDetailModal({ booking: b, loading: false })}
                                                                                >
                                                                                    <div style={{ fontWeight: 700, fontSize: 12, color: '#1e1b4b' }}>{b.contactName}</div>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                                                                                        <div style={{ fontSize: 9, color: '#7c3aed', opacity: 0.8 }}>{b.bookingNumber}</div>
                                                                                        {agencyName ? (
                                                                                            <span style={{ fontSize: 9, background: '#eff6ff', color: '#1d4ed8', padding: '0px 4px', borderRadius: 3, fontWeight: 700 }}>{agencyName}</span>
                                                                                        ) : (
                                                                                            <span style={{ fontSize: 9, background: '#f0fdf4', color: '#15803d', padding: '0px 4px', borderRadius: 3, fontWeight: 700 }}>Direkt</span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        }
                                                                        case 'pickupTime': {
                                                                            if (editingPickupTime?.bookingId === b.id) {
                                                                                return (
                                                                                    <input
                                                                                        type="time"
                                                                                        defaultValue={editingPickupTime!.value}
                                                                                        autoFocus
                                                                                        onBlur={(e) => {
                                                                                            if (e.target.value && e.target.value !== editingPickupTime!.value) {
                                                                                                // Build full datetime
                                                                                                const baseDate = b.pickupDateTime ? b.pickupDateTime.split('T')[0] : new Date().toISOString().split('T')[0];
                                                                                                handlePickupTimeEdit(b.id, `${baseDate}T${e.target.value}:00`);
                                                                                            } else {
                                                                                                setEditingPickupTime(null);
                                                                                            }
                                                                                        }}
                                                                                        onKeyDown={(e) => {
                                                                                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                                                                            if (e.key === 'Escape') setEditingPickupTime(null);
                                                                                        }}
                                                                                        style={{ 
                                                                                            fontWeight: 700, color: '#1e3a8a', background: '#dbeafe', 
                                                                                            padding: '2px 4px', borderRadius: 5, fontSize: 12, 
                                                                                            border: '2px solid #3b82f6', outline: 'none', width: '70px'
                                                                                        }}
                                                                                    />
                                                                                );
                                                                            }
                                                                            return (
                                                                                <span 
                                                                                    onDoubleClick={() => setEditingPickupTime({ bookingId: b.id, value: pickupTime })}
                                                                                    title="Çift tıklayarak düzenleyin"
                                                                                    style={{ 
                                                                                        fontWeight: 700, color: '#1e3a8a', background: '#eff6ff', 
                                                                                        padding: '2px 7px', borderRadius: 5, fontSize: 12, 
                                                                                        cursor: 'pointer' 
                                                                                    }}
                                                                                >
                                                                                    {pickupTime}
                                                                                </span>
                                                                            );
                                                                        }
                                                                        case 'pickup': return (
                                                                            <span onDoubleClick={() => setMapModal({ name: b.contactName, pickup: b.pickup || '' })} style={{ cursor: 'pointer', fontSize: 12, color: '#374151' }}>
                                                                                <span style={{ color: '#dc2626', marginRight: 3 }}>📍</span>{b.pickup || '-'}
                                                                            </span>
                                                                        );
                                                                        case 'flight': return (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                                                <span style={{ fontSize: 11, color: '#1e40af', fontWeight: 600 }}>
                                                                                    ✈️ {b.flightNumber || '-'}
                                                                                </span>
                                                                                {(b.flightTime || b.metadata?.flightTime) && (
                                                                                    <span style={{ fontSize: 10, color: '#6366f1', fontWeight: 700 }}>
                                                                                        🕐 {b.flightTime || b.metadata?.flightTime}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                        case 'payment': {
                                                                            // 1. Try metadata.paymentMethod (canonical)
                                                                            let method = b?.metadata?.paymentMethod;
                                                                            const ps = b?.paymentStatus;

                                                                            // 2. Fallback for legacy bookings without paymentMethod
                                                                            if (!method) {
                                                                                if (b?.agencyId) {
                                                                                    method = 'BALANCE';
                                                                                } else {
                                                                                    method = 'PAY_IN_VEHICLE';
                                                                                }
                                                                            }

                                                                            const isPaid = ps === 'PAID';

                                                                            const payStyles: Record<string, { icon: string; label: string; gradient: string; border: string; color: string; glow: string }> = {
                                                                                'PAY_IN_VEHICLE': {
                                                                                    icon: '🚗', label: isPaid ? 'Ödendi' : 'Araçta',
                                                                                    gradient: isPaid ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)' : 'linear-gradient(135deg, #fff7ed, #fed7aa)',
                                                                                    border: isPaid ? '#86efac' : '#fdba74',
                                                                                    color: isPaid ? '#15803d' : '#c2410c',
                                                                                    glow: isPaid ? '0 0 8px rgba(34,197,94,0.15)' : '0 0 8px rgba(251,146,60,0.15)',
                                                                                },
                                                                                'CASH': {
                                                                                    icon: '💵', label: isPaid ? 'Ödendi' : 'Nakit',
                                                                                    gradient: isPaid ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)' : 'linear-gradient(135deg, #fefce8, #fef08a)',
                                                                                    border: isPaid ? '#86efac' : '#fde047',
                                                                                    color: isPaid ? '#15803d' : '#a16207',
                                                                                    glow: isPaid ? '0 0 8px rgba(34,197,94,0.15)' : '0 0 8px rgba(253,224,71,0.15)',
                                                                                },
                                                                                'CREDIT_CARD': {
                                                                                    icon: '💳', label: 'Kart',
                                                                                    gradient: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                                                                                    border: '#93c5fd', color: '#1d4ed8',
                                                                                    glow: '0 0 8px rgba(59,130,246,0.15)',
                                                                                },
                                                                                'BALANCE': {
                                                                                    icon: '🏦', label: 'Bakiye',
                                                                                    gradient: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                                                                                    border: '#86efac', color: '#15803d',
                                                                                    glow: '0 0 8px rgba(34,197,94,0.15)',
                                                                                },
                                                                                'BANK_TRANSFER': {
                                                                                    icon: '🏧', label: 'Havale',
                                                                                    gradient: 'linear-gradient(135deg, #faf5ff, #ede9fe)',
                                                                                    border: '#c4b5fd', color: '#6d28d9',
                                                                                    glow: '0 0 8px rgba(139,92,246,0.15)',
                                                                                },
                                                                            };

                                                                            const cfg = payStyles[method] || {
                                                                                icon: '💰', label: String(method),
                                                                                gradient: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                                                                                border: '#cbd5e1', color: '#475569', glow: 'none',
                                                                            };

                                                                            return (
                                                                                <span style={{
                                                                                    fontSize: 10,
                                                                                    fontWeight: 800,
                                                                                    color: cfg.color,
                                                                                    background: cfg.gradient,
                                                                                    border: `1.5px solid ${cfg.border}`,
                                                                                    padding: '2px 8px',
                                                                                    borderRadius: 8,
                                                                                    whiteSpace: 'nowrap',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: 3,
                                                                                    boxShadow: cfg.glow,
                                                                                    letterSpacing: 0.3,
                                                                                    lineHeight: '18px',
                                                                                }}>
                                                                                    <span style={{ fontSize: 11, lineHeight: 1 }}>{cfg.icon}</span>
                                                                                    {cfg.label}
                                                                                </span>
                                                                            );
                                                                        }
                                                                        case 'pax': {
                                                                            const pAdults = b.adults || 1;
                                                                            const pChildren = b.children || 0;
                                                                            const pInfants = b.infants || 0;
                                                                            const pParts: string[] = [];
                                                                            if (pAdults > 0) pParts.push(`${pAdults}Y`);
                                                                            if (pChildren > 0) pParts.push(`${pChildren}Ç`);
                                                                            if (pInfants > 0) pParts.push(`${pInfants}B`);
                                                                            return (
                                                                                <span style={{ fontWeight: 700, color: '#374151' }}>
                                                                                    {pAdults + pChildren + pInfants}
                                                                                    {(pChildren > 0 || pInfants > 0) && (
                                                                                        <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, marginLeft: 3 }}>({pParts.join('+')})</span>
                                                                                    )}
                                                                                </span>
                                                                            );
                                                                        }
                                                                        case 'phone': return <span style={{ fontSize: 12, color: '#374151' }}>{b.contactPhone}</span>;
                                                                        case 'extras': {
                                                                            const extras = b.metadata?.extraServices || b.extraServices || [];
                                                                            if (!extras.length) return <span style={{ fontSize: 11, color: '#999' }}>-</span>;
                                                                            return (
                                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                                                                    {extras.map((e: any, i: number) => (
                                                                                        <span key={i} style={{ fontSize: 10, background: '#f3e8ff', color: '#7c3aed', padding: '1px 6px', borderRadius: 4, border: '1px solid #e9d5ff', whiteSpace: 'nowrap' }}>
                                                                                            {e.quantity || 1}x {e.name || e.serviceName || 'Ekstra'}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            );
                                                                        }
                                                                        case 'status': return (
                                                                            <span style={{
                                                                                fontWeight: 700,
                                                                                color: st.color,
                                                                                background: st.color + '18',
                                                                                padding: '2px 8px',
                                                                                borderRadius: 10,
                                                                                fontSize: 11,
                                                                                border: `1px solid ${st.color}40`,
                                                                                textTransform: 'uppercase',
                                                                                letterSpacing: 0.3
                                                                            }}>
                                                                                {st.label}
                                                                            </span>
                                                                        );
                                                                        default: return null;
                                                                    }
                                                                };

                                                                return (
                                                                    <DraggablePassengerItem key={b.id} booking={b}>
                                                                        {(dnd) => (
                                                                            <div 
                                                                                ref={dnd.setNodeRef} 
                                                                                style={{
                                                                                    ...dnd.style,
                                                                                    display: 'grid', 
                                                                                    gridTemplateColumns: shuttleCols.filter(c => !c.hidden).map(c => `${c.width}px`).join(' '),
                                                                                    background: dnd.isDragging ? '#e0e7ff' : rowBg,
                                                                                    borderBottom: '1px solid #ede9fe',
                                                                                    padding: '0 4px',
                                                                                    transition: 'background 0.15s',
                                                                                }}
                                                                            >
                                                                                {shuttleCols.filter(c => !c.hidden).map(col => (
                                                                                    <div key={col.key} style={{ padding: '7px 8px', overflow: 'hidden', display: 'flex', alignItems: 'center' }} {...(col.key === 'sort' ? dnd.listeners : {})}>
                                                                                        {col.key === 'sort' ? <div {...dnd.attributes} style={{ display: 'flex', justifyContent: 'center', cursor: 'grab', color: '#a78bfa', fontSize: 14 }}>⠿</div> : renderCell(col.key)}
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </DraggablePassengerItem>
                                                                );
                                                            })}
                                                        </SortableContext>
                                                    </div>
                                                    
                                                    {run.bookings.length === 0 && (
                                                        <div style={{ padding: '24px', textAlign: 'center', color: '#a78bfa', fontSize: 12, background: '#faf5ff', borderTop: '1px dashed #c4b5fd' }}>
                                                            🚌 Henüz yolcu yok. Yolcuları buraya sürükleyebilirsiniz.
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        </DroppableShuttleRun>
                                    );
                                })}
                            </div>
                        </DndContext>
                    </div>
                )}

                    {/* ── COMPLETED OPERATIONS PANEL ── */}
                    {operationsMode === 'completed' && (
                    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                        {/* Completed Filter Bar */}
                        <div style={{
                            background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                            borderBottom: '1px solid #bbf7d0',
                            padding: '12px 20px',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 10,
                            alignItems: 'center',
                            flexShrink: 0,
                        }}>
                            <RangePicker
                                size="small"
                                value={completedFilters.dateRange}
                                onChange={(dates) => setCompletedFilters(prev => ({ ...prev, dateRange: dates as [any, any] }))}
                                format="DD.MM.YYYY"
                                style={{ width: 220, borderRadius: 6 }}
                                placeholder={['Başlangıç', 'Bitiş']}
                            />
                            <Select
                                size="small"
                                value={completedFilters.transferType}
                                onChange={(v) => setCompletedFilters(prev => ({ ...prev, transferType: v }))}
                                style={{ width: 140, borderRadius: 6 }}
                            >
                                <Option value="ALL">Tümü</Option>
                                <Option value="PRIVATE">🚗 Özel</Option>
                                <Option value="SHUTTLE">🚌 Shuttle</Option>
                            </Select>
                            <Select
                                size="small"
                                value={completedFilters.driver}
                                onChange={(v) => setCompletedFilters(prev => ({ ...prev, driver: v }))}
                                style={{ width: 160, borderRadius: 6 }}
                                showSearch
                                optionFilterProp="children"
                            >
                                <Option value="ALL">Tüm Şoförler</Option>
                                {drivers.map((d: any) => (
                                    <Option key={d.user?.id || d.id} value={d.user?.id || d.id}>
                                        {d.firstName} {d.lastName}
                                    </Option>
                                ))}
                            </Select>
                            <Select
                                size="small"
                                value={completedFilters.vehicle}
                                onChange={(v) => setCompletedFilters(prev => ({ ...prev, vehicle: v }))}
                                style={{ width: 150, borderRadius: 6 }}
                                showSearch
                                optionFilterProp="children"
                            >
                                <Option value="ALL">Tüm Araçlar</Option>
                                {vehicles.map((v: any) => (
                                    <Option key={v.id} value={v.id}>{v.plateNumber}</Option>
                                ))}
                            </Select>
                            <Input
                                size="small"
                                placeholder="🔍 Müşteri, telefon, konum..."
                                value={completedFilters.search}
                                onChange={(e) => setCompletedFilters(prev => ({ ...prev, search: e.target.value }))}
                                style={{ width: 200, borderRadius: 6 }}
                                allowClear
                            />
                            <Button
                                size="small"
                                icon={<ReloadOutlined />}
                                onClick={fetchCompletedBookings}
                                loading={completedLoading}
                                style={{ borderRadius: 6 }}
                            >
                                Yenile
                            </Button>
                            <Button
                                size="small"
                                icon={<FileExcelOutlined />}
                                style={{ borderRadius: 6, color: '#16a34a', borderColor: '#86efac' }}
                                onClick={() => {
                                    const headers = ['Rez. No', 'Tarih', 'Plan Alış', 'Gerçek Alış', 'Gerçek Varış', 'Süre (dk)', 'Tip', 'Yön', 'Acente', 'Müşteri', 'Telefon', 'Uçuş', 'Alış Noktası', 'Varış Noktası', 'Pax', 'Şoför', 'Araç (Plaka)', 'Araç Model', 'Araç Tipi', 'Ekstra Hizmetler', 'Ücret', 'Para Birimi', 'Ödeme Durumu', 'Notlar'];
                                    const rows = completedBookings.map((b: any) => {
                                        const durationMins = b.pickedUpAt && b.droppedOffAt ? dayjs(b.droppedOffAt).diff(dayjs(b.pickedUpAt), 'minute') : 0;
                                        return [
                                            b.bookingNumber || '',
                                            dayjs(b.pickupDateTime).format('DD.MM.YYYY'),
                                            dayjs(b.pickupDateTime).format('HH:mm'),
                                            b.pickedUpAt ? dayjs(b.pickedUpAt).format('HH:mm') : '',
                                            b.droppedOffAt ? dayjs(b.droppedOffAt).format('HH:mm') : '',
                                            durationMins,
                                            b.transferType === 'SHUTTLE' ? 'Shuttle' : 'Özel',
                                            b.direction || '',
                                            b.agencyName || 'Direkt',
                                            b.contactName || b.customer?.name || '',
                                            b.customer?.phone || b.contactPhone || '',
                                            b.flightNumber || b.metadata?.flightNumber || '',
                                            b.pickup?.rawLocation || b.pickup?.location || '',
                                            b.dropoff?.rawLocation || b.dropoff?.location || '',
                                            b.pax || 1,
                                            (() => { const d = drivers.find((dr: any) => (dr.user?.id || dr.id) === b.driverId); return d ? `${d.firstName} ${d.lastName}` : ''; })(),
                                            (() => { const v = vehicles.find((vh: any) => vh.id === b.assignedVehicleId); return v ? v.plateNumber : ''; })(),
                                            (() => { const v = vehicles.find((vh: any) => vh.id === b.assignedVehicleId); return v ? (v.model || '') : ''; })(),
                                            b.vehicleType || b.metadata?.vehicleType || '',
                                            (b.metadata?.extraServices || []).map((s: any) => typeof s === 'string' ? s : s.name).join(', '),
                                            b.price || b.total || 0,
                                            b.currency || 'TRY',
                                            b.paymentStatus === 'PAID' ? 'Ödendi' : b.paymentStatus === 'PENDING' ? 'Bekliyor' : (b.paymentStatus || ''),
                                            b.specialRequests || b.notes || b.internalNotes || '',
                                        ];
                                    });
                                    const csv = [headers, ...rows].map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
                                    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `tamamlanan-operasyonlar-${dayjs().format('YYYY-MM-DD')}.csv`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }}
                            >
                                Excel
                            </Button>
                        </div>

                        {/* Completed Info Bar */}
                        <div style={{
                            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                            borderBottom: '1px solid #e2e8f0',
                            padding: '8px 20px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexShrink: 0,
                        }}>
                            <Space size={12} wrap>
                                <span style={{
                                    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                    color: '#fff', borderRadius: 8, padding: '3px 12px',
                                    fontSize: 12, fontWeight: 800,
                                }}>
                                    {completedBookings.length} Operasyon
                                </span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed', background: '#faf5ff', padding: '2px 8px', borderRadius: 6 }}>
                                    🚗 Özel: {completedBookings.filter((b: any) => b.transferType === 'PRIVATE').length}
                                </span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: 6 }}>
                                    🚌 Shuttle: {completedBookings.filter((b: any) => b.transferType === 'SHUTTLE').length}
                                </span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#0f766e', background: '#f0fdfa', padding: '2px 8px', borderRadius: 6 }}>
                                    👥 {completedBookings.reduce((s: number, b: any) => s + (b.pax || 1), 0)} Yolcu
                                </span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', padding: '2px 8px', borderRadius: 6 }}>
                                    💰 {completedBookings.reduce((s: number, b: any) => s + (b.price || b.total || 0), 0).toLocaleString('tr-TR')} ₺
                                </span>
                                <span style={{ fontSize: 10, color: '#64748b' }}>
                                    Şoför: {new Set(completedBookings.filter((b: any) => b.driverId).map((b: any) => b.driverId)).size} | Araç: {new Set(completedBookings.filter((b: any) => b.assignedVehicleId).map((b: any) => b.assignedVehicleId)).size}
                                </span>
                            </Space>
                        </div>

                        {/* Completed Table */}
                        <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
                            <Table
                                dataSource={completedBookings}
                                rowKey="id"
                                size="small"
                                loading={completedLoading}
                                pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'], size: 'small', showTotal: (total) => `${total} kayıt` }}
                                scroll={{ x: 2400 }}
                                style={{ fontSize: 12 }}
                                rowClassName={(record: any) => record.transferType === 'SHUTTLE' ? 'completed-row-shuttle' : 'completed-row-private'}
                                columns={[
                                    {
                                        title: 'REZ. NO',
                                        dataIndex: 'bookingNumber',
                                        key: 'bookingNumber',
                                        width: 100,
                                        fixed: 'left' as const,
                                        sorter: (a: any, b: any) => (a.bookingNumber || '').localeCompare(b.bookingNumber || ''),
                                        render: (val: string) => (
                                            <Tag color="blue" style={{ fontSize: 10, fontWeight: 700, margin: 0, letterSpacing: 0.3 }}>{val || '—'}</Tag>
                                        )
                                    },
                                    {
                                        title: 'TARİH / SAAT',
                                        dataIndex: 'pickupDateTime',
                                        key: 'date',
                                        width: 120,
                                        fixed: 'left' as const,
                                        sorter: (a: any, b: any) => dayjs(a.pickupDateTime).unix() - dayjs(b.pickupDateTime).unix(),
                                        defaultSortOrder: 'descend' as const,
                                        render: (val: string) => (
                                            <div style={{ lineHeight: 1.3 }}>
                                                <div style={{ fontSize: 11, fontWeight: 600, color: '#1e1b4b' }}>{dayjs(val).format('DD.MM.YYYY')}</div>
                                                <div style={{ fontSize: 13, fontWeight: 800, color: '#4f46e5' }}>{dayjs(val).format('HH:mm')}</div>
                                            </div>
                                        )
                                    },
                                    {
                                        title: 'TİP',
                                        dataIndex: 'transferType',
                                        key: 'type',
                                        width: 85,
                                        filters: [
                                            { text: '🚗 Özel', value: 'PRIVATE' },
                                            { text: '🚌 Shuttle', value: 'SHUTTLE' },
                                        ],
                                        onFilter: (value: any, record: any) => record.transferType === value,
                                        render: (val: string) => (
                                            <Tag
                                                color={val === 'SHUTTLE' ? 'geekblue' : 'purple'}
                                                style={{ fontSize: 10, margin: 0, fontWeight: 600 }}
                                            >
                                                {val === 'SHUTTLE' ? '🚌 Shuttle' : '🚗 Özel'}
                                            </Tag>
                                        )
                                    },
                                    {
                                        title: 'YÖN',
                                        dataIndex: 'direction',
                                        key: 'direction',
                                        width: 70,
                                        filters: [
                                            { text: 'Geliş', value: 'Geliş' },
                                            { text: 'Gidiş', value: 'Gidiş' },
                                            { text: 'Ara', value: 'Ara' },
                                        ],
                                        onFilter: (value: any, record: any) => record.direction === value,
                                        render: (val: string) => {
                                            const m: Record<string, { color: string; icon: string }> = {
                                                'Geliş': { color: 'green', icon: '↙' },
                                                'Gidiş': { color: 'orange', icon: '↗' },
                                                'Ara': { color: 'default', icon: '→' },
                                            };
                                            const s = m[val] || m['Ara'];
                                            return <Tag color={s.color} style={{ fontSize: 10, margin: 0 }}>{s.icon} {val}</Tag>;
                                        }
                                    },
                                    {
                                        title: 'ACENTE',
                                        key: 'agency',
                                        width: 120,
                                        ellipsis: true,
                                        sorter: (a: any, b: any) => (a.agencyName || '').localeCompare(b.agencyName || ''),
                                        render: (_: any, record: any) => record.agencyName ? (
                                            <Tag color="cyan" style={{ fontSize: 10, margin: 0, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>{record.agencyName}</Tag>
                                        ) : <span style={{ color: '#d1d5db', fontSize: 10 }}>Direkt</span>
                                    },
                                    {
                                        title: 'MÜŞTERİ',
                                        key: 'customer',
                                        width: 170,
                                        sorter: (a: any, b: any) => (a.contactName || '').localeCompare(b.contactName || ''),
                                        render: (_: any, record: any) => (
                                            <div style={{ lineHeight: 1.3 }}>
                                                <div style={{ fontWeight: 700, fontSize: 12, color: '#1e1b4b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {record.contactName || record.customer?.name || '-'}
                                                </div>
                                                <div style={{ fontSize: 10, color: '#6b7280' }}>{record.customer?.phone || record.contactPhone || '-'}</div>
                                            </div>
                                        )
                                    },
                                    {
                                        title: 'UÇUŞ',
                                        key: 'flight',
                                        width: 100,
                                        render: (_: any, record: any) => {
                                            const fn = record.flightNumber || record.metadata?.flightNumber;
                                            const ft = record.flightTime || record.metadata?.flightTime;
                                            if (!fn && !ft) return <span style={{ color: '#d1d5db', fontSize: 10 }}>—</span>;
                                            return (
                                                <div style={{ lineHeight: 1.3 }}>
                                                    {fn && <div style={{ fontWeight: 700, fontSize: 11, color: '#0369a1' }}>{fn}</div>}
                                                    {ft && <div style={{ fontSize: 10, color: '#6b7280' }}>{ft}</div>}
                                                </div>
                                            );
                                        }
                                    },
                                    {
                                        title: 'ALIŞ NOKTASI',
                                        key: 'pickup',
                                        width: 200,
                                        ellipsis: true,
                                        render: (_: any, record: any) => {
                                            const loc = record.pickup?.rawLocation || record.pickup?.location || '-';
                                            return (
                                                <Tooltip title={loc}>
                                                    <div style={{ fontSize: 11, lineHeight: 1.3 }}>
                                                        <span style={{ color: '#16a34a', fontWeight: 600 }}>📍</span> {loc}
                                                    </div>
                                                </Tooltip>
                                            );
                                        }
                                    },
                                    {
                                        title: 'VARIŞ NOKTASI',
                                        key: 'dropoff',
                                        width: 200,
                                        ellipsis: true,
                                        render: (_: any, record: any) => {
                                            const loc = record.dropoff?.rawLocation || record.dropoff?.location || '-';
                                            return (
                                                <Tooltip title={loc}>
                                                    <div style={{ fontSize: 11, lineHeight: 1.3 }}>
                                                        <span style={{ color: '#dc2626', fontWeight: 600 }}>🏁</span> {loc}
                                                    </div>
                                                </Tooltip>
                                            );
                                        }
                                    },
                                    {
                                        title: 'PAX',
                                        dataIndex: 'pax',
                                        key: 'pax',
                                        width: 55,
                                        align: 'center' as const,
                                        sorter: (a: any, b: any) => (a.pax || 1) - (b.pax || 1),
                                        render: (val: number) => (
                                            <span style={{
                                                fontWeight: 800, color: '#4f46e5', fontSize: 13,
                                                background: '#eef2ff', borderRadius: 6, padding: '2px 8px',
                                            }}>{val || 1}</span>
                                        )
                                    },
                                    {
                                        title: 'PLAN',
                                        key: 'scheduledPickup',
                                        width: 65,
                                        align: 'center' as const,
                                        render: (_: any, record: any) => (
                                            <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>
                                                {record.pickupDateTime ? dayjs(record.pickupDateTime).format('HH:mm') : '—'}
                                            </span>
                                        )
                                    },
                                    {
                                        title: 'ALIŞ',
                                        key: 'pickedUpAt',
                                        width: 65,
                                        align: 'center' as const,
                                        sorter: (a: any, b: any) => {
                                            const ta = a.pickedUpAt ? dayjs(a.pickedUpAt).unix() : 0;
                                            const tb = b.pickedUpAt ? dayjs(b.pickedUpAt).unix() : 0;
                                            return ta - tb;
                                        },
                                        render: (_: any, record: any) => {
                                            if (!record.pickedUpAt) return <span style={{ color: '#d1d5db', fontSize: 10 }}>—</span>;
                                            const scheduled = dayjs(record.pickupDateTime);
                                            const actual = dayjs(record.pickedUpAt);
                                            const diffMinutes = actual.diff(scheduled, 'minute');
                                            let color = '#16a34a'; // green (on time)
                                            let label = '✓';
                                            if (diffMinutes > 5) { color = '#dc2626'; label = '↑'; } // late
                                            else if (diffMinutes < -5) { color = '#2563eb'; label = '↓'; } // early
                                            return (
                                                <Tooltip title={`Planlanan: ${scheduled.format('HH:mm')} | Fark: ${diffMinutes > 0 ? '+' : ''}${diffMinutes} dk`}>
                                                    <span style={{ fontSize: 11, fontWeight: 700, color }}>
                                                        {actual.format('HH:mm')} <small>{label}</small>
                                                    </span>
                                                </Tooltip>
                                            );
                                        }
                                    },
                                    {
                                        title: 'VARIŞ',
                                        key: 'droppedOffAt',
                                        width: 65,
                                        align: 'center' as const,
                                        sorter: (a: any, b: any) => {
                                            const ta = a.droppedOffAt ? dayjs(a.droppedOffAt).unix() : 0;
                                            const tb = b.droppedOffAt ? dayjs(b.droppedOffAt).unix() : 0;
                                            return ta - tb;
                                        },
                                        render: (_: any, record: any) => {
                                            if (!record.droppedOffAt) return <span style={{ color: '#d1d5db', fontSize: 10 }}>—</span>;
                                            return <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed' }}>{dayjs(record.droppedOffAt).format('HH:mm')}</span>;
                                        }
                                    },
                                    {
                                        title: 'SÜRE',
                                        key: 'duration',
                                        width: 70,
                                        align: 'center' as const,
                                        sorter: (a: any, b: any) => {
                                            const da = a.pickedUpAt && a.droppedOffAt ? dayjs(a.droppedOffAt).diff(dayjs(a.pickedUpAt), 'minute') : 0;
                                            const db = b.pickedUpAt && b.droppedOffAt ? dayjs(b.droppedOffAt).diff(dayjs(b.pickedUpAt), 'minute') : 0;
                                            return da - db;
                                        },
                                        render: (_: any, record: any) => {
                                            if (!record.pickedUpAt || !record.droppedOffAt) return <span style={{ color: '#d1d5db', fontSize: 10 }}>—</span>;
                                            const mins = dayjs(record.droppedOffAt).diff(dayjs(record.pickedUpAt), 'minute');
                                            const hours = Math.floor(mins / 60);
                                            const remainingMins = mins % 60;
                                            const text = hours > 0 ? `${hours}s ${remainingMins}dk` : `${mins}dk`;
                                            return <span style={{ fontSize: 11, fontWeight: 700, color: '#0891b2', background: '#cffafe', padding: '2px 6px', borderRadius: 4 }}>{text}</span>;
                                        }
                                    },
                                    {
                                        title: 'ŞOFÖR',
                                        key: 'driver',
                                        width: 140,
                                        sorter: (a: any, b: any) => {
                                            const da = drivers.find((dr: any) => (dr.user?.id || dr.id) === a.driverId);
                                            const db = drivers.find((dr: any) => (dr.user?.id || dr.id) === b.driverId);
                                            return (da ? `${da.firstName} ${da.lastName}` : '').localeCompare(db ? `${db.firstName} ${db.lastName}` : '');
                                        },
                                        render: (_: any, record: any) => {
                                            const d = drivers.find((dr: any) => (dr.user?.id || dr.id) === record.driverId);
                                            return d ? (
                                                <div style={{ lineHeight: 1.3 }}>
                                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1e1b4b' }}>👤 {d.firstName} {d.lastName}</div>
                                                </div>
                                            ) : <span style={{ color: '#d1d5db', fontSize: 10 }}>Atanmadı</span>;
                                        }
                                    },
                                    {
                                        title: 'ARAÇ',
                                        key: 'vehicle',
                                        width: 140,
                                        render: (_: any, record: any) => {
                                            const v = vehicles.find((vh: any) => vh.id === record.assignedVehicleId);
                                            if (!v) return <span style={{ color: '#d1d5db', fontSize: 10 }}>Atanmadı</span>;
                                            return (
                                                <div style={{ lineHeight: 1.3 }}>
                                                    <Tag color="blue" style={{ fontSize: 10, margin: 0, fontWeight: 700 }}>🚗 {v.plateNumber}</Tag>
                                                    {v.model && <div style={{ fontSize: 9, color: '#6b7280', marginTop: 1 }}>{v.model}</div>}
                                                </div>
                                            );
                                        }
                                    },
                                    {
                                        title: 'ARAÇ TİPİ',
                                        key: 'vehicleType',
                                        width: 110,
                                        ellipsis: true,
                                        render: (_: any, record: any) => (
                                            <span style={{ fontSize: 10, color: '#6b7280' }}>{record.vehicleType || record.metadata?.vehicleType || '—'}</span>
                                        )
                                    },
                                    {
                                        title: 'EKSTRA HİZMET',
                                        key: 'extraServices',
                                        width: 130,
                                        render: (_: any, record: any) => {
                                            const services = record.metadata?.extraServices || [];
                                            if (!services.length) return <span style={{ color: '#d1d5db', fontSize: 10 }}>—</span>;
                                            return (
                                                <Tooltip title={services.map((s: any) => typeof s === 'string' ? s : s.name).join(', ')}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                                        {services.slice(0, 3).map((s: any, i: number) => (
                                                            <Tag key={i} color="volcano" style={{ fontSize: 9, margin: 0, padding: '0 4px' }}>
                                                                {typeof s === 'string' ? s : s.name}
                                                            </Tag>
                                                        ))}
                                                        {services.length > 3 && <Tag style={{ fontSize: 9, margin: 0 }}>+{services.length - 3}</Tag>}
                                                    </div>
                                                </Tooltip>
                                            );
                                        }
                                    },
                                    {
                                        title: 'ÜCRET',
                                        key: 'price',
                                        width: 100,
                                        align: 'right' as const,
                                        sorter: (a: any, b: any) => (a.price || 0) - (b.price || 0),
                                        render: (_: any, record: any) => {
                                            const price = record.price || record.total || 0;
                                            const currency = record.currency || 'TRY';
                                            const sym: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };
                                            return price > 0 ? (
                                                <span style={{ fontWeight: 700, fontSize: 12, color: '#16a34a' }}>
                                                    {price.toLocaleString('tr-TR')} {sym[currency] || currency}
                                                </span>
                                            ) : <span style={{ color: '#d1d5db', fontSize: 10 }}>—</span>;
                                        }
                                    },
                                    {
                                        title: 'ÖDEME',
                                        key: 'payment',
                                        width: 100,
                                        filters: [
                                            { text: 'Ödendi', value: 'PAID' },
                                            { text: 'Bekliyor', value: 'PENDING' },
                                        ],
                                        onFilter: (value: any, record: any) => record.paymentStatus === value,
                                        render: (_: any, record: any) => {
                                            const ps = record.paymentStatus;
                                            const pm: Record<string, { color: string; label: string }> = {
                                                PAID: { color: '#16a34a', label: '✅ Ödendi' },
                                                PENDING: { color: '#d97706', label: '⏳ Bekliyor' },
                                                REFUNDED: { color: '#dc2626', label: '↩ İade' },
                                            };
                                            const s = pm[ps] || { color: '#6b7280', label: ps || '—' };
                                            return <span style={{ fontSize: 10, fontWeight: 600, color: s.color }}>{s.label}</span>;
                                        }
                                    },
                                    {
                                        title: 'NOT',
                                        key: 'notes',
                                        width: 150,
                                        ellipsis: true,
                                        render: (_: any, record: any) => {
                                            const note = record.specialRequests || record.notes || record.internalNotes || record.metadata?.internalNotes || '';
                                            if (!note) return <span style={{ color: '#d1d5db', fontSize: 10 }}>—</span>;
                                            return (
                                                <Tooltip title={note}>
                                                    <span style={{ fontSize: 10, color: '#6b7280' }}>📝 {note.length > 40 ? note.substring(0, 40) + '...' : note}</span>
                                                </Tooltip>
                                            );
                                        }
                                    },
                                ]}
                            />
                        </div>
                    </div>
                    )}
            </div>

                    {/* Edit Columns Modal — with DnD reordering */}
                    <Modal
                        title="Sütun Düzeni ve Başlıkları"
                        open={shuttleColEditVisible}
                        onOk={() => {
                            setShuttleCols(tempShuttleCols);
                            localStorage.setItem('shuttleColConfigs', JSON.stringify(tempShuttleCols));
                            setShuttleColEditVisible(false);
                            message.success('Sütun ayarları kaydedildi');
                        }}
                        onCancel={() => setShuttleColEditVisible(false)}
                        width={640}
                    >
                        <div style={{ marginBottom: 10, fontSize: 12, color: '#6366f1', background: '#f5f3ff', padding: '6px 12px', borderRadius: 6 }}>
                            💡 Sütunları sürükleyerek sırasını değiştirebilirsiniz.
                        </div>
                        <DndContext
                            sensors={sensors}
                            onDragEnd={(event: DragEndEvent) => {
                                const { active, over } = event;
                                if (active.id !== over?.id) {
                                    setTempShuttleCols(prev => {
                                        const oldIdx = prev.findIndex(c => c.key === active.id);
                                        const newIdx = prev.findIndex(c => c.key === over?.id);
                                        return arrayMove(prev, oldIdx, newIdx);
                                    });
                                }
                            }}
                        >
                            <SortableContext items={tempShuttleCols.map(c => c.key)} strategy={verticalListSortingStrategy}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '60vh', overflowY: 'auto', padding: '4px 2px' }}>
                                    {tempShuttleCols.map((col: any) => (
                                        <ColSortableItem
                                            key={col.key}
                                            col={col}
                                            onLabelChange={(newLabel: string) => {
                                                setTempShuttleCols(prev => prev.map(c => c.key === col.key ? { ...c, label: newLabel } : c));
                                            }}
                                            onVisibilityChange={(checked: boolean) => {
                                                setTempShuttleCols(prev => prev.map(c => c.key === col.key ? { ...c, hidden: !checked } : c));
                                            }}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    </Modal>

                    {/* Color Settings Modal */}
                    <Modal
                        title="Renk Ayarları"
                        open={shuttleColorVisible}
                        onOk={() => {
                            setShuttleColors(tempShuttleColors);
                            localStorage.setItem('shuttleColors_v2', JSON.stringify(tempShuttleColors));
                            setShuttleColorVisible(false);
                            message.success('Renk ayarları kaydedildi');
                        }}
                        onCancel={() => setShuttleColorVisible(false)}
                        width={600}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {Object.entries(tempShuttleColors).map(([status, color]: [string, any]) => (
                                <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span style={{ width: 120, fontSize: 12, fontWeight: 600 }}>{status}</span>
                                    <input
                                        type="color"
                                        value={color || '#ffffff'}
                                        onChange={(e) => setTempShuttleColors(prev => ({ ...prev, [status]: e.target.value }))}
                                        style={{ width: 50, height: 32, border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}
                                    />
                                    <div style={{ flex: 1, height: 24, background: color, borderRadius: 4, border: '1px solid #eee' }} />
                                </div>
                            ))}
                        </div>
                    </Modal>

                    {/* Edit Run Modal */}
                    <Modal
                        title="✏️ Seferi Düzenle"
                        open={!!editRunModal}
                        onOk={handleEditRunSave}
                        onCancel={() => setEditRunModal(null)}
                        okText="Güncelle"
                        cancelText="İptal"
                        width={420}
                    >
                        {editRunModal && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div>
                                    <div style={{ marginBottom: 6, fontWeight: 600, color: '#374151' }}>Kalkış Saati</div>
                                    <Input
                                        type="time"
                                        value={editRunModal.time}
                                        onChange={(e) => setEditRunModal(prev => prev ? { ...prev, time: e.target.value } : null)}
                                        style={{ fontSize: 18, fontWeight: 700, textAlign: 'center' }}
                                    />
                                </div>
                                <div>
                                    <div style={{ marginBottom: 6, fontWeight: 600, color: '#374151' }}>Rota / Güzergah Adı</div>
                                    <Input
                                        value={editRunModal.name}
                                        onChange={(e) => setEditRunModal(prev => prev ? { ...prev, name: e.target.value } : null)}
                                        placeholder="Örn: Alanya → Gazipaşa Havalimanı"
                                    />
                                </div>
                            </div>
                        )}
                    </Modal>

                    {/* Map Modal */}
                    <Modal
                        title={mapModal ? `📍 ${mapModal.name} — Alış Noktası` : ''}
                        open={!!mapModal}
                        onCancel={() => setMapModal(null)}
                        footer={<Button onClick={() => setMapModal(null)}>Kapat</Button>}
                        width={800}
                    >
                        {mapModal && (
                            <iframe
                                src={`https://maps.google.com/maps?q=${encodeURIComponent(mapModal.pickup)}&output=embed&hl=tr`}
                                width="100%"
                                height="450"
                                style={{ border: 0, borderRadius: 10 }}
                                loading="lazy"
                            />
                        )}
                    </Modal>
                {/* ===== PRIVATE MODE: RENKLER MODAL ===== */}
                    <Modal
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 18 }}>🎨</span>
                                <span>Transfer Durumu Renk Ayarları</span>
                            </div>
                        }
                        open={colorModalVisible}
                        onOk={saveColors}
                        onCancel={() => setColorModalVisible(false)}
                        okText="Kaydet"
                        cancelText="İptal"
                        width={700}
                        footer={(
                            <Space>
                                <Button onClick={resetColors}>Varsayılana Dön</Button>
                                <Button onClick={() => setColorModalVisible(false)}>İptal</Button>
                                <Button type="primary" onClick={saveColors}>Kaydet</Button>
                            </Space>
                        )}
                    >
                        <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16 }}>
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: '#374151' }}>
                                    📊 Durum Renkleri
                                </div>
                                <div style={{ marginBottom: 12, fontSize: 12, color: '#6366f1', background: '#f0f4ff', padding: '8px 12px', borderRadius: 6 }}>
                                    💡 Her durum için satır arka plan rengini seçin.
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {Object.entries(tempColors).filter(([status]) => status !== 'OPERASYONDA').map(([status, color]: [string, any]) => (
                                        <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: color, borderRadius: 8, border: '1px solid #e5e7eb' }}>
                                            <span style={{ width: 140, fontSize: 12, fontWeight: 600 }}>{STATUS_LABELS[status] || status}</span>
                                            <input
                                                type="color"
                                                value={color || '#ffffff'}
                                                onChange={(e) => setTempColors(prev => ({ ...prev, [status]: e.target.value }))}
                                                style={{ width: 44, height: 36, border: '2px solid #ddd', borderRadius: 6, cursor: 'pointer', padding: 2 }}
                                            />
                                            <div style={{ flex: 1, height: 28, background: color, borderRadius: 6, border: '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', paddingLeft: 10, fontSize: 11, color: '#374151' }}>
                                                {color}
                                            </div>
                                            <button
                                                style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 11, background: '#fff' }}
                                                onClick={() => setTempColors(prev => ({ ...prev, [status]: DEFAULT_COLORS[status] }))}
                                            >
                                                Sıfırla
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: 16, marginTop: 16 }}>
                                <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: '#374151' }}>
                                    ✈️ IATA Kod Renkleri
                                </div>
                                <div style={{ marginBottom: 12, fontSize: 12, color: '#10b981', background: '#f0fdf4', padding: '8px 12px', borderRadius: 6 }}>
                                    💡 IATA koduna göre satır renklendirme. Örnek: AYT → Yeşil, GZP → Sarı
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {['AYT', 'GZP', 'IST', 'SAW', 'DLM', 'BJV', 'ADB'].map(code => {
                                        const color = airportColors[code] || '#f0f0f0';
                                        return (
                                            <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: color, borderRadius: 8, border: '1px solid #e5e7eb' }}>
                                                <span style={{ width: 60, fontSize: 12, fontWeight: 600 }}>{code}</span>
                                                <input
                                                    type="color"
                                                    value={color}
                                                    onChange={(e) => handleAirportColorChange(code, e.target.value)}
                                                    style={{ width: 44, height: 36, border: '2px solid #ddd', borderRadius: 6, cursor: 'pointer', padding: 2 }}
                                                />
                                                <div style={{ flex: 1, height: 28, background: color, borderRadius: 6, border: '1px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', paddingLeft: 10, fontSize: 11, color: '#374151' }}>
                                                    {color}
                                                </div>
                                                <button
                                                    style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 11, background: '#fff' }}
                                                    onClick={() => handleAirportColorChange(code, '#f0f0f0')}
                                                >
                                                    Sıfırla
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </Modal>

                    {/* ===== KOLON BAŞLIKLARI MODAL ===== */}
                    <Modal
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 18 }}>📝</span>
                                <span>Kolon Başlıklarını Düzenle</span>
                            </div>
                        }
                        open={columnTitlesModalVisible}
                        onCancel={() => setColumnTitlesModalVisible(false)}
                        width={700}
                        footer={(
                            <Space>
                                <Button onClick={() => setColumnTitlesModalVisible(false)}>İptal</Button>
                                <Button type="primary" onClick={async () => {
                                    try {
                                        const res = await apiClient.get('/api/auth/metadata');
                                        const currentMeta = res.data?.data || {};
                                        const currentPrefs = currentMeta.operations_preferences || {};
                                        const newPrefs = { ...currentPrefs, columnTitles: tempColumnTitles };
                                        await apiClient.put('/api/auth/metadata', { 
                                            preferences: { operations_preferences: newPrefs } 
                                        });
                                        setColumnTitles(tempColumnTitles);
                                        setColumnTitlesModalVisible(false);
                                        message.success('Başlıklar kaydedildi, yenileniyor...');
                                        setTimeout(() => window.location.reload(), 500);
                                    } catch (e) {
                                        console.error('Save error:', e);
                                        message.error('Kaydetme başarısız');
                                    }
                                }}>Kaydet ve Uygula</Button>
                            </Space>
                        )}
                    >
                        <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16 }}>
                            <div style={{ marginBottom: 12, fontSize: 12, color: '#6366f1', background: '#f0f4ff', padding: '8px 12px', borderRadius: 6 }}>
                                💡 Her kolon için özel başlık belirleyebilirsiniz. Boş bırakırsanız varsayılan başlık kullanılır.
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxHeight: 500, overflowY: 'auto', padding: 4 }}>
                                {[
                                    { key: 'index', default: '#' },
                                    { key: 'bookingNumber', default: 'T.KOD' },
                                    { key: 'direction', default: 'YÖN' },
                                    { key: 'partnerName', default: 'ACENTE' },
                                    { key: 'paymentType', default: 'ÖDEME' },
                                    { key: 'customerNote', default: 'MÜŞTERİ NOTU' },
                                    { key: 'internalNotes', default: 'OP. NOTU' },
                                    { key: 'customerName', default: 'MÜŞTERİ ADI' },
                                    { key: 'contactPhone', default: 'TELEFON' },
                                    { key: 'date', default: 'TARİH' },
                                    { key: 'airportCode', default: 'IATA' },
                                    { key: 'pickupRegionCode', default: 'ALIŞ BÖLGE' },
                                    { key: 'dropoffRegionCode', default: 'VARIŞ BÖLGE' },
                                    { key: 'status', default: 'DURUM' },
                                    { key: 'driver', default: 'ŞOFÖR' },
                                    { key: 'vehicle', default: 'ARAÇ' },
                                    { key: 'time', default: 'TRANSFER SAATİ' },
                                    { key: 'flightTime', default: 'UÇUŞ SAATİ' },
                                    { key: 'flightCode', default: 'UÇUŞ KODU' },
                                    { key: 'pax', default: 'PAX' },
                                    { key: 'pickup', default: 'ALIŞ YERİ' },
                                    { key: 'dropoff', default: 'BIRAKIŞ YERİ' },
                                    { key: 'extraServices', default: 'EKSTRA' },
                                    { key: 'actions', default: 'İŞLEM' },
                                ].map(({ key, default: defaultTitle }) => {
                                    const currentValue = tempColumnTitles[key] || '';
                                    return (
                                        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <Text style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>
                                                {defaultTitle}
                                            </Text>
                                            <Input
                                                size="small"
                                                placeholder={`Varsayılan: ${defaultTitle}`}
                                                value={currentValue}
                                                onChange={(e) => {
                                                    const newValue = e.target.value;
                                                    setTempColumnTitles(prev => ({
                                                        ...prev,
                                                        [key]: newValue
                                                    }));
                                                }}
                                                allowClear
                                                onClear={() => {
                                                    setTempColumnTitles(prev => {
                                                        const newTitles = { ...prev };
                                                        delete newTitles[key];
                                                        return newTitles;
                                                    });
                                                }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </Modal>

                    {/* ===== REZERVASYON GERİ AT MODAL ===== */}
                    <Modal
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 18 }}>↩️</span>
                                <span>Rezervasyonu Geri Al</span>
                                <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 400 }}>
                                    Bu işlem rezervasyonu "Beklemede" durumuna alır
                                </div>
                            </div>
                        }
                        open={!!returnModal}
                        onCancel={() => setReturnModal(null)}
                        width={520}
                        footer={(
                            <Space>
                                <Button onClick={() => setReturnModal(null)} disabled={returnSaving}>İptal</Button>
                                <Button
                                    type="primary"
                                    danger
                                    loading={returnSaving}
                                    disabled={!returnModal?.reason?.trim()}
                                    onClick={handleReturnToReservation}
                                >
                                    ↩ Geri Al
                                </Button>
                            </Space>
                        )}
                    >
                        {returnModal && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px' }}>
                                    <div style={{ fontWeight: 600, fontSize: 13, color: '#92400e', marginBottom: 4 }}>
                                        ⚠️ Dikkat!
                                    </div>
                                    <div style={{ fontSize: 12, color: '#78350f' }}>
                                        <strong>{returnModal.booking?.contactName || returnModal.booking?.bookingNumber}</strong> no'lu rezervasyon
                                        operasyondan çıkarılarak <strong>Beklemede</strong> durumuna alınacak.
                                        Sürücü/araç ataması temizlenecektir.
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
                                        📝 Geri Alma Nedeni <span style={{ color: '#ef4444' }}>*</span>
                                    </div>
                                    <div style={{ marginBottom: 6, fontSize: 11, color: '#6b7280' }}>
                                        Rezervasyon departmanı bu neden ile bilgilendirilecek
                                    </div>
                                    <Input.TextArea
                                        rows={4}
                                        placeholder="Örn: Şoför hasta, sefer iptal edildi, araç arızalı, vb..."
                                        value={returnModal.reason}
                                        onChange={(e) => setReturnModal(prev => prev ? { ...prev, reason: e.target.value } : null)}
                                        style={{ resize: 'none', borderColor: returnModal.reason?.trim() ? '#6366f1' : '#fca5a5' }}
                                        maxLength={500}
                                        showCount
                                    />
                                    {!returnModal.reason?.trim() && (
                                        <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>
                                            ⚠️ Neden girmeden geri alma işlemi yapılamaz
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </Modal>

                    {/* ══════ SHUTTLE BOOKING DETAIL MODAL ══════ */}
                    <Modal
                        open={!!shuttleDetailModal}
                        onCancel={() => setShuttleDetailModal(null)}
                        footer={null}
                        width={640}
                        title={null}
                        styles={{ body: { padding: 0 } }}
                    >
                        {shuttleDetailModal && (() => {
                            const b = shuttleDetailModal.booking;
                            const statusMap: Record<string, { color: string; label: string }> = {
                                CONFIRMED: { color: '#2563eb', label: 'Onaylı' },
                                PENDING: { color: '#d97706', label: 'Bekliyor' },
                                COMPLETED: { color: '#16a34a', label: 'Tamamlandı' },
                                CANCELLED: { color: '#dc2626', label: 'İptal' },
                                IN_OPERATION: { color: '#7c3aed', label: 'Operasyonda' },
                                POOL: { color: '#f59e0b', label: 'Havuzda' },
                            };
                            const st = statusMap[b.status] || { color: '#6b7280', label: b.status };
                            const pickupTime = b.pickupDateTime ? new Date(b.pickupDateTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '-';
                            const pickupDate = b.pickupDateTime ? new Date(b.pickupDateTime).toLocaleDateString('tr-TR') : '-';
                            return (
                                <div>
                                    {/* Header */}
                                    <div style={{
                                        background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                        padding: '20px 24px',
                                        color: '#fff',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: 20, fontWeight: 800 }}>{b.contactName}</div>
                                            <div style={{ opacity: 0.85, fontSize: 13, marginTop: 4 }}>{b.bookingNumber}</div>
                                        </div>
                                        <span style={{
                                            background: st.color + '30', color: '#fff', border: `1px solid ${st.color}`,
                                            padding: '4px 14px', borderRadius: 20, fontWeight: 700, fontSize: 12
                                        }}>
                                            {st.label}
                                        </span>
                                    </div>

                                    {/* Body */}
                                    <div style={{ padding: '20px 24px' }}>
                                        {/* Info Grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                                            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px', border: '1px solid #e2e8f0' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Tarih / Saat</div>
                                                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 14 }}>📅 {pickupDate} — {pickupTime}</div>
                                            </div>
                                            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px', border: '1px solid #e2e8f0' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Telefon</div>
                                                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 14 }}>📞 {b.contactPhone || '-'}</div>
                                            </div>
                                            <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '12px 16px', border: '1px solid #bbf7d0' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Alış Noktası</div>
                                                <div style={{ fontWeight: 600, color: '#15803d', fontSize: 13 }}>📍 {b.pickup || '-'}</div>
                                            </div>
                                            <div style={{ background: '#fef2f2', borderRadius: 10, padding: '12px 16px', border: '1px solid #fecaca' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Bırakış Noktası</div>
                                                <div style={{ fontWeight: 600, color: '#dc2626', fontSize: 13 }}>📍 {b.dropoff || '-'}</div>
                                            </div>
                                            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px', border: '1px solid #e2e8f0' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Uçuş</div>
                                                <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 14 }}>✈️ {b.flightNumber || '-'} {b.flightTime ? `(${b.flightTime})` : ''}</div>
                                            </div>
                                            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px', border: '1px solid #e2e8f0' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Yolcu</div>
                                                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 14 }}>
                                                    👥 {(b.adults || 1) + (b.children || 0) + (b.infants || 0)} kişi
                                                    {((b.children || 0) > 0 || (b.infants || 0) > 0) && (
                                                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500, marginLeft: 6 }}>
                                                            ({b.adults || 1} Yetişkin{b.children > 0 ? `, ${b.children} Çocuk` : ''}{b.infants > 0 ? `, ${b.infants} Bebek` : ''})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {b.notes && (
                                            <div style={{ background: '#fffbeb', borderRadius: 10, padding: '12px 16px', border: '1px solid #fde68a', marginBottom: 20 }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', marginBottom: 4 }}>Not</div>
                                                <div style={{ fontSize: 13, color: '#78350f' }}>{b.notes}</div>
                                            </div>
                                        )}

                                        {/* Status Change */}
                                        <div style={{
                                            background: '#f5f3ff', borderRadius: 12, padding: '16px 20px',
                                            border: '1px solid #e9d5ff', marginBottom: 16
                                        }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: '#5b21b6', marginBottom: 10 }}>DURUM DEĞİŞTİR</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                {[
                                                    { value: 'CONFIRMED', label: '✅ Onayla', color: '#2563eb' },
                                                    { value: 'COMPLETED', label: '🏁 Tamamla', color: '#16a34a' },
                                                    { value: 'CANCELLED', label: '❌ İptal', color: '#dc2626' },
                                                    { value: 'IN_OPERATION', label: '🚗 Operasyonda', color: '#7c3aed' },
                                                ].map(opt => (
                                                    <Button
                                                        key={opt.value}
                                                        size="small"
                                                        loading={shuttleDetailStatusSaving}
                                                        disabled={b.status === opt.value}
                                                        onClick={() => handleShuttleStatusChange(b.id, opt.value)}
                                                        style={{
                                                            borderRadius: 8,
                                                            fontWeight: 700,
                                                            fontSize: 11,
                                                            background: b.status === opt.value ? opt.color : '#fff',
                                                            color: b.status === opt.value ? '#fff' : opt.color,
                                                            border: `1.5px solid ${opt.color}`,
                                                            opacity: b.status === opt.value ? 0.6 : 1,
                                                        }}
                                                    >
                                                        {opt.label}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Pool Transfer Button */}
                                        <Button
                                            block
                                            size="large"
                                            onClick={() => {
                                                setPoolTransferModal({
                                                    booking: b,
                                                    price: b.metadata?.price || b.price || 0,
                                                    currency: b.metadata?.currency || defaultCurrency
                                                });
                                            }}
                                            style={{
                                                borderRadius: 12,
                                                fontWeight: 800,
                                                fontSize: 14,
                                                height: 48,
                                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                                color: '#fff',
                                                border: 'none',
                                                boxShadow: '0 4px 14px rgba(245,158,11,0.3)',
                                            }}
                                        >
                                            📦 Havuza Aktar
                                        </Button>
                                    </div>
                                </div>
                            );
                        })()}
                    </Modal>

                    {/* ══════ POOL TRANSFER PRICE MODAL ══════ */}
                    <Modal
                        open={!!poolTransferModal}
                        onCancel={() => setPoolTransferModal(null)}
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 18
                                }}>📦</span>
                                <div>
                                    <div style={{ fontWeight: 800, fontSize: 16 }}>Havuza Aktar</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>{poolTransferModal?.booking?.contactName} — {poolTransferModal?.booking?.bookingNumber}</div>
                                </div>
                            </div>
                        }
                        okText="Havuza Aktar"
                        cancelText="İptal"
                        confirmLoading={poolTransferSaving}
                        onOk={handlePoolTransfer}
                        okButtonProps={{
                            style: { background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', fontWeight: 700, height: 40, borderRadius: 10 }
                        }}
                    >
                        {poolTransferModal && (
                            <div style={{ marginTop: 16 }}>
                                <div style={{
                                    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
                                    padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#92400e'
                                }}>
                                    ⚠️ Bu transfer, havuza aktarılacak ve partner'lere açılacaktır. Lütfen havuz fiyatını belirleyin.
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ fontWeight: 700, fontSize: 13, color: '#374151', display: 'block', marginBottom: 6 }}>Havuz Fiyatı</label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <Input
                                            type="number"
                                            size="large"
                                            value={poolTransferModal.price}
                                            onChange={e => setPoolTransferModal(prev => prev ? { ...prev, price: Number(e.target.value) } : null)}
                                            style={{
                                                flex: 1, borderRadius: 10, fontWeight: 700, fontSize: 18,
                                                border: '2px solid #f59e0b'
                                            }}
                                            min={0}
                                        />
                                        <Select
                                            size="large"
                                            value={poolTransferModal.currency}
                                            onChange={val => setPoolTransferModal(prev => prev ? { ...prev, currency: val } : null)}
                                            style={{ width: 100, borderRadius: 10 }}
                                        >
                                            {currencies.map(c => (
                                                <Option key={c.code} value={c.code}>{c.code} {c.symbol ? c.symbol : ''}</Option>
                                            ))}
                                            {currencies.length === 0 && (
                                                <>
                                                    <Option value="EUR">EUR €</Option>
                                                    <Option value="TRY">TRY ₺</Option>
                                                    <Option value="USD">USD $</Option>
                                                    <Option value="GBP">GBP £</Option>
                                                </>
                                            )}
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Modal>

                    {/* ══════ MANUALLY ADD SHUTTLE RUN MODAL ══════ */}
                    <Modal
                        open={isManualModalVisible}
                        title="Manuel Sefer Ekle"
                        onCancel={() => setIsManualModalVisible(false)}
                        onOk={handleAddManualRun}
                        okText="Ekle"
                        cancelText="İptal"
                    >
                        <div style={{ marginTop: 24, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Tarih</label>
                                <Input disabled value={filters.dateRange[0].format('DD.MM.YYYY')} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Sefer Saati <span style={{ color: 'red' }}>*</span></label>
                                <Input type="time" value={manualRunTime} onChange={e => setManualRunTime(e.target.value)} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Rota Adı <span style={{ color: 'red' }}>*</span></label>
                                <Input placeholder="Örn: Serik -> Kemer" value={manualRunName} onChange={e => setManualRunName(e.target.value)} />
                            </div>
                        </div>
                    </Modal>

                    {/* ══════ CONFLICT MODAL ══════ */}
                    <Modal
                        open={conflictModal?.visible || false}
                        onCancel={() => setConflictModal(null)}
                        title={<span style={{ color: '#dc2626', fontWeight: 800 }}>⚠️ Çakışma Tespit Edildi</span>}
                        footer={[
                            <Button key="cancel" onClick={() => setConflictModal(null)}>
                                Vazgeç
                            </Button>,
                            <Button key="force" danger type="primary" onClick={() => conflictModal?.onForceAssign()}>
                                Yine de Ata
                            </Button>
                        ]}
                    >
                        {conflictModal && (
                            <div style={{ marginTop: 16 }}>
                                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>
                                    {conflictModal.message}
                                </div>
                                <div style={{ background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca' }}>
                                    <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>Çakışan Transfer Bilgileri:</div>
                                    <div style={{ fontSize: 13, color: '#7f1d1d' }}>
                                        <div><strong>Rezervasyon:</strong> {conflictModal.conflictWith}</div>
                                        <div><strong>Alış:</strong> {conflictModal.conflictPickup}</div>
                                        <div><strong>Varış:</strong> {conflictModal.conflictDropoff}</div>
                                        <div><strong>Başlangıç:</strong> {conflictModal.conflictStart}</div>
                                        <div><strong>Tahmini Bitiş:</strong> {conflictModal.freeAt}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Modal>

            </AdminLayout>


        </AdminGuard >
    );
}
