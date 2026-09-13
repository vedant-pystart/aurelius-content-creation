import { describe, expect, it } from "vitest";
import { testDatabase, destroyDatabase } from "./test/indexeddb";

describe("AureliusDatabase", () => {
  it("opens the explicit versioned metadata-only schema", async () => {
    const db = testDatabase("schema"); await db.open();
    expect(db.verno).toBe(1); expect(db.tables.map((table) => table.name).sort()).toEqual(["assets","pendingImports","preferences","projectAssets","projects","summaries"].sort());
    await destroyDatabase(db);
  });
});
