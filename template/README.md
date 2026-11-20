# Vinil06 Design Template

Plantilla reutilizable del design system "club / vinilo" de Vinil06.
Copia esta carpeta a cualquier proyecto nuevo y adapta.

## Contenido

- `design-tokens.css` — tokens + base + utilidades + componentes + motion (CSS puro, autocontenido).
- `tailwind.config.js` — configuración Tailwind equivalente (si usas Tailwind).
- `tokens.json` — design tokens en formato W3C (para Style Dictionary / Figma / Tokens Studio).
- `index.html` — starter demostrando los patrones.

## Uso rápido

### HTML/CSS puro
1. Copia `design-tokens.css` a tu proyecto.
2. Enlázalo en `<head>` después de importar Inter:
   ```html
   <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
   <link rel="stylesheet" href="design-tokens.css">
   ```
3. Marca `<html class="dark">` y `<meta name="color-scheme" content="dark">`.

### Tailwind
Copia `tailwind.config.js` a la raíz de tu proyecto Tailwind y ajusta `content`.

### Design tokens (Figma / Style Dictionary)
Importa `tokens.json` en Tokens Studio o pásalo por Style Dictionary para generar CSS/iOS/Android.

## Personalización

Edita únicamente el bloque `:root` de `design-tokens.css` (o los valores en `tokens.json`) para cambiar tema, acentos o radios. Las clases consumen variables, así que no hace falta tocar componentes.

## Reglas

- Mobile-first: mejoras de desktop en `@media`/`@container` al final.
- Foco visible y `prefers-reduced-motion` obligatorios.
- Animaciones solo `transform`/`opacity`.
- Sistema dark-only (`color-scheme: dark`).
