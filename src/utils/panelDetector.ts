import { PanelRect } from '../types/comic';

interface PixelBox {
  x0: number;
  y0: number;
  x1: number; // exclusive
  y1: number; // exclusive
}

interface GutterProfile {
  r: number;
  g: number;
  b: number;
  lum: number;
  mode: 'light' | 'dark' | 'custom';
  tolerance: number;
}

function createPanelId(index: number): string {
  return `panel-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`;
}

function colorDistanceSq(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

/**
 * Separable 3x3 edge-preserving Gaussian blur ([1, 4, 1] / 6) to suppress
 * halftone dot noise, paper grain, and JPEG compression artifacts before thresholding.
 */
function applyGaussianBlurFilter(data: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const len = data.length;
  const temp = new Uint8ClampedArray(len);
  const out = new Uint8ClampedArray(len);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      const xl = x > 0 ? x - 1 : 0;
      const xr = x < w - 1 ? x + 1 : w - 1;
      const il = (rowOff + xl) * 4;
      const ic = (rowOff + x) * 4;
      const ir = (rowOff + xr) * 4;

      temp[ic] = (data[il] + data[ic] * 4 + data[ir] + 3) / 6;
      temp[ic + 1] = (data[il + 1] + data[ic + 1] * 4 + data[ir + 1] + 3) / 6;
      temp[ic + 2] = (data[il + 2] + data[ic + 2] * 4 + data[ir + 2] + 3) / 6;
      temp[ic + 3] = data[ic + 3];
    }
  }

  // Vertical pass
  for (let y = 0; y < h; y++) {
    const yu = y > 0 ? y - 1 : 0;
    const yd = y < h - 1 ? y + 1 : h - 1;
    for (let x = 0; x < w; x++) {
      const iu = (yu * w + x) * 4;
      const ic = (y * w + x) * 4;
      const id = (yd * w + x) * 4;

      out[ic] = (temp[iu] + temp[ic] * 4 + temp[id] + 3) / 6;
      out[ic + 1] = (temp[iu + 1] + temp[ic + 1] * 4 + temp[id + 1] + 3) / 6;
      out[ic + 2] = (temp[iu + 2] + temp[ic + 2] * 4 + temp[id + 2] + 3) / 6;
      out[ic + 3] = temp[ic + 3];
    }
  }

  return out;
}

/**
 * Compute normalized Sobel gradient edge magnitudes (0..255) on blurred pixels.
 */
function computeSobelEdgeMap(data: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const lum = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    lum[p] = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
  }

  const edges = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    const r0 = (y - 1) * w;
    const r1 = y * w;
    const r2 = (y + 1) * w;
    for (let x = 1; x < w - 1; x++) {
      const tl = lum[r0 + x - 1];
      const tc = lum[r0 + x];
      const tr = lum[r0 + x + 1];
      const ml = lum[r1 + x - 1];
      const mr = lum[r1 + x + 1];
      const bl = lum[r2 + x - 1];
      const bc = lum[r2 + x];
      const br = lum[r2 + x + 1];

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const mag = (Math.abs(gx) + Math.abs(gy)) >> 2;
      edges[r1 + x] = mag > 255 ? 255 : mag;
    }
  }
  return edges;
}

