// tools/seed-crossfit-lp.mjs
// Cria/atualiza o registro `crossfit-box` em landing_pages_config para que a
// LP /lp/crossfit apareça e seja editável na aba Landing Pages do admin.
// Uso: node tools/seed-crossfit-lp.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LP_CROSSFIT_DEFAULT as C } from '../src/data/lpCrossfitConfig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
  + '\n' + readFileSync(join(__dirname, '..', '.env'), 'utf8');
const pick = (k) => (env.match(new RegExp(`${k}=([^\\r\\n]+)`)) || [])[1]?.trim().replace(/^"|"$/g, '');
const URL = pick('VITE_SUPABASE_URL');
const KEY = pick('VITE_SUPABASE_ANON_KEY');

const row = {
  id: 'crossfit-box',
  titulo: 'LP Box CrossFit',
  url_path: '/lp/crossfit',
  wa_number: C.wa_number,
  ativo: true,
  config: {
    wa_msg_geral: C.wa_msg_geral,
    hero: C.hero,
    categorias: C.categorias,
    produtos: C.produtos,
  },
};

const res = await fetch(`${URL}/rest/v1/landing_pages_config`, {
  method: 'POST',
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=representation',
  },
  body: JSON.stringify(row),
});

const text = await res.text();
console.log('HTTP', res.status);
console.log(text.slice(0, 500));
if (!res.ok) process.exit(1);
console.log('✓ crossfit-box gravado em landing_pages_config');
