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

    const content = (
        <div style={{ width: 300 }}>
            <div style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                <Row align="middle" justify="space-between">
                    <Col>
                        <Text strong>{t('pax.adults')}</Text>
                        <div style={{ fontSize: 12, color: '#888' }}>13+</div>
                    </Col>
                    <Col>
                        <Space>
                            <Button
                                shape="circle"
                                icon={<MinusOutlined />}
                                onClick={() => handleChange('adults', -1)}
                                disabled={counts.adults <= 1}
                                size="small"
                            />
                            <span style={{ display: 'inline-block', width: 24, textAlign: 'center', fontWeight: 'bold' }}>
                                {counts.adults}
                            </span>
                            <Button
                                shape="circle"
                                icon={<PlusOutlined />}
                                onClick={() => handleChange('adults', 1)}
                                size="small"
                            />
                        </Space>
                    </Col>
                </Row>
            </div>

            <div style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                <Row align="middle" justify="space-between">
                    <Col>
                        <Text strong>{t('pax.children')}</Text>
                        <div style={{ fontSize: 12, color: '#888' }}>3-12</div>
                    </Col>
                    <Col>
                        <Space>
                            <Button
                                shape="circle"
                                icon={<MinusOutlined />}
                                onClick={() => handleChange('children', -1)}
                                disabled={counts.children <= 0}
                                size="small"
                            />
                            <span style={{ display: 'inline-block', width: 24, textAlign: 'center', fontWeight: 'bold' }}>
                                {counts.children}
                            </span>
                            <Button
                                shape="circle"
                                icon={<PlusOutlined />}
                                onClick={() => handleChange('children', 1)}
                                size="small"
                            />
                        </Space>
                    </Col>
                </Row>
            </div>

            <div style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                <Row align="middle" justify="space-between">
                    <Col>
                        <Text strong>{t('pax.babies')}</Text>
                        <div style={{ fontSize: 12, color: '#888' }}>0-2</div>
                    </Col>
                    <Col>
                        <Space>
                            <Button
                                shape="circle"
                                icon={<MinusOutlined />}
                                onClick={() => handleChange('babies', -1)}
                                disabled={counts.babies <= 0}
                                size="small"
                            />
                            <span style={{ display: 'inline-block', width: 24, textAlign: 'center', fontWeight: 'bold' }}>
                                {counts.babies}
                            </span>
                            <Button
                                shape="circle"
                                icon={<PlusOutlined />}
                                onClick={() => handleChange('babies', 1)}
                                size="small"
                            />
                        </Space>
                    </Col>
                </Row>
            </div>

            <div style={{ marginTop: 16, textAlign: 'right' }}>
                <Button type="primary" onClick={() => setOpen(false)} style={{ width: '100%' }}>
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
