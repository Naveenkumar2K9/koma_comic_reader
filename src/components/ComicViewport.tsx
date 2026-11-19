import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ComicPage, GuidedStep, PanelRect, ViewMode } from '../types/comic';
import { PanelEditorOverlay } from './PanelEditorOverlay';

interface ComicViewportProps {
  page: ComicPage;
  step: GuidedStep;
  viewMode: ViewMode;
  isEditing: boolean;
  selectedPanelId: string | null;
  onSelectPanel: (id: string | null) => void;
  onUpdatePagePanels: (panels: PanelRect[]) => void;
  onRedetectPagePanels: () => void;
  onExitEdit: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleHud: () => void;
  onViewportResize: (width: number, height: number) => void;
}

export const ComicViewport: React.FC<ComicViewportProps> = ({
  page,
  step,
  viewMode,
  isEditing,
  selectedPanelId,
  onSelectPanel,
  onUpdatePagePanels,
  onRedetectPagePanels,
  onExitEdit,
  onPrev,
  onNext,
  onToggleHud,
  onViewportResize,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });

  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewport({ width: rect.width, height: rect.height });
        onViewportResize(rect.width, rect.height);
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [onViewportResize]);

  // Base fit-to-screen size for full-page overview
  const { baseW, baseH } = useMemo(() => {
    const padX = viewport.width < 640 ? 12 : 36;
    const padY = viewport.height < 640 ? 16 : 36;
    const maxW = Math.max(100, viewport.width - padX * 2);
    const maxH = Math.max(100, viewport.height - padY * 2);
    const scale = Math.min(maxW / Math.max(1, page.width), maxH / Math.max(1, page.height));
    return {
      baseW: Math.round(page.width * scale),
      baseH: Math.round(page.height * scale),
    };
  }, [viewport.width, viewport.height, page.width, page.height]);

  const activePanel: PanelRect | null = useMemo(() => {
    if (isEditing || viewMode !== 'guided' || step.kind !== 'panel' || step.panelIndex === null) {
      return null;
    }
    return page.panels[step.panelIndex] ?? null;
  }, [isEditing, viewMode, step.kind, step.panelIndex, page.panels]);

  // Compute CSS camera transform (translate3d + scale) around center origin
  const cameraTransform = useMemo(() => {
    if (!activePanel || baseW === 0 || baseH === 0) {
      return 'translate3d(0px, 0px, 0px) scale(1)';
    }

    const pad = viewport.width < 640 ? 14 : 32;
    const availW = Math.max(120, viewport.width - pad * 2);
    const availH = Math.max(120, viewport.height - pad * 2);

    const bPanelW = activePanel.width * baseW;
    const bPanelH = activePanel.height * baseH;
    const bCenterX = (activePanel.x + activePanel.width / 2 - 0.5) * baseW;
    const bCenterY = (activePanel.y + activePanel.height / 2 - 0.5) * baseH;

    let scale = 1;
    let tx = 0;
    let ty = 0;

    if (step.subStep === 'left' || step.subStep === 'right') {
      const scaleByHeight = (availH * 0.86) / Math.max(1, bPanelH);
      const scaleForPan = availW / Math.max(1, bPanelW * 0.6);
      scale = Math.min(scaleByHeight, scaleForPan, 6.5);
      ty = -bCenterY * scale;

      if (bPanelW * scale <= availW * 1.05) {
        tx = -bCenterX * scale;
      } else if (step.subStep === 'left') {
        const leftEdgeBase = (activePanel.x - 0.5) * baseW;
        tx = -availW / 2 - leftEdgeBase * scale;
      } else {
        const rightEdgeBase = (activePanel.x + activePanel.width - 0.5) * baseW;
        tx = availW / 2 - rightEdgeBase * scale;
      }
    } else {
      scale = Math.min(availW / Math.max(1, bPanelW), availH / Math.max(1, bPanelH), 6.5);
      tx = -bCenterX * scale;
      ty = -bCenterY * scale;
    }

    return `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0px) scale(${scale.toFixed(4)})`;
  }, [activePanel, baseW, baseH, step.subStep, viewport.width, viewport.height]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isEditing) return;
    if ((e.target as HTMLElement).closest('[data-hud-interactive]')) return;
    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: true,
    };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isEditing || !gestureRef.current?.active) return;
    if (gestureRef.current.pointerId !== e.pointerId) return;

    const dx = e.clientX - gestureRef.current.startX;
    const dy = e.clientY - gestureRef.current.startY;
    gestureRef.current = null;

    if ((e.target as HTMLElement).closest('[data-hud-interactive]')) return;

    // Horizontal swipe gesture
    if (Math.abs(dx) >= 44 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      if (dx < 0) {
        onNext();
      } else {
        onPrev();
      }
      return;
    }

    // Tap zones (Left 30%, Center 40%, Right 30%)
    if (Math.hypot(dx, dy) < 14) {
      const ratioX = e.clientX / Math.max(1, viewport.width);
      if (ratioX < 0.3) {
        onPrev();
      } else if (ratioX > 0.7) {
        onNext();
      } else {
        onToggleHud();
      }
    }
  };

  const handlePointerCancel = () => {
    gestureRef.current = null;
  };

  const cutoutPath = activePanel
    ? `M0,0 H1 V1 H0 Z M${activePanel.x},${activePanel.y} H${activePanel.x + activePanel.width} V${
        activePanel.y + activePanel.height
      } H${activePanel.x} Z`
    : 'M0,0 H1 V1 H0 Z';

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      className="fixed inset-0 bg-black overflow-hidden select-none flex items-center justify-center touch-pan-y"
    >
      {/* Transformed Comic Page Stage */}
      <div
        style={{
          width: baseW,
          height: baseH,
          transform: cameraTransform,
          transformOrigin: 'center center',
        }}
        className="relative shrink-0 guided-camera-transition"
      >
        <img
          src={page.imageUrl}
          alt={page.name}
          draggable={false}
          referrerPolicy="no-referrer"
          className="w-full h-full object-contain block pointer-events-none select-none"
        />

        {/* Active Panel Isolation Mask */}
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{ opacity: activePanel ? 1 : 0 }}
          className="absolute inset-0 w-full h-full pointer-events-none guided-mask-transition"
        >
          <path d={cutoutPath} fillRule="evenodd" fill="rgba(0, 0, 0, 0.9)" />
          {activePanel && (
            <rect
              x={activePanel.x}
              y={activePanel.y}
              width={activePanel.width}
              height={activePanel.height}
              fill="none"
              stroke="rgba(255, 255, 255, 0.16)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>

      {/* Manual Panel Editor Overlay */}
      {isEditing && (
        <PanelEditorOverlay
          panels={page.panels}
          baseW={baseW}
          baseH={baseH}
          selectedPanelId={selectedPanelId}
          onSelectPanel={onSelectPanel}
          onChangePanels={onUpdatePagePanels}
          onRedetect={onRedetectPagePanels}
          onExitEdit={onExitEdit}
        />
      )}
    </div>
  );
};
