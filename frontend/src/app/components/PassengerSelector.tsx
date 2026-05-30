'use client';

import React, { useState, useEffect } from 'react';
import { Popover, Button, Input, Space, Typography, Row, Col } from 'antd';
import { UserOutlined, PlusOutlined, MinusOutlined, DownOutlined } from '@ant-design/icons';
import { useLanguage } from '../context/LanguageContext';

const { Text } = Typography;

interface PassengerCounts {
    adults: number;
    children: number;
    babies: number;
}

interface PassengerSelectorProps {
    value?: PassengerCounts;
    onChange?: (counts: PassengerCounts) => void;
    size?: 'large' | 'middle' | 'small';
}

const PassengerSelector: React.FC<PassengerSelectorProps> = ({
    value = { adults: 1, children: 0, babies: 0 },
    onChange,
    size = 'middle'
}) => {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const [counts, setCounts] = useState<PassengerCounts>(value);

    useEffect(() => {
        setCounts(value);
    }, [value]);

    const handleChange = (type: keyof PassengerCounts, delta: number) => {
        const newCounts = { ...counts, [type]: Math.max(0, counts[type] + delta) };

        // Ensure at least 1 adult
        if (type === 'adults' && newCounts.adults < 1) return;

        setCounts(newCounts);
        if (onChange) {
            onChange(newCounts);
        }
    };

    const totalPassengers = counts.adults + counts.children + counts.babies;

    const PaxRow = ({ label, age, type, min }: { label: string; age: string; type: keyof PassengerCounts; min: number }) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f5f5f5' }}>
            <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{label}</span>
                <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>{age}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button
                    shape="circle" icon={<MinusOutlined />} size="small"
                    onClick={() => handleChange(type, -1)}
                    disabled={counts[type] <= min}
                />
                <span style={{ display: 'inline-block', width: 20, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>
                    {counts[type]}
                </span>
                <Button
                    shape="circle" icon={<PlusOutlined />} size="small"
                    onClick={() => handleChange(type, 1)}
                />
            </div>
        </div>
    );

    const content = (
        <div style={{ width: 240 }}>
            <PaxRow label={t('pax.adults')}   age="13+" type="adults"   min={1} />
            <PaxRow label={t('pax.children')} age="3-12" type="children" min={0} />
            <PaxRow label={t('pax.babies')}   age="0-2"  type="babies"   min={0} />
            <div style={{ marginTop: 10 }}>
                <Button type="primary" onClick={() => setOpen(false)} style={{ width: '100%', height: 36 }}>
                    OK
                </Button>
            </div>
        </div>
    );

    const summaryText = `${counts.adults} ${t('pax.adults')}${counts.children > 0 ? `, ${counts.children} ${t('pax.children')}` : ''}${counts.babies > 0 ? `, ${counts.babies} ${t('pax.babies')}` : ''}`;
    const valueText = `${counts.adults} / ${counts.children} / ${counts.babies}`;

    return (
        <Popover
            content={content}
            title={t('search.passengers')}
            trigger="click"
            open={open}
            onOpenChange={setOpen}
            placement="bottomLeft"
            autoAdjustOverflow={false}
        >
            <div style={{ position: 'relative', cursor: 'pointer' }}>
                <Input
                    size={size}
                    value={valueText}
                    readOnly
                    prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
                    suffix={<DownOutlined style={{ fontSize: 12, color: '#bfbfbf' }} />}
                    style={{ cursor: 'pointer', borderRadius: 'var(--radius-md)' }}
                />
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    background: 'transparent'
                }} />
            </div>
        </Popover>
    );
};

export default PassengerSelector;
