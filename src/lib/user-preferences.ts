export type NotificationPreferences = {
  pauseAll: boolean;
  social: boolean;
  messages: boolean;
  travel: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  pauseAll: false,
  social: true,
  messages: true,
  travel: true,
};

const keyFor = (userId: string) => `globelink.notification-preferences.${userId}`;

export function loadNotificationPreferences(userId?: string | null): NotificationPreferences {
  if (!userId || typeof window === "undefined") return DEFAULT_NOTIFICATION_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES;
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export function saveNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(keyFor(userId), JSON.stringify(preferences));
  window.dispatchEvent(
    new CustomEvent("globelink:notification-preferences", { detail: { userId } }),
  );
}

type NotificationLike = {
  type: string;
  metadata?: unknown;
};

function metadataScope(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  return String((metadata as Record<string, unknown>).scope ?? "");
}

export function notificationCategory(notification: NotificationLike): "social" | "messages" | "travel" {
  const scope = metadataScope(notification.metadata);
  if (scope === "travel_match") return "messages";
  if (notification.type === "message") return "messages";
  if (
    ["nearby_spot", "price_drop", "badge", "place_approved", "place_rejected"].includes(
      notification.type,
    )
  ) {
    return "travel";
  }
  return "social";
}

export function notificationAllowed(
  notification: NotificationLike,
  preferences: NotificationPreferences,
) {
  if (preferences.pauseAll) return false;
  return preferences[notificationCategory(notification)];
}
