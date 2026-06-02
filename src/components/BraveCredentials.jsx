/* Elementos de credibilidade BRAVE — usados em OrcamentoPage e OrcamentoRapidoPage */

import { Trophy, Building2, MapPin, Users, CheckCircle2, ExternalLink } from 'lucide-react';

const CNPJ       = '33.167.844/0001-80';
const RAZAO      = 'Brave Fitness Equipamentos LTDA';
const INSTAGRAM  = '@bravefitnessbr';
const INSTA_URL  = 'https://instagram.com/bravefitnessbr';
const CIDADE     = 'Agudos – SP';
const DESDE      = '2020';
const NEGOCIOS   = '3.000+';

/* ── Barra de confiança (topo) ──────────────────────────── */
export function TrustBar({ dark = false }) {
  const wrap  = dark
    ? 'bg-white/5 border-y border-white/10 backdrop-blur-sm'
    : 'bg-emerald-50 border-y border-emerald-100';
  const text  = dark ? 'text-zinc-300' : 'text-gray-600';
  const link  = dark ? 'text-neon hover:text-emerald-300' : 'text-emerald-700 hover:text-emerald-800';
  const dot   = dark ? 'text-white/20' : 'text-gray-300';

  const items = [
    {
      icon: <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />,
      content: <span>Patrocinador Oficial <strong>TCB</strong> &amp; <strong>Copa SUR</strong></span>,
    },
    {
      icon: <Users className="w-3.5 h-3.5 text-emerald-500 shrink-0" />,
      content: <span>{NEGOCIOS} negócios fitness equipados</span>,
    },
    {
      icon: <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />,
      content: <span>CNPJ {CNPJ}</span>,
    },
    {
      icon: <span className="text-pink-500 text-xs font-black shrink-0">IG</span>,
      content: (
        <a href={INSTA_URL} target="_blank" rel="noopener noreferrer"
          className={`${link} font-semibold flex items-center gap-1`}>
          {INSTAGRAM} <ExternalLink className="w-3 h-3 opacity-60" />
        </a>
      ),
      isLink: true,
    },
  ];

  return (
    <div className={`${wrap} py-2.5 px-4`}>
      <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className={`hidden sm:inline ${dot} select-none`}>·</span>}
            {item.icon}
            <span className={`text-[11px] font-medium ${item.isLink ? '' : text}`}>
              {item.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Rodapé institucional ────────────────────────────────── */
export function InstitutionalFooter({ dark = false }) {
  const bg = dark ? 'bg-dark-900/80 border-t border-white/10' : 'bg-gray-900 border-t border-gray-200';

  return (
    <footer className={`relative z-10 ${bg}`}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col items-center gap-3 text-center">

        {/* Razão social + CNPJ */}
        <div>
          <p className="text-white font-bold text-sm">{RAZAO}</p>
          <p className="text-zinc-500 text-[11px] mt-0.5">CNPJ {CNPJ}</p>
        </div>

        {/* Cidade */}
        <p className="text-zinc-400 text-[11px] flex items-center gap-1.5">
          <MapPin className="w-3 h-3 text-zinc-600 shrink-0" />
          {CIDADE}
        </p>

        {/* Instagram */}
        <a href={INSTA_URL} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-pink-400 hover:text-pink-300 transition-colors">
          <span className="text-[11px] font-black">IG</span>
          <span className="text-xs font-semibold">{INSTAGRAM}</span>
          <ExternalLink className="w-3 h-3 opacity-60" />
        </a>

        {/* Empresa verificada */}
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span className="text-[10px] text-emerald-400 font-semibold">Empresa verificada · Desde {DESDE}</span>
        </div>

        {/* Negócios equipados */}
        <p className="text-zinc-400 text-[11px] flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          {NEGOCIOS} negócios fitness equipados
          <span role="img" aria-label="Brasil">🇧🇷</span>
        </p>

      </div>
    </footer>
  );
}
