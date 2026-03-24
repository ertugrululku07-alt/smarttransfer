const fs = require('fs');
const source = 'd:\\SmartTransfer\\backend\\node_modules\\.prisma\\client\\schema.prisma';
const target = 'd:\\SmartTransfer\\backend\\prisma\\schema.prisma';

try {
    let content = fs.readFileSync(source, 'utf8');

    // Normalize newlines
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Check if Tenant needs update
    if (!content.includes('accounts Account[]')) {
        console.log('Injecting accounts relation into Tenant...');
        const tenantStart = content.indexOf('model Tenant {');
        if (tenantStart !== -1) {
            // Find closing brace of Tenant
            let braceCount = 1;
            let i = tenantStart + 'model Tenant {'.length;
            while (braceCount > 0 && i < content.length) {
                if (content[i] === '{') braceCount++;
                if (content[i] === '}') braceCount--;
                i++;
            }
            if (braceCount === 0) {
                const insertPos = i - 1; // Before closing brace
                const injection = `
  // Injected Relations
  accounts        Account[]
  banks           Bank[]
`;
                content = content.slice(0, insertPos) + injection + content.slice(insertPos);
            }
        }
    }

    // Append modules if missing
    if (!content.includes('model Account ')) {
        console.log('Appending Account model...');
        content += `
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
        console.log('Appending Bank model...');
        content += `
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

    fs.writeFileSync(target, content, 'utf8');
    console.log('Schema injected and restored.');

} catch (e) {
    console.error(e);
}
