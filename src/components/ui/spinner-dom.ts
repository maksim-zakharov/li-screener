import { cn } from '@/lib/utils';

/**
 * Path lucide LoaderIcon — тот же, что у React {@link Spinner}.
 */
export const SPINNER_LOADER_PATH = 'M21 12a9 9 0 1 1-6.219-8.56';

/**
 * DOM-версия Spinner из UI-кита (imperative canvas/контроллеры без React).
 */
export function createSpinnerElement(className?: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('role', 'status');
  svg.setAttribute('aria-label', 'Loading');
  svg.setAttribute('class', cn('size-4 animate-spin', className));
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', SPINNER_LOADER_PATH);
  svg.appendChild(path);
  return svg;
}
