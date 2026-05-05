import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jisbvqrnnujqgbsfondy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2J2cXJubnVqcWdic2ZvbmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTEwNzUsImV4cCI6MjA5MzE2NzA3NX0.DvEz4j0DVpVJHu_Ag9Fgtksbb2BzSARSSJWKhx-eduI';
const supabase = createClient(supabaseUrl, supabaseKey);

async function resetMarketing() {
  const { data: orcs } = await supabase.from('orcamentos_salvos').select('*');
  let count = 0;
  for (const o of orcs) {
    if (o.payload && o.payload.marketing_sent && o.payload.marketing_sent.length > 0) {
      const newPayload = { ...o.payload };
      delete newPayload.marketing_sent;
      await supabase.from('orcamentos_salvos').update({ payload: newPayload }).eq('id', o.id);
      count++;
    }
  }
  console.log(`Resetou ${count} orçamentos.`);
}

resetMarketing();
