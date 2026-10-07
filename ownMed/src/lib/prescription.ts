import type { Medicine } from "@/components/dashboard/types";

/**
 * Prescription reading — the seam, not the implementation.
 *
 * A draft is a medicine the parser produced but nobody has confirmed yet, so it
 * has no id: ids are minted by `addMedicine` at the moment of saving, and a
 * draft that is discarded should never have had one.
 */
export type MedicineDraft = Omit<Medicine, "id">;

/**
 * Read one or more prescription photos into medicine drafts.
 *
 * Deliberately unimplemented. Reading a prescription means calling a vision
 * model, which needs an image to reach the backend — and there is no file
 * storage or upload path yet (see the server's AGENTS.md: the R2 layer was
 * never built, so images currently never leave the device).
 *
 * When it is wired up it should: upload the image(s), have the server ask a
 * vision model for structured drafts, and return them here. Callers must treat
 * every field as unreliable — handwritten prescriptions routinely confuse drug
 * names and dosages — so the UI shows the drafts on a review screen and lets
 * the user edit and confirm each one before `addMedicine` is called. Nothing
 * from this function may be saved unreviewed.
 *
 * Throwing is the honest current behavior: the caller catches it and points the
 * user at manual entry rather than silently doing nothing.
 */
export async function parsePrescription(uris: string[]): Promise<MedicineDraft[]> {
    void uris;
    throw new Error("Prescription reading is not available yet.");
}
