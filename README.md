# DeskThing StreamDeck

A Stream Deck-style button grid for [DeskThing](https://github.com/ItsRiprod/DeskThing) (Car Thing). Tap buttons on the device to fire hotkeys, launch apps, control media, run scripts and more on your PC. Windows only for now.

## Develop / build

```sh
npm install
npm run dev               # DeskThing CLI dev mode (emulator + Vite)
npm run dev:configurator  # hot-reload configurator UI on :5174 (proxies /api to a running app on :8899)
npm run typecheck         # client + server + configurator type checks
npm run build             # -> dist/deskthing-streamdeck-v<version>.zip
```

Install the zip from the DeskThing Server app (Downloads → upload app).

## Configuring buttons

While the app is running in DeskThing, open **http://localhost:8899/** on your PC (or tap ⚙ on the device to open it there). You can:

- click **+** to add a button, click a button to edit it, and drag to move or swap
- set a label, emoji or uploaded image, colors, and the action, with **Test on PC** to try it
- record hotkeys by pressing them (type Windows-key combos like `WIN+L` instead)
- add, rename, reorder and delete pages, and change the grid size (default 4×2)
- import or export profiles as JSON
- **Save to device** (Ctrl+S) to validate the profile, store it, and update the Car Thing immediately

The port can be changed in the app's DeskThing settings. The configurator only listens on 127.0.0.1 and rejects cross-origin / foreign-host requests, so websites can't edit your buttons.

## Device controls

| Control | Does |
|---|---|
| Tap button | Run its action (white flash = ok, red = failed + error shown at bottom) |
| Dial | Previous / next page |
| Top buttons 1–4 | Jump to page 1–4 |
| Back | Left to DeskThing (exit app) |
| ⚙ (bottom right) | Open the configurator in the PC's browser |

## Layout

- `shared/types.ts`: profile/button/action types and client↔server messages
- `server/deck.ts`: navigation (pages + folder stack), on/off state, multi-actions, press handling
- `server/actions.ts`: executors for basic PC actions (keys, launch, URL, command, text)
- `server/obs.ts`: obs-websocket v5 client with live state + auto-reconnect
- `server/audioState.ts`: default mic/speaker mute state (Core Audio via the helper), polled while displayed
- `server/store.ts`: profile + settings persistence
- `server/win/input.ts`: persistent PowerShell helper (Win32 `SendInput`, `LockWorkStation`, Core Audio mute). No native Node modules, because the CLI bundles the server into one file
- `server/defaultProfile.ts`: default 4×2 layout used until a profile is saved
- `shared/validate.ts`: strict profile validation (server-side, on every save)
- `server/configServer.ts`: localhost HTTP server for the configurator + API
- `configurator/`: configurator React app, built to one HTML file and embedded in the server bundle (`server/generated/`, created at build time)
- `src/App.tsx`: the device UI; `src/components/ButtonFace.tsx` is shared with the configurator preview

### Action types

| type | params | example |
|---|---|---|
| `hotkey` | `keys: string[]` | `["CTRL","SHIFT","ESC"]`, `["WIN","L"]`, `["ALT","F4"]` |
| `media` | `key` | `playpause`, `next`, `previous`, `stop`, `volumeup`, `volumedown`, `mute` |
| `launch` | `path`, `args?` | `calc.exe`, `C:\Games\foo.lnk`, `D:\Projects` |
| `url` | `url` | `https://…`, `steam://…`, `spotify:` |
| `command` | `command`, `shell?` (`powershell`/`cmd`) | `Stop-Process -Name foo` |
| `text` | `text` | types the text into the focused window |
| `page` | `target` | `next`, `previous`, or a page index |
| `folder` | `folderId` | opens a folder (hidden page); new folders get a Back button |
| `back` | | leaves the current folder |
| `obs` | `op` (+ `scene` / `input`) | `scene`, `record`, `stream`, `virtualcam`, `mute` (live state) |
| `audio` | `device`, `op` | `mic` / `speakers` × `toggle` / `mute` / `unmute` (live state) |
| `multi` | `steps` | up to 20 steps of any action above, plus `{ "type": "delay", "ms": 500 }` |

### Two-state buttons

A button can have an `onState` (label / icon / image / colors) shown while it's "on":

- **OBS and audio buttons** follow the real state: recording/streaming/virtual cam active, scene live, input or device muted. That includes changes made outside the deck.
- **Any other button** becomes a manual toggle that flips on each press. `onState.action` can run a different action while on.
- An "on" button with no custom look shows a red dot.

### OBS

In OBS 28+: **Tools → WebSocket Server Settings → Enable WebSocket server**. Then in the configurator open **⚙ Settings**, tick *Connect to OBS*, and enter the port/password from OBS's "Show Connect Info". The status badge in the header shows whether it's connected. The deck reconnects automatically when OBS starts.

### Page templates

**+ From template…** next to "+ Page" adds a copy of a built-in page (Media, Tools, OBS) to your layout, including any folder it uses, fitted to your grid size. Use it to get pages that were added in a newer version without resetting your own layout.

The built-in **OBS** page uses OBS's default names (`Mic/Aux`, `Desktop Audio`, scene `Scene`). Rename them to match your setup.

### Folders and navigation

Folders are pages that aren't in the dial rotation. A button with **Open folder** shows one, and **Back** returns. Turning the dial or pressing a top button inside a folder leaves it.

## Roadmap

- [x] **0. Scaffold:** DeskThing 0.11 template, TS checks, packaging
- [x] **1. MVP:** 4×2 grid, hotkey / launch / URL / command / media / text actions, press feedback
- [x] **2. Pages:** multiple pages, dial and top-button navigation (folders still to do)
- [x] **3. Configurator:** localhost web UI to edit profiles (drag-and-drop, image/emoji icons, action forms, test button), live push to device, grid size, import/export
- [x] **4. Rich actions:** multi-action sequences, toggle / live-state buttons, OBS (obs-websocket v5), mic/speaker mute with live state, folders
- [ ] **5. Polish:** multiple profiles, auto profile switching by focused app, dial encoder actions, live buttons (clock, CPU, now playing)
