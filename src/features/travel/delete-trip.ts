import { supabase } from "@/integrations/supabase/client";

type DatabaseError = { code?: string; message: string; details?: string | null };
type AiDayRow = { id: string; title: string };
type DeleteResult = { deleted: boolean; error: DatabaseError | null };
type RowsResult = { rows: AiDayRow[]; error: DatabaseError | null };
type ParkResult = { updatedIds: string[]; error: DatabaseError | null };

export type TripDeletionGateway = {
  deleteTrip: () => Promise<DeleteResult>;
  listAiDays: () => Promise<RowsResult>;
  parkAiDays: (ids: string[]) => Promise<ParkResult>;
  restoreAiDay: (day: AiDayRow) => Promise<DatabaseError | null>;
};

const TEMPORARY_DELETE_TITLE = "GlobeLink · Suppression de voyage en cours";

function deletionError(error: DatabaseError | null, fallback: string): Error {
  const details = [error?.message, error?.code ? `code ${error.code}` : null]
    .filter(Boolean)
    .join(" · ");
  return new Error(details || fallback);
}

export function isTripAiArchiveConflict(error: DatabaseError | null): boolean {
  if (error?.code !== "23503") return false;
  const detail = `${error.message || ""} ${error.details || ""}`.toLowerCase();
  return detail.includes("trip_entries") && (detail.includes("trip_id") || detail.includes("trips"));
}

/**
 * When the trip deletion cascades to IA+ day entries, an older AFTER DELETE
 * archive trigger can try to insert a child entry under an already-deleted
 * trip (23503). First try the normal, atomic FK cascade. Only for that precise
 * error, temporarily disarm the IA+ title predicate and retry. If the retry
 * fails, restore every changed title, leaving the journal intact.
 */
export async function deleteTripWithArchiveRecovery(gateway: TripDeletionGateway): Promise<void> {
  const first = await gateway.deleteTrip();
  if (first.deleted && !first.error) return;
  if (!isTripAiArchiveConflict(first.error)) {
    throw deletionError(first.error, "Le voyage n'a pas été supprimé. Vérifie tes droits d'accès.");
  }

  const snapshot = await gateway.listAiDays();
  if (snapshot.error) throw deletionError(snapshot.error, "Impossible de vérifier les journées du voyage.");
  const rows = snapshot.rows;
  if (!rows.length) throw deletionError(first.error, "La suppression du voyage est bloquée.");
  if (rows.length > 500) throw new Error("Ce voyage comporte trop de journées à sécuriser avant suppression.");

  const parked = await gateway.parkAiDays(rows.map((day) => day.id));
  const parkedIds = new Set(parked.updatedIds);
  if (parked.error || parkedIds.size !== rows.length || rows.some((day) => !parkedIds.has(day.id))) {
    const failedRestores = await Promise.all(
      rows.filter((day) => parkedIds.has(day.id)).map((day) => gateway.restoreAiDay(day)),
    );
    if (failedRestores.some(Boolean)) {
      throw new Error("La suppression a été interrompue et certaines journées n'ont pas pu être restaurées. Contacte le support avant de réessayer.");
    }
    throw deletionError(parked.error, "Impossible de préparer les journées IA+ sans perte de données.");
  }

  try {
    const retry = await gateway.deleteTrip();
    if (retry.error || !retry.deleted) {
      throw deletionError(retry.error, "Le voyage existe encore après la tentative de suppression.");
    }
  } catch (error) {
    const restores = await Promise.all(rows.map((day) => gateway.restoreAiDay(day)));
    if (restores.some(Boolean)) {
      throw new Error("La suppression a échoué et certaines journées IA+ n'ont pas pu être restaurées. Contacte le support avant de réessayer.");
    }
    throw error;
  }
}

export async function deleteOwnedTripSafely(tripId: string, userId: string): Promise<void> {
  await deleteTripWithArchiveRecovery({
    deleteTrip: async () => {
      const { data, error } = await supabase
        .from("trips")
        .delete()
        .eq("id", tripId)
        .eq("user_id", userId)
        .select("id");
      return { deleted: !!data?.some((row) => row.id === tripId), error };
    },
    listAiDays: async () => {
      const { data, error } = await supabase
        .from("trip_entries")
        .select("id, title")
        .eq("trip_id", tripId)
        .eq("user_id", userId)
        .eq("kind", "note")
        .like("title", "IA+ · Jour%")
        .limit(501);
      return { rows: data ?? [], error };
    },
    parkAiDays: async (ids) => {
      const { data, error } = await supabase
        .from("trip_entries")
        .update({ title: TEMPORARY_DELETE_TITLE })
        .eq("trip_id", tripId)
        .eq("user_id", userId)
        .in("id", ids)
        .select("id");
      return { updatedIds: (data ?? []).map((row) => row.id), error };
    },
    restoreAiDay: async ({ id, title }) => {
      const { data, error } = await supabase
        .from("trip_entries")
        .update({ title })
        .eq("id", id)
        .eq("trip_id", tripId)
        .eq("user_id", userId)
        .select("id");
      if (!error && !data?.some((row) => row.id === id)) {
        return { message: "Journée introuvable lors de la restauration", code: "RESTORE_MISSING" };
      }
      return error;
    },
  });
}
