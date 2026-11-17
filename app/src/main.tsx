import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { isMac } from "./lib/os";
import { startMacWording } from "./lib/macWording";

// macOS: "this PC", "Windows asks…" and the like read as Mac wording (dialogs included).
if (isMac) startMacWording(document.body);

// The walkthrough check, for development only.
if (import.meta.env.DEV) void import("./components/guideAudit");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
