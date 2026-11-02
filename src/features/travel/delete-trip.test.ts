import { describe, expect, it, vi } from "vitest";
import {
  deleteTripWithArchiveRecovery,
  isTripAiArchiveConflict,
  type TripDeletionGateway,
} from "./delete-trip";

const conflict = {
  code: "23503",
  message: 'insert or update on table "trip_entries" violates foreign key constraint',
  details: 'Key (trip_id) is not present in table "trips".',
};
const days = [{ id: "day-1", title: "IA+ · Jour 1" }, { id: "day-2", title: "IA+ · Jour 2" }];

function gateway(overrides: Partial<TripDeletionGateway> = {}): TripDeletionGateway {
  return {
    deleteTrip: vi.fn().mockResolvedValue({ deleted: true, error: null }),
    listAiDays: vi.fn().mockResolvedValue({ rows: days, error: null }),
    parkAiDays: vi.fn().mockResolvedValue({ updatedIds: days.map((day) => day.id), error: null }),
    restoreAiDay: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe("suppression d'un voyage avec archive IA+", () => {
  it("supprime normalement sans modifier les journées lorsque la cascade fonctionne", async () => {
    const api = gateway();
    await deleteTripWithArchiveRecovery(api);
    expect(api.listAiDays).not.toHaveBeenCalled();
    expect(api.parkAiDays).not.toHaveBeenCalled();
  });

  it("ne tente la récupération que pour la contrainte des journées IA+", () => {
    expect(isTripAiArchiveConflict(conflict)).toBe(true);
    expect(isTripAiArchiveConflict({ code: "23503", message: "other_fk", details: "" })).toBe(false);
    expect(isTripAiArchiveConflict({ code: "42501", message: "trip_entries", details: "" })).toBe(false);
  });

  it("réessaie après avoir neutralisé l'archivage qui bloque la suppression", async () => {
    const api = gateway({
      deleteTrip: vi.fn()
        .mockResolvedValueOnce({ deleted: false, error: conflict })
        .mockResolvedValueOnce({ deleted: true, error: null }),
    });
    await deleteTripWithArchiveRecovery(api);
    expect(api.parkAiDays).toHaveBeenCalledWith(days.map((day) => day.id));
    expect(api.restoreAiDay).not.toHaveBeenCalled();
    expect(api.deleteTrip).toHaveBeenCalledTimes(2);
  });

  it("restaure les titres initiaux si le second essai échoue", async () => {
    const api = gateway({
      deleteTrip: vi.fn()
        .mockResolvedValueOnce({ deleted: false, error: conflict })
        .mockResolvedValueOnce({ deleted: false, error: { code: "23503", message: "autre contrainte" } }),
    });
    await expect(deleteTripWithArchiveRecovery(api)).rejects.toThrow("autre contrainte");
    expect(api.restoreAiDay).toHaveBeenCalledTimes(2);
    expect(api.restoreAiDay).toHaveBeenCalledWith(days[0]);
    expect(api.restoreAiDay).toHaveBeenCalledWith(days[1]);
  });

  it("ne confirme pas une suppression silencieusement refusée par RLS", async () => {
    const api = gateway({ deleteTrip: vi.fn().mockResolvedValue({ deleted: false, error: null }) });
    await expect(deleteTripWithArchiveRecovery(api)).rejects.toThrow("n'a pas été supprimé");
    expect(api.parkAiDays).not.toHaveBeenCalled();
  });

  it("n'efface rien si la préparation des journées échoue", async () => {
    const api = gateway({
      deleteTrip: vi.fn().mockResolvedValue({ deleted: false, error: conflict }),
      parkAiDays: vi.fn().mockResolvedValue({ updatedIds: [], error: { message: "RLS refused" } }),
    });
    await expect(deleteTripWithArchiveRecovery(api)).rejects.toThrow("RLS refused");
    expect(api.deleteTrip).toHaveBeenCalledTimes(1);
  });
});
