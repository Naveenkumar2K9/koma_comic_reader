import React, { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { PanelRect } from '../types/comic';

interface PanelEditorOverlayProps {
  panels: PanelRect[];
  baseW: number;
  baseH: number;
  selectedPanelId: string | null;
  onSelectPanel: (id: string | null) => void;
  onChangePanels: (panels: PanelRect[]) => void;
  onRedetect: () => void;
  onExitEdit: () => void;
}

type DragAction =
  | { kind: 'draw'; startX: number; startY: number; currX: number; currY: number }
  | { kind: 'move'; panelId: string; startX: number; startY: number; orig: PanelRect }
  | {
      kind: 'resize';
      panelId: string;
      handle: 'nw' | 'ne' | 'sw' | 'se';
      startX: number;
      startY: number;
      orig: PanelRect;
    };

const MIN_SIZE = 0.04;

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export const PanelEditorOverlay: React.FC<PanelEditorOverlayProps> = ({
  panels,
  baseW,
  baseH,
  selectedPanelId,
  onSelectPanel,
  onChangePanels,
  onRedetect,
  onExitEdit,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragAction | null>(null);

  const toNormalized = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return { x: 0, y: 0 };
    }
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    };
  };

  const handleBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const pt = toNormalized(e.clientX, e.clientY);
    onSelectPanel(null);
    setDrag({ kind: 'draw', startX: pt.x, startY: pt.y, currX: pt.x, currY: pt.y });
  };

  const handlePanelPointerDown = (e: React.PointerEvent, panel: PanelRect) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.stopPropagation();
    stageRef.current?.setPointerCapture(e.pointerId);
    const pt = toNormalized(e.clientX, e.clientY);
    onSelectPanel(panel.id);
    setDrag({
      kind: 'move',
      panelId: panel.id,
      startX: pt.x,
      startY: pt.y,
      orig: { ...panel },
    });
  };

  const handleResizePointerDown = (
    e: React.PointerEvent,
    panel: PanelRect,
    handle: 'nw' | 'ne' | 'sw' | 'se'
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.stopPropagation();
    stageRef.current?.setPointerCapture(e.pointerId);
    const pt = toNormalized(e.clientX, e.clientY);
    onSelectPanel(panel.id);
    setDrag({
      kind: 'resize',
      panelId: panel.id,
      handle,
      startX: pt.x,
      startY: pt.y,
      orig: { ...panel },
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    e.stopPropagation();
    const pt = toNormalized(e.clientX, e.clientY);

    if (drag.kind === 'draw') {
      setDrag({ ...drag, currX: pt.x, currY: pt.y });
      return;
    }

    const dx = pt.x - drag.startX;
    const dy = pt.y - drag.startY;

    if (drag.kind === 'move') {
      const nextX = clamp(drag.orig.x + dx, 0, 1 - drag.orig.width);
      const nextY = clamp(drag.orig.y + dy, 0, 1 - drag.orig.height);
      onChangePanels(
        panels.map((p) => (p.id === drag.panelId ? { ...p, x: nextX, y: nextY } : p))
      );
      return;
    }

    if (drag.kind === 'resize') {
      const o = drag.orig;
      let x1 = o.x;
      let y1 = o.y;
      let x2 = o.x + o.width;
      let y2 = o.y + o.height;

      if (drag.handle === 'nw' || drag.handle === 'sw') {
        x1 = clamp(o.x + dx, 0, x2 - MIN_SIZE);
      }
      if (drag.handle === 'ne' || drag.handle === 'se') {
        x2 = clamp(o.x + o.width + dx, x1 + MIN_SIZE, 1);
      }
      if (drag.handle === 'nw' || drag.handle === 'ne') {
        y1 = clamp(o.y + dy, 0, y2 - MIN_SIZE);
      }
      if (drag.handle === 'sw' || drag.handle === 'se') {
        y2 = clamp(o.y + o.height + dy, y1 + MIN_SIZE, 1);
      }

      onChangePanels(
        panels.map((p) =>
          p.id === drag.panelId
            ? { ...p, x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
            : p
        )
      );
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!drag) return;
    e.stopPropagation();
    if (drag.kind === 'draw') {
      const x = Math.min(drag.startX, drag.currX);
      const y = Math.min(drag.startY, drag.currY);
      const width = Math.abs(drag.currX - drag.startX);
      const height = Math.abs(drag.currY - drag.startY);
      if (width >= MIN_SIZE && height >= MIN_SIZE) {
        const newPanel: PanelRect = {
          id: `panel-custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          x,
          y,
          width,
          height,
        };
        onChangePanels([...panels, newPanel]);
        onSelectPanel(newPanel.id);
      }
    }
    setDrag(null);
  };

  const selectedIndex = panels.findIndex((p) => p.id === selectedPanelId);

  const moveOrder = (delta: -1 | 1) => {
    if (selectedIndex < 0) return;
    const target = selectedIndex + delta;
    if (target < 0 || target >= panels.length) return;
    const copy = [...panels];
    const [item] = copy.splice(selectedIndex, 1);
    copy.splice(target, 0, item);
    onChangePanels(copy);
  };

  const deleteSelected = () => {
    if (selectedIndex < 0) return;
    const next = panels.filter((p) => p.id !== selectedPanelId);
    onChangePanels(next);
    onSelectPanel(next[Math.min(selectedIndex, next.length - 1)]?.id ?? null);
  };

  const addCenteredPanel = () => {
    const newPanel: PanelRect = {
      id: `panel-custom-${Date.now().toString(36)}`,
      x: 0.2,
      y: 0.25,
      width: 0.6,
      height: 0.35,
    };
    onChangePanels([...panels, newPanel]);
    onSelectPanel(newPanel.id);
  };

  const draftRect =
    drag?.kind === 'draw'
      ? {
          x: Math.min(drag.startX, drag.currX),
          y: Math.min(drag.startY, drag.currY),
          width: Math.abs(drag.currX - drag.startX),
          height: Math.abs(drag.currY - drag.startY),
        }
      : null;

  return (
    <>
      {/* Interactive Canvas Overlay locked to exact page dimensions */}
      <div
        ref={stageRef}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ width: baseW, height: baseH }}
        className="absolute inset-0 m-auto z-20 touch-none cursor-crosshair"
      >
        {/* Subtle dim so bounding boxes pop clearly */}
        <div className="absolute inset-0 bg-black/30 pointer-events-none" />

        {panels.map((panel, index) => {
          const isSelected = panel.id === selectedPanelId;
          return (
            <div
              key={panel.id}
              onPointerDown={(e) => handlePanelPointerDown(e, panel)}
              style={{
                left: `${panel.x * 100}%`,
                top: `${panel.y * 100}%`,
                width: `${panel.width * 100}%`,
                height: `${panel.height * 100}%`,
              }}
              className={`absolute box-border transition-colors cursor-move ${
                isSelected
                  ? 'border-2 border-amber-400 bg-amber-400/15 shadow-[0_0_0_1px_rgba(0,0,0,0.6)] z-30'
                  : 'border-2 border-white/75 bg-white/[0.06] hover:border-amber-300 z-20'
              }`}
            >
              {/* Reading order index */}
              <span
                className={`absolute top-1.5 left-1.5 min-w-[24px] h-6 px-1.5 rounded-md font-mono-nums text-xs font-bold flex items-center justify-center shadow ${
                  isSelected
                    ? 'bg-amber-400 text-zinc-950'
                    : 'bg-zinc-950/90 text-zinc-100 border border-white/20'
                }`}
              >
                {index + 1}
              </span>

              {/* 4 Corner Resize Handles */}
              {isSelected && (
                <>
                  {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => {
                    const posClass =
                      handle === 'nw'
                        ? '-top-3 -left-3 cursor-nwse-resize'
                        : handle === 'ne'
                        ? '-top-3 -right-3 cursor-nesw-resize'
                        : handle === 'sw'
                        ? '-bottom-3 -left-3 cursor-nesw-resize'
                        : '-bottom-3 -right-3 cursor-nwse-resize';

                    return (
                      <div
                        key={handle}
                        onPointerDown={(e) => handleResizePointerDown(e, panel, handle)}
                        className={`absolute w-6 h-6 flex items-center justify-center z-40 ${posClass}`}
                      >
                        <div className="w-3.5 h-3.5 rounded-sm bg-amber-400 border-2 border-zinc-950 shadow" />
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })}

        {/* Live drag-to-draw box */}
        {draftRect && draftRect.width > 0.005 && draftRect.height > 0.005 && (
          <div
            style={{
              left: `${draftRect.x * 100}%`,
              top: `${draftRect.y * 100}%`,
              width: `${draftRect.width * 100}%`,
              height: `${draftRect.height * 100}%`,
            }}
            className="absolute border-2 border-dashed border-amber-400 bg-amber-400/15 pointer-events-none z-40"
          />
        )}
      </div>

      {/* Floating Bottom Editor Toolbar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed bottom-3 left-3 right-3 z-40 max-w-3xl mx-auto"
      >
        <div className="rounded-2xl bg-zinc-950/95 backdrop-blur-md border border-white/15 px-3 py-2.5 shadow-2xl flex flex-col gap-2">
          {/* Panel order selector strip */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
              <span className="text-xs text-zinc-400 mr-1 whitespace-nowrap shrink-0">
                Panels ({panels.length}):
              </span>
              {panels.length === 0 ? (
                <span className="text-xs text-zinc-500 whitespace-nowrap">
                  Drag on page to draw first panel
                </span>
              ) : (
                panels.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelectPanel(p.id)}
                    className={`min-w-[32px] h-8 px-2 rounded-lg font-mono-nums text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
                      p.id === selectedPanelId
                        ? 'bg-amber-400 text-zinc-950'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={onExitEdit}
              className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Done</span>
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={addCenteredPanel}
                className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                <span>Add Box</span>
              </button>
              <button
                type="button"
                onClick={onRedetect}
                className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                <span>Auto-Detect</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => moveOrder(-1)}
                disabled={selectedIndex <= 0}
                title="Move earlier in reading order"
                className="min-h-[38px] min-w-[38px] px-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 flex items-center justify-center disabled:opacity-30 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => moveOrder(1)}
                disabled={selectedIndex < 0 || selectedIndex >= panels.length - 1}
                title="Move later in reading order"
                className="min-h-[38px] min-w-[38px] px-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 flex items-center justify-center disabled:opacity-30 cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={deleteSelected}
                disabled={selectedIndex < 0}
                title="Delete selected panel"
                className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/70 border border-red-500/30 text-red-200 text-xs font-medium flex items-center gap-1.5 disabled:opacity-30 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
