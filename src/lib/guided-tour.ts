export const GUIDED_TOUR_VERSION = "v1";
export const GUIDED_TOUR_START_EVENT = "globelink:start-guided-tour";

export function guidedTourPendingKey(userId: string) {
  return `globelink.guided-tour.${GUIDED_TOUR_VERSION}.pending.${userId}`;
}

export function guidedTourDoneKey(userId: string) {
  return `globelink.guided-tour.${GUIDED_TOUR_VERSION}.done.${userId}`;
}

export function queueGuidedTour(userId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(guidedTourDoneKey(userId));
    localStorage.setItem(guidedTourPendingKey(userId), "1");
  } catch {
    // The guide can still be launched manually from the Help page.
  }
}

export function startGuidedTour() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GUIDED_TOUR_START_EVENT));
}
