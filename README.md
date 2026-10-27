# Dashboard de Análisis Delictivo — MEPOY

Plataforma permanente de análisis estadístico y operacional de delitos, construida en React + TypeScript + Vite + Tailwind CSS + Recharts.

Elaborado por: **ING. Jonathan Gomez**

## ✅ Verificado antes de la entrega

- El proyecto compila sin errores (`tsc -b && vite build` ejecutado con éxito).
- La estructura de datos activa es la de `Base_de_Datos_General.xlsx` (21 columnas: Año, Hora_24, Mes, Dia, Fecha Dia, Semana2, Delito, Estación Final, CAI Final, Cuadrante Final, Genero Final, Zona Final, Clase Sitio Final, Arma Final, Modalidad Final, Causa Lesion Final, Barrio Hecho Final, Grupo Edad Ley Final).
- Como este archivo no trae una columna de fecha única, la fecha se reconstruye a partir de Año + Mes + Fecha Dia. Se validó contra el campo de día de la semana del propio archivo: **0 inconsistencias en 18.562 filas**.
- El dashboard también sigue aceptando el formato histórico (FECHA_HECHO/DELITOS/CANTIDAD) por si alguna vez necesitas cargar un archivo antiguo.
- Acepta archivos **.csv y .xlsx/.xls** directamente al actualizar información.

## 📊 Estructura de datos vigente

Desde esta versión, el dashboard trabaja con el archivo **`Base_de_Datos_General`** (CSV o Excel `.xlsx`), con estas columnas fijas:

`Año, Hora_24, Mes, Dia, Mes resumido, dia resumido, Fecha Dia, Semana2, Delito, Estación Final, CAI Final, Cuadrante Final, Genero Final, Zona Final, Clase Sitio Final, Arma Final, Modalidad Final, Causa Lesion Final, Barrio Hecho Final, Grupo Edad Ley Final`

- No incluye una columna de fecha única: se reconstruye automáticamente a partir de `Año` + `Mes` + `Fecha Dia` (verificado al 100% contra el campo de día de la semana).
- No incluye columna de cantidad: cada fila equivale a 1 caso.
- El dashboard también sigue aceptando el formato histórico (`FECHA_HECHO`, `DELITOS`, `CANTIDAD`, 153 columnas) por compatibilidad, y ahora acepta subir el archivo directamente en **.xlsx**, no solo CSV.

## 🌐 Modo multiusuario (servidor central)

Por defecto, el dashboard guarda los datos en el navegador de cada persona (IndexedDB) — útil si lo vas a usar tú solo desde tu propio equipo.

Si **varias personas** necesitan ver siempre la misma información actualizada desde un enlace web, sigue la guía **`GUIA_DESPLIEGUE.md`** incluida en este proyecto: monta un backend gratuito con Google Apps Script, y el dashboard se conecta a él automáticamente. Incluye:

- Un botón **"Sincronizar"** para traer la última versión sin recargar la página.
- Protección con una clave compartida solo entre las personas de confianza que pueden actualizar.
- Registro de quién hizo la última actualización.

## Cómo ejecutar el proyecto

Requisitos: Node.js 18+ y npm.

```bash
npm install
npm run dev
```

Abre `http://localhost:5173` en el navegador.

Para generar una build de producción:

```bash
npm run build
npm run preview
```

## Carga de datos

- Al abrir la aplicación por primera vez, se carga automáticamente `public/Base_de_Datos_General.csv`.
- A partir de ahí, todo lo que cargues queda guardado en el navegador (IndexedDB), por lo que la próxima vez que abras la app verás los mismos datos, aunque recargues la página.
- El botón **"📂 Actualizar información"** (arriba a la derecha) permite:
  - **Agregar información**: incorpora un nuevo archivo a los datos existentes, detectando y descartando duplicados automáticamente.
  - **Reemplazar información**: borra los datos actuales y deja únicamente el nuevo archivo.
  - **Limpiar todos los datos**: borra todo lo almacenado en este navegador.
- El nombre del archivo es irrelevante. Debe contener, como mínimo, las columnas `Año`, `Mes`, `Fecha Dia` y `Delito` (o, si usas el formato histórico, `FECHA_HECHO`, `DELITOS` y `CANTIDAD`); si faltan, la app lo indica claramente y no rompe el dashboard.
- Si el nuevo archivo trae columnas adicionales que hoy no se usan, la app las conserva en cada registro (no se pierden).

## Qué detecta automáticamente (sin tocar código)

- Años y meses disponibles (el filtro de año/mes se genera desde los datos).
- Nuevas estaciones, CAI, cuadrantes, barrios, delitos, modalidades, armas y causas de lesión.
- El periodo analizado (mínimo y máximo de la fecha reconstruida).
- El año "actual" y "anterior" para todos los comparativos — no hay años fijos en el código.

## Estructura del proyecto

```
src/
  types/          Tipos (CrimeRecord, FilterState, DatasetMeta...)
  data/           Parser de CSV/Excel, persistencia IndexedDB, fusión/deduplicación, cliente del backend remoto
  utils/          Agregaciones, formateo, aplicación de filtros
  context/        DataContext (estado global de datos + filtros + sincronización remota)
  hooks/          useKpis, useTemporalAnalysis, useTerritorialAnalysis, useInsights
  components/
    layout/       Sidebar (con crédito "Elaborado por"), Header, panel de estado de datos
    filters/      Panel de filtros dependientes, multi-select
    charts/       TrendChart, HorizontalBarChart, GroupedBarChart, DonutChart, Heatmap
    tables/       RankingTable, VariationTable, DataTable (con exportación CSV)
    upload/       Modal de actualización de datos (agregar/reemplazar, CSV o Excel)
    ui/           KpiCard, InsightCard (hallazgos automáticos), Card
  pages/          Resumen, Temporal, Unidad, Delitos, Territorial, Modalidades, Armas,
                  Población, Comparativo, Tabla de Datos, Calidad de Datos
public/
  Base_de_Datos_General.csv   Archivo de datos por defecto (puede reemplazarse desde la app)
  config.js                   Configuración del backend central (editable sin recompilar)
apps-script/
  Code.gs         Backend central en Google Apps Script (ver GUIA_DESPLIEGUE.md)
```

## Secciones del sidebar

1. **Resumen Ejecutivo** — KPIs principales, hallazgos automáticos, cuadrantes/barrios críticos.
2. **Análisis Temporal** — tendencia mensual, diaria, por día de semana, por hora y heatmap día×hora.
3. **Análisis por Unidad** — ranking de estaciones (clic para filtrar).
4. **Análisis de Delitos** — Top N configurable, causa de lesión y clase de sitio.
5. **Análisis Territorial** — CAI, cuadrante, barrio, urbano vs rural.
6. **Modalidades** — Top 10 y cruce modalidad × delito.
7. **Armas** — distribución por tipo de arma empleada.
8. **Población** — género y grupo de edad.
9. **Comparativo 2025/2026** — dinámico, con comparación homóloga y tabla de variación ordenable.
10. **Tabla de Datos** — búsqueda, orden, paginación, selección de columnas, exportación CSV.
11. **Calidad de Datos** — % de registros válidos y columnas no mapeadas conservadas.

## Notas de diseño

- Todo el procesamiento ocurre en el navegador; no se envían datos a servicios externos (salvo que configures el backend central opcional).
- La arquitectura separa por completo la aplicación de los datos: cambiar de archivo no requiere tocar el código.
- El drill-down (clic sobre una barra o fila) aplica un filtro y actualiza todo el dashboard.