function collectCandidateProfiles(data: Uint8ClampedArray, w: number, h: number): GutterProfile[] {
  const lightSamples: Array<{ r: number; g: number; b: number; lum: number }> = [];
  const darkSamples: Array<{ r: number; g: number; b: number; lum: number }> = [];
  const borderSamples: Array<{ r: number; g: number; b: number; lum: number; sat: number }> = [];

  const band = Math.max(2, Math.floor(Math.min(w, h) * 0.025));

  const sampleBorder = (x: number, y: number) => {
    const idx = (y * w + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    borderSamples.push({ r, g, b, lum, sat });
  };

  for (let y = 0; y < band; y++) {
    for (let x = 0; x < w; x += 2) {
      sampleBorder(x, y);
      sampleBorder(x, h - 1 - y);
    }
  }
  for (let x = 0; x < band; x++) {
    for (let y = band; y < h - band; y += 2) {
      sampleBorder(x, y);
      sampleBorder(w - 1 - x, y);
    }
  }

  // Sample locally flat interior pixels to discover true paper/gutter tone even on full-bleed borders
  for (let y = 2; y < h - 2; y += 3) {
    for (let x = 2; x < w - 2; x += 3) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const idxR = (y * w + (x + 1)) * 4;
      const idxD = ((y + 1) * w + x) * 4;
      const diff =
        Math.abs(r - data[idxR]) +
        Math.abs(g - data[idxR + 1]) +
        Math.abs(b - data[idxR + 2]) +
        Math.abs(r - data[idxD]) +
        Math.abs(g - data[idxD + 1]) +
        Math.abs(b - data[idxD + 2]);

      if (diff > 26) continue;

      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);

      if (lum >= 182 && sat <= 55) {
        lightSamples.push({ r, g, b, lum });
      } else if (lum <= 58 && sat <= 42) {
        darkSamples.push({ r, g, b, lum });
      }
    }
  }

  const profiles: GutterProfile[] = [];

  if (lightSamples.length > 0) {
    lightSamples.sort((a, b) => a.lum - b.lum);
    // Pick upper-quartile brightest flat paper tone to avoid light panel artwork
    const pick = lightSamples[Math.floor(lightSamples.length * 0.78)];
    profiles.push({
      r: pick.r,
      g: pick.g,
      b: pick.b,
      lum: pick.lum,
      mode: 'light',
      tolerance: 46,
    });
  } else {
    profiles.push({
      r: 252,
      g: 252,
      b: 252,
      lum: 252,
      mode: 'light',
      tolerance: 46,
    });
  }

  if (darkSamples.length > 0) {
    darkSamples.sort((a, b) => a.lum - b.lum);
    const pick = darkSamples[Math.floor(darkSamples.length * 0.22)];
    profiles.push({
      r: pick.r,
      g: pick.g,
      b: pick.b,
      lum: pick.lum,
      mode: 'dark',
      tolerance: 42,
    });
  } else {
    profiles.push({
      r: 10,
      g: 10,
      b: 12,
      lum: 10,
      mode: 'dark',
      tolerance: 40,
    });
  }

  // If border has a distinct midtone/tinted gutter (e.g. gray/beige/slate), add custom profile
  if (borderSamples.length > 0) {
    const sorted = [...borderSamples].sort((a, b) => a.lum - b.lum);
    const med = sorted[Math.floor(sorted.length * 0.5)];
    if (med.lum > 58 && med.lum < 185) {
      profiles.push({
        r: med.r,
        g: med.g,
        b: med.b,
        lum: med.lum,
        mode: 'custom',
        tolerance: 36,
      });
    }
  }

  return profiles;
}

function buildGutterMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  profile: GutterProfile
): Uint8Array {
  const mask = new Uint8Array(w * h);
  const tolSq = profile.tolerance * profile.tolerance * 3;
  const lightMinLum = Math.max(176, profile.lum - 42);
  const darkMaxLum = Math.min(58, profile.lum + 34);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 32) {
      mask[p] = 1;
      continue;
    }

    if (profile.mode === 'light') {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (
        (lum >= lightMinLum && sat <= 52) ||
        colorDistanceSq(r, g, b, profile.r, profile.g, profile.b) <= tolSq
      ) {
        mask[p] = 1;
      }
    } else if (profile.mode === 'dark') {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (
        (lum <= darkMaxLum && sat <= 40) ||
        colorDistanceSq(r, g, b, profile.r, profile.g, profile.b) <= tolSq
      ) {
        mask[p] = 1;
      }
    } else if (colorDistanceSq(r, g, b, profile.r, profile.g, profile.b) <= tolSq) {
      mask[p] = 1;
    }
  }

  return mask;
}

function trimBox(mask: Uint8Array, w: number, box: PixelBox, ratioThreshold = 0.94): PixelBox {
  let { x0, y0, x1, y1 } = box;

  const isGutterRow = (y: number, sx0: number, sx1: number) => {
    const span = sx1 - sx0;
    if (span <= 0) return true;
    let gutterCount = 0;
    const rowOffset = y * w;
    for (let x = sx0; x < sx1; x++) {
      gutterCount += mask[rowOffset + x];
    }
    return gutterCount / span >= ratioThreshold;
  };

  const isGutterCol = (x: number, sy0: number, sy1: number) => {
    const span = sy1 - sy0;
    if (span <= 0) return true;
    let gutterCount = 0;
    for (let y = sy0; y < sy1; y++) {
      gutterCount += mask[y * w + x];
    }
    return gutterCount / span >= ratioThreshold;
  };

  while (y0 < y1 - 2 && isGutterRow(y0, x0, x1)) y0++;
  while (y1 > y0 + 2 && isGutterRow(y1 - 1, x0, x1)) y1--;
  while (x0 < x1 - 2 && isGutterCol(x0, y0, y1)) x0++;
  while (x1 > x0 + 2 && isGutterCol(x1 - 1, y0, y1)) x1--;

  return { x0, y0, x1, y1 };
}

interface GutterBand {
  start: number;
  end: number;
}

