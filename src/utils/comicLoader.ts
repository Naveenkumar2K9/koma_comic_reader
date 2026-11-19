import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createExtractorFromData } from 'node-unrar-js/esm/index.esm.js';
import unrarWasmUrl from 'node-unrar-js/esm/js/unrar.wasm?url';
import { ComicBook, ComicPage, LoadProgress } from '../types/comic';
import { detectPanelsFromCanvas, detectPanelsFromImageUrl } from './panelDetector';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif']);

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

function isSupportedImageName(name: string): boolean {
  const normalized = name.trim();
  if (!normalized) return false;
  if (normalized.includes('__MACOSX/') || normalized.split('/').pop()?.startsWith('._')) {
    return false;
  }
  const ext = normalized.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}

function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? 'jpeg';
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'avif':
      return 'image/avif';
    default:
      return 'image/jpeg';
  }
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '');
}

let cachedWasmBinary: ArrayBuffer | null = null;
async function getUnrarWasmBinary(): Promise<ArrayBuffer> {
  if (!cachedWasmBinary) {
    const res = await fetch(unrarWasmUrl);
    if (!res.ok) {
      throw new Error('Failed to load RAR decoder module.');
    }
    cachedWasmBinary = await res.arrayBuffer();
  }
  return cachedWasmBinary;
}

export function revokeComicUrls(book: ComicBook | null): void {
  if (!book) return;
  for (const page of book.pages) {
    if (page.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(page.imageUrl);
    }
  }
}

async function finalizeImagePages(
  entries: Array<{ name: string; imageUrl: string; blob: Blob; preCanvas?: HTMLCanvasElement }>,
  onProgress?: (p: LoadProgress) => void
): Promise<ComicPage[]> {
  const pages: ComicPage[] = [];
  const total = entries.length;

  for (let i = 0; i < total; i++) {
    const entry = entries[i];
    onProgress?.({
      stage: 'Detecting comic panels',
      current: i + 1,
      total,
    });

    if (entry.preCanvas) {
      const panels = detectPanelsFromCanvas(entry.preCanvas);
      pages.push({
        id: `page-${i}-${Date.now()}`,
        index: i,
        name: entry.name,
        imageUrl: entry.imageUrl,
        blob: entry.blob,
        width: entry.preCanvas.width,
        height: entry.preCanvas.height,
        panels,
        panelsAutoDetected: true,
      });
    } else {
      const { panels, width, height } = await detectPanelsFromImageUrl(entry.imageUrl);
      pages.push({
        id: `page-${i}-${Date.now()}`,
        index: i,
        name: entry.name,
        imageUrl: entry.imageUrl,
        blob: entry.blob,
        width,
        height,
        panels,
        panelsAutoDetected: true,
      });
    }
  }

  return pages;
}

async function loadZipArchive(
  file: File,
  onProgress?: (p: LoadProgress) => void
): Promise<ComicBook> {
  onProgress?.({ stage: 'Reading archive', current: 0, total: 1 });
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const imageEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir && isSupportedImageName(entry.name))
    .sort((a, b) => naturalCompare(a.name, b.name));

  if (imageEntries.length === 0) {
    throw new Error('No supported comic page images (.jpg, .png, .webp) were found inside this archive.');
  }

  const extracted: Array<{ name: string; imageUrl: string; blob: Blob }> = [];
  for (let i = 0; i < imageEntries.length; i++) {
    const entry = imageEntries[i];
    onProgress?.({
      stage: 'Extracting pages',
      current: i + 1,
      total: imageEntries.length,
    });
    const rawBlob = await entry.async('blob');
    const typedBlob = rawBlob.type ? rawBlob : new Blob([rawBlob], { type: mimeFromName(entry.name) });
    extracted.push({
      name: entry.name.split('/').pop() ?? `Page ${i + 1}`,
      imageUrl: URL.createObjectURL(typedBlob),
      blob: typedBlob,
    });
  }

  const pages = await finalizeImagePages(extracted, onProgress);
  return {
    id: `book-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: stripExtension(file.name),
    sourceLabel: `${pages.length} ${pages.length === 1 ? 'page' : 'pages'} · ${file.name.split('.').pop()?.toUpperCase() ?? 'CBZ'}`,
    pages,
    addedAt: Date.now(),
  };
}

async function loadRarArchive(
  file: File,
  onProgress?: (p: LoadProgress) => void
): Promise<ComicBook> {
  onProgress?.({ stage: 'Loading RAR extractor', current: 0, total: 1 });
  const [buffer, wasmBinary] = await Promise.all([file.arrayBuffer(), getUnrarWasmBinary()]);

  const extractor = await createExtractorFromData({
    wasmBinary,
    data: buffer,
  });

  const list = extractor.getFileList();
  const headers = [...list.fileHeaders].filter(
    (h) => !h.flags.directory && isSupportedImageName(h.name)
  );

  headers.sort((a, b) => naturalCompare(a.name, b.name));

  if (headers.length === 0) {
    throw new Error('No supported comic page images were found inside this .cbr archive.');
  }

  const targetNames = new Set(headers.map((h) => h.name));
  const extractedResult = extractor.extract({
    files: (header) => targetNames.has(header.name),
  });

  const extractedFiles = [...extractedResult.files]
    .filter((f) => f.extraction && !f.fileHeader.flags.directory && isSupportedImageName(f.fileHeader.name))
    .sort((a, b) => naturalCompare(a.fileHeader.name, b.fileHeader.name));

  const items: Array<{ name: string; imageUrl: string; blob: Blob }> = [];
  for (let i = 0; i < extractedFiles.length; i++) {
    const item = extractedFiles[i];
    onProgress?.({
      stage: 'Extracting CBR pages',
      current: i + 1,
      total: extractedFiles.length,
    });
    if (!item.extraction) continue;
    const rawBytes = new Uint8Array(item.extraction);
    const blob = new Blob([rawBytes], { type: mimeFromName(item.fileHeader.name) });
    items.push({
      name: item.fileHeader.name.split('/').pop() ?? `Page ${i + 1}`,
      imageUrl: URL.createObjectURL(blob),
      blob,
    });
  }

  if (items.length === 0) {
    throw new Error('Could not extract images from this CBR file. Encrypted or damaged RAR archives are unsupported.');
  }

  const pages = await finalizeImagePages(items, onProgress);
  return {
    id: `book-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: stripExtension(file.name),
    sourceLabel: `${pages.length} ${pages.length === 1 ? 'page' : 'pages'} · CBR`,
    pages,
    addedAt: Date.now(),
  };
}

