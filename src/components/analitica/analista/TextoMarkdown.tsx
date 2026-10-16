import type { ReactNode } from 'react';

// Render liviano de las respuestas del chat (títulos ##, listas - / 1., y
// **negrita**) — sin librerías nuevas y sin interpretar HTML (seguro).

function enLinea(texto: string): ReactNode[] {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return partes.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i} className="font-semibold text-[#10233f]">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
}

export function TextoMarkdown({ texto }: { texto: string }) {
  const lineas = texto.split('\n');
  const bloques: ReactNode[] = [];
  let lista: { ordenada: boolean; items: string[] } | null = null;
  const cerrarLista = () => {
    if (!lista) return;
    const L = lista;
    bloques.push(L.ordenada
      ? <ol key={bloques.length} className="ml-5 list-decimal space-y-1">{L.items.map((t, i) => <li key={i}>{enLinea(t)}</li>)}</ol>
      : <ul key={bloques.length} className="ml-5 list-disc space-y-1 marker:text-[#159089]">{L.items.map((t, i) => <li key={i}>{enLinea(t)}</li>)}</ul>);
    lista = null;
  };
  for (const cruda of lineas) {
    const l = cruda.trimEnd();
    const vi = l.match(/^\s*[-*•]\s+(.*)$/);
    const nu = l.match(/^\s*\d+[.)]\s+(.*)$/);
    if (vi || nu) {
      const ordenada = !!nu;
      if (!lista || lista.ordenada !== ordenada) { cerrarLista(); lista = { ordenada, items: [] }; }
      lista.items.push((vi ?? nu)![1]);
      continue;
    }
    cerrarLista();
    if (!l.trim()) continue;
    const h = l.match(/^#{1,4}\s+(.*)$/);
    if (h) {
      bloques.push(<p key={bloques.length} className="mt-2 text-[12.5px] font-extrabold uppercase tracking-wide text-[#0f5f57] first:mt-0">{h[1].replace(/\*\*/g, '')}</p>);
      continue;
    }
    bloques.push(<p key={bloques.length}>{enLinea(l)}</p>);
  }
  cerrarLista();
  return <div className="space-y-1.5">{bloques}</div>;
}
