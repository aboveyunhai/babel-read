import { useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useOverlayState } from "./global-state";

export function Overlay() {
  const { showBorder } = useOverlayState();
  const interactableRef = useRef(true);
  const recoverTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isResizingRef = useRef(false);
  const headerHoverTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // the purpose of this function is to reduce the amount of calls for performance
  // it may or may not be useful
  const debouncedRecover = useCallback(() => {
    if (recoverTimeoutRef.current) {
      clearTimeout(recoverTimeoutRef.current);
    }

    if (showBorder) {
      if (interactableRef.current) {
        interactableRef.current = false;
        invoke("set_cursor_passthrough", { passthrough: true }).catch(
          console.error
        );
      }

      // After delay, recover back to interactive
      recoverTimeoutRef.current = setTimeout(async () => {
        interactableRef.current = true;
        try {
          await invoke("set_cursor_passthrough", { passthrough: false });
        } catch (error) {
          console.error("Failed to recover passthrough:", error);
        }
      }, 250);
    }
  }, [showBorder]);

  const handleInteraction = useCallback(
    (e?: React.MouseEvent) => {
      if (isResizingRef.current) {
        return;
      }
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      debouncedRecover();
    },
    [debouncedRecover]
  );

  const handleTopBarEnter = useCallback(() => {
    // the debouce time here is a UX trick
    // to prevent a situation when user selects content inside the window move up quickly and interact through the top bar
    // too slow will make the top bar "unable" to click, too fast will interupt the selection
    headerHoverTimeoutRef.current = setTimeout(async () => {
      await invoke("set_cursor_passthrough", { passthrough: false });
    }, 120);
  }, []);

  const handleTopBarLeave = useCallback(() => {
    clearTimeout(headerHoverTimeoutRef.current);
  }, []);

  const handleTopBarClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      e.preventDefault();
      e.stopPropagation();
      await invoke("set_cursor_passthrough", { passthrough: false });
    },
    []
  );

  // reset passthrough state when border is on/off
  useEffect(() => {
    const setWindowPassthrough = async () => {
      try {
        await invoke("set_cursor_passthrough", { passthrough: !showBorder });
      } catch (error) {
        console.error("Failed to set window passthrough:", error);
      }
    };
    setWindowPassthrough();
  }, [showBorder]);

  // sync border state initially from server
  useEffect(() => {
    const setWindowPassthrough = async () => {
      try {
        await invoke("set_cursor_passthrough", { passthrough: !showBorder });
        if (showBorder) {
          interactableRef.current = true;
        }
      } catch (error) {
        console.error("Failed to set window passthrough:", error);
      }
    };

    setWindowPassthrough();

    // Reset interaction state when border state changes
    if (showBorder) {
      interactableRef.current = true;
      if (recoverTimeoutRef.current) {
        clearTimeout(recoverTimeoutRef.current);
      }
    }
  }, [showBorder]);

  // when resizing, disable all the passthrough events
  useEffect(() => {
    let resizeTimeout: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      isResizingRef.current = true;
      clearTimeout(resizeTimeout);

      // Reset resize flag after resize events stop
      resizeTimeout = setTimeout(() => {
        isResizingRef.current = false;
      }, 50); // 150ms after last resize event
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  // unmounted
  useEffect(() => {
    return () => {
      clearTimeout(recoverTimeoutRef.current);
      clearTimeout(headerHoverTimeoutRef.current);
    };
  }, []);

  return (
    <div className="relative w-screen h-screen">
      {/* Only this header area captures mouse events when shown */}
      {showBorder && (
        <div
          className="absolute z-10 top-0 left-0 w-full drag flex justify-between border-b border-gray-200 items-center pl-2 bg-white text-sm h-6"
          onMouseDown={handleTopBarClick}
          onMouseEnter={handleTopBarEnter}
          onMouseLeave={handleTopBarLeave}
        >
          <div className="overlay-title cursor-copy py-1">Capture</div>
          <button
            className="no-drag w-10 h-6 text-black text-center cursor-pointer hover:bg-gray-200 rounded"
            onClick={async () => {
              try {
                await invoke("close_overlay_window");
              } catch (error) {
                console.error("Failed to close overlay:", error);
              }
            }}
          >
            x
          </button>
        </div>
      )}
      {/* conditionally click through */}
      <div
        className="h-full w-full"
        onMouseEnter={handleInteraction}
        onMouseMove={handleInteraction}
        onMouseDown={handleInteraction}
      ></div>
      {/* Border visual indicator */}
      {showBorder && (
        <div
          className="absolute z-20 inset-0 border border-gray-400 pointer-events-none"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      )}
    </div>
  );
}
