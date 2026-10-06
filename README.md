# Light Lab

Interactive light and optics curriculum for intro physics, media-arts, and instructional-design course samples — by Virgil Renfroe.

Own repo. Not part of noctuary-corridor.

Eight lessons share one night stage. Module 01 cuts a beam. Module 02 bends what remains until the rays meet — or throws them apart. Module 03 splits the white beam by wavelength. Module 04 lets two reflections from a thin film interfere, so thickness and viewing angle pick the color. Module 05 keeps one wiggle of the wave: turn the analyzer and brightness follows Malus's law. Module 06 sends the beam through two slits. The waves overlap, and the screen shows bright and dark bars. Module 07 bounces the beam off a sheet you can flex. Angle in equals angle out, measured from the normal. Module 08 opens onto the sky. Short wavelengths scatter out of the beam, and a low sun turns red.

## Lessons

| | Path | What it teaches |
| --- | --- | --- |
| Hub | `/` and `/index.html` | All eight modules. Strike the crease, or press Enter, to unfold the index. |
| 01 Aperture | `/aperture.html` | Occlusion, volumetric shafts, caustic pool |
| 02 Lenses | `/lens.html` | Refraction to a focus, lens shape changing the bend |
| 03 Prism | `/prism.html` | Dispersion, a spectrum from wavelength-dependent bend |
| 04 Thin film | `/film.html` | Interference, color bands from film thickness and viewing angle |
| 05 Polarization | `/polar.html` | Malus's law, crossed filters, stress colors, glare at Brewster's angle |
| 06 Double slit | `/slits.html` | Interference and diffraction. Fringe spacing y ≈ λ L / d. Cover one slit and the bars become one broad glow. |
| 07 Mirrors | `/mirror.html` | Law of reflection, virtual and real images, concave focus, convex wide view |
| 08 Scattering | `/sky.html` | Rayleigh scattering (about 1/λ⁴), a longer path reddening the sun, Mie scattering turning haze and clouds white |

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
  - Mirrors: `/mirror.html`
  - Scattering: `/sky.html`

GitHub Pages is not the ship path right now.

Repo: https://github.com/virgilrenfroe/light-lab

The aperture exhibit used to be the site root. It now lives at `/aperture.html`. The root is the curriculum index.

## Module 01 — Aperture

One night room. Mullions occlude a beam into volumetric shafts, a lens refracts what gets through into a caustic pool, and dust in the beam is scatter.

HUD craft labels:

- **occlusion → volumetric shafts**
- **refraction → caustic pool**

On a wide screen the shafts are an occlusion-map radial blur on the one renderer. A narrow screen, a coarse pointer, or `?safe=1` skip that pass and draw additive shaft quads. `?still=1` and reduced motion hold the scene.

## Module 02 — Lenses

An optical bench. Parallel rays hit a glass lens and bend. Drag the bow: a thicker middle meets sooner. Flip to concave and the same refraction spreads the rays; the focus goes virtual, behind the glass. The center ray does not turn. A card down the bench shows the spot tighten when the focus lands on it.

HUD craft labels:

- **refraction → focus**
- **lens shape → ray bend**

`C` convex, `D` concave. Arrows nudge the bow. The rail is a slider.

On a wide screen a short heat-lift pass blooms the bright glass. A narrow screen, a coarse pointer, or `?safe=1` skip that pass and keep the ray filaments. `?still=1` holds the orbit.

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

## Module 07 — Mirrors

One night room. A brass lamp stands in front of a silver sheet, and a high window sends a bundle of parallel rays at the same sheet. Flex the sheet from convex through flat to concave. Move the lamp closer or farther.

The normal is the line straight out from the surface. At the middle of the sheet, two arcs mark the incoming angle and the outgoing angle. They match. Both are measured from the normal.

A flat sheet places a virtual image behind the glass, upright and the same size, as far back as the lamp is in front. The ghost is the same lamp, drawn as a pale edged twin, standing in the cooler room you see through the silver.

A concave sheet is a parabola, so a bundle of parallel rays meets at one focus. The lamp's own rays follow the law of reflection on that curve. Outside the focal point they meet at a real image in front of the glass, and the ghost turns upside down. Inside the focal point they spread, and the ghost is virtual, upright, and larger, behind the glass. Near the focal point the image runs too far to place.

A convex sheet spreads both the lamp rays and the parallel bundle. The ghost stays virtual, upright, and smaller. A smaller image is why a convex mirror takes in a wider view, and why a passenger-side mirror warns that objects are closer than they appear.

The curve and the lamp distance each have a little mass: the sheet eases toward the rail and can overshoot a fast drag. `prefers-reduced-motion` and `?still=1` snap both values and hold the glint.

HUD craft labels:

- **angle in → angle out**
- **curve → focus**

`F` flat, `C` concave, `V` convex. Arrows nudge the curve rail when focus is not on the lamp rail. Each rail takes the arrows while it is focused.

