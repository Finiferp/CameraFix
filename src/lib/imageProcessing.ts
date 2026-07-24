export type ImageSettings = {
  exposure: number;
  temperature: number;
  contrast: number;
  highlights: number;
  shadows: number;
  saturation: number;
  sharpness: number;
  denoise: number;
};

export type ImageAnalysis = {
  averageLuminance: number;
  clippedHighlights: number;
  clippedShadows: number;
  sharpness: number;
  dynamicRange: number;
  score: number;
  verdict: "Ready to restore" | "Recoverable" | "Limited recovery" | "Likely unsalvageable";
  notes: string[];
  suggested: ImageSettings;
};

export const neutralSettings: ImageSettings = {
  exposure: 0,
  temperature: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  sharpness: 0,
  denoise: 0,
};

const clamp = (value: number, min = 0, max = 255) =>
  Math.min(max, Math.max(min, value));

function percentile(histogram: number[], total: number, threshold: number) {
  let seen = 0;
  for (let i = 0; i < histogram.length; i += 1) {
    seen += histogram[i];
    if (seen / total >= threshold) return i;
  }
  return 255;
}

export function analyzeImage(image: HTMLImageElement): ImageAnalysis {
  const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is not available in this browser.");

  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const luma = new Float32Array(width * height);
  const histogram = new Array(256).fill(0);
  let lumaTotal = 0;
  let redTotal = 0;
  let blueTotal = 0;
  let clippedHighlights = 0;
  let clippedShadows = 0;

  for (let pixel = 0, index = 0; pixel < luma.length; pixel += 1, index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const value = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    luma[pixel] = value;
    lumaTotal += value;
    redTotal += red;
    blueTotal += blue;
    histogram[Math.round(value)] += 1;
    if (value > 247) clippedHighlights += 1;
    if (value < 9) clippedShadows += 1;
  }

  let edgeTotal = 0;
  let edgeCount = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const center = y * width + x;
      const laplacian =
        4 * luma[center] -
        luma[center - 1] -
        luma[center + 1] -
        luma[center - width] -
        luma[center + width];
      edgeTotal += Math.abs(laplacian);
      edgeCount += 1;
    }
  }

  const total = width * height;
  const averageLuminance = lumaTotal / total;
  const highlightRatio = clippedHighlights / total;
  const shadowRatio = clippedShadows / total;
  const sharpness = edgeTotal / Math.max(1, edgeCount);
  const low = percentile(histogram, total, 0.05);
  const high = percentile(histogram, total, 0.95);
  const dynamicRange = high - low;
  const channelCast = (blueTotal - redTotal) / total;

  const notes: string[] = [];
  if (averageLuminance > 178) notes.push("Overall exposure is too bright");
  else if (averageLuminance < 72) notes.push("Overall exposure is too dark");
  else notes.push("Exposure has a usable starting point");
  if (highlightRatio > 0.035) notes.push("Some highlight detail is permanently clipped");
  if (shadowRatio > 0.06) notes.push("Deep shadows may contain limited detail");
  if (sharpness < 7) notes.push("Focus is very soft; sharpening will be limited");
  else if (sharpness < 14) notes.push("Fine detail can use moderate sharpening");
  else notes.push("Edge detail is healthy");
  if (Math.abs(channelCast) > 12) notes.push("A visible color cast can be neutralized");

  const suggested: ImageSettings = {
    exposure: clamp(Math.log2(116 / Math.max(24, averageLuminance)), -1.5, 1.5),
    temperature: clamp(channelCast * 0.42, -35, 35),
    contrast: dynamicRange < 118 ? 18 : dynamicRange > 210 ? -4 : 7,
    highlights: highlightRatio > 0.035 ? -48 : averageLuminance > 165 ? -24 : -10,
    shadows: shadowRatio > 0.06 ? 38 : averageLuminance < 85 ? 28 : 12,
    saturation: Math.abs(channelCast) > 20 ? 2 : 8,
    sharpness: sharpness < 7 ? 64 : sharpness < 14 ? 46 : 24,
    denoise: averageLuminance < 78 ? 28 : 10,
  };

  let score = 94;
  score -= Math.min(28, highlightRatio * 180);
  score -= Math.min(18, shadowRatio * 90);
  score -= sharpness < 7 ? 26 : sharpness < 14 ? 10 : 0;
  score -= Math.abs(128 - averageLuminance) > 70 ? 12 : 0;
  score = Math.round(clamp(score, 18, 98));

  return {
    averageLuminance,
    clippedHighlights: highlightRatio,
    clippedShadows: shadowRatio,
    sharpness,
    dynamicRange,
    score,
    verdict:
      score >= 72
        ? "Ready to restore"
        : score >= 48
          ? "Recoverable"
          : score >= 35
            ? "Limited recovery"
            : "Likely unsalvageable",
    notes,
    suggested,
  };
}

