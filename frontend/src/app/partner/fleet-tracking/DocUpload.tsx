'use client';

import React, { useState } from 'react';
import { Button, Input, Tooltip, Upload, message } from 'antd';
import { UploadOutlined, FilePdfOutlined, FileImageOutlined, DeleteOutlined, LinkOutlined } from '@ant-design/icons';
import { API_URL } from '@/lib/config';

export default function DocUpload({ value, onChange }: { value?: string; onChange?: (v: string | undefined) => void }) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const form = new FormData();
      form.append('file', file);
      const r = await fetch(`${API_URL}/api/partner-fleet/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await r.json();
      if (data?.success) {
        message.success('Yüklendi');
        onChange?.(data.data.url);
      } else {
        message.error(data?.error || 'Yüklenemedi');
      }
    } catch (e: any) {
      message.error(e?.message || 'Yüklenemedi');
    } finally { setUploading(false); }
    return false;
  };

  const isPdf = value?.toLowerCase().endsWith('.pdf');
  const filename = value ? value.split('/').pop() : '';

  return (
    <div>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          {isPdf ? <FilePdfOutlined style={{ color: '#ef4444', fontSize: 18 }} /> : <FileImageOutlined style={{ color: '#3b82f6', fontSize: 18 }} />}
          <a href={`${API_URL}${value}`} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</a>
          <Tooltip title="Bağlantıyı kopyala">
            <Button size="small" icon={<LinkOutlined />} onClick={() => { navigator.clipboard.writeText(`${API_URL}${value}`); message.success('Kopyalandı'); }} />
          </Tooltip>
          <Tooltip title="Kaldır">
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onChange?.(undefined)} />
          </Tooltip>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <Upload beforeUpload={handleUpload} showUploadList={false} accept=".pdf,image/*">
            <Button icon={<UploadOutlined />} loading={uploading}>Belge Yükle (PDF / Resim)</Button>
          </Upload>
          <Input placeholder="veya URL yapıştır" allowClear onChange={(e) => onChange?.(e.target.value || undefined)} />
        </div>
      )}
    </div>
  );
}