## Module 08 — Scattering

One porch, looking out. Sunlight holds every color. The molecules in clear air are much smaller than a wavelength, so they scatter short wavelengths far more than long ones. That is Rayleigh scattering, about 1/λ⁴. Blue near 440 nm scatters about five times more than red near 660 nm: (660/440)⁴ ≈ 5.06. The blue that leaves the beam is the blue of the sky. The direct beam has lost a little blue, so the sun is slightly warm even at noon.

The sun rail runs from high (about 74°) down to the horizon (about 2.5°). Path length uses the Kasten and Young air-mass formula. Near the horizon the path is on the order of fifteen times the noon path. Blue is scattered out of the direct beam, so the sun and the sky beside it turn orange and red. Overhead, the view still looks through a shorter path, so that sky stays blue.

The haze rail adds larger particles (haze, smoke, cloud droplets). Their optical depth is treated as flat across wavelength, which is Mie scattering. The sky washes toward white or grey, and the cloud puffs stay white, turning grey only when the veil is thick. A glass of slightly milky water sits on the rail: the side of the beam glows blue and the card at the far side goes orange. The drops are larger than air molecules, so the glass is a cousin of the sky, not a pure Rayleigh sample. The color that leaves through the side is the color missing at the end.

The sun height and the haze each have a little mass: the sky eases toward the rail and can overshoot a fast drag. `prefers-reduced-motion` and `?still=1` snap both values and hold the clouds and the motes.

HUD craft labels:

- **short wavelength → more scatter**
- **longer path → redder sun**

`N` noon, `L` low sun, `C` clear, `H` haze. Arrows nudge the sun rail when focus is not on the haze rail. Each rail takes the arrows while it is focused.

## How it runs

- One `WebGLRenderer` per lesson page. The hub is paper and type — no canvas. No page mounts two renderers.
- **Aperture, desktop:** occlusion-map radial blur (god rays) through `EffectComposer` on that same renderer.
- **Lenses, desktop:** a short heat-lift pass on the same renderer. Not a second context.
- **Prism, desktop:** a short spectral-lift pass on the same renderer. Not a second context.
- **Thin film, desktop:** a short wet-sheen pass on the same renderer. Not a second context. The film color is a shader on that one renderer: reflected intensity follows sin²(π δ / λ).
- **Polarization, desktop:** a short lift pass on the same renderer. Not a second context. The plastic color is the Malus-and-stress shader above. The glare streak is drawn on that same renderer and follows sin² θ, with θ measured from vertical.
- **Double slit, desktop:** a short fringe-lift pass on the same renderer. Not a second context. The screen bars are a shader on that renderer: intensity is the single-slit envelope times cos²(π δ / λ), with δ the path difference between the two slits. Covering one slit drops the cos² term.
- **Mirrors, desktop:** a short glint-lift pass on the same renderer. Not a second context. The sheet is one shader: a sheer silver face, a brass rim, and a highlight that follows the bend. Narrow, coarse, and `?safe=1` keep that sheet and the rays, and skip the lift pass.
- **Scattering, desktop:** a short sky-lift pass on the same renderer. Not a second context. The sky is one shader: Rayleigh color from the 1/λ⁴ transmittance, a longer path reddening the sun, and a wavelength-flat Mie veil when haze is up. The lift pass encodes the frame once. It does not run a second tone map. Narrow, coarse, and `?safe=1` keep the sky, the glass, and fewer cloud puffs, and skip the lift pass.
- Narrow viewport (≤900px), a coarse pointer, or `?safe=1`: `EffectComposer` is never constructed. Aperture uses additive shaft quads. Lenses keep the ray filaments and skip the heat pass. Prism keeps the colored filaments and skips the spectral lift. The film keeps the interference shader, drops to four wavelength samples, and skips the sheen pass. Polarization keeps the filter shader, drops to four wavelength samples, skips the lift pass, and draws fewer wiggle ticks. The double slit keeps the fringe shader and the ripple sheet, and skips the lift pass. The mirror keeps the sheet shader and fewer rays, and skips the glint pass. The sky keeps the scattering shader, drops to three cloud puffs and fewer motes, and skips the lift pass. Device pixel ratio caps at 1.5.
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
- Mirrors: http://127.0.0.1:8877/mirror.html
- Scattering: http://127.0.0.1:8877/sky.html
- Mobile path on a desktop: add `?safe=1`
- Held motion: add `?still=1`

`?embed=1` hides the lesson frame for an iframe slide. Add `?wall=1` when the frame should stay opaque.

## Stack

- three.js `0.170.0` via a CDN import map (jsDelivr). No `vendor/` tree.
- Google Fonts: Bricolage Grotesque, Instrument Sans, Space Mono
- No backend
- Railway serves the static files with Caddy. GitHub Pages can serve the same tree.
