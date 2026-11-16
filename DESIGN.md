# Sistema visual de VitalIA — "Plato del Bien Comer"

Dirección elegida por el usuario el 2026-11-15. Registro hecho desde lo construido (sin revisor ni documentador externos).

## Idea
El color es información nutricional. Cada grupo de alimentos tiene un color fijo en toda la app y cada tiempo de comida se dibuja como un plato cuyos sectores son sus equivalentes. Verde / amarillo / rojo también son los tonos de estado (bien / atención / cuidado), igual que "muchas, suficientes, pocas" en el plato.

## Color (tokens en `src/app/globals.css`)
- **Neutros:** `--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--muted`. Claro y oscuro por `prefers-color-scheme`.
- **Campo:** `--field` (verde profundo) para la navegación lateral, la portada del login y el bloque "Hoy te toca". Texto `--field-fg`, secundario `--field-muted`.
- **Acción:** `--primary` (verde del plato). Estados: `--warn` (amarillo), `--danger` (rojo), `--info` (azul).
- **Grupos (`--g-*`):** verduras, frutas, cereales, leguminosas, aoa, leche, grasas, azucares, libres. Se asignan por prefijo del código SMAE en `src/lib/groups.ts`. Nunca usar estos colores para otra cosa.
- Macros: proteína = `--g-aoa`, lípidos = `--g-grasas`, hidratos = `--g-cereales`.

## Tipografía
- Títulos: **Bricolage Grotesque** (`font-display`), 700–800, tracking apretado.
- Texto e interfaz: **Onest** (`font-sans`). Cifras con `tabular-nums` (`.tabular`).
- Sin etiquetas en mayúsculas espaciadas sobre los títulos.

## Forma
- Circular: platos, puntos de grupo, botones y pestañas tipo píldora (`rounded-full`), tarjetas `rounded-2xl`, bloques de campo `rounded-3xl`.
- Sombra suave con desplazamiento (`shadow-soft`, `shadow-lift`); sin halos de color.

## Componentes firma (`src/components/plate.tsx`)
- `Plate`: plato por tiempo de comida (sectores = familias de equivalentes).
- `GroupDot`: punto de color junto al nombre de cualquier grupo.
- `MacroBar`: barra apilada P / L / HC.
- `PlateMark` + `Wordmark`: marca.

## Movimiento
- Una entrada por página (`animate-enter`, vía `template.tsx`), listas en cascada corta (`.stagger`), y el plato que "se sirve" con barrido (`.plate-serve`).
- Curva `--ease-out` (exponencial). Todo se desactiva con `prefers-reduced-motion`.
- Carga: esqueletos (`.skeleton`, `PageSkeleton`).

## Navegación
- Escritorio: barra lateral sobre el campo verde, con íconos; el elemento activo es una píldora clara.
- Teléfono: menú superior que se cierra al navegar; el portal del paciente agrega barra inferior con 5 destinos.

## Voz
Cálida y cercana, de tú, sin juicios ("Qué gusto verte", "Hoy te toca", "Tu plan está en camino"). Los errores dicen qué pasó y qué hacer.

## Evitar
Aspecto de hospital, de app de gimnasio, infantil/gamificado o de spa. Sin texto con degradado, sin vidrio decorativo, sin bordes laterales de color en tarjetas.
