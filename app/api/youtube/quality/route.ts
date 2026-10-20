import { spawn } from "child_process";
import { qualityFromKbps } from "@/lib/quality";

const cache = new Map<string, { value: object; at: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) {
    return new Response(JSON.stringify({ error: "id invalide" }), { status: 400 });
  }

  const cached = cache.get(id);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return new Response(JSON.stringify(cached.value), { status: 200 });
  }

  try {
    const ytDlpPath = process.env.YT_DLP_PATH ?? "yt-dlp";
    const args = ["-j", "--no-playlist", "--no-warnings", "-f", "bestaudio", `https://www.youtube.com/watch?v=${id}`];

    const ytDlp = spawn(ytDlpPath, args, { shell: false });
    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      ytDlp.kill();
    }, 25000);

    await new Promise<void>((resolve, reject) => {
      ytDlp.stdout.on("data", (chunk) => (stdout += chunk));
      ytDlp.stderr.on("data", (chunk) => (stderr += chunk));

      ytDlp.on("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(stderr.trim().substring(0, 200)));
        } else {
          resolve();
        }
      });

      ytDlp.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    const data = JSON.parse(stdout);
    const abr = data.abr ? Number(data.abr) : undefined;
    const quality = abr ? qualityFromKbps(abr) : undefined;

    const responseData = {
      abr: data.abr ?? null,
      codec: data.acodec ?? null,
      sampleRate: data.asr ?? null,
      quality: quality ?? null
    };

    cache.set(id, { value: responseData, at: Date.now() });
    return new Response(JSON.stringify(responseData), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erreur inconnue" }), { status: 502 });
  }
}
