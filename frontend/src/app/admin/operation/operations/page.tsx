'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    Table, Card, Tag, Button, Space, Typography, message,
    Row, Col, DatePicker, Select, Input, Checkbox, Popover, Badge,
    Avatar, Tooltip, Modal, Segmented, Spin
} from 'antd';
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
    PlusOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import AdminLayout from '../../AdminLayout';
import AdminGuard from '../../AdminGuard';
import apiClient from '@/lib/api-client';
import type { ColumnsType } from 'antd/es/table';

import { useSocket } from '@/app/context/SocketContext';

// DnD Imports
import type { DragEndEvent } from '@dnd-kit/core';
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable } from '@dnd-kit/core';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import {
    arrayMove,
    SortableContext,
    useSortable,
    horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

dayjs.locale('tr');

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

// Custom Resizable & Draggable Title Component
const ResizableTitle = (props: any) => {
    const { onResize, width, id, ...restProps } = props;

    // Sortable Hook
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: id,
    });

    const style: React.CSSProperties = {
        ...restProps.style,
        transform: CSS.Translate.toString(transform),
        transition,
        position: 'relative',
        cursor: 'move',
        zIndex: isDragging ? 9999 : undefined,
    };

    if (!width) {
        return <th {...restProps} />;
    }

    // State to track if resizing is active
    const [isResizing, setIsResizing] = useState(false);
    // Ref to track start position and width
    const resizingRef = useRef<{ startX: number; startWidth: number } | null>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation(); // Stop propagation to prevent drag start
        setIsResizing(true);
        resizingRef.current = {
            startX: e.clientX,
            startWidth: width,
        };

        // Add listeners to window to handle movement outside the header
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!resizingRef.current) return;

        const deltaX = e.clientX - resizingRef.current.startX;
        const newWidth = Math.max(50, resizingRef.current.startWidth + deltaX); // Min width 50px

        onResize(e, { size: { width: newWidth } });
    };

    const handleMouseUp = () => {
        setIsResizing(false);
        resizingRef.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };

    return (
        <th
            {...restProps}
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
        >
            {restProps.children}
            <div
                onMouseDown={handleMouseDown}
                onClick={(e) => e.stopPropagation()}
                title="Genişliği Ayarla"
                style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: '10px',
                    cursor: 'col-resize',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isResizing ? '#1890ff' : 'transparent', // Highlight when resizing
                }}
            >
                <div style={{ width: '1px', height: '60%', backgroundColor: '#ccc' }} />
            </div>
        </th>
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

const DraggablePassengerItem = ({ booking, children }: { booking: any, children: React.ReactNode }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: booking.id,
        data: { booking }
    });
    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 999 : 1,
        opacity: isDragging ? 0.8 : 1,
        boxShadow: isDragging ? '0 5px 15px rgba(0,0,0,0.2)' : 'none',
    } : undefined;
    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
            {children}
        </div>
    );
};
// ------------------------------

