'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Popover } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';

interface DateTimePickerInputProps {
  value?: Dayjs | null;
  onChange?: (value: Dayjs) => void;
  disabledDate?: (date: Dayjs) => boolean;
  placeholder?: string;
  locale?: string;
  style?: React.CSSProperties;
  className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_TR_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const MONTHS_EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DateTimePickerInput: React.FC<DateTimePickerInputProps> = ({
  value,
  onChange,
  disabledDate,
  placeholder,
  locale = 'tr',
  style,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'date' | 'time'>('date');
  const [tempDate, setTempDate] = useState<Dayjs | null>(null);
  const [tempHour, setTempHour] = useState(12);
  const [tempMinute, setTempMinute] = useState(0);
  const [viewMonth, setViewMonth] = useState(dayjs());

  const isTr = locale === 'tr';
  const dayNames = isTr ? DAYS_TR : DAYS_EN;
  const monthNames = isTr ? MONTHS_TR : MONTHS_EN;
  const monthNamesShort = isTr ? MONTHS_TR_SHORT : MONTHS_EN_SHORT;

  useEffect(() => {
    if (value) {
      setTempDate(value.startOf('day'));
      setTempHour(value.hour());
      setTempMinute(value.minute());
      setViewMonth(value.startOf('month'));
    }
  }, [value]);

  const calendarDays = useMemo(() => {
    const start = viewMonth.startOf('month');
    const daysInMonth = viewMonth.daysInMonth();
    const dow = start.day(); // 0=Sun
    const offset = dow === 0 ? 6 : dow - 1; // Mon-first
    const days: (Dayjs | null)[] = [];
    for (let i = 0; i < offset; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(start.date(i));
    return days;
  }, [viewMonth]);

  const handleDateClick = (day: Dayjs) => {
    if (disabledDate && disabledDate(day)) return;
    setTempDate(day);
    setStep('time');
  };

  const handleDone = () => {
    if (tempDate) {
      const combined = tempDate.hour(tempHour).minute(tempMinute).second(0);
      onChange?.(combined);
    }
    setOpen(false);
    setTimeout(() => setStep('date'), 300);
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) setTimeout(() => setStep('date'), 300);
  };

  const displayText = value
    ? `${value.date()} ${monthNamesShort[value.month()]} - ${String(value.hour()).padStart(2, '0')}:${String(value.minute()).padStart(2, '0')}`
    : null;

  const defaultPlaceholder = isTr ? 'Tarih & Saat Seç' : 'Select Date & Time';

  const popoverContent = (
    <div style={{ width: 292, fontFamily: 'inherit', userSelect: 'none' }}>
      {/* Step tabs */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        padding: '14px 16px 12px',
        borderBottom: '1px solid #f0f0f0',
        background: '#fafafa',
      }}>
        <button
          onClick={() => setStep('date')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 16px', borderRadius: 20, border: 'none',
            background: step === 'date' ? '#1d4ed8' : '#e5e7eb',
            color: step === 'date' ? '#fff' : '#6b7280',
            cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
            transition: 'all 0.2s',
          }}
        >
          <CalendarOutlined style={{ fontSize: 12 }} />
          {isTr ? 'Tarih' : 'Date'}
        </button>
        <span style={{ margin: '0 6px', color: '#9ca3af', fontSize: 14, lineHeight: 1 }}>›</span>
        <button
          onClick={() => { if (tempDate) setStep('time'); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 16px', borderRadius: 20, border: 'none',
            background: step === 'time' ? '#1d4ed8' : '#e5e7eb',
            color: step === 'time' ? '#fff' : (tempDate ? '#374151' : '#9ca3af'),
            cursor: tempDate ? 'pointer' : 'default', fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
            opacity: tempDate ? 1 : 0.5,
            transition: 'all 0.2s',
          }}
        >
          <ClockCircleOutlined style={{ fontSize: 12 }} />
          {isTr ? 'Saat' : 'Time'}
        </button>
      </div>

      {step === 'date' ? (
        <div style={{ padding: '14px 16px 18px' }}>
          {/* Month navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <button
              onClick={() => setViewMonth(m => m.subtract(1, 'month'))}
              style={{
                background: '#f3f4f6', border: 'none', cursor: 'pointer',
                color: '#374151', padding: '5px 10px', borderRadius: 8, fontSize: 15,
                lineHeight: 1, transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#e5e7eb')}
              onMouseLeave={e => (e.currentTarget.style.background = '#f3f4f6')}
            >
              ‹
            </button>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>
              {monthNames[viewMonth.month()]} {viewMonth.year()}
            </span>
            <button
              onClick={() => setViewMonth(m => m.add(1, 'month'))}
              style={{
                background: '#f3f4f6', border: 'none', cursor: 'pointer',
                color: '#374151', padding: '5px 10px', borderRadius: 8, fontSize: 15,
                lineHeight: 1, transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#e5e7eb')}
              onMouseLeave={e => (e.currentTarget.style.background = '#f3f4f6')}
            >
              ›
            </button>
          </div>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 6 }}>
            {dayNames.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#9ca3af', padding: '2px 0' }}>
                {d}
              </div>
            ))}
          </div>
          {/* Day grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {calendarDays.map((day, i) => {
              if (!day) return <div key={`e-${i}`} />;
              const isDisabled = disabledDate ? disabledDate(day) : false;
              const isSelected = !!(tempDate && day.isSame(tempDate, 'day'));
              const isToday = day.isSame(dayjs(), 'day');
              return (
                <button
                  key={day.format('YYYY-MM-DD')}
                  onClick={() => handleDateClick(day)}
                  disabled={isDisabled}
                  style={{
                    width: '100%', aspectRatio: '1', border: 'none',
                    borderRadius: '50%', cursor: isDisabled ? 'not-allowed' : 'pointer',
                    background: isSelected ? '#1d4ed8' : 'transparent',
                    color: isDisabled ? '#d1d5db' : isSelected ? '#fff' : isToday ? '#1d4ed8' : '#374151',
                    fontWeight: isSelected || isToday ? 700 : 400,
                    fontSize: 13, fontFamily: 'inherit',
                    transition: 'background 0.12s',
                    outline: isToday && !isSelected ? '1.5px solid #1d4ed8' : 'none',
                    outlineOffset: '-1px',
                  }}
                  onMouseEnter={e => { if (!isDisabled && !isSelected) e.currentTarget.style.background = '#eff6ff'; }}
                  onMouseLeave={e => { if (!isDisabled && !isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {day.date()}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ padding: '22px 20px 20px', textAlign: 'center' }}>
          {/* Selected date display */}
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2, fontWeight: 500 }}>
            {isTr ? 'Seçilen tarih' : 'Selected date'}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#111827', marginBottom: 22 }}>
            {tempDate
              ? `${tempDate.date()} ${monthNames[tempDate.month()]} ${tempDate.year()}`
              : '—'}
          </div>
          {/* Time select */}
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12, fontWeight: 500 }}>
            {isTr ? 'Saat seçin' : 'Select time'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 22 }}>
            <select
              value={tempHour}
              onChange={e => setTempHour(Number(e.target.value))}
              style={{
                width: 68, height: 46, border: '1.5px solid #e5e7eb', borderRadius: 10,
                fontSize: 20, fontWeight: 700, textAlign: 'center', cursor: 'pointer',
                background: '#f9fafb', color: '#111827', fontFamily: 'inherit',
                outline: 'none',
              }}
            >
              {HOURS.map(h => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
              ))}
            </select>
            <span style={{ fontSize: 24, fontWeight: 700, color: '#374151', lineHeight: 1 }}>:</span>
            <select
              value={tempMinute}
              onChange={e => setTempMinute(Number(e.target.value))}
              style={{
                width: 68, height: 46, border: '1.5px solid #e5e7eb', borderRadius: 10,
                fontSize: 20, fontWeight: 700, textAlign: 'center', cursor: 'pointer',
                background: '#f9fafb', color: '#111827', fontFamily: 'inherit',
                outline: 'none',
              }}
            >
              {MINUTES.map(m => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleDone}
            style={{
              width: '100%', height: 46, background: '#1d4ed8', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 0.2,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#1e40af')}
            onMouseLeave={e => (e.currentTarget.style.background = '#1d4ed8')}
          >
            {isTr ? 'Tamam' : 'Done'}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      trigger="click"
      content={popoverContent}
      overlayInnerStyle={{
        padding: 0, borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
      }}
      arrow={false}
      placement="bottomLeft"
    >
      <div
        className={className}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, ...style }}
      >
        <CalendarOutlined style={{ color: displayText ? '#1d4ed8' : '#9ca3af', fontSize: 15, flexShrink: 0 }} />
        <span style={{
          fontSize: 14, fontWeight: displayText ? 600 : 400,
          color: displayText ? '#111827' : '#9ca3af',
          whiteSpace: 'nowrap',
        }}>
          {displayText || (placeholder ?? defaultPlaceholder)}
        </span>
      </div>
    </Popover>
  );
};

export default DateTimePickerInput;
