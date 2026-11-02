# Themes

The dashboard's default is the office: white studio light, the building as shipped, graphite cards. That path runs when no theme is selected. A theme is an optional dress on top of it. Bots, floors, usage, chat links and the ntfy hash are not part of a theme.

## Choosing one

The topic stays in the fragment (`#<topic>`, or `#<topic>&ntfy=<server>`). A theme never moves into the hash.

| Source | When it wins |
|---|---|
| `?theme=<id>` | This visit. `office` and `default` mean no theme. An unknown id is ignored and the saved choice is used instead. |
| `localStorage` key `bothq.theme` | When the query has no `theme`. The Theme menu in the top bar writes it and reloads. |
| Neither | The office, unchanged. |

`?time=` still drives the clock and beats a theme's fixed sunset. Wallpaper mode (`?mode=wallpaper`) reads the same query and the same saved choice; it has no menu.

Examples:

```text
https://cillroy.github.io/grokbot-wallpaper/web/?theme=ranch#<topic>
https://cillroy.github.io/grokbot-wallpaper/web/?mode=wallpaper&theme=ranch#<topic>
```

## Shape of a theme

`web/theme/themes.js` is the registry. The office is the absence of a theme, not an entry. To add one: a module, a `CATALOG` row, and a loader. The module is imported only when that theme is selected.

```js
{
  id: 'ranch',                  // ?theme=ranch, also <html data-theme="ranch">
  label: 'Hill Country',        // menu text, duplicated in CATALOG so the menu does not load the module
  loading: 'Setting up the ranch…',
  themeColor: '#E36A3C',        // meta theme-color, optional
  css: new URL('./ranch.css', import.meta.url).href,
  fontHref: 'https://fonts.googleapis.com/css2?family=…',   // Google Fonts is already allowed; omit to keep Inter / Nunito
  sky: { centre, radii, stops, shadow, layers? },           // same fields as STUDIO in web/scene/studio.js
  light: { night, lamps, windows, sunI, sunEl, sunAz, sunC, hemiI, hemiSky, hemiGnd, fillI, fillC, envI, exposure, shadow },
  lightPhase: 'golden',         // data-daylight while the fixed light is on
  restyle(templates) {},        // mutate office template materials once, before they are cloned
  mount({ scene }) {            // scenery. return { update(dt), dispose() } or nothing
    return { update() {} };
  },
}
```

Every field is optional. Hooks that are absent are not called.

`sky` is applied in `bootTheme`, before the studio pass is built. `light` is handed to `daylight.setLook`. With no theme, the pass keeps the `STUDIO` backdrop and the light stays noon.

`mount` should put props on **layer 1** and enable layer 1 on existing lights (leave layer 0 on). The camera is shown layer 1 only when `mount` exists. The aura silhouette is rendered with the camera masked to layer 0, so ranch props do not become one giant shadow. Do not add a ground plane large enough to cover the whole orthographic frame if the sunset backdrop should remain visible: an infinite plane fills an angled ortho view.

`restyle` sees the template roots (`floor_open`, `floor_closed`, `roof`, `elevator_shaft`, `elevator_cabin`) after the glTF materials are prepared. Tinting `material.color` on a baked lightmap multiplies it. Wall screens replace their material later, so task text is left alone. Blobs are not in the templates.

Keep a theme's geometry, textures and CSS in its own files under `web/theme/`. No copyrighted images. No new hosts: three.js stays on jsDelivr, fonts on Google Fonts, the feed on ntfy. Procedural geometry is enough, and it should stay cheap enough to sit behind a wallpaper (instancing, shared materials, no per-frame texture work).

`landing/assemble.mjs` copies `web/theme/` to `office/theme/` for the assembled site. A new file there is picked up by the existing `js|css` rule.

## Hill Country

`web/theme/ranch.js` and `ranch.css`. Limestone tint on the tower, a caliche and grass pad, cedar posts with wire, live oaks, mesquite, juniper, prickly pear, a plank barn with a rusty tin roof, a lone star, a longhorn mount and a horseshoe, a windmill and a water tank. The light is a fixed golden hour. Cards shift to saddle leather; status colours stay distinct. Fraunces is loaded only for this theme.
