'use client';

import React, { useState, useEffect } from 'react';
import { Table, Tag, Button, Space, Typography, message, Input, Select, Tooltip, Popover, ColorPicker } from 'antd';
import { CarOutlined, EnvironmentOutlined, MessageOutlined, SearchOutlined, FilterFilled, SortAscendingOutlined, SortDescendingOutlined, BgColorsOutlined, HolderOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Resizable } from 'react-resizable';
import 'react-resizable/css/styles.css';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, horizontalListSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import apiClient from '@/lib/api-client';

const { Text } = Typography;

// Airport codes mapping
const AIRPORT_CODES: Record<string, string> = {
    'antalya': 'AYT', 'gazipaşa': 'GZP', 'gazipasa': 'GZP',
    'istanbul': 'IST', 'sabiha': 'SAW', 'dalaman': 'DLM',
    'bodrum': 'BJV', 'milas': 'BJV', 'izmir': 'ADB', 'adnan menderes': 'ADB',
    'ankara': 'ESB', 'esenboğa': 'ESB', 'esenboga': 'ESB', 'trabzon': 'TZX',
    'gaziantep': 'GZT',
};

function getAirportCode(location: string): string | null {
    if (!location) return null;
    const lower = location.toLocaleLowerCase('tr');
    if (!lower.includes('havaliman') && !lower.includes('airport') && !lower.includes('havaalan')) return null;
    let bestCode: string | null = null;
    let bestPos = Infinity;
    let bestLen = 0;
    for (const [key, code] of Object.entries(AIRPORT_CODES)) {
        const pos = lower.indexOf(key);
        if (pos !== -1 && (pos < bestPos || (pos === bestPos && key.length > bestLen))) {
            bestCode = code;
            bestPos = pos;
            bestLen = key.length;
        }
    }
    return bestCode;
}

// Sortable header: only the grip icon is the drag handle
const SortableHeader = ({ id, children, ...props }: any) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: 'relative',
    };
    return (
        <th {...props} ref={setNodeRef} style={{ ...props.style, ...style }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, width: '100%' }}>
                <span
                    {...attributes}
                    {...listeners}
                    onClick={(e: any) => e.stopPropagation()}
                    style={{ cursor: 'grab', color: '#94a3b8', fontSize: 9, flexShrink: 0, userSelect: 'none', lineHeight: 1, padding: '0 1px' }}
                >
                    ⋮⋮
                </span>
                <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>
            </div>
        </th>
    );
};

// Resizable + Sortable header wrapper
const ResizableTitle = (props: any) => {
    const { onResize, width, id, ...restProps } = props;
    if (!width) {
        return <SortableHeader id={id} {...restProps} />;
    }
    return (
        <Resizable
            width={width}
            height={0}
            onResize={onResize}
            draggableOpts={{ enableUserSelectHack: false }}
            handle={
                <span
                    className="react-resizable-handle"
                    onClick={(e) => e.stopPropagation()}
                />
            }
        >
            <SortableHeader id={id} {...restProps} />
        </Resizable>
    );
};

