/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ComicViewport } from './components/ComicViewport';
import { LandingScreen } from './components/LandingScreen';
import { ReaderHUD } from './components/ReaderHUD';
import {
  ComicBook,
  GuidedStep,
  LibraryComicSummary,
  LoadProgress,
  PanelRect,
  ViewMode,
} from './types/comic';
import { loadComicFiles, revokeComicUrls } from './utils/comicLoader';
import { buildBookGuidedSteps } from './utils/guidedSteps';
import {
  deleteComicFromLibrary,
  listLibraryComics,
  loadComicFromLibrary,
  saveComicToLibrary,
  updateComicPanelsInLibrary,
  updateComicProgressInLibrary,
} from './utils/libraryStorage';
import { detectPanelsFromImageUrl } from './utils/panelDetector';

export default function App() {
  const [screen, setScreen] = useState<'landing' | 'reader'>('landing');
  const [book, setBook] = useState<ComicBook | null>(null);
  const [library, setLibrary] = useState<LibraryComicSummary[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('guided');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);

  const [hudVisible, setHudVisible] = useState(true);
  const hudTimerRef = useRef<number | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewportSize, setViewportSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  const [stepIndex, setStepIndex] = useState(0);
  const [standardPageIndex, setStandardPageIndex] = useState(0);

  const refreshLibrary = useCallback(async () => {
    setIsLibraryLoading(true);
    const items = await listLibraryComics();
    setLibrary((prev) => {
      for (const old of prev) {
        if (old.coverUrl.startsWith('blob:')) {
          URL.revokeObjectURL(old.coverUrl);
        }
      }
      return items;
    });
    setIsLibraryLoading(false);
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  // Track native fullscreen state changes
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const scheduleHudHide = useCallback(() => {
    if (hudTimerRef.current !== null) {
      window.clearTimeout(hudTimerRef.current);
      hudTimerRef.current = null;
    }
    if (screen !== 'reader' || isEditing) return;
    hudTimerRef.current = window.setTimeout(() => {
      setHudVisible(false);
    }, 3200);
  }, [screen, isEditing]);

  useEffect(() => {
    if (screen === 'reader' && hudVisible && !isEditing) {
      scheduleHudHide();
    }
    return () => {
      if (hudTimerRef.current !== null) {
        window.clearTimeout(hudTimerRef.current);
        hudTimerRef.current = null;
      }
    };
  }, [screen, hudVisible, isEditing, scheduleHudHide]);

  const guidedSteps: GuidedStep[] = useMemo(() => {
    if (!book) return [];
    return buildBookGuidedSteps(book.pages, viewportSize.width, viewportSize.height);
  }, [book, viewportSize.width, viewportSize.height]);

  const clampedStepIndex = Math.min(stepIndex, Math.max(0, guidedSteps.length - 1));
  const currentStep: GuidedStep = guidedSteps[clampedStepIndex] ?? {
    id: 'fallback',
    kind: 'overview-enter',
    pageIndex: 0,
    panelIndex: null,
    subStep: 'full',
  };

  const activePageIndex =
    viewMode === 'guided'
      ? Math.min(currentStep.pageIndex, Math.max(0, (book?.pages.length ?? 1) - 1))
      : Math.min(standardPageIndex, Math.max(0, (book?.pages.length ?? 1) - 1));

  const currentPage = book?.pages[activePageIndex] ?? null;

  // Persist reading progress locally to IndexedDB
  useEffect(() => {
    if (screen !== 'reader' || !book) return;
    const timer = window.setTimeout(() => {
      updateComicProgressInLibrary(book.id, activePageIndex, clampedStepIndex);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [screen, book, activePageIndex, clampedStepIndex]);

  const openLoadedBook = useCallback((loaded: ComicBook) => {
    setBook((prev) => {
      if (prev && prev.id !== loaded.id) {
        revokeComicUrls(prev);
      }
      return loaded;
    });
    const savedPage = Math.max(0, Math.min(loaded.pages.length - 1, loaded.lastPageIndex ?? 0));
    setStandardPageIndex(savedPage);
    setStepIndex(loaded.lastStepIndex ?? 0);
    setViewMode('guided');
    setIsEditing(false);
    setSelectedPanelId(null);
    setScreen('reader');
    setHudVisible(true);
  }, []);

  const handleFilesSelected = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      setIsLoading(true);
      setProgress({ stage: 'Reading files', current: 0, total: 1 });
      try {
        const loaded = await loadComicFiles(files, (p) => setProgress(p));
        setProgress({ stage: 'Saving to offline library', current: 1, total: 1 });
        await saveComicToLibrary(loaded);
        await refreshLibrary();
        openLoadedBook(loaded);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open comic file.');
      } finally {
        setIsLoading(false);
        setProgress(null);
      }
    },
    [openLoadedBook, refreshLibrary]
  );

  const handleOpenLibraryComic = useCallback(
    async (bookId: string) => {
      setError(null);
      setIsLoading(true);
      setProgress({ stage: 'Opening comic', current: 1, total: 1 });
      try {
        const loaded = await loadComicFromLibrary(bookId);
        if (!loaded) {
          throw new Error('Could not find this comic in local storage.');
        }
        openLoadedBook(loaded);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load saved comic.');
      } finally {
        setIsLoading(false);
        setProgress(null);
      }
    },
    [openLoadedBook]
  );

  const handleDeleteLibraryComic = useCallback(
    async (bookId: string) => {
      try {
        await deleteComicFromLibrary(bookId);
        if (book?.id === bookId) {
          revokeComicUrls(book);
          setBook(null);
        }
        await refreshLibrary();
      } catch {
        setError('Unable to remove comic from local library.');
      }
    },
    [book, refreshLibrary]
  );

  const handleViewportResize = useCallback((width: number, height: number) => {
    setViewportSize((prev) => {
      if (Math.abs(prev.width - width) < 2 && Math.abs(prev.height - height) < 2) {
        return prev;
      }
      return { width, height };
    });
  }, []);

  const canPrev =
    viewMode === 'guided' ? clampedStepIndex > 0 : activePageIndex > 0;

  const canNext =
    viewMode === 'guided'
      ? clampedStepIndex < guidedSteps.length - 1
      : activePageIndex < (book?.pages.length ?? 1) - 1;

  const handlePrev = useCallback(() => {
    if (!book) return;
    if (viewMode === 'guided') {
      setStepIndex((idx) => Math.max(0, Math.min(idx, guidedSteps.length - 1) - 1));
    } else {
      setStandardPageIndex((idx) => Math.max(0, idx - 1));
    }
  }, [book, viewMode, guidedSteps.length]);

  const handleNext = useCallback(() => {
    if (!book) return;
    if (viewMode === 'guided') {
      setStepIndex((idx) => Math.min(guidedSteps.length - 1, idx + 1));
    } else {
      setStandardPageIndex((idx) => Math.min(book.pages.length - 1, idx + 1));
    }
  }, [book, viewMode, guidedSteps.length]);

  const handleJumpToPage = useCallback(
    (targetPage: number) => {
      if (!book) return;
      const clampedPage = Math.max(0, Math.min(book.pages.length - 1, targetPage));
      setStandardPageIndex(clampedPage);
      const targetStepIdx = guidedSteps.findIndex(
        (s) => s.pageIndex === clampedPage && s.kind === 'overview-enter'
      );
      if (targetStepIdx >= 0) {
        setStepIndex(targetStepIdx);
      }
      scheduleHudHide();
    },
    [book, guidedSteps, scheduleHudHide]
  );

  const handleChangeViewMode = useCallback(
    (nextMode: ViewMode) => {
      if (nextMode === viewMode) return;
      if (nextMode === 'standard') {
        setStandardPageIndex(activePageIndex);
      } else {
        const targetStepIdx = guidedSteps.findIndex(
          (s) => s.pageIndex === activePageIndex && s.kind === 'overview-enter'
        );
        setStepIndex(targetStepIdx >= 0 ? targetStepIdx : 0);
      }
      setViewMode(nextMode);
      scheduleHudHide();
    },
    [viewMode, activePageIndex, guidedSteps, scheduleHudHide]
  );

  const handleToggleEditPanels = useCallback(() => {
    setIsEditing((prev) => {
      const next = !prev;
      if (next) {
        setStandardPageIndex(activePageIndex);
        setSelectedPanelId(currentPage?.panels[0]?.id ?? null);
        setHudVisible(true);
      } else {
        const targetStepIdx = guidedSteps.findIndex(
          (s) => s.pageIndex === activePageIndex && s.kind === 'overview-enter'
        );
        if (targetStepIdx >= 0) {
          setStepIndex(targetStepIdx);
        }
        setSelectedPanelId(null);
      }
      return next;
    });
  }, [activePageIndex, currentPage, guidedSteps]);

  const handleUpdatePagePanels = useCallback(
    (nextPanels: PanelRect[]) => {
      setBook((prev) => {
        if (!prev) return prev;
        const pages = prev.pages.map((p, idx) =>
          idx === activePageIndex
            ? { ...p, panels: nextPanels, panelsAutoDetected: false }
            : p
        );
        updateComicPanelsInLibrary(prev.id, activePageIndex, nextPanels);
        return { ...prev, pages };
      });
    },
    [activePageIndex]
  );

  const handleRedetectPagePanels = useCallback(async () => {
    if (!currentPage) return;
    try {
      const { panels } = await detectPanelsFromImageUrl(currentPage.imageUrl);
      handleUpdatePagePanels(panels);
      setSelectedPanelId(panels[0]?.id ?? null);
    } catch {
      // Keep existing panels if detection fails
    }
  }, [currentPage, handleUpdatePagePanels]);

  const handleToggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Gracefully ignore if embedded iframe blocks fullscreen API
    }
    scheduleHudHide();
  }, [scheduleHudHide]);

  const handleToggleHud = useCallback(() => {
    setHudVisible((prev) => !prev);
  }, []);

  // Keyboard shortcuts during reading
  useEffect(() => {
    if (screen !== 'reader') return;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        if (isEditing) {
          handleToggleEditPanels();
        } else if (hudVisible) {
          setHudVisible(false);
        }
        return;
      }

      if (isEditing) {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPanelId && currentPage) {
          e.preventDefault();
          const idx = currentPage.panels.findIndex((p) => p.id === selectedPanelId);
          const next = currentPage.panels.filter((p) => p.id !== selectedPanelId);
          handleUpdatePagePanels(next);
          setSelectedPanelId(next[Math.min(idx, next.length - 1)]?.id ?? null);
        }
        return;
      }

      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        handleToggleEditPanels();
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        handleChangeViewMode(viewMode === 'guided' ? 'standard' : 'guided');
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleToggleFullscreen();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    screen,
    isEditing,
    hudVisible,
    selectedPanelId,
    currentPage,
    viewMode,
    handleNext,
    handlePrev,
    handleToggleEditPanels,
    handleChangeViewMode,
    handleToggleFullscreen,
    handleUpdatePagePanels,
  ]);

  if (screen === 'landing' || !book || !currentPage) {
    return (
      <LandingScreen
        library={library}
        isLibraryLoading={isLibraryLoading}
        onFilesSelected={handleFilesSelected}
        onOpenLibraryComic={handleOpenLibraryComic}
        onDeleteLibraryComic={handleDeleteLibraryComic}
        isLoading={isLoading}
        progress={progress}
        error={error}
        onDismissError={() => setError(null)}
      />
    );
  }

  const activePanelNumber =
    viewMode === 'guided' && currentStep.kind === 'panel' && currentStep.panelIndex !== null
      ? currentStep.panelIndex + 1
      : null;

  const subStepLabel =
    viewMode === 'guided' && currentStep.kind === 'panel'
      ? currentStep.subStep === 'left'
        ? 'Left'
        : currentStep.subStep === 'right'
        ? 'Right'
        : null
      : null;

  return (
    <div className="relative w-screen h-dvh bg-black overflow-hidden">
      <ComicViewport
        page={currentPage}
        step={currentStep}
        viewMode={viewMode}
        isEditing={isEditing}
        selectedPanelId={selectedPanelId}
        onSelectPanel={setSelectedPanelId}
        onUpdatePagePanels={handleUpdatePagePanels}
        onRedetectPagePanels={handleRedetectPagePanels}
        onExitEdit={handleToggleEditPanels}
        onPrev={handlePrev}
        onNext={handleNext}
        onToggleHud={handleToggleHud}
        onViewportResize={handleViewportResize}
      />

      <ReaderHUD
        visible={hudVisible}
        isEditing={isEditing}
        bookTitle={book.title}
        pageIndex={activePageIndex}
        totalPages={book.pages.length}
        activePanelNumber={activePanelNumber}
        totalPanelsOnPage={currentPage.panels.length}
        subStepLabel={subStepLabel}
        viewMode={viewMode}
        isFullscreen={isFullscreen}
        canPrev={canPrev}
        canNext={canNext}
        onBackToLanding={() => {
          setIsEditing(false);
          refreshLibrary();
          setScreen('landing');
        }}
        onPrev={handlePrev}
        onNext={handleNext}
        onJumpToPage={handleJumpToPage}
        onChangeViewMode={handleChangeViewMode}
        onToggleEditPanels={handleToggleEditPanels}
        onToggleFullscreen={handleToggleFullscreen}
        onInteract={scheduleHudHide}
      />
    </div>
  );
}
