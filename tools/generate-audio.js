#!/usr/bin/env node
/**
 * generate-audio.js — pre-generate one ElevenLabs MP3 per question.
 *
 * Run this ONCE on your Mac. Your API key stays in an environment variable
 * here and never goes into the repo, the HTML, or the browser.
 *
 *   cd ~/Downloads/sailpoint-drill-deploy
 *   export ELEVENLABS_API_KEY="sk_..."
 *   export ELEVENLABS_VOICE_ID="21m00Tcm4TlvDq8ikWAM"
 *   export ELEVENLABS_MODEL="eleven_v3"        # match what you used on the website
 *   node tools/generate-audio.js --dry-run     # cost estimate, generates nothing
 *   node tools/generate-audio.js --only 1,2,3  # try a few before spending on all 85
 *   node tools/generate-audio.js               # generate the rest
 *   node tools/generate-audio.js --force       # regenerate everything
 *
 * Optional tuning:
 *   ELEVENLABS_SPEED      0.7-1.2, default 1.0. Lower = slower delivery.
 *                         NOT supported by eleven_v3 - it is ignored there.
 *   ELEVENLABS_STABILITY  0-1, default 0.5. For v3 use 0.0, 0.5 or 1.0
 *                         (Creative / Natural / Robust).
 *
 * Writes audio/q<n>.mp3 plus audio/manifest.json, which is how the app knows
 * which questions have a recording. Files that already exist are SKIPPED, so
 * re-running never spends credits twice and a failed run is resumable.
 *
 * Needs Node 18+ (for built-in fetch). No npm install, no dependencies.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'audio');

const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID;
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const DRY = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const SPEED = parseFloat(process.env.ELEVENLABS_SPEED || '1');
const STABILITY = parseFloat(process.env.ELEVENLABS_STABILITY || '0.5');
const IS_V3 = /v3/.test(MODEL);
const onlyArg = process.argv[process.argv.indexOf('--only') + 1];
const ONLY = process.argv.includes('--only') && onlyArg
  ? new Set(onlyArg.split(',').map(x => parseInt(x.trim(), 10)).filter(Boolean))
  : null;

function die(msg) { console.error('\n  ' + msg + '\n'); process.exit(1); }

/* The questions live in index.html - single source of truth, so the audio
   can never drift from what the app actually asks. */
function loadQuestions() {
  if (!fs.existsSync(HTML)) die('index.html not found at ' + HTML);
  const html = fs.readFileSync(HTML, 'utf8');
  const i = html.indexOf('const QA = ');
  if (i < 0) die('could not find the question bank in index.html');
  const json = html.slice(i + 'const QA = '.length);
  const end = json.indexOf(';\n');
  try { return JSON.parse(json.slice(0, end)); }
  catch (e) { die('could not parse the question bank: ' + e.message); }
}

async function tts(text) {
  const url = 'https://api.elevenlabs.io/v1/text-to-speech/' + VOICE;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      // v3 rejects/ignores speed and speaker boost, so send only what it supports
      voice_settings: IS_V3
        ? { stability: STABILITY, similarity_boost: 0.75 }
        : { stability: STABILITY, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: SPEED }
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('HTTP ' + res.status + ' ' + body.slice(0, 200));
  }
  return Buffer.from(await res.arrayBuffer());
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const QA = loadQuestions();
  fs.mkdirSync(OUT, { recursive: true });

  let todo = QA.filter(q => FORCE || !fs.existsSync(path.join(OUT, 'q' + q.n + '.mp3')));
  if (ONLY) todo = QA.filter(q => ONLY.has(q.n));      // --only overrides the skip logic
  const chars = todo.reduce((a, q) => a + q.q.length, 0);
  const have = QA.length - todo.length;

  console.log('\n  questions in bank : ' + QA.length);
  console.log('  already recorded  : ' + have + (have && !FORCE ? '  (skipped)' : ''));
  console.log('  to generate       : ' + todo.length);
  console.log('  characters        : ' + chars.toLocaleString() + '  (~1 credit each)');
  console.log('  model             : ' + MODEL + (IS_V3 ? '   (speed setting not supported by v3)' : ''));
  console.log('  stability         : ' + STABILITY);
  if (!IS_V3) console.log('  speed             : ' + SPEED);
  if (ONLY) console.log('  --only            : ' + [...ONLY].join(', '));

  if (DRY) { console.log('\n  --dry-run: nothing generated.\n'); return; }
  if (!KEY) die('ELEVENLABS_API_KEY is not set.');
  if (!VOICE) die('ELEVENLABS_VOICE_ID is not set. Pick a voice in the ElevenLabs\n  ' +
                  'Voice Library, open it, and copy its Voice ID.');
  if (!todo.length) { console.log('\n  Nothing to do - every question already has audio.\n'); writeManifest(QA); return; }

  console.log('');
  let ok = 0; const failed = [];
  for (const q of todo) {
    const file = path.join(OUT, 'q' + q.n + '.mp3');
    process.stdout.write('  q' + String(q.n).padEnd(3) + ' ' + q.q.slice(0, 52).padEnd(54));
    try {
      const buf = await tts(q.q);
      fs.writeFileSync(file, buf);
      ok++;
      console.log((buf.length / 1024).toFixed(0) + ' KB');
    } catch (e) {
      failed.push([q.n, e.message]);
      console.log('FAILED  ' + e.message.slice(0, 60));
    }
    await sleep(350);                      // stay well inside rate limits
  }

  writeManifest(QA);
  const total = fs.readdirSync(OUT).filter(f => f.endsWith('.mp3'))
    .reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);

  console.log('\n  generated : ' + ok);
  console.log('  failed    : ' + failed.length);
  failed.forEach(([n, m]) => console.log('    q' + n + ': ' + m.slice(0, 70)));
  console.log('  audio dir : ' + (total / 1024 / 1024).toFixed(1) + ' MB total');
  console.log('\n  Next: commit the audio/ folder and push. Re-run this script any time -\n' +
              '  it only generates what is missing.\n');
})();

function writeManifest(QA) {
  const have = QA.filter(q => fs.existsSync(path.join(OUT, 'q' + q.n + '.mp3'))).map(q => q.n);
  fs.writeFileSync(path.join(OUT, 'manifest.json'),
    JSON.stringify({ generated: new Date().toISOString(), voice: VOICE || null, model: MODEL, questions: have }, null, 1));
  console.log('  manifest  : ' + have.length + ' questions listed');
}
