import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

// Red de seguridad de ÚLTIMO recurso — sin esto, cualquier error de React
// no capturado (una propiedad undefined, un .map sobre algo que no es un
// arreglo, etc.) deja la página COMPLETAMENTE EN BLANCO, sin ningún
// mensaje visible: hay que abrir las herramientas de desarrollador (F12 →
// Console) para siquiera saber que algo falló, y muchas veces eso no está
// a la mano de quien está usando el dashboard en el día a día. Confirmado
// varias veces en este proyecto: "seleccioné tal filtro y me sacó de la
// página" siempre resultó ser esto — un error real, pero invisible.
//
// Con este componente envolviendo toda la app (ver main.tsx), un error así
// en cambio muestra el mensaje y la pila de llamadas DIRECTO en pantalla,
// seleccionable para copiar y pegar — nunca más una página en blanco sin
// explicación.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info });
    // Sigue quedando también en la consola, para quien sí tenga las
    // herramientas de desarrollador abiertas.
    console.error('[ErrorBoundary] La aplicación tuvo un error no controlado:', error, info);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ padding: 24, fontFamily: 'monospace', maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#b91c1c', marginBottom: 8 }}>
          Ocurrió un error inesperado
        </h1>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 16 }}>
          Copia todo el texto de abajo (selecciónalo con el mouse) y compártelo — con eso se puede
          encontrar y corregir la causa exacta. Mientras tanto, puedes recargar la página para
          seguir usando el dashboard normalmente.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{ marginBottom: 16, padding: '8px 16px', background: '#0f172a', color: 'white', borderRadius: 8, border: 'none', cursor: 'pointer' }}
        >
          Recargar la página
        </button>
        <pre style={{ background: '#1e293b', color: '#f1f5f9', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {error.name}: {error.message}
          {'\n\n'}
          {error.stack}
          {info?.componentStack ? `\n\n--- Componente ---${info.componentStack}` : ''}
        </pre>
      </div>
    );
  }
}
