import { ComicPage, GuidedStep, PanelRect } from '../types/comic';

export function isWidePanel(
  panel: PanelRect,
  pageWidth: number,
  pageHeight: number,
  viewportWidth: number,
  viewportHeight: number
): boolean {
  if (viewportWidth <= 0 || viewportHeight <= 0 || pageWidth <= 0 || pageHeight <= 0) {
    return false;
  }
  const panelPixelW = panel.width * pageWidth;
  const panelPixelH = panel.height * pageHeight;
  const panelAspect = panelPixelW / Math.max(1, panelPixelH);
  const viewportAspect = viewportWidth / Math.max(1, viewportHeight);

  // Split into left/right sub-steps when panel is genuinely wide AND significantly wider than viewport
  return panelAspect >= 1.32 && panelAspect / viewportAspect >= 1.45;
}

export function buildPageGuidedSteps(
  page: ComicPage,
  pageIndex: number,
  viewportWidth: number,
  viewportHeight: number
): GuidedStep[] {
  const steps: GuidedStep[] = [
    {
      id: `p${pageIndex}-overview-enter`,
      kind: 'overview-enter',
      pageIndex,
      panelIndex: null,
      subStep: 'full',
    },
  ];

  if (page.panels.length === 0) {
    return steps;
  }

  page.panels.forEach((panel, panelIdx) => {
    const wide = isWidePanel(panel, page.width, page.height, viewportWidth, viewportHeight);
    if (wide) {
      steps.push({
        id: `p${pageIndex}-panel-${panelIdx}-left`,
        kind: 'panel',
        pageIndex,
        panelIndex: panelIdx,
        subStep: 'left',
      });
      steps.push({
        id: `p${pageIndex}-panel-${panelIdx}-right`,
        kind: 'panel',
        pageIndex,
        panelIndex: panelIdx,
        subStep: 'right',
      });
    } else {
      steps.push({
        id: `p${pageIndex}-panel-${panelIdx}-full`,
        kind: 'panel',
        pageIndex,
        panelIndex: panelIdx,
        subStep: 'full',
      });
    }
  });

  // After the final panel on a page, zoom back out to full page overview before advancing
  steps.push({
    id: `p${pageIndex}-overview-exit`,
    kind: 'overview-exit',
    pageIndex,
    panelIndex: null,
    subStep: 'full',
  });

  return steps;
}

export function buildBookGuidedSteps(
  pages: ComicPage[],
  viewportWidth: number,
  viewportHeight: number
): GuidedStep[] {
  const allSteps: GuidedStep[] = [];
  pages.forEach((page, pageIndex) => {
    allSteps.push(...buildPageGuidedSteps(page, pageIndex, viewportWidth, viewportHeight));
  });
  return allSteps;
}