async function loadPdfFile(
  file: File,
  onProgress?: (p: LoadProgress) => void
): Promise<ComicBook> {
  onProgress?.({ stage: 'Opening PDF document', current: 0, total: 1 });
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  if (numPages === 0) {
    throw new Error('This PDF contains no pages.');
  }

  const extracted: Array<{ name: string; imageUrl: string; blob: Blob; preCanvas: HTMLCanvasElement }> = [];

  for (let p = 1; p <= numPages; p++) {
    onProgress?.({
      stage: 'Rendering PDF pages',
      current: p,
      total: numPages,
    });

    const page = await pdf.getPage(p);
    const baseViewport = page.getViewport({ scale: 1 });
    const maxTargetDim = 2100;
    const desiredScale = Math.min(2.2, maxTargetDim / Math.max(baseViewport.width, baseViewport.height));
    const renderScale = Math.max(1.2, desiredScale);
    const viewport = page.getViewport({ scale: renderScale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to render PDF page'))),
        'image/jpeg',
        0.92
      );
    });

    extracted.push({
      name: `Page ${p}`,
      imageUrl: URL.createObjectURL(blob),
      blob,
      preCanvas: canvas,
    });
  }

  const pages = await finalizeImagePages(extracted, onProgress);
  return {
    id: `book-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: stripExtension(file.name),
    sourceLabel: `${pages.length} ${pages.length === 1 ? 'page' : 'pages'} · PDF`,
    pages,
    addedAt: Date.now(),
  };
}

async function loadImageBatch(
  files: File[],
  onProgress?: (p: LoadProgress) => void
): Promise<ComicBook> {
  const validFiles = files
    .filter((f) => isSupportedImageName(f.name) || f.type.startsWith('image/'))
    .sort((a, b) => naturalCompare(a.name, b.name));

  if (validFiles.length === 0) {
    throw new Error('No supported image files (.jpg, .png, .webp) were selected.');
  }

  const entries = validFiles.map((file, i) => {
    onProgress?.({
      stage: 'Loading images',
      current: i + 1,
      total: validFiles.length,
    });
    return {
      name: file.name,
      imageUrl: URL.createObjectURL(file),
      blob: file,
    };
  });

  const pages = await finalizeImagePages(entries, onProgress);
  const title =
    validFiles.length === 1
      ? stripExtension(validFiles[0].name)
      : `${stripExtension(validFiles[0].name)} (+${validFiles.length - 1})`;

  return {
    id: `book-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    sourceLabel: `${pages.length} ${pages.length === 1 ? 'page' : 'pages'} · Images`,
    pages,
    addedAt: Date.now(),
  };
}

export async function loadComicFiles(
  fileList: FileList | File[],
  onProgress?: (p: LoadProgress) => void
): Promise<ComicBook> {
  const files = Array.from(fileList);
  if (files.length === 0) {
    throw new Error('Please choose a comic archive, PDF, or image files.');
  }

  if (files.length === 1) {
    const file = files[0];
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (ext === 'cbz' || ext === 'zip') {
      return loadZipArchive(file, onProgress);
    }
    if (ext === 'cbr' || ext === 'rar') {
      return loadRarArchive(file, onProgress);
    }
    if (ext === 'pdf') {
      return loadPdfFile(file, onProgress);
    }
    if (isSupportedImageName(file.name) || file.type.startsWith('image/')) {
      return loadImageBatch([file], onProgress);
    }
    throw new Error(
      `Unsupported file format ".${ext || 'unknown'}". Supported formats: .cbz, .zip, .cbr, .pdf, .jpg, .png, .webp.`
    );
  }

  const imageFiles = files.filter((f) => isSupportedImageName(f.name) || f.type.startsWith('image/'));
  if (imageFiles.length > 0) {
    return loadImageBatch(imageFiles, onProgress);
  }

  const archiveFile = files.find((f) => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    return ['cbz', 'zip', 'cbr', 'rar', 'pdf'].includes(ext);
  });

  if (archiveFile) {
    return loadComicFiles([archiveFile], onProgress);
  }

  throw new Error('No supported comic archives, PDFs, or image files found.');
}
