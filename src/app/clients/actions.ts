"use server";

import { revalidatePath } from "next/cache";
import { connectedCrmSheets } from "@/lib/google-sheets";
import { googleConfig, googleConnection } from "@/lib/google-connection";
import type { CrmEdit } from "@/lib/novus-clients";
import { CrmConflict, type CrmSnapshot } from "@/lib/crm-sheets";

export async function loadCrm(clientId: string, page: number): Promise<{ data?: CrmSnapshot; message?: string }> {
  try { return { data: await connectedCrmSheets().load(clientId, page) }; }
  catch (error) { return { message: error instanceof Error ? error.message : "The CRM could not be loaded. Try refreshing." }; }
}
export async function saveCrm(clientId: string, row: number, version: string, edits: CrmEdit[]): Promise<{ saved?: boolean; conflict?: boolean; message?: string }> {
  try { await connectedCrmSheets().save(clientId, row, version, edits); return { saved: true }; }
  catch (error) { return { conflict: error instanceof CrmConflict, message: error instanceof Error ? error.message : "The save could not be confirmed. Refresh the CRM before trying again." }; }
}
export async function disconnectCrmGoogle() {
  const config = googleConfig();
  if (config) googleConnection(config).disconnect();
  revalidatePath("/clients");
}
