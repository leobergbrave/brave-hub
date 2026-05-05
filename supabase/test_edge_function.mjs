import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jisbvqrnnujqgbsfondy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2J2cXJubnVqcWdic2ZvbmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTEwNzUsImV4cCI6MjA5MzE2NzA3NX0.DvEz4j0DVpVJHu_Ag9Fgtksbb2BzSARSSJWKhx-eduI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testEdgeFunction() {
  console.log('Invocando Edge Function...');
  const { data, error } = await supabase.functions.invoke('sync-bling-proposal', {
    body: {
      cliente: 'CLIENTE TESTE EDGE FUNCTIO',
      consultor: 'Léo Berg',
      payload: {
        itens: [
          {
            codigo_sku: 'TESTE-EF-01',
            nome: 'Produto via Edge',
            quantidade: 1,
            preco: 100
          }
        ],
        frete: 20
      }
    }
  });

  if (error) {
    console.error('Erro ao invocar:', error);
  } else {
    console.log('Sucesso:', data);
  }
}

testEdgeFunction();
