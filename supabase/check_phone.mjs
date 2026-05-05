import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jisbvqrnnujqgbsfondy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2J2cXJubnVqcWdic2ZvbmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTEwNzUsImV4cCI6MjA5MzE2NzA3NX0.DvEz4j0DVpVJHu_Ag9Fgtksbb2BzSARSSJWKhx-eduI';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPhoneFormat() {
  const { data: orcs } = await supabase.from('orcamentos_salvos').select('*').limit(5).order('id', { ascending: false });
  for (const o of orcs) {
    console.log(`Cliente: ${o.cliente}, Telefone: ${o.payload.telefoneCliente}`);
  }
}

checkPhoneFormat();
