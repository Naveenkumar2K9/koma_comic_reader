import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, BookOpen, Plus, Trash2, Upload, WifiOff } from 'lucide-react';
import { LibraryComicSummary, LoadProgress } from '../types/comic';
import { PWAInstallButton } from './PWAInstallButton';

interface LandingScreenProps {
  library: LibraryComicSummary[];
  isLibraryLoading: boolean;
  onFilesSelected: (files: FileList | File[]) => void;
  onOpenLibraryComic: (bookId: string) => void;
  onDeleteLibraryComic: (bookId: string) => void;
  isLoading: boolean;
  progress: LoadProgress | null;
  error: string | null;
  onDismissError: () => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  library,
  isLibraryLoading,
  onFilesSelected,
  onOpenLibraryComic,
  onDeleteLibraryComic,
  isLoading,
  progress,
  error,
  onDismissError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isLoading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files);
      e.target.value = '';
    }
  };

  const progressPct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return (
    <div className="min-h-screen bg-[#08080A] text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="w-full border-b border-white/[0.07]">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 py-4 flex items-center justify-between gap-6">
          <span className="font-display text-xl font-bold tracking-tight text-zinc-50 whitespace-nowrap shrink-0">
            Koma
          </span>

          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => !isLoading && fileInputRef.current?.click()}
              disabled={isLoading}
              className="min-h-[40px] px-4 py-2 text-xs sm:text-sm font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 active:scale-[0.98] rounded-lg flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>Import Comic</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-5 sm:px-6 py-8 sm:py-10 space-y-10">
        {!isOnline && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-xs text-zinc-300">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Offline mode — imported comics and guided reading work without internet.</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-4 p-4 rounded-xl bg-red-950/50 border border-red-500/30 text-red-200"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed">{error}</p>
            </div>
            <button
              type="button"
              onClick={onDismissError}
              className="text-xs font-medium text-red-300 hover:text-white px-2 py-1 shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Import Section */}
        <section aria-labelledby="import-heading" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h1
                id="import-heading"
                className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-50"
              >
                Import &amp; Read Comics
              </h1>
              <p className="text-sm text-zinc-400 mt-1">
                Everything is processed and stored locally on your device for offline reading.
              </p>
            </div>
          </div>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isLoading && fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !isLoading) {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            aria-label="Import comic files"
            className={`rounded-2xl border transition-all duration-200 p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              isDragging
                ? 'border-amber-400 bg-amber-500/10'
                : 'border-dashed border-zinc-700 hover:border-zinc-500 bg-[#111114]/90 hover:bg-[#141418]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".cbz,.zip,.cbr,.rar,.pdf,.jpg,.jpeg,.png,.webp,.gif,.avif,image/*"
              onChange={handleFileInput}
              className="hidden"
            />

            {isLoading && progress ? (
              <div className="w-full max-w-sm space-y-3 py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-zinc-200">{progress.stage}</span>
                  <span className="font-mono-nums text-xs text-amber-400">
                    {progress.total > 1
                      ? `${progress.current} / ${progress.total}`
                      : `${progressPct}%`}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all duration-200"
                    style={{ width: `${Math.max(8, progressPct)}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-500">
                  Sorting pages naturally, detecting panels, and saving to your offline shelf.
                </p>
              </div>
            ) : (
              <>
                <div className="w-11 h-11 rounded-xl bg-zinc-800/80 border border-white/10 flex items-center justify-center mb-3">
                  <Upload className="w-5 h-5 text-amber-400" />
                </div>
                <p className="text-base font-semibold text-zinc-100 mb-1">
                  {isDragging ? 'Release to import comic' : 'Drop comic files here or tap to browse'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs font-mono-nums text-zinc-500 mt-2">
                  <span>.CBZ</span>
                  <span aria-hidden="true">·</span>
                  <span>.ZIP</span>
                  <span aria-hidden="true">·</span>
                  <span>.CBR</span>
                  <span aria-hidden="true">·</span>
                  <span>.PDF</span>
                  <span aria-hidden="true">·</span>
                  <span>.JPG / .PNG / .WEBP</span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Saved Comic Library Section */}
        <section aria-labelledby="library-heading" className="space-y-5">
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] pb-3">
            <h2
              id="library-heading"
              className="font-display text-lg sm:text-xl font-semibold text-zinc-100"
            >
              Your Library
            </h2>
            <span className="font-mono-nums text-xs text-zinc-400">
              {library.length} {library.length === 1 ? 'comic' : 'comics'}
            </span>
          </div>

          {isLibraryLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
              {[0, 1, 2, 3].map((slot) => (
                <div
                  key={slot}
                  className="aspect-[3/4] rounded-xl bg-zinc-900/70 border border-white/[0.06] animate-pulse"
                />
              ))}
            </div>
          ) : library.length === 0 ? (
            <div className="rounded-2xl bg-[#111114]/60 border border-white/[0.07] px-6 py-12 text-center">
              <BookOpen className="w-7 h-7 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-zinc-300">
                Your library is empty
              </p>
              <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                Import any .cbz, .cbr, .zip, .pdf, or folder of comic pages above. Once imported, tap any comic here to open and read it—even offline.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
              {library.map((item) => {
                const resumeLabel =
                  item.lastPageIndex > 0
                    ? `Page ${item.lastPageIndex + 1} of ${item.pageCount}`
                    : `${item.pageCount} ${item.pageCount === 1 ? 'page' : 'pages'}`;

                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenLibraryComic(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenLibraryComic(item.id);
                      }
                    }}
                    className="group relative rounded-xl bg-[#111114] border border-white/[0.08] hover:border-amber-400/60 overflow-hidden flex flex-col text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    <div className="relative aspect-[3/4] w-full bg-zinc-950 overflow-hidden">
                      {item.coverUrl ? (
                        <img
                          src={item.coverUrl}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-700">
                          <BookOpen className="w-8 h-8" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/25 pointer-events-none" />

                      <button
                        type="button"
                        aria-label={`Delete ${item.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteLibraryComic(item.id);
                        }}
                        className="absolute top-2 right-2 min-h-[36px] min-w-[36px] rounded-lg bg-black/70 hover:bg-red-950/90 border border-white/15 text-zinc-300 hover:text-red-200 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <span className="absolute bottom-2.5 left-2.5 right-2.5 text-xs font-medium text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity">
                        {item.lastPageIndex > 0 ? 'Continue reading →' : 'Read now →'}
                      </span>
                    </div>

                    <div className="p-3 space-y-1">
                      <h3 className="font-display text-sm font-semibold text-zinc-100 line-clamp-2 leading-snug">
                        {item.title}
                      </h3>
                      <p className="font-mono-nums text-xs text-zinc-400 truncate">
                        {resumeLabel}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
