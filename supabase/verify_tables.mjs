const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2J2cXJubnVqcWdic2ZvbmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTEwNzUsImV4cCI6MjA5MzE2NzA3NX0.DvEz4j0DVpVJHu_Ag9Fgtksbb2BzSARSSJWKhx-eduI';
const URL = 'https://jisbvqrnnujqgbsfondy.supabase.co';
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function check() {
  const res = await fetch(`${URL}/rest/v1/regras_frete?select=estado,zona,multiplicador,valor_minimo&order=estado,zona`, { headers });
  const data = await res.json();
  console.log('Regras existentes:', data.length);
  data.forEach(r => console.log(`  ${r.estado} / ${r.zona} → x${r.multiplicador} (min: ${r.valor_minimo})`));
}
check();
