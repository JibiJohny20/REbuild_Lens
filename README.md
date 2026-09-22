# Structure AR

A browser-based WebAR app for visualizing construction components (door,
window, beam, slab, wooden plank, brick) in the real world. No app install,
no APK, no Unity — it's a static website that runs in a mobile browser using
WebXR.

```
Website opens → Start AR → camera permission → surface detection →
select a component → tap the surface → model appears in AR → interact with it
```

A non-AR **3D Preview** mode (orbit/zoom/pan with mouse or touch) is included
so you can build and test everything on a laptop before ever opening the
site on a phone.

---

## 1. Add your GLB files

Drop your six exported models into `assets/models/`, using exactly these
filenames (referenced from `js/config.js`):

```
assets/models/door.glb
assets/models/window.glb
assets/models/beam.glb
assets/models/slab.glb
assets/models/woodenplank.glb
assets/models/brick.glb
```

That's the only required step before running the project — everything else
is already wired up.

### If a model looks huge, tiny, or offset

Different tools export GLB files at different real-world scales. Open
`js/config.js` and adjust the relevant model's `scale` (and `yOffset` if its
origin isn't at its base):

```js
beam: {
  name: "Beam",
  path: "assets/models/beam.glb",
  scale: 0.5,     // ← try smaller/larger values until it looks right
  yOffset: 0,
},
```

No other file needs to change — every part of the app reads model info from
this one config object.

---

## 2. Run it locally

This is a static site with no build step, but it must be served over HTTP
(not opened as a `file://` path) for ES module imports to work. Any of these
work:

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .

# VS Code
# Right-click index.html → "Open with Live Server"
```

Then open `http://localhost:8080` in a desktop browser.

## 3. Test the 3D Preview (do this first, on your laptop)

1. Open the site locally.
2. Tap/click **3D Preview**.
3. Orbit with your mouse (or one finger on a touchscreen laptop), zoom with
   the scroll wheel or pinch.
4. Pick a component from the bottom toolbar, then click on the ground grid
   to place it.
5. Click a placed object to select it, then use the panel buttons (Move,
   Rotate, Scale +/−, Duplicate, Reset, Delete) or drag it directly.

If this all works, your GLB paths and scale values are correct and you're
ready to test real AR.

## 4. Test WebAR on a phone

WebXR `immersive-ar` requires:

- **A secure context (HTTPS)** — `localhost` counts as secure for testing,
  but a real phone needs an HTTPS deployment (see step 5) unless it's on
  the same network and you use a tool like `ngrok` to tunnel HTTPS to your
  local server.
- **A supporting browser.** As of this writing:
  - **Android:** Chrome (recent versions) supports WebXR AR out of the box.
    Other Chromium-based browsers (Edge, Samsung Internet) generally work
    too. Firefox for Android does not currently support `immersive-ar`.
  - **iPhone/iPad:** Safari does not support WebXR `immersive-ar` at the
    time of writing. If you need iOS AR from a plain browser tab, that is
    currently outside what WebXR can do on iOS — the site will correctly
    detect this and fall back to the **3D Preview** offer instead of
    showing a broken screen.
  - Support changes over time — the app always feature-detects with
    `navigator.xr.isSessionSupported('immersive-ar')` rather than assuming,
    so it never shows AR controls on a device that can't actually run them.

Once you have an HTTPS URL open on a supported Android phone:

1. Tap **Start AR**.
2. Allow the camera permission prompt.
3. Move your phone slowly — a ring reticle appears once a surface is found.
4. Pick a component from the bottom toolbar.
5. Tap the surface where the reticle is showing.
6. The model appears there. Repeat for as many components as you like.
7. Tap a placed model to select it, then use the on-screen panel or touch
   gestures (one finger = move, two fingers = rotate, pinch = scale).

If AR isn't supported, the site shows "AR is not supported on this
device/browser" with a button straight into 3D Preview — never a blank or
broken screen.

---

## 5. Deploy (pick one)

All three are static-hosting targets — no server code, no environment
variables, no API keys needed.

### GitHub Pages

1. Push this project to a GitHub repository.
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, branch `main`, folder `/ (root)`.
3. Save. Your site will be live at
   `https://<your-username>.github.io/<repo-name>/` within a minute or two.
   GitHub Pages serves everything over HTTPS automatically.

### Vercel

1. Install the CLI (`npm i -g vercel`) or connect the repo at
   [vercel.com](https://vercel.com).
2. From the project folder: `vercel` (then `vercel --prod` to promote).
   No build settings are needed — it's a static site.
3. Vercel gives you an HTTPS URL like `https://your-project.vercel.app`.

### Netlify

1. Drag-and-drop the project folder onto
   [app.netlify.com/drop](https://app.netlify.com/drop), **or** connect the
   GitHub repo at [netlify.com](https://netlify.com) with build command
   left blank and publish directory set to `/`.
2. Netlify gives you an HTTPS URL like `https://your-project.netlify.app`.

Whichever host you use, **the deployed URL is the one to open on your
phone** — WebXR AR will refuse to start on plain HTTP.

---

## 6. Create a QR code

Once deployed, generate a QR code pointing at your HTTPS URL using any QR
generator (e.g. the built-in one at
[qr-code-generator.com](https://www.qr-code-generator.com/), or
`qrencode` on the command line). This project doesn't include a QR
scanner — it doesn't need one. The flow is simply:

```
QR code → phone camera app → opens the HTTPS URL → Start AR → WebAR
```

Anything that generates a QR code encoding your deployed URL will work.

---

## Project structure

```
structure-ar/
├── index.html              Landing / help / AR+Preview UI shell
├── README.md
├── css/
│   └── style.css           All styling (mobile-first, blueprint theme)
├── js/
│   ├── config.js            Model registry — paths, names, scale correction
│   ├── model-manager.js     GLTFLoader wrapper: caching, cloning, disposal
│   ├── interaction-manager.js  Placed-object registry, selection, gestures
│   ├── ar.js                 WebXR session, hit-test, reticle
│   ├── ui.js                 DOM references, screen/mode switching, panels
│   └── main.js               Wires everything together, mode transitions
├── assets/
│   ├── models/               ← put your 6 GLB files here
│   └── icons/
└── screenshots/
```

## How the code is organized

- **`config.js`** is the single source of truth for model data. Nothing
  else hard-codes a `.glb` path or a scale number.
- **`model-manager.js`** only knows how to load/cache/dispose GLTF models.
  It has no idea what AR or the UI are doing.
- **`interaction-manager.js`** owns every placed object and all
  select/move/rotate/scale/duplicate/delete/reset logic, plus the shared
  pointer-gesture handling (drag to move, two-finger to rotate, pinch to
  scale). It's used identically by both AR mode and Preview mode.
- **`ar.js`** only knows about WebXR: requesting the session, hit-testing,
  and the reticle. It has no UI or object-placement logic of its own.
- **`ui.js`** only touches the DOM: showing/hiding screens, building the
  toolbar from `config.js`, and updating the selection panel.
- **`main.js`** is the only file that knows about all of the above — it
  creates the Three.js scene/renderer once and wires the managers together,
  and handles switching between landing / AR / preview.

## Notes on WebXR support detection

The app never assumes AR is available. Both the landing screen and the
"Start AR" button call `navigator.xr.isSessionSupported('immersive-ar')`
before doing anything else, and only request a session if that resolves
`true`. If it's `false` (or `navigator.xr` doesn't exist at all — e.g. on
desktop or unsupported browsers), the app shows the "AR is not supported on
this device/browser" message with a direct path into 3D Preview, and the
normal website keeps working normally either way.
