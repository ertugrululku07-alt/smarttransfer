const fs = require('fs');
const path = 'D:\\SmartTransfer\\frontend\\src\\app\\transfer\\book\\page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add Suspense
content = content.replace('import React, { useState, useEffect } from \'react\';', 'import React, { useState, useEffect, Suspense } from \'react\';');

// 2. Add ArrowRightOutlined
content = content.replace('MinusOutlined\n} from \'@ant-design/icons\';', 'MinusOutlined,\n    ArrowRightOutlined\n} from \'@ant-design/icons\';');
content = content.replace('MinusOutlined\r\n} from \'@ant-design/icons\';', 'MinusOutlined,\r\n    ArrowRightOutlined\r\n} from \'@ant-design/icons\';');

// 3. Rename component
content = content.replace('const TransferBookingPage: React.FC = () => {', 'const TransferBookingContent: React.FC = () => {');

// 4. Add Suspense wrapper
const suffix = `};

const TransferBookingPage: React.FC = () => {
    return (
        <Suspense fallback={<div style={{ padding: '100px', textAlign: 'center' }}><Spin size="large" /><div style={{ marginTop: 16 }}>Yükleniyor...</div></div>}>
            <TransferBookingContent />
        </Suspense>
    );
};

export default TransferBookingPage;
`;

content = content.replace(/};\s*export default TransferBookingPage;\s*$/, suffix);

fs.writeFileSync(path, content, 'utf8');
console.log('Done!');
