const currencies = [
  { id: '7lay2lkbe', code: 'TRY', rate: 1, symbol: '₺', isDefault: true },
  { id: '0o4zrxdd1', code: 'USD', rate: 4450, symbol: '€' },
  { id: 'hwy5g2fm4', code: 'EUR', rate: 5150, symbol: '€' }
];

const selectedCurrency = 'TRY';

const convertPrice = (amount, fromCode, toCode) => {
    if (!currencies.length) return amount;
    const targetCode = toCode || selectedCurrency;
    if (fromCode === targetCode) return amount;

    const fromCurr = currencies.find(c => c.code === fromCode);
    const toCurr = currencies.find(c => c.code === targetCode);

    if (!fromCurr || !toCurr) return amount;

    const baseValue = amount * (fromCurr.rate || 1);
    const converted = baseValue / (toCurr.rate || 1);

    return Math.round(converted);
};

const formatPrice = (amount, fromCode) => {
    const converted = convertPrice(amount, fromCode);
    const curr = currencies.find(c => c.code === selectedCurrency);
    const symbol = curr ? curr.symbol : selectedCurrency;
    
    return `${symbol}${converted.toLocaleString('tr-TR')}`;
};

console.log(formatPrice(61, 'EUR'));
