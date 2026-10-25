import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { analyzeAudio, convertToWav } from '@/lib/serverAnalyze';
import { tmpdir } from 'node:os';
import { mkdir, mkdtemp, writeFile, readFile, unlink, rm } from 'node:fs/promises';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.arrayBuffer();
  if (!body.byteLength) return NextResponse.json({ error: 'Empty body' }, { status: 400 });
  if (body.byteLength > 200 * 1024 * 1024) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });

  const hash = createHash('sha1').update(Buffer.from(body)).digest('hex').slice(0, 16);
  const cacheDir = join(process.cwd(), '.analysis-cache');
  const cachePath = join(cacheDir, `${hash}.json`);

  let tempDir: string | null = null;
  try {
    await mkdir(cacheDir, { recursive: true });
    const cached = await readFile(cachePath, 'utf-8').catch(() => null);
    if (cached) return NextResponse.json({ ...JSON.parse(cached), hash });

    tempDir = await mkdtemp(join(tmpdir(), 'audio-'));
    const inputPath = join(tempDir, 'input');
    const wavPath = join(tempDir, 'output.wav');

    await writeFile(inputPath, Buffer.from(body));
    await convertToWav(inputPath, wavPath);

    const result = await analyzeAudio(wavPath);
    if (!result || result.error) return NextResponse.json({ error: result?.error || 'Analysis failed' }, { status: 500 });

    await writeFile(cachePath, JSON.stringify(result));
    return NextResponse.json({ ...result, hash });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
