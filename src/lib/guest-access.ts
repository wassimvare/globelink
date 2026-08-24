const PROFILE_KEY = "globelink.guest-profile";

export function guestCanOpenProfile(username: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const first = window.sessionStorage.getItem(PROFILE_KEY);
    if (!first) {
      window.sessionStorage.setItem(PROFILE_KEY, username.toLowerCase());
      return true;
    }
    return first === username.toLowerCase();
  } catch {
    return true;
  }
}

export function authRedirectSearch(path: string) {
  return { redirect: path.startsWith("/") ? path : "/" };
}
