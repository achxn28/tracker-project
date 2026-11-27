import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { calendarDeadlines } from "../src/lib/dashboard-calendar.ts";
import { ollamaTaskSamples } from "../src/lib/ollama-task-samples.ts";
import { requestTaskSuggestion } from "../src/lib/ollama-task-suggestion.ts";
import { openOpportunityStore } from "../src/lib/opportunities.ts";
import { timelineRows } from "../src/lib/timeline-model.ts";

const origin = "http://127.0.0.1:11435";

test("Ollama requests stay local and require grounded evidence and dates", async () => {
  const [sample] = ollamaTaskSamples("2026-11-27");
  const fixture = (fields: object): typeof fetch => async (url, init) => {
    assert.equal(url, origin + "/api/chat");
    assert.equal(init?.redirect, "error");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "qwen3:4b");
    assert.equal(body.keep_alive, 0);
    assert.deepEqual(body.format.required, ["decision", "title", "dueDate", "evidence"]);
    return Response.json({ done: true, message: { content: JSON.stringify(fields) } });
  };
  const proposal = { title: "Send résumé", dueDate: "2026-11-30", evidence: sample.text };
  assert.deepEqual(await requestTaskSuggestion(origin, sample.text, fixture({ decision: "task", ...proposal })), proposal);
  assert.equal((await requestTaskSuggestion(origin, sample.text, fixture({ decision: "task", ...proposal, dueDate: "2026-12-01" })))?.dueDate, null);
  assert.equal(await requestTaskSuggestion(origin, sample.text, fixture({ decision: "none", title: "", dueDate: "", evidence: "" })), null);
  await assert.rejects(requestTaskSuggestion(origin, sample.text, fixture({ decision: "task", ...proposal, evidence: "Invented quote" })), /quote from the sample/);
  await assert.rejects(requestTaskSuggestion("https://example.invalid", sample.text, fixture({ decision: "task", ...proposal })), /loopback Ollama/);
});

test("repeat approval creates one task in all scheduling views", t => {
  const directory = mkdtempSync(join(tmpdir(), "tracker-ollama-test-"));
  const store = openOpportunityStore(join(directory, "tracker.sqlite"));
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const task = {
    title: "Send résumé", category: "Research" as const, priority: "medium" as const, opportunity_id: null,
    start_date: null, due_date: "2026-11-30", description: null,
  };
  const id = "ollama-sample-resume";
  assert.equal(store.createTask(task, id), id);
  assert.equal(store.createTask({ ...task, title: "Conflicting retry" }, id), id);
  const tasks = store.tasks();
  assert.deepEqual(tasks.map(item => item.title), [task.title]);
  assert.deepEqual(calendarDeadlines(tasks, []).map(item => [item.title, item.date]), [[task.title, task.due_date]]);
  assert.deepEqual(timelineRows(tasks, []).rows.map(item => [item.title, item.end]), [[task.title, task.due_date]]);
});