export default function OperationsPage() {
    const [bookings, setBookings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem('operationsHiddenColumns');
            return saved ? new Set(JSON.parse(saved)) : new Set();
        } catch { return new Set(); }
    });
    const { socket } = useSocket();

    const [isManualModalVisible, setIsManualModalVisible] = useState(false);
    const [manualRunTime, setManualRunTime] = useState('');
    const [manualRunName, setManualRunName] = useState('');

    const handleAddManualRun = () => {
        if (!manualRunTime || !manualRunName) {
            message.error("Lütfen saat ve rota adı girin.");
            return;
        }
        const newRunId = `MANUAL::${Date.now()}`;
        const newRun = {
            runKey: newRunId,
            departureTime: manualRunTime,
            routeName: manualRunName,
            isManual: true,
            manualRunId: newRunId,
            bookings: []
        };
        // Ensure shuttleRuns is preserved if it already exists, otherwise need to adjust where this goes
        // Because shuttleRuns is not in this chunk, I will use setShuttleRuns directly assuming it exists.
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
        HAVUZDA: 'Havuzda',
    };
    const DEFAULT_COLORS: Record<string, string> = {
        PENDING: '#e6f4ff',
        CONFIRMED: '#f6ffed',
        PASSENGER_PICKED_UP: '#fff7e6',
        ON_THE_WAY: '#e6fffb',
        COMPLETED: '#f9f9f9',
        CANCELLED: '#fff1f0',
        OPERASYONDA: '#f0f5ff',
        HAVUZDA: '#fff0f6',
    };
    const [statusColors, setStatusColors] = useState<Record<string, string>>(() => {
        try {
            const saved = localStorage.getItem('operationsStatusColors');
            return saved ? { ...DEFAULT_COLORS, ...JSON.parse(saved) } : DEFAULT_COLORS;
        } catch { return DEFAULT_COLORS; }
    });
    const [colorModalVisible, setColorModalVisible] = useState(false);
    const [tempColors, setTempColors] = useState<Record<string, string>>(DEFAULT_COLORS);


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
            width: 50,
            render: (_: any, __: any, index: number) => index + 1,
        },
        {
            title: 'T.KOD',
            dataIndex: 'bookingNumber',
            key: 'bookingNumber',
            width: 120,
            render: (text: string) => <Tag color="blue">{text}</Tag>,
        },
        {
            title: 'YÖN',
            dataIndex: 'direction',
            key: 'direction',
            width: 110,
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
            title: 'S/N',
            key: 'sn',
            width: 60,
            render: () => <Button size="small" type="text" icon={<InfoCircleOutlined />} />
        },
        {
            title: 'ALT ACENTE',
            key: 'subAgency',
            width: 120,
            render: () => <Text type="secondary">-</Text>
        },
        {
            title: 'ACENTE',
            key: 'partnerName',
            width: 150,
            render: (_: any, record: any) => {
                const name = record.agencyName || record.agency?.name || record.partnerName;
                return <Text strong>{name || 'Direkt'}</Text>;
            }
        },
        {
            title: 'ACENTE NOT',
            dataIndex: 'agencyNote',
            key: 'agencyNote',
            width: 100,
            render: (text: string) => (
                text ?
                    <Popover content={text} title="Acente Notu">
                        <InfoCircleOutlined style={{ color: '#faad14' }} />
                    </Popover> : '-'
            )
        },
        {
            title: 'AD SOYAD',
            key: 'customerName',
            width: 180,
            render: (_: any, record: any) => {
                const name = record.contactName || record.customer?.name || record.passengerName || '';
                return <Text style={{ textTransform: 'uppercase' }}>{name || <Text type="secondary">—</Text>}</Text>;
            }
        },
        {
            title: 'REZ. TARİHİ',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 110,
            render: (val: string) => val ? (
                <Space direction="vertical" size={0}>
                    <Text style={{ fontSize: 12 }}>{dayjs(val).format('DD.MM.YYYY')}</Text>
                    <Text type="secondary" style={{ fontSize: 10 }}>{dayjs(val).format('HH:mm')}</Text>
                </Space>
            ) : '-'
        },
        {
            title: 'TARİH',
            dataIndex: 'pickupDateTime',
            key: 'date',
            width: 100,
            render: (val: string) => dayjs(val).format('DD.MM.YYYY')
        },
        {
            title: 'DURUM',
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (status: string) => {
                const map: any = { 'CONFIRMED': 'blue', 'PENDING': 'orange', 'COMPLETED': 'green', 'CANCELLED': 'red', 'IN_PROGRESS': 'purple' };
                const label: any = { 'CONFIRMED': 'Onaylı', 'PENDING': 'Bekliyor', 'COMPLETED': 'Tamamlandı', 'CANCELLED': 'İptal', 'IN_PROGRESS': 'Müşteri Alındı' };
                return <Badge status={status === 'CONFIRMED' || status === 'IN_PROGRESS' ? 'processing' : 'default'} color={map[status]} text={label[status] || status} />;
            }
        },
        {
            title: 'T.DURUM',
            dataIndex: 'operationalStatus',
            key: 'opStatus',
            width: 120,
            render: (status: string, record: any) => {
                let color = 'default';
                let text = status || 'Beklemede';
                if (status === 'IN_POOL') { color = 'cyan'; text = 'Havuzda'; }
                // Override with master status if driver has started/completed
                if (record.status === 'IN_PROGRESS') { color = 'purple'; text = 'Müşteri Alındı'; }
                if (record.status === 'COMPLETED') { color = 'green'; text = 'Tamamlandı'; }
                return <Tag color={color}>{text}</Tag>;
            }
        },
        {
            title: 'ŞOFÖR',
            dataIndex: 'driverId',
            key: 'driver',
            width: 170,
            render: (val: string, record: any) => {
                const isShuttle = record.transferType === 'SHUTTLE';

                // Get shuttle vehicle owners
                const shuttleVehicles = vehicles.filter((v: any) => v.usageType === 'SHUTTLE' || v.shuttleMode);
                const shuttleDriverIds = new Set(shuttleVehicles.filter((v: any) => v.driverId).map((v: any) => v.driverId));

                // Filter drivers pool based on transfer type
                const filteredDrivers = drivers.filter((d: any) => {
                    const driverId = d.user?.id || d.id;
                    if (isShuttle) {
                        return shuttleDriverIds.has(driverId);
                    } else {
                        return !shuttleDriverIds.has(driverId);
                    }
                });

                const options = filteredDrivers.map((d: any) => ({
                    value: d.user?.id || d.id,
                    label: `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.name || d.user?.name || d.user?.username || `Şöför (${(d.user?.id || d.id).substring(0, 8)})`
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
                    <Space size={2}>
                        <Select
                            size="small"
                            placeholder="Seçiniz"
                            style={{ width: 120 }}
                            bordered={false}
                            showSearch
                            optionFilterProp="children"
                            value={record.driverId || undefined}
                            onChange={(driverId) => handleDriverChange(record.id, driverId)}
                            options={options}
                        />
                        <Tooltip title="AI Şöför & Araç Önerisi">
                            <Button
                                size="small"
                                type="text"
                                onClick={() => handleAISuggest(record.id)}
                                style={{ padding: '0 2px', fontSize: 14 }}
                            >
                                🤖
                            </Button>
                        </Tooltip>
                        {record.driverId && (
                            <Tooltip title="Sürücüye Mesaj At">
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<MessageOutlined style={{ color: '#1890ff' }} />}
                                    onClick={() => handleOpenMessageModal(record.driverId)}
                                />
                            </Tooltip>

                        )}
                    </Space>
                );
            }
        },
        {
            title: 'ARAÇ',
            dataIndex: 'assignedVehicleId',
            key: 'vehicle',
            width: 210,
            render: (val: string, record: any) => {
                const isShuttle = record.transferType === 'SHUTTLE';

                // Filter by usageType (set in vehicle management)
                const shuttleVehicles = vehicles.filter((v: any) => v.usageType === 'SHUTTLE' || v.shuttleMode || v.metadata?.usageType === 'SHUTTLE' || v.metadata?.shuttleMode);
                const privateVehicles = vehicles.filter((v: any) => !shuttleVehicles.includes(v));

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
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        {record.vehicleType && record.vehicleType !== 'Unknown' && (
                            <Text type="secondary" style={{ fontSize: 11 }} ellipsis={{ tooltip: record.vehicleType }}>
                                <CarOutlined style={{ marginRight: 3 }} />{record.vehicleType}
                            </Text>
                        )}
                        {fallback && (
                            <Text type="warning" style={{ fontSize: 10 }}>
                                ⚠ Araç Yönetiminden tipi ayarlayın
                            </Text>
                        )}
                        <Select
                            style={{ width: 190 }}
                            placeholder={isShuttle ? 'Shuttle Araç Ata' : 'Özel Araç Ata'}
                            size="small"
                            value={record.assignedVehicleId || undefined}
                            onChange={(vehicleId) => handleVehicleChange(record.id, vehicleId)}
                            bordered={false}
                            showSearch
                            optionFilterProp="children"
                            options={options}
                        />
                    </Space>
                );
            }
        },
        {
            title: 'A.SAAT',
            dataIndex: 'pickupDateTime',
            key: 'time',
            width: 80,
            render: (val: string) => <Tag>{dayjs(val).format('HH:mm')}</Tag>
        },
        {
            title: 'UÇUŞ KODU',
            dataIndex: 'flightNumber',
            key: 'flightCode',
            width: 100,
            render: (text: string) => text || '-'
        },
        {
            title: 'TC/PASAPORT',
            dataIndex: 'passport',
            key: 'passport',
            width: 120,
        },
        {
            title: 'TELEFON',
            dataIndex: ['customer', 'phone'],
            key: 'phone',
            width: 130,
            render: (text: string) => <Text copyable>{text}</Text>
        },
        {
            title: 'PAX',
            dataIndex: ['vehicle', 'pax'],
            key: 'pax',
            width: 60,
        },
        {
            title: 'U-ETDS',
            dataIndex: 'uetds',
            key: 'uetds',
            width: 120,
            render: (text: string) => <Tag>{text}</Tag>
        },
        {
            title: 'ALIŞ YERİ',
            key: 'pickup',
            width: 220,
            render: (_: any, record: any) => {
                const loc = record.pickup?.rawLocation || record.pickup?.location || record.pickupLocation || '—';
                return (
                    <Text ellipsis={{ tooltip: loc }} style={{ fontSize: 12, maxWidth: 200 }}>
                        <EnvironmentOutlined style={{ color: '#16a34a', marginRight: 4 }} />{loc}
                    </Text>
                );
            }
        },
        {
            title: 'BIRAKIŞ YERİ',
            key: 'dropoff',
            width: 220,
            render: (_: any, record: any) => {
                const loc = record.dropoff?.rawLocation || record.dropoff?.location || record.dropoffLocation || '—';
                return (
                    <Text ellipsis={{ tooltip: loc }} style={{ fontSize: 12, maxWidth: 200 }}>
                        <EnvironmentOutlined style={{ color: '#dc2626', marginRight: 4 }} />{loc}
                    </Text>
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
    }, [columnConfig, drivers, vehicles, hiddenColumns]);

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
        };

        socket.on('booking_status_update', handleStatusUpdate);
        socket.on('new_booking', handleNewBooking);

        return () => {
            socket.off('booking_status_update', handleStatusUpdate);
            socket.off('new_booking', handleNewBooking);
        };
    }, [socket, filters.transferType, filters.direction]);

    const handleResize = (index: number) => (_e: any, { size }: any) => {
        setColumnConfig((prev: ColConfig[]) => {
            const next = [...prev];
            next[index] = { ...next[index], width: size.width };
            return next;
        });
    };

    // Drag End Handler
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            setColumnConfig((prev: ColConfig[]) => {
                const activeIndex = prev.findIndex((i: ColConfig) => i.key === active.id);
                const overIndex = prev.findIndex((i: ColConfig) => i.key === over?.id);
                return arrayMove(prev, activeIndex, overIndex);
            });
        }
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
                // Filter driver personnel - case-insensitive, handles Turkish variants
                const DRIVER_KEYWORDS = ['driver', 'şöför', 'sofor', 'sürücü', 'surucü', 'surücu'];
                const driverList = res.data.data.filter((p: any) => {
                    const title = (p.jobTitle || '').toLowerCase().trim();
                    return DRIVER_KEYWORDS.some(kw => title.includes(kw));
                });
                setDrivers(driverList);
            }
        } catch (error) {
            console.error('Error fetching drivers:', error);
        }
    };

    useEffect(() => {
        fetchVehicles();
        fetchDrivers();
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

    const handleVehicleChange = async (bookingId: string, vehicleId: string) => {
        const selectedVehicle = vehicles.find((v: any) => v.id === vehicleId);
        const autoDriverId = selectedVehicle?.driverId || null;

        const doSave = async (skip = false) => {
            const payload: any = { assignedVehicleId: vehicleId, skipConflictCheck: skip };
            if (autoDriverId) payload.driverId = autoDriverId;
            await doAssign(bookingId, payload);
            setBookings(prev => prev.map((b: any) =>
                b.id === bookingId
                    ? { ...b, assignedVehicleId: vehicleId, ...(autoDriverId ? { driverId: autoDriverId } : {}) }
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

    const handleDriverChange = async (bookingId: string, driverId: string) => {
        const autoVehicle = vehicles.find((v: any) => v.driverId === driverId) || null;
        const autoVehicleId = autoVehicle?.id || null;

        const doSave = async (skip = false) => {
            const payload: any = { driverId, skipConflictCheck: skip };
            if (autoVehicleId) payload.assignedVehicleId = autoVehicleId;
            await doAssign(bookingId, payload);
            setBookings(prev => prev.map((b: any) =>
                b.id === bookingId
                    ? { ...b, driverId, ...(autoVehicleId ? { assignedVehicleId: autoVehicleId } : {}) }
                    : b
            ));
            if (autoVehicleId) {
                message.success(`Şöför atandı — Araç: ${autoVehicle.plateNumber} otomatik seçildi`);
            } else {
                message.success('Şöför ataması güncellendi');
            }
            setConflictModal(null);
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
        setTempColors({ ...statusColors });
        setColorModalVisible(true);
    };
    const saveColors = () => {
        setStatusColors(tempColors);
        localStorage.setItem('operationsStatusColors', JSON.stringify(tempColors));
        setColorModalVisible(false);
        message.success('Renkler kaydedildi');
    };
    const resetColors = () => {
        setTempColors({ ...DEFAULT_COLORS });
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
    const [operationsMode, setOperationsMode] = useState<'private' | 'shuttle'>('private');

    // Sync mode change → automatically update the transferType filter
    const handleModeChange = (mode: 'private' | 'shuttle') => {
        setOperationsMode(mode);
        if (mode === 'private') {
            setFilters(prev => ({ ...prev, transferType: 'PRIVATE' }));
        }
        // shuttle mode has its own table (fetchShuttleRuns), no filter change needed
    };

    // ---- Shuttle Runs State ----
    const [shuttleRuns, setShuttleRuns] = useState<any[]>([]);
    const [shuttleRunsLoading, setShuttleRunsLoading] = useState(false);
    const [expandedRunKeys, setExpandedRunKeys] = useState<string[]>([]);

    const fetchShuttleRuns = async () => {
        setShuttleRunsLoading(true);
        try {
            const date = filters.dateRange[0].format('YYYY-MM-DD');
            const res = await apiClient.get(`/api/operations/shuttle-runs?date=${date}`);
            if (res.data.success) {
                setShuttleRuns(res.data.data);
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

    const handleShuttleAssign = async (run: any, driverId?: string, vehicleId?: string) => {
        const bookingIds = run.bookings.map((b: any) => b.id);
        if (bookingIds.length === 0) return;
        try {
            await apiClient.patch('/api/operations/shuttle-runs/assign', { bookingIds, driverId, vehicleId });
            // Optimistic update
            setShuttleRuns(prev => prev.map(r => {
                if (r.runKey !== run.runKey) return r;
                return {
                    ...r,
                    driverId: driverId ?? r.driverId,
                    vehicleId: vehicleId ?? r.vehicleId,
                    bookings: r.bookings.map((b: any) => ({
                        ...b,
                        driverId: driverId ?? b.driverId,
                        assignedVehicleId: vehicleId ?? b.assignedVehicleId,
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
        const targetRunKey = over.id as string;

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
        if (!sourceRun || !passenger || sourceRun.runKey === targetRunKey) return;

        const targetRun = shuttleRuns.find(r => r.runKey === targetRunKey);
        if (!targetRun) return;

        try {
            const payload: any = {
                bookingIds: [passengerId],
            };

            // If the target run has existing bookings, pass one as a sample
            // so the backend can mirror its metadata exactly (guaranteed same group key)
            if (targetRun.bookings && targetRun.bookings.length > 0) {
                payload.sampleBookingId = targetRun.bookings[0].id;
            } else {
                // New/empty run: pass explicit fields
                payload.targetRun = {
                    manualRunId: targetRun.isManual ? (targetRun.manualRunId || targetRun.runKey) : null,
                    shuttleRouteId: targetRun.isManual ? null : (targetRun.shuttleRouteId || null),
                    shuttleMasterTime: targetRun.isManual ? targetRun.departureTime : (targetRun._originalMasterTime || null),
                    manualRunName: targetRun.isManual ? targetRun.routeName : null
                };
            }
            const res = await apiClient.post('/api/operations/shuttle-runs/move', payload);
            if (res.data.success) {
                setShuttleRuns(prev => prev.map(r => {
                    if (r.runKey === sourceRun.runKey) {
                        return { ...r, bookings: r.bookings.filter((b: any) => b.id !== passengerId) };
                    }
                    if (r.runKey === targetRunKey) {
                        return { ...r, bookings: [...r.bookings, passenger] };
                    }
                    return r;
                }));
                message.success('Yolcu taşındı');
            }
        } catch (err: any) {
            console.error(err);
            message.error('Taşıma başarısız: ' + (err?.response?.data?.error || err.message));
        }
    };

    // ---- Tab State ----
    const [bookingTab, setBookingTab] = useState<'active' | 'completed'>('active');

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

                <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>

                    {/* ── FILTER BAR ── */}
                    <div style={{
                        background: '#fff',
                        borderBottom: '1px solid #e5e7eb',
                        padding: '10px 20px',
                        flexShrink: 0,
                    }}>
                        {/* Row 1: Mode toggle + Direction tabs + action buttons */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                            <Space size={8} wrap>
                                <Segmented
                                    value={operationsMode}
                                    onChange={(v) => handleModeChange(v as 'private' | 'shuttle')}
                                    options={[
                                        { label: '🚗 Özel Transferler', value: 'private' },
                                        { label: '🚌 Shuttle Seferleri', value: 'shuttle' },
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
                                            onClick={fetchShuttleRuns}
                                            loading={shuttleRunsLoading}
                                            style={{ borderRadius: 6 }}
                                        >
                                            Yenile
                                        </Button>
                                    </>
                                )}
                                <Popover
                                    trigger="click"
                                    title={<span style={{ fontWeight: 700 }}>Sütun Görünürlüğü</span>}
                                    content={
                                        <div style={{ maxHeight: 280, overflowY: 'auto', width: 180 }}>
                                            {columnConfig.map(cfg => {
                                                const def = defaultColumns.find(d => d.key === cfg.key);
                                                const label = cfg.title || def?.title || cfg.key;
                                                const isHidden = hiddenColumns.has(cfg.key);
                                                return (
                                                    <div
                                                        key={cfg.key}
                                                        onClick={() => toggleColumnVisibility(cfg.key)}
                                                        style={{
                                                            padding: '5px 8px', cursor: 'pointer', borderRadius: 4,
                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                            background: isHidden ? '#f9fafb' : '#fff',
                                                            marginBottom: 2,
                                                        }}
                                                    >
                                                        {isHidden
                                                            ? <EyeInvisibleOutlined style={{ color: '#9ca3af' }} />
                                                            : <EyeOutlined style={{ color: '#6366f1' }} />
                                                        }
                                                        <span style={{ fontSize: 12, color: isHidden ? '#9ca3af' : '#111' }}>{label}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    }
                                >
                                    <Button size="small" icon={<EyeOutlined />} style={{ borderRadius: 6 }}>Sütunlar</Button>
                                </Popover>
                                <Button size="small" icon={<EditOutlined />} onClick={openEditModal} style={{ borderRadius: 6 }}>Başlıklar</Button>
                                <Button size="small" icon={<BgColorsOutlined />} onClick={openColorModal} style={{ borderRadius: 6 }}>Renkler</Button>
                                <Button size="small" icon={<SaveOutlined />} onClick={saveLayout} style={{ borderRadius: 6 }}>Kaydet</Button>
                                <Tooltip title="Varsayılana Dön">
                                    <Button size="small" icon={<UndoOutlined />} onClick={resetLayout} style={{ borderRadius: 6 }} />
                                </Tooltip>
                                <Button size="small" icon={<ReloadOutlined />} onClick={fetchBookings} loading={loading} style={{ borderRadius: 6 }} />
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

                        {/* Row 2: Compact filters */}
                        <Row gutter={[8, 8]} align="middle">
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

                    {/* ── TABS: Aktif / Tamamlandı (only for private mode) ── */}
                    {operationsMode === 'private' && (
                        <div style={{
                            background: '#fff',
                            borderBottom: '1px solid #e5e7eb',
                            padding: '0 20px',
                            display: 'flex',
                            gap: 0,
                            flexShrink: 0,
                        }}>
                            {[
                                { key: 'active', label: 'Aktif Operasyonlar', count: activeCount, color: '#2563eb' },
                                { key: 'completed', label: 'Tamamlanan Operasyonlar', count: completedCount, color: '#16a34a' },
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setBookingTab(tab.key as 'active' | 'completed')}
                                    style={{
                                        padding: '10px 20px',
                                        border: 'none',
                                        borderBottom: bookingTab === tab.key ? `2px solid ${tab.color}` : '2px solid transparent',
                                        background: 'transparent',
                                        cursor: 'pointer',
                                        fontWeight: bookingTab === tab.key ? 700 : 500,
                                        color: bookingTab === tab.key ? tab.color : '#6b7280',
                                        fontSize: 13,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {tab.label}
                                    <span style={{
                                        background: bookingTab === tab.key ? tab.color : '#d1d5db',
                                        color: '#fff',
                                        borderRadius: 20,
                                        padding: '1px 8px',
                                        fontSize: 11,
                                        fontWeight: 700,
                                    }}>
                                        {tab.count}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ── TABLE INFO BAR ── */}
                    {operationsMode === 'private' && (
                        <div style={{
                            background: '#f8fafc',
                            borderBottom: '1px solid #e5e7eb',
                            padding: '6px 20px',
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
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                <DragOutlined /> Sütunları sürükleyip genişletebilirsiniz
                            </Text>
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
                                <Text style={{ fontSize: 12 }}>
                                    <strong>{shuttleRuns.length}</strong> sefer listeleniyor
                                </Text>
                                <Text style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>
                                    Toplam Yolcu: {shuttleRuns.reduce((sum, r) => sum + r.bookings.length, 0)}
                                </Text>
                                <Text style={{ fontSize: 11, color: '#9333ea', fontWeight: 600 }}>
                                    Atanan Sefer: {shuttleRuns.filter(r => r.driverId).length} / {shuttleRuns.length}
                                </Text>
                            </Space>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                🚌 Şöför ve araç atamak için sefer satırında açılır menüyü kullanın
                            </Text>
                        </div>
                    )}

                    {/* ── MAIN TABLE (Private mode) ── */}
                    {operationsMode === 'private' && (
                    <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
                        <DndContext
                            sensors={sensors}
                            modifiers={[restrictToHorizontalAxis]}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={(columns as any[]).filter(Boolean).map((i: any) => i.key)}
                                strategy={horizontalListSortingStrategy}
                            >
                                <Table
                                    rowKey="id"
                                    bordered
                                    columns={(columns as any[]).filter(Boolean).map((col, index) => ({
                                        ...col,
                                        onHeaderCell: (column: any) => ({
                                            width: column.width,
                                            onResize: handleResize(index),
                                            id: column.key,
                                        }),
                                    }))}
                                    components={{
                                        header: {
                                            cell: ResizableTitle,
                                        },
                                    }}
                                    dataSource={bookings.filter((b: any) => {
                                        if (bookingTab === 'completed') return b.status === 'COMPLETED';
                                        return b.status !== 'COMPLETED';
                                    })}
                                    rowClassName={(record: any) => {
                                        const color = getRowColor(record);
                                        return color ? `status-row-colored` : '';
                                    }}
                                    onRow={(record: any) => ({
                                        style: { backgroundColor: getRowColor(record) || undefined }
                                    })}
                                    loading={loading}
                                    pagination={{
                                        pageSize: 20,
                                        showSizeChanger: true,
                                        size: 'small',
                                        style: { padding: '8px 16px' }
                                    }}
                                    size="small"
                                    scroll={{ x: 1800, y: 'calc(100vh - 240px)' }}
                                    sticky
                                />
                            </SortableContext>
                        </DndContext>
                    </div>
                    )}

                    {/* ── SHUTTLE RUNS CARD PANEL (Shuttle mode) ── */}
                    {operationsMode === 'shuttle' && (
                    <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', background: '#f8fafc' }}>
                        {shuttleRunsLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
                                <Spin size="large" tip="Sefer verileri yükleniyor..." />
                            </div>
                        ) : shuttleRuns.length === 0 ? (
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                height: 380, gap: 16
                            }}>
                                <div style={{ fontSize: 64 }}>🚌</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: '#374151' }}>Bu tarihte shuttle seferi bulunamadı</div>
                                <div style={{ fontSize: 14, color: '#9ca3af', maxWidth: 400, textAlign: 'center' }}>
                                    Shuttle seferleri, rezervasyon yapılırken araç tipi "Shuttle" veya "Paylaşımlı" seçilen
                                    gruplandırılmış transferlerdir. Tarih filtresini değiştirmeyi deneyin.
                                </div>
                                <Button
                                    type="primary"
                                    icon={<ReloadOutlined />}
                                    onClick={fetchShuttleRuns}
                                    style={{ borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none' }}
                                >
                                    Yeniden Yükle
                                </Button>
                            </div>
                        ) : (
                            <DndContext onDragEnd={handleShuttleDragEnd}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                {shuttleRuns.map((run: any) => {
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

                                    const shuttleVehicles = vehicles.filter((v: any) => v.usageType === 'SHUTTLE' || v.metadata?.usageType === 'SHUTTLE');
                                    const vehicleOpts = (shuttleVehicles.length > 0 ? shuttleVehicles : vehicles).map((v: any) => ({
                                        value: v.id,
                                        label: `${v.plateNumber} – ${v.brand || ''} ${v.model || ''}`.trim()
                                    }));
                                    const driverOpts = drivers.map((d: any) => ({
                                        value: d.user?.id || d.id,
                                        label: `${d.firstName || ''} ${d.lastName || ''}`.trim()
                                    }));

                                    return (
                                        <DroppableShuttleRun key={run.runKey} runId={run.runKey}>
                                        <div style={{
                                            background: '#fff',
                                            borderRadius: 12,
                                            border: `2px solid ${isAssigned ? '#10b981' : isPartial ? '#f59e0b' : '#e5e7eb'}`,
                                            overflow: 'hidden',
                                            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                                        }}>
                                            {/* ── CARD HEADER ── */}
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                padding: '10px 14px',
                                                background: isAssigned
                                                    ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)'
                                                    : isPartial
                                                    ? 'linear-gradient(135deg, #fffbeb, #fef3c7)'
                                                    : 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                                                borderBottom: '1px solid #e5e7eb',
                                            }}>
                                                {/* Kalkış saati */}
                                                <div style={{
                                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                                    color: '#fff', borderRadius: 8,
                                                    padding: '8px 14px', fontSize: 20, fontWeight: 800,
                                                    letterSpacing: 1, minWidth: 72, textAlign: 'center', flexShrink: 0,
                                                }}>
                                                    {run.departureTime}
                                                </div>

                                                {/* Varış + Yolcu sayısı */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 800, fontSize: 15, color: '#1e293b', marginBottom: 3 }}>
                                                        🏁 {run.toName || run.routeName}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: 600, color: '#6366f1' }}>📍 {run.bookings.length} durak:</span>
                                                        {run.bookings.map((b: any, i: number) => (
                                                            <span key={b.id} style={{ background: '#e0e7ff', color: '#4338ca', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>
                                                                {b.contactName?.split(' ')[0]}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Toplam yolcu */}
                                                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                                                    <div style={{ fontWeight: 800, fontSize: 20, color: fillColor, lineHeight: 1 }}>{totalPax}</div>
                                                    <div style={{ fontSize: 10, color: '#9ca3af' }}>yolcu</div>
                                                    {capacity > 0 && (
                                                        <div style={{ width: 50, height: 4, background: '#e5e7eb', borderRadius: 3, marginTop: 3 }}>
                                                            <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: fillColor, borderRadius: 3 }} />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Durum badge */}
                                                <div style={{ flexShrink: 0 }}>
                                                    {isAssigned
                                                        ? <Tag color="success" style={{ fontWeight: 700 }}>✅ Atandı</Tag>
                                                        : isPartial
                                                        ? <Tag color="warning" style={{ fontWeight: 700 }}>⚠️ Kısmi</Tag>
                                                        : <Tag color="error" style={{ fontWeight: 700 }}>❌ Atanmadı</Tag>
                                                    }
                                                </div>
                                            </div>

                                            {/* Card Body: Assignments */}
                                            <div style={{ padding: '10px 16px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #e5e7eb' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, minWidth: 50 }}>ŞOFÖR</span>
                                                    <Select
                                                        size="small"
                                                        style={{ width: 180 }}
                                                        placeholder="Şoför seç..."
                                                        showSearch
                                                        optionFilterProp="label"
                                                        value={run.driverId || undefined}
                                                        options={driverOpts}
                                                        onChange={(v) => handleShuttleAssign(run, v, undefined)}
                                                        allowClear
                                                    />
                                                    {driverName && (
                                                        <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>👤 {driverName}</span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, minWidth: 40 }}>ARAÇ</span>
                                                    <Select
                                                        size="small"
                                                        style={{ width: 200 }}
                                                        placeholder="Araç seç..."
                                                        showSearch
                                                        optionFilterProp="label"
                                                        value={run.vehicleId || undefined}
                                                        options={vehicleOpts}
                                                        onChange={(v) => handleShuttleAssign(run, undefined, v)}
                                                        allowClear
                                                    />
                                                    {vehiclePlate && (
                                                        <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 600 }}>🚌 {vehiclePlate}</span>
                                                    )}
                                                </div>
                                                {run.pricePerSeat > 0 && (
                                                    <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>
                                                        Koltuk fiyatı: <strong style={{ color: '#1f2937' }}>₺{run.pricePerSeat}</strong>
                                                        &nbsp;·&nbsp; Toplam: <strong style={{ color: '#6366f1' }}>₺{(run.pricePerSeat * totalPax).toLocaleString()}</strong>
                                                    </div>
                                                )}
                                            </div>

                                            {/* ── ALWAYS-VISIBLE PASSENGER LIST ── */}
                                            <div style={{ background: '#fafafa' }}>
                                                {/* Column header row */}
                                                <div style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '32px 1fr 80px 200px 90px 50px 120px 80px',
                                                    gap: 0,
                                                    padding: '5px 12px',
                                                    background: '#f1f5f9',
                                                    borderBottom: '1px solid #e2e8f0',
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    color: '#64748b',
                                                    letterSpacing: 0.3,
                                                }}>
                                                    <span>#</span>
                                                    <span>MÜŞTERİ</span>
                                                    <span>ALIŞ SAATİ</span>
                                                    <span>ALIŞ NOKTASİ</span>
                                                    <span>UÇUŞ</span>
                                                    <span>PAX</span>
                                                    <span>TELEFON</span>
                                                    <span>DURUM</span>
                                                </div>
                                                {run.bookings.map((b: any, idx: number) => {
                                                    const pickupTime = b.pickupDateTime
                                                        ? new Date(b.pickupDateTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                                                        : run.departureTime;
                                                    const statusMap: any = { CONFIRMED: { color: '#2563eb', label: 'Onaylı' }, PENDING: { color: '#d97706', label: 'Bekliyor' }, COMPLETED: { color: '#16a34a', label: 'Tamamlandı' }, CANCELLED: { color: '#dc2626', label: 'İptal' } };
                                                    const st = statusMap[b.status] || { color: '#6b7280', label: b.status };
                                                    return (
                                                        <DraggablePassengerItem key={b.id} booking={b}>
                                                        <div style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: '32px 1fr 80px 200px 90px 50px 120px 80px',
                                                            gap: 0,
                                                            padding: '7px 12px',
                                                            borderBottom: idx < run.bookings.length - 1 ? '1px solid #e5e7eb' : 'none',
                                                            background: idx % 2 === 0 ? '#fff' : '#fafafa',
                                                            alignItems: 'center',
                                                            fontSize: 12,
                                                        }}>
                                                            <span style={{ color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</span>
                                                            <div>
                                                                <div style={{ fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', fontSize: 12 }}>{b.contactName}</div>
                                                                <div style={{ fontSize: 10, color: '#94a3b8' }}>{b.bookingNumber}</div>
                                                            </div>
                                                            <span style={{ fontWeight: 700, color: '#6366f1', fontSize: 13 }}>{pickupTime}</span>
                                                            <span style={{ fontSize: 11, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.pickup}>📍 {b.pickup || '-'}</span>
                                                            <span style={{ fontWeight: 600, color: b.flightNumber ? '#0369a1' : '#94a3b8', fontSize: 12 }}>
                                                                {b.flightNumber ? `✈️ ${b.flightNumber}` : '—'}
                                                            </span>
                                                            <span style={{ fontWeight: 700, color: '#374151' }}>{b.adults || 1} kişi</span>
                                                            <Text copyable={{ text: b.contactPhone }} style={{ fontSize: 11, color: '#374151' }}>{b.contactPhone}</Text>
                                                            <span style={{ fontSize: 11, fontWeight: 600, color: st.color }}>{st.label}</span>
                                                        </div>
                                                        </DraggablePassengerItem>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        </DroppableShuttleRun>
                                    );
                                })}
                            </div>
                            </DndContext>
                        )}
                    </div>
                    )}
                </div>

                {/* Edit Columns Modal */}
                <Modal
                    title="Sütun Başlıklarını Düzenle"
                    open={editModalVisible}
                    onOk={saveColumnTitles}
                    onCancel={() => setEditModalVisible(false)}
                    width={600}
                >
                    <Row gutter={[16, 16]} style={{ maxHeight: '60vh', overflowY: 'auto', padding: '10px 0' }}>
                        {tempColumns.map((col: any) => (
                            <Col span={12} key={col.key}>
                                <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>{defaultColumns.find(c => c.key === col.key)?.title || col.key}</Text>
                                    <Checkbox
                                        checked={!tempHiddenColumns.has(col.key)}
                                        onChange={(e) => handleVisibilityChange(col.key, e.target.checked)}
                                    >
                                        Göster
                                    </Checkbox>
                                </div>
                                <Input
                                    value={col.title}
                                    onChange={(e) => handleTitleChange(col.key, e.target.value)}
                                    placeholder={defaultColumns.find(c => c.key === col.key)?.title || col.key}
                                />
                            </Col>
                        ))}
                    </Row>
                </Modal>

                {/* Color Settings Modal */}
                <Modal
                    title="Renk Ayarları — Transfer Durumuna Göre Satır Rengi"
                    open={colorModalVisible}
                    onOk={saveColors}
                    onCancel={() => setColorModalVisible(false)}
                    okText="Renkleri Kaydet"
                    cancelText="İptal"
                    width={500}
                    footer={[
                        <Button key="reset" onClick={resetColors}>Varsayılana Sıfırla</Button>,
                        <Button key="cancel" onClick={() => setColorModalVisible(false)}>İptal</Button>,
                        <Button key="ok" type="primary" onClick={saveColors}>Renkleri Kaydet</Button>,
                    ]}
                >
                    <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                        {Object.entries(STATUS_LABELS).map(([key, label]) => (
                            <div key={key} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: 120, padding: '4px 8px', borderRadius: 4,
                                    backgroundColor: tempColors[key] || '#fff',
                                    border: '1px solid #d9d9d9', fontSize: 13, fontWeight: 500, textAlign: 'center',
                                }}>
                                    {label}
                                </div>
                                <input
                                    type="color"
                                    value={tempColors[key] || '#ffffff'}
                                    onChange={(e) => setTempColors(prev => ({ ...prev, [key]: e.target.value }))}
                                    style={{ width: 48, height: 36, border: 'none', cursor: 'pointer', borderRadius: 4 }}
                                />
                                <div style={{ flex: 1, height: 28, borderRadius: 4, backgroundColor: tempColors[key] || '#fff', border: '1px solid #eee' }} />
                                <Button size="small" onClick={() => setTempColors(prev => ({ ...prev, [key]: DEFAULT_COLORS[key] || '#ffffff' }))}>↺</Button>
                            </div>
                        ))}
                    </div>
                </Modal>

                {/* Message Driver Modal */}
                <Modal
                    title={`Sürücüye Mesaj Gönder: ${selectedDriver?.name || ''}`}
                    open={messageModalVisible}
                    onOk={handleSendMessage}
                    onCancel={() => setMessageModalVisible(false)}
                    okText="Gönder"
                    cancelText="İptal"
                    confirmLoading={messageLoading}
                >
                    <Input.TextArea
                        rows={4}
                        placeholder="Mesajınızı yazın..."
                        value={messageContent}
                        onChange={(e) => setMessageContent(e.target.value)}
                    />
                </Modal>

                {/* Conflict Warning Modal */}
                <Modal
                    title={<span>⚠️ Çizelge Çakışması Tespit Edildi</span>}
                    open={!!conflictModal?.visible}
                    onCancel={() => setConflictModal(null)}
                    footer={[
                        <Button key="cancel" onClick={() => setConflictModal(null)}>İptal</Button>,
                        <Button
                            key="force"
                            danger
                            type="primary"
                            onClick={() => { conflictModal?.onForceAssign(); }}
                        >
                            Yine de Ata (Zorla)
                        </Button>
                    ]}
                    width={480}
                >
                    {conflictModal && (
                        <div>
                            <div style={{ background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                                <div style={{ fontWeight: 700, color: '#d46b08', marginBottom: 4 }}>
                                    🚫 {conflictModal.message}
                                </div>
                                <div style={{ fontSize: 13, color: '#595959' }}>
                                    <div>📋 Çakışan rezervasyon: <strong>{conflictModal.conflictWith}</strong></div>
                                    <div>📍 {conflictModal.conflictPickup} → {conflictModal.conflictDropoff}</div>
                                    <div>🕐 Transfer başlangıcı: <strong>{conflictModal.conflictStart}</strong></div>
                                </div>
                            </div>
                            <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '12px 16px' }}>
                                <div style={{ fontWeight: 600, color: '#389e0d' }}>
                                    ✅ En erken müsait: <span style={{ fontSize: 18 }}>{conflictModal.freeAt}</span>
                                </div>
                                <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
                                    (transfer süresi + 30 dk mola sonrası)
                                </div>
                            </div>
                        </div>
                    )}
                </Modal>

                {/* AI Suggestion Modal */}
                <Modal
                    title={<span>🤖 AI Operasyon Önerisi</span>}
                    open={!!aiModal?.visible}
                    onCancel={() => setAiModal(null)}
                    footer={[
                        <Button key="cancel" onClick={() => setAiModal(null)}>Reddet</Button>,
                        <Button
                            key="apply"
                            type="primary"
                            disabled={!aiModal?.suggestion}
                            loading={aiModal?.loading}
                            onClick={applyAISuggestion}
                            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}
                        >
                            ✓ Onayla ve Uygula
                        </Button>
                    ]}
                    width={520}
                >
                    {aiModal?.loading && (
                        <div style={{ textAlign: 'center', padding: '40px 0' }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
                            <div style={{ color: '#595959' }}>AI en uygun şöförü ve aracı analiz ediyor...</div>
                        </div>
                    )}
                    {aiModal?.suggestion && !aiModal.loading && (() => {
                        const s = aiModal.suggestion;
                        const confColor = s.confidence === 'high' ? '#52c41a' : s.confidence === 'medium' ? '#faad14' : '#ff4d4f';
                        const confLabel = s.confidence === 'high' ? 'Yüksek' : s.confidence === 'medium' ? 'Orta' : 'Düşük';
                        return (
                            <div>
                                <div style={{ background: 'linear-gradient(135deg, #667eea11 0%, #764ba211 100%)', border: '1px solid #d9d9d9', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <span style={{ fontWeight: 700, fontSize: 15 }}>AI Önerisi</span>
                                        <span style={{ background: confColor + '22', color: confColor, borderRadius: 20, padding: '2px 12px', fontSize: 12, fontWeight: 600 }}>
                                            {confLabel} Güven
                                        </span>
                                    </div>
                                    {s.suggestedDriverName && (
                                        <div style={{ marginBottom: 8 }}>
                                            <span style={{ color: '#8c8c8c', fontSize: 12 }}>Önerilen Şöför:</span>
                                            <div style={{ fontWeight: 600, fontSize: 14 }}>👨‍✈️ {s.suggestedDriverName}</div>
                                        </div>
                                    )}
                                    {s.suggestedVehiclePlate && (
                                        <div style={{ marginBottom: 8 }}>
                                            <span style={{ color: '#8c8c8c', fontSize: 12 }}>Önerilen Araç:</span>
                                            <div style={{ fontWeight: 600, fontSize: 14 }}>🚗 {s.suggestedVehiclePlate}</div>
                                        </div>
                                    )}
                                    <div style={{ background: '#fff', borderRadius: 6, padding: '10px 14px', marginTop: 12, fontSize: 13, color: '#434343', borderLeft: '3px solid #667eea' }}>
                                        💬 {s.reason}
                                    </div>
                                    {s.warnings && s.warnings.length > 0 && (
                                        <div style={{ marginTop: 10 }}>
                                            {s.warnings.map((w: string, i: number) => (
                                                <div key={i} style={{ color: '#faad14', fontSize: 12 }}>⚠️ {w}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                                    Müsait şöför sayısı: <strong>{s.availableDrivers}</strong> &nbsp;|&nbsp;
                                    Uygun araç sayısı: <strong>{s.availableVehicles}</strong>
                                </div>
                            </div>
                        );
                    })()}
                </Modal>

                {/* Auto-Assign Preview Modal */}
                <Modal
                    title={<span>⚡ Otomatik Operasyon — Önizleme</span>}
                    open={!!autoAssignModal?.visible}
                    onCancel={() => setAutoAssignModal(null)}
                    width={700}
                    footer={[
                        <Button key="cancel" onClick={() => setAutoAssignModal(null)}>İptal</Button>,
                        <Button
                            key="apply"
                            type="primary"
                            loading={autoAssignModal?.applying}
                            disabled={!autoAssignModal?.proposals?.length || autoAssignModal?.loading}
                            onClick={applyAutoAssign}
                            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}
                        >
                            ✓ Onayla ve Uygula ({autoAssignModal?.proposals?.length || 0} transfer)
                        </Button>
                    ]}
                >
                    {autoAssignModal?.loading && (
                        <div style={{ textAlign: 'center', padding: '40px 0' }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
                            <div>Şöförler ve araçlar analiz ediliyor...</div>
                            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>Rota süreleri hesaplanıyor, çizelgeler kontrol ediliyor</div>
                        </div>
                    )}
                    {autoAssignModal?.errorMsg && !autoAssignModal.loading && (
                        <div style={{ color: '#dc2626', padding: 16, background: '#fff1f0', borderRadius: 8 }}>
                            ❌ {autoAssignModal.errorMsg}
                        </div>
                    )}
                    {!autoAssignModal?.loading && !autoAssignModal?.errorMsg && autoAssignModal && (
                        <div>
                            {autoAssignModal.summary && (
                                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                                    {[
                                        { label: 'Toplam', value: autoAssignModal.summary.total, color: '#2563eb' },
                                        { label: 'Atanacak', value: autoAssignModal.summary.assigned, color: '#16a34a' },
                                        { label: 'Atlanamaz', value: autoAssignModal.summary.skipped, color: '#d97706' },
                                    ].map(s => (
                                        <div key={s.label} style={{ flex: 1, textAlign: 'center', background: '#f8fafc', borderRadius: 8, padding: '12px 8px' }}>
                                            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                                            <div style={{ fontSize: 11, color: '#6b7280' }}>{s.label}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {autoAssignModal.proposals.length > 0 && (
                                <div style={{ maxHeight: 340, overflowY: 'auto', marginBottom: 12 }}>
                                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#16a34a' }}>✅ Atanacak Transferler</div>
                                    {autoAssignModal.proposals.map((p: any, i: number) => (
                                        <div key={p.bookingId} style={{
                                            display: 'flex', alignItems: 'flex-start', gap: 12,
                                            padding: '10px 12px', marginBottom: 6,
                                            background: p.outsideWorkHours ? '#fff7e6' : '#f6ffed',
                                            border: `1px solid ${p.outsideWorkHours ? '#ffd591' : '#b7eb8f'}`,
                                            borderRadius: 8, fontSize: 12
                                        }}>
                                            <div style={{ minWidth: 24, fontWeight: 700, color: '#6b7280', paddingTop: 1 }}>{i + 1}</div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, marginBottom: 2 }}>
                                                    {p.bookingNumber}
                                                    {p.outsideWorkHours && <span style={{ color: '#d97706', marginLeft: 8 }}>⚠️ Mesai saati dışı</span>}
                                                </div>
                                                <div style={{ color: '#374151' }}>📍 {p.pickup} → {p.dropoff}</div>
                                                <div style={{ color: '#6b7280', marginTop: 2 }}>
                                                    🕐 {new Date(p.pickupDateTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                    &nbsp;·&nbsp;~{p.estimatedDurationMinutes} dk
                                                    &nbsp;·&nbsp;Boşalır: {new Date(p.freeAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right', minWidth: 130 }}>
                                                <div style={{ fontWeight: 600, color: '#2563eb' }}>👨‍✈️ {p.driverName}</div>
                                                {p.vehiclePlate && <div style={{ color: '#6b7280', fontSize: 11 }}>🚗 {p.vehiclePlate} {p.vehicleModel}</div>}
                                                <div style={{
                                                    fontSize: 10, marginTop: 3,
                                                    color: p.driverWorkedMinutes > 600 ? '#d97706' : '#16a34a',
                                                    fontWeight: 600
                                                }}>
                                                    ⏱ Bugün: {Math.floor(p.driverWorkedMinutes / 60)}s {p.driverWorkedMinutes % 60}dk çalışmış
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {autoAssignModal.skipped.length > 0 && (
                                <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#d97706' }}>⚠️ Atlanamayan Transferler (Şöför yok)</div>
                                    {autoAssignModal.skipped.map((s: any) => (
                                        <div key={s.bookingId} style={{
                                            padding: '8px 12px', marginBottom: 4,
                                            background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 6, fontSize: 12
                                        }}>
                                            <strong>{s.bookingNumber}</strong> — {s.pickup} → {s.dropoff}
                                            &nbsp;({new Date(s.pickupDateTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })})
                                            <div style={{ color: '#d97706', fontSize: 11 }}>{s.reason}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {autoAssignModal.proposals.length === 0 && !autoAssignModal.errorMsg && (
                                <div style={{ textAlign: 'center', padding: '30px 0', color: '#16a34a', fontWeight: 600 }}>
                                    ✅ Tüm transferler zaten atanmış!
                                </div>
                            )}
                        </div>
                    )}
                </Modal>

                {/* Manual Shuttle Modal */}
                <Modal
                    title="Manuel Sefer Ekle"
                    open={isManualModalVisible}
                    onOk={handleAddManualRun}
                    onCancel={() => setIsManualModalVisible(false)}
                    okText="Oluştur"
                    cancelText="İptal"
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <div style={{ marginBottom: 4, fontWeight: 600 }}>Sefer Saati</div>
                            <Input
                                type="time"
                                value={manualRunTime}
                                onChange={(e) => setManualRunTime(e.target.value)}
                            />
                        </div>
                        <div>
                            <div style={{ marginBottom: 4, fontWeight: 600 }}>Rota Adı (Nereden nereye)</div>
                            <Input
                                placeholder="Örn: Antalya → Alanya"
                                value={manualRunName}
                                onChange={(e) => setManualRunName(e.target.value)}
                            />
                        </div>
                    </div>
                </Modal>
            </AdminLayout>


        </AdminGuard >
    );
}
