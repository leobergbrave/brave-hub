/* Elementos de credibilidade BRAVE — usados em OrcamentoPage e OrcamentoRapidoPage */

import { Trophy, Building2, MapPin, Users, CheckCircle2, ExternalLink } from 'lucide-react';

const CNPJ       = '33.167.844/0001-80';
const RAZAO      = 'Brave Fitness Equipamentos LTDA';
const INSTAGRAM  = '@bravefitnessbr';
const INSTA_URL  = 'https://instagram.com/bravefitnessbr';
const CIDADE     = 'Agudos – SP';
const DESDE      = '2020';
const NEGOCIOS   = '3.000+';
const COMP1      = 'TCB – The CrossFit Games Brasil';
const COMP2      = 'Copa SUR de CrossFit';

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
      content: <span>Patrocinador Oficial <strong>TCB</strong> & <strong>Copa SUR</strong></span>,
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
  const bg      = dark ? 'bg-dark-900/80 border-t border-white/10' : 'bg-gray-900 border-t border-gray-200';
  const bottom  = dark ? 'border-white/10' : 'border-gray-700';

  return (
    <footer className={`relative z-10 ${bg}`}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">

          {/* Coluna 1 — Identidade */}
          <div>
            <img src="/logo.png" alt="Brave" className="h-8 object-contain mb-3 brightness-0 invert opacity-80"
              onError={e => { e.target.style.display = 'none'; }} />
            <p className="text-zinc-400 text-xs leading-relaxed mb-3">
              Equipamentos de alta performance para boxes CrossFit, academias e atletas de elite em todo o Brasil.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <MapPin className="w-3 h-3 text-zinc-600 shrink-0" />
              {CIDADE} · Desde {DESDE}
            </div>
          </div>

          {/* Coluna 2 — Patrocínios */}
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">
              Patrocinadores oficiais
            </p>
            <div className="space-y-2.5">
              <div className="flex items-start gap-2">
                <Trophy className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-white">{COMP1}</p>
                  <p className="text-[10px] text-zinc-500">Maior circuito CrossFit do Brasil</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Trophy className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-white">{COMP2}</p>
                  <p className="text-[10px] text-zinc-500">Competição de referência sul-americana</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <p className="text-[11px] text-zinc-300 font-medium">{NEGOCIOS} negócios equipados no Brasil</p>
              </div>
            </div>
          </div>

          {/* Coluna 3 — Dados legais */}
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">
              Dados da empresa
            </p>
            <div className="space-y-2 text-xs text-zinc-400">
              <div className="flex items-start gap-2">
                <Building2 className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-white font-semibold text-[11px]">{RAZAO}</p>
                  <p className="text-zinc-500 text-[10px]">CNPJ {CNPJ}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                <span>{CIDADE}</span>
              </div>
              <a href={INSTA_URL} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-pink-400 hover:text-pink-300 transition-colors">
                <span className="text-[11px] font-black">IG</span>
                <span className="text-xs font-semibold">{INSTAGRAM}</span>
                <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
              <div className="flex items-center gap-2 pt-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="text-[10px] text-emerald-400 font-semibold">Empresa verificada · Desde {DESDE}</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom bar */}
      <div className={`border-t ${bottom} py-4`}>
        <p className="text-center text-[10px] text-zinc-600">
          © {new Date().getFullYear()} {RAZAO} · CNPJ {CNPJ} · Todos os direitos reservados
        </p>
      </div>
    </footer>
  );
}
