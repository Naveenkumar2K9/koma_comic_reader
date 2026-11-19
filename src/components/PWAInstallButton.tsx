import React, { useState } from 'react';
import { Download, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="min-h-[40px] px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-zinc-100 text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-4 h-4 text-amber-400" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="min-h-[40px] px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-zinc-100 text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-4 h-4 text-amber-400" />
          <span>Install</span>
        </button>

        {showIOSGuide && (
          <div
            onClick={() => setShowIOSGuide(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-[#111114] border border-white/15 p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between gap-4">
                <h3 className="font-display text-lg font-semibold text-zinc-100">
                  Install on iPhone or iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close"
                  className="min-h-[36px] min-w-[36px] rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2 text-sm text-zinc-300 leading-relaxed list-decimal list-inside">
                <li>Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>Launch Koma from your home screen for offline reading.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-sm cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
