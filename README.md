# Light Lab

Interactive light and optics curriculum for intro physics, media-arts, and instructional-design course samples — by Virgil Renfroe.

Own repo. Not part of noctuary-corridor.

Three lessons share one night stage. Module 01 cuts a beam. Module 02 bends what remains until the rays meet — or throws them apart. Module 03 splits the white beam by wavelength.

## Lessons

| | Path | What it teaches |
| --- | --- | --- |
| Hub | `/` and `/index.html` | All three modules. Strike the crease, or press Enter, to unfold the index. |
| 01 Aperture | `/aperture.html` | Occlusion, volumetric shafts, caustic pool |
| 02 Lenses | `/lens.html` | Refraction to a focus, lens shape changing the bend |
| 03 Prism | `/prism.html` | Dispersion, a spectrum from wavelength-dependent bend |

## Live

Ship path is Railway. Service `web` on project light-lab serves this tree after `main` updates:

- **Railway:** https://web-production-e48f9.up.railway.app/
  - Hub: `/`
  - Aperture: `/aperture.html`
  - Lenses: `/lens.html`
  - Prism: `/prism.html`

GitHub Pages is not the ship path right now.

Repo: https://github.com/virgilrenfroe/light-lab

The aperture exhibit used to be the site root. It now lives at `/aperture.html`. The root is the curriculum index.

## Module 01 — Aperture

One night room. Mullions occlude a beam into volumetric shafts, a lens refracts what gets through into a caustic pool, and dust in the beam is scatter.

HUD craft labels:

- **occlusion → volumetric shafts**
- **refraction → caustic pool**

## Module 02 — Lenses

An optical bench. Parallel rays hit a glass lens and bend. Drag the bow: a thicker middle meets sooner. Flip to concave and the same refraction spreads the rays; the focus goes virtual, behind the glass. The center ray does not turn. A card down the bench shows the spot tighten when the focus lands on it.

HUD craft labels:

- **refraction → focus**
- **lens shape → ray bend**

`C` convex, `D` concave. Arrows nudge the bow. The rail is a slider.

## Module 03 — Prism

A triangular prism on the bench. White light enters one face and leaves as a spectrum: each wavelength bends a different amount. Violet turns harder than red. Turn the prism and the angle of incidence changes — the fan walks across the card, widens, and can lose violet first when that color reflects inside the glass. Flint opens the fan more than crown. The same refraction, a different lesson from the monochrome focus on the lens bench.

HUD craft labels:

- **dispersion → spectrum**
- **wavelength → bend**

`C` crown, `F` flint. Arrows turn the prism. The rail is incidence.

## How it runs

- One `WebGLRenderer` per lesson page. The hub is paper and type — no canvas. No page mounts two renderers.
- **Aperture, desktop:** occlusion-map radial blur (god rays) through `EffectComposer` on that same renderer.
- **Lenses, desktop:** a short heat-lift pass on the same renderer. Not a second context.
- **Prism, desktop:** a short spectral-lift pass on the same renderer. Not a second context.
- Narrow viewport (≤900px), a coarse pointer, or `?safe=1`: `EffectComposer` is never constructed. Aperture uses additive shaft quads. Lenses keep the ray filaments and skip the heat pass. Prism keeps the colored filaments and skips the spectral lift. Device pixel ratio caps at 1.5.
- `prefers-reduced-motion: reduce` and `?still=1` hold auto-orbit, dust, shimmer, and the fold/burn motion. The hub opens already unfolded.

## Local

```bash
python3 -m http.server 8877
```

- Hub: http://127.0.0.1:8877/
- Aperture: http://127.0.0.1:8877/aperture.html
- Lenses: http://127.0.0.1:8877/lens.html
- Prism: http://127.0.0.1:8877/prism.html
- Mobile path on a desktop: add `?safe=1`
- Held motion: add `?still=1`

`?embed=1` hides the lesson frame for an iframe slide. Add `?wall=1` when the frame should stay opaque.

## Stack

- three.js `0.170.0` via a CDN import map (jsDelivr). No `vendor/` tree.
- Google Fonts: Bricolage Grotesque, Instrument Sans, Space Mono
- No backend
- Railway serves the static files with Caddy. GitHub Pages can serve the same tree.
