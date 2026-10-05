# Light Lab

Interactive light and optics curriculum for intro physics, media-arts, and instructional-design course samples — by Virgil Renfroe.

Own repo. Not part of noctuary-corridor.

Four lessons share one night stage. Module 01 cuts a beam. Module 02 bends what remains until the rays meet — or throws them apart. Module 03 splits the white beam by wavelength. Module 04 lets two reflections from a thin film interfere, so thickness and viewing angle pick the color.

## Lessons

| | Path | What it teaches |
| --- | --- | --- |
| Hub | `/` and `/index.html` | All four modules. Strike the crease, or press Enter, to unfold the index. |
| 01 Aperture | `/aperture.html` | Occlusion, volumetric shafts, caustic pool |
| 02 Lenses | `/lens.html` | Refraction to a focus, lens shape changing the bend |
| 03 Prism | `/prism.html` | Dispersion, a spectrum from wavelength-dependent bend |
| 04 Thin film | `/film.html` | Interference, color bands from film thickness and viewing angle |

## Live

Ship path is Railway. Service `web` on project light-lab serves this tree after `main` updates:

- **Railway:** https://web-production-e48f9.up.railway.app/
  - Hub: `/`
  - Aperture: `/aperture.html`
  - Lenses: `/lens.html`
  - Prism: `/prism.html`
  - Thin film: `/film.html`

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

## Module 04 — Thin film

A soap film stretched in a brass hoop. Light reflects from the front surface and from the back surface. The back reflection travels farther. That extra length is the path difference, δ = 2 n t cos θ. One reflection flips phase. Near zero thickness the two waves cancel for every color, so the film looks dark. Gravity drains the liquid downward, so the top is thinner and goes dark first. A thicker film changes which wavelengths line up, and the hue shifts. A steeper view shortens the path inside the film. Soap is index 1.33. Oil is index 1.50, so the same physical thickness packs the bands closer.

HUD craft labels:

- **interference → color bands**
- **thickness → hue**

`S` soap, `O` oil. Arrows change thickness. The rail is thickness. Drag orbits the view, which is the angle in the path difference.

The thickness value has a little mass: it eases toward the rail instead of jumping, and a fast drag bows the membrane. `prefers-reduced-motion` and `?still=1` snap the thickness and hold the drainage ripple.

## How it runs

- One `WebGLRenderer` per lesson page. The hub is paper and type — no canvas. No page mounts two renderers.
- **Aperture, desktop:** occlusion-map radial blur (god rays) through `EffectComposer` on that same renderer.
- **Lenses, desktop:** a short heat-lift pass on the same renderer. Not a second context.
- **Prism, desktop:** a short spectral-lift pass on the same renderer. Not a second context.
- **Thin film, desktop:** a short wet-sheen pass on the same renderer. Not a second context. The film color is a shader on that one renderer: reflected intensity follows sin²(π δ / λ).
- Narrow viewport (≤900px), a coarse pointer, or `?safe=1`: `EffectComposer` is never constructed. Aperture uses additive shaft quads. Lenses keep the ray filaments and skip the heat pass. Prism keeps the colored filaments and skips the spectral lift. The film keeps the interference shader, drops to four wavelength samples, and skips the sheen pass. Device pixel ratio caps at 1.5.
- `prefers-reduced-motion: reduce` and `?still=1` hold auto-orbit, dust, shimmer, and the fold/burn motion. The hub opens already unfolded.

## Local

```bash
python3 -m http.server 8877
```

- Hub: http://127.0.0.1:8877/
- Aperture: http://127.0.0.1:8877/aperture.html
- Lenses: http://127.0.0.1:8877/lens.html
- Prism: http://127.0.0.1:8877/prism.html
- Thin film: http://127.0.0.1:8877/film.html
- Mobile path on a desktop: add `?safe=1`
- Held motion: add `?still=1`

`?embed=1` hides the lesson frame for an iframe slide. Add `?wall=1` when the frame should stay opaque.

## Stack

- three.js `0.170.0` via a CDN import map (jsDelivr). No `vendor/` tree.
- Google Fonts: Bricolage Grotesque, Instrument Sans, Space Mono
- No backend
- Railway serves the static files with Caddy. GitHub Pages can serve the same tree.
