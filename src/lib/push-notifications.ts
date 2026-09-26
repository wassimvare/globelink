import { supabase } from "@/integrations/supabase/client";

export const GLOBELINK_VAPID_PUBLIC_KEY =
  "BC6OrM_FUL8gW0vucXb_K4DujyNCFj-IzN-SJVcNVP74hcbTcInfe5CUsBOL2177teLxwWIt_C_8Xooti3WZhHc";

export type PushActivationState = "granted" | "denied" | "unsupported";

type IncomingCallPush = {
  callId: string;
  conversationId: string;
  kind: "audio" | "video";
  callerName: string;
  callerAvatar?: string | null;
};

type SendCallPushArgs = IncomingCallPush & {
  recipientId: string;
};

function supportsWebPush() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function applicationServerKey() {
  const padding = "=".repeat((4 - (GLOBELINK_VAPID_PUBLIC_KEY.length % 4)) % 4);
  const base64 = (GLOBELINK_VAPID_PUBLIC_KEY + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function persistSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) throw new Error("Clés de notification indisponibles");

  const { error } = await (supabase as any).rpc("register_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_expiration_time: subscription.expirationTime ?? null,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
}

function subscriptionUsesCurrentKey(subscription: PushSubscription) {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const actual = new Uint8Array(current);
  const expected = applicationServerKey();
  if (actual.length !== expected.length) return false;
  return actual.every((value, index) => value === expected[index]);
}

async function subscribeCurrentDevice() {
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  // A VAPID rotation requires replacing the browser subscription. Keeping an
  // old subscription would make the push service reject messages signed with
  // GlobeLink's new application-server key.
  if (subscription && !subscriptionUsesCurrentKey(subscription)) {
    await subscription.unsubscribe();
    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(),
    });
  }
  await persistSubscription(subscription);
}

/**
 * Synchronise silencieusement un abonnement déjà autorisé. Ne déclenche jamais
 * le prompt navigateur tout seul : iOS exige un geste utilisateur explicite.
 */
export async function ensurePushSubscription(): Promise<PushActivationState> {
  if (!supportsWebPush()) return "unsupported";
  if ("Notification" in window && Notification.permission === "denied") return "denied";

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (!existing) return "denied";

    await subscribeCurrentDevice();
    return "granted";
  } catch (error) {
    console.warn("Push subscription refresh failed", error);
    return "denied";
  }
}

/**
 * À appeler uniquement depuis un clic/tap utilisateur.
 * Sur iPhone/iPad en mode écran d'accueil, PushManager.subscribe() est la
 * source de vérité : WebKit peut gérer la demande d'autorisation directement
 * depuis cet appel même quand window.Notification est limité.
 */
export async function enablePushNotifications(): Promise<PushActivationState> {
  if (!supportsWebPush()) return "unsupported";

  if ("Notification" in window && Notification.permission === "denied") {
    return "denied";
  }

  try {
    await subscribeCurrentDevice();
    return "granted";
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "NotAllowedError" || error.name === "AbortError")
    ) {
      return "denied";
    }
    throw error;
  }
}

export function pushPermissionState(): NotificationPermission | "unsupported" {
  if (!supportsWebPush()) return "unsupported";
  if ("Notification" in window) return Notification.permission;
  return "default";
}

/**
 * Demande au backend d'envoyer UN push au destinataire pour cet appel.
 * Le backend valide la conversation et l'invitation RTC avant l'envoi.
 */
export async function sendCallPush(args: SendCallPushArgs) {
  try {
    const { error } = await supabase.functions.invoke("send-call-push", {
      body: args,
    });
    if (error) console.warn("Incoming-call push could not be sent", error);
  } catch (error) {
    console.warn("Incoming-call push unavailable", error);
  }
}

/**
 * Notification système de secours quand l'app est encore vivante mais n'est
 * plus au premier plan. Le tag garantit une seule notification par callId.
 */
export async function notifyIncomingCall(args: IncomingCallPush) {
  if (!supportsWebPush() || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(args.callerName, {
      body: args.kind === "video" ? "Appel vidéo entrant" : "Appel audio entrant",
      icon: args.callerAvatar || "/icons/globelink-app-icon-192-v20260824.png?v=20260825-rgb2",
      badge: "/icons/globelink-app-icon-192-v20260824.png?v=20260825-rgb2",
      tag: `globelink-call-${args.callId}`,
      requireInteraction: true,
      data: {
        url: `/messages/${args.conversationId}`,
        callId: args.callId,
        conversationId: args.conversationId,
        kind: args.kind,
      },
    });
  } catch (error) {
    console.warn("Foreground call notification failed", error);
  }
}
