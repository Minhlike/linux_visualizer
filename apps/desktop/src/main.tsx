import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LearningShell } from "@linux-observatory/learning-ui";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("The application root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <LearningShell />
  </StrictMode>,
);
