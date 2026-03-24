const fs = require('fs');
const source = 'd:\\SmartTransfer\\backend\\node_modules\\.prisma\\client\\schema.prisma';
const target = 'd:\\SmartTransfer\\backend\\prisma\\schema.prisma';

try {
    // 1. Read source content (UTF-8)
    let content = fs.readFileSync(source, 'utf8');
    console.log('Read source content successfully.');

    // 2. Check for Account model
    const hasAccount = content.includes('model Account');
    console.log(`Source has Account model: ${hasAccount}`);

    // 3. Define modules to append
    let appendContent = '';

    if (!hasAccount) {
        appendContent += `
// ============================================================================
// MODULE: ACCOUNTING
// ============================================================================

model Account {
  id          String    @id @default(uuid())
  tenantId    String
  tenant      Tenant    @relation(fields: [tenantId], references: [id])
  
  code        String    // Unique code per tenant (e.g. "C-001")
  name        String
  name2       String?   // Added to ensure unique signature if needed
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
`;
    }

    // Always append Banking (unless it exists too? unlikely based on history)
    if (!content.includes('model Bank ')) {
        appendContent += `
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
    } else {
        console.log('Source already has Bank model? Skipping append.');
    }

    // 4. Write full content
    fs.writeFileSync(target, content + appendContent, 'utf8');
    console.log('Schema restored with UTF-8 encoding.');

} catch (e) {
    console.error('Error during restoration:', e);
    process.exit(1);
}
