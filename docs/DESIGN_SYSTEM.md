# Vinil06 · Design System (club / vinilo)

Guía para replicar la identidad visual de Vinil06 en otras aplicaciones.
Fuente de verdad del código: `src/styles.css` (tokens) + `modelo.html` (prototipo visual).
Archivo portable listo para copiar: `docs/design-tokens.css`.

## 1. Identidad y dirección de arte

- **Tema**: oscuro, "club nocturno + vinilo". Mobile-first (360–430 px aprobado).
- **Superficie base**: `#0b0d14` con rejilla de 28 px y dos halos radiales (esmeralda arriba-centro, índigo abajo-derecha).
- **Glassmorphism sutil**: paneles `rgba(17,21,32,0.78)` + `backdrop-filter: blur(14px)` + borde `rgba(255,255,255,0.08)`.
- **Tipografía**: Inter (400–900), tamaño base 14 px, line-height 1.4.
- **Acento principal**: esmeralda `#34d399` / `#10b981`. Secundarios: índigo `#a5b4fc`, ámbar `#fbbf24`, rosa `#fb7185`, violeta `#a855f7`, cyan `#38bdf8`.
- **Formas**: radios 10/16/24 px; botones 14 px; tarjetas 18 px.
- **Motion**: easing `cubic-bezier(0.22,1,0.36,1)`; duraciones 120/220/560 ms; animaciones solo `transform`/`opacity`.
- **Accesibilidad**: foco visible esmeralda; `prefers-reduced-motion` desactiva animaciones/transiciones.

## 2. Cómo se define (arquitectura)

Todo el estilo vive en **variables CSS en `:root`** (`src/styles.css`). Los componentes **no hardcodean colores**: consumen `var(--token)`. Eso permite:

1. Cambiar tema global editando solo `:root`.
2. Copiar el estilo a otra app enlazando `design-tokens.css` (o copiando el bloque `:root`).
3. Extender con Tailwind (modelo.html) mapeando los mismos valores.

Capas del sistema:

| Capa | Dónde | Qué contiene |
|---|---|---|
| Tokens | `:root` en `src/styles.css` | Colores, radios, sombras, motion, layout |
| Base | `body`, `*` | Reset, fondo rejilla, tipografía |
| Utilidades | `.row`, `.panel`, `.glass-panel`, `.truncate` | Layout y superficies |
| Componentes | `.btn`, `.field`, `.badge`, `.card-*` | Patrones reutilizables |
| Motion | `@keyframes` + clases | spinVinyl, pulseUrgent, floatIn, resultPop |
| Responsive | `@media` al final | 720 px, 1100 px; container queries en grids |

## 3. Tokens principales (copiar `:root`)

Ver `docs/design-tokens.css` sección 1. Resumen:

- Superficies: `--bg-base`, `--surface`, `--surface-2`, `--border`, `--border-strong`.
- Texto: `--text`, `--text-muted`, `--text-dim`.
- Acentos: `--accent` (esmeralda), `--indigo`, `--amber`, `--danger`, `--violet`, `--cyan`.
- Radios: `--radius-sm/md/lg`.
- Sombras: `--shadow-1/2`.
- Motion: `--ease`, `--dur-fast`, `--dur`, `--flip-duration`, `--spin-duration`.
- Layout: `--wide-max` (1240), `--console-max` (1360), `--safe-top/bottom`.

## 4. Fondo característico

```css
body {
  background-color: var(--bg-base);
  background-image:
    radial-gradient(circle at 50% 0%, rgba(16,185,129,0.12), transparent 45%),
    radial-gradient(circle at 85% 85%, rgba(99,102,241,0.10), transparent 45%),
    linear-gradient(to right, var(--grid-color) 1px, transparent 1px),
    linear-gradient(to bottom, var(--grid-color) 1px, transparent 1px);
  background-size: 100% 100%, 100% 100%, 28px 28px, 28px 28px;
  background-attachment: fixed;
}
```

En desktop (≥1100 px) se reemplaza por 3 halos (esmeralda/índigo/violeta) + rejilla 40 px.

## 5. Componentes reutilizables

- **Glass panel**: `.glass-panel` (blur 14, surface 0.78, borde 0.08).
- **Botones**: `.btn` + variantes `.btn-primary` (gradiente esmeralda), `.btn-ghost`, `.btn-amber`, `.btn-danger`, `.btn-block`. Min-height 44 px (táctil).
- **Campos**: `.field` (min-height 46, focus esmeralda con halo 3 px). `.field-code` para códigos.
- **Badges**: `.badge` + `.badge-accent/indigo/amber/danger`.
- **Cartas 3D**: `.card-scene` (perspective 1100) + `.card-inner` (preserve-3d, rotateY 180 al flip) + `.card-face` (backface hidden).
- **Animaciones**: `.vinyl-spinning` (3.2 s), `.urgent-pulse` (0.45 s), `.float-in`, `.result-pop`.

## 6. Cómo copiarlo a otra app

### Opción A · CSS puro (cualquier stack)
1. Copia `docs/design-tokens.css` a tu proyecto y enlázalo en `<head>` después de reset.
2. Importa Inter:  
   `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">`
3. Marca `<html class="dark">` y `<meta name="color-scheme" content="dark">`.
4. Usa las clases (`.btn-primary`, `.glass-panel`, etc.) o solo las variables.

### Opción B · Tailwind (como modelo.html)
Extiende `tailwind.config` con los tokens:

```js
theme: {
  extend: {
    colors: {
      bg: '#0b0d14', surface: '#111520', surface2: '#161c29',
      border: 'rgba(255,255,255,0.08)',
      text: '#f8fafc', muted: '#9aa7b8', dim: '#94a3b8',
      accent: '#34d399', 'accent-strong': '#10b981',
      indigo: '#a5b4fc', amber: '#fbbf24', danger: '#fb7185',
      violet: '#a855f7', cyan: '#38bdf8',
    },
    fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    borderRadius: { sm: '10px', md: '16px', lg: '24px' },
    boxShadow: { 1: '0 6px 18px rgba(0,0,0,0.35)', 2: '0 18px 48px rgba(0,0,0,0.45)' },
  }
}
```

### Opción C · Design tokens JSON (Figma/Style Dictionary)
Convierte el bloque `:root` a JSON (nombre → valor) y úsalo en Style Dictionary o Tokens Studio para generar CSS/iOS/Android.

## 7. Reglas de uso

- Mobile-first: no romper el layout de 360–430 px; las mejoras de desktop van en `@media`/`@container` al final.
- Estados de foco y `prefers-reduced-motion` son obligatorios.
- Animaciones solo `transform`/`opacity` para 60 fps.
- Contraste: texto principal `#f8fafc` sobre `#0b0d14`; acentos con brillo suficiente (emerald-300/400).
- No mezclar fondos claros: el sistema es dark-only (`color-scheme: dark`).

## 8. Archivos de referencia

- `src/styles.css` — tokens y estilos del app Angular.
- `modelo.html` — prototipo visual (Tailwind) con el mismo lenguaje.
- `docs/design-tokens.css` — versión portable (este archivo).
- `public/manifest.webmanifest` — colores PWA (`#0b0d14`).
- `public/icons/icon.svg` — icono base (máscara).
