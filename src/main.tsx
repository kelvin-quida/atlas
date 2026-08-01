import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { GamepadProvider } from "./providers/GamepadContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <GamepadProvider>
      <App />
    </GamepadProvider>
  </React.StrictMode>,
);
