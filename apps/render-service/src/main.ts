import { randomBytes } from "node:crypto";
import { createHttpServer, RenderJobService, type RenderWorker } from "./index";
const unavailableWorker: RenderWorker = { async render() { throw new Error("provider-unavailable"); } };
const secret = process.env.AURELIUS_RENDER_SECRET ? Buffer.from(process.env.AURELIUS_RENDER_SECRET) : randomBytes(32);
const port = Number(process.env.PORT ?? 8788);
const origin = process.env.AURELIUS_EDITOR_ORIGIN;
const server = createHttpServer(new RenderJobService(secret, unavailableWorker), origin ? { editorOrigin: origin } : {});
void server.listen({ port, host: "127.0.0.1" });
