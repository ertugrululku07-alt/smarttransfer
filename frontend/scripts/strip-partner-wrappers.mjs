import fs from 'fs';
import path from 'path';

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name === 'page.tsx') {
      let c = fs.readFileSync(p, 'utf8');
      const orig = c;
      c = c.replace(/import PartnerLayout from [^\n]+\n/g, '');
      c = c.replace(/import PartnerGuard from [^\n]+\n/g, '');
      c = c.replace(/<PartnerGuard>\s*/g, '');
      c = c.replace(/\s*<\/PartnerGuard>/g, '');
      c = c.replace(/<PartnerLayout>\s*/g, '');
      c = c.replace(/\s*<\/PartnerLayout>/g, '');
      c = c.replace(/<PartnerGuard><PartnerLayout>/g, '');
      c = c.replace(/<\/PartnerLayout><\/PartnerGuard>/g, '');
      if (c !== orig) {
        fs.writeFileSync(p, c);
        console.log('updated', p);
      }
    }
  }
}

import { fileURLToPath } from 'url';
const partnerDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/app/partner');
walk(partnerDir);
