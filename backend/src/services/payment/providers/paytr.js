const crypto = require('crypto');
const axios = require('axios');

class PayTRProvider {
    /**
     * @param {Object} config - { merchantId, merchantKey, merchantSalt, testMode }
     */
    constructor(config) {
        this.config = config;
    }

    /**
     * Initialize payment (Get Tokens)
     * @param {Object} params
     * @param {number} params.amount - Amount (e.g., 150.00)
     * @param {string} params.currency - Currency code (TRY, USD, EUR)
     * @param {string} params.orderId - Unique order ID
     * @param {string} params.userIp - User IP Address
     * @param {Object} params.user - { email, name, address, phone }
     * @param {Array} params.basket - Array of { name, price, category }
     * @returns {Promise<{ html: string }>} iframe content
     */
    async initializePayment(params) {
        const { merchantId, merchantKey, merchantSalt, testMode, successUrl, failUrl } = this.config;

        // Prepare data for PayTR
        const user_basket = JSON.stringify(params.basket.map(item => [item.name, item.price.toString(), 1]));
        const merchant_oid = params.orderId;
        const user_ip = params.userIp || '127.0.0.1';
        const email = params.user.email;
        const payment_amount = Math.round(params.amount * 100); // Kuruş cinsinden
        const currency = params.currency || 'TL'; // PayTR uses TL instead of TRY usually, but let's check docs. Actually TL/USD/EUR.
        const test_mode = testMode ? '1' : '0';

        // Token generation
        // hash_str = merchant_id + user_ip + merchant_oid + email + payment_amount + user_basket + no_installment + max_installment + currency + test_mode;
        const no_installment = '0'; // Taksit yok
        const max_installment = '0'; // Tek çekim

        const hash_str = `${merchantId}${user_ip}${merchant_oid}${email}${payment_amount}${user_basket}${no_installment}${max_installment}${currency}${test_mode}`;
        const paytr_token = crypto.createHmac('sha256', merchantKey + merchantSalt).update(hash_str).digest('base64');

        const requestData = {
            merchant_id: merchantId,
            user_ip: user_ip,
            merchant_oid: merchant_oid,
            email: email,
            payment_amount: payment_amount,
            paytr_token: paytr_token,
            user_basket: user_basket,
            debug_on: '1', // Hata mesajlarını görmek için
            no_installment: no_installment,
            max_installment: max_installment,
            user_name: params.user.name,
            user_address: params.user.address || 'Adres yok',
            user_phone: params.user.phone || '05555555555',
            merchant_ok_url: successUrl,
            merchant_fail_url: failUrl,
            timeout_limit: '30',
            currency: currency,
            test_mode: test_mode
        };

        try {
            const result = await axios.post('https://www.paytr.com/odeme/api/get-token', new URLSearchParams(requestData), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            if (result.data.status === 'success') {
                return {
                    success: true,
                    html: `<iframe src="https://www.paytr.com/odeme/guvenli/${result.data.token}" id="paytriframe" frameborder="0" scrolling="no" style="width: 100%;"></iframe>`,
                    raw: result.data
                };
            } else {
                console.error('PayTR Error:', result.data.reason);
                return {
                    success: false,
                    error: result.data.reason
                };
            }
        } catch (error) {
            console.error('PayTR Request Error:', error);
            throw new Error('PayTR connection failed: ' + error.message);
        }
    }
}

module.exports = PayTRProvider;
