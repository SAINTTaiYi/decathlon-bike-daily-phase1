# Image Sources

## `workshop-head-*.webp`

- Source: Unsplash photo “A man working on a bicycle in a bike shop” by Anton Savinov.
- URL: https://unsplash.com/photos/a-man-working-on-a-bicycle-in-a-bike-shop-O0rn0jsMJ6c
- Downloaded derivative: `https://images.unsplash.com/photo-1673870861514-8c72efb696f3?...`
- Local source variants: 480w, 800w and 1200w WebP crops.

## `workshop-head-signal-*.(avif|webp)`

- Derived locally from the attributed source variants for WORKSHOP SIGNAL GRID Phase 5.
- Treatment: build-time high-contrast four-level ordered dither plus Overview Voltage Lime / Dark Void duotone separation.
- Formats: AVIF first with WebP fallback at 480w, 800w and 1200w.
- Runtime behavior: no live grayscale, blur or expensive scroll-time image filter is required.

User-uploaded business attachments remain private source media. Their small dialog thumbnails receive a module-scoped, static duotone/halftone preview only; the full signed image opens without destructive transformation.
