import { useEffect, useRef } from "react";

/**
 * Adds `in-view` class when the element enters the viewport.
 * Pair with `.reveal` or `.reveal-scale` initial classes.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options?: IntersectionObserverInit,
) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px", ...options },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [options]);
  return ref;
}

/**
 * Animated counter — eases from 0 to `value` in `duration` ms.
 */
export function useCountUp(value: number, duration = 1200) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const current = from + (value - from) * eased;
      el.textContent = Number.isInteger(value)
        ? Math.round(current).toLocaleString("fr-FR")
        : current.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return ref;
}
