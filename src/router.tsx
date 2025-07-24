import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { App } from "./app";
import { Overlay } from "./overlay";

export function Router() {
  const [windowType, setWindowType] = useState<string | null>(null);

  useEffect(() => {
    const window = getCurrentWindow();
    setWindowType(window.label);
  }, []);

  if (!windowType) {
    return <div>Loading...</div>;
  }

  switch (windowType) {
    case "overlay":
      return <Overlay />;
    case "main":
    default:
      return <App />;
  }
}
