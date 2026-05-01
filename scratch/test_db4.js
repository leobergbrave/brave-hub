import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://jisbvqrnnujqgbsfondy.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2J2cXJubnVqcWdic2ZvbmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTEwNzUsImV4cCI6MjA5MzE2NzA3NX0.DvEz4j0DVpVJHu_Ag9Fgtksbb2BzSARSSJWKhx-eduI');
supabase.from('orcamentos_salvos').select('payload').order('criado_em', { ascending: false }).limit(1).then(res => {
  console.log(JSON.stringify(res.data[0].payload, null, 2));
});