// Sortable row component for drag-drop
const SortableRow = ({ children, ...props }: any) => {
    const rowKey = props['data-row-key'];
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: rowKey ? `row-${rowKey}` : 'row-unknown',
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };
    
    const childrenArray = React.Children.toArray(children);
    const modifiedChildren = childrenArray.map((child, index) => {
        if (index === 0 && React.isValidElement(child)) {
            const childProps = child.props as any;
            return React.cloneElement(child as any, {
                ...childProps,
                children: (
                    <div {...attributes} {...listeners} style={{ cursor: 'grab', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <HolderOutlined style={{ color: '#6366f1' }} />
                        {childProps.children}
                    </div>
                ),
            });
        }
        return child;
    });
    
    return (
        <tr {...props} ref={setNodeRef} style={{ ...props.style, ...style }}>
            {modifiedChildren}
        </tr>
    );
};

interface OperationsTableProps {
    bookings: any[];
    loading: boolean;
    drivers: any[];
    vehicles: any[];
    statusColors?: Record<string, string>;
    airportColors?: Record<string, string>;
    onDriverChange: (bookingId: string, driverId: string) => void;
    onVehicleChange: (bookingId: string, vehicleId: string) => void;
    onCellEdit: (bookingId: string, field: string, value: any) => void;
    onStatusChange?: (bookingId: string, newStatus: string) => void;
    onAISuggest?: (bookingId: string) => void;
    onOpenMessageModal?: (booking: any) => void;
    onOpenCompleteModal?: (booking: any) => void;
    onReturnToReservation?: (booking: any) => void;
    onRowOrderChange?: (newOrder: string[]) => void;
    onAirportColorChange?: (airportCode: string, color: string) => void;
    onOpenLocationModal?: (location: string, name: string) => void;
}

const DEFAULT_STATUS_COLORS: Record<string, string> = {
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

export default function OperationsTable({
    bookings,
    loading,
    drivers,
    vehicles,
    statusColors = DEFAULT_STATUS_COLORS,
    airportColors = {},
    onDriverChange,
    onVehicleChange,
    onCellEdit,
    onStatusChange,
    onAISuggest,
    onOpenMessageModal,
    onOpenCompleteModal,
    onReturnToReservation,
    onRowOrderChange,
    onAirportColorChange,
    onOpenLocationModal,
}: OperationsTableProps) {
    const [editingCell, setEditingCell] = useState<{ id: string; field: string; value: any } | null>(null);
    const [editingHeader, setEditingHeader] = useState<{ key: string; value: string } | null>(null);
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [colorPickerVisible, setColorPickerVisible] = useState<{ airportCode: string; currentColor: string } | null>(null);
    const [columnOrder, setColumnOrder] = useState<string[]>([]);
    const [columnTitles, setColumnTitles] = useState<Record<string, string>>({});
    const [rowOrder, setRowOrder] = useState<string[]>([]);
    const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
    const [prefsLoaded, setPrefsLoaded] = useState(false);
    const saveTimerRef = React.useRef<NodeJS.Timeout | null>(null);

    // Static column key list for drag-drop fallback
    const ALL_COLUMN_KEYS = ['index','bookingNumber','direction','partnerName','paymentType','customerNote','internalNotes','customerName','contactPhone','date','airportCode','pickupRegionCode','dropoffRegionCode','status','driver','vehicle','time','flightTime','flightCode','pax','pickup','dropoff','extraServices','actions'];
    
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const DEFAULT_WIDTHS: Record<string, number> = {
        index: 45,
        bookingNumber: 120,
        direction: 70,
        partnerName: 120,
        paymentType: 95,
        customerNote: 150,
        internalNotes: 150,
        customerName: 130,
        contactPhone: 115,
        date: 85,
        status: 110,
        driver: 140,
        vehicle: 140,
        time: 85,
        flightTime: 85,
        airportCode: 75,
        flightCode: 100,
        pax: 55,
        pickup: 190,
        dropoff: 190,
        extraServices: 120,
        actions: 120,
    };
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS);

    // Load saved preferences from API
    useEffect(() => {
        const loadPreferences = async () => {
            try {
                const res = await apiClient.get('/api/auth/metadata');
                const prefs = res.data?.data?.operations_preferences || {};
                
                if (prefs.columnWidths) {
                    setColumnWidths(prev => ({ ...prev, ...prefs.columnWidths }));
                }
                if (prefs.columnOrder && prefs.columnOrder.length > 0) {
                    // Merge with known keys so newly added columns (e.g. flightTime) remain reorderable
                    const sanitized = prefs.columnOrder.filter((k: string) => ALL_COLUMN_KEYS.includes(k));
                    const missing = ALL_COLUMN_KEYS.filter(k => !sanitized.includes(k));
                    setColumnOrder([...sanitized, ...missing]);
                }
                if (prefs.columnTitles) {
                    setColumnTitles(prefs.columnTitles);
                }
                if (prefs.rowOrder) {
                    setRowOrder(prefs.rowOrder);
                }
                if (prefs.hiddenColumns && Array.isArray(prefs.hiddenColumns)) {
                    setHiddenColumns(new Set(prefs.hiddenColumns));
                }
                setPrefsLoaded(true);
            } catch (e) {
                console.error('Failed to load preferences from API', e);
                setPrefsLoaded(true);
            }
        };
        
        loadPreferences();
    }, []);

    // Debounced auto-save to API
    const autoSaveToAPI = React.useCallback((overrides?: Partial<{
        columnWidths: Record<string, number>;
        columnOrder: string[];
        columnTitles: Record<string, string>;
        rowOrder: string[];
        hiddenColumns: string[];
    }>) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            try {
                const res = await apiClient.get('/api/auth/metadata');
                const currentMeta = res.data?.data || {};
                const currentPrefs = currentMeta.operations_preferences || {};
                const newPrefs = {
                    ...currentPrefs,
                    columnWidths: overrides?.columnWidths || columnWidths,
                    columnOrder: overrides?.columnOrder || columnOrder,
                    columnTitles: overrides?.columnTitles || columnTitles,
                    rowOrder: overrides?.rowOrder || rowOrder,
                    hiddenColumns: overrides?.hiddenColumns || Array.from(hiddenColumns),
                };
                await apiClient.put('/api/auth/metadata', {
                    preferences: { operations_preferences: newPrefs }
                });
            } catch (e) {
                console.error('Auto-save preferences failed', e);
            }
        }, 800);
    }, [columnWidths, columnOrder, columnTitles, rowOrder, hiddenColumns]);

    // Save column settings to API (manual trigger)
    const saveColumnSettings = async () => {
        try {
            const res = await apiClient.get('/api/auth/metadata');
            const currentMeta = res.data?.data || {};
            const currentPrefs = currentMeta.operations_preferences || {};
            const newPrefs = {
                ...currentPrefs,
                columnWidths,
                columnOrder,
                columnTitles,
                rowOrder,
                hiddenColumns: Array.from(hiddenColumns),
            };
            await apiClient.put('/api/auth/metadata', { 
                preferences: { operations_preferences: newPrefs } 
            });
            message.success('Kolon ayarları kaydedildi');
        } catch (e) {
            message.error('Kaydetme başarısız');
        }
    };
    
    // Expose save function globally
    useEffect(() => {
        (window as any).saveOperationsColumnSettings = saveColumnSettings;
        return () => {
            delete (window as any).saveOperationsColumnSettings;
        };
    }, [columnWidths, columnOrder, columnTitles, rowOrder, hiddenColumns]);

    // Toggle column visibility
    const toggleColumn = (key: string) => {
        setHiddenColumns(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            autoSaveToAPI({ hiddenColumns: Array.from(next) });
            return next;
        });
    };

    // Expose toggle function
    useEffect(() => {
        (window as any).toggleOperationsColumn = toggleColumn;
        (window as any).getOperationsHiddenColumns = () => hiddenColumns;
        return () => {
            delete (window as any).toggleOperationsColumn;
            delete (window as any).getOperationsHiddenColumns;
        };
    }, [hiddenColumns]);
    
    // Handle column title change - auto save
    const handleColumnTitleChange = (key: string, newTitle: string) => {
        setColumnTitles(prev => {
            const next = { ...prev, [key]: newTitle };
            autoSaveToAPI({ columnTitles: next });
            return next;
        });
    };
    
    // Handle column sort
    const handleSort = (columnKey: string) => {
        setSortConfig(prev => {
            if (prev?.key === columnKey) {
                return prev.direction === 'asc' ? { key: columnKey, direction: 'desc' } : null;
            }
            return { key: columnKey, direction: 'asc' };
        });
    };
    
    // Unified drag end handler - distinguishes columns (col-*) from rows (row-*)
    const handleUnifiedDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        
        const activeId = String(active.id);
        const overId = String(over.id);
        
        // Column drag
        if (activeId.startsWith('col-') && overId.startsWith('col-')) {
            const activeKey = activeId.replace('col-', '');
            const overKey = overId.replace('col-', '');
            setColumnOrder((items) => {
                // Ensure the draggable list always contains all known keys
                const base = items.length > 0 ? items : ALL_COLUMN_KEYS;
                const sanitized = base.filter(k => ALL_COLUMN_KEYS.includes(k));
                const missing = ALL_COLUMN_KEYS.filter(k => !sanitized.includes(k));
                const currentItems = [...sanitized, ...missing];
                const oldIndex = currentItems.indexOf(activeKey);
                const newIndex = currentItems.indexOf(overKey);
                if (oldIndex === -1 || newIndex === -1) return currentItems;
                const newOrder = arrayMove(currentItems, oldIndex, newIndex);
                autoSaveToAPI({ columnOrder: newOrder });
                return newOrder;
            });
            return;
        }
        
        // Row drag
        if (activeId.startsWith('row-') && overId.startsWith('row-')) {
            const activeRowId = activeId.replace('row-', '');
            const overRowId = overId.replace('row-', '');
            const oldIndex = rowOrder.indexOf(activeRowId);
            const newIndex = rowOrder.indexOf(overRowId);
            if (oldIndex === -1 || newIndex === -1) return;
            const newOrder = arrayMove(rowOrder, oldIndex, newIndex);
            setRowOrder(newOrder);
            onRowOrderChange?.(newOrder);
        }
    };
    
    // Handle resize - auto save after resize
    const handleResize = (key: string) => (_: any, { size }: any) => {
        setColumnWidths(prev => {
            const next = { ...prev, [key]: size.width };
            autoSaveToAPI({ columnWidths: next });
            return next;
        });
    };
    
    // Render column header with filter, sort, and edit
    const renderColumnHeader = (columnKey: string, defaultTitle: string, sortable: boolean = false) => {
        const isEditing = editingHeader?.key === columnKey;
        const displayTitle = columnTitles[columnKey] || defaultTitle;
        const hasFilter = columnFilters[columnKey];
        const isSorted = sortConfig?.key === columnKey;
        
        if (isEditing) {
            return (
                <Input
                    size="small"
                    autoFocus
                    value={editingHeader.value}
                    onChange={(e) => setEditingHeader({ key: columnKey, value: e.target.value })}
                    onBlur={() => {
                        if (editingHeader.value.trim()) {
                            handleColumnTitleChange(columnKey, editingHeader.value.trim());
                        }
                        setEditingHeader(null);
                    }}
                    onPressEnter={() => {
                        if (editingHeader.value.trim()) {
                            handleColumnTitleChange(columnKey, editingHeader.value.trim());
                        }
                        setEditingHeader(null);
                    }}
                    style={{ minWidth: 60, maxWidth: 150, fontSize: 11 }}
                    onClick={(e) => e.stopPropagation()}
                />
            );
        }
        
        return (
            <div 
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingHeader({ key: columnKey, value: displayTitle });
                }}
                title="Çift tıklayarak başlığı düzenleyin"
            >
                <Popover
                    content={
                        <div style={{ padding: 8, width: 200 }}>
                            <Input
                                size="small"
                                placeholder="Filtrele..."
                                prefix={<SearchOutlined />}
                                value={columnFilters[columnKey] || ''}
                                onChange={(e) => setColumnFilters(prev => ({ ...prev, [columnKey]: e.target.value }))}
                                allowClear
                                onPressEnter={() => {}}
                            />
                        </div>
                    }
                    trigger="click"
                    placement="bottom"
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <span>{displayTitle}</span>
                        {hasFilter && <FilterFilled style={{ color: '#1890ff', fontSize: 10 }} />}
                    </div>
                </Popover>
                {sortable && (
                    <Tooltip title={isSorted ? (sortConfig.direction === 'asc' ? 'Azalan sırala' : 'Sıralamayı kaldır') : 'Artan sırala'}>
                        <Button
                            type="text"
                            size="small"
                            icon={isSorted && sortConfig.direction === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleSort(columnKey);
                            }}
                            style={{ 
                                padding: 0, 
                                width: 16, 
                                height: 16, 
                                fontSize: 12,
                                color: isSorted ? '#1890ff' : '#999'
                            }}
                        />
                    </Tooltip>
                )}
            </div>
        );
    };

    // Define all columns
    const allColumns = [
        {
            title: renderColumnHeader('index', '#'),
            key: 'index',
            width: columnWidths.index,
            ellipsis: true,
            render: (_: any, __: any, index: number) => (
                <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, fontFamily: 'monospace' }}>{index + 1}</Text>
            ),
        },
        {
            title: renderColumnHeader('bookingNumber', 'T.KOD'),
            dataIndex: 'bookingNumber',
            key: 'bookingNumber',
            width: columnWidths.bookingNumber,
            ellipsis: true,
            render: (text: string) => (
                <Text copyable={{ text, tooltips: ['Kopyala', 'Kopyalandı'] }} style={{ fontSize: 10.5, fontFamily: 'monospace', color: '#3b82f6', fontWeight: 600 }}>{text}</Text>
            ),
        },
        {
            title: renderColumnHeader('direction', 'YÖN', true),
            dataIndex: 'direction',
            key: 'direction',
            width: columnWidths.direction,
            ellipsis: true,
            render: (dir: string) => {
                const configs: Record<string, { color: string; bg: string; label: string; icon: string }> = {
                    DEPARTURE: { color: '#f97316', bg: '#fff7ed', label: 'Gidiş', icon: '✈️' },
                    ARRIVAL: { color: '#10b981', bg: '#f0fdf4', label: 'Dönüş', icon: '🛬' },
                    INTER: { color: '#8b5cf6', bg: '#faf5ff', label: 'Ara', icon: '🚗' },
                };
                const config = configs[dir] || { color: '#6b7280', bg: '#f3f4f6', label: dir, icon: '📍' };
                return (
                    <Tag style={{ 
                        margin: 0, padding: '1px 8px', borderRadius: 4,
                        background: config.bg, border: `1px solid ${config.color}30`,
                        fontSize: 10, fontWeight: 700, color: config.color,
                        lineHeight: '18px'
                    }}>
                        {config.icon} {config.label}
                    </Tag>
                );
            },
        },
        {
            title: renderColumnHeader('partnerName', 'ACENTE', true),
            dataIndex: 'partnerName',
            key: 'partnerName',
            width: columnWidths.partnerName,
            ellipsis: true,
            render: (_: string, record: any) => {
                const agencyName = record.agencyName || record.partnerName;
                return <Text style={{ fontSize: 11, fontWeight: 500 }}>{agencyName || <span style={{ color: '#d1d5db' }}>—</span>}</Text>;
            },
        },
        {
            title: renderColumnHeader('paymentType', 'ÖDEME', true),
            key: 'paymentType',
            width: columnWidths.paymentType || 105,
            ellipsis: true,
            render: (_: any, record: any) => {
                // 1. Try metadata.paymentMethod (canonical source for both B2B and new B2C bookings)
                let method = record?.metadata?.paymentMethod;
                const status = record?.paymentStatus || record?.metadata?.paymentStatus;

                // 2. Fallback for legacy direct bookings that never had paymentMethod saved
                if (!method) {
                    // If the booking has an agencyId, it's a B2B booking
                    if (record?.agencyId) {
                        // Agency bookings default to BALANCE if not specified
                        method = 'BALANCE';
                    } else {
                        // Direct B2C bookings historically defaulted to "cash" (PAY_IN_VEHICLE)
                        method = 'PAY_IN_VEHICLE';
                    }
                }

                const isPaid = status === 'PAID';

                // Premium payment type configurations with icons and gradients
                const paymentStyles: Record<string, {
                    icon: string;
                    label: string;
                    gradient: string;
                    border: string;
                    color: string;
                    glow: string;
                }> = {
                    'PAY_IN_VEHICLE': {
                        icon: '🚗',
                        label: isPaid ? 'Ödendi' : 'Araçta',
                        gradient: isPaid
                            ? 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)'
                            : 'linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)',
                        border: isPaid ? '#86efac' : '#fdba74',
                        color: isPaid ? '#15803d' : '#c2410c',
                        glow: isPaid ? '0 0 8px rgba(34,197,94,0.15)' : '0 0 8px rgba(251,146,60,0.15)',
                    },
                    'CASH': {
                        icon: '💵',
                        label: isPaid ? 'Ödendi' : 'Nakit',
                        gradient: isPaid
                            ? 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)'
                            : 'linear-gradient(135deg, #fefce8 0%, #fef08a 100%)',
                        border: isPaid ? '#86efac' : '#fde047',
                        color: isPaid ? '#15803d' : '#a16207',
                        glow: isPaid ? '0 0 8px rgba(34,197,94,0.15)' : '0 0 8px rgba(253,224,71,0.15)',
                    },
                    'CREDIT_CARD': {
                        icon: '💳',
                        label: 'Kart',
                        gradient: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                        border: '#93c5fd',
                        color: '#1d4ed8',
                        glow: '0 0 8px rgba(59,130,246,0.15)',
                    },
                    'BALANCE': {
                        icon: '🏦',
                        label: 'Bakiye',
                        gradient: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                        border: '#86efac',
                        color: '#15803d',
                        glow: '0 0 8px rgba(34,197,94,0.15)',
                    },
                    'BANK_TRANSFER': {
                        icon: '🏧',
                        label: 'Havale',
                        gradient: 'linear-gradient(135deg, #faf5ff 0%, #ede9fe 100%)',
                        border: '#c4b5fd',
                        color: '#6d28d9',
                        glow: '0 0 8px rgba(139,92,246,0.15)',
                    },
                };

                const config = paymentStyles[method] || {
                    icon: '💰',
                    label: String(method),
                    gradient: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                    border: '#cbd5e1',
                    color: '#475569',
                    glow: 'none',
                };

                return (
                    <Tag style={{
                        margin: 0,
                        fontSize: 10,
                        fontWeight: 800,
                        background: config.gradient,
                        border: `1.5px solid ${config.border}`,
                        color: config.color,
                        borderRadius: 8,
                        padding: '2px 8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        boxShadow: config.glow,
                        letterSpacing: 0.3,
                        lineHeight: '18px',
                        transition: 'all 0.2s ease',
                        cursor: 'default',
                    }}>
                        <span style={{ fontSize: 11, lineHeight: 1 }}>{config.icon}</span>
                        {config.label}
                    </Tag>
                );
            },
        },
        {
            title: renderColumnHeader('customerNote', 'MÜŞTERİ NOTU'),
            dataIndex: 'customerNote',
            key: 'customerNote',
            width: columnWidths.customerNote,
            ellipsis: true,
            render: (text: string, record: any) => {
                const note =
                    text ||
                    record?.specialRequests ||
                    record?.notes ||
                    record?.metadata?.customerNotes ||
                    record?.metadata?.notes ||
                    '';
                const isEditing = editingCell?.id === record.id && editingCell?.field === 'customerNote';
                if (isEditing) {
                    return (
                        <Input.TextArea
                            size="small"
                            autoFocus
                            rows={2}
                            defaultValue={editingCell.value}
                            onBlur={(e) => {
                                onCellEdit(record.id, 'customerNote', e.target.value);
                                setEditingCell(null);
                            }}
                            onPressEnter={(e) => {
                                onCellEdit(record.id, 'customerNote', (e.target as HTMLTextAreaElement).value);
                                setEditingCell(null);
                            }}
                            style={{ fontSize: 11 }}
                        />
                    );
                }
                return (
                    <div
                        onDoubleClick={() => setEditingCell({ id: record.id, field: 'customerNote', value: note })}
                        style={{ fontSize: 11, cursor: 'pointer', minHeight: 20 }}
                        title="Çift tıklayarak düzenleyin"
                    >
                        {note || '-'}
                    </div>
                );
            },
        },
        {
            title: renderColumnHeader('internalNotes', 'OP. NOTU'),
            dataIndex: 'internalNotes',
            key: 'internalNotes',
            width: columnWidths.internalNotes,
            ellipsis: true,
            render: (text: string, record: any) => {
                const isEditing = editingCell?.id === record.id && editingCell?.field === 'internalNotes';
                if (isEditing) {
                    return (
                        <Input.TextArea
                            size="small"
                            autoFocus
                            rows={2}
                            defaultValue={editingCell.value}
                            onBlur={(e) => {
                                onCellEdit(record.id, 'internalNotes', e.target.value);
                                setEditingCell(null);
                            }}
                            onPressEnter={(e) => {
                                onCellEdit(record.id, 'internalNotes', (e.target as HTMLTextAreaElement).value);
                                setEditingCell(null);
                            }}
                            style={{ fontSize: 11 }}
                        />
                    );
                }
                return (
                    <div
                        onDoubleClick={() => setEditingCell({ id: record.id, field: 'internalNotes', value: text })}
                        style={{ fontSize: 11, cursor: 'pointer', minHeight: 20 }}
                        title="Çift tıklayarak düzenleyin"
                    >
                        {text || '-'}
                    </div>
                );
            },
        },
        {
            title: renderColumnHeader('customerName', 'MÜŞTERİ ADI', true),
            key: 'customerName',
            width: columnWidths.customerName,
            ellipsis: true,
            render: (_: any, record: any) => {
                const name = record.customerName || record.customer?.name || ((record.customer?.firstName || '') + ' ' + (record.customer?.lastName || '')).trim() || '-';
                return <Text style={{ fontSize: 11.5, fontWeight: 700, color: '#1e293b' }}>{name}</Text>;
            },
        },
        {
            title: renderColumnHeader('contactPhone', 'TELEFON'),
            key: 'contactPhone',
            width: columnWidths.contactPhone,
            ellipsis: true,
            render: (_: any, record: any) => {
                const phone = record.contactPhone || record.customer?.phone || record.customer?.contactPhone || '-';
                return <Text style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569' }}>{phone}</Text>;
            },
        },
        {
            title: renderColumnHeader('date', 'TARİH', true),
            key: 'date',
            width: columnWidths.date,
            ellipsis: true,
            render: (_: any, record: any) => {
                const date = record.pickupDateTime || record.dropoffDateTime;
                return <Text style={{ fontSize: 10.5, fontFamily: 'monospace', color: '#64748b' }}>{date ? dayjs(date).format('DD.MM.YY') : '-'}</Text>;
            },
        },
        {
            title: renderColumnHeader('airportCode', 'IATA', true),
            key: 'airportCode',
            width: columnWidths.airportCode,
            ellipsis: true,
            render: (_: any, record: any) => {
                const pickupLoc = record.pickup?.rawLocation || record.pickup?.location || '';
                const dropoffLoc = record.dropoff?.rawLocation || record.dropoff?.location || '';
                const pickupCode = getAirportCode(pickupLoc);
                const dropoffCode = getAirportCode(dropoffLoc);
                const code = pickupCode || dropoffCode;
                
                if (!code) return <Text style={{ fontSize: 11, color: '#999' }}>-</Text>;
                
                const bgColor = airportColors[code] || 'transparent';
                
                return (
                    <Tag style={{ 
                        margin: 0, fontSize: 10, fontWeight: 800, fontFamily: 'monospace',
                        letterSpacing: 1, background: bgColor || '#eff6ff',
                        border: `1px solid ${bgColor ? bgColor + '80' : '#bfdbfe'}`,
                        color: '#1e40af', borderRadius: 4, padding: '1px 6px'
                    }}>
                        {code}
                    </Tag>
                );
            },
        },
        {
            title: renderColumnHeader('pickupRegionCode', 'ALIŞ BÖLGE', true),
            key: 'pickupRegionCode',
            width: columnWidths.pickupRegionCode || 75,
            ellipsis: true,
            render: (_: any, record: any) => {
                const code = record.pickupRegionCode || record.metadata?.pickupRegionCode;
                if (!code) return <Text style={{ fontSize: 11, color: '#999' }}>-</Text>;
                return (
                    <Tag style={{ 
                        margin: 0, fontSize: 10, fontWeight: 800, fontFamily: 'monospace',
                        letterSpacing: 0.5, background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        color: '#166534', borderRadius: 4, padding: '1px 6px'
                    }}>
                        {code}
                    </Tag>
                );
            },
        },
        {
            title: renderColumnHeader('dropoffRegionCode', 'VARIŞ BÖLGE', true),
            key: 'dropoffRegionCode',
            width: columnWidths.dropoffRegionCode || 75,
            ellipsis: true,
            render: (_: any, record: any) => {
                const code = record.dropoffRegionCode || record.metadata?.dropoffRegionCode;
                if (!code) return <Text style={{ fontSize: 11, color: '#999' }}>-</Text>;
                return (
                    <Tag style={{ 
                        margin: 0, fontSize: 10, fontWeight: 800, fontFamily: 'monospace',
                        letterSpacing: 0.5, background: '#fef3c7',
                        border: '1px solid #fde68a',
                        color: '#92400e', borderRadius: 4, padding: '1px 6px'
                    }}>
                        {code}
                    </Tag>
                );
            },
        },
        {
            title: renderColumnHeader('status', 'DURUM', true),
            dataIndex: 'operationalStatus',
            key: 'status',
            width: columnWidths.status,
            ellipsis: true,
            render: (status: string, record: any) => {
                // Driver progress statuses are superior to operational statuses
                const overrideStatuses = ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
                let effectiveStatus = status || record.status || record.metadata?.operationalStatus || 'PENDING';
                if (record.status && overrideStatuses.includes(record.status)) {
                    effectiveStatus = record.status;
                }

                const statusCfg: Record<string, { color: string; bg: string; label: string }> = {
                    PENDING:             { color: '#b45309', bg: '#fef3c7', label: 'Beklemede' },
                    CONFIRMED:           { color: '#1d4ed8', bg: '#dbeafe', label: 'Onaylandı' },
                    PASSENGER_PICKED_UP: { color: '#0e7490', bg: '#cffafe', label: 'Yolcu Alındı' },
                    IN_PROGRESS:         { color: '#0e7490', bg: '#cffafe', label: 'Yolcu Alındı' },
                    ON_THE_WAY:          { color: '#7c3aed', bg: '#ede9fe', label: 'Yolda' },
                    IN_OPERATION:        { color: '#1d4ed8', bg: '#bfdbfe', label: 'Operasyonda' },
                    OPERASYONDA:         { color: '#1d4ed8', bg: '#bfdbfe', label: 'Operasyonda' },
                    COMPLETED:           { color: '#15803d', bg: '#dcfce7', label: 'Tamamlandı' },
                    CANCELLED:           { color: '#dc2626', bg: '#fee2e2', label: 'İptal' },
                    NO_SHOW:             { color: '#be123c', bg: '#ffe4e6', label: 'No-Show' },
                    HAVUZDA:             { color: '#be185d', bg: '#fce7f3', label: 'Havuzda' },
                };
                const cfg = statusCfg[effectiveStatus] || { color: '#6b7280', bg: '#f3f4f6', label: effectiveStatus };
                
                // Editable status
                if (editingCell?.id === record.id && editingCell?.field === 'status') {
                    return (
                        <Select
                            size="small"
                            autoFocus
                            defaultOpen
                            defaultValue={status}
                            style={{ width: 130, fontSize: 11 }}
                            onChange={(val) => {
                                onStatusChange?.(record.id, val);
                                setEditingCell(null);
                            }}
                            onBlur={() => setEditingCell(null)}
                            options={[
                                { value: 'PENDING', label: '⏳ Beklemede' },
                                { value: 'CONFIRMED', label: '✓ Onaylandı' },
                                { value: 'IN_OPERATION', label: '🔄 Operasyonda' },
                                { value: 'CANCELLED', label: '✗ İptal' },
                            ]}
                        />
                    );
                }
                
                return (
                    <span 
                        onDoubleClick={() => setEditingCell({ id: record.id, field: 'status', value: status })}
                        title="Çift tıklayarak durumu değiştirin"
                        style={{
                            fontSize: 10, fontWeight: 700, color: cfg.color,
                            background: cfg.bg, padding: '2px 8px', borderRadius: 10,
                            border: `1px solid ${cfg.color}25`, whiteSpace: 'nowrap',
                            letterSpacing: 0.2, lineHeight: '18px', display: 'inline-block',
                            cursor: 'pointer'
                        }}
                    >
                        {cfg.label}
                    </span>
                );
            },
        },
        {
            title: renderColumnHeader('driver', 'ŞOFÖR'),
            key: 'driver',
            width: columnWidths.driver,
            ellipsis: true,
            render: (_: any, record: any) => {
                const options = drivers.map(d => ({
                    label: `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.name || `Şöför (${(d.user?.id || d.id).substring(0, 8)})`,
                    value: d.user?.id || d.id,
                }));
                return (
                    <Space size={2}>
                        <Select
                            size="small"
                            style={{ width: 110, fontSize: 11 }}
                            placeholder="Şoför seç"
                            variant="borderless"
                            showSearch
                            value={record.driverId || undefined}
                            onChange={(driverId) => onDriverChange(record.id, driverId)}
                            options={options}
                        />
                        <Tooltip title="AI Öneri">
                            <Button
                                size="small"
                                type="text"
                                onClick={() => onAISuggest?.(record.id)}
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
            title: renderColumnHeader('vehicle', 'ARAÇ'),
            key: 'vehicle',
            width: columnWidths.vehicle,
            ellipsis: true,
            render: (_: any, record: any) => {
                const options = vehicles.map(v => ({
                    label: `${v.plateNumber || v.plate || ''} - ${v.model || ''}`.trim(),
                    value: v.id,
                }));
                return (
                    <Select
                        size="small"
                        style={{ width: 130, fontSize: 11 }}
                        placeholder="Araç seç"
                        variant="borderless"
                        showSearch
                        value={record.vehicleId || undefined}
                        onChange={(vehicleId) => onVehicleChange(record.id, vehicleId)}
                        options={options}
                    />
                );
            }
        },
        {
            title: renderColumnHeader('time', 'TRANSFER SAATİ', true),
            key: 'time',
            width: columnWidths.time,
            ellipsis: true,
            render: (_: any, record: any) => {
                const time = record.pickupDateTime || record.dropoffDateTime;
                const formatted = time ? dayjs(time).format('HH:mm') : '-';
                
                // Editable time
                if (editingCell?.id === record.id && editingCell?.field === 'time') {
                    return (
                        <input
                            type="time"
                            defaultValue={formatted !== '-' ? formatted : ''}
                            autoFocus
                            onBlur={(e) => {
                                if (e.target.value && e.target.value !== formatted) {
                                    const baseDate = time ? dayjs(time).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
                                    onCellEdit(record.id, 'pickupDateTime', `${baseDate}T${e.target.value}:00`);
                                }
                                setEditingCell(null);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                if (e.key === 'Escape') setEditingCell(null);
                            }}
                            style={{
                                fontWeight: 700, color: '#1e3a8a', background: '#dbeafe',
                                padding: '2px 6px', borderRadius: 4, fontSize: 12,
                                border: '2px solid #3b82f6', outline: 'none', width: '75px',
                                fontFamily: 'monospace'
                            }}
                        />
                    );
                }
                
                return (
                    <span 
                        onDoubleClick={() => setEditingCell({ id: record.id, field: 'time', value: formatted })}
                        title="Çift tıklayarak transfer saatini düzenleyin"
                        style={{
                            fontSize: 12, fontWeight: 800, fontFamily: 'monospace',
                            color: '#0f172a', background: '#f0f9ff',
                            padding: '2px 8px', borderRadius: 4,
                            border: '1px solid #e0f2fe', cursor: 'pointer'
                        }}
                    >
                        {formatted}
                    </span>
                );
            },
        },
        {
            title: renderColumnHeader('flightTime', 'UÇUŞ SAATİ', true),
            key: 'flightTime',
            width: columnWidths.flightTime || 85,
            ellipsis: true,
            render: (_: any, record: any) => {
                const ft = record.metadata?.flightTime || record.flightTime || '';
                
                if (editingCell?.id === record.id && editingCell?.field === 'flightTime') {
                    return (
                        <input
                            type="time"
                            defaultValue={ft}
                            autoFocus
                            onBlur={(e) => {
                                if (e.target.value !== ft) {
                                    onCellEdit(record.id, 'flightTime', e.target.value);
                                }
                                setEditingCell(null);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                if (e.key === 'Escape') setEditingCell(null);
                            }}
                            style={{
                                fontWeight: 700, color: '#7c3aed', background: '#f5f3ff',
                                padding: '2px 6px', borderRadius: 4, fontSize: 12,
                                border: '2px solid #8b5cf6', outline: 'none', width: '75px',
                                fontFamily: 'monospace'
                            }}
                        />
                    );
                }
                
                return (
                    <span
                        onDoubleClick={() => setEditingCell({ id: record.id, field: 'flightTime', value: ft })}
                        title="Çift tıklayarak uçuş saatini düzenleyin"
                        style={{
                            fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
                            color: '#7c3aed', background: '#faf5ff',
                            padding: '2px 8px', borderRadius: 4,
                            border: '1px solid #ede9fe', cursor: 'pointer'
                        }}
                    >
                        {ft || <span style={{ color: '#d1d5db', fontWeight: 400 }}>—</span>}
                    </span>
                );
            },
        },
        {
            title: renderColumnHeader('flightCode', 'UÇUŞ KODU'),
            dataIndex: 'flightNumber',
            key: 'flightCode',
            width: columnWidths.flightCode,
            ellipsis: true,
            render: (text: string) => <Text style={{ fontSize: 11, color: '#475569' }}>{text || <span style={{ color: '#d1d5db' }}>—</span>}</Text>,
        },
        {
            title: renderColumnHeader('pax', 'PAX', true),
            key: 'pax',
            width: columnWidths.pax,
            ellipsis: true,
            render: (_: any, record: any) => {
                const adults = record.adults || 0;
                const children = record.children || 0;
                const infants = record.infants || 0;
                const total = adults + children + infants;
                const parts: string[] = [];
                if (adults > 0) parts.push(`${adults}Y`);
                if (children > 0) parts.push(`${children}Ç`);
                if (infants > 0) parts.push(`${infants}B`);
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.3 }}>
                        <span style={{
                            fontSize: 12, fontWeight: 800, color: '#1e293b',
                            fontFamily: 'monospace'
                        }}>
                            {total}
                        </span>
                        {(children > 0 || infants > 0) && (
                            <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>
                                {parts.join('+')}
                            </span>
                        )}
                    </div>
                );
            },
        },
        {
            title: renderColumnHeader('pickup', 'ALIŞ YERİ'),
            key: 'pickup',
            width: columnWidths.pickup,
            ellipsis: true,
            render: (_: any, record: any) => {
                const loc = record.pickup?.location || record.pickup?.rawLocation || '';
                return (
                    <Tooltip title="Çift tıklayarak haritada göster" placement="topLeft">
                        <div
                            onDoubleClick={() => onOpenLocationModal?.(loc, record.customerName || 'Müşteri')}
                            style={{ 
                                fontSize: 11, cursor: 'pointer',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                color: '#16a34a', fontWeight: 500,
                                maxWidth: columnWidths.pickup - 16
                            }}
                        >
                            <EnvironmentOutlined style={{ color: '#16a34a', marginRight: 3, fontSize: 10 }} />{loc || <span style={{ color: '#d1d5db' }}>—</span>}
                        </div>
                    </Tooltip>
                );
            },
        },
        {
            title: renderColumnHeader('dropoff', 'BIRAKIŞ YERİ'),
            key: 'dropoff',
            width: columnWidths.dropoff,
            ellipsis: true,
            render: (_: any, record: any) => {
                const loc = record.dropoff?.location || record.dropoff?.rawLocation || '';
                return (
                    <Tooltip title="Çift tıklayarak haritada göster" placement="topLeft">
                        <div
                            onDoubleClick={() => onOpenLocationModal?.(loc, record.customerName || 'Müşteri')}
                            style={{ 
                                fontSize: 11, cursor: 'pointer',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                color: '#dc2626', fontWeight: 500,
                                maxWidth: columnWidths.dropoff - 16
                            }}
                        >
                            <EnvironmentOutlined style={{ color: '#dc2626', marginRight: 3, fontSize: 10 }} />{loc || <span style={{ color: '#d1d5db' }}>—</span>}
                        </div>
                    </Tooltip>
                );
            },
        },
        {
            title: renderColumnHeader('extraServices', 'EKSTRA'),
            key: 'extraServices',
            width: columnWidths.extraServices,
            ellipsis: true,
            render: (_: any, record: any) => {
                const extras = record.metadata?.extraServices || record.extraServices || record.extras || record.services || [];
                if (!extras || extras.length === 0) return <Text style={{ fontSize: 11, color: '#999' }}>-</Text>;
                
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {extras.map((e: any, idx: number) => (
                            <div 
                                key={idx} 
                                style={{ 
                                    fontSize: 10, 
                                    background: '#f8fafc', 
                                    padding: '2px 6px', 
                                    borderRadius: 4, 
                                    border: '1px solid #e2e8f0',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {e.quantity || 1}x {e.name || e.serviceName || 'Ekstra'}
                            </div>
                        ))}
                    </div>
                );
            },
        },
        {
            title: renderColumnHeader('actions', 'İŞLEM'),
            key: 'actions',
            width: columnWidths.actions,
            ellipsis: true,
            render: (_: any, record: any) => {
                if (record.status === 'COMPLETED') {
                    return (
                        <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 700 }}>✓ Tamamlandı</span>
                    );
                }

                return (
                    <Space size={4}>
                        <Tooltip title="Mesaj Gönder">
                            <Button type="text" size="small" icon={<MessageOutlined />}
                                onClick={() => onOpenMessageModal?.(record)}
                                style={{ padding: '0 4px', color: '#6366f1', fontSize: 13 }}
                            />
                        </Tooltip>
                        <Tooltip title="Rezervasyona geri al">
                            <Button size="small" danger type="link"
                                style={{ fontSize: 10, fontWeight: 700, padding: '0 4px' }}
                                onClick={() => onReturnToReservation?.(record)}
                            >
                                ↩ Geri Al
                            </Button>
                        </Tooltip>
                    </Space>
                );
            }
        },
    ];

    // Initialize column order if empty (no forced positioning; user can reorder freely)
    useEffect(() => {
        if (allColumns.length === 0) return;
        if (columnOrder.length === 0) setColumnOrder(ALL_COLUMN_KEYS);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allColumns.length]);

    // Apply filters
    let filteredBookings = bookings.filter(booking => {
        return Object.entries(columnFilters).every(([key, value]) => {
            if (!value) return true;
            
            if (key === 'airportCode') {
                const pickupLoc = booking.pickup?.rawLocation || booking.pickup?.location || '';
                const dropoffLoc = booking.dropoff?.rawLocation || booking.dropoff?.location || '';
                const pickupCode = getAirportCode(pickupLoc);
                const dropoffCode = getAirportCode(dropoffLoc);
                const code = pickupCode || dropoffCode || '';
                return code.toLowerCase().includes(value.toLowerCase());
            }
            
            const bookingValue = String(booking[key] || '').toLowerCase();
            return bookingValue.includes(value.toLowerCase());
        });
    });
    
    // Apply sorting OR manual row order (not both)
    if (sortConfig) {
        // If sorting is active, use sort config
        filteredBookings = [...filteredBookings].sort((a, b) => {
            let aValue = a[sortConfig.key];
            let bValue = b[sortConfig.key];
            
            // Special handling for different column types
            if (sortConfig.key === 'date' || sortConfig.key === 'time') {
                aValue = a.pickupDateTime || a.dropoffDateTime;
                bValue = b.pickupDateTime || b.dropoffDateTime;
            } else if (sortConfig.key === 'pax') {
                aValue = (a.adults || 0) + (a.children || 0) + (a.infants || 0);
                bValue = (b.adults || 0) + (b.children || 0) + (b.infants || 0);
            } else if (sortConfig.key === 'airportCode') {
                const aPickup = a.pickup?.rawLocation || a.pickup?.location || '';
                const aDropoff = a.dropoff?.rawLocation || a.dropoff?.location || '';
                const bPickup = b.pickup?.rawLocation || b.pickup?.location || '';
                const bDropoff = b.dropoff?.rawLocation || b.dropoff?.location || '';
                aValue = getAirportCode(aPickup) || getAirportCode(aDropoff) || '';
                bValue = getAirportCode(bPickup) || getAirportCode(bDropoff) || '';
            }
            
            if (aValue === bValue) return 0;
            if (aValue == null) return 1;
            if (bValue == null) return -1;
            
            const comparison = aValue < bValue ? -1 : 1;
            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });
    } else if (rowOrder.length > 0) {
        // If no sorting, apply manual row order
        filteredBookings = filteredBookings.sort((a, b) => {
            const aIndex = rowOrder.indexOf(a.id);
            const bIndex = rowOrder.indexOf(b.id);
            if (aIndex === -1 && bIndex === -1) return 0;
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
        });
    }
    
    // Initialize row order from bookings
    useEffect(() => {
        if (rowOrder.length === 0 && bookings.length > 0) {
            setRowOrder(bookings.map(b => b.id));
        }
    }, [bookings]);
    
    // Sort columns by saved order, add missing, and filter hidden
    const orderedColumns = (() => {
        const base = columnOrder.length > 0
            ? (() => {
                const ordered = columnOrder.map(key => allColumns.find(c => c.key === key)).filter(Boolean) as any[];
                const orderedKeys = new Set(ordered.map((c: any) => c.key));
                const missing = allColumns.filter(c => !orderedKeys.has(c.key));
                return [...ordered, ...missing];
            })()
            : allColumns;
        // Filter out hidden columns
        return base.filter((c: any) => !hiddenColumns.has(c.key));
    })();
    
    // Map columns with resize handlers
    const resizableColumns = orderedColumns.map((col: any) => ({
        ...col,
        onHeaderCell: (column: any) => ({
            width: column.width,
            onResize: handleResize(col.key),
            id: `col-${col.key}`,
        }),
    }));

    return (
        <>
            <style>{`
                /* ── TABLE FOUNDATION ── */
                .ops-table .ant-table { font-size: 12px; }
                .ops-table .ant-table-thead > tr > th {
                    background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%) !important;
                    border-bottom: 2px solid #e2e8f0 !important;
                    font-size: 10px !important;
                    font-weight: 700 !important;
                    letter-spacing: 0.3px !important;
                    color: #475569 !important;
                    text-transform: uppercase !important;
                    padding: 6px 8px !important;
                    white-space: nowrap;
                }
                .ops-table .ant-table-tbody > tr > td {
                    padding: 5px 8px !important;
                    font-size: 11.5px !important;
                    border-bottom: 1px solid #f1f5f9 !important;
                    vertical-align: middle !important;
                    transition: none !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    white-space: nowrap !important;
                    word-break: keep-all !important;
                }

                /* ── RESIZE HANDLE ── */
                .react-resizable { position: relative; }
                .react-resizable-handle {
                    position: absolute; width: 10px; height: 100%;
                    bottom: 0; right: -5px; cursor: col-resize; z-index: 2;
                }
                .react-resizable-handle::after {
                    content: ''; position: absolute; right: 3px;
                    top: 50%; transform: translateY(-50%);
                    width: 3px; height: 50%; background: rgba(99,102,241,0.3);
                    border-radius: 2px; transition: all 0.15s;
                }
                .react-resizable-handle:hover::after {
                    background: #6366f1; height: 70%; width: 4px;
                }

                /* ── KILL DEFAULT HOVER (low specificity, placed first) ── */
                .ops-table .ant-table-tbody > tr.ant-table-row:hover > td,
                .ops-table .ant-table-tbody > tr.ant-table-row:hover > td.ant-table-cell,
                .ops-table .ant-table-tbody > tr:hover > td,
                .ops-table td.ant-table-cell-row-hover {
                    background: transparent !important;
                    background-color: transparent !important;
                }

                /* ── STATUS ROW COLORS (placed last = wins cascade) ── */
                ${Object.entries(statusColors).map(([status, color]) => `
                    .ops-table .ant-table-tbody > tr.ant-table-row.status-row-${status.toLowerCase().replace(/_/g, '-')} > td,
                    .ops-table .ant-table-tbody > tr.ant-table-row.status-row-${status.toLowerCase().replace(/_/g, '-')} > td.ant-table-cell,
                    .ops-table .ant-table-tbody > tr.ant-table-row.status-row-${status.toLowerCase().replace(/_/g, '-')}:hover > td,
                    .ops-table .ant-table-tbody > tr.ant-table-row.status-row-${status.toLowerCase().replace(/_/g, '-')}:hover > td.ant-table-cell,
                    .ops-table .ant-table-tbody > tr.ant-table-row.status-row-${status.toLowerCase().replace(/_/g, '-')} > td.ant-table-cell-row-hover {
                        background-color: ${color} !important;
                    }
                `).join('\n')}

                /* ── SCROLLBAR ── */
                .ops-table .ant-table-body::-webkit-scrollbar { width: 6px; height: 6px; }
                .ops-table .ant-table-body::-webkit-scrollbar-track { background: #f8fafc; }
                .ops-table .ant-table-body::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
                .ops-table .ant-table-body::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

                /* ── PAGINATION ── */
                .ops-table .ant-pagination { margin: 8px 16px !important; }
            `}</style>
            
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleUnifiedDragEnd}>
                <SortableContext items={orderedColumns.map((c: any) => `col-${c.key}`)} strategy={horizontalListSortingStrategy}>
                    <SortableContext items={filteredBookings.map(b => `row-${b.id}`)} strategy={verticalListSortingStrategy}>
                        <Table
                            rowKey="id"
                            className="ops-table"
                            bordered={false}
                            columns={resizableColumns}
                            components={{
                                header: {
                                    cell: ResizableTitle,
                                },
                                body: {
                                    row: SortableRow,
                                },
                            }}
                            dataSource={filteredBookings}
                            loading={loading}
                            rowClassName={(record) => {
                                const status = record.operationalStatus || record.status || 'PENDING';
                                return `status-row-${status.toLowerCase().replace(/_/g, '-')}`;
                            }}
                            pagination={{
                                pageSize: 25,
                                showSizeChanger: true,
                                pageSizeOptions: ['10', '25', '50', '100'],
                                size: 'small',
                                showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} kayıt`
                            }}
                            size="small"
                            tableLayout="fixed"
                            scroll={{ x: Object.keys(columnWidths).reduce((sum, key) => sum + (columnWidths[key] || 100), 0), y: 'calc(100vh - 320px)' }}
                            sticky
                        />
                    </SortableContext>
                </SortableContext>
            </DndContext>
        </>
    );
}
