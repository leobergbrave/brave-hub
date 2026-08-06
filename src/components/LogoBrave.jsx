/* ═══════════════════════════════════════════════
   LOGO OFICIAL BRAVE — fonte única da marca.

   Toda tela deve usar este componente em vez de apontar para um arquivo
   direto. Assim a marca só existe num lugar: trocar a logo no futuro é
   trocar os PNGs em /public, sem caçar referência em 15 arquivos (foi
   exatamente essa dispersão que gerou 4 logos diferentes no sistema).

   Os arquivos vêm do vetor oficial (boxbybrave.pdf / lion big lines.pdf),
   com fundo transparente — funcionam sobre qualquer cor.

     tema="claro"  → arte BRANCA  · use sobre fundo ESCURO
     tema="escuro" → arte ESCURA  · use sobre fundo CLARO
   ═══════════════════════════════════════════════ */

const LOCKUP = {
  claro: '/brave-claro.png',
  escuro: '/brave-escuro.png',
};

const LEAO = {
  claro: '/brave-leao-claro.png',
  escuro: '/brave-leao-escuro.png',
};

/** Logo completa (BRAVE + leão). `className` controla a altura: "h-10", "h-8"… */
export default function LogoBrave({ tema = 'claro', className = 'h-10', alt = 'BRAVE' }) {
  return (
    <img
      src={LOCKUP[tema] || LOCKUP.claro}
      alt={alt}
      className={`${className} w-auto object-contain select-none`}
      draggable={false}
    />
  );
}

/** Só o leão — para favicon, avatar, selo e espaços quadrados. */
export function LeaoBrave({ tema = 'claro', className = 'h-10', alt = 'BRAVE' }) {
  return (
    <img
      src={LEAO[tema] || LEAO.claro}
      alt={alt}
      className={`${className} w-auto object-contain select-none`}
      draggable={false}
    />
  );
}

/* URLs absolutas para uso fora do React (e-mails, HTML gerado no servidor,
   imagem de compartilhamento) — nesses contextos caminho relativo não resolve. */
export const LOGO_URLS = {
  claro: 'https://brave-hub-two.vercel.app/brave-claro.png',
  escuro: 'https://brave-hub-two.vercel.app/brave-escuro.png',
  leaoClaro: 'https://brave-hub-two.vercel.app/brave-leao-claro.png',
  leaoEscuro: 'https://brave-hub-two.vercel.app/brave-leao-escuro.png',
  compartilhamento: 'https://brave-hub-two.vercel.app/og-brave.png',
};
