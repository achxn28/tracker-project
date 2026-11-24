export const novusClients = [
  { id: "aaf", name: "Asian American Federation", spreadsheetId: "10vP5mbJiTf_vdixRzCFSEMPAGZEhM2hjD3CV5m10pSM" },
  { id: "cypress-hills", name: "Cypress Hills", spreadsheetId: "1JUKlKpyoivmnbQOmXJFd3IIc1B3FzpVuB_qS5JtTyeo" },
  { id: "brooklyn-chamber", name: "Brooklyn Chamber", spreadsheetId: "1WbuCM1zGz0HnYbeopACiFCVGcUDMeM-zfdEPCdwn8LU" },
  { id: "bayside-village", name: "Bayside Village BID", spreadsheetId: "1LmxXU67QqvYGnKnplS4ICxN6do87b-qQL-_N6TswZNw" },
] as const;
export type NovusClient = typeof novusClients[number];
export function novusClient(id: string) {
  const client = novusClients.find(client => client.id === id);
  if (!client) throw new Error("Choose one of your connected Novus clients.");
  return client;
}
export const crmTab = "Business record";
export const crmSheetId = 859460927;
export const crmHeaders = ["Website stage", "Business", "Owner / contact", "Referral", "Initial referral date", "Website / draft"] as const;
export type CrmValue = { stringValue?: string; numberValue?: number; boolValue?: boolean; formulaValue?: string };
export type CrmCell = { readOnly?: boolean; formattedValue?: string; userEnteredValue?: CrmValue; dataValidation?: { condition?: { type?: string; values?: { userEnteredValue?: string }[] }; strict?: boolean } };
export type CrmRecord = { row: number; cells: CrmCell[]; version: string };
export type CrmData = { clientId: string; headers: string[]; records: CrmRecord[]; loadedAt: string };
export type CrmEdit = { column: number; value: string };

export function editableCrmCell(cell: CrmCell) {
  const value = cell.userEnteredValue;
  return !cell.readOnly && !value?.formulaValue && value?.numberValue === undefined && value?.boolValue === undefined && (!cell.dataValidation || cell.dataValidation.condition?.type === "ONE_OF_LIST");
}
