# SmartTransfer — Kurulum Rehberi

## 🚀 Hızlı Kurulum (3 Adım)

### 1. Config dosyasını düzenle:
```bash
nano setup.config.json
```
```json
{
  "company": {
    "name": "Şirket Adınız",
    "tenantSlug": "sirket-slug"
  },
  "domain": {
    "frontend": "sizin-domain.com",
    "backend": "api.sizin-domain.com"
  },
  "database": {
    "url": "postgresql://user:pass@host:5432/dbname?sslmode=require"
  }
}
```

### 2. Setup'ı çalıştır:
```bash
node setup.js
```
Bu komut otomatik olarak:
- ✅ Tüm .env dosyalarını oluşturur
- ✅ Mobil app config'lerini günceller
- ✅ npm bağımlılıklarını yükler
- ✅ Veritabanı şemasını senkronize eder
- ✅ Frontend'i build eder
- ✅ PM2 ecosystem dosyasını oluşturur
- ✅ Nginx config dosyasını oluşturur

### 3. Sunucuyu başlat:
```bash
# Nginx'i kur
sudo cp nginx.conf /etc/nginx/sites-available/smarttransfer
sudo ln -s /etc/nginx/sites-available/smarttransfer /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL kur
sudo certbot --nginx -d sizin-domain.com -d api.sizin-domain.com

# PM2 ile başlat
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

**Hepsi bu kadar!** 🎉

---

## 📋 Sunucu Gereksinimleri

| Gereksinim | Minimum Versiyon |
|-----------|-----------------|
| Node.js | 18+ |
| npm | 9+ |
| PostgreSQL | 14+ (veya Neon.tech) |
| Nginx | 1.18+ |
| PM2 | 5+ |

```bash
# Node.js 18 kur
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 + Nginx kur
sudo npm install -g pm2
sudo apt install -y nginx certbot python3-certbot-nginx
```

---

## 🏗️ Mimari

```
Internet → Nginx (443/SSL) → PM2
                              ├── Backend  (port 4000)
                              └── Frontend (port 3000)
```

---

## 📁 Proje Yapısı

```
SmartTransfer/
├── setup.config.json      ← TEK CONFIG DOSYASI
├── setup.js               ← OTOMATİK KURULUM
├── ecosystem.config.js    ← PM2 (otomatik oluşturulur)
├── nginx.conf             ← Nginx (otomatik oluşturulur)
├── backend/
│   ├── .env               ← (otomatik oluşturulur)
│   ├── index.js
│   └── prisma/
├── frontend/
│   ├── .env.production    ← (otomatik oluşturulur)
│   ├── .env.local         ← (otomatik oluşturulur)
│   └── src/
├── driver-app/
│   ├── config.ts          ← (otomatik oluşturulur)
│   └── ...
└── partner-app/
    ├── config.ts          ← (otomatik oluşturulur)
    └── ...
```

---

## ⚙️ setup.config.json Tam Referans

```json
{
  "company": {
    "name": "Şirket Adı",
    "tenantSlug": "sirket-slug"
  },
  "domain": {
    "frontend": "smarttransfer.com",
    "backend": "api.smarttransfer.com"
  },
  "database": {
    "url": "postgresql://user:pass@host:5432/dbname"
  },
  "security": {
    "jwtSecret": "",
    "jwtExpiration": "7d",
    "refreshTokenExpiration": "7d"
  },
  "server": {
    "backendPort": 4000,
    "frontendPort": 3000,
    "nodeEnv": "production"
  },
  "apiKeys": {
    "aviationstackApiKey": "",
    "hereApiKey": ""
  },
  "integrations": {
    "n8nWebhookUrl": ""
  },
  "ssl": {
    "enabled": true,
    "email": "admin@domain.com"
  }
}
```

> **Not:** `jwtSecret` boş bırakılırsa setup.js otomatik güvenli bir secret üretir.

---

## 🔄 Güncelleme

```bash
# Dosyaları güncelle (git pull veya SCP)
git pull

# Setup'ı tekrar çalıştır
node setup.js

# PM2 restart
pm2 restart all
```

---

## 📱 Mobil APK Build

Setup sonrası `driver-app/config.ts` ve `partner-app/config.ts` otomatik güncellenir.

```bash
# Driver App APK
cd driver-app
npx expo run:android --variant release
# APK: android/app/build/outputs/apk/release/

# Partner App APK
cd partner-app
npx expo run:android --variant release
```
