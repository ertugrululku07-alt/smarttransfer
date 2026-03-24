'use client';

import React, { useState } from 'react';
import { Card, Button, Typography, message, Upload, Table } from 'antd';
import { InboxOutlined, CloudUploadOutlined } from '@ant-design/icons';
import apiClient from '@/lib/api-client';
import AgencyLayout from '../../AgencyLayout';
import AgencyGuard from '../../AgencyGuard';

const { Title, Text } = Typography;
const { Dragger } = Upload;

const AgencyBulkTransferPage = () => {
    const [loading, setLoading] = useState(false);
    const [fileList, setFileList] = useState<any[]>([]);

    const handleUpload = async () => {
        // In a real scenario, we would parse Excel/CSV here or send the file directly to the server.
        // For demonstration of the B2B mock:
        if (fileList.length === 0) {
            return message.warning('Lütfen bir dosya seçin.');
        }

        try {
            setLoading(true);

            // Simulating parsing of 5 bookings
            const mockTransfers = Array.from({ length: 5 }).map((_, i) => ({
                contactName: `B2B Müşteri ${i + 1}`,
                contactPhone: `555000000${i}`,
                amount: 1500,
                passengers: 2,
                date: new Date(Date.now() + 86400000 * (i + 1)).toISOString()
            }));

            await apiClient.post('/api/agency/bookings/bulk', { transfers: mockTransfers });
            message.success('Toplu transfer listesi başarıyla içeri aktarıldı.');
            setFileList([]);
        } catch (error) {
            console.error('Bulk upload error:', error);
            message.error('Toplu yükleme sırasında hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AgencyGuard>
            <AgencyLayout selectedKey="bulk-transfer">
                <Card bordered={false}>
                    <div style={{ marginBottom: 24 }}>
                        <Title level={4} style={{ margin: 0 }}>Toplu Transfer Yükleme (Excel / CSV)</Title>
                        <Text type="secondary">Elinizdeki listeyi Excel veya CSV formatında tek seferde sisteme aktarabilirsiniz.</Text>
                    </div>

                    <div style={{ border: '1px solid #d9d9d9', padding: 24, borderRadius: 8, background: '#fafafa' }}>
                        <Dragger
                            name="file"
                            multiple={false}
                            fileList={fileList}
                            onChange={(info) => setFileList(info.fileList.slice(-1))}
                            beforeUpload={() => false} // prevent auto upload
                        >
                            <p className="ant-upload-drag-icon">
                                <InboxOutlined />
                            </p>
                            <p className="ant-upload-text">Dosyayı seçmek için tıklayın veya buraya sürükleyin</p>
                            <p className="ant-upload-hint">Yalnızca .xlsx ve .csv dosyaları desteklenmektedir.</p>
                        </Dragger>

                        <div style={{ marginTop: 24, textAlign: 'center' }}>
                            <Button
                                type="primary"
                                onClick={handleUpload}
                                disabled={fileList.length === 0}
                                loading={loading}
                                icon={<CloudUploadOutlined />}
                                size="large"
                            >
                                Yüklemeyi Başlat
                            </Button>
                        </div>
                    </div>
                </Card>
            </AgencyLayout>
        </AgencyGuard>
    );
};

export default AgencyBulkTransferPage;
