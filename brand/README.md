# OpenSignet brand kit

This directory is the single committed source of every OpenSignet brand image. The frontend and
docs apps serve generated copies of it; those copies are git-ignored and must never be edited.

- **Sync:** `pnpm sync:brand` (root) copies this directory into the apps. Every app script that
  reads brand files (`dev`, `build`, `start`, `test`, `lint`, `typecheck`, asset verification and
  docs validation) runs the sync first, so a clean checkout needs no extra step. Unchanged files
  are skipped and copies of files removed from here are deleted.
- **Integrity:** every file here is pinned by SHA-256 in
  [`apps/frontend/brand-assets.manifest.json`](../apps/frontend/brand-assets.manifest.json).
  `pnpm --filter @opensignet/frontend assets` verifies the pins and that each served copy is
  byte-identical to its source here. The docs pin the files they ship in
  `apps/docs/scripts/validate-content.ts`.
- **Changes:** files are moved or renamed only with their bytes unchanged. Generated files are
  rebuilt with `pnpm --filter @opensignet/frontend assets:generate` (icons, social JPEG, header
  marks) and `pnpm --filter @opensignet/frontend brand:render` (cards and wordmarks); both write
  here and then sync the apps.
- **URLs:** the frontend serves `brand/<group>/<file>` at `https://opensignet.com/brand/<group>/<file>`,
  plus `icons/favicon.ico` at `/favicon.ico`. The docs serve the files they use at the same
  `/brand/<group>/<file>` paths on `https://docs.opensignet.com`. Logical names for frontend code
  live in `apps/frontend/src/lib/brand-assets.json`.

OpenSignet names, logos, marks and brand artwork are excluded from the Apache-2.0 license; see
[NOTICE](../NOTICE).

## `logo/` — the mark

| File                                | Purpose                                                                 | Size (px)          | Background         | Used by                                                          |
| ----------------------------------- | ----------------------------------------------------------------------- | ------------------ | ------------------ | ---------------------------------------------------------------- |
| `opensignet-logo.svg`               | Master vector logo: dark mark on a light tile. Source of mark geometry. | 788 × 788 (vector) | Opaque light tile  | `mark`; `brand-mark-geometry.ts`, `render-brand-cards.ts`, tests |
| `opensignet-logo.png`               | Raster of the master logo                                               | 788 × 788          | Opaque light tile  | `markPng`: Organization logo in structured data                  |
| `opensignet-logo-dark.svg`          | Inverse logo: light mark on a black tile                                | 788 × 788 (vector) | Opaque black tile  | `markDark`                                                       |
| `opensignet-logo-dark.png`          | Raster of the inverse logo                                              | 788 × 788          | Opaque black tile  | `markDarkPng`                                                    |
| `opensignet-mark-transparent.png`   | Dark mark alone, centred on a padded square canvas                      | 788 × 788          | Transparent        | `transparentMark`                                                |
| `opensignet-mark.svg`               | Tight mark, dark ink, for light backgrounds                             | 354 × 425 (vector) | Transparent        | Docs header logo (light theme)                                   |
| `opensignet-mark-on-dark.svg`       | Tight mark, light ink, for dark backgrounds                             | 354 × 425 (vector) | Transparent        | Docs header logo (dark theme)                                    |
| `opensignet-logo-circle.png`        | Mark in a white circular badge that fills the canvas                    | 788 × 788          | Opaque light field | `circleMark`                                                     |
| `opensignet-logo-circle-padded.png` | Smaller circular badge centred with wide margins                        | 1254 × 1254        | Opaque light field | `circleMarkMini`                                                 |

### `logo/sizes/` — platform size set

`opensignet-logo-0016.png` to `opensignet-logo-4096.png`: the master logo (dark mark on an opaque
light tile) pre-rendered at 16, 20, 24, 32, 40, 44, 48, 64, 72, 88, 96, 120, 128, 144, 150, 152,
167, 176, 180, 192, 256, 300, 384, 400, 512, 600, 768, 1024, 2048 and 4096 px square, for app
stores, directories and platforms that require an exact size. `opensignet-logo-0256.png` is
`appIcon`, the WalletConnect app icon.

## `wordmark/` — name and mark lockups

| File                                 | Purpose                         | Size (px)   | Background  | Used by              |
| ------------------------------------ | ------------------------------- | ----------- | ----------- | -------------------- |
| `opensignet-wordmark-stacked.png`    | Mark above the OpenSignet name  | 1254 × 1254 | Transparent | `stackedWordmark`    |
| `opensignet-wordmark-horizontal.png` | Mark beside the OpenSignet name | 2172 × 724  | Transparent | `horizontalWordmark` |

## `social/` — share cards and banners

| File                              | Purpose                                                       | Size (px)  | Background | Used by                                        |
| --------------------------------- | ------------------------------------------------------------- | ---------- | ---------- | ---------------------------------------------- |
| `opensignet-social-card.png`      | Link-preview card master: logo, wordmark and positioning line | 1731 × 908 | Opaque     | `socialCardOriginal`; source of the JPEG       |
| `opensignet-social-card.jpg`      | Delivery copy of the card (JPEG, under 600 KB)                | 1731 × 908 | Opaque     | `socialCard`: site Open Graph and X card image |
| `opensignet-x-banner.png`         | X (Twitter) profile header banner                             | 2172 × 724 | Opaque     | `socialBanner`; uploaded to the X profile      |
| `opensignet-docs-social-card.png` | Docs link-preview card with `docs.opensignet.com`             | 1731 × 908 | Opaque     | Docs `og:image`                                |

## `icons/` — favicons and app icons

| File                       | Purpose                                                   | Size (px)       | Background        | Used by                                                  |
| -------------------------- | --------------------------------------------------------- | --------------- | ----------------- | -------------------------------------------------------- |
| `favicon.svg`              | Browser tab icon; ink follows the light or dark tab theme | Square (vector) | Transparent       | `faviconSvg`: site and docs favicon, web app manifest    |
| `favicon.ico`              | Legacy favicon wrapping the 16, 32 and 48 px PNG frames   | 16, 32, 48      | Transparent       | `faviconIco`: served at `/favicon.ico`                   |
| `favicon-16.png`           | Pixel-hinted favicon fallback                             | 16 × 16         | Transparent       | `favicon16`; ICO frame                                   |
| `favicon-32.png`           | Pixel-hinted favicon fallback                             | 32 × 32         | Transparent       | `favicon32`; ICO frame                                   |
| `favicon-48.png`           | Favicon fallback                                          | 48 × 48         | Transparent       | `favicon48`; ICO frame                                   |
| `favicon-96.png`           | Favicon fallback                                          | 96 × 96         | Transparent       | `favicon`: site and docs PNG favicon                     |
| `icon-192.png`             | Web app icon                                              | 192 × 192       | Transparent       | `appIcon192`: web app manifest                           |
| `icon-512.png`             | Web app icon                                              | 512 × 512       | Transparent       | `appIcon512`: web app manifest                           |
| `icon-maskable-512.png`    | Android maskable icon; mark inside the 80% safe zone      | 512 × 512       | Opaque warm field | `maskableIcon`: web app manifest                         |
| `apple-touch-icon-180.png` | iOS home-screen icon                                      | 180 × 180       | Opaque white      | `appleTouchIcon`; `/apple-touch-icon.png` redirects here |
