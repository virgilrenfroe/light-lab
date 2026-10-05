# Light Lab

Interactive light and optics curriculum for intro physics, media-arts, and instructional-design course samples — by Virgil Renfroe.

Own repo. Not part of noctuary-corridor.

## Live

Placeholders until hosting is turned on:

- **GitHub Pages:** https://virgilrenfroe.github.io/light-lab/ — enable Pages on `main`, root `/`
- **Railway:** https://light-lab-production.up.railway.app/ — create the service (Dockerfile builder) to claim this URL

Repo: https://github.com/virgilrenfroe/light-lab

## Module 01 — Aperture

One night room. Mullions occlude a beam into volumetric shafts, a lens refracts what gets through into a caustic pool, and dust in the beam is scatter.

HUD craft labels:

- **occlusion → volumetric shafts**
- **refraction → caustic pool**

Dust in the beam = scatter.

## How it runs

- One shared `WebGLRenderer` for the page. No second context.
- Desktop: occlusion-map radial blur (god rays) through `EffectComposer` and a god-ray `ShaderPass` on that same renderer.
- Narrow viewport (≤900px), a coarse pointer, or `?safe=1`: `EffectComposer` and the god-ray `ShaderPass` are never constructed. Shafts are additive quads. Device pixel ratio caps at 1.5.
- `prefers-reduced-motion: reduce` and `?still=1` hold auto-orbit, dust drift, caustic shimmer, and the lens.

## Local

```bash
python3 -m http.server 8877
```

- Exhibit: http://127.0.0.1:8877/
- Mobile path on a desktop: http://127.0.0.1:8877/?safe=1
- Held motion: http://127.0.0.1:8877/?still=1
- Both: http://127.0.0.1:8877/?safe=1&still=1

`?embed=1` hides the HUD for an iframe slide. Add `?wall=1` when the frame should stay opaque.

## Stack

- three.js `0.170.0` via a CDN import map (jsDelivr). No `vendor/` tree.
- Google Fonts: Bricolage Grotesque, Instrument Sans, Space Mono
- No backend
- Railway serves the static files with Caddy. GitHub Pages can serve the same tree.
