import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button, Indicator } from "./components/indicator";
import { useOverlayState } from "./global-state";

import { callFunction } from "tauri-plugin-python-api";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "api-key",
  dangerouslyAllowBrowser: true,
});

interface CaptureResult {
  image_base64: string;
  width: number;
  height: number;
}

interface OcrResult {
  text: string;
  textLines: string[];
  confidence: number;
}

// example list, this requires runtime download
const availableLanguages = [
  { wins: "en", easyOcr: "en" },
  { wins: "zh-Hans", easyOcr: "ch_sim" },
  { wins: "ko", easyOcr: "ko" },
] as const;

type WinsLang = (typeof availableLanguages)[number]["wins"];

const transToLangs = ["Chinese", "English"] as const;
type TransToLang = (typeof transToLangs)[number];

function mockRemoteApi(item: string[]): Promise<string[]> {
  return new Promise((resolve) => {
    const delay = Math.random() * 2000;
    setTimeout(() => {
      resolve(item);
    }, delay);
  });
}

export function App() {
  const { showBorder, toggleBorder } = useOverlayState();
  const [overlay, setOverlay] = useState(false);

  const [capturedImage, setCapturedImage] = useState<CaptureResult | null>(
    null
  );
  const [isCapturing, setIsCapturing] = useState(false);

  const [_ocrError, setOcrError] = useState<string>();
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [ocrLang, setOcrLang] = useState<WinsLang>("en");
  const [transToLang, setTransToLang] = useState<TransToLang>("Chinese");

  const [isRecording, setIsRecording] = useState(false);
  const [recordingInterval, setRecordingInterval] = useState(1000); // Default 1 second
  const [intervalId, setIntervalId] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const [isTranslationEnabled, setIsTranslationEnabled] = useState(true);

  const [textResult, setTextResult] = useState<Array<string[]>>([]);
  const [translationResult, setTranslationResult] = useState<
    Record<number, string[]>
  >({});
  const orderRef = useRef(0); // Keeps track of insertion order

  // Add refs and state for auto-scrolling behavior
  const textResultsRef = useRef<HTMLDivElement>(null);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const lastScrollHeight = useRef(0);

  // caches
  const lastOcrResultRef = useRef<string>("");

  // Add OpenAI client state
  const [openaiApiKey, setOpenaiApiKey] = useState<string>("api-key");
  const [openaiClient, setOpenaiClient] = useState<OpenAI | null>(client);
  const [isValidApiKey, setIsValidApiKey] = useState<boolean>(false);

  const toggleOverlay = async () => {
    try {
      await invoke("toggle_overlay_visibility");
    } catch (error) {
      console.error("Failed to toggle overlay visibility:", error);
    }
  };

  const captureScreenImage = async () => {
    if (isCapturing) return;

    setIsCapturing(true);
    try {
      const result = await invoke<CaptureResult>("capture_full_screen_image");
      setCapturedImage(result);
    } catch (error) {
      console.error("Failed to capture image:", error);
    } finally {
      setIsCapturing(false);
    }
  };

  // New function to capture only overlay content
  const captureOverlayContent = async () => {
    if (isCapturing) return;

    setIsCapturing(true);
    try {
      // Capture only what's behind the overlay window
      const result = await invoke<CaptureResult>("capture_overlay_content", {
        border: showBorder,
      });
      setCapturedImage(result);
    } catch (error) {
      console.error("Failed to capture overlay content:", error);
    } finally {
      setIsCapturing(false);
    }
  };

  const processImageWithWindowsOCR = async () => {
    if (!capturedImage || isProcessingOcr) return;

    setIsProcessingOcr(true);
    try {
      const base64Data = capturedImage.image_base64.split(",")[1];
      const buffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

      const result = await invoke<OcrResult>("image_to_ocr", {
        buffer: buffer,
        language: ocrLang || null,
      });
      setTextResult([result.textLines]);

      // Reset auto-scroll for manual OCR
      setIsAutoScrolling(true);
      setShowScrollToBottom(false);
    } catch (error) {
      console.error("Failed to perform OCR:", error);
      setOcrError("OCR failed: " + error);
    } finally {
      setIsProcessingOcr(false);
    }
  };

  // In your React component
  const processImageWithEasyOCR = async () => {
    if (!capturedImage || isProcessingOcr) return;

    setIsProcessingOcr(true);
    try {
      const base64Data = capturedImage.image_base64.split(",")[1];
      const buffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

      // Find the corresponding EasyOCR language code
      const selectedLangObj = availableLanguages.find(
        (lang) => lang.wins === ocrLang
      );
      const easyOcrLang = selectedLangObj ? selectedLangObj.easyOcr : "en";

      const result = await callFunction("buffer_to_text", [
        buffer,
        [easyOcrLang],
      ]);

      // unsafe, require validation
      const parsedResult = JSON.parse(result) as {
        paragraphs: string[];
        status: "success" | "error";
      };
      if (parsedResult.status === "success") {
        setTextResult([parsedResult.paragraphs]);
      }
    } catch (error) {
      console.error("Python call failed:", error);
    } finally {
      setIsProcessingOcr(false);
    }
  };

  // Check if user is at bottom of scroll
  const isAtBottom = useCallback(() => {
    if (!textResultsRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = textResultsRef.current;
    // Consider "at bottom" if within 50px of the bottom
    return scrollHeight - scrollTop - clientHeight < 50;
  }, []);

  // Handle manual scrolling
  const handleScroll = useCallback(() => {
    if (!textResultsRef.current) return;

    const atBottom = isAtBottom();

    if (atBottom) {
      // User scrolled to bottom, resume auto-scrolling
      setIsAutoScrolling(true);
      setShowScrollToBottom(false);
    } else {
      // User scrolled away from bottom, pause auto-scrolling
      setIsAutoScrolling(false);
      setShowScrollToBottom(true);
    }
  }, [isAtBottom]);

  // Scroll to bottom function
  const scrollToBottom = useCallback(() => {
    if (textResultsRef.current) {
      textResultsRef.current.scrollTop = textResultsRef.current.scrollHeight;
      setIsAutoScrolling(true);
      setShowScrollToBottom(false);
    }
  }, []);

  // Auto-scroll effect when textResult updates (only if auto-scrolling is enabled)
  useEffect(() => {
    if (textResultsRef.current && textResult.length > 0 && isAutoScrolling) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        if (textResultsRef.current && isAutoScrolling) {
          const newScrollHeight = textResultsRef.current.scrollHeight;
          // Only scroll if content actually changed
          if (newScrollHeight !== lastScrollHeight.current) {
            textResultsRef.current.scrollTop = newScrollHeight;
            lastScrollHeight.current = newScrollHeight;
          }
        }
      }, 100);
    }
  }, [textResult, isAutoScrolling]);

  // Create cached translation function
  const translateWithOpenAI = async (
    textLines: string[]
  ): Promise<string[]> => {
    if (!openaiClient) {
      throw new Error("OpenAI client not initialized");
    }

    try {
      const completion = await openaiClient.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a translator. Translate the given text to ${transToLang}.
              The Input format is { input: string[] }, translate each item in the input list
              Maintain the original formatting and structure. Return only the translation, no explanations.
              the output format will be a valid json structure { output: string[] } that can be called with JSON.parse()`,
          },
          {
            role: "user",
            content: JSON.stringify({ inputList: textLines }),
          },
        ],
        temperature: 0.3,
      });

      const rawResult =
        completion.choices[0]?.message?.content || "{ output: [] }";
      const parsedResult = JSON.parse(rawResult) as { output: string[] };
      return parsedResult.output;
    } catch (error) {
      console.error("OpenAI translation failed:", error);
      throw error;
    }
  };

  const handleApiKeyChange = async (newKey: string) => {
    if (newKey === openaiApiKey) {
      return;
    }
    setOpenaiApiKey(newKey);
    if (newKey.length < 10) {
      setIsValidApiKey(false);
      setOpenaiClient(null);
      return;
    }

    if (!newKey.startsWith("sk-")) {
      setIsValidApiKey(false);
      setOpenaiClient(null);
      return;
    }
    console.log(newKey, openaiApiKey);
    try {
      // Create new client
      const newClient = new OpenAI({
        apiKey: newKey,
        dangerouslyAllowBrowser: true,
      });

      // Test the client with a simple request
      await newClient.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 5,
      });

      // If successful, cache the client
      setOpenaiClient(newClient);
      setIsValidApiKey(true);
      console.log("OpenAI client created and cached successfully");
    } catch (error) {
      console.error("API key validation failed:", error);
      setIsValidApiKey(false);
      setOpenaiClient(null);
    }
  };

  // Update screenToOcr to use cached client
  const screenToOcr = async (append: boolean = false) => {
    if (isProcessingOcr) return;

    if (!append) {
      setIsAutoScrolling(true);
      setShowScrollToBottom(false);
    }

    setIsProcessingOcr(true);
    try {
      const result = await invoke<OcrResult>("capture_screen_to_ocr", {
        border: showBorder,
        navHeight: 25,
        language: ocrLang || null,
      });
      const textLines = result.textLines;
      if (!(textLines.length > 0)) {
        return;
      }

      const newResultString = textLines.join("\n");
      if (newResultString === lastOcrResultRef.current) {
        return;
      }

      lastOcrResultRef.current = newResultString;

      setTextResult((prev) => {
        if (append) {
          return [...prev, result.textLines];
        } else {
          return [result.textLines];
        }
      });

      const indexToInsert = orderRef.current++;

      // Use cached OpenAI client if translation is enabled and client is ready
      if (isTranslationEnabled && openaiClient) {
        translateWithOpenAI(textLines)
          .then((translationResult) => {
            setTranslationResult((prev) => {
              return { ...prev, [indexToInsert]: translationResult };
            });
          })
          .catch((error) => {
            console.error("Translation failed:", error);
            setTranslationResult((prev) => {
              return {
                ...prev,
                [indexToInsert]: [`Translation failed: ${error.message}`],
              };
            });
          });
      }
    } catch (error) {
      console.error("Failed to capture screen and perform OCR:", error);
      setOcrError("Screen OCR failed: " + error);
    } finally {
      setIsProcessingOcr(false);
    }
  };

  useEffect(() => {
    // Listen for overlay visibility changes
    const unlistenVisibility = listen<{ isVisible: boolean }>(
      "overlay-visibility-changed",
      (event) => {
        setOverlay(event.payload.isVisible);
      }
    );

    return () => {
      unlistenVisibility.then((unlisten) => unlisten());
    };
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      // Stop recording
      if (intervalId) {
        clearInterval(intervalId);
        setIntervalId(null);
      }
      setIsRecording(false);
    } else {
      // Start recording
      if (!overlay) {
        console.warn("Overlay must be visible to start recording");
        return;
      }

      const id = setInterval(() => {
        screenToOcr(true);
      }, recordingInterval);

      setIntervalId(id);
      setIsRecording(true);
    }
  };

  useEffect(() => {
    if (!overlay) {
      if (intervalId) {
        clearInterval(intervalId);
        setIntervalId(null);
      }
      setIsRecording(false);
    }
  }, [overlay]);
  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [intervalId]);

  // Clear cache when clearing text results
  const clearTextResults = () => {
    setTextResult([]);
    setTranslationResult({}); // Clear translations too
    setIsAutoScrolling(true);
    setShowScrollToBottom(false);
    lastOcrResultRef.current = ""; // Clear cache
    orderRef.current = 0; // Reset order counter
  };

  return (
    <main className="h-screen overflow-hidden flex flex-col gap-1">
      <h3>Overlay Window Controls</h3>
      <div className="flex gap-1">
        <Indicator onClick={toggleOverlay} status={overlay ? "on" : "off"}>
          Toggle Overlay
        </Indicator>
        <Indicator onClick={toggleBorder} status={showBorder ? "on" : "off"}>
          Toggle Border
        </Indicator>
      </div>

      <h3>Screen Capture</h3>
      <div className="flex gap-2 items-center flex-wrap">
        <Button
          onClick={captureScreenImage}
          className="w-36"
          disabled={isCapturing}
        >
          {isCapturing ? "Capturing..." : "📷 Full Screen"}
        </Button>

        <Button
          onClick={captureOverlayContent}
          disabled={isCapturing || !overlay}
          className="w-36"
        >
          {isCapturing ? "Capturing..." : "📐 Overlay Content"}
        </Button>
      </div>

      <div>OCR</div>
      <div className="flex gap-2 items-center flex-wrap">
        <select
          value={ocrLang}
          onChange={(e) => setOcrLang(e.target.value as WinsLang)}
          className="border rounded h-7 w-30"
        >
          {availableLanguages.map((lang) => (
            <option key={lang.wins} value={lang.wins}>
              {lang.wins}
            </option>
          ))}
        </select>

        <Button
          onClick={processImageWithWindowsOCR}
          disabled={isProcessingOcr || !capturedImage}
          className="w-36"
        >
          {isProcessingOcr ? "Processing..." : "Windows OCR"}
        </Button>
        <Button
          className="w-40"
          onClick={processImageWithEasyOCR}
          disabled={isProcessingOcr || !capturedImage}
        >
          {isProcessingOcr ? "Processing..." : "Easy OCR (very slow)"}
        </Button>
        <Button
          className="w-36"
          disabled={!overlay}
          onClick={() => {
            screenToOcr();
          }}
        >
          Screen to Ocr
        </Button>
      </div>

      <div>Translation Settings</div>
      <div className="flex gap-2 items-center flex-wrap">
        <select
          value={transToLang}
          onChange={(e) => setTransToLang(e.target.value as TransToLang)}
          className="border rounded h-7 w-30"
        >
          {transToLangs.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
        <Indicator
          onClick={() => setIsTranslationEnabled(!isTranslationEnabled)}
          status={isTranslationEnabled ? "on" : "off"}
        >
          Translation
        </Indicator>

        {/* OpenAI API Key Input */}
        <div className="flex items-center gap-2">
          <label htmlFor="openai-key" className="text-sm">
            OpenAI API Key:
          </label>
          <input
            id="openai-key"
            type="password"
            defaultValue={"api-key"}
            onBlur={(e) => handleApiKeyChange(e.target.value)}
            placeholder="sk-..."
            className={`px-2 py-1 border rounded w-48 text-xs ${
              openaiApiKey
                ? isValidApiKey
                  ? "border-green-500 bg-green-50"
                  : "border-red-500 bg-red-50"
                : "border-gray-300"
            }`}
          />
          <div className="text-xs">
            {openaiApiKey && (
              <span
                className={isValidApiKey ? "text-green-600" : "text-red-600"}
              >
                {isValidApiKey ? "✓ Valid" : "✗ Invalid"}
              </span>
            )}
          </div>
        </div>
      </div>

      <div>Recording Controls</div>
      <div className="flex gap-2 items-center flex-wrap">
        <div className="flex items-center gap-1">
          <label htmlFor="recording-interval" className="text-sm">
            Interval (ms):
          </label>
          <input
            id="recording-interval"
            type="number"
            value={recordingInterval}
            onChange={(e) =>
              setRecordingInterval(
                Math.max(100, parseInt(e.target.value) || 1000)
              )
            }
            min="100"
            step="100"
            className="px-2 py-1 border rounded w-20"
            disabled={isRecording}
          />
        </div>
        <Indicator
          onClick={toggleRecording}
          status={isRecording ? "on" : "off"}
          disabled={!overlay}
        >
          {isRecording ? "Stop Recording" : "Start Recording"}
        </Indicator>
        {isRecording && (
          <span className="text-sm text-gray-600">
            Recording every {recordingInterval}ms...
          </span>
        )}
      </div>

      {/* Display captured image */}
      <div className="flex gap-1 overflow-auto">
        {capturedImage && (
          <div className="p-4 border border-gray-300 rounded w-1/2">
            <div className="mb-2 flex gap-1 items-center">
              <strong>Captured Image:</strong> {capturedImage.width} x{" "}
              {capturedImage.height}
              <Button
                onClick={() => {
                  setCapturedImage(null);
                }}
                disabled={isCapturing || isProcessingOcr}
              >
                Clear Image
              </Button>
            </div>
            <div className="overflow-auto">
              <img
                src={capturedImage.image_base64}
                alt="Captured screen"
                className="max-w-full h-auto border-2 border-gray-100"
                style={{ maxHeight: "400px" }}
              />
            </div>
          </div>
        )}
        {textResult.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded w-1/2 overflow-hidden flex flex-col relative">
            <div className="p-2 flex gap-1 items-center justify-between bg-gray-50 border-b">
              <div className="flex gap-1">
                <h4 className="font-bold">📝 Extracted Text:</h4>
                <div
                  className={`text-xs px-2 py-1 rounded ${
                    isAutoScrolling
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {isAutoScrolling ? "🔄 Auto-scroll ON" : "⏸️ Auto-scroll OFF"}
                </div>
              </div>
              <Button className="w-20 h-5" onClick={clearTextResults}>
                Clear
              </Button>
            </div>
            <div
              ref={textResultsRef}
              className="bg-white p-3 text-sm whitespace-pre-wrap overflow-auto flex-1"
              style={{ maxHeight: "400px" }}
              onScroll={handleScroll}
            >
              {textResult.map((textLines, batchIdx) => (
                <Fragment key={batchIdx}>
                  {textLines.map((textline, idx) => {
                    // Check if translation is available for this batch (only if translation is enabled)
                    const hasTranslation =
                      isTranslationEnabled &&
                      translationResult[batchIdx] &&
                      translationResult[batchIdx][idx];
                    const translation = hasTranslation
                      ? translationResult[batchIdx][idx]
                      : null;

                    return (
                      <div key={`${batchIdx}-${idx}`} className="group">
                        {/* Translation text - shown when ready and translation is enabled */}
                        {translation && (
                          <div className="text-blue-700 font-medium">
                            T: {translation}
                          </div>
                        )}

                        {/* Loading indicator when translation is pending and enabled */}
                        {isTranslationEnabled &&
                          !translation &&
                          batchIdx < orderRef.current && (
                            <div className="text-gray-400 text-xs italic">
                              Translating...
                            </div>
                          )}

                        {/* Original text - hidden when translation is ready, shown on hover */}
                        <div
                          className={`transition-opacity duration-200 ${
                            translation
                              ? "opacity-0 group-hover:opacity-100 text-gray-500 text-xs"
                              : "opacity-100"
                          }`}
                        >
                          {translation && (
                            <span className="text-gray-400">O: </span>
                          )}
                          {textline}
                        </div>
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>

            {showScrollToBottom && (
              <Button
                onClick={scrollToBottom}
                className="absolute bottom-3 right-6 bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded shadow-lg"
              >
                ↓ New messages
              </Button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
