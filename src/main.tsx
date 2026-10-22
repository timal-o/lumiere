import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { language, useLanguage } from "./i18n";
import "./styles.css";

/** Changer de langue reconstruit l'interface : tous les textes sont retraduits. */
function Root() {
  const lang = useLanguage();
  return <App key={lang} />;
}

document.documentElement.lang = language();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
