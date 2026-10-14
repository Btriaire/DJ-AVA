import { useEffect, useMemo, useRef, useState } from "react";

type SSScreenProps = {
  buffer: AudioBuffer | null;
  name: string;
  start: number;
  end: number;
  loop: boolean;
  rootNote: number;
  pitch: number;
  bpm: number;
  volume: number;
  analyser: AnalyserNode;
  mode: "wave" | "spectrum" | "scope";
  onModeChange: (m: "wave" | "spectrum" | "scope") => void;
  onRegionChange: (start: number, end: number) => void;
  playhead?: () => number | null;
};

export const SSScreen = ({
  buffer,
  name,
  start,
  end,
  loop,
  rootNote,
  pitch,
  bpm,
  volume,
  analyser,
  mode,
  onModeChange,
  onRegionChange,
  playhead,
}: SSScreenProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ type: "start" | "end"; initial: number } | null>(null);
  const [, force] = useState(0);

  const waveData = useMemo(() => {
    if (!buffer) return null;
    const samplesPerColumn = Math.ceil(buffer.length / 1024);
    const data: { min: number; max: number }[] = [];

    for (let i = 0; i < 1024; i++) {
      let min = 1;
      let max = -1;
      const startSample = i * samplesPerColumn;
      const endSample = Math.min(startSample + samplesPerColumn, buffer.length);

      const channels = buffer.numberOfChannels;
      for (let j = startSample; j < endSample; j++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
          sum += buffer.getChannelData(c)[j];
        }
        const sample = sum / channels;
        min = Math.min(min, sample);
        max = Math.max(max, sample);
      }
      data.push({ min, max });
    }
    return data;
  }, [buffer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const dpr = window.devicePixelRatio;
      canvas.width = entry.contentRect.width * dpr;
      canvas.height = entry.contentRect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      force((n) => n + 1);
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      force((n) => n + 1);
    }, 33);

    return () => clearInterval(interval);
  }, []);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#04141c");
    gradient.addColorStop(1, "#020a10");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Scanlines
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    for (let y = 0; y < height; y += 3) {
      ctx.fillRect(0, y, width, 1);
    }

    // Glow
    const glowGradient = ctx.createLinearGradient(0, 0, 0, 20);
    glowGradient.addColorStop(0, "rgba(94, 242, 255, 0.2)");
    glowGradient.addColorStop(1, "rgba(94, 242, 255, 0)");
    ctx.fillStyle = glowGradient;
    ctx.fillRect(0, 0, width, 20);

    // Header
    ctx.fillStyle = "#04141c";
    ctx.fillRect(0, 0, width, 22);

    // Footer
    ctx.fillStyle = "#04141c";
    ctx.fillRect(0, height - 16, width, 16);

    if (!buffer) {
      ctx.fillStyle = "rgba(94, 242, 255, 0.3)";
      ctx.font = "14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("AUCUNE SOURCE", width / 2, height / 2 - 10);
      ctx.fillText("Choisis une source ci-dessous", width / 2, height / 2 + 10);
      return;
    }

    // Waveform
    if (mode === "wave" && waveData) {
      const waveHeight = height - 48;
      const waveY = 22;

      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(94, 242, 255, 0.85)";

      for (let i = 0; i < waveData.length; i++) {
        const x = (i / waveData.length) * width;
        const columnWidth = width / waveData.length;
        const minY = waveY + (1 - waveData[i].min) * waveHeight / 2;
        const maxY = waveY + (1 - waveData[i].max) * waveHeight / 2;

        const isInRegion = i / waveData.length >= start && i / waveData.length <= end;

        if (isInRegion) {
          ctx.strokeStyle = "rgba(94, 242, 255, 0.85)";
          ctx.beginPath();
          ctx.moveTo(x + 0.5, minY + 0.5);
          ctx.lineTo(x + 0.5, maxY + 0.5);
          ctx.stroke();

          // Highlight edges
          ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
          ctx.beginPath();
          ctx.moveTo(x + 0.5, minY + 0.5);
          ctx.lineTo(x + 0.5, minY + 1.5);
          ctx.moveTo(x + 0.5, maxY + 0.5);
          ctx.lineTo(x + 0.5, maxY - 1.5);
          ctx.stroke();
        } else {
          ctx.strokeStyle = "rgba(94, 242, 255, 0.2)";
          ctx.beginPath();
          ctx.moveTo(x + 0.5, minY + 0.5);
          ctx.lineTo(x + 0.5, maxY + 0.5);
          ctx.stroke();
        }
      }

      // Region markers
      const startX = start * width;
      const endX = end * width;

      // Start marker
      ctx.strokeStyle = "#4ade80";
      ctx.beginPath();
      ctx.moveTo(startX + 0.5, waveY + 0.5);
      ctx.lineTo(startX + 0.5, waveY + waveHeight + 0.5);
      ctx.stroke();

      // Start handle
      ctx.fillStyle = "#4ade80";
      ctx.beginPath();
      ctx.moveTo(startX - 4, waveY + 4);
      ctx.lineTo(startX + 4, waveY + 4);
      ctx.lineTo(startX, waveY);
      ctx.closePath();
      ctx.fill();

      // End marker
      ctx.strokeStyle = "#f87171";
      ctx.beginPath();
      ctx.moveTo(endX + 0.5, waveY + 0.5);
      ctx.lineTo(endX + 0.5, waveY + waveHeight + 0.5);
      ctx.stroke();

      // playhead: where the last note is inside the source (wave mode only)
      const ph = playhead ? playhead() : null;
      if (ph !== null) {
        const phX = ph * width;
        ctx.strokeStyle = "#ffffff";
        ctx.shadowColor = "#5ef2ff";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(phX + 0.5, waveY);
        ctx.lineTo(phX + 0.5, waveY + waveHeight);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // End handle
      ctx.fillStyle = "#f87171";
      ctx.beginPath();
      ctx.moveTo(endX - 4, waveY + waveHeight - 4);
      ctx.lineTo(endX + 4, waveY + waveHeight - 4);
      ctx.lineTo(endX, waveY + waveHeight);
      ctx.closePath();
      ctx.fill();

      // Loop region
      if (loop) {
        ctx.fillStyle = "rgba(251, 191, 36, 0.3)";
        ctx.fillRect(startX, height - 16, endX - startX, 2);
      }
    }

    // Spectrum
    if (mode === "spectrum") {
      const spectrumHeight = height - 48;
      const spectrumY = 22;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);

      const barWidth = width / 64;
      const logScale = (i: number) => Math.log10(1 + i * 30 / 16000) * 64;

      for (let i = 0; i < 64; i++) {
        const x = i * barWidth;
        const barHeight = (data[Math.floor(logScale(i))] / 255) * spectrumHeight;

        const gradient = ctx.createLinearGradient(x, spectrumY, x, spectrumY + barHeight);
        gradient.addColorStop(0, "#5ef2ff");
        gradient.addColorStop(1, "#fbbf24");
        ctx.fillStyle = gradient;
        ctx.fillRect(x, spectrumY + spectrumHeight - barHeight, barWidth - 1, barHeight);
      }
    }

    // Oscilloscope
    if (mode === "scope") {
      const scopeHeight = height - 48;
      const scopeY = 22;
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);

      ctx.strokeStyle = "#5ef2ff";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#5ef2ff";
      ctx.shadowBlur = 8;
      ctx.beginPath();

      for (let i = 0; i < data.length; i++) {
        const x = (i / data.length) * width;
        const y = scopeY + (1 - data[i]) * scopeHeight / 2;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Header text
    ctx.fillStyle = "#5ef2ff";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";

    // Name
    const truncatedName = name.length > 18 ? name.substring(0, 15) + "..." : name;
    ctx.fillText(truncatedName, 8, 14);

    // Root note
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const octave = Math.floor(rootNote / 12) - 1;
    const noteName = noteNames[rootNote % 12];
    ctx.fillText(`ROOT ${noteName}${octave}`, width * 0.40, 14);

    // Pitch
    ctx.fillText(`PITCH ${pitch >= 0 ? "+" : ""}${pitch}`, width * 0.54, 14);

    // BPM
    ctx.fillText(`BPM ${Math.round(bpm)}`, width * 0.66, 14);

    // Duration and Volume
    const duration = (end - start) * buffer.duration;
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    const milliseconds = Math.floor((duration % 1) * 1000);
    const volumeDb = volume === 0 ? "-∞" : (20 * Math.log10(volume)).toFixed(1);
    ctx.textAlign = "left";

    // VU meter
    const vuData = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(vuData);
    let rms = 0;
    for (let i = 0; i < vuData.length; i++) {
      rms += vuData[i] * vuData[i];
    }
    rms = Math.sqrt(rms / vuData.length);
    const vuDb = rms === 0 ? -Infinity : 20 * Math.log10(rms);

    ctx.font = "9px monospace";
    ctx.fillStyle = "#5ef2ff";
    ctx.fillText(`DUR ${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}  VOL ${volumeDb} dB`, 8, height - 4);

    const vuWidth = width * 0.44;
    const vuX = width - vuWidth - 8;
    const vuY = height - 12;
    const segmentWidth = vuWidth / 10;

    for (let i = 0; i < 10; i++) {
      const segmentDb = -30 + i * 3;
      let color = "#4ade80";
      if (segmentDb >= -6) color = "#fbbf24";
      if (segmentDb >= 0) color = "#f87171";

      ctx.fillStyle = vuDb >= segmentDb ? color : "#04141c";
      ctx.fillRect(vuX + i * segmentWidth, vuY, segmentWidth - 1, 4);
    }
  };

  useEffect(() => {
    draw();
  });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;

    const startDist = Math.abs(x - start);
    const endDist = Math.abs(x - end);

    if (startDist < 0.02 && startDist < endDist) {
      dragRef.current = { type: "start", initial: start };
      canvasRef.current.style.cursor = "ew-resize";
    } else if (endDist < 0.02) {
      dragRef.current = { type: "end", initial: end };
      canvasRef.current.style.cursor = "ew-resize";
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!canvasRef.current || !dragRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;

    if (dragRef.current.type === "start") {
      const newStart = Math.min(Math.max(0, x), end - 0.001);
      onRegionChange(newStart, end);
    } else {
      const newEnd = Math.max(Math.min(1, x), start + 0.001);
      onRegionChange(start, newEnd);
    }
  };

  const handlePointerUp = () => {
    if (!canvasRef.current) return;

    dragRef.current = null;
    canvasRef.current.style.cursor = "default";
  };

  return (
    <div
      ref={containerRef}
      className="w-full flex-1 min-h-[232px] rounded-[10px] border border-[#19324a] overflow-hidden relative"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <div style={{ position: "absolute", right: "8px", bottom: "24px", display: "flex", gap: "4px" }}>
        <button
          style={{
            padding: "2px 4px",
            fontSize: "10px",
            fontFamily: "monospace",
            borderRadius: "4px",
            color: mode === "wave" ? "#04141c" : "#5ef2ff",
            backgroundColor: mode === "wave" ? "#5ef2ff" : "#04141c",
            border: "1px solid #19324a",
          }}
          onClick={() => onModeChange("wave")}
        >
          FORME
        </button>
        <button
          style={{
            padding: "2px 4px",
            fontSize: "10px",
            fontFamily: "monospace",
            borderRadius: "4px",
            color: mode === "spectrum" ? "#04141c" : "#5ef2ff",
            backgroundColor: mode === "spectrum" ? "#5ef2ff" : "#04141c",
            border: "1px solid #19324a",
          }}
          onClick={() => onModeChange("spectrum")}
        >
          SPECTRE
        </button>
        <button
          style={{
            padding: "2px 4px",
            fontSize: "10px",
            fontFamily: "monospace",
            borderRadius: "4px",
            color: mode === "scope" ? "#04141c" : "#5ef2ff",
            backgroundColor: mode === "scope" ? "#5ef2ff" : "#04141c",
            border: "1px solid #19324a",
          }}
          onClick={() => onModeChange("scope")}
        >
          SCOPE
        </button>
      </div>
    </div>
  );
};
