import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jisbvqrnnujqgbsfondy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2J2cXJubnVqcWdic2ZvbmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTEwNzUsImV4cCI6MjA5MzE2NzA3NX0.DvEz4j0DVpVJHu_Ag9Fgtksbb2BzSARSSJWKhx-eduI';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBling() {
  const { data } = await supabase.from('bling_config').select('access_token').eq('id', 1).single();
  const token = data.access_token;
  
  const res = await fetch('https://api.bling.com.br/v3/propostas-comerciais?limite=10&pagina=1', {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': '1.0' }
  });
  console.log(await res.text());
}

checkBling();
