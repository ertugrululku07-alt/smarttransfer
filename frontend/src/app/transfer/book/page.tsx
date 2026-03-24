'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    Layout,
    Card,
    Row,
    Col,
    Typography,
    Form,
    Input,
    Button,
    Steps,
    Divider,
    Space,
    Radio,
    message,
    Spin,
    Result,
    Tag,
    Alert,
    Checkbox,
    Collapse,
    Select
} from 'antd';
import {
    CarOutlined,
    UserOutlined,
    CalendarOutlined,
    EnvironmentOutlined,
    CreditCardOutlined,
    RocketOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    DashboardOutlined,
    ShoppingOutlined,
    PlusOutlined,
    MinusOutlined,
    ArrowRightOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/lib/api-client';
import TopBar from '@/app/components/TopBar';
import BookingMap from '@/app/components/BookingMap';
import { useCurrency } from '@/app/context/CurrencyContext';
import { countryList } from '@/lib/countryData';

const { Content, Footer } = Layout;
const { Title, Text, Paragraph } = Typography;

const TransferBookingContent: React.FC = () => {
    const { formatPrice, convertPrice, selectedCurrency } = useCurrency();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [form] = Form.useForm();

    const [wantInvoice, setWantInvoice] = useState(false);
    const [invoiceType, setInvoiceType] = useState<'individual' | 'corporate'>('individual');
    const [notCitizen, setNotCitizen] = useState(false);

    const { Option } = Select;

    const priorityCodes = ['TR', 'DE', 'GB', 'RU', 'NL', 'UA', 'FR', 'US', 'SA', 'AE'];
    const sortedCountries = [
        ...countryList.filter(c => priorityCodes.includes(c.code)),
        ...countryList.filter(c => !priorityCodes.includes(c.code))
    ];

    const prefixSelector = (
        <Form.Item name="prefix" noStyle initialValue="+90">
            <Select
                style={{ width: 140 }}
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                    String(option?.label || '').toLowerCase().includes(input.toLowerCase())
                }
                popupMatchSelectWidth={300}
            >
                {sortedCountries.map(c => (
                    <Option key={c.code} value={'+' + c.phone} label={c.label}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <img src={`https://flagcdn.com/w20/${c.code.toLowerCase()}.png`} width="20" alt={c.code} style={{ borderRadius: 2 }} />
                            <span>{c.code} (+{c.phone})</span>
                            <span style={{ color: '#999', fontSize: 12, marginLeft: 'auto' }}>{c.label}</span>
                        </div>
                    </Option>
                ))}
            </Select>
        </Form.Item>
    );

    const [loading, setLoading] = useState(false);
    const [bookingSuccess, setBookingSuccess] = useState(false);
    const [bookingNumber, setBookingNumber] = useState<string | null>(null);

    const vehicleId = searchParams.get('vehicleId');
    const pickup = searchParams.get('pickup');
    const dropoff = searchParams.get('dropoff');
    const date = searchParams.get('date');
    const time = searchParams.get('time');
    const passengers = searchParams.get('passengers');
    const type = searchParams.get('type');
    const durationParam = searchParams.get('duration');

    const [vehicleDetails, setVehicleDetails] = useState<any>(null);
    const [tripStats, setTripStats] = useState({ distance: 'Calculating...', duration: 'Calculating...' });

    const handleDistanceCalculated = (distance: string, duration: string) => {
        setTripStats({ distance, duration });
    };

    useEffect(() => {
        if (!vehicleId) {
            router.push('/');
            return;
        }
        fetchVehicleDetails();
    }, [vehicleId, router]);

    useEffect(() => {
        if (passengers) {
            const count = Math.max(0, (Number(passengers) || 1) - 1);
            const list = Array(count).fill({ firstName: '', lastName: '', nationality: undefined });
            form.setFieldsValue({ passengerList: list });
        }
    }, [passengers, form]);

    const fetchVehicleDetails = async () => {
        try {
            const pickupDateTime = time ? `${date}T${time}:00.000` : date;
            const pickupLat = searchParams.get('pickupLat');
            const pickupLng = searchParams.get('pickupLng');
            const distance = sessionStorage.getItem('routeDistance');
            const encodedPolyline = sessionStorage.getItem('lastEncodedPolyline');
            const cleanDistance = distance ? parseFloat(String(distance).replace(/[^0-9.]/g, '')) : undefined;

            const payload = {
                pickup,
                dropoff,
                pickupDateTime,
                passengers: Number(passengers),
                transferType: type,
                pickupLat,
                pickupLng,
                distance: cleanDistance,
                encodedPolyline: encodedPolyline || undefined
            };

            const res = await apiClient.post('/api/transfer/search', payload);
            if (res.data.success) {
                const found = res.data.data.results.find((v: any) => String(v.id) === vehicleId);
                if (found) setVehicleDetails(found);
                else {
                    message.error('Seçilen araç artık müsait değil.');
                    router.back();
                }
            }
        } catch (err) {
            console.error('Vehicle details error:', err);
        }
    };

    const [extraServices, setExtraServices] = useState<any[]>([]);
    const [selectedServices, setSelectedServices] = useState<Map<string, number>>(new Map());
    const [servicesLoading, setServicesLoading] = useState(false);

    useEffect(() => {
        const fetchExtraServices = async () => {
            try {
                setServicesLoading(true);
                const res = await apiClient.get('/api/extra-services');
                if (res.data.success) setExtraServices(res.data.data);
            } catch (error) {
                console.error('Error fetching extra services:', error);
            } finally {
                setServicesLoading(false);
            }
        };
        fetchExtraServices();
    }, []);

    const handleServiceChange = (serviceId: string, quantity: number) => {
        const newSelected = new Map(selectedServices);
        if (quantity > 0) newSelected.set(serviceId, quantity);
        else newSelected.delete(serviceId);
        setSelectedServices(newSelected);
    };

    const vehiclePrice = vehicleDetails ? Number(vehicleDetails.price) : 0;
    const convertedVehiclePrice = vehicleDetails ? convertPrice(vehiclePrice, vehicleDetails.currency, selectedCurrency) : 0;

    const getConvertedServicePrice = () => {
        let total = 0;
        selectedServices.forEach((qty, id) => {
            const service = extraServices.find(s => s.id === id);
            if (service) {
                const converted = convertPrice(Number(service.price), service.currency, selectedCurrency);
                total += converted * qty;
            }
        });
        return total;
    };

    const grandTotal = convertedVehiclePrice + getConvertedServicePrice();

    const onFinish = async (values: any) => {
        if (!vehicleDetails) return;
        try {
            setLoading(true);
            const pickupDateTime = time ? `${date}T${time}:00.000` : date;
            const fullPhone = values.phone ? `${values.prefix || '+90'} ${values.phone}` : values.phone;
            const selectedServicesList = Array.from(selectedServices.entries()).map(([id, qty]) => {
                const service = extraServices.find(s => s.id === id);
                return {
                    id: service?.id,
                    name: service?.name,
                    price: Number(service?.price),
                    currency: service?.currency,
                    quantity: qty,
                    total: Number(service?.price) * qty
                };
            });

            const payload = {
                vehicleType: vehicleDetails.vehicleType,
                pickup,
                dropoff,
                pickupDateTime,
                passengers: Number(passengers),
                price: grandTotal,
                currency: selectedCurrency,
                customerInfo: { fullName: values.fullName, email: values.email, phone: fullPhone },
                flightNumber: values.flightNumber,
                notes: values.notes,
                passengerDetails: [
                    { firstName: values.fullName.split(' ')[0], lastName: values.fullName.split(' ').slice(1).join(' ') || '', nationality: null },
                    ...(values.passengerList || [])
                ],
                extraServices: selectedServicesList,
                billingDetails: wantInvoice ? {
                    type: invoiceType,
                    fullName: invoiceType === 'individual' ? values.billingFullName : undefined,
                    tcNo: invoiceType === 'individual' && !notCitizen ? values.tcNo : undefined,
                    isCitizen: !notCitizen,
                    companyName: invoiceType === 'corporate' ? values.companyName : undefined,
                    taxOffice: invoiceType === 'corporate' ? values.taxOffice : undefined,
                    taxNo: invoiceType === 'corporate' ? values.taxNo : undefined,
                    address: values.billingAddress
                } : undefined
            };

            const res = await apiClient.post('/api/transfer/book', payload);
            if (res.data.success) {
                setBookingSuccess(true);
                setBookingNumber(res.data.data.bookingNumber);
                message.success('Rezervasyonunuz başarıyla oluşturuldu!');
                window.scrollTo(0, 0);
            }
        } catch (err: any) {
            message.error(err.response?.data?.error || 'Rezervasyon oluşturulurken bir hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    if (bookingSuccess) {
        return (
            <Layout style={{ minHeight: '100vh', background: '#fff' }}>
                <TopBar />
                <Content style={{ padding: '48px 24px', maxWidth: 800, margin: '0 auto' }}>
                    <Result
                        status="success"
                        title="Rezervasyonunuz Başarıyla Alındı!"
                        subTitle={`Rezervasyon Numaranız: ${bookingNumber}. Detaylar e-posta adresinize gönderilmiştir.`}
                        extra={[
                            <Button type="primary" key="home" onClick={() => router.push('/')}>Anasayfaya Dön</Button>,
                            <Button key="account" onClick={() => router.push('/login')}>Hesabıma Git</Button>,
                        ]}
                    />
                </Content>
            </Layout>
        );
    }

    return (
        <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
            <TopBar />
            <Content style={{ maxWidth: 1200, margin: '24px auto', padding: '0 24px', width: '100%' }}>
                <div style={{ marginBottom: 24 }}>
                    <Steps current={2} items={[{ title: 'Arama' }, { title: 'Seçim' }, { title: 'Bilgiler' }, { title: 'Ödeme' }]} />
                </div>
                <Row gutter={24}>
                    <Col xs={24} lg={16}>
                        <Card title="Yolcu Bilgileri">
                            <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ paymentMethod: 'cash' }}>
                                <Row gutter={16}>
                                    <Col span={12}><Form.Item name="fullName" label="Ad Soyad" rules={[{ required: true }]}><Input size="large" placeholder="Adınız Soyadınız" /></Form.Item></Col>
                                    <Col span={12}><Form.Item name="phone" label="Telefon"><Space.Compact style={{ width: '100%' }}>{prefixSelector}<Form.Item name="phone" noStyle rules={[{ required: true }]}><Input size="large" style={{ width: 'calc(100% - 140px)' }} /></Form.Item></Space.Compact></Form.Item></Col>
                                </Row>
                                <Form.Item name="email" label="E-posta" rules={[{ required: true, type: 'email' }]}><Input size="large" /></Form.Item>
                                <Button type="primary" htmlType="submit" size="large" loading={loading} block style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none', height: 50 }}>Rezervasyonu Tamamla</Button>
                            </Form>
                        </Card>
                    </Col>
                    <Col xs={24} lg={8}>
                        <Card title="Özet">
                            <div style={{ marginBottom: 12 }}><Text strong>{pickup} <ArrowRightOutlined /> {dropoff}</Text></div>
                            <div style={{ marginBottom: 12 }}><Text>{dayjs(date).format('DD.MM.YYYY')} {time}</Text></div>
                            <Divider />
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text>Araç:</Text><Text strong>{vehicleDetails?.vehicleType}</Text></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}><Title level={4}>Toplam:</Title><Title level={4} style={{ color: '#667eea' }}>{formatPrice(grandTotal, selectedCurrency)}</Title></div>
                        </Card>
                    </Col>
                </Row>
            </Content>
        </Layout>
    );
};

const TransferBookingPage: React.FC = () => {
    return (
        <Suspense fallback={<div style={{ padding: '100px', textAlign: 'center' }}><Spin size="large" /><div style={{ marginTop: 16 }}>Yükleniyor...</div></div>}>
            <TransferBookingContent />
        </Suspense>
    );
};

export default TransferBookingPage;
