const fs = require('fs');
const path = 'd:\\SmartTransfer\\backend\\prisma\\schema.prisma';
const target = 'd:\\SmartTransfer\\backend\\prisma\\rebuilt.prisma';

try {
    let content = fs.readFileSync(path, 'utf8');

    // Find marking point
    const markers = [
        '// MODULE: ACCOUNTING',
        '// ============================================================================\r\n// ACCOUNTING MODULE',
        '// ============================================================================\n// ACCOUNTING MODULE',
        'model Account {'
    ];

    let cutIndex = -1;
    for (const m of markers) {
        const idx = content.indexOf(m);
        if (idx !== -1) {
            cutIndex = idx;
            console.log(`Found marker: "${m}" at ${idx}`);
            // If it's "model Account", backup to find comments
            if (m.startsWith('model')) {
                const commentSearch = content.lastIndexOf('//', idx);
                if (commentSearch !== -1 && (idx - commentSearch) < 200) {
                    cutIndex = commentSearch;
                }
            }
            break;
        }
    }

    if (cutIndex === -1) {
        throw new Error('Could not find split point');
    }

    // Valid top part
    const topPart = content.substring(0, cutIndex);

    // New bottom part
    const bottomPart = `// MODULE: ACCOUNTING
// ============================================================================

model Account {
  id          String    @id @default(uuid())
  tenantId    String
  tenant      Tenant    @relation(fields: [tenantId], references: [id])
  
  code        String    // Unique code per tenant (e.g. "C-001")
  name        String
  type        AccountType
  
  taxNumber   String?
  taxOffice   String?
  address     String?
  phone       String?
  email       String?
  
  currency    String    @default("TRY")
  
  // Financial Snapshot
  balance     Decimal   @default(0) @db.Decimal(15, 2)
  debit       Decimal   @default(0) @db.Decimal(15, 2) // Borç
  credit      Decimal   @default(0) @db.Decimal(15, 2) // Alacak
  
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  @@unique([tenantId, code])
  @@index([tenantId])
  @@index([type])
}

enum AccountType {
  CUSTOMER
  SUPPLIER
  PARTNER
  PERSONNEL
  OTHER
}

// ============================================================================
// BANKING MODULE
// ============================================================================

model Bank {
  id        String   @id @default(uuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  name      String   // Banka Adı (Garanti, İş Bankası vb.)
  code      String?  // Banka Kodu
  logo      String?  // Logo URL
  website   String?  // İnternet Şubesi URL vb.
  status    Boolean  @default(true)
  
  accounts  BankAccount[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@unique([tenantId, name])
}

model BankAccount {
  id            String   @id @default(uuid())
  bankId        String
  bank          Bank     @relation(fields: [bankId], references: [id], onDelete: Cascade)
  
  accountName   String   // Hesap Adı (Şirket Ana Hesap vb.)
  accountNumber String   // Hesap No
  iban          String   // IBAN
  branchName    String?  // Şube Adı
  branchCode    String?  // Şube Kodu
  currency      String   @default("TRY") // TRY, USD, EUR
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
`;

    fs.writeFileSync(target, topPart + bottomPart, 'utf8');
    console.log('Rebuilt schema saved to rebuilt.prisma');

} catch (e) {
    console.error('Error:', e);
    process.exit(1);
}
