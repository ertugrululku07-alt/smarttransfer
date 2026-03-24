const fs = require('fs');
const path = 'd:\\SmartTransfer\\backend\\prisma\\schema.prisma';

try {
    let content = fs.readFileSync(path, 'utf8');

    // Find the start of Accounting Module - FIRST OCCURRENCE
    const marker = '// MODULE: ACCOUNTING';
    const cutIndex = content.indexOf(marker);

    if (cutIndex === -1) {
        // Try alternate marker if the capitalized one isn't found
        const altMarker = '// ============================================================================\n// ACCOUNTING MODULE';
        const altIndex = content.indexOf(altMarker);
        if (altIndex !== -1) {
            console.log(`Truncating file at index ${altIndex} (alt marker)`);
            content = content.substring(0, altIndex);
        } else {
            // Fallback: search for "model Account"
            const modelIndex = content.indexOf('model Account');
            if (modelIndex !== -1) {
                // Backup a bit to catch comments
                const commentSearch = content.lastIndexOf('//', modelIndex);
                if (commentSearch !== -1 && (modelIndex - commentSearch) < 200) {
                    content = content.substring(0, commentSearch);
                } else {
                    content = content.substring(0, modelIndex);
                }
                console.log(`Truncating file at index ${content.length} (model marker)`);
            } else {
                throw new Error('Could not find MODULE: ACCOUNTING marker or model Account');
            }
        }
    } else {
        console.log(`Truncating file at index ${cutIndex}`);
        content = content.substring(0, cutIndex);
    }

    // Append Accounting and Banking Modules
    const newModules = `// MODULE: ACCOUNTING
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

    fs.writeFileSync(path, content + newModules, 'utf8');
    console.log('Schema fixed successfully (v4).');

} catch (e) {
    console.error('Error fixing schema:', e);
    process.exit(1);
}
