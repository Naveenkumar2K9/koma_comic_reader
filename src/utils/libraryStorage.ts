import { ComicBook, ComicPage, LibraryComicSummary, PanelRect } from '../types/comic';

const DB_NAME = 'koma-comic-library';
const DB_VERSION = 1;
const STORE_COMICS = 'comics';
const STORE_PAGES = 'pages';

interface StoredPageMeta {
  id: string;
  index: number;
  name: string;
  width: number;
  height: number;
  panels: PanelRect[];
  panelsAutoDetected?: boolean;
}

interface StoredComicRecord {
  id: string;
  title: string;
  sourceLabel: string;
  pageCount: number;
  coverBlob: Blob | null;
  pagesMeta: StoredPageMeta[];
  lastPageIndex: number;
  lastStepIndex: number;
  addedAt: number;
}

interface StoredPageRecord {
  key: string;
  bookId: string;
  pageIndex: number;
  blob: Blob;
}

function openLibraryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_COMICS)) {
        db.createObjectStore(STORE_COMICS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PAGES)) {
        const pageStore = db.createObjectStore(STORE_PAGES, { keyPath: 'key' });
        pageStore.createIndex('bookId', 'bookId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open local comic library.'));
  });
}

async function getBlobForPage(page: ComicPage): Promise<Blob> {
  if (page.blob) return page.blob;
  const response = await fetch(page.imageUrl);
  return response.blob();
}

export async function saveComicToLibrary(book: ComicBook): Promise<void> {
  const pageBlobs = await Promise.all(book.pages.map((p) => getBlobForPage(p)));
  const db = await openLibraryDb();

  const record: StoredComicRecord = {
    id: book.id,
    title: book.title,
    sourceLabel: book.sourceLabel,
    pageCount: book.pages.length,
    coverBlob: pageBlobs[0] ?? null,
    pagesMeta: book.pages.map((p) => ({
      id: p.id,
      index: p.index,
      name: p.name,
      width: p.width,
      height: p.height,
      panels: p.panels,
      panelsAutoDetected: p.panelsAutoDetected,
    })),
    lastPageIndex: book.lastPageIndex ?? 0,
    lastStepIndex: book.lastStepIndex ?? 0,
    addedAt: book.addedAt ?? Date.now(),
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_COMICS, STORE_PAGES], 'readwrite');
    const comicsStore = tx.objectStore(STORE_COMICS);
    const pagesStore = tx.objectStore(STORE_PAGES);

    comicsStore.put(record);
    pageBlobs.forEach((blob, idx) => {
      const pageRecord: StoredPageRecord = {
        key: `${book.id}::${idx}`,
        bookId: book.id,
        pageIndex: idx,
        blob,
      };
      pagesStore.put(pageRecord);
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save comic to local library.'));
    tx.onabort = () => reject(tx.error ?? new Error('Saving comic was aborted.'));
  });

  db.close();
}

export async function listLibraryComics(): Promise<LibraryComicSummary[]> {
  try {
    const db = await openLibraryDb();
    const records = await new Promise<StoredComicRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_COMICS, 'readonly');
      const store = tx.objectStore(STORE_COMICS);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as StoredComicRecord[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    db.close();

    return records
      .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
      .map((rec) => ({
        id: rec.id,
        title: rec.title,
        sourceLabel: rec.sourceLabel,
        pageCount: rec.pageCount,
        coverUrl: rec.coverBlob ? URL.createObjectURL(rec.coverBlob) : '',
        lastPageIndex: rec.lastPageIndex ?? 0,
        lastStepIndex: rec.lastStepIndex ?? 0,
        addedAt: rec.addedAt ?? 0,
      }));
  } catch {
    return [];
  }
}

export async function loadComicFromLibrary(bookId: string): Promise<ComicBook | null> {
  const db = await openLibraryDb();

  const record = await new Promise<StoredComicRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_COMICS, 'readonly');
    const req = tx.objectStore(STORE_COMICS).get(bookId);
    req.onsuccess = () => resolve(req.result as StoredComicRecord | undefined);
    req.onerror = () => reject(req.error);
  });

  if (!record) {
    db.close();
    return null;
  }

  const pageRecords = await new Promise<StoredPageRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_PAGES, 'readonly');
    const index = tx.objectStore(STORE_PAGES).index('bookId');
    const req = index.getAll(bookId);
    req.onsuccess = () => resolve((req.result as StoredPageRecord[]) ?? []);
    req.onerror = () => reject(req.error);
  });

  db.close();

  const blobByIndex = new Map<number, Blob>();
  for (const pr of pageRecords) {
    blobByIndex.set(pr.pageIndex, pr.blob);
  }

  const pages: ComicPage[] = record.pagesMeta.map((meta, idx) => {
    const blob = blobByIndex.get(idx);
    const imageUrl = blob ? URL.createObjectURL(blob) : '';
    return {
      ...meta,
      blob,
      imageUrl,
    };
  });

  return {
    id: record.id,
    title: record.title,
    sourceLabel: record.sourceLabel,
    pages,
    lastPageIndex: record.lastPageIndex ?? 0,
    lastStepIndex: record.lastStepIndex ?? 0,
    addedAt: record.addedAt,
  };
}

export async function updateComicPanelsInLibrary(
  bookId: string,
  pageIndex: number,
  panels: PanelRect[]
): Promise<void> {
  try {
    const db = await openLibraryDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_COMICS, 'readwrite');
      const store = tx.objectStore(STORE_COMICS);
      const req = store.get(bookId);
      req.onsuccess = () => {
        const rec = req.result as StoredComicRecord | undefined;
        if (!rec || !rec.pagesMeta[pageIndex]) return;
        rec.pagesMeta[pageIndex] = {
          ...rec.pagesMeta[pageIndex],
          panels,
          panelsAutoDetected: false,
        };
        store.put(rec);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Non-fatal persistence error
  }
}

export async function updateComicProgressInLibrary(
  bookId: string,
  lastPageIndex: number,
  lastStepIndex: number
): Promise<void> {
  try {
    const db = await openLibraryDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_COMICS, 'readwrite');
      const store = tx.objectStore(STORE_COMICS);
      const req = store.get(bookId);
      req.onsuccess = () => {
        const rec = req.result as StoredComicRecord | undefined;
        if (!rec) return;
        rec.lastPageIndex = lastPageIndex;
        rec.lastStepIndex = lastStepIndex;
        store.put(rec);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Non-fatal persistence error
  }
}

export async function deleteComicFromLibrary(bookId: string): Promise<void> {
  const db = await openLibraryDb();

  const keysToDelete = await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(STORE_PAGES, 'readonly');
    const index = tx.objectStore(STORE_PAGES).index('bookId');
    const req = index.getAllKeys(bookId);
    req.onsuccess = () => resolve((req.result as string[]) ?? []);
    req.onerror = () => reject(req.error);
  });

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_COMICS, STORE_PAGES], 'readwrite');
    tx.objectStore(STORE_COMICS).delete(bookId);
    const pagesStore = tx.objectStore(STORE_PAGES);
    for (const key of keysToDelete) {
      pagesStore.delete(key);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
}