function findHorizontalSplits(
  mask: Uint8Array,
  w: number,
  box: PixelBox,
  minBandPx: number,
  minPanelH: number,
  rowGutterRatio: number,
  maxForegroundBridgeRatio = 1
): GutterBand[] {
  const spanW = box.x1 - box.x0;
  if (spanW <= 0) return [];
  const bands: GutterBand[] = [];
  let inBand = false;
  let bandStart = box.y0;

  for (let y = box.y0; y < box.y1; y++) {
    let gCount = 0;
    let maxBridge = 0;
    let currBridge = 0;
    const rowOffset = y * w;

    for (let x = box.x0; x < box.x1; x++) {
      const g = mask[rowOffset + x];
      gCount += g;
      if (g === 0) {
        currBridge++;
        if (currBridge > maxBridge) maxBridge = currBridge;
      } else {
        currBridge = 0;
      }
    }

    const isGutter =
      gCount / spanW >= rowGutterRatio && maxBridge / spanW <= maxForegroundBridgeRatio;

    if (isGutter && !inBand) {
      inBand = true;
      bandStart = y;
    } else if (!isGutter && inBand) {
      inBand = false;
      const bandEnd = y;
      if (
        bandEnd - bandStart >= minBandPx &&
        bandStart - box.y0 >= minPanelH &&
        box.y1 - bandEnd >= minPanelH
      ) {
        bands.push({ start: bandStart, end: bandEnd });
      }
    }
  }

  return bands;
}

function findVerticalSplits(
  mask: Uint8Array,
  w: number,
  box: PixelBox,
  minBandPx: number,
  minPanelW: number,
  colGutterRatio: number,
  maxForegroundBridgeRatio = 1
): GutterBand[] {
  const spanH = box.y1 - box.y0;
  if (spanH <= 0) return [];
  const bands: GutterBand[] = [];
  let inBand = false;
  let bandStart = box.x0;

  for (let x = box.x0; x < box.x1; x++) {
    let gCount = 0;
    let maxBridge = 0;
    let currBridge = 0;

    for (let y = box.y0; y < box.y1; y++) {
      const g = mask[y * w + x];
      gCount += g;
      if (g === 0) {
        currBridge++;
        if (currBridge > maxBridge) maxBridge = currBridge;
      } else {
        currBridge = 0;
      }
    }

    const isGutter =
      gCount / spanH >= colGutterRatio && maxBridge / spanH <= maxForegroundBridgeRatio;

    if (isGutter && !inBand) {
      inBand = true;
      bandStart = x;
    } else if (!isGutter && inBand) {
      inBand = false;
      const bandEnd = x;
      if (
        bandEnd - bandStart >= minBandPx &&
        bandStart - box.x0 >= minPanelW &&
        box.x1 - bandEnd >= minPanelW
      ) {
        bands.push({ start: bandStart, end: bandEnd });
      }
    }
  }

  return bands;
}

function splitAlongBands(
  box: PixelBox,
  bands: GutterBand[],
  axis: 'h' | 'v'
): PixelBox[] {
  const subs: PixelBox[] = [];
  if (axis === 'h') {
    let cursorY = box.y0;
    for (const band of bands) {
      subs.push({ x0: box.x0, y0: cursorY, x1: box.x1, y1: band.start });
      cursorY = band.end;
    }
    subs.push({ x0: box.x0, y0: cursorY, x1: box.x1, y1: box.y1 });
  } else {
    let cursorX = box.x0;
    for (const band of bands) {
      subs.push({ x0: cursorX, y0: box.y0, x1: band.start, y1: box.y1 });
      cursorX = band.end;
    }
    subs.push({ x0: cursorX, y0: box.y0, x1: box.x1, y1: box.y1 });
  }
  return subs;
}

