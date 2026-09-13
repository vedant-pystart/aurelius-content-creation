import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Aurelius editor root is missing");

createRoot(root).render(<App />);

// The worker contains only revisioned build assets. It never sees imported
// media, project data, previews, range requests, or exported MP4 bytes.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => { void navigator.serviceWorker.register("/sw.js", { scope: "/" }); });
}
