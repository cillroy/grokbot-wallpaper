# Grok Bot Wallpaper

Live wallpaper and dashboard for your Grok Bot bots (an independent project, not affiliated with the makers of Grok Bot): a 3D office where every bot is a glossy blob at a desk on the top floor of an endless tower,
and you see in real time who is working, who is stuck and who is waiting for you. No AI at runtime: bots append one
line per step to a journal, a tiny Node server tails it, the browser renders the office.

Work in progress.

## Your own bots (private feed)

The dashboard and the wallpaper are static pages. Bots post JSON lines to a feed you host (a Cloudflare Worker, or anything that speaks the same two routes). The browser polls that feed. The address and the keys stay in the link fragment, which GitHub Pages never receives.

### The contract

Placeholder only: `https://feed.example.workers.dev`. Use your own base URL. Two keys: a write key for the bots, a read key for the dashboard.

```sh
# a bot posts one JSON object (at most 4 KB)
curl -s -X POST -H "Authorization: Bearer <write key>" -H "Content-Type: application/json" \
  -d '{"bot":"X Writer","status":"working","step":"drafting a post"}' \
  "https://feed.example.workers.dev/post"

# the dashboard polls, oldest first. The first poll omits since.
curl -s -H "Authorization: Bearer <read key>" \
  "https://feed.example.workers.dev/feed?since=<last id>"
```

`GET /feed` returns:

```json
{"messages":[{"id":"1","time":1730000000,"event":"message","message":"{\"bot\":\"X Writer\",\"status\":\"working\",\"step\":\"drafting a post\"}"}]}
```

`time` is unix seconds. `message` is the JSON line as a string. The dashboard sends the read key only as `Authorization: Bearer`, never in the URL it requests.

### The link

```text
https://cillroy.github.io/grokbot-wallpaper/web/?theme=ranch#feed=<urlencoded base>&key=<read key>
```

`?theme=` stays in the query. `#feed` and `#key` stay in the fragment. No fragment means the page shows **not connected** (and the local demo, if the journal server is not running). A failed poll shows **feed offline** and retries every 30 seconds; a healthy poll is every 5 seconds.

### Setup

1. Put your base URL, write key, and read key into `PROMPT.md` (the placeholders), then paste that block into your Grok Bot once. It saves the posting rule, posts the roster and a look for each bot, and sets up the daily routines.
2. Open the dashboard link the bot replies with. The wallpaper uses the same fragment: `https://cillroy.github.io/grokbot-wallpaper/face/#feed=<urlencoded base>&key=<read key>`.

### The line formats

One JSON object per POST, at most 4 KB.

```json
{"bot":"X Writer","group":"X content","status":"working","step":"drafting a post"}
{"roster":["X Writer","Trends"]}
{"looks":{"X Writer":{"shape":"rounded_cube","color":"#2D84F5","accessory":"none"}}}
{"type":"usage","total_used_pct":37,"resets_at":"2026-11-01T18:00:00+02:00","bots":{"X Writer":4.1}}
{"chat":{"X Writer":"grokbot://app/v1/agent?id=<bot id>"}}
{"routines":{"bot":"X Writer","items":[{"name":"Morning thread","schedule":"daily 09:00","next_run":"2026-11-02T09:00:00+02:00"}]}}
```

- **status**, posted on every status change of any bot. `bot` is the exact name, `status` is one of `working`, `idle`, `waiting_user`, `error`, `done`, `step` is what the bot does, at most 80 characters. `group` (optional) is a floor label. The usual way to set floors is the `groups` message below: each value is one floor, used exactly as written (a sidebar section such as `Personal` or `Home IT`). A bot with no label is on the `Unassigned` floor.
- **groups**: `{"groups":{"Bot A":"Personal","Bot B":"Home IT"}}`. One floor per label. Names are not translated or matched to a fixed team list.
- **roster**: the exact names of all your bots. Quiet bots show up idle. After the first roster message, the dashboard draws only names on the latest roster — status lines from anyone else are ignored. Re-posted every morning.
- **looks**: one look per bot. `shape` is one of `sphere`, `rounded_cube`, `pill`, `triangle`, `cone`, `pentagon`, `hexagon`, `star4`, `star6`, `clover`, `rounded_square`, `trio`. `accessory` is one of `none`, `glasses`, `stem`, `antenna`, `bow`. `color` is `#RRGGBB`. Details in `docs/AVATARS.md`. Re-posted every morning.
- **usage**: total used in percent, when it resets, and per bot. Fields the bot does not know are left out. Posted every 2 hours.

