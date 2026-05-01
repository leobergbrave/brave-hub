const KEY = 'AIzaSyBMI3wLmPMoIGaDcLO-bFfZGG5y-yUtJQA';
const PROMPT = 'Você é o assistente de extração de orçamentos da BRAVE. Ignore saudações. Extraia apenas os equipamentos e quantidades. Retorne EXCLUSIVAMENTE um array JSON puro neste formato: [{ "termo": "nome limpo do produto", "quantidade": 1 }]';
const TEXTO = 'Fala irmão, me vê duas bikes da concept e 5 med balls de 9kg';

async function test() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: PROMPT + '\n\nMensagem:\n' + TEXTO }] }],
      generationConfig: { temperature: 0.1 },
    }),
  });
  const data = await res.json();
  console.log('Status:', res.status);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log('Resposta:', text);
}
test();
