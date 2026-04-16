const fs = require('fs');
const txt = `
// ============================================================================
// LIVE SUPPORT (N8N CHAT)
// ============================================================================

model ChatSession {
  id         String   @id @default(uuid())
  tenantId   String
  status     ChatStatus @default(BOT)
  
  customerId String?
  customer   User?     @relation("CustomerChats", fields: [customerId], references: [id])
  
  agentId    String?
  agent      User?     @relation("AgentChats", fields: [agentId], references: [id])
  
  messages   ChatMessage[]
  metadata   Json?
  
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  
  @@index([tenantId, status])
}

model ChatMessage {
  id         String   @id @default(uuid())
  sessionId  String
  session    ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  
  sender     ChatSender
  content    String   @db.Text
  
  createdAt  DateTime @default(now())
}

enum ChatStatus {
  BOT
  HUMAN
  CLOSED
}

enum ChatSender {
  USER
  BOT
  ADMIN
}
`;
fs.appendFileSync('prisma/schema.prisma', txt, 'utf8');
console.log('Appended successfully');
