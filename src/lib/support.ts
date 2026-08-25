import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type SupportCategory = "bug" | "technical" | "account" | "safety" | "feedback" | "other";
export type SupportStatus = "open" | "in_progress" | "waiting_user" | "resolved" | "closed";
export type SupportPriority = "low" | "normal" | "high" | "urgent";
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

export async function createSupportTicket(input: {
  userId: string;
  category: SupportCategory;
  subject: string;
  message: string;
  priority?: SupportPriority;
  context?: Record<string, unknown>;
}) {
  const { data, error } = await db
    .from("support_tickets")
    .insert({
      user_id: input.userId,
      category: input.category,
      subject: input.subject.trim(),
      message: input.message.trim(),
      priority: input.priority ?? "normal",
      context: input.context ?? {},
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as SupportTicket;
}

export async function listMySupportTickets(userId: string) {
  const { data, error } = await db
    .from("support_tickets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as SupportTicket[];
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

export async function isCurrentUserAdmin(userId: string) {
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function listSupportTicketsForStaff(status?: SupportStatus | "all") {
  let query = db
    .from("support_tickets")
    .select("*")
    .order("created_at", { ascending: false })
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