function findUniformDividerSplits(
  data: Uint8ClampedArray,
  w: number,
  box: PixelBox,
  minPanelW: number,
  minPanelH: number
): { axis: 'h' | 'v'; bands: GutterBand[] } | null {
  const spanW = box.x1 - box.x0;
  const spanH = box.y1 - box.y0;
  if (spanW < minPanelW * 1.5 && spanH < minPanelH * 1.5) return null;

  // Check horizontal solid divider lines (e.g. pure 1-4px black/white borders touching edge-to-edge)
  const hLines: number[] = [];
  for (let y = box.y0 + minPanelH; y < box.y1 - minPanelH; y++) {
    let flatCount = 0;
    let contrastCount = 0;
    const rowOff = y * w;
    for (let x = box.x0 + 1; x < box.x1; x++) {
      const i0 = (rowOff + x - 1) * 4;
      const i1 = (rowOff + x) * 4;
      const diff =
        Math.abs(data[i0] - data[i1]) +
        Math.abs(data[i0 + 1] - data[i1 + 1]) +
        Math.abs(data[i0 + 2] - data[i1 + 2]);
      if (diff <= 18) flatCount++;

      if (y - 3 >= box.y0 && y + 3 < box.y1) {
        const iUp = ((y - 3) * w + x) * 4;
        const iDn = ((y + 3) * w + x) * 4;
        const cDiff =
          Math.abs(data[i1] - data[iUp]) +
          Math.abs(data[i1 + 1] - data[iUp + 1]) +
          Math.abs(data[i1 + 2] - data[iUp + 2]) +
          Math.abs(data[i1] - data[iDn]) +
          Math.abs(data[i1 + 1] - data[iDn + 1]) +
          Math.abs(data[i1 + 2] - data[iDn + 2]);
        if (cDiff >= 60) contrastCount++;
      }
    }
    if (flatCount / spanW >= 0.94 && contrastCount / spanW >= 0.45) {
      hLines.push(y);
    }
  }

  if (hLines.length > 0) {
    const bands: GutterBand[] = [];
    let s = hLines[0];
    let p = hLines[0];
    for (let i = 1; i < hLines.length; i++) {
      if (hLines[i] <= p + 2) {
        p = hLines[i];
      } else {
        bands.push({ start: s, end: p + 1 });
        s = hLines[i];
        p = hLines[i];
      }
    }
    bands.push({ start: s, end: p + 1 });
    const filtered = bands.filter(
      (b) => b.start - box.y0 >= minPanelH && box.y1 - b.end >= minPanelH
    );
    if (filtered.length > 0) {
      return { axis: 'h', bands: filtered };
    }
  }

  const vLines: number[] = [];
  for (let x = box.x0 + minPanelW; x < box.x1 - minPanelW; x++) {
    let flatCount = 0;
    let contrastCount = 0;
    for (let y = box.y0 + 1; y < box.y1; y++) {
      const i0 = ((y - 1) * w + x) * 4;
      const i1 = (y * w + x) * 4;
      const diff =
        Math.abs(data[i0] - data[i1]) +
        Math.abs(data[i0 + 1] - data[i1 + 1]) +
        Math.abs(data[i0 + 2] - data[i1 + 2]);
      if (diff <= 18) flatCount++;

      if (x - 3 >= box.x0 && x + 3 < box.x1) {
        const iLt = (y * w + (x - 3)) * 4;
        const iRt = (y * w + (x + 3)) * 4;
        const cDiff =
          Math.abs(data[i1] - data[iLt]) +
          Math.abs(data[i1 + 1] - data[iLt + 1]) +
          Math.abs(data[i1 + 2] - data[iLt + 2]) +
          Math.abs(data[i1] - data[iRt]) +
          Math.abs(data[i1 + 1] - data[iRt + 1]) +
          Math.abs(data[i1 + 2] - data[iRt + 2]);
        if (cDiff >= 60) contrastCount++;
      }
    }
    if (flatCount / spanH >= 0.94 && contrastCount / spanH >= 0.45) {
      vLines.push(x);
    }
  }

  if (vLines.length > 0) {
    const bands: GutterBand[] = [];
    let s = vLines[0];
    let p = vLines[0];
    for (let i = 1; i < vLines.length; i++) {
      if (vLines[i] <= p + 2) {
        p = vLines[i];
      } else {
        bands.push({ start: s, end: p + 1 });
        s = vLines[i];
        p = vLines[i];
      }
    }
    bands.push({ start: s, end: p + 1 });
    const filtered = bands.filter(
      (b) => b.start - box.x0 >= minPanelW && box.x1 - b.end >= minPanelW
    );
    if (filtered.length > 0) {
      return { axis: 'v', bands: filtered };
    }
  }

  return null;
}

/**
 * Flood-fill connected components from box borders to separate non-guillotine /
 * interlocking / staggered comic panel islands while keeping framed interiors solid.
 */
