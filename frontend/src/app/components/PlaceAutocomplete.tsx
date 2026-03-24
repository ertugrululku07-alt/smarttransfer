'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Input, List, Spin } from 'antd';
import type { InputRef } from 'antd';

type Props = {
  value: string;
  onChange: (value: string, lat?: number, lon?: number) => void; // lat ve lon eklendi
  placeholder?: string;
};

type Suggestion = {
  display_name: string;
  lat: string; // Nominatim'den string olarak geliyor
  lon: string; // Nominatim'den string olarak geliyor
};

const PlaceAutocomplete: React.FC<Props> = ({ value, onChange, placeholder }) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<InputRef | null>(null);

  const handleChange = (text: string) => {
    onChange(text); // Sadece metni gönder, koordinatlar henüz belli değil
    setOpen(true);

    if (timerRef.current) clearTimeout(timerRef.current);

    if (!text || text.length < 3) {
      setSuggestions([]);
      return;
    }

    timerRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            text
          )}&addressdetails=1&limit=5&countrycodes=tr`
        );
        const data = await res.json();
        setSuggestions(data);
      } catch (err) {
        console.error('Nominatim error', err);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 400); // 400ms debounce
  };

  const handleSelect = (item: Suggestion) => {
    onChange(item.display_name, parseFloat(item.lat), parseFloat(item.lon)); // Metin ve koordinatları gönder
    setOpen(false);
    setSuggestions([]);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <Input
        ref={inputRef}
        size="large"
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => value && setOpen(true)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 200);
        }}
      />
      {open && (loading || suggestions.length > 0) && (
        <div
          style={{
            position: 'absolute',
            top: 42,
            left: 0,
            right: 0,
            zIndex: 1000,
            background: '#fff',
            border: '1px solid #d9d9d9',
            borderRadius: 4,
            maxHeight: 240,
            overflowY: 'auto',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          {loading ? (
            <div style={{ padding: 12, textAlign: 'center' }}>
              <Spin size="small" /> <span style={{ marginLeft: 8 }}>Aranıyor...</span>
            </div>
          ) : (
            <List
              size="small"
              dataSource={suggestions}
              renderItem={(item) => (
                <List.Item
                  style={{ cursor: 'pointer' }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(item)}
                >
                  {item.display_name}
                </List.Item>
              )}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default PlaceAutocomplete;