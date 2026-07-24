import {
  Aperture,
  ArrowDownToLine,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  ImagePlus,
  Info,
  LoaderCircle,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, DragEvent } from "react";
import {
  analyzeImage,
  drawOriginal,
  formatFileSize,
  neutralSettings,
  renderCorrection,
} from "./lib/imageProcessing";
import type { ImageAnalysis, ImageSettings } from "./lib/imageProcessing";

type Photo = {
  id: string;
  file: File;
  url: string;
  image: HTMLImageElement;
  analysis: ImageAnalysis;
  settings: ImageSettings;
};

const adjustmentGroups: Array<{
  label: string;
  key: keyof ImageSettings;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}> = [
  { label: "Exposure", key: "exposure", min: -2, max: 2, step: 0.1, suffix: " EV" },
  { label: "Temperature", key: "temperature", min: -50, max: 50, step: 1 },
  { label: "Contrast", key: "contrast", min: -50, max: 50, step: 1 },
  { label: "Highlights", key: "highlights", min: -80, max: 50, step: 1 },
  { label: "Shadows", key: "shadows", min: -50, max: 80, step: 1 },
  { label: "Saturation", key: "saturation", min: -50, max: 50, step: 1 },
  { label: "Sharpness", key: "sharpness", min: 0, max: 100, step: 1 },
  { label: "Noise reduction", key: "denoise", min: 0, max: 60, step: 1 },
];

function makeImage(file: File) {
  return new Promise<Photo>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const analysis = analyzeImage(image);
        resolve({
          id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
          file,
          url,
          image,
          analysis,
          settings: analysis.suggested,
        });
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} could not be decoded.`));
    };
    image.src = url;
  });
}

function outputName(name: string) {
  const base = name.replace(/\.[^/.]+$/, "");
  return `${base}_LUMEN.jpg`;
}

function scoreColor(score: number) {
  if (score >= 72) return "#b8df67";
  if (score >= 48) return "#f1ad5b";
  return "#ec765f";
}

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compare, setCompare] = useState(46);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement>(null);
  const urlsRef = useRef<string[]>([]);

  const activePhoto = useMemo(
    () => photos.find((photo) => photo.id === selectedId) ?? photos[0] ?? null,
    [photos, selectedId],
  );

  useEffect(() => {
    return () => urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!activePhoto || !originalCanvasRef.current || !processedCanvasRef.current) return;
    setIsRendering(true);
    const timeout = window.setTimeout(() => {
      if (!originalCanvasRef.current || !processedCanvasRef.current) return;
      drawOriginal(activePhoto.image, originalCanvasRef.current, 1600);
      renderCorrection(activePhoto.image, activePhoto.settings, processedCanvasRef.current, 1600);
      setIsRendering(false);
    }, 90);
    return () => window.clearTimeout(timeout);
  }, [activePhoto]);

  const importFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const supported = files.filter((file) =>
      ["image/jpeg", "image/png", "image/webp"].includes(file.type),
    );
    if (!supported.length) {
      setNotice("Use JPEG, PNG, or WebP. Panasonic RW2 files need to be converted to JPEG first.");
      return;
    }

    setIsImporting(true);
    setNotice(null);
    const results = await Promise.allSettled(supported.map(makeImage));
    const imported = results
      .filter((result): result is PromiseFulfilledResult<Photo> => result.status === "fulfilled")
      .map((result) => result.value);
    if (imported.length) {
      urlsRef.current.push(...imported.map((photo) => photo.url));
      setPhotos((current) => [...current, ...imported]);
      setSelectedId((current) => current ?? imported[0].id);
    }
    const failed = results.length - imported.length;
    if (failed) setNotice(`${failed} file${failed === 1 ? "" : "s"} could not be decoded.`);
    setIsImporting(false);
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) void importFiles(event.target.files);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length) void importFiles(event.dataTransfer.files);
  };

  const updateSettings = (key: keyof ImageSettings, value: number) => {
    if (!activePhoto) return;
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === activePhoto.id
          ? { ...photo, settings: { ...photo.settings, [key]: value } }
          : photo,
      ),
    );
  };

  const applyAutoFix = () => {
    if (!activePhoto) return;
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === activePhoto.id ? { ...photo, settings: { ...photo.analysis.suggested } } : photo,
      ),
    );
    setNotice("Camera-aware correction applied. Fine-tune any control before export.");
  };

  const resetActive = () => {
    if (!activePhoto) return;
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === activePhoto.id ? { ...photo, settings: { ...neutralSettings } } : photo,
      ),
    );
  };

  const removePhoto = (id: string) => {
    const removed = photos.find((photo) => photo.id === id);
    if (removed) {
      URL.revokeObjectURL(removed.url);
      urlsRef.current = urlsRef.current.filter((url) => url !== removed.url);
    }
    const next = photos.filter((photo) => photo.id !== id);
    setPhotos(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  const exportPhoto = async () => {
    if (!activePhoto) return;
    setIsExporting(true);
    setNotice(null);
    await new Promise((resolve) => window.setTimeout(resolve, 40));
    try {
      const canvas = document.createElement("canvas");
      renderCorrection(activePhoto.image, activePhoto.settings, canvas);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("The JPEG could not be created.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = outputName(activePhoto.file.name);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Full-resolution JPEG exported at 92% quality.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  const aspectRatio = activePhoto
    ? `${activePhoto.image.naturalWidth} / ${activePhoto.image.naturalHeight}`
    : "4 / 3";

  return (
    <div className="app-shell min-h-screen bg-[#e8e7e1] text-[#1f211e]">
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        onChange={handleInput}
      />

      <header className="flex h-[68px] items-center justify-between border-b border-black/10 bg-[#f6f5ef] px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="relative grid h-9 w-9 place-items-center bg-[#1f211e] text-[#f3f1e9]">
            <Aperture size={21} strokeWidth={1.6} />
            <span className="absolute -right-1 -top-1 h-2 w-2 bg-[#d7ff68]" />
          </div>
          <div>
            <p className="brand-title text-[18px] font-bold leading-none tracking-[-0.04em]">LUMEN FIX</p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-black/40">
              Point-and-shoot recovery lab
            </p>
          </div>
        </div>

        <div className="hidden items-center gap-2 border-l border-black/10 pl-5 text-xs text-black/55 md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[#8db832]" />
          Panasonic DMC-LX7 profile
        </div>

        <button
          type="button"
          disabled={!activePhoto || isExporting}
          onClick={() => void exportPhoto()}
          className="primary-button flex h-10 items-center gap-2 bg-[#1f211e] px-4 text-[11px] font-bold uppercase tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:opacity-35"
        >
          {isExporting ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowDownToLine size={15} />}
          <span className="hidden sm:inline">{isExporting ? "Rendering" : "Export JPEG"}</span>
        </button>
      </header>

      {notice && (
        <div className="notice-enter fixed left-1/2 top-[82px] z-50 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 border border-black/10 bg-[#f7f5ed] px-4 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.15)]">
          <Info size={15} className="shrink-0 text-[#647c25]" />
          <p className="text-xs leading-5">{notice}</p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification">
            <X size={14} />
          </button>
        </div>
      )}

      <main className="workspace-grid">
        <aside className="queue-panel flex min-h-0 flex-col bg-[#20221f] text-white">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Import queue</p>
              <p className="mt-1 text-xs text-white/80">{photos.length} {photos.length === 1 ? "photo" : "photos"}</p>
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="grid h-8 w-8 place-items-center border border-white/20 transition hover:border-[#d7ff68] hover:text-[#d7ff68]"
              aria-label="Add photos"
            >
              <ImagePlus size={15} />
            </button>
          </div>

          <div className="queue-scroll flex-1 overflow-auto p-3">
            {photos.length ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {photos.map((photo, index) => {
                  const selected = photo.id === activePhoto?.id;
                  return (
                    <button
                      type="button"
                      key={photo.id}
                      onClick={() => setSelectedId(photo.id)}
                      className={`group relative flex min-w-0 items-center gap-3 border p-2 text-left transition ${
                        selected
                          ? "border-[#d7ff68]/70 bg-white/8"
                          : "border-transparent hover:border-white/15 hover:bg-white/5"
                      }`}
                    >
                      <div className="relative h-14 w-[68px] shrink-0 overflow-hidden bg-black/40">
                        <img src={photo.url} alt="" className="h-full w-full object-cover" />
                        <span className="absolute bottom-0 left-0 bg-black/70 px-1.5 py-0.5 text-[8px] text-white/75">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-white/90">{photo.file.name}</p>
                        <p className="mt-1 text-[9px] uppercase tracking-[0.08em] text-white/40">
                          {photo.image.naturalWidth} x {photo.image.naturalHeight}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-[9px] text-[#d7ff68]/80">
                          <Check size={9} strokeWidth={3} /> analyzed
                        </p>
                      </div>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          removePhoto(photo.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") removePhoto(photo.id);
                        }}
                        className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center bg-black/70 text-white/50 opacity-0 transition hover:text-white group-hover:opacity-100"
                        aria-label={`Remove ${photo.file.name}`}
                      >
                        <Trash2 size={11} />
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full min-h-32 items-center justify-center text-center lg:min-h-0">
                <p className="max-w-32 text-[10px] leading-5 text-white/35">
                  Your imported frames will appear here.
                </p>
              </div>
            )}
          </div>

          <div className="hidden border-t border-white/10 px-4 py-4 lg:block">
            <p className="text-[9px] uppercase tracking-[0.16em] text-white/35">Local processing</p>
            <p className="mt-1 text-[10px] leading-4 text-white/60">Your photos never leave this browser.</p>
          </div>
        </aside>

        <section
          className={`viewer-panel relative min-h-[430px] overflow-hidden bg-[#111310] ${isDragging ? "drop-active" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setIsDragging(false);
          }}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-4 z-40 grid place-items-center border border-[#d7ff68] bg-[#1c2119]/90 text-center backdrop-blur-sm">
              <div>
                <Upload className="mx-auto mb-3 text-[#d7ff68]" size={28} />
                <p className="text-sm font-semibold text-white">Drop photos to analyze</p>
              </div>
            </div>
          )}

          {activePhoto ? (
            <div className="viewer-enter flex h-full min-h-[430px] flex-col">
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4 text-[10px] text-white/45">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="max-w-48 truncate font-semibold text-white/75">{activePhoto.file.name}</span>
                  <span className="hidden sm:inline">{formatFileSize(activePhoto.file.size)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#d7ff68]" />
                  Preview / sRGB
                </div>
              </div>

              <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-8 sm:px-8 lg:px-12">
                <div
                  className="compare-frame relative max-h-full w-full max-w-[1040px] overflow-hidden bg-black shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
                  style={{ aspectRatio }}
                >
                  <canvas ref={originalCanvasRef} className="absolute inset-0 h-full w-full object-contain" />
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ clipPath: `inset(0 0 0 ${compare}%)` }}
                  >
                    <canvas ref={processedCanvasRef} className="absolute inset-0 h-full w-full object-contain" />
                  </div>

                  <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white/90" style={{ left: `${compare}%` }}>
                    <span className="absolute left-1/2 top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-[#20221f] text-white shadow-lg">
                      <span className="text-[10px] tracking-[-0.2em]">| |</span>
                    </span>
                  </div>
                  <input
                    className="compare-range absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
                    type="range"
                    min="0"
                    max="100"
                    value={compare}
                    onChange={(event) => setCompare(Number(event.target.value))}
                    aria-label="Move before and after comparison"
                  />
                  <span className="absolute left-3 top-3 bg-black/65 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-white/70">
                    Original
                  </span>
                  <span className="absolute right-3 top-3 bg-[#d7ff68] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-[#20221f]">
                    Corrected
                  </span>
                  {isRendering && (
                    <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-white/10">
                      <span className="render-line block h-full w-1/3 bg-[#d7ff68]" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex h-12 shrink-0 items-center justify-between border-t border-white/10 px-4 text-[9px] uppercase tracking-[0.12em] text-white/35">
                <span>Drag center line to compare</span>
                <span>{activePhoto.image.naturalWidth} x {activePhoto.image.naturalHeight} px</span>
              </div>
            </div>
          ) : (
            <div className="empty-enter grid h-full min-h-[530px] place-items-center px-6 py-12">
              <div className="max-w-lg text-center">
                <div className="empty-aperture mx-auto mb-7 grid h-16 w-16 place-items-center border border-white/15 text-[#d7ff68]">
                  {isImporting ? <LoaderCircle className="animate-spin" size={28} /> : <Aperture size={31} strokeWidth={1.4} />}
                </div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#d7ff68]">
                  DMC-LX7 restoration profile
                </p>
                <h1 className="mx-auto max-w-md text-3xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-4xl">
                  Give old frames a clean second life.
                </h1>
                <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-white/45">
                  Import camera JPEGs. Lumen Fix measures exposure, clipped detail, color cast, and focus before making a careful correction.
                </p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={isImporting}
                  className="primary-button mx-auto mt-7 flex h-12 items-center gap-2 bg-[#d7ff68] px-6 text-[11px] font-bold uppercase tracking-[0.13em] text-[#171a14] disabled:opacity-50"
                >
                  <Upload size={15} />
                  {isImporting ? "Reading photos" : "Choose photos"}
                </button>
                <p className="mt-4 text-[10px] text-white/28">JPEG, PNG, or WebP / full resolution / processed locally</p>
              </div>
            </div>
          )}
        </section>

        <aside className="controls-panel min-h-0 overflow-y-auto bg-[#f6f5ef]">
          {activePhoto ? (
            <div className="controls-enter">
              <section className="border-b border-black/10 px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/40">Frame health</p>
                    <div className="mt-2 flex items-center gap-2">
                      {activePhoto.analysis.score >= 48 ? (
                        <CircleCheck size={16} className="text-[#718e2a]" />
                      ) : (
                        <CircleAlert size={16} className="text-[#b84e3d]" />
                      )}
                      <p className="text-sm font-semibold">{activePhoto.analysis.verdict}</p>
                    </div>
                  </div>
                  <div
                    className="score-ring grid h-14 w-14 shrink-0 place-items-center rounded-full"
                    style={{
                      background: `conic-gradient(${scoreColor(activePhoto.analysis.score)} ${activePhoto.analysis.score}%, #deddd6 0)`,
                    }}
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-[#f6f5ef] text-sm font-bold">
                      {activePhoto.analysis.score}
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {activePhoto.analysis.notes.slice(0, 3).map((note, index) => (
                    <div key={note} className="flex items-start gap-2 text-[10px] leading-4 text-black/55">
                      {index === 0 ? (
                        <Zap size={11} className="mt-0.5 shrink-0 text-[#7b9a31]" />
                      ) : (
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-black/25" />
                      )}
                      <span>{note}</span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={applyAutoFix}
                  className="auto-button mt-5 flex h-11 w-full items-center justify-center gap-2 bg-[#d7ff68] text-[11px] font-bold uppercase tracking-[0.12em] text-[#1c2018]"
                >
                  <Sparkles size={14} /> Apply smart correction
                </button>
              </section>

              <section className="border-b border-black/10 px-5 py-5">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal size={14} />
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.18em]">Adjustments</h2>
                  </div>
                  <button
                    type="button"
                    onClick={resetActive}
                    className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-black/40 transition hover:text-black"
                  >
                    <RotateCcw size={11} /> Reset
                  </button>
                </div>

                <div className="space-y-5">
                  {adjustmentGroups.map((adjustment) => {
                    const value = activePhoto.settings[adjustment.key];
                    const progress = ((value - adjustment.min) / (adjustment.max - adjustment.min)) * 100;
                    return (
                      <label key={adjustment.key} className="block">
                        <span className="mb-2 flex items-center justify-between text-[10px]">
                          <span className="font-medium text-black/65">{adjustment.label}</span>
                          <span className="min-w-12 text-right font-mono text-[9px] text-black/45">
                            {value > 0 ? "+" : ""}{Number(value.toFixed(1))}{adjustment.suffix ?? ""}
                          </span>
                        </span>
                        <input
                          type="range"
                          min={adjustment.min}
                          max={adjustment.max}
                          step={adjustment.step}
                          value={value}
                          onChange={(event) => updateSettings(adjustment.key, Number(event.target.value))}
                          className="adjustment-range w-full"
                          style={{ "--range-progress": `${progress}%` } as CSSProperties}
                        />
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className="px-5 py-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/40">Output recipe</p>
                <div className="mt-3 flex w-full items-center justify-between border-y border-black/10 py-3 text-left">
                  <span>
                    <span className="block text-xs font-semibold">Archive JPEG</span>
                    <span className="mt-1 block text-[9px] text-black/40">Full size / sRGB / 92% quality</span>
                  </span>
                  <ChevronDown size={14} className="text-black/35" />
                </div>
                <p className="mt-4 text-[9px] leading-4 text-black/38">
                  Processing is non-destructive. Your original file stays untouched.
                </p>
              </section>
            </div>
          ) : (
            <div className="flex h-full min-h-40 items-center justify-center p-6 text-center">
              <div>
                <SlidersHorizontal className="mx-auto text-black/20" size={22} />
                <p className="mt-3 text-[10px] leading-5 text-black/35">Adjustments appear after your first import.</p>
              </div>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}