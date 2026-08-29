import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneOff,
  RefreshCw,
  ShieldAlert,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { isUuid } from "@/lib/security";
import { getRtcIceConfiguration } from "@/lib/rtc-config.functions";

type CallKind = "audio" | "video";
type CallDirection = "incoming" | "outgoing";
type CallPhase = "ringing" | "calling" | "connecting" | "connected";
type RtcSignal = "invite" | "offer" | "answer" | "ice" | "accept" | "decline" | "hangup" | "busy";
type CallEndReason = "ended" | "declined" | "missed" | "busy" | "failed";

type PeerProfile = {
  id: string;
  name: string;
  avatar: string | null;
};

type CallSession = {
  callId: string;
  conversationId: string;
  kind: CallKind;
  direction: CallDirection;
  phase: CallPhase;
  peer: PeerProfile;
  createdAt: number;
  connectedAt: number | null;
};

type SignalMeta = {
  call_id?: string;
  signal?: RtcSignal;
  recipient_id?: string;
  kind?: CallKind;
  payload?: unknown;
  sent_at?: string;
};

type RtcMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  attachment_type: string | null;
  attachment_meta: SignalMeta | null;
  created_at?: string;
};

type StartCallArgs = {
  conversationId: string;
  recipientId: string;
  recipientName: string;
  recipientAvatar?: string | null;
  kind: CallKind;
};

type CallsContextValue = {
  startCall: (args: StartCallArgs) => Promise<void>;
  busy: boolean;
  secureMediaAvailable: boolean;
};

const CallsContext = createContext<CallsContextValue>({
  startCall: async () => undefined,
  busy: false,
  secureMediaAvailable: false,
});

const RTC_ATTACHMENT_TYPE = "rtc";
const CALL_TIMEOUT_MS = 45_000;
const RTC_SIGNALS = new Set<RtcSignal>([
  "invite",
  "offer",
  "answer",
  "ice",
  "accept",
  "decline",
  "busy",
  "hangup",
]);

const FALLBACK_RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun.cloudflare.com:3478",
      ],
    },
  ],
  iceCandidatePoolSize: 6,
};

