import "server-only";
import { createHash } from "node:crypto";
import { crmHeaders, crmSheetId, crmTab, novusClient, editableCrmCell, type CrmCell, type CrmData, type CrmEdit, type CrmRecord } from "./novus-clients.ts";

type GridRange = { sheetId?: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number };
type Protection = { range?: GridRange; warningOnly?: boolean; requestingUserCanEdit?: boolean; unprotectedRanges?: GridRange[] };
type GridData = { startRow?: number; rowData?: { values?: CrmCell[] }[] };
type Sheet = { properties?: { sheetId?: number; title?: string; gridProperties?: { rowCount?: number } }; data?: GridData[]; merges?: GridRange[]; protectedRanges?: Protection[] };
type SheetResponse = { sheets?: Sheet[] };
export type CrmSnapshot = CrmData & { page: number; hasMore: boolean };
export class CrmConflict extends Error {}
export const crmPageSize = 100;

function contains(range: GridRange, row: number, column: number) {
  return (range.sheetId === undefined || range.sheetId === crmSheetId) && row - 1 >= (range.startRowIndex ?? 0) && row - 1 < (range.endRowIndex ?? Infinity) && column >= (range.startColumnIndex ?? 0) && column < (range.endColumnIndex ?? Infinity);
}
function blocked(sheet: Sheet, row: number, column: number) {
  return Boolean(sheet.merges?.some(range => contains(range, row, column)) || sheet.protectedRanges?.some(rule => !rule.warningOnly && !rule.requestingUserCanEdit && contains(rule.range ?? {}, row, column) && !rule.unprotectedRanges?.some(range => contains(range, row, column))));
}
function rowVersion(headers: string[], cells: CrmCell[]) {
  return createHash("sha256").update(JSON.stringify({ headers, cells: cells.map(cell => ({ text: cell.formattedValue ?? "", raw: [cell.userEnteredValue?.stringValue, cell.userEnteredValue?.numberValue, cell.userEnteredValue?.boolValue, cell.userEnteredValue?.formulaValue], rule: cell.dataValidation ? [cell.dataValidation.condition?.type, cell.dataValidation.strict, cell.dataValidation.condition?.values?.map(value => value.userEnteredValue)] : null, readOnly: Boolean(cell.readOnly) })) })).digest("hex");
}
function unpack(result: SheetResponse, start: number, end: number): CrmRecord[] & { headers?: string[] } {
  const sheet = result.sheets?.find(sheet => sheet.properties?.sheetId === crmSheetId && sheet.properties?.title === crmTab);
  if (!sheet) throw new Error("The Business record tab was moved or renamed. Open the original sheet to check it.");
  const indexed = new Map<number, CrmCell[]>();
  for (const grid of sheet.data ?? []) for (const [offset, row] of (grid.rowData ?? []).entries()) indexed.set((grid.startRow ?? 0) + offset + 1, row.values ?? []);
  const header = indexed.get(1) ?? [];
  const headers = header.map(cell => cell.formattedValue?.trim() ?? "");
  if (!crmHeaders.every((title, column) => headers[column] === title)) throw new Error("This sheet’s columns changed. The CRM editor expects the original Business record headers.");
  const length = ["Notes", "Other notes"].includes(headers[6]) ? 7 : 6;
  headers.length = length;
  const records: CrmRecord[] & { headers?: string[] } = [];
  for (let row = start; row <= end; row++) {
    const source = indexed.get(row) ?? [];
    if (!source.some(cell => cell.formattedValue || cell.userEnteredValue)) continue;
    const cells = Array.from({ length }, (_, column) => ({ ...(source[column] ?? {}), ...(blocked(sheet, row, column) ? { readOnly: true } : {}) }));
    records.push({ row, cells, version: rowVersion(headers, cells) });
  }
  records.headers = headers;
  return records;
}
export function createCrmSheets(request: (url: string, init?: RequestInit) => Promise<unknown>) {
  async function read(clientId: string, start: number, end: number) {
    const client = novusClient(clientId);
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${client.spreadsheetId}`);
    const fields = "sheets(properties(sheetId,title,gridProperties(rowCount)),merges,protectedRanges(range,warningOnly,requestingUserCanEdit,unprotectedRanges),data(startRow,rowData(values(formattedValue,userEnteredValue,dataValidation))))";
    url.searchParams.set("ranges", `'${crmTab}'!A1:G1`);
    url.searchParams.set("fields", fields);
    const metadata = await request(url.toString()) as SheetResponse;
    const sheet = metadata.sheets?.find(sheet => sheet.properties?.sheetId === crmSheetId && sheet.properties?.title === crmTab);
    if (!sheet) throw new Error("The Business record tab was moved or renamed.");
    const rowCount = sheet.properties?.gridProperties?.rowCount ?? 1;
    if (start <= rowCount) {
      url.searchParams.set("ranges", `'${crmTab}'!A${start}:G${Math.min(end, rowCount)}`);
      const values = await request(url.toString()) as SheetResponse;
      const data = values.sheets?.find(sheet => sheet.properties?.sheetId === crmSheetId)?.data ?? [];
      sheet.data = [...(sheet.data ?? []), ...data];
    }
    const rows = unpack(metadata, start, Math.min(end, rowCount));
    return { rows, rowCount };
  }
  async function load(clientId: string, page = 0): Promise<CrmSnapshot> {
    if (!Number.isInteger(page) || page < 0 || page > 100) throw new Error("Choose a valid CRM page.");
    const start = 2 + page * crmPageSize;
    const { rows, rowCount } = await read(clientId, start, start + crmPageSize - 1);
    return { clientId, headers: rows.headers!, records: [...rows], page, hasMore: start + crmPageSize <= rowCount, loadedAt: new Date().toISOString() };
  }
  return {
    load,
    async save(clientId: string, row: number, version: string, edits: CrmEdit[]) {
      const client = novusClient(clientId);
      if (!Number.isInteger(row) || row < 2 || row > 10001 || typeof version !== "string" || !/^[a-f0-9]{64}$/.test(version) || !Array.isArray(edits) || !edits.length || edits.length > 7) throw new Error("Choose a saved CRM record and the fields to update.");
      const { rows } = await read(clientId, row, row);
      const current = rows.find(item => item.row === row);
      if (!current || current.version !== version) throw new CrmConflict("This row changed in Google Sheets. Refresh the CRM and review it before saving again.");
      const seen = new Set<number>();
      const changes = edits.map(edit => {
        if (!edit || !Number.isInteger(edit.column) || edit.column < 0 || edit.column >= current.cells.length || seen.has(edit.column) || typeof edit.value !== "string" || edit.value.length > 10000) throw new Error("A CRM field is invalid. Review your changes.");
        seen.add(edit.column);
        const cell = current.cells[edit.column];
        if (!editableCrmCell(cell)) throw new Error("Formula, protected, and unsupported typed cells are read-only in this editor.");
        const allowed = cell.dataValidation?.condition?.values?.map(value => value.userEnteredValue) ?? [];
        if (cell.dataValidation && !allowed.includes(edit.value)) throw new Error("Choose one of the sheet’s existing dropdown values.");
        return { updateCells: { range: { sheetId: crmSheetId, startRowIndex: row - 1, endRowIndex: row, startColumnIndex: edit.column, endColumnIndex: edit.column + 1 }, rows: [{ values: [{ userEnteredValue: { stringValue: edit.value } }] }], fields: "userEnteredValue" } };
      });
      await request(`https://sheets.googleapis.com/v4/spreadsheets/${client.spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: changes }) });
      // Do not retry a write if its response is lost; the caller must refresh.
      return { saved: true as const };
    },
  };
}
