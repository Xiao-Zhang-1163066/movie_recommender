import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Scroll positions by history entry. location.key is unique per entry, so two
// visits to the same URL keep separate positions, as a browser would.
const positions = new Map<string, number>();

// How long to keep retrying a restore while the page is still too short to
// reach the saved position, e.g. a grid whose images have not laid out yet.
const RESTORE_TIMEOUT_MS = 1000;

/**
 * React Router's <ScrollRestoration> needs a data router (createBrowserRouter);
 * this app uses <BrowserRouter>, so without this every page kept the previous
 * page's scroll offset and Back always landed at the top.
 */
export default function ScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const keyRef = useRef(location.key);

  // The browser's own restoration fires before React has rendered the page it
  // is restoring, then fights ours, so take it over entirely.
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  // Record continuously rather than on leave: by the time a route-change effect
  // runs, the new page has already replaced the old one and scrollY is wrong.
  // One listener reading a ref, so a scroll fired as the new page lays out is
  // never filed under the old page's entry.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        positions.set(keyRef.current, window.scrollY);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Layout effect so a new page never paints at the old page's offset first.
  useLayoutEffect(() => {
    keyRef.current = location.key;

    // REPLACE is a URL rewrite on the same screen, e.g. the chat page swapping
    // /chat for /chat/:id mid-stream. Jumping there would be a bug.
    if (navigationType === "REPLACE") return;

    if (navigationType === "PUSH") {
      window.scrollTo(0, 0);
      return;
    }

    // POP: Back/Forward. The page may still be growing as cached data renders,
    // so retry until it is tall enough, the time runs out, or the user scrolls.
    const target = positions.get(location.key) ?? 0;
    const deadline = performance.now() + RESTORE_TIMEOUT_MS;
    let frame = 0;
    let cancelled = false;
    const stop = () => {
      cancelled = true;
    };
    const attempt = () => {
      if (cancelled) return;
      window.scrollTo(0, target);
      if (Math.abs(window.scrollY - target) > 1 && performance.now() < deadline) {
        frame = requestAnimationFrame(attempt);
      }
    };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("keydown", stop);
    attempt();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [location.key, navigationType]);

  return null;
}
