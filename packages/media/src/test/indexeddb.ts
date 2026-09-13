import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { AureliusDatabase } from "../database";

let counter = 0;
export function testDatabase(label = "test"): AureliusDatabase { counter += 1; return new AureliusDatabase(`aurelius-${label}-${counter}`, { indexedDB, IDBKeyRange }); }
export async function destroyDatabase(db: AureliusDatabase): Promise<void> { db.close(); await db.delete(); }
