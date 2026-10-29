import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceRequest } from "./workspace-request.ts";
test("staff saves recover from a stalled connection or body without retrying", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (_url, options) => { calls++; return await new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })); };
    await assert.rejects(workspaceRequest("/api/products", { method: "POST", body: "{}" }, 15), /Check Inventory before retrying/);
    assert.equal(calls, 1);
    globalThis.fetch = async (_url, options) => ({ ok: true, text: () => new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })) });
    await assert.rejects(workspaceRequest("/api/products", { method: "PUT" }, 15), /did not confirm/);
    globalThis.fetch = async () => Response.json({ id: "saved" }, { status: 201 });
    assert.equal((await workspaceRequest("/api/products", { method: "POST" })).body?.id, "saved");
    globalThis.fetch = async () => Response.json({ message: "Check the supplied fields." }, { status: 400 });
    const invalid = await workspaceRequest("/api/products", { method: "POST" });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.body?.message, "Check the supplied fields.");
    globalThis.fetch = async () => new Response("Bad gateway", { status: 502 });
    assert.equal((await workspaceRequest("/api/products")).response.status, 502);
    globalThis.fetch = async () => new Response("not json", { status: 200 });
    await assert.rejects(workspaceRequest("/api/products"), /invalid response/);
  } finally { globalThis.fetch = original; }
});
