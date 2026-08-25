# Robô de propostas do Bling — servidor (Railway)

Captura os PDFs oficiais das propostas sem depender do computador do consultor.
Faz o mesmo que o userscript do navegador, num Chrome que roda no servidor.

## Antes de começar: o que já sabemos

Tentamos primeiro reaproveitar a sessão do navegador do Léo (copiando cookies).
**Não funciona**: o Bling responde `UNAUTHENTICATED` para qualquer requisição
vinda de fora do navegador de origem, mesmo com todos os cookies e headers de um
Chrome real. Não há token no `localStorage` para copiar.

Por isso este serviço faz o próprio login. Isso traz um risco que precisa ser
acompanhado: **um login diário vindo de um servidor pode ser lido pelo Bling
como acesso suspeito.** O serviço foi escrito para reduzir esse risco, mas ele
não desaparece.

## Salvaguardas embutidas

- **Sessão reaproveitada entre ciclos.** Loga uma vez e reusa; logar a cada
  ronda seria padrão de acesso anormal.
- **Para na hora se o Bling pedir verificação.** 2FA ou CAPTCHA no login →
  o robô para e avisa no log, em vez de insistir. Insistir é o caminho mais
  rápido para a conta ser bloqueada.
- **Para após 3 falhas de login seguidas** (evita parecer ataque de força bruta).
- **Ritmo humano**: uma proposta por vez, com pausas entre elas.
- **Senha só em variável de ambiente**, nunca gravada em log.

Se o robô parar sozinho, o do navegador continua funcionando — os dois usam o
mesmo endpoint e não atrapalham um ao outro.

## Instalação no Railway

1. **Novo projeto** → *Deploy from GitHub repo* → escolha este repositório.
2. Em **Settings → Root Directory**, aponte para `robo-railway`.
3. O `Dockerfile` já está pronto (imagem oficial do Puppeteer, com Chrome).
4. Em **Variables**, adicione:

   | Variável | Valor |
   |---|---|
   | `HUB_PDF_TOKEN` | o mesmo token usado na Vercel |
   | `BLING_USUARIO` | o e-mail de acesso ao Bling |
   | `BLING_SENHA` | a senha do Bling |
   | `INTERVALO_SEGUNDOS` | `60` (opcional) |

5. Deploy. Acompanhe em **Deployments → View Logs**.

## Como saber se está funcionando

No log você deve ver:

```
robô iniciado — ronda a cada 60s
2 proposta(s) para capturar
fazendo login no Bling...
login OK
capturando FULANO (avista)
  → pronta
capturando FULANO (prazo)
  → pronta e enviada ao cliente
```

Mensagens que exigem ação:

- `PARADO: o Bling pediu verificação extra` → o caminho do servidor não é
  viável nesta conta. Volte ao robô do navegador.
- `PARADO: três falhas de login` → confira usuário e senha nas variáveis.
- `ERRO: não achei os campos de login` → o Bling mudou a tela de login.

## Durante o período de teste

Vale acompanhar por alguns dias:

- O robô continua logado ou precisa relogar toda hora? (relogar muito = risco)
- Chegou algum e-mail do Bling sobre acesso suspeito?
- As propostas estão saindo completas, com fotos?

Se aparecer aviso de acesso suspeito, desligue o serviço e volte ao navegador.
