import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const partnerDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/app/partner');

const files = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name === 'page.tsx') files.push(p);
  }
}
walk(partnerDir);

for (const file of files) {
  let c = fs.readFileSync(file, 'utf8');
  const orig = c;

  // return ( \n <style jsx -> return ( <> \n <style
  c = c.replace(
    /return \(\s*\n(\s*)<style jsx global>/g,
    'return (\n$1<>\n$1<style jsx global>'
  );

  // return ( \n {contextHolder} -> fragment
  c = c.replace(
    /return \(\s*\n(\s*)\{contextHolder\}/g,
    'return (\n$1<>\n$1{contextHolder}'
  );

  // return ( \n <div style={{ display: 'flex' (fleet headers without wrapper)
  if (file.includes('fleet')) {
    c = c.replace(
      /return \(\s*\n(\s*)<div style=\{\{ display: 'flex', justifyContent: 'space-between'/g,
      'return (\n$1<div className="partner-page">\n$1<div style={{ display: \'flex\', justifyContent: \'space-between\''
    );
  }

  // Close fragment before final ); of component - only if we added <>
  if (c.includes('return (\n') && c.includes('<>') && !orig.includes('<>')) {
    const idx = c.lastIndexOf('\n    );');
    if (idx !== -1) {
      const before = c.slice(0, idx);
      const after = c.slice(idx);
      if (!before.trimEnd().endsWith('</>')) {
        c = before + '\n    </>' + after;
      }
    }
  }

  // fleet: close partner-page div
  if (file.includes('fleet') && c.includes('className="partner-page"') && !c.includes('</div>\n    </>')) {
    const idx = c.lastIndexOf('\n    );');
    if (idx !== -1) {
      c = c.slice(0, idx) + '\n    </div>' + c.slice(idx);
    }
  }

  if (c !== orig) {
    fs.writeFileSync(file, c);
    console.log('fixed', file);
  }
}
