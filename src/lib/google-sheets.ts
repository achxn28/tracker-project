import "server-only";
import { googleConfig, googleConnection } from "./google-connection.ts";
import { createCrmSheets } from "./crm-sheets.ts";

export function connectedCrmSheets() {
  const config = googleConfig();
  if (!config) throw new Error("Set up the app’s Google connection before loading a CRM.");
  const connection = googleConnection(config);
  return createCrmSheets(async (url, init) => {
    const token = await connection.accessToken();
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      if (response.status === 401) throw new Error("Google authorization expired. Reconnect Google.");
      if (response.status === 403 || response.status === 404) throw new Error("Google could not open or edit this CRM. Check your account’s access and that the Sheets API is enabled.");
      throw new Error("Google could not complete this request. Refresh before retrying a save.");
    }
    return response.json();
  });
}
