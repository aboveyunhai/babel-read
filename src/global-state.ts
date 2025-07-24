import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useState, useCallback, useEffect } from "react";

export function useOverlayState() {
  const [showBorder, setShowBorder] = useState(false);

  const toggleBorder = useCallback(async () => {
    try {
      await invoke<boolean>("toggle_overlay_state");
    } catch (error) {
      console.error("Failed to toggle border:", error);
    }
  }, []);

  useEffect(() => {
    // Get initial border state from Rust
    const getInitialState = async () => {
      try {
        const borderState = await invoke<boolean>("get_overlay_state");
        setShowBorder(borderState);
      } catch (error) {
        console.error("Failed to get initial border state:", error);
      }
    };
    getInitialState();

    // Listen for border state changes from any source
    const unlistenBorderChange = listen<{ showBorder: boolean }>(
      "overlay-state-changed",
      (event) => {
        setShowBorder(event.payload.showBorder);
      }
    );

    return () => {
      unlistenBorderChange.then((unlisten) => unlisten());
    };
  }, []);

  return { showBorder, toggleBorder };
}
