import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Transcribes an audio clip (the isolated vocal stem) into timestamped
// lyrics using Groq's hosted Whisper. The user asked for "Gemini if needed,
// or something else" — GROQ_API_KEY is already configured on this VPS for
// the AI playlist/discover features, and Groq's Whisper endpoint is fast and
// well-suited to this, so it's reused here rather than adding a new key.
export async function POST(req: NextRequest) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "GROQ_API_KEY non configurée sur le serveur" }, { status: 501 });
  }
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Fichier audio vide" }, { status: 400 });
  }
  const contentType = req.headers.get("x-audio-type") || "audio/mpeg";
  const ext = contentType.includes("wav") ? "wav" : "mp3";

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: contentType }), `vocals.${ext}`);
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "verbose_json");

  try {
    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(55000),
    });
    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json({ error: `Groq: ${r.status} ${t.slice(0, 200)}` }, { status: 502 });
    }
    const j = (await r.json()) as {
      text?: string;
      segments?: { start: number; end: number; text: string }[];
    };
    const segments = Array.isArray(j.segments)
      ? j.segments.map((s) => ({ start: s.start, end: s.end, text: (s.text || "").trim() }))
      : [];
    return NextResponse.json({ text: j.text || "", segments });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Échec de la transcription" }, { status: 502 });
  }
}
