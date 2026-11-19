export interface PanelRect {
  id: string;
  /** Normalized 0..1 relative to page width */
  x: number;
  /** Normalized 0..1 relative to page height */
  y: number;
  /** Normalized 0..1 relative to page width */
  width: number;
  /** Normalized 0..1 relative to page height */
  height: number;
}

export interface ComicPage {
  id: string;
  index: number;
  name: string;
  imageUrl: string;
  blob?: Blob;
  width: number;
  height: number;
  panels: PanelRect[];
  panelsAutoDetected?: boolean;
}

export interface ComicBook {
  id: string;
  title: string;
  sourceLabel: string;
  pages: ComicPage[];
  lastPageIndex?: number;
  lastStepIndex?: number;
  addedAt?: number;
}

export interface LibraryComicSummary {
  id: string;
  title: string;
  sourceLabel: string;
  pageCount: number;
  coverUrl: string;
  lastPageIndex: number;
  lastStepIndex: number;
  addedAt: number;
}

export type ViewMode = 'guided' | 'standard';

export type GuidedSubStep = 'full' | 'left' | 'right';

export interface GuidedStep {
  id: string;
  kind: 'overview-enter' | 'panel' | 'overview-exit';
  pageIndex: number;
  panelIndex: number | null;
  subStep: GuidedSubStep;
}

export interface LoadProgress {
  stage: string;
  current: number;
  total: number;
}
