import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// The walkthrough check, for development only.
if (import.meta.env.DEV) void import("./components/guideAudit");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