function findConnectedPanelIslands(
  mask: Uint8Array,
  w: number,
  box: PixelBox,
  minPanelW: number,
  minPanelH: number
): PixelBox[] {
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  if (bw < minPanelW || bh < minPanelH) return [];

  const total = bw * bh;
  const visitedGutter = new Uint8Array(total);
  const queue = new Int32Array(total);
  let qHead = 0;
  let qTail = 0;

  const tryEnqueue = (lx: number, ly: number) => {
    const lIdx = ly * bw + lx;
    if (visitedGutter[lIdx]) return;
    if (mask[(box.y0 + ly) * w + (box.x0 + lx)] === 1) {
      visitedGutter[lIdx] = 1;
      queue[qTail++] = lIdx;
    }
  };

  // Seed from outer perimeter of the box
  for (let lx = 0; lx < bw; lx++) {
    tryEnqueue(lx, 0);
    tryEnqueue(lx, bh - 1);
  }
  for (let ly = 0; ly < bh; ly++) {
    tryEnqueue(0, ly);
    tryEnqueue(bw - 1, ly);
  }

  // Also seed from any strong horizontal/vertical gutter segments inside the box
  // in case an outer bleed frame encloses interior gutters
  const minRunX = Math.max(12, Math.floor(bw * 0.18));
  for (let ly = 0; ly < bh; ly += 2) {
    let run = 0;
    const rowOff = (box.y0 + ly) * w + box.x0;
    for (let lx = 0; lx < bw; lx++) {
      if (mask[rowOff + lx] === 1) {
        run++;
      } else {
        if (run >= minRunX) {
          for (let rx = lx - run; rx < lx; rx += 4) tryEnqueue(rx, ly);
        }
        run = 0;
      }
    }
    if (run >= minRunX) {
      for (let rx = bw - run; rx < bw; rx += 4) tryEnqueue(rx, ly);
    }
  }

  while (qHead < qTail) {
    const curr = queue[qHead++];
    const cx = curr % bw;
    const cy = (curr - cx) / bw;

    if (cx > 0) tryEnqueue(cx - 1, cy);
    if (cx < bw - 1) tryEnqueue(cx + 1, cy);
    if (cy > 0) tryEnqueue(cx, cy - 1);
    if (cy < bh - 1) tryEnqueue(cx, cy + 1);
  }

  // Find connected components of non-visited pixels (actual panel islands)
  const compVisited = new Uint8Array(total);
  const islands: PixelBox[] = [];

  for (let ly = 0; ly < bh; ly++) {
    for (let lx = 0; lx < bw; lx++) {
      const startIdx = ly * bw + lx;
      if (visitedGutter[startIdx] || compVisited[startIdx]) continue;

      let minX = lx;
      let maxX = lx;
      let minY = ly;
      let maxY = ly;
      let area = 0;

      compVisited[startIdx] = 1;
      qHead = 0;
      qTail = 0;
      queue[qTail++] = startIdx;

      while (qHead < qTail) {
        const curr = queue[qHead++];
        const cx = curr % bw;
        const cy = (curr - cx) / bw;
        area++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          cx > 0 ? curr - 1 : -1,
          cx < bw - 1 ? curr + 1 : -1,
          cy > 0 ? curr - bw : -1,
          cy < bh - 1 ? curr + bw : -1,
        ];
        for (const n of neighbors) {
          if (n >= 0 && !visitedGutter[n] && !compVisited[n]) {
            compVisited[n] = 1;
            queue[qTail++] = n;
          }
        }
      }

      const iw = maxX - minX + 1;
      const ih = maxY - minY + 1;
      if (iw >= minPanelW && ih >= minPanelH && area >= iw * ih * 0.28) {
        islands.push({
          x0: box.x0 + minX,
          y0: box.y0 + minY,
          x1: box.x0 + maxX + 1,
          y1: box.y0 + maxY + 1,
        });
      }
    }
  }

  return islands;
}

