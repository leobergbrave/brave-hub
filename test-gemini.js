const key = 'AIzaSyB-WoVsdUoo5qv-5w8xieXYDVOfxIiEnhE';
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
const prompt = `Você é o assistente de extração de orçamentos da BRAVE. Ignore saudações. Extraia apenas os equipamentos e quantidades. Retorne EXCLUSIVAMENTE um array JSON puro neste formato: [{ "termo": "nome limpo do produto", "quantidade": 1 }]

Mensagem do cliente:
SKIERG
BIKERG`;
fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1 },
  })
}).then(async r => {
  console.log('Gemini Status:', r.status);
  console.log('Gemini Body:', await r.text());
}).catch(console.error);
