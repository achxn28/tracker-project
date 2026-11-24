import { test } from "node:test";
import assert from "node:assert/strict";
import { createCrmSheets, CrmConflict } from "../src/lib/crm-sheets.ts";
import { crmHeaders, crmSheetId, editableCrmCell, novusClients, type CrmCell } from "../src/lib/novus-clients.ts";

const cell = (value: string): CrmCell => ({ formattedValue: value, userEnteredValue: { stringValue: value } });
function fixture(notes = "Other notes") {
  const rows = new Map<number, CrmCell[]>([[2, [cell("In progress"), cell("Example Business"), cell("Example Contact"), cell("Partner"), cell("By March"), cell("https://example.com"), cell("Notes")]]]);
  rows.get(2)![0].dataValidation = { condition: { type: "ONE_OF_LIST", values: [{ userEnteredValue: "In progress" }, { userEnteredValue: "Completed" }] }, strict: true };
  let rowCount = 105; const writes: { requests: { updateCells: { range: { sheetId: number; startRowIndex: number; endRowIndex: number; startColumnIndex: number; endColumnIndex: number }; rows: { values: CrmCell[] }[]; fields: string } }[] }[] = [];
  const ranges: string[] = []; let merges: object[] = []; let protections: object[] = [];
  const adapter = createCrmSheets(async (address, init) => {
    const url = new URL(address);
    assert.ok(novusClients.some(client => url.pathname.includes(client.spreadsheetId)));
    if (init?.method === "POST") { const body = JSON.parse(init.body as string); writes.push(body); for (const { updateCells: update } of body.requests) { const target = rows.get(update.range.startRowIndex + 1)!; const value = update.rows[0].values[0].userEnteredValue.stringValue; target[update.range.startColumnIndex] = cell(value); } return {}; }
    const range = url.searchParams.get("ranges")!; ranges.push(range);
    if (range.endsWith("A1:G1")) return { sheets: [{ properties: { sheetId: crmSheetId, title: "Business record", gridProperties: { rowCount } }, merges, protectedRanges: protections, data: [{ rowData: [{ values: [...crmHeaders, notes].map(cell) }] }] }] };
    const match = range.match(/A(\d+):G(\d+)$/)!; const start = Number(match[1]); const end = Number(match[2]);
    assert.ok(end <= rowCount, "requests stay within existing grid bounds");
    return { sheets: [{ properties: { sheetId: crmSheetId }, data: [{ startRow: start - 1, rowData: Array.from({ length: end - start + 1 }, (_, index) => ({ values: rows.get(start + index) ?? [] })) }] }] };
  });
  return { adapter, rows, writes, ranges, setSize: (size: number) => { rowCount = size; }, setMerges: (value: object[]) => { merges = value; }, setProtections: (value: object[]) => { protections = value; } };
}
test("CRM adapter reads grounded headers, notes variants, and bounded pages without copying rows", async () => {
  const { adapter, ranges, writes } = fixture();
  const data = await adapter.load("aaf");
  assert.equal(data.headers[6], "Other notes"); assert.equal(data.records[0].row, 2); assert.equal(data.records[0].cells[1].formattedValue, "Example Business");
  assert.ok(data.hasMore); await adapter.load("aaf", 1); assert.ok(ranges.at(-1)?.endsWith("A102:G105")); assert.equal(writes.length, 0);
  assert.equal((await fixture("Notes").adapter.load("cypress-hills")).headers.length, 7);
  assert.equal((await fixture("").adapter.load("bayside-village")).headers.length, 6);
  await assert.rejects(adapter.load("unknown")); await assert.rejects(adapter.load("aaf", -1));
});
test("CRM saves only changed cells and literal text, preserving surrounding structure", async () => {
  const { adapter, writes } = fixture();
  const data = await adapter.load("aaf"); const row = data.records[0];
  await adapter.save("aaf", row.row, row.version, [{ column: 0, value: "Completed" }, { column: 6, value: '=HYPERLINK("example")' }]);
  assert.equal(writes.length, 1); assert.equal(writes[0].requests.length, 2);
  for (const request of writes[0].requests) { assert.equal(request.updateCells.fields, "userEnteredValue"); assert.equal(request.updateCells.range.sheetId, crmSheetId); assert.equal(request.updateCells.range.endRowIndex - request.updateCells.range.startRowIndex, 1); assert.equal(request.updateCells.range.endColumnIndex - request.updateCells.range.startColumnIndex, 1); }
  assert.deepEqual(writes[0].requests[1].updateCells.rows[0].values[0].userEnteredValue, { stringValue: '=HYPERLINK("example")' });
  assert.equal((await adapter.load("aaf")).records[0].cells[0].formattedValue, "Completed");
});
test("CRM refuses stale or moved rows, invalid dropdown choices, and invalid edit ranges", async () => {
  const { adapter, rows, writes } = fixture(); let record = (await adapter.load("aaf")).records[0];
  rows.get(2)![1] = cell("Someone changed or sorted this row");
  await assert.rejects(adapter.save("aaf", 2, record.version, [{ column: 6, value: "New" }]), CrmConflict);
  record = (await adapter.load("aaf")).records[0];
  await assert.rejects(adapter.save("aaf", 2, record.version, [{ column: 0, value: "Invented stage" }]), /dropdown/);
  await assert.rejects(adapter.save("aaf", 2, record.version, [{ column: 7, value: "outside" }]));
  await assert.rejects(adapter.save("aaf", 2, record.version, [{ column: 1, value: "a" }, { column: 1, value: "b" }]));
  await assert.rejects(adapter.save("aaf", 1, record.version, [{ column: 1, value: "header" }]));
  assert.equal(writes.length, 0);
});
test("formulas, unsupported typed values, merged cells, and protected ranges stay read-only", async () => {
  const f = fixture(); f.rows.get(2)![6] = { formattedValue: "Computed", userEnteredValue: { formulaValue: "=A2" } };
  let record = (await f.adapter.load("aaf")).records[0];
  await assert.rejects(f.adapter.save("aaf", 2, record.version, [{ column: 6, value: "Overwrite" }]), /read-only/);
  f.setMerges([{ sheetId: crmSheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 3 }]);
  f.setProtections([{ range: { sheetId: crmSheetId }, requestingUserCanEdit: false, unprotectedRanges: [{ sheetId: crmSheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 }] }]);
  record = (await f.adapter.load("aaf")).records[0];
  assert.equal(editableCrmCell(record.cells[0]), true); assert.equal(editableCrmCell(record.cells[1]), false);
  await assert.rejects(f.adapter.save("aaf", 2, record.version, [{ column: 3, value: "Protected" }]), /read-only/);
  assert.equal(editableCrmCell({ userEnteredValue: { numberValue: 12 } }), false);
  assert.equal(editableCrmCell({ dataValidation: { condition: { type: "CUSTOM_FORMULA" } } }), false);
  assert.equal(f.writes.length, 0);
});
