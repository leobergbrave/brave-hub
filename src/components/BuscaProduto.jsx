import { useState, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { formatCurrency } from '../data';

/* Busca de produto por digitação.
   Substitui o <select> nativo, que no celular abre a lista inteira do catálogo
   numa roleta impossível de percorrer — e ainda corta o nome do produto.
   Aqui o nome aparece completo, em quantas linhas precisar: no orçamento a
   diferença entre dois produtos costuma estar no fim do nome (a medida, o peso,
   a cor), então truncar esconde exatamente o que distingue um do outro. */
export default function BuscaProduto({ produtos, onEscolher, placeholder = 'Buscar produto por nome...' }) {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const toqueY = useRef(null);

  const termo = busca.trim().toLowerCase();
  const filtrados = produtos
    .filter((p) => !termo
      || p.nome.toLowerCase().includes(termo)
      || (p.codigo_sku && p.codigo_sku.toLowerCase().includes(termo)))
    .slice(0, 50);

  const escolher = (p) => {
    onEscolher(p);
    setBusca('');
    setAberto(false);
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setAberto(true); }}
          onFocus={() => setAberto(true)}
          placeholder={placeholder}
          className="w-full bg-dark-900 border border-dark-600 focus:border-neon/50 text-white text-sm rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-1 focus:ring-neon/20 transition-all placeholder:text-dark-500"
        />
        {busca ? (
          <button type="button" onClick={() => { setBusca(''); setAberto(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        ) : (
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500 pointer-events-none" />
        )}
      </div>

      {aberto && (
        <div className="absolute z-50 w-full mt-2 bg-dark-800 border border-dark-600 rounded-xl shadow-xl max-h-80 overflow-y-auto">
          {filtrados.map((p) => (
            <div
              key={p.id}
              /* Toque só conta como escolha se o dedo não arrastou: sem isso,
                 rolar a lista no celular seleciona o item sob o dedo. */
              onPointerDown={(e) => {
                if (e.pointerType !== 'touch') { e.preventDefault(); escolher(p); }
              }}
              onTouchStart={(e) => { toqueY.current = e.touches[0].clientY; }}
              onTouchEnd={(e) => {
                const dy = Math.abs(e.changedTouches[0].clientY - (toqueY.current ?? e.changedTouches[0].clientY));
                if (dy < 8) { e.preventDefault(); escolher(p); }
              }}
              className="px-4 py-3 active:bg-dark-600 hover:bg-dark-700 cursor-pointer border-b border-dark-700/50 last:border-0 select-none"
            >
              <div className="text-sm text-white leading-snug break-words">{p.nome}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-neon font-medium">{formatCurrency(p.preco)}</span>
                {p.codigo_sku && <span className="text-[10px] text-dark-500 font-mono">{p.codigo_sku}</span>}
              </div>
            </div>
          ))}
          {filtrados.length === 0 && (
            <div className="px-4 py-3 text-sm text-dark-500 text-center">Nenhum produto encontrado.</div>
          )}
        </div>
      )}
    </div>
  );
}
