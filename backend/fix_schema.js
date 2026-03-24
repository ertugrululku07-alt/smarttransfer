const fs = require('fs');
const path = 'd:\\SmartTransfer\\backend\\prisma\\schema.prisma';

try {
    let content = fs.readFileSync(path, 'utf8');

    // Find the start of the corruption or the Banking module
    // We expect the Banking module to start with specific comments
    const marker = '// ============================================================================\r\n// BANKING MODULE';
    const marker2 = '// ============================================================================\n// BANKING MODULE';

    let cutIndex = content.lastIndexOf(marker);
    if (cutIndex === -1) cutIndex = content.lastIndexOf(marker2);

    if (cutIndex !== -1) {
        console.log('Found Banking Module marker, truncating...');
        content = content.substring(0, cutIndex);
    } else {
        console.log('Marker not found, checking for end of Accounting module...');
        // Fallback: finding the end of Account model
        const accountEnd = 'enum AccountType {';
        const accountEndIndex = content.lastIndexOf(accountEnd);
        if (accountEndIndex !== -1) {
            // Find the closing brace of enum AccountType
            const closeBrace = content.indexOf('}', accountEndIndex);
            if (closeBrace !== -1) {
                content = content.substring(0, closeBrace + 1) + '\n';
            }
        }
    }

    // New valid content
    const newContent = `
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

    fs.writeFileSync(path, content + newContent, 'utf8');
    console.log('Schema fixed successfully.');
} catch (e) {
    console.error('Error fixing schema:', e);
}
