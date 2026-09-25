import { useCallback, useRef } from "react";

/** The ruled lines on a notebook page are this far apart. */
export const LINE_STEP = 28;

/**
 * Returns a ref that pads the element's bottom so it ends on the page's ruled
 * grid, leaving at least `minGap` px below it. Whatever follows then starts on
 * a line, however tall the element grows (an answer that's still streaming,
 * a code block, a photo).
 */
export function useGridSnap(minGap = 0, step = LINE_STEP) {
  const observer = useRef<ResizeObserver | null>(null);
  return useCallback(
    (el: HTMLElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!el) return;
      const snap = () => {
        const height = el.getBoundingClientRect().height;
        const total = Math.ceil((height + minGap) / step) * step;
        el.style.marginBottom = `${total - height}px`;
      };
      snap();
      observer.current = new ResizeObserver(snap);
      observer.current.observe(el);
    },
    [minGap, step],
  );
}