function recursiveXYCut(
  mask: Uint8Array,
  data: Uint8ClampedArray,
  w: number,
  h: number,
  rawBox: PixelBox,
  minPanelW: number,
  minPanelH: number,
  depth = 0
): PixelBox[] {
  const box = trimBox(mask, w, rawBox, 0.93);
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;

  if (bw < minPanelW || bh < minPanelH || depth > 9) {
    return bw >= minPanelW * 0.7 && bh >= minPanelH * 0.7 ? [box] : [];
  }

  // Pass 1: Strict clean gutters (handles 1px+ gutters cleanly)
  const hStrict = findHorizontalSplits(mask, w, box, 1, minPanelH, 0.93);
  if (hStrict.length > 0) {
    return splitAlongBands(box, hStrict, 'h').flatMap((sub) =>
      recursiveXYCut(mask, data, w, h, sub, minPanelW, minPanelH, depth + 1)
    );
  }

  const vStrict = findVerticalSplits(mask, w, box, 1, minPanelW, 0.93);
  if (vStrict.length > 0) {
    return splitAlongBands(box, vStrict, 'v').flatMap((sub) =>
      recursiveXYCut(mask, data, w, h, sub, minPanelW, minPanelH, depth + 1)
    );
  }

  // Pass 2: Medium tolerance for slight speech-bubble/artwork gutter bleeds
  if (bw > w * 0.35 || bh > h * 0.25) {
    const minBleedBand = Math.max(2, Math.floor(Math.min(w, h) * 0.003));
    const hMed = findHorizontalSplits(mask, w, box, minBleedBand, minPanelH, 0.84, 0.28);
    if (hMed.length > 0) {
      return splitAlongBands(box, hMed, 'h').flatMap((sub) =>
        recursiveXYCut(mask, data, w, h, sub, minPanelW, minPanelH, depth + 1)
      );
    }

    const vMed = findVerticalSplits(mask, w, box, minBleedBand, minPanelW, 0.84, 0.28);
    if (vMed.length > 0) {
      return splitAlongBands(box, vMed, 'v').flatMap((sub) =>
        recursiveXYCut(mask, data, w, h, sub, minPanelW, minPanelH, depth + 1)
      );
    }
  }

  // Pass 3: Connected-component flood-fill for staggered / interlocking / non-guillotine layouts
  if (bw > w * 0.4 || bh > h * 0.3) {
    const islands = findConnectedPanelIslands(mask, w, box, minPanelW, minPanelH);
    if (islands.length >= 2 && islands.length <= 16) {
      // Recurse into each island (at higher depth) in case two adjacent panels shared a border pixel
      return islands.flatMap((island) =>
        recursiveXYCut(mask, data, w, h, island, minPanelW, minPanelH, depth + 2)
      );
    }
  }

  // Pass 4: Uniform solid divider lines (panels touching with thin ink border & no gutter)
  if (bw > w * 0.45 || bh > h * 0.35) {
    const uniformSplit = findUniformDividerSplits(data, w, box, minPanelW, minPanelH);
    if (uniformSplit) {
      return splitAlongBands(box, uniformSplit.bands, uniformSplit.axis).flatMap((sub) =>
        recursiveXYCut(mask, data, w, h, sub, minPanelW, minPanelH, depth + 1)
      );
    }
  }

  // Pass 5: Soft bleed pass for large unsplit areas where speech bubbles cross ~25% of gutter
  if (bw > w * 0.5 || bh > h * 0.4) {
    const minSoftBand = Math.max(3, Math.floor(Math.min(w, h) * 0.005));
    const hSoft = findHorizontalSplits(mask, w, box, minSoftBand, minPanelH, 0.74, 0.28);
    if (hSoft.length > 0) {
      return splitAlongBands(box, hSoft, 'h').flatMap((sub) =>
        recursiveXYCut(mask, data, w, h, sub, minPanelW, minPanelH, depth + 1)
      );
    }

    const vSoft = findVerticalSplits(mask, w, box, minSoftBand, minPanelW, 0.74, 0.28);
    if (vSoft.length > 0) {
      return splitAlongBands(box, vSoft, 'v').flatMap((sub) =>
        recursiveXYCut(mask, data, w, h, sub, minPanelW, minPanelH, depth + 1)
      );
    }
  }

  return [box];
}

function filterTinyNoiseSegments(
  boxes: PixelBox[],
  mask: Uint8Array,
  edgeMap: Uint8Array,
  w: number,
  h: number
): PixelBox[] {
  const pageArea = w * h;

  return boxes.filter((b) => {
    const pixW = b.x1 - b.x0;
    const pixH = b.y1 - b.y0;
    const bw = pixW / w;
    const bh = pixH / h;
    const areaRatio = (pixW * pixH) / pageArea;
    const aspect = pixW / Math.max(1, pixH);

    // Reject tiny fragments and extreme 1D scan-line slivers
    if (bw < 0.085 || bh < 0.06 || areaRatio < 0.015) {
      return false;
    }
    if (aspect > 12 || aspect < 0.08) {
      return false;
    }

    // For smaller candidate regions, verify real panel edge/content density to filter dust,
    // page numbers, or margin smudges that survive thresholding
    if (areaRatio < 0.065) {
      let edgeHits = 0;
      let foregroundHits = 0;
      let samples = 0;
      const stepX = Math.max(1, Math.floor(pixW / 18));
      const stepY = Math.max(1, Math.floor(pixH / 18));

      for (let y = b.y0; y < b.y1; y += stepY) {
        for (let x = b.x0; x < b.x1; x += stepX) {
          samples++;
          const p = y * w + x;
          if (mask[p] === 0) foregroundHits++;
          if (edgeMap[p] >= 22) edgeHits++;
        }
      }

      const fgRatio = samples > 0 ? foregroundHits / samples : 0;
      const edgeRatio = samples > 0 ? edgeHits / samples : 0;
      if (fgRatio < 0.14 && edgeRatio < 0.02) {
        return false;
      }
    }

    return true;
  });
}

