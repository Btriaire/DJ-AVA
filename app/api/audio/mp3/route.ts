import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { ffmpegPath } from "@/lib/stems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.arrayBuffer();
  if (!body.byteLength) {
    return NextResponse.json({ error: "empty body" }, { status: 400 });
  }
  if (body.byteLength > 400 * 1024 * 1024) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  return new Promise<NextResponse>((resolve) => {
    const ffmpeg = spawn(ffmpegPath(), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "wav",
      "-i",
      "pipe:0",
      "-codec:a",
      "libmp3lame",
      "-q:a",
      "0",
      "-f",
      "mp3",
      "pipe:1",
    ]);

    const chunks: Uint8Array[] = [];
    let stderr = "";

    ffmpeg.stdin.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code !== "EPIPE") console.error("Stdin error:", err);
    });
    ffmpeg.stdin.end(Buffer.from(body));

    ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
    ffmpeg.stderr.on("data", (data) => (stderr += data.toString()));

    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        resolve(
          NextResponse.json(
            { error: stderr.slice(-200) || "Unknown ffmpeg error" },
            { status: 500 }
          )
        );
      } else {
        const mp3 = new Uint8Array(
          chunks.reduce((acc, chunk) => {
            const newAcc = new Uint8Array(acc.length + chunk.length);
            newAcc.set(acc, 0);
            newAcc.set(chunk, acc.length);
            return newAcc;
          }, new Uint8Array(0))
        );
        resolve(
          new NextResponse(mp3, {
            headers: { "Content-Type": "audio/mpeg" },
          })
        );
      }
    });
  });
}
