import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import DemoConsoleApp from "./DemoConsoleApp";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DemoConsoleApp />
  </StrictMode>,
);
