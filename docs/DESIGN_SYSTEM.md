# DotReact documentation design system

This file defines the visual contract for the landing page and documentation. New UI must follow these rules before introducing a new color, radius, shadow or component treatment.

## Principles

1. **Content first.** Decoration must clarify hierarchy or state. It must not exist only to make an area look busier.
2. **One accent.** Blue is the only semantic brand accent. Categories, technologies and cards are not assigned decorative colors.
3. **Contrast through surfaces.** Separate areas using canvas, subtle and strong neutral surfaces instead of gradients or multiple hues.
4. **Predictable components.** The same component type uses the same background, border, radius, typography and interaction state everywhere.
5. **Quiet elevation.** Shadows are reserved for floating or elevated elements. Static cards use borders.

## Tokens

The source of truth is `src/styles.css`.

| Token | Light | Purpose |
| --- | --- | --- |
| `--dr-brand` | `#1d4ed8` | Links, selected states, primary actions and small identifiers |
| `--dr-canvas` | `#ffffff` | Primary reading surface |
| `--dr-surface` | `#f3f5f7` | Cards, section alternation and navigation surfaces |
| `--dr-surface-strong` | `#e8ecf1` | Page gutters and stronger neutral separation |
| `--dr-border` | `#d7dde5` | All standard dividers and card borders |
| `--dr-ink` | `#0f172a` | Primary text |
| `--dr-muted` | `#526072` | Supporting text |

Dark values are defined on `[data-theme="dark"]` using the same semantic names.

## Components

- **Header:** canvas background, one bottom border, no decorative gradient.
- **Sidebar:** subtle surface. Category marker and active state use the single brand blue.
- **Sticky layout:** the header owns the highest application layer. Sidebars start at `--dr-header-height`, remain below the header layer and use a viewport height that subtracts the same token. Do not combine `inset-y-0` with an explicit sticky `top`.
- **Documentation intro:** subtle surface, standard border, 12px radius, no glow.
- **Cards:** subtle surface, standard border, 8px radius. Related cards always share the same color.
- **Architecture steps:** identical card surface and blue badge. Identity comes from icon, number, title and order.
- **Code blocks:** dark neutral surface with syntax colors reserved for code semantics.
- **Primary button:** solid brand blue. **Secondary button:** canvas with standard border.
- **Callouts:** a restrained brand tint may communicate information; warnings may use amber only when the meaning is genuinely a warning.

## Typography and spacing

- UI and prose use the shared sans stack in `src/styles.css`; code uses the shared mono stack.
- Heading weight is `600`; body copy is regular. Avoid ultra-bold display type inside documentation.
- Base spacing follows a 4px grid. Common component gaps are 8, 12, 16, 24 and 32px.
- Controls use an 8px radius. Major panels use 12px. Pills are limited to status and compact metadata.

## Review checklist

- Does the component introduce a color other than neutral, brand blue or a meaningful warning/error color?
- Does the same component already exist with a different treatment?
- Can hierarchy be expressed with spacing, type or a neutral surface instead?
- Is every shadow attached to an element that is actually elevated?
- Are light and dark themes using the same semantic hierarchy?
