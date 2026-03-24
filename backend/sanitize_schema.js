const fs = require('fs');
const source = 'd:\\SmartTransfer\\backend\\node_modules\\.prisma\\client\\schema.prisma';
const target = 'd:\\SmartTransfer\\backend\\prisma\\schema.prisma';

try {
    let content = fs.readFileSync(source, 'utf8');

    // Normalize newlines
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Ensure newline at end
    if (!content.endsWith('\n')) {
        content += '\n';
    }

    // Check for Account model
    const hasAccount = content.includes('model Account');

    let append = '';

    if (!hasAccount) {
        append += `
// ============================================================================
// MODULE: ACCOUNTING
// ============================================================================

model Account {
  id          String    @id @default(uuid())
  tenantId    String
  tenant      Tenant    @relation(fields: [tenantId], references: [id])
  
  code        String
  name        String
  name2       String?
  type        AccountType
  
  taxNumber   String?
  taxOffice   String?
  address     String?
  phone       String?
  email       String?
  
  currency    String    @default("TRY")
  
  // Financial Snapshot
  balance     Decimal   @default(0) @db.Decimal(15, 2)
  debit       Decimal   @default(0) @db.Decimal(15, 2)
  credit      Decimal   @default(0) @db.Decimal(15, 2)
  
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

    if (!content.includes('model Bank ')) {
        append += `
// ============================================================================
// BANKING MODULE
// ============================================================================

model Bank {
  id        String   @id @default(uuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  name      String
  code      String?
  logo      String?
  website   String?
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
  
  accountName   String
  accountNumber String
  iban          String
  branchName    String?
  branchCode    String?
  currency      String   @default("TRY")
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
`;
    }

    // Normalize append
    append = append.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    fs.writeFileSync(target, content + append, 'utf8');
    console.log('Schema sanitized and restored.');

} catch (e) {
    console.error(e);
}
