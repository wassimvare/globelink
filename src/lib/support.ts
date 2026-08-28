import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export const SUPPORT_TICKET_SUBJECT_MIN_LENGTH = 3;
export const SUPPORT_TICKET_SUBJECT_MAX_LENGTH = 160;
export const SUPPORT_TICKET_MESSAGE_MIN_LENGTH = 10;
export const SUPPORT_TICKET_MESSAGE_MAX_LENGTH = 5000;

export type SupportCategory = "bug" | "technical" | "account" | "safety" | "feedback" | "other";
export type SupportStatus = "open" | "in_progress" | "waiting_user" | "resolved" | "closed";
export type SupportPriority = "low" | "normal" | "high" | "urgent";
export type SupportSenderKind = "user" | "staff";
export type ReportTargetType = "post" | "comment" | "profile" | "message";

export type SupportTicket = {
  id: string;
  user_id: string;
  category: SupportCategory;
  subject: string;
  message: string;
  status: SupportStatus;
  priority: SupportPriority;
  context: Record<string, unknown> | null;
  admin_reply: string | null;
  handled_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SupportTicketMessage = {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_kind: SupportSenderKind;
  body: string;
  created_at: string;
};

export type MyReport = {
  id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: string;
  details: string | null;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReportProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

function supportTicketErrorMessage(error: unknown) {
  const raw = String((error as { message?: unknown })?.message ?? error ?? "");

  if (raw.includes("support_tickets_message_length")) {
    return `Ton message doit contenir entre ${SUPPORT_TICKET_MESSAGE_MIN_LENGTH} et ${SUPPORT_TICKET_MESSAGE_MAX_LENGTH.toLocaleString("fr-FR")} caractères.`;
  }
  if (raw.includes("support_tickets_subject_length")) {
    return `L’objet doit contenir entre ${SUPPORT_TICKET_SUBJECT_MIN_LENGTH} et ${SUPPORT_TICKET_SUBJECT_MAX_LENGTH} caractères.`;
  }

  return "Impossible d’envoyer la demande pour le moment. Réessaie dans un instant.";
}

export async function createSupportTicket(input: {
  userId: string;
  category: SupportCategory;
  subject: string;
  message: string;
  priority?: SupportPriority;
  context?: Record<string, unknown>;
}) {
  const subject = input.subject.trim();
  const message = input.message.trim();

  if (subject.length < SUPPORT_TICKET_SUBJECT_MIN_LENGTH) {
    throw new Error(`L’objet doit contenir au moins ${SUPPORT_TICKET_SUBJECT_MIN_LENGTH} caractères.`);
  }
  if (subject.length > SUPPORT_TICKET_SUBJECT_MAX_LENGTH) {
    throw new Error(`L’objet est limité à ${SUPPORT_TICKET_SUBJECT_MAX_LENGTH} caractères.`);
  }
  if (message.length < SUPPORT_TICKET_MESSAGE_MIN_LENGTH) {
    throw new Error(`Ton message doit contenir au moins ${SUPPORT_TICKET_MESSAGE_MIN_LENGTH} caractères.`);
  }
  if (message.length > SUPPORT_TICKET_MESSAGE_MAX_LENGTH) {
    throw new Error(`Ton message est limité à ${SUPPORT_TICKET_MESSAGE_MAX_LENGTH.toLocaleString("fr-FR")} caractères.`);
  }

  const { data, error } = await db
    .from("support_tickets")
    .insert({
      user_id: input.userId,
      category: input.category,
      subject,
      message,
      priority: input.priority ?? "normal",
      context: input.context ?? {},
    })
    .select("*")
    .single();
  if (error) throw new Error(supportTicketErrorMessage(error));
  return data as SupportTicket;
}

export async function listMySupportTickets(userId: string) {
  const { data, error } = await db
    .from("support_tickets")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as SupportTicket[];
}

export async function listSupportMessagesForTickets(ticketIds: string[]) {
  if (!ticketIds.length) return [] as SupportTicketMessage[];
  const { data, error } = await db
    .from("support_ticket_messages")
    .select("id,ticket_id,sender_id,sender_kind,body,created_at")
    .in("ticket_id", ticketIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SupportTicketMessage[];
}

export async function sendSupportMessage(input: {
  ticketId: string;
  senderId: string;
  senderKind: SupportSenderKind;
  body: string;
}) {
  const body = input.body.trim();
  if (!body) throw new Error("Le message est vide.");
  if (body.length > 5000) throw new Error("Le message est limité à 5 000 caractères.");
  const { data, error } = await db
    .from("support_ticket_messages")
    .insert({
      ticket_id: input.ticketId,
      sender_id: input.senderId,
      sender_kind: input.senderKind,
      body,
    })
    .select("id,ticket_id,sender_id,sender_kind,body,created_at")
    .single();
  if (error) throw error;
  return data as SupportTicketMessage;
}

export async function listMyReports(userId: string) {
  const { data, error } = await db
    .from("reports")
    .select("id,target_type,target_id,reason,details,status,resolution_note,resolved_at,created_at,updated_at")
    .eq("reporter_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as MyReport[];
}

export async function createReport(input: {
  userId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string;
}) {
  const { data, error } = await db
    .from("reports")
    .insert({
      reporter_id: input.userId,
      target_type: input.targetType,
      target_id: input.targetId,
      reason: input.reason.trim(),
      details: input.details?.trim() || null,
    })
    .select("id,target_type,target_id,reason,details,status,resolution_note,resolved_at,created_at,updated_at")
    .single();
  if (error) throw error;
  return data as MyReport;
}

export async function searchProfilesForReport(userId: string, query: string) {
  const q = query.trim();
  if (q.length < 2) return [] as ReportProfile[];
  const safe = q.replace(/[%_,()]/g, " ").trim();
  const { data, error } = await db
    .from("profiles")
    .select("id,username,display_name,avatar_url")
    .neq("id", userId)
    .eq("status", "active")
    .neq("visibility", "hidden")
    .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
    .limit(12);
  if (error) throw error;
  return (data ?? []) as ReportProfile[];
}

export async function isCurrentUserSupportStaff(userId: string) {
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "moderator"]);
  if (error) return false;
  return (data ?? []).some((row: { role?: string }) => row.role === "admin" || row.role === "moderator");
}

// Backwards-compatible name used by the help center. Support management is intentionally
// available to moderators as well as administrators.
export async function isCurrentUserAdmin(userId: string) {
  return isCurrentUserSupportStaff(userId);
}

export async function listSupportTicketsForStaff(status?: SupportStatus | "all") {
  let query = db
    .from("support_tickets")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(250);
  if (status && status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SupportTicket[];
}

export async function updateSupportTicketAsStaff(
  ticketId: string,
  changes: Partial<Pick<SupportTicket, "status" | "priority" | "admin_reply" | "handled_by" | "resolved_at">>,
) {
  const { data, error } = await db
    .from("support_tickets")
    .update(changes)
    .eq("id", ticketId)
    .select("*")
    .single();
  if (error) throw error;
  return data as SupportTicket;
}

export function extractUuid(value: string) {
  const match = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  return match?.[0] ?? null;
}
