import { useEffect } from 'react';

// Enlace con la cuenta DESACTIVADA por el administrador: página en blanco,
// sin logotipo, foto ni ningún dato. Al activar la cuenta de nuevo desde el
// panel del administrador, PuertaCuenta vuelve a mostrar el ingreso solo.
export function PaginaNoDisponible() {
  useEffect(() => {
    const anterior = document.title;
    document.title = 'Página no disponible';
    return () => { document.title = anterior; };
  }, []);
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-white px-4" data-pagina-no-disponible>
      <p className="text-center text-[15px] text-slate-500">Página no disponible</p>
    </div>
  );
}
