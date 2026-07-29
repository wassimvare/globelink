import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Paperclip, Image as ImageIcon, Mic, Square, Check, CheckCheck, MapPin, Notebook, Play, Pause, Phone, Video } from "lucide-react";
import { toast } from "sonner";
import { uploadMedia, getSignedMediaUrl } from "@/lib/storage";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { useCalls } from "@/components/CallProvider";

export const Route = createFileRoute("/_authenticated/messages/$id")({
  head: () => ({ meta: [
    { title: "Conversation — GlobeLink" },
    { name: "description", content: "Discussion privée GlobeLink avec messages, médias, vocaux et statut vu." },
    { property: "og:title", content: "Conversation — GlobeLink" },
    { property: "og:description", content: "Messagerie privée sécurisée pour voyageurs GlobeLink." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ConversationPage,
});

type Msg = {
  id: string;
  content: string | null;
  sender_id: string;
  created_at: string;
  attachment_url: string | null;
  attachment_type: string | null;
  attachment_meta: Record<string, unknown> | null;
};

function ConversationPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { startCall, busy: callBusy } = useCalls();
  const [text, setText] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const mediaRec = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSent = useRef(0);

  const { data: other } = useQuery({
    queryKey: ["conv-other", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("conversation_participants")
        .select("user_id, last_read_at, profile:user_id ( username, display_name, avatar_url )")
        .eq("conversation_id", id);
      const arr = (data ?? []) as unknown as {
        user_id: string;
        last_read_at: string;
        profile: { username: string; display_name: string | null; avatar_url: string | null } | null;
      }[];
      return arr.find((p) => p.user_id !== user!.id) ?? null;
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["messages", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, content, sender_id, created_at, attachment_url, attachment_type, attachment_meta")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });
      return ((data ?? []) as Msg[]).filter((message) => message.attachment_type !== "rtc");
    },
  });

  // Mark read + realtime + typing channel
  useEffect(() => {
    if (!user) return;
    supabase.from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", id).eq("user_id", user.id).then(() => {
        qc.invalidateQueries({ queryKey: ["conv-other", id] });
      });
  }, [id, user, messages?.length, qc]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`conv-${id}`, { config: { broadcast: { self: false } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const inserted = payload.new as { attachment_type?: string | null };
          if (inserted.attachment_type !== "rtc") qc.invalidateQueries({ queryKey: ["messages", id] });
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_participants", filter: `conversation_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["conv-other", id] }))
      .on("broadcast", { event: "typing" }, (payload) => {
        if ((payload.payload as { user: string })?.user !== user.id) {
          setOtherTyping(true);
          window.clearTimeout((setOtherTyping as unknown as { _t?: number })._t ?? 0);
          (setOtherTyping as unknown as { _t?: number })._t = window.setTimeout(() => setOtherTyping(false), 2500);
        }
      })
      .subscribe();
    typingChannel.current = ch;
    return () => { supabase.removeChannel(ch); typingChannel.current = null; };
  }, [id, qc, user]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages?.length, otherTyping]);

  const sendTyping = () => {
    const now = Date.now();
    if (now - lastTypingSent.current < 1500) return;
    lastTypingSent.current = now;
    typingChannel.current?.send({ type: "broadcast", event: "typing", payload: { user: user?.id } });
  };

  const insertMessage = async (payload: { content?: string | null; attachment_url?: string; attachment_type?: string; attachment_meta?: Record<string, unknown> }) => {
    if (!user) return;
    const { data: participant, error: participantError } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (participantError || !participant) {
      console.error(participantError ?? new Error("Current user is not a participant"));
      toast.error("Conversation inaccessible");
      return;
    }

    const { error } = await supabase.from("messages").insert({
      conversation_id: id,
      sender_id: user.id,
      content: payload.content ?? null,
      attachment_url: payload.attachment_url ?? null,
      attachment_type: payload.attachment_type ?? null,
      attachment_meta: (payload.attachment_meta ?? null) as never,
    });
    if (error) {
      console.error(error);
      toast.error("Envoi impossible");
      return;
    }
    qc.invalidateQueries({ queryKey: ["messages", id] });
    qc.invalidateQueries({ queryKey: ["conversations", user.id] });
  };

  const sendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const content = text.trim();
    setText("");
    await insertMessage({ content });
  };

  const uploadAndSend = async (file: File, kind: "image" | "video" | "voice") => {
    if (!user) return;
    setUploading(true);
    try {
      const path = await uploadMedia(user.id, `dm/${kind}`, file);
      await insertMessage({ attachment_url: path, attachment_type: kind });
    } catch (err) {
      toast.error("Upload impossible");
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recChunks.current = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) recChunks.current.push(ev.data); };
      rec.onstop = async () => {
        const blob = new Blob(recChunks.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
        await uploadAndSend(file, "voice");
      };
      mediaRec.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error("Micro indisponible");
    }
  };

  const stopRecording = () => {
    mediaRec.current?.stop();
    setRecording(false);
  };

  const otherName = other?.profile?.display_name ?? other?.profile?.username ?? "Voyageur";
  const otherReadAt = other?.last_read_at ? new Date(other.last_read_at) : null;
  const lastOwn = useMemo(() => [...(messages ?? [])].reverse().find((m) => m.sender_id === user?.id), [messages, user]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
        <header className="mb-4 flex items-center gap-3">
          <button onClick={() => navigate({ to: "/messages" })} className="grid h-9 w-9 place-items-center rounded-full border border-border transition hover:bg-secondary">
            <ArrowLeft className="h-4 w-4" />
          </button>
          {other?.profile && (
            <>
              <Link to="/profile/$username" params={{ username: other.profile.username }} className="flex min-w-0 flex-1 items-center gap-3">
                {other.profile.avatar_url
                  ? <img src={other.profile.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  : <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-medium">{otherName[0]?.toUpperCase()}</div>}
                <div className="min-w-0">
                  <div className="truncate font-semibold leading-tight">{otherName}</div>
                  <div className="truncate text-xs text-muted-foreground">{otherTyping ? "en train d'écrire…" : `@${other.profile.username}`}</div>
                </div>
              </Link>
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  disabled={callBusy}
                  onClick={() => void startCall({ conversationId: id, recipientId: other.user_id, recipientName: otherName, recipientAvatar: other.profile?.avatar_url, kind: "audio" })}
                  className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label={`Appeler ${otherName} en audio`}
                  title="Appel audio"
                >
                  <Phone className="h-4.5 w-4.5" />
                </button>
                <button
                  type="button"
                  disabled={callBusy}
                  onClick={() => void startCall({ conversationId: id, recipientId: other.user_id, recipientName: otherName, recipientAvatar: other.profile?.avatar_url, kind: "video" })}
                  className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label={`Appeler ${otherName} en vidéo`}
                  title="Appel vidéo"
                >
                  <Video className="h-4.5 w-4.5" />
                </button>
              </div>
            </>
          )}
        </header>

        <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto rounded-3xl border border-border bg-card p-4 shadow-soft">
          {(!messages || messages.length === 0) && (
            <p className="py-12 text-center text-sm text-muted-foreground">Aucun message — dis bonjour ✈️</p>
          )}
          {messages?.map((m) => {
            const mine = m.sender_id === user?.id;
            const seen = mine && lastOwn?.id === m.id && otherReadAt && new Date(m.created_at) <= otherReadAt;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-soft ${mine ? "gradient-hero text-primary-foreground" : "bg-secondary"}`}>
                  <AttachmentView msg={m} />
                  {m.content && <div className={m.attachment_url ? "mt-1.5" : ""}>{m.content}</div>}
                </div>
                {mine && (
                  <div className="mt-0.5 flex items-center gap-1 pr-1 text-[10px] text-muted-foreground">
                    <span>{formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: fr })}</span>
                    {lastOwn?.id === m.id && (seen ? <CheckCheck className="h-3 w-3 text-accent" /> : <Check className="h-3 w-3" />)}
                  </div>
                )}
              </div>
            );
          })}
          {otherTyping && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-secondary px-3 py-2 text-sm">
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={sendText} className="mt-3 flex items-center gap-2">
          <input ref={imgInput} type="file" accept="image/*" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0]; if (f) uploadAndSend(f, "image"); e.currentTarget.value = "";
          }} />
          <input ref={fileInput} type="file" accept="video/*" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0]; if (f) uploadAndSend(f, "video"); e.currentTarget.value = "";
          }} />

          <button type="button" onClick={() => imgInput.current?.click()} disabled={uploading} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition hover:bg-secondary" aria-label="Photo">
            <ImageIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition hover:bg-secondary" aria-label="Vidéo">
            <Paperclip className="h-4 w-4" />
          </button>
          <button type="button" onClick={recording ? stopRecording : startRecording} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border transition ${recording ? "border-destructive bg-destructive/10 text-destructive animate-pulse" : "border-border text-muted-foreground hover:bg-secondary"}`} aria-label="Message vocal">
            {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          <Input value={text} onChange={(e) => { setText(e.target.value); sendTyping(); }} placeholder={recording ? "Enregistrement…" : "Écris un message…"} className="rounded-full" disabled={recording} />
          <Button type="submit" size="icon" disabled={!text.trim() || uploading} className="rounded-full gradient-hero text-primary-foreground shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

function AttachmentView({ msg }: { msg: Msg }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!msg.attachment_url) return;
    getSignedMediaUrl(msg.attachment_url).then(setUrl);
  }, [msg.attachment_url]);

  // Share cards (no upload, metadata only)
  const meta = msg.attachment_meta as null | { kind?: string; title?: string; subtitle?: string; href?: string; image?: string };
  if (msg.attachment_type === "share" && meta) {
    return (
      <a href={meta.href ?? "#"} className="flex w-64 items-center gap-3 rounded-xl bg-background/60 p-2 text-foreground shadow-soft">
        {meta.image ? <img src={meta.image} className="h-14 w-14 rounded-lg object-cover" alt="" /> : <div className="grid h-14 w-14 place-items-center rounded-lg bg-secondary">{shareIcon(meta.kind)}</div>}
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{shareLabel(meta.kind)}</div>
          <div className="truncate text-sm font-semibold">{meta.title}</div>
          {meta.subtitle && <div className="truncate text-xs text-muted-foreground">{meta.subtitle}</div>}
        </div>
      </a>
    );
  }

  if (!msg.attachment_url) return null;
  if (!url) return <div className="skeleton h-40 w-56 rounded-xl" />;

  if (msg.attachment_type === "image") {
    return <img src={url} alt="" className="max-h-72 rounded-xl object-cover" />;
  }
  if (msg.attachment_type === "video") {
    return <video src={url} controls className="max-h-72 rounded-xl" />;
  }
  if (msg.attachment_type === "voice") {
    return <VoicePlayer url={url} />;
  }
  return <a href={url} target="_blank" rel="noreferrer" className="underline">Pièce jointe</a>;
}

function VoicePlayer({ url }: { url: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-background/50 px-2 py-1.5">
      <button type="button" onClick={() => {
        if (!audio.current) return;
        if (playing) audio.current.pause(); else audio.current.play();
      }} className="grid h-8 w-8 place-items-center rounded-full bg-accent text-accent-foreground">
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <div className="text-xs text-foreground/80">Message vocal</div>
      <audio ref={audio} src={url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
    </div>
  );
}

function shareIcon(kind?: string) {
  if (kind === "place") return <MapPin className="h-5 w-5" />;
  if (kind === "trip") return <Notebook className="h-5 w-5" />;
  return <Paperclip className="h-5 w-5" />;
}
function shareLabel(kind?: string) {
  if (kind === "place") return "Lieu partagé";
  if (kind === "trip") return "Carnet partagé";
  if (kind === "post") return "Publication partagée";
  if (kind === "itinerary") return "Itinéraire partagé";
  if (kind === "hotel") return "Hôtel partagé";
  if (kind === "activity") return "Activité partagée";
  return "Partage";
}