function deduplicateAndFilterBoxes(
  boxes: PixelBox[],
  mask: Uint8Array,
  edgeMap: Uint8Array,
  w: number,
  h: number
): PixelBox[] {
  const valid = filterTinyNoiseSegments(boxes, mask, edgeMap, w, h);

  if (valid.length <= 1) return valid;

  // Remove boxes that are almost completely contained (>88%) inside another box unless they are the finer split
  const keep: PixelBox[] = [];
  for (let i = 0; i < valid.length; i++) {
    const a = valid[i];
    const areaA = (a.x1 - a.x0) * (a.y1 - a.y0);
    let subsumedBySmaller = false;

    for (let j = 0; j < valid.length; j++) {
      if (i === j) continue;
      const b = valid[j];
      const areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
      const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
      const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
      const inter = ix * iy;

      // If `a` is practically identical to `b`, keep only the first
      if (inter / Math.max(areaA, areaB) > 0.9 && j < i) {
        subsumedBySmaller = true;
        break;
      }
      // If `a` contains `b` and `b` is significantly smaller (meaning `a` is an unsplit wrapper), skip `a`
      if (inter / areaB > 0.9 && areaA > areaB * 1.45) {
        subsumedBySmaller = true;
        break;
      }
    }

    if (!subsumedBySmaller) {
      keep.push(a);
    }
  }

  return keep;
}

function scoreSegmentation(
  boxes: PixelBox[],
  mask: Uint8Array,
  w: number,
  h: number,
  profile: GutterProfile,
  borderLightFraction: number,
  borderDarkFraction: number
): number {
  if (boxes.length === 0) return -100;

  const pageArea = w * h;
  let totalAreaRatio = 0;
  let totalArtworkDensity = 0;

  for (const b of boxes) {
    const bw = b.x1 - b.x0;
    const bh = b.y1 - b.y0;
    const area = bw * bh;
    totalAreaRatio += area / pageArea;

    let nonGutter = 0;
    let sampled = 0;
    const stepX = Math.max(1, Math.floor(bw / 24));
    const stepY = Math.max(1, Math.floor(bh / 24));
    for (let y = b.y0; y < b.y1; y += stepY) {
      for (let x = b.x0; x < b.x1; x += stepX) {
        sampled++;
        if (mask[y * w + x] === 0) nonGutter++;
      }
    }
    totalArtworkDensity += sampled > 0 ? nonGutter / sampled : 0;
  }

  const avgArtwork = totalArtworkDensity / boxes.length;

  let score = 0;
  if (boxes.length === 1) {
    score = 10 + totalAreaRatio * 10 + avgArtwork * 8;
  } else if (boxes.length >= 2 && boxes.length <= 14) {
    score = 30 + boxes.length * 4.5 + Math.min(totalAreaRatio, 0.95) * 24 + avgArtwork * 18;
  } else {
    score = 12 - (boxes.length - 14) * 3;
  }

  // Prior bonus when candidate gutter tone agrees with outer page margin
  if (profile.mode === 'light' && borderLightFraction >= 0.55) {
    score += 18;
  } else if (profile.mode === 'dark' && borderDarkFraction >= 0.55) {
    score += 18;
  }

  if (totalAreaRatio < 0.3) {
    score -= (0.3 - totalAreaRatio) * 50;
  }

  return score;
}

export function sortPanelsReadingOrder(panels: PanelRect[]): PanelRect[] {
  if (panels.length <= 1) return panels;

  const sortedByTop = [...panels].sort((a, b) => a.y - b.y);
  const tiers: PanelRect[][] = [];

  for (const p of sortedByTop) {
    const pMidY = p.y + p.height / 2;
    const matchingTier = tiers.find((tier) => {
      const tierMinY = Math.min(...tier.map((t) => t.y));
      const tierMaxY = Math.max(...tier.map((t) => t.y + t.height));
      const overlap = Math.min(tierMaxY, p.y + p.height) - Math.max(tierMinY, p.y);
      const minH = Math.min(tierMaxY - tierMinY, p.height);
      return overlap > minH * 0.35 || (pMidY >= tierMinY && pMidY <= tierMaxY);
    });

    if (matchingTier) {
      matchingTier.push(p);
    } else {
      tiers.push([p]);
    }
  }

  tiers.sort((a, b) => {
    const avgYA = a.reduce((acc, p) => acc + p.y, 0) / a.length;
    const avgYB = b.reduce((acc, p) => acc + p.y, 0) / b.length;
    return avgYA - avgYB;
  });

  const ordered: PanelRect[] = [];
  for (const tier of tiers) {
    tier.sort((a, b) => a.x - b.x);
    ordered.push(...tier);
  }
  return ordered;
}

