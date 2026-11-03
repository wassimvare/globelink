import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type DeleteAccountInput = {
  confirmationEmail: string;
  confirmationPhrase: string;
};

async function collectUserStoragePaths(
  admin: any,
  bucket: string,
  prefix: string,
  depth = 0,
): Promise<string[]> {
  if (depth > 12) throw new Error("Arborescence Storage trop profonde.");

  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      if (/bucket.*not found/i.test(error.message || "")) return paths;
      throw new Error(`Lecture Storage impossible dans ${bucket}: ${error.message}`);
    }

    const entries = data ?? [];
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) {
        paths.push(path);
      } else {
        paths.push(...(await collectUserStoragePaths(admin, bucket, path, depth + 1)));
      }
    }

    if (entries.length < 100) break;
    offset += entries.length;
  }

  return paths;
}

async function cleanupUserStorage(admin: any, userId: string) {
  const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
  if (bucketError) throw new Error(`Impossible de lire les buckets Storage: ${bucketError.message}`);

  for (const bucket of buckets ?? []) {
    const paths = await collectUserStoragePaths(admin, bucket.id, userId);
    for (let index = 0; index < paths.length; index += 100) {
      const batch = paths.slice(index, index + 100);
      const { error } = await admin.storage.from(bucket.id).remove(batch);
      if (error) {
        throw new Error(`Nettoyage Storage impossible dans ${bucket.id}: ${error.message}`);
      }
    }
  }
}

async function cleanupBlockingReferences(admin: any, userId: string) {
  const operations = [
    admin.from("announcements").update({ author_id: null }).eq("author_id", userId),
    admin.from("reports").update({ resolved_by: null }).eq("resolved_by", userId),
    admin.from("user_roles").update({ granted_by: null }).eq("granted_by", userId),
    admin.from("ai_admin_grants").delete().eq("granted_by", userId),
  ];

  const results = await Promise.all(operations);
  for (const result of results) {
    if (result.error) throw new Error(result.error.message);
  }
}

export const deleteAccountOnServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown): DeleteAccountInput => {
    const raw = (input ?? {}) as Partial<DeleteAccountInput>;
    const confirmationEmail = String(raw.confirmationEmail ?? "").trim().toLowerCase();
    const confirmationPhrase = String(raw.confirmationPhrase ?? "").trim().toUpperCase();

    if (!confirmationEmail) throw new Error("Adresse e-mail de confirmation manquante.");
    if (confirmationPhrase !== "SUPPRIMER") {
      throw new Error("Le mot de confirmation SUPPRIMER est invalide.");
    }

    return { confirmationEmail, confirmationPhrase };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const userId = context.userId;

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !userData?.user) {
      throw new Error(userError?.message || "Compte Auth introuvable.");
    }

    const accountEmail = String(userData.user.email ?? "").trim().toLowerCase();
    if (!accountEmail || accountEmail !== data.confirmationEmail) {
      throw new Error("L’adresse e-mail ne correspond pas au compte connecté.");
    }

    await cleanupUserStorage(admin, userId);
    await cleanupBlockingReferences(admin, userId);

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw new Error(deleteError.message);

    return { ok: true };
  });
