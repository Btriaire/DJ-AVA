import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The DJ voice of Radio-AVA: an English voice made on the MaRuche server (VoiceStudio / OmniVoice, reached over ssh).
// The voice is a *designed* one (male, young adult, low pitch, American accent), rendered once as a reference clip
// and kept as a clone profile, so every line comes out with the same timbre. No real person is imitated.
// A line takes a minute or more on the server's CPU: lines are made ahead of time, cached on disk, played from there.

const VPS = "root@46.202.131.240";
const SSH = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=30", VPS];
const PROFILE = "Radio-AVA DJ";
const REF_TEXT = "Hey, you are listening to Radio AVA. Stay tuned, the music keeps going.";
const REF_INSTRUCT = "male, young adult, low pitch, american accent";
const DIR = join(process.cwd(), ".voice-cache");

function ssh(remote: string, input?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn("ssh", [...SSH, remote], { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (d: Buffer) => out.push(d));
    p.stderr.on("data", (d: Buffer) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(err.slice(0, 200) || `ssh ${code}`))));
    p.stdin.end(input ?? "");
  });
}

let profileId: string | null = null;
async function ensureProfile(): Promise<string> {
  if (profileId) return profileId;
  const list = JSON.parse((await ssh("curl -sf -m 20 localhost:3901/profiles")).toString()) as { id: string; name: string }[];
  const found = list.find((p) => p.name === PROFILE);
  if (found && /^[\w-]+$/.test(found.id)) return (profileId = found.id);
  // first time: render the reference clip, then keep it as a clone profile
  const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  const created = await ssh(
    `set -e; f=$(mktemp /tmp/dj_ref_XXXX.wav); curl -sf -m 900 -X POST localhost:3901/generate -F ${q(`text=${REF_TEXT}`)} -F language=English -F ${q(`instruct=${REF_INSTRUCT}`)} -F seed=7 -F num_step=16 -o "$f"; ` +
      `curl -sf -m 60 -X POST localhost:3901/profiles -F ${q(`name=${PROFILE}`)} -F kind=clone -F language=English -F ${q(`ref_text=${REF_TEXT}`)} -F "ref_audio=@$f;type=audio/wav"; rm -f "$f"`
  );
  const id = (JSON.parse(created.toString()) as { id?: string }).id;
  if (!id || !/^[\w-]+$/.test(id)) throw new Error("profile creation failed");
  return (profileId = id);
}

export const cleanLine = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 200);
const fileFor = (text: string) => join(DIR, `${createHash("sha1").update(`${PROFILE}|${text}`).digest("hex").slice(0, 20)}.wav`);

export function cachedLine(text: string): Buffer | null {
  const f = fileFor(cleanLine(text));
  return existsSync(f) ? readFileSync(f) : null;
}

// one line at a time: the server has a single voice model and a slow CPU
let chain: Promise<unknown> = Promise.resolve();
const inflight = new Map<string, Promise<Buffer>>();

export function synthesizeLine(raw: string): Promise<Buffer> {
  const text = cleanLine(raw);
  const hit = cachedLine(text);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(text);
  if (running) return running;
  const job = chain
    .catch(() => undefined)
    .then(async () => {
      const id = await ensureProfile();
      // steps and guidance are lowered: about 60 s a short line instead of 140 s, and still clean for speech
      const wav = await ssh(
        `curl -sf -m 900 -X POST localhost:3901/generate -F "text=<-" -F language=English -F profile_id=${id} -F num_step=10 -F guidance_scale=1.5 -o -`,
        text
      );
      if (wav.length < 2000 || wav.subarray(0, 4).toString() !== "RIFF") throw new Error("no audio");
      mkdirSync(DIR, { recursive: true });
      const f = fileFor(text);
      writeFileSync(`${f}.part`, wav);
      renameSync(`${f}.part`, f);
      return wav;
    })
    .finally(() => inflight.delete(text));
  chain = job;
  inflight.set(text, job);
  return job;
}
