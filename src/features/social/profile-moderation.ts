import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type RelationshipControlMode = "restricted" | "blocked";

export async function saveRelationshipControl(input: {
  ownerId: string;
  targetId: string;
  mode: RelationshipControlMode;
}) {
  const { error } = await db.from("user_relationship_controls").upsert(
    {
      owner_id: input.ownerId,
      target_id: input.targetId,
      mode: input.mode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,target_id" },
  );

  if (error) throw error;
}

export async function reportProfile(input: { reporterId: string; targetId: string }) {
  const { error } = await db.from("reports").insert({
    reporter_id: input.reporterId,
    target_type: "profile",
    target_id: input.targetId,
    reason: "Profil signalé",
  });

  if (error) throw error;
}
