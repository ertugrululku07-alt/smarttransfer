// backend/prisma.config.ts (veya proje kökünde prisma.config.ts)

import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  // schema dosyamızın yolu
  schema: 'prisma/schema.prisma',

  // migrate dosyalarının duracağı klasör
  migrations: {
    path: 'prisma/migrations',
  },

  // veritabanı URL'i (artık burada)
  datasource: {
    url: "postgresql://postgres:mysecretpassword@127.0.0.1:5439/smarttransfer?schema=public",
  },
});