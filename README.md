# Light Lab

Interactive light and optics curriculum for intro physics, media-arts, and instructional-design course samples — by Virgil Renfroe.

Own repo. Not part of noctuary-corridor.

Six lessons share one night stage. Module 01 cuts a beam. Module 02 bends what remains until the rays meet — or throws them apart. Module 03 splits the white beam by wavelength. Module 04 lets two reflections from a thin film interfere, so thickness and viewing angle pick the color. Module 05 keeps one wiggle of the wave: turn the analyzer and brightness follows Malus's law. Module 06 sends the beam through two slits. The waves overlap, and the screen shows bright and dark bars.

## Lessons

| | Path | What it teaches |
| --- | --- | --- |
| Hub | `/` and `/index.html` | All six modules. Strike the crease, or press Enter, to unfold the index. |
| 01 Aperture | `/aperture.html` | Occlusion, volumetric shafts, caustic pool |
| 02 Lenses | `/lens.html` | Refraction to a focus, lens shape changing the bend |
| 03 Prism | `/prism.html` | Dispersion, a spectrum from wavelength-dependent bend |
| 04 Thin film | `/film.html` | Interference, color bands from film thickness and viewing angle |
| 05 Polarization | `/polar.html` | Malus's law, crossed filters, stress colors, glare at Brewster's angle |
| 06 Double slit | `/slits.html` | Interference and diffraction. Fringe spacing y ≈ λ L / d. Cover one slit and the bars become one broad glow. |

Each lesson ticket includes a folded section, **Where you'll see this**. It stays shut so the bench stays clear. Open it for two or three jobs that use the idea on that page.

## Live

Ship path is Railway. Service `web` on project light-lab serves this tree after `main` updates:

- **Railway:** https://web-production-e48f9.up.railway.app/
  - Hub: `/`
  - Aperture: `/aperture.html`
  - Lenses: `/lens.html`
  - Prism: `/prism.html`
  - Thin film: `/film.html`
  - Polarization: `/polar.html`
  - Double slit: `/slits.html`

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

## Module 05 — Polarization

One bench. A lamp shines through two filter sheets onto a card. Light is a wave. The wiggle across its path can point any way. The first sheet, the polarizer, passes only one direction. Short ticks in the beam show that: many directions before the sheet, one direction after it. The second sheet is the analyzer. Turn it. Brightness on the card follows Malus's law, I = I0 cos² θ. θ is the angle between the filters. At 90° the filters are crossed and the beam goes dark. At 180° the sheets line up again and the beam returns.

A clear plastic piece with a hole sits between the sheets. Stress around the hole twists the wiggle, and each wavelength twists a different amount. The color is a shader on the one renderer. With the polarizer vertical and the analyzer at angle θ, a local fast axis β and retardance δ give

I = I0 [ cos² θ − sin(2β) sin(2(β − θ)) sin²(π δ / λ) ].

Crossed filters (θ = 90°) leave only the stress colors. Aligned filters leave a bright field with faint fringes.

A glass pane beside the bench carries a glare streak. Near Brewster's angle that reflection is polarized sideways, so a vertical analyzer blocks it and a horizontal one lets it through. The same sideways polarization is what polarized sunglasses cut off water. One rail drives the card, the plastic, and the glare together.

The analyzer angle has a little mass: the ring eases toward the rail and can overshoot a fast twist. `prefers-reduced-motion` and `?still=1` snap the angle and hold the wiggle ticks.

HUD craft labels:

- **filter angle → brightness**
- **crossed filters → dark**

Arrows turn the analyzer. The rail runs from aligned (0°) through crossed (90°) to aligned again (180°).

## Module 06 — Double slit

One bench. A lamp shines on a card with two narrow slits, the waves spread and overlap, and a screen shows the bars. Where a crest meets a crest the screen is bright. Where a crest meets a trough it is dark. The bright-bar spacing is about y = λ L / d, with the screen 1.2 m from the slits. Closer slits (smaller d) make wider fringes. Red light has a longer wavelength than blue, so the red bars sit farther apart. Slit width changes the single-slit envelope: a wider slit narrows the glow that holds the bars.

The picture uses the same spacing and wavelength for the ripple lanes and the screen, so the bright lanes and the bright bars move together. The ripple rings themselves are drawn larger than a real wavelength so the crests can be seen. Their spacing still grows with wavelength. The readout quotes the real fringe spacing in millimeters.

Cover one slit and the second set of crests drops out. The bars disappear. A single broad glow remains. Both paths are needed for the interference bars.

The slit spacing has a little mass: the bars ease toward the rail and can overshoot a fast drag. Wavelength, width, and the shutter ease too. `prefers-reduced-motion` and `?still=1` snap the values and hold the crests.

HUD craft labels:

- **slit spacing → fringe spacing**
- **color → fringe width**

`B` both slits, `O` one slit. Arrows nudge the spacing rail when focus is not on another rail. Each rail takes the arrows while it is focused.

## How it runs

- One `WebGLRenderer` per lesson page. The hub is paper and type — no canvas. No page mounts two renderers.
- **Aperture, desktop:** occlusion-map radial blur (god rays) through `EffectComposer` on that same renderer.
- **Lenses, desktop:** a short heat-lift pass on the same renderer. Not a second context.
- **Prism, desktop:** a short spectral-lift pass on the same renderer. Not a second context.
- **Thin film, desktop:** a short wet-sheen pass on the same renderer. Not a second context. The film color is a shader on that one renderer: reflected intensity follows sin²(π δ / λ).
- **Polarization, desktop:** a short lift pass on the same renderer. Not a second context. The plastic color is the Malus-and-stress shader above. The glare streak is drawn on that same renderer and follows sin² θ, with θ measured from vertical.
- **Double slit, desktop:** a short fringe-lift pass on the same renderer. Not a second context. The screen bars are a shader on that renderer: intensity is the single-slit envelope times cos²(π δ / λ), with δ the path difference between the two slits. Covering one slit drops the cos² term.
- Narrow viewport (≤900px), a coarse pointer, or `?safe=1`: `EffectComposer` is never constructed. Aperture uses additive shaft quads. Lenses keep the ray filaments and skip the heat pass. Prism keeps the colored filaments and skips the spectral lift. The film keeps the interference shader, drops to four wavelength samples, and skips the sheen pass. Polarization keeps the filter shader, drops to four wavelength samples, skips the lift pass, and draws fewer wiggle ticks. The double slit keeps the fringe shader and the ripple sheet, and skips the lift pass. Device pixel ratio caps at 1.5.
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
- Polarization: http://127.0.0.1:8877/polar.html
- Double slit: http://127.0.0.1:8877/slits.html
- Mobile path on a desktop: add `?safe=1`
- Held motion: add `?still=1`

`?embed=1` hides the lesson frame for an iframe slide. Add `?wall=1` when the frame should stay opaque.

## Stack

- three.js `0.170.0` via a CDN import map (jsDelivr). No `vendor/` tree.
- Google Fonts: Bricolage Grotesque, Instrument Sans, Space Mono
- No backend
- Railway serves the static files with Caddy. GitHub Pages can serve the same tree.
