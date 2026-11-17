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
- Matemática: **STIX Two Text** cursiva (`--font-math`), exclusiva para fórmulas.
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

## Componentes de cálculo (estudio del nutriólogo)
- **Fórmulas** (`components/formula.tsx`, clases `.formula` y `.formula-block`): toda ecuación va en STIX Two Text cursiva sobre un renglón con filete amarillo. Nunca se escribe una fórmula como texto corrido. `FormulaCard` une nombre, cifra grande, regla de rangos y la fórmula con los valores sustituidos.
- **Regla de rangos** (`components/range-gauge.tsx`): franja por zonas (azul bajo, verde normal, amarillo límite, rojo alto) con un marcador. La zona activa va a color pleno y el resto atenuado; la zona siempre se nombra con texto, el color no va solo. Se usa en IMC, grasa, cintura, índices, laboratorios y adecuación.
- **Estudio de macros** (`components/studio/macro-studio.tsx`): un deslizador por macronutriente sobre su rango aceptable, campos en %, g y g/kg, y candados (en % o en gramos). El veredicto de equilibrio se actualiza en vivo y avisa cuánta energía sobra o falta.
- **Cuadro de equivalentes** (`components/studio/equivalents-board.tsx`): celdas con paso de ½ equivalente que toman el color de su grupo al tener valor; «Automático» propone, las pastillas de sugerencia corrigen lo que falta.
- **Portada de receta** (`components/recipe-cover.tsx`): foto subida por el nutriólogo o, si no hay, ilustración generada con el plato de la receta sobre el color del tiempo de comida. No se usan fotos de bancos de imágenes.
- **Hoy te toca** (`components/today-meals.tsx`): anillo de comidas hechas, barras por grupo (comido / falta) y botón «Ya comí» en verde lima sobre el campo.
- **Tarjeta de cálculo del asistente** (`components/calc-card.tsx`): resultado exacto de una herramienta con etiqueta «Cálculo exacto»; el texto del modelo va aparte.

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
