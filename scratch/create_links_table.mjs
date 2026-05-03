import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jisbvqrnnujqgbsfondy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2J2cXJubnVqcWdic2ZvbmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTEwNzUsImV4cCI6MjA5MzE2NzA3NX0.DvEz4j0DVpVJHu_Ag9Fgtksbb2BzSARSSJWKhx-eduI'
);

// Test: try to insert and see if table exists
const { data, error } = await supabase.from('links_rapidos').insert({
  codigo: 'test123',
  produtos_texto: 'Remo, Ski, Bike Erg',
  nome_lead: 'Teste',
}).select();

if (error) {
  console.log('Table does not exist yet. Error:', error.message);
  console.log('\nPlease create it manually in Supabase Dashboard > SQL Editor with:');
  console.log(`
CREATE TABLE IF NOT EXISTS public.links_rapidos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo text UNIQUE NOT NULL,
  produtos_texto text NOT NULL,
  nome_lead text DEFAULT '',
  criado_em timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.links_rapidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can insert links_rapidos"
ON public.links_rapidos FOR INSERT WITH CHECK (true);

CREATE POLICY "Public can select links_rapidos"
ON public.links_rapidos FOR SELECT USING (true);
  `);
} else {
  console.log('Table exists! Test insert:', data);
  // Clean up test
  await supabase.from('links_rapidos').delete().eq('codigo', 'test123');
  console.log('Test row cleaned up.');
}