export function getPreviewSize(image: HTMLImageElement, maxDimension = 1600) {
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  return {
    width: Math.max(1, Math.round(image.naturalWidth * scale)),
    height: Math.max(1, Math.round(image.naturalHeight * scale)),
  };
}

export function drawOriginal(
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  maxDimension = 1600,
) {
  const size = getPreviewSize(image, maxDimension);
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext("2d")?.drawImage(image, 0, 0, size.width, size.height);
}

export function renderCorrection(
  image: HTMLImageElement,
  settings: ImageSettings,
  canvas: HTMLCanvasElement,
  maxDimension?: number,
) {
  const size = getPreviewSize(image, maxDimension ?? Number.POSITIVE_INFINITY);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is not available in this browser.");
  context.drawImage(image, 0, 0, size.width, size.height);

  const imageData = context.getImageData(0, 0, size.width, size.height);
  const pixels = imageData.data;
  const source = new Uint8ClampedArray(pixels);
  const exposure = 2 ** settings.exposure;
  const contrast = settings.contrast * 2;
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const saturation = 1 + settings.saturation / 100;
  const denoiseMix = settings.denoise / 100;

  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      const index = (y * size.width + x) * 4;
      let red = source[index];
      let green = source[index + 1];
      let blue = source[index + 2];

      if (denoiseMix > 0 && x > 0 && x < size.width - 1 && y > 0 && y < size.height - 1) {
        const left = index - 4;
        const right = index + 4;
        const up = index - size.width * 4;
        const down = index + size.width * 4;
        const avgRed = (source[left] + source[right] + source[up] + source[down] + red * 2) / 6;
        const avgGreen = (source[left + 1] + source[right + 1] + source[up + 1] + source[down + 1] + green * 2) / 6;
        const avgBlue = (source[left + 2] + source[right + 2] + source[up + 2] + source[down + 2] + blue * 2) / 6;
        red += (avgRed - red) * denoiseMix;
        green += (avgGreen - green) * denoiseMix;
        blue += (avgBlue - blue) * denoiseMix;
      }

      red = red * exposure + settings.temperature * 0.52;
      green *= exposure;
      blue = blue * exposure - settings.temperature * 0.52;

      let luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
      const shadowWeight = (1 - clamp(luminance, 0, 1)) ** 2;
      const highlightWeight = clamp(luminance, 0, 1) ** 2;
      const tonalShift =
        (settings.shadows * 0.72 * shadowWeight + settings.highlights * 0.62 * highlightWeight);
      red += tonalShift;
      green += tonalShift;
      blue += tonalShift;

      red = contrastFactor * (red - 128) + 128;
      green = contrastFactor * (green - 128) + 128;
      blue = contrastFactor * (blue - 128) + 128;

      luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      pixels[index] = clamp(luminance + (red - luminance) * saturation);
      pixels[index + 1] = clamp(luminance + (green - luminance) * saturation);
      pixels[index + 2] = clamp(luminance + (blue - luminance) * saturation);
    }
  }

  if (settings.sharpness > 0) {
    const corrected = new Uint8ClampedArray(pixels);
    const amount = (settings.sharpness / 100) * 1.45;
    for (let y = 1; y < size.height - 1; y += 1) {
      for (let x = 1; x < size.width - 1; x += 1) {
        const index = (y * size.width + x) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          const center = corrected[index + channel];
          const blurred =
            (corrected[index - 4 + channel] +
              corrected[index + 4 + channel] +
              corrected[index - size.width * 4 + channel] +
              corrected[index + size.width * 4 + channel] +
              center * 2) /
            6;
          pixels[index + channel] = clamp(center + (center - blurred) * amount);
        }
      }
    }
  }

  context.putImageData(imageData, 0, 0);
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}