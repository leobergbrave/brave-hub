const SUPABASE_URL = 'https://jisbvqrnnujqgbsfondy.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc2J2cXJubnVqcWdic2ZvbmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTEwNzUsImV4cCI6MjA5MzE2NzA3NX0.DvEz4j0DVpVJHu_Ag9Fgtksbb2BzSARSSJWKhx-eduI';

async function testIA() {
  console.log('🧠 Testando Edge Function extract-equipment-list...\n');

  const texto = 'Fala irmão, me vê duas bikes da concept e 5 med balls de 9kg';

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/extract-equipment-list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ texto }),
    });

    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Resposta:', JSON.stringify(data, null, 2));

    if (data.termos_ia) {
      console.log('\n📋 Termos extraídos pela IA:');
      data.termos_ia.forEach(t => console.log(`   → "${t.termo}" x${t.quantidade}`));
    }
    if (data.produtos && data.produtos.length > 0) {
      console.log('\n✅ Produtos encontrados no banco:');
      data.produtos.forEach(p => console.log(`   → ${p.nome} x${p.quantidade} (R$ ${p.preco})`));
    } else {
      console.log('\n⚠️  Nenhum produto encontrado (tabela produtos pode estar vazia)');
    }
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

testIA();