function measureBorderLuminanceFractions(
  data: Uint8ClampedArray,
  w: number,
  h: number
): { borderLightFraction: number; borderDarkFraction: number } {
  let total = 0;
  let light = 0;
  let dark = 0;
  const band = Math.max(2, Math.floor(Math.min(w, h) * 0.02));

  const check = (x: number, y: number) => {
    const idx = (y * w + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    total++;
    if (lum >= 182 && sat <= 52) light++;
    else if (lum <= 54 && sat <= 40) dark++;
  };

  for (let y = 0; y < band; y++) {
    for (let x = 0; x < w; x += 2) {
      check(x, y);
      check(x, h - 1 - y);
    }
  }
  for (let x = 0; x < band; x++) {
    for (let y = band; y < h - band; y += 2) {
      check(x, y);
      check(w - 1 - x, y);
    }
  }

  return {
    borderLightFraction: total > 0 ? light / total : 0,
    borderDarkFraction: total > 0 ? dark / total : 0,
  };
}

export function detectPanelsFromImageData(
  rawData: Uint8ClampedArray,
  w: number,
  h: number
): PanelRect[] {
  const minPanelW = Math.max(20, Math.floor(w * 0.085));
  const minPanelH = Math.max(18, Math.floor(h * 0.06));

  // Pass 1: Pre-filter with Gaussian blur to reduce JPEG/halftone noise before thresholding
  const blurredData = applyGaussianBlurFilter(rawData, w, h);

  // Pass 2: Compute Sobel edge-magnitude map on the denoised image
  const edgeMap = computeSobelEdgeMap(blurredData, w, h);

  const { borderLightFraction, borderDarkFraction } = measureBorderLuminanceFractions(
    blurredData,
    w,
    h
  );
  const profiles = collectCandidateProfiles(blurredData, w, h);
  let bestBoxes: PixelBox[] = [];
  let bestScore = -Infinity;

  // Pass 3: Multi-pass thresholding, X-Y cut, flood-fill islands, and edge-divider splitting
  for (const profile of profiles) {
    const mask = buildGutterMask(blurredData, w, h, profile);
    const rawBoxes = recursiveXYCut(
      mask,
      rawData,
      w,
      h,
      { x0: 0, y0: 0, x1: w, y1: h },
      minPanelW,
      minPanelH
    );

    // Pass 4: Filter tiny noise segments and deduplicate nested containers
    const cleaned = deduplicateAndFilterBoxes(rawBoxes, mask, edgeMap, w, h);
    const score = scoreSegmentation(
      cleaned,
      mask,
      w,
      h,
      profile,
      borderLightFraction,
      borderDarkFraction
    );

    if (score > bestScore) {
      bestScore = score;
      bestBoxes = cleaned;
    }
  }

  if (bestBoxes.length === 0) {
    return [
      {
        id: createPanelId(0),
        x: 0.02,
        y: 0.02,
        width: 0.96,
        height: 0.96,
      },
    ];
  }

  const padX = 0.003;
  const padY = 0.003;

  const normalized: PanelRect[] = bestBoxes.map((b, i) => {
    const nx = Math.max(0, b.x0 / w - padX);
    const ny = Math.max(0, b.y0 / h - padY);
    const nx2 = Math.min(1, b.x1 / w + padX);
    const ny2 = Math.min(1, b.y1 / h + padY);
    return {
      id: createPanelId(i),
      x: nx,
      y: ny,
      width: Math.max(0.05, nx2 - nx),
      height: Math.max(0.05, ny2 - ny),
    };
  });

  return sortPanelsReadingOrder(normalized);
}

export function detectPanelsFromCanvas(sourceCanvas: HTMLCanvasElement): PanelRect[] {
  const maxDim = 1080;
  const scale = Math.min(1, maxDim / Math.max(sourceCanvas.width, sourceCanvas.height));
  const w = Math.max(32, Math.round(sourceCanvas.width * scale));
  const h = Math.max(32, Math.round(sourceCanvas.height * scale));

  const workCanvas = document.createElement('canvas');
  workCanvas.width = w;
  workCanvas.height = h;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  ctx.drawImage(sourceCanvas, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  return detectPanelsFromImageData(data, w, h);
}

export async function detectPanelsFromImageUrl(imageUrl: string): Promise<{
  panels: PanelRect[];
  width: number;
  height: number;
}> {
  const img = await loadImage(imageUrl);
  const naturalW = img.naturalWidth || img.width || 1000;
  const naturalH = img.naturalHeight || img.height || 1400;

  const maxDim = 1080;
  const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
  const w = Math.max(32, Math.round(naturalW * scale));
  const h = Math.max(32, Math.round(naturalH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { panels: [], width: naturalW, height: naturalH };
  }

  // Pre-pass canvas blur filter to smooth halftone dots and JPEG noise before pixel thresholding
  if ('filter' in ctx) {
    ctx.filter = 'blur(0.5px)';
  }
  ctx.drawImage(img, 0, 0, w, h);
  if ('filter' in ctx) {
    ctx.filter = 'none';
  }

  const { data } = ctx.getImageData(0, 0, w, h);
  const panels = detectPanelsFromImageData(data, w, h);

  return {
    panels,
    width: naturalW,
    height: naturalH,
  };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}
