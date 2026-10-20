interface RawAnalysis {
  bpm: number;
  bpmConfidence: number;
  key?: {
    camelot: string;
    name: string;
  };
}

export interface AnalysisResult {
  bpm: number;
  bpmConfidence: number;
  camelot: string;
  keyName: string;
}

const queue: Array<{
  blob: Blob;
  onDone: (r: AnalysisResult | null) => void;
}> = [];
let isProcessing = false;

export function queueAnalysis(blob: Blob, onDone: (r: AnalysisResult | null) => void): void {
  queue.push({ blob, onDone });
  if (!isProcessing) {
    processQueue();
  }
}

async function processQueue(): Promise<void> {
  if (queue.length === 0) {
    isProcessing = false;
    return;
  }

  isProcessing = true;
  const { blob, onDone } = queue.shift()!;

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      body: blob,
    });

    if (!response.ok) {
      onDone(null);
      processQueue();
      return;
    }

    const data: RawAnalysis = await response.json();

    if ("error" in data) {
      onDone(null);
    } else {
      onDone({
        bpm: data.bpm,
        bpmConfidence: data.bpmConfidence,
        camelot: data.key?.camelot ?? "",
        keyName: data.key?.name ?? "",
      });
    }
  } catch {
    onDone(null);
  }

  processQueue();
}
