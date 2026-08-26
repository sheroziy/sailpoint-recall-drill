# SailPoint Recall Drill — web deployment

Personal study tool. Not affiliated with SailPoint Technologies.

Deploy this folder to Vercel and you get one permanent HTTPS address you can bookmark
and open from any Mac.

## Files

```
index.html     your drill (renamed so it serves at "/")
vercel.json    response headers
README.md      this file
```

---

## Deploy — no Terminal needed

### 1. Put it on GitHub

1. Go to <https://github.com/new>.
2. Repository name: `sailpoint-recall-drill`. Set it **Private** if you prefer.
3. Tick **Add a README file**, click **Create repository**.
4. On the repo page click **Add file → Upload files**.
5. Drag in `index.html`, `vercel.json`, and `README.md`.
6. Click **Commit changes**.

### 2. Connect Vercel

1. Go to <https://vercel.com> and **Sign up with GitHub**.
2. Click **Add New… → Project**.
3. Find `sailpoint-recall-drill` and click **Import**.
4. Framework Preset: **Other**. Leave build and output settings empty — this is a
   static site, nothing to build.
5. Click **Deploy** and wait about twenty seconds.

You'll get a URL like `https://sailpoint-recall-drill.vercel.app`. HTTPS is automatic.

### 3. Lock in one stable URL

Vercel creates a fresh preview URL for every commit. **Do not bookmark those.**

Your permanent address is the **Production** domain, shown under
**Project → Settings → Domains**. It stays the same forever, and every push to your
`main` branch replaces what it serves. That is the one to bookmark on every Mac.

Optional: on that same Domains page you can add a custom domain you own, e.g.
`drill.yourname.com`.

---

## Microphone

Nothing in the app needed changing for this — it already asks only when you press
**Answer out loud**, never on page load.

What changes is the origin. You were opening `file:///Users/Admin/Downloads/...`, and
Chrome treats `file://` as an opaque origin it refuses to store permissions for — hence
the endless re-prompting. On `https://your-app.vercel.app` Chrome stores the grant
against that origin and reuses it.

So on each Mac: press **Answer out loud**, click **Allow** once, done.

- Change it later in Chrome: click the icon at the left of the address bar →
  **Site settings → Microphone**.
- macOS may also ask whether *Chrome itself* may use the mic. That's
  **System Settings → Privacy & Security → Microphone**, once per Mac.
- Keep the same URL and the permission sticks. If you bookmark a preview URL instead,
  it's a different origin and will ask again.

Safari note: Safari re-asks more often than Chrome by design, and its Web Speech
support is patchier. Use Chrome for the mic button.

Speech-to-text needs an internet connection in every browser — Chrome uploads the audio
to Google's servers to transcribe it. That's inherent to the Web Speech API, not
something the deployment introduces.

---

## Your progress will not follow you between Macs

Your scores, streak, and shaky-question weighting are stored in **localStorage**, which
is per-browser and per-device. Mac 1 and Mac 2 each keep their own separate progress,
and clearing browser data wipes it.

That is deliberate. Syncing progress across machines needs accounts and a database,
which would be a much bigger project for a single-user study tool. If you decide you
want it later, say so and we can look at it then.

---

## Updating the drill later

1. Open the repo on GitHub.
2. Click `index.html` → the pencil icon → paste your new version → **Commit changes**.

Vercel redeploys in seconds. Same URL, no rebuild, no `.app`, no Terminal. Hard-refresh
with `⌘⇧R` if you still see the old version.

---

## What was changed in your HTML

Two lines replaced and three added, in the storage functions only — 5 lines total out of
roughly 3,700. Nothing else: same questions, answers, scoring, timers, concept
checking, styling, keyboard shortcuts.

**Why it was necessary.** The app saved progress via `window.storage`, an API that only
exists inside the Claude artifact sandbox, with an in-memory variable as fallback. On a
real website `window.storage` is undefined, so every save landed in memory and vanished
on refresh — progress tracking would have been silently dead on the deployed site.

The patched version tries `window.storage` first (so it still behaves identically inside
Claude), then falls back to `localStorage`, then to memory:

```js
async function load(){
  try{const r=await window.storage.get(KEY);if(r)return JSON.parse(r.value);}catch(e){}
  try{const v=localStorage.getItem(KEY);if(v)return JSON.parse(v);}catch(e){}
  return mem;
}
async function save(d){
  mem=d;
  try{await window.storage.set(KEY,JSON.stringify(d))}catch(e){}
  try{localStorage.setItem(KEY,JSON.stringify(d))}catch(e){}
}
```
