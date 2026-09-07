import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface ComponenteRegistradoPdf {
  id: string;
  titulo: string;
  ref: React.RefObject<HTMLDivElement | null>;
}

interface RegistroPdfContextValue {
  registrar: (id: string, titulo: string, ref: React.RefObject<HTMLDivElement | null>) => void;
  desregistrar: (id: string) => void;
}

const RegistroPdfContext = createContext<RegistroPdfContextValue | null>(null);

/**
 * Envuelve una página (ej. Análisis por Unidad) para que sus tarjetas
 * descargables se registren solas — así el modal "Generar PDF" siempre
 * refleja los componentes que EXISTEN de verdad en la página, sin mantener
 * una lista aparte que se pueda desactualizar cuando se agregue/quite una
 * tarjeta más adelante.
 */
export function ProveedorRegistroPdf({ children }: { children: React.ReactNode }) {
  const [componentes, setComponentes] = useState<ComponenteRegistradoPdf[]>([]);
  const orden = useRef<string[]>([]);

  const registrar = useCallback((id: string, titulo: string, ref: React.RefObject<HTMLDivElement | null>) => {
    setComponentes((actual) => {
      if (actual.some((c) => c.id === id)) return actual.map((c) => (c.id === id ? { id, titulo, ref } : c));
      if (!orden.current.includes(id)) orden.current.push(id);
      const siguiente = [...actual, { id, titulo, ref }];
      siguiente.sort((a, b) => orden.current.indexOf(a.id) - orden.current.indexOf(b.id));
      return siguiente;
    });
  }, []);

  const desregistrar = useCallback((id: string) => {
    setComponentes((actual) => actual.filter((c) => c.id !== id));
  }, []);

  return (
    <RegistroPdfContext.Provider value={{ registrar, desregistrar }}>
      <RegistroPdfExpuesto componentes={componentes}>{children}</RegistroPdfExpuesto>
    </RegistroPdfContext.Provider>
  );
}

// Segundo contexto (solo lectura) para que el modal pueda leer la lista sin
// que cada Card (que solo necesita escribir) tenga que re-renderizarse cada
// vez que la lista cambia.
const ListaPdfContext = createContext<ComponenteRegistradoPdf[]>([]);
function RegistroPdfExpuesto({ componentes, children }: { componentes: ComponenteRegistradoPdf[]; children: React.ReactNode }) {
  return <ListaPdfContext.Provider value={componentes}>{children}</ListaPdfContext.Provider>;
}

export function useListaComponentesPdf(): ComponenteRegistradoPdf[] {
  return useContext(ListaPdfContext);
}

/**
 * Lo usa Card.tsx: si hay un ProveedorRegistroPdf por encima en el árbol, se
 * registra solo con su título y ref mientras esté montado, y se
 * desregistra al desmontarse — si no hay proveedor (la mayoría de páginas),
 * no hace nada.
 */
export function useRegistrarEnPdf(id: string | undefined, titulo: string | undefined, ref: React.RefObject<HTMLDivElement | null>) {
  const contexto = useContext(RegistroPdfContext);
  useEffect(() => {
    if (!contexto || !id || !titulo) return undefined;
    contexto.registrar(id, titulo, ref);
    return () => contexto.desregistrar(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contexto, id, titulo]);
}