function mediaIsAvailable() {
  if (typeof window === "undefined") return false;
  return window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function callLabel(kind: CallKind) {
  return kind === "video" ? "Appel vidéo" : "Appel audio";
}

function endLabel(reason: CallEndReason) {
  if (reason === "declined") return "Appel refusé";
  if (reason === "missed") return "Appel sans réponse";
  if (reason === "busy") return "Voyageur indisponible";
  if (reason === "failed") return "Appel interrompu";
  return "Appel terminé";
}

export function CallProvider({ children }: { children: ReactNode }) {
  const fetchRtcIceConfiguration = useServerFn(getRtcIceConfiguration);
  const rtcConfigurationRef = useRef<RTCConfiguration>(FALLBACK_RTC_CONFIGURATION);
  const { user } = useAuth();
  const [incoming, setIncoming] = useState<CallSession | null>(null);
  const [active, setActive] = useState<CallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [remoteSound, setRemoteSound] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [secureMediaAvailable, setSecureMediaAvailable] = useState(false);

  const activeRef = useRef<CallSession | null>(null);
  const incomingRef = useRef<CallSession | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const processedMessagesRef = useRef(new Set<string>());
  const loggedCallsRef = useRef(new Set<string>());
  const outgoingTimeoutRef = useRef<number | null>(null);
  const incomingTimeoutRef = useRef<number | null>(null);
  const connectionTimeoutRef = useRef<number | null>(null);
  const signalQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    setSecureMediaAvailable(mediaIsAvailable());
  }, []);

  useEffect(() => {
    activeRef.current = active;
    document.documentElement.classList.toggle("is-call-active", Boolean(active || incoming));
    return () => document.documentElement.classList.remove("is-call-active");
  }, [active, incoming]);

  useEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);

  useEffect(() => {
    if (!active?.connectedAt) {
      setDurationSeconds(0);
      return;
    }
    const update = () =>
      setDurationSeconds(Math.max(0, Math.floor((Date.now() - active.connectedAt!) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [active?.connectedAt]);

  const clearTimeouts = useCallback(() => {
    if (outgoingTimeoutRef.current) window.clearTimeout(outgoingTimeoutRef.current);
    if (incomingTimeoutRef.current) window.clearTimeout(incomingTimeoutRef.current);
    if (connectionTimeoutRef.current) window.clearTimeout(connectionTimeoutRef.current);
    outgoingTimeoutRef.current = null;
    incomingTimeoutRef.current = null;
    connectionTimeoutRef.current = null;
  }, []);

  const stopMedia = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraEnabled(true);
    setRemoteSound(true);
    setCameraFacing("user");
  }, []);

  const broadcastRtcSignal = useCallback(
    async (
      conversationId: string,
      recipientId: string,
      callId: string,
      kind: CallKind,
      signal: RtcSignal,
      payload?: unknown,
    ) => {
      if (!user) return;
      const channel = supabase.channel(`globelink-call-user-${recipientId}`, {
        config: { private: true, broadcast: { ack: true } },
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error("Realtime indisponible")), 4000);
          channel.subscribe((status) => {
            if (status === "SUBSCRIBED") {
              window.clearTimeout(timer);
              resolve();
            }
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              window.clearTimeout(timer);
              reject(new Error(status));
            }
          });
        });
        await channel.send({
          type: "broadcast",
          event: "rtc-signal",
          payload: {
            id: `broadcast-${callId}-${signal}-${Date.now()}`,
            conversation_id: conversationId,
            sender_id: user.id,
            attachment_type: RTC_ATTACHMENT_TYPE,
            attachment_meta: {
              call_id: callId,
              signal,
              recipient_id: recipientId,
              kind,
              payload: payload ?? null,
              sent_at: new Date().toISOString(),
            },
          },
        });
      } catch (error) {
        console.warn("RTC broadcast fallback unavailable", error);
      } finally {
        await supabase.removeChannel(channel);
      }
    },
    [user],
  );

  const insertRtcMessage = useCallback(
    async (session: CallSession, signal: RtcSignal, payload?: unknown) => {
      if (!user) return;
      const { error } = await supabase.from("messages").insert({
        conversation_id: session.conversationId,
        sender_id: user.id,
        content: null,
        attachment_url: null,
        attachment_type: RTC_ATTACHMENT_TYPE,
        attachment_meta: {
          call_id: session.callId,
          signal,
          recipient_id: session.peer.id,
          kind: session.kind,
          payload: payload ?? null,
          sent_at: new Date().toISOString(),
        } as never,
      });
      if (error) console.error("RTC signal database fallback error", error);
      void broadcastRtcSignal(
        session.conversationId,
        session.peer.id,
        session.callId,
        session.kind,
        signal,
        payload,
      );
    },
    [broadcastRtcSignal, user],
  );

  const insertRawRtcMessage = useCallback(
    async (
      conversationId: string,
      recipientId: string,
      callId: string,
      kind: CallKind,
      signal: RtcSignal,
      payload?: unknown,
    ) => {
      if (!user) return;
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: null,
        attachment_url: null,
        attachment_type: RTC_ATTACHMENT_TYPE,
        attachment_meta: {
          call_id: callId,
          signal,
          recipient_id: recipientId,
          kind,
          payload: payload ?? null,
          sent_at: new Date().toISOString(),
        } as never,
      });
      if (error) console.error("RTC signal database fallback error", error);
      void broadcastRtcSignal(conversationId, recipientId, callId, kind, signal, payload);
    },
    [broadcastRtcSignal, user],
  );

  const cleanupRtcMessages = useCallback(
    async (callId: string) => {
      if (!user) return;
      window.setTimeout(async () => {
        const { data } = await supabase
          .from("messages")
          .select("id, attachment_meta")
          .eq("sender_id", user.id)
          .eq("attachment_type", RTC_ATTACHMENT_TYPE)
          .order("created_at", { ascending: false })
          .limit(250);
        const rows = (data ?? []) as Array<{ id: string; attachment_meta: SignalMeta | null }>;
        const ids = rows
          .filter((row) => row.attachment_meta?.call_id === callId)
          .map((row) => row.id);
        if (ids.length) await supabase.from("messages").delete().in("id", ids);
      }, 8_000);
    },
    [user],
  );

  const logCall = useCallback(
    async (session: CallSession, reason: CallEndReason) => {
      if (!user || session.direction !== "outgoing" || loggedCallsRef.current.has(session.callId))
        return;
      loggedCallsRef.current.add(session.callId);
      const seconds = session.connectedAt
        ? Math.max(0, Math.floor((Date.now() - session.connectedAt) / 1000))
        : 0;
      const duration = seconds > 0 ? ` · ${formatDuration(seconds)}` : "";
      const { error } = await supabase.from("messages").insert({
        conversation_id: session.conversationId,
        sender_id: user.id,
        content: `${endLabel(reason)} · ${callLabel(session.kind)}${duration}`,
        attachment_url: null,
        attachment_type: "call",
        attachment_meta: {
          call_id: session.callId,
          kind: session.kind,
          status: reason,
          duration_seconds: seconds,
        } as never,
      });
      if (error) console.error("Call history error", error);
    },
    [user],
  );

  const resetCall = useCallback(
    (session: CallSession | null, reason: CallEndReason, shouldLog = true) => {
      clearTimeouts();
      stopMedia();
      setIncoming(null);
      setActive(null);
      incomingRef.current = null;
      activeRef.current = null;
      if (session) {
        if (shouldLog) void logCall(session, reason);
        void cleanupRtcMessages(session.callId);
      }
    },
    [cleanupRtcMessages, clearTimeouts, logCall, stopMedia],
  );

  const sendHangupAndReset = useCallback(
    async (reason: CallEndReason = "ended") => {
      const session = activeRef.current ?? incomingRef.current;
      if (!session) return;
      await insertRtcMessage(session, reason === "declined" ? "decline" : "hangup", { reason });
      resetCall(session, reason);
    },
    [insertRtcMessage, resetCall],
  );

  const flushCandidates = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc?.remoteDescription) return;
    const queued = pendingCandidatesRef.current.splice(0);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (error) {
        console.warn("ICE candidate ignored", error);
      }
    }
  }, []);

  const sendAnswer = useCallback(
    async (session: CallSession) => {
      const pc = peerConnectionRef.current;
      if (!pc || pc.signalingState !== "have-remote-offer") return;
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await insertRtcMessage(session, "answer", answer);
    },
    [insertRtcMessage],
  );

  const applyOffer = useCallback(
    async (offer: RTCSessionDescriptionInit) => {
      const pc = peerConnectionRef.current;
      const session = activeRef.current;
      if (!pc || !session) {
        pendingOfferRef.current = offer;
        return;
      }
      if (pc.signalingState !== "stable") return;
      await pc.setRemoteDescription(offer);
      await flushCandidates();
      if (session.direction === "incoming") await sendAnswer(session);
    },
    [flushCandidates, sendAnswer],
  );

  const refreshRtcConfiguration = useCallback(async () => {
    try {
      rtcConfigurationRef.current = await fetchRtcIceConfiguration();
    } catch (error) {
      console.warn("Configuration TURN indisponible, utilisation STUN uniquement", error);
      rtcConfigurationRef.current = FALLBACK_RTC_CONFIGURATION;
    }
  }, [fetchRtcIceConfiguration]);

  const createPeerConnection = useCallback(
    (session: CallSession, stream: MediaStream) => {
      peerConnectionRef.current?.close();
      const pc = new RTCPeerConnection(rtcConfigurationRef.current);
      peerConnectionRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate) void insertRtcMessage(session, "ice", event.candidate.toJSON());
      };
      pc.ontrack = (event) => {
        const next = remoteStreamRef.current ?? new MediaStream();
        for (const track of event.streams[0]?.getTracks() ?? [event.track]) {
          if (!next.getTracks().some((existing) => existing.id === track.id)) next.addTrack(track);
        }
        remoteStreamRef.current = next;
        setRemoteStream(new MediaStream(next.getTracks()));
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          clearTimeouts();
          setActive((current) => {
            if (!current || current.callId !== session.callId) return current;
            const next = {
              ...current,
              phase: "connected" as const,
              connectedAt: current.connectedAt ?? Date.now(),
            };
            activeRef.current = next;
            return next;
          });
        }
        if (pc.connectionState === "failed") {
          const current = activeRef.current;
          if (current?.callId === session.callId) {
            toast.error("La connexion de l'appel a échoué");
            resetCall(current, "failed");
          }
        }
      };
      return pc;
    },
    [clearTimeouts, insertRtcMessage, resetCall],
  );

  const acquireMedia = useCallback(
    async (kind: CallKind, facing: "user" | "environment" = "user") => {
      if (!mediaIsAvailable()) {
        throw new Error("HTTPS_REQUIRED");
      }
      return navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video:
          kind === "video"
            ? { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : false,
      });
    },
    [],
  );

  const processSignal = useCallback(
    async (messageId: string, conversationId: string, senderId: string, meta: SignalMeta) => {
      if (!user || processedMessagesRef.current.has(messageId)) return;
      if (
        !isUuid(conversationId) ||
        !isUuid(senderId) ||
        senderId === user.id ||
        !isUuid(meta.call_id) ||
        !meta.signal ||
        !RTC_SIGNALS.has(meta.signal) ||
        !isUuid(meta.recipient_id) ||
        meta.recipient_id !== user.id
      )
        return;
      processedMessagesRef.current.add(messageId);

      const callId = meta.call_id;
      const kind = meta.kind === "video" ? "video" : "audio";
      const current = activeRef.current;
      const ringing = incomingRef.current;

      if (meta.signal === "invite") {
        const { data: participantRows, error: participantError } = await supabase
          .from("conversation_participants")
          .select("user_id")
          .eq("conversation_id", conversationId)
          .limit(3);
        const participants = new Set((participantRows ?? []).map((row) => row.user_id));
        if (
          participantError ||
          participants.size !== 2 ||
          !participants.has(user.id) ||
          !participants.has(senderId)
        ) {
          console.warn("RTC invitation rejected: invalid direct conversation");
          return;
        }
        if ((current && current.callId !== callId) || (ringing && ringing.callId !== callId)) {
          await insertRawRtcMessage(conversationId, senderId, callId, kind, "busy");
          return;
        }
        if (current?.callId === callId || ringing?.callId === callId) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, username, avatar_url")
          .eq("id", senderId)
          .maybeSingle();
        const session: CallSession = {
          callId,
          conversationId,
          kind,
          direction: "incoming",
          phase: "ringing",
          peer: {
            id: senderId,
            name: profile?.display_name ?? profile?.username ?? "Voyageur",
            avatar: profile?.avatar_url ?? null,
          },
          createdAt: Date.now(),
          connectedAt: null,
        };
        incomingRef.current = session;
        setIncoming(session);
        incomingTimeoutRef.current = window.setTimeout(() => {
          if (incomingRef.current?.callId === callId) resetCall(session, "missed", false);
        }, CALL_TIMEOUT_MS + 5_000);
        return;
      }

      const session =
        current?.callId === callId ? current : ringing?.callId === callId ? ringing : null;
      if (!session || session.peer.id !== senderId || session.conversationId !== conversationId)
        return;

      if (meta.signal === "offer") {
        const offer = meta.payload as RTCSessionDescriptionInit;
        if (peerConnectionRef.current && activeRef.current?.callId === callId)
          await applyOffer(offer);
        else pendingOfferRef.current = offer;
        return;
      }
      if (meta.signal === "answer") {
        const pc = peerConnectionRef.current;
        if (pc && !pc.remoteDescription) {
          await pc.setRemoteDescription(meta.payload as RTCSessionDescriptionInit);
          await flushCandidates();
        }
        return;
      }
      if (meta.signal === "ice") {
        const candidate = meta.payload as RTCIceCandidateInit;
        const pc = peerConnectionRef.current;
        if (pc?.remoteDescription) {
          try {
            await pc.addIceCandidate(candidate);
          } catch (error) {
            console.warn("ICE candidate ignored", error);
          }
        } else {
          pendingCandidatesRef.current.push(candidate);
        }
        return;
      }
      if (meta.signal === "accept") {
        if (current?.direction === "outgoing") {
          clearTimeouts();
          setActive((value) => {
            if (!value || value.callId !== callId) return value;
            const next = { ...value, phase: "connecting" as const };
            activeRef.current = next;
            return next;
          });
          connectionTimeoutRef.current = window.setTimeout(async () => {
            const live = activeRef.current;
            if (!live || live.callId !== callId || live.phase === "connected") return;
            toast.error("La connexion audio n'a pas pu être établie");
            await insertRtcMessage(live, "hangup", { reason: "failed" });
            resetCall(live, "failed");
          }, 25_000);
        }
        return;
      }
      if (meta.signal === "decline") {
        toast.info(`${session.peer.name} a refusé l'appel`);
        resetCall(session, "declined");
        return;
      }
      if (meta.signal === "busy") {
        toast.info(`${session.peer.name} est déjà en appel`);
        resetCall(session, "busy");
        return;
      }
      if (meta.signal === "hangup") {
        const reason = (meta.payload as { reason?: CallEndReason } | null)?.reason ?? "ended";
        resetCall(session, reason);
      }
    },
    [
      applyOffer,
      clearTimeouts,
      flushCandidates,
      insertRawRtcMessage,
      insertRtcMessage,
      resetCall,
      user,
    ],
  );

  useEffect(() => {
    if (!user) return;
    const handlePayload = (payload: { new: Record<string, unknown> }) => {
      const row = payload.new as RtcMessageRow;
      if (row.attachment_type !== RTC_ATTACHMENT_TYPE || !row.attachment_meta) return;
      signalQueueRef.current = signalQueueRef.current
        .then(() => processSignal(row.id, row.conversation_id, row.sender_id, row.attachment_meta!))
        .catch((error) => console.error("Call signal processing error", error));
    };

    const broadcastChannel = supabase
      .channel(`globelink-call-user-${user.id}`, { config: { private: true } })
      .on("broadcast", { event: "rtc-signal" }, ({ payload }) => {
        const row = payload as RtcMessageRow;
        if (!row?.attachment_meta) return;
        signalQueueRef.current = signalQueueRef.current
          .then(() =>
            processSignal(row.id, row.conversation_id, row.sender_id, row.attachment_meta!),
          )
          .catch((error) => console.error("Call broadcast processing error", error));
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR")
          console.warn("Le canal privé d’appel est indisponible, utilisation du secours SQL");
      });

    const databaseChannel = supabase
      .channel(`globelink-call-db-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        handlePayload,
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          console.warn(
            "Le canal Realtime SQL des appels se reconnecte; le canal privé et la récupération SQL restent actifs.",
          );
      });

    const since = new Date(Date.now() - 120_000).toISOString();
    supabase
      .from("messages")
      .select("id, conversation_id, sender_id, attachment_type, attachment_meta, created_at")
      .eq("attachment_type", RTC_ATTACHMENT_TYPE)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(250)
      .then(({ data }) => {
        for (const rawRow of data ?? []) {
          const row = rawRow as unknown as RtcMessageRow;
          const meta = row.attachment_meta;
          if (!meta) continue;
          signalQueueRef.current = signalQueueRef.current
            .then(() => processSignal(row.id, row.conversation_id, row.sender_id, meta))
            .catch((error) => console.error("Call recovery error", error));
        }
      });

    return () => {
      void supabase.removeChannel(broadcastChannel);
      void supabase.removeChannel(databaseChannel);
    };
  }, [processSignal, user]);

  useEffect(
    () => () => {
      clearTimeouts();
      stopMedia();
    },
    [clearTimeouts, stopMedia],
  );

  const startCall = useCallback(
    async (args: StartCallArgs) => {
      if (!user) return;
      if (activeRef.current || incomingRef.current) {
        toast.info("Un appel est déjà en cours");
        return;
      }
      if (!mediaIsAvailable()) {
        toast.error(
          "Les appels nécessitent l'adresse HTTPS. Lance le fichier GLOBELINK_APPELS_HTTPS.bat.",
          { duration: 8000 },
        );
        setSecureMediaAvailable(false);
        return;
      }

      await refreshRtcConfiguration();

      let stream: MediaStream;
      try {
        stream = await acquireMedia(args.kind);
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          toast.error("Autorise l'accès au micro et à la caméra dans Safari");
        } else {
          toast.error("Micro ou caméra indisponible");
        }
        return;
      }

      const session: CallSession = {
        callId: crypto.randomUUID(),
        conversationId: args.conversationId,
        kind: args.kind,
        direction: "outgoing",
        phase: "calling",
        peer: {
          id: args.recipientId,
          name: args.recipientName,
          avatar: args.recipientAvatar ?? null,
        },
        createdAt: Date.now(),
        connectedAt: null,
      };

      localStreamRef.current = stream;
      setLocalStream(stream);
      activeRef.current = session;
      setActive(session);

      try {
        const pc = createPeerConnection(session, stream);
        await insertRtcMessage(session, "invite");
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: args.kind === "video",
        });
        await pc.setLocalDescription(offer);
        await insertRtcMessage(session, "offer", offer);
        outgoingTimeoutRef.current = window.setTimeout(async () => {
          if (
            activeRef.current?.callId !== session.callId ||
            activeRef.current.phase === "connected"
          )
            return;
          await insertRtcMessage(session, "hangup", { reason: "missed" });
          toast.info("Aucune réponse");
          resetCall(session, "missed");
        }, CALL_TIMEOUT_MS);
      } catch (error) {
        console.error(error);
        toast.error("Impossible de démarrer l'appel");
        resetCall(session, "failed");
      }
    },
    [
      acquireMedia,
      createPeerConnection,
      insertRtcMessage,
      refreshRtcConfiguration,
      resetCall,
      user,
    ],
  );

  const acceptCall = useCallback(async () => {
    const session = incomingRef.current;
    if (!session) return;
    clearTimeouts();
    if (!mediaIsAvailable()) {
      toast.error("Ouvre GlobeLink avec l'adresse HTTPS pour utiliser les appels", {
        duration: 8000,
      });
      await insertRtcMessage(session, "decline", { reason: "failed" });
      resetCall(session, "failed", false);
      return;
    }

    await refreshRtcConfiguration();

    let stream: MediaStream;
    try {
      stream = await acquireMedia(session.kind);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        toast.error("Autorise l'accès au micro et à la caméra");
      } else {
        toast.error("Micro ou caméra indisponible");
      }
      await insertRtcMessage(session, "decline", { reason: "failed" });
      resetCall(session, "failed", false);
      return;
    }

    const activeSession = { ...session, phase: "connecting" as const };
    setIncoming(null);
    incomingRef.current = null;
    setActive(activeSession);
    activeRef.current = activeSession;
    localStreamRef.current = stream;
    setLocalStream(stream);

    try {
      createPeerConnection(activeSession, stream);
      connectionTimeoutRef.current = window.setTimeout(async () => {
        const live = activeRef.current;
        if (!live || live.callId !== activeSession.callId || live.phase === "connected") return;
        toast.error("La connexion audio n'a pas pu être établie");
        await insertRtcMessage(live, "hangup", { reason: "failed" });
        resetCall(live, "failed", false);
      }, 25_000);
      await insertRtcMessage(activeSession, "accept");
      if (pendingOfferRef.current) {
        const offer = pendingOfferRef.current;
        pendingOfferRef.current = null;
        await applyOffer(offer);
      }
    } catch (error) {
      console.error(error);
      toast.error("Connexion à l'appel impossible");
      await insertRtcMessage(activeSession, "hangup", { reason: "failed" });
      resetCall(activeSession, "failed", false);
    }
  }, [
    acquireMedia,
    applyOffer,
    clearTimeouts,
    createPeerConnection,
    insertRtcMessage,
    refreshRtcConfiguration,
    resetCall,
  ]);

  const declineCall = useCallback(async () => {
    const session = incomingRef.current;
    if (!session) return;
    await insertRtcMessage(session, "decline");
    resetCall(session, "declined", false);
  }, [insertRtcMessage, resetCall]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    const next = !cameraEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setCameraEnabled(next);
  }, [cameraEnabled]);

  const switchCamera = useCallback(async () => {
    const session = activeRef.current;
    const pc = peerConnectionRef.current;
    if (!session || session.kind !== "video" || !pc) return;
    const nextFacing = cameraFacing === "user" ? "environment" : "user";
    try {
      const replacement = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      const nextTrack = replacement.getVideoTracks()[0];
      const sender = pc.getSenders().find((item) => item.track?.kind === "video");
      await sender?.replaceTrack(nextTrack);
      localStreamRef.current?.getVideoTracks().forEach((track) => track.stop());
      const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
      const nextStream = new MediaStream([...audioTracks, nextTrack]);
      localStreamRef.current = nextStream;
      setLocalStream(nextStream);
      setCameraFacing(nextFacing);
      setCameraEnabled(true);
    } catch {
      toast.error("Impossible de changer de caméra");
    }
  }, [cameraFacing]);

  const contextValue = useMemo<CallsContextValue>(
    () => ({
      startCall,
      busy: Boolean(active || incoming),
      secureMediaAvailable,
    }),
    [active, incoming, secureMediaAvailable, startCall],
  );

  return (
    <CallsContext.Provider value={contextValue}>
      {children}
      {incoming && (
        <IncomingCallScreen session={incoming} onAccept={acceptCall} onDecline={declineCall} />
      )}
      {active && (
        <ActiveCallScreen
          session={active}
          localStream={localStream}
          remoteStream={remoteStream}
          muted={muted}
          cameraEnabled={cameraEnabled}
          remoteSound={remoteSound}
          durationSeconds={durationSeconds}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onToggleSound={() => setRemoteSound((value) => !value)}
          onSwitchCamera={switchCamera}
          onHangup={() => void sendHangupAndReset("ended")}
        />
      )}
    </CallsContext.Provider>
  );
}

export function useCalls() {
  return useContext(CallsContext);
}

function Avatar({ profile, large = false }: { profile: PeerProfile; large?: boolean }) {
  const size = large ? "h-28 w-28 text-4xl" : "h-16 w-16 text-xl";
  return profile.avatar ? (
    <img
      src={profile.avatar}
      alt=""
      className={`${size} rounded-full border-4 border-white/15 object-cover shadow-2xl`}
    />
  ) : (
    <div
      className={`${size} grid place-items-center rounded-full border-4 border-white/15 bg-white/10 font-semibold text-white shadow-2xl`}
    >
      {profile.name[0]?.toUpperCase()}
    </div>
  );
}

function IncomingCallScreen({
  session,
  onAccept,
  onDecline,
}: {
  session: CallSession;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div
      className="call-screen call-screen-incoming"
      role="dialog"
      aria-modal="true"
      aria-label={`${callLabel(session.kind)} entrant`}
    >
      <div className="call-screen-glow" />
      <div className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-between px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))] text-center text-white">
        <div>
          <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full bg-white/10 backdrop-blur">
            {session.kind === "video" ? (
              <Video className="h-5 w-5" />
            ) : (
              <PhoneCall className="h-5 w-5" />
            )}
          </div>
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/65">
            {callLabel(session.kind)} entrant
          </p>
        </div>
        <div className="flex flex-col items-center">
          <div className="call-avatar-pulse">
            <Avatar profile={session.peer} large />
          </div>
          <h2 className="mt-7 text-3xl font-semibold tracking-tight">{session.peer.name}</h2>
          <p className="mt-2 text-white/65">Souhaite discuter avec toi</p>
        </div>
        <div className="grid w-full max-w-xs grid-cols-2 gap-8">
          <CallActionButton
            label="Refuser"
            tone="danger"
            onClick={onDecline}
            icon={<PhoneOff className="h-7 w-7" />}
          />
          <CallActionButton
            label="Accepter"
            tone="success"
            onClick={onAccept}
            icon={
              session.kind === "video" ? (
                <Video className="h-7 w-7" />
              ) : (
                <Phone className="h-7 w-7" />
              )
            }
          />
        </div>
      </div>
    </div>
  );
}

function ActiveCallScreen({
  session,
  localStream,
  remoteStream,
  muted,
  cameraEnabled,
  remoteSound,
  durationSeconds,
  onToggleMute,
  onToggleCamera,
  onToggleSound,
  onSwitchCamera,
  onHangup,
}: {
  session: CallSession;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraEnabled: boolean;
  remoteSound: boolean;
  durationSeconds: number;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleSound: () => void;
  onSwitchCamera: () => void;
  onHangup: () => void;
}) {
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (localVideo.current) localVideo.current.srcObject = localStream;
  }, [localStream]);
  useEffect(() => {
    const mediaElements = [remoteVideo.current, remoteAudio.current].filter(
      Boolean,
    ) as HTMLMediaElement[];
    for (const element of mediaElements) {
      element.srcObject = remoteStream;
      if (remoteStream) {
        void element.play().catch((error) => {
          console.warn("Lecture du flux distant retardée", error);
        });
      }
    }
  }, [remoteStream]);

  const status =
    session.phase === "calling"
      ? "Appel en cours…"
      : session.phase === "connecting"
        ? "Connexion…"
        : formatDuration(durationSeconds);

  return (
    <div
      className={`call-screen ${session.kind === "video" ? "call-screen-video" : "call-screen-audio"}`}
      role="dialog"
      aria-modal="true"
      aria-label={callLabel(session.kind)}
    >
      {session.kind === "video" ? (
        <>
          <video
            ref={remoteVideo}
            autoPlay
            playsInline
            muted={!remoteSound}
            className={`call-remote-video ${remoteStream ? "opacity-100" : "opacity-0"}`}
          />
          {!remoteStream && (
            <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_30%,#155e75,#071923_68%)]">
              <div className="flex flex-col items-center text-white">
                <Avatar profile={session.peer} large />
                <p className="mt-6 text-white/70">{status}</p>
              </div>
            </div>
          )}
          {localStream && cameraEnabled && (
            <video ref={localVideo} autoPlay playsInline muted className="call-local-video" />
          )}
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_28%,#176b73,#071923_70%)] text-white">
          <div className="call-avatar-pulse">
            <Avatar profile={session.peer} large />
          </div>
          <h2 className="mt-7 text-3xl font-semibold tracking-tight">{session.peer.name}</h2>
          <p className="mt-2 text-white/65">{status}</p>
          <audio ref={remoteAudio} autoPlay muted={!remoteSound} />
        </div>
      )}

      <div className="call-topbar">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-white">{session.peer.name}</p>
          <p className="text-sm text-white/65">{status}</p>
        </div>
        {!secureContextBadgeHidden() && (
          <div className="flex items-center gap-1 rounded-full bg-amber-400/15 px-3 py-1.5 text-xs text-amber-100">
            <ShieldAlert className="h-3.5 w-3.5" /> HTTPS
          </div>
        )}
      </div>

      <div className="call-controls">
        <CallControl
          label={muted ? "Réactiver" : "Micro"}
          active={!muted}
          onClick={onToggleMute}
          icon={muted ? <MicOff /> : <Mic />}
        />
        {session.kind === "video" && (
          <CallControl
            label={cameraEnabled ? "Caméra" : "Activer"}
            active={cameraEnabled}
            onClick={onToggleCamera}
            icon={cameraEnabled ? <Camera /> : <CameraOff />}
          />
        )}
        <button type="button" onClick={onHangup} className="call-hangup" aria-label="Raccrocher">
          <PhoneOff className="h-7 w-7" />
        </button>
        <CallControl
          label={remoteSound ? "Son" : "Silencieux"}
          active={remoteSound}
          onClick={onToggleSound}
          icon={remoteSound ? <Volume2 /> : <VolumeX />}
        />
        {session.kind === "video" && (
          <CallControl label="Retourner" active onClick={onSwitchCamera} icon={<RefreshCw />} />
        )}
      </div>
    </div>
  );
}

function secureContextBadgeHidden() {
  return typeof window !== "undefined" && window.isSecureContext;
}

function CallControl({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className="call-control-button">
      <span className={`call-control-icon ${active ? "is-active" : ""}`}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function CallActionButton({
  label,
  tone,
  onClick,
  icon,
}: {
  label: string;
  tone: "danger" | "success";
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-3 text-sm text-white/80"
    >
      <span
        className={`grid h-17 w-17 place-items-center rounded-full shadow-2xl ${tone === "danger" ? "bg-red-500" : "bg-emerald-500"}`}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}
