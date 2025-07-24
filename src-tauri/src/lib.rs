use std::sync::Mutex;
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, Window};

use crate::windows::buffer_to_ocr_windows;
mod capture;
mod hook;
mod windows;

// Global state for overlay styling
#[derive(Default)]
struct OverlayState {
    show_border: Mutex<bool>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn create_overlay_window(app: tauri::AppHandle) -> Result<(), String> {
    let _overlay_window =
        WebviewWindowBuilder::new(&app, "overlay", WebviewUrl::App("index.html".into()))
            .title("Overlay Window")
            .inner_size(400.0, 300.0)
            .position(100.0, 100.0)
            .always_on_top(true)
            .transparent(true)
            .visible_on_all_workspaces(true)
            .shadow(false)
            .decorations(false)
            .resizable(true)
            .drag_and_drop(false)
            .content_protected(false)
            .build()
            .map_err(|e| e.to_string())?;

    hook::start_global_mouse_stream(_overlay_window);

    // Emit event when overlay is created
    app.emit(
        "overlay-visibility-changed",
        serde_json::json!({
            "isVisible": true
        }),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_overlay_state(state: State<'_, OverlayState>) -> Result<bool, String> {
    let show_border = *state
        .show_border
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;
    Ok(show_border)
}

#[tauri::command]
async fn toggle_overlay_state(
    app: tauri::AppHandle,
    state: State<'_, OverlayState>,
) -> Result<bool, String> {
    let mut show_border = state
        .show_border
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;
    *show_border = !*show_border;

    // Emit event to all windows when state changes
    app.emit(
        "overlay-state-changed",
        serde_json::json!({
            "showBorder": *show_border
        }),
    )
    .map_err(|e| e.to_string())?;

    Ok(*show_border)
}

#[tauri::command]
async fn start_drag(app: tauri::AppHandle, window_label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&window_label) {
        window.start_dragging().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn close_overlay_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.close().map_err(|e| e.to_string())?;
    }
    // Emit event when overlay is closed
    app.emit(
        "overlay-visibility-changed",
        serde_json::json!({
            "isVisible": false
        }),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn toggle_overlay_visibility(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        if window
            .is_visible()
            .map_err(|e: tauri::Error| e.to_string())?
        {
            window.hide().map_err(|e| e.to_string())?;
            app.emit(
                "overlay-visibility-changed",
                serde_json::json!({
                    "isVisible": false
                }),
            )
            .map_err(|e| e.to_string())?;
        } else {
            window.show().map_err(|e| e.to_string())?;
            // Emit event when overlay is shown
            app.emit(
                "overlay-visibility-changed",
                serde_json::json!({
                    "isVisible": true
                }),
            )
            .map_err(|e| e.to_string())?;
        }
    } else {
        create_overlay_window(app).await?;
    }
    Ok(())
}

#[tauri::command]
fn set_cursor_passthrough(window: Window, passthrough: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(passthrough)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn image_to_ocr(
    _app: tauri::AppHandle,
    buffer: Vec<u8>,
    language: Option<String>,
) -> Result<serde_json::Value, String> {
    let result = buffer_to_ocr_windows(&buffer, language)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_python::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(OverlayState {
                show_border: Mutex::new(true),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_overlay_state,
            toggle_overlay_state,
            create_overlay_window,
            close_overlay_window,
            toggle_overlay_visibility,
            start_drag,
            set_cursor_passthrough,
            capture::capture_full_screen_image,
            capture::capture_overlay_content,
            capture::capture_screen_to_ocr,
            image_to_ocr,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
