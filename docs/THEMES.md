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

`web/theme/ranch.js` and `ranch.css`. Limestone tint on the tower shell, a caliche and grass pad, cedar posts with wire, live oaks, mesquite, juniper, prickly pear, a plank barn with a rusty tin roof, a lone star, a longhorn mount and a horseshoe, a windmill, a water tank, and a Texas flag on a pole (blue hoist with a white star, white over red, 2:3). The light is a fixed golden hour. Cards shift to saddle leather; status colours stay distinct. Fraunces is loaded only for this theme. The open floors are not tinted here: that is an interior theme, so a floor can stay a plain office inside a ranch exterior.

## Floor interiors

The exterior (sky, light, ground, scenery, and the closed shell of the tower) is still the one theme above. Each floor can dress its own interior: floor and wall tint, furniture colour, a few procedural props, the glass band of that floor when it is closed, and an accent on that floor's button and team card.

Floors with no setting follow the exterior. Unknown team names do the same, so a ranch exterior still tints every unnamed floor and today's look is unchanged. A known team name picks an interior even when the exterior is the office.

### Default map

This table is `DEFAULT_FLOOR_THEMES` in `web/theme/interiors.js`. Match is case-insensitive on the floor name (the team name from the feed).

| Floor name | Interior | What you see |
|---|---|---|
| Design | `coffee` | Coffee bar: chalk menu, espresso machine, cups, warm wood |
| Dev | `arcade` | Arcade: two neon cabinets, pixel screens, a joystick |
| Content | `studio` | Studio: ring light, camera, mic, posters |
| Privacy | `vault` | Vault: safe door, filing cabinets, shredder, dim metals |
| Home | `casita` | Build site: sawhorses, lumber, blueprint, hard hats |
| Ops | `ranch` | Bunkhouse: saddle, lasso, wanted poster, a small Texas flag on the wall |

### What wins

For each floor, first hit wins:

1. **This browser**, `localStorage` key `bothq.floorThemes`, a map of floor name → interior id. The Theme menu writes it. `office` forces the plain interior. An empty value (Auto) removes the key.
2. **The feed**, a message `{"floor_themes":{"Ops":"ranch"}}`. Keys merge across messages; `"auto"` or `""` clears one key. A saved choice for that floor wins over the feed. The topic stays in the hash. See `docs/CONTRACT.md`.
3. **The default map** above.
4. **The exterior theme**, when its id is also an interior (`ranch`).
5. **The plain office.**

An unknown id is ignored and the next step runs.

The menu is the Theme button in the top bar: Building reloads the page (the sky and the shell change), each floor's select does not. Wallpaper mode has no menu; it still applies the saved choices, the feed, and the default map.

Adding an interior is a module under `web/theme/interiors/` plus a row in `interiors.js`. It exports `{ id, label, accent, ink, glass, tint, createProps }`. `tint` is `{ floor, wall, wood, metal, fabric, glass }` and recolors that floor's own materials. `createProps()` returns a cloneable group parked at the back-right of the room, clear of the desks and the left-wall screens. Props stay on layer 0. Do not add lights or per-frame work.
