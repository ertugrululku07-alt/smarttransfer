const fs = require('fs');
const path = 'd:\\SmartTransfer\\backend\\prisma\\schema.prisma';

try {
    let content = fs.readFileSync(path, 'utf8');

    // Find the end of AccountType enum
    // We look for "enum AccountType {"
    const enumStart = content.indexOf('enum AccountType {');

    if (enumStart === -1) {
        throw new Error('Could not find enum AccountType start');
    }

    // Find the closing brace of the enum
    // We search from enumStart
    let braceCount = 0;
    let cutoffIndex = -1;

    for (let i = enumStart; i < content.length; i++) {
        if (content[i] === '{') braceCount++;
        if (content[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                cutoffIndex = i + 1; // Include the closing brace
                break;
            }
        }
    }

    if (cutoffIndex === -1) {
        throw new Error('Could not find enum AccountType end');
    }

    console.log(`Truncating file at index ${cutoffIndex}`);

    // Truncate content
    content = content.substring(0, cutoffIndex);

    // Append Banking Module
    const bankingModule = `

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

    fs.writeFileSync(path, content + bankingModule, 'utf8');
    console.log('Schema fixed successfully (v2).');

} catch (e) {
    console.error('Error fixing schema:', e);
    process.exit(1);
}