### Privacy

- The read key is the password for the dashboard. Anyone who has the link can read statuses and, if they also have the write key, post lines. Do not share either key. Both keys belong in the fragment or in the bot's own memory, not in a query string.
- Your feed host can read every line. Keep secrets and personal data out of `step`.
- The dashboard caches the last lines in this browser. Clear the site data to remove them.
- To rotate a key, issue a new one on the feed and update the link and the bots.

### Themes

The office is the default. Nothing in the scene or the cards changes until a theme is selected, and the feed link stays in the hash.

- **This visit:** put `?theme=ranch` in front of the hash. `?theme=office` (or `default`) forces the office.
  `https://cillroy.github.io/grokbot-wallpaper/web/?theme=ranch#feed=<urlencoded base>&key=<read key>`
- **Remembered:** the Theme menu on the right of the top bar (Office or Texas Hill Country) saves the choice in this browser under `bothq.theme`. A link with `?theme=` wins for that visit; with no query, the saved choice is used. An unknown id is ignored.
- The same query works on the wallpaper: `?mode=wallpaper&theme=ranch#feed=<urlencoded base>&key=<read key>`. A choice saved on the dashboard applies to the wallpaper on the same origin.

Texas Hill Country is a Central Texas ranch around the tower: limestone and cedar, live oak and mesquite, a tin-roof barn, sunset light. Bots, floors, usage and chat links are unchanged. How a theme is shaped, and how to add one: `docs/THEMES.md`.

Each floor can also wear its own interior. The Theme menu has a select per floor (saved in this browser). A feed message can set them too, and the saved choice wins:

```json
{"floor_themes":{"Ranch":"office","Home IT":"casita"}}
```

With no saved choice and no feed key, the floor name is matched against a short keyword list (case-insensitive): `Ranch` is a bunkhouse, `Home IT` a casita, `Personal` a bunkhouse, `Work` a plain office, a name containing `studio` an arcade, a name containing `taste` or `media` a studio, `Security` a vault. `Unassigned`, and any name that matches nothing, follow the building theme. The list lives in one table, `web/theme/floor-theme-rules.js`. Details: `docs/THEMES.md`.

### Troubleshooting

```sh
curl -s -H "Authorization: Bearer <read key>" "https://feed.example.workers.dev/feed"
```

1. The page says **not connected**: the link has no `#feed=` and `#key=`, or the base URL is not `https` (localhost may be `http`).
2. The page says **feed offline**: the feed did not answer, or the read key was rejected. The page retries every 30 seconds.
3. Lines appear in `GET /feed` but the office is empty: the `message` field is not a JSON object the office understands (those lines are skipped).

## Run

```sh
./start.sh            # Node 24, no dependencies; prints the URL and a generated password on first start
./stop.sh
```

Each bot appends a line to `data/events.jsonl` (format: `docs/CONTRACT.md`, section 1):

```json
{"t":"2026-11-01T12:00:00+02:00","bot":"X Writer","group":"X-контент","status":"working","step":"пишу драфт поста","task":"Тред про AI-агентов"}
```

As a desktop wallpaper (Lively, Windows): `docs/WALLPAPER.md`; the Grok Bot wallpaper in one click: `lively/README.md`. Server details: `README-server.md`. Your own logo on the tower: `assets/brand/logo.png` (white on transparent).

## Credits

- Earth imagery: NASA Earth Observatory (Blue Marble, Black Marble), public domain.
- Furniture models used in the office build: Kenney Furniture Kit, CC0.
