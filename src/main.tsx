import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setLanguage, getLanguage } from "./i18n";
import { App } from "./App";
import "./assets/fonts.css";
import "./styles.css";
import "./styles-refinement.css";

setLanguage(getLanguage(), false);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
