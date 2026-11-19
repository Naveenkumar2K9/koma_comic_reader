import React from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  PencilRuler,
  ScanEye,
  Square,
} from 'lucide-react';
import { ViewMode } from '../types/comic';

interface ReaderHUDProps {
  visible: boolean;
  isEditing: boolean;
  bookTitle: string;
  pageIndex: number;
  totalPages: number;
  activePanelNumber: number | null;
  totalPanelsOnPage: number;
  subStepLabel: string | null;
  viewMode: ViewMode;
  isFullscreen: boolean;
  canPrev: boolean;
  canNext: boolean;
  onBackToLanding: () => void;
  onPrev: () => void;
  onNext: () => void;
  onJumpToPage: (pageIndex: number) => void;
  onChangeViewMode: (mode: ViewMode) => void;
  onToggleEditPanels: () => void;
  onToggleFullscreen: () => void;
  onInteract: () => void;
}

export const ReaderHUD: React.FC<ReaderHUDProps> = ({
  visible,
  isEditing,
  bookTitle,
  pageIndex,
  totalPages,
  activePanelNumber,
  totalPanelsOnPage,
  subStepLabel,
  viewMode,
  isFullscreen,
  canPrev,
  canNext,
  onBackToLanding,
  onPrev,
  onNext,
  onJumpToPage,
  onChangeViewMode,
  onToggleEditPanels,
  onToggleFullscreen,
  onInteract,
}) => {
  const showTopBar = visible || isEditing;
  const showBottomBar = visible && !isEditing;

  const panelDisplay =
    viewMode === 'standard'
      ? 'Full Page'
      : activePanelNumber !== null
      ? `Panel ${activePanelNumber} of ${totalPanelsOnPage}${subStepLabel ? ` · ${subStepLabel}` : ''}`
      : totalPanelsOnPage > 0
      ? `Overview · ${totalPanelsOnPage} panels`
      : 'Full Page';

  return (
    <>
      {/* Top Floating Bar */}
      <div
        data-hud-interactive
        onPointerMove={onInteract}
        onClick={(e) => {
          e.stopPropagation();
          onInteract();
        }}
        className={`fixed top-3 left-3 right-3 z-40 max-w-4xl mx-auto transition-all duration-200 ${
          showTopBar
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 -translate-y-3 pointer-events-none'
        }`}
      >
        <div className="rounded-xl bg-zinc-950/88 backdrop-blur-md border border-white/12 px-3 py-2 flex items-center justify-between gap-3 shadow-2xl">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBackToLanding}
              aria-label="Back to library"
              className="min-h-[40px] min-w-[40px] px-2.5 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white flex items-center gap-1.5 text-xs font-medium transition-colors shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Library</span>
            </button>
            <span className="h-4 w-px bg-white/15 shrink-0" aria-hidden="true" />
            <h1 className="font-display text-sm font-semibold text-zinc-100 truncate">
              {bookTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 font-mono-nums text-xs text-zinc-300 whitespace-nowrap shrink-0">
            <span>
              Page {pageIndex + 1} of {totalPages}
            </span>
            <span className="text-zinc-600" aria-hidden="true">
              ·
            </span>
            <span className={activePanelNumber !== null && viewMode === 'guided' ? 'text-amber-400 font-medium' : 'text-zinc-400'}>
              {panelDisplay}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Floating Control Dock */}
      <div
        data-hud-interactive
        onPointerMove={onInteract}
        onClick={(e) => {
          e.stopPropagation();
          onInteract();
        }}
        className={`fixed bottom-3 left-3 right-3 z-40 max-w-3xl mx-auto transition-all duration-200 ${
          showBottomBar
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-3 pointer-events-none'
        }`}
      >
        <div className="rounded-2xl bg-zinc-950/90 backdrop-blur-md border border-white/12 px-3 py-2 shadow-2xl flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
          {/* Page & Step Navigation */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <button
              type="button"
              onClick={onPrev}
              disabled={!canPrev}
              aria-label="Previous panel or page"
              className="min-h-[44px] min-w-[44px] rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-100 flex items-center justify-center disabled:opacity-30 transition-colors shrink-0 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex-1 px-2 flex items-center gap-2 min-w-[80px]">
              <input
                type="range"
                aria-label="Jump to page"
                min={0}
                max={Math.max(0, totalPages - 1)}
                value={pageIndex}
                onChange={(e) => onJumpToPage(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
              />
            </div>

            <button
              type="button"
              onClick={onNext}
              disabled={!canNext}
              aria-label="Next panel or page"
              className="min-h-[44px] min-w-[44px] rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-100 flex items-center justify-center disabled:opacity-30 transition-colors shrink-0 cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Mode Switch + Edit + Fullscreen */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Guided vs Standard Segmented Toggle */}
            <div
              role="group"
              aria-label="Reading view mode"
              className="flex items-center p-1 rounded-xl bg-zinc-900 border border-white/10"
            >
              <button
                type="button"
                onClick={() => onChangeViewMode('guided')}
                className={`min-h-[36px] px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'guided'
                    ? 'bg-amber-400 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                <ScanEye className="w-3.5 h-3.5" />
                <span>Guided</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeViewMode('standard')}
                className={`min-h-[36px] px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'standard'
                    ? 'bg-zinc-100 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                <Square className="w-3.5 h-3.5" />
                <span>Full Page</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onToggleEditPanels}
              aria-label="Edit panels"
              className="min-h-[44px] px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PencilRuler className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Edit Panels</span>
            </button>

            <button
              type="button"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
