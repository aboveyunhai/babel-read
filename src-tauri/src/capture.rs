use crate::windows::buffer_to_ocr_windows;
use base64::Engine;
use rayon::iter::ParallelIterator;
use rayon::slice::ParallelSliceMut;
use tauri::Manager;
use windows::Win32::{
    Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        RGBQUAD, SRCCOPY,
    },
    UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN},
};

#[derive(serde::Serialize, serde::Deserialize)]
pub struct CaptureResult {
    image_base64: String,
    width: u32,
    height: u32,
}

fn capture_screen_region_to_bytes(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<Vec<u8>, String> {
    unsafe {
        let screen_dc = GetDC(None);
        if screen_dc.is_invalid() {
            return Err("Failed to get screen DC".to_string());
        }

        let mem_dc = CreateCompatibleDC(Some(screen_dc));
        if mem_dc.is_invalid() {
            let _ = ReleaseDC(None, screen_dc);
            return Err("Failed to create compatible DC".to_string());
        }

        let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
        if bitmap.is_invalid() {
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(None, screen_dc);
            return Err("Failed to create bitmap".to_string());
        }

        let old_bitmap = SelectObject(mem_dc, bitmap.into());

        if let Err(_) = BitBlt(mem_dc, 0, 0, width, height, Some(screen_dc), x, y, SRCCOPY) {
            let _ = SelectObject(mem_dc, old_bitmap);
            let _ = DeleteObject(bitmap.into());
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(None, screen_dc);
            return Err("Failed to copy screen".to_string());
        }

        let mut bitmap_info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // Negative for top-down bitmap
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                biSizeImage: (width * height * 4) as u32,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD::default(); 1],
        };

        let buffer_size = (width * height * 4) as usize;
        let mut buffer = Vec::with_capacity(buffer_size);
        buffer.resize(buffer_size, 0);

        let result = GetDIBits(
            screen_dc,
            bitmap,
            0,
            height as u32,
            Some(buffer.as_mut_ptr() as *mut _),
            &mut bitmap_info,
            DIB_RGB_COLORS,
        );

        // Cleanup GDI objects
        let _ = SelectObject(mem_dc, old_bitmap);
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(mem_dc);
        let _ = ReleaseDC(None, screen_dc);

        if result == 0 {
            return Err("Failed to get bitmap bits".to_string());
        }

        // OPTIMIZATION: Parallel color conversion for larger images
        if buffer_size > 500_000 {
            // Only use parallel processing for images larger than ~625x200
            buffer.par_chunks_mut(4).for_each(|chunk| {
                chunk.swap(0, 2); // Swap B and R channels in parallel
            });
        } else {
            // Sequential processing for smaller images to avoid threading overhead
            for chunk in buffer.chunks_mut(4) {
                chunk.swap(0, 2);
            }
        }

        // Convert buffer to PNG bytes directly
        use image::{ImageBuffer, Rgba};

        let img = ImageBuffer::<Rgba<u8>, _>::from_raw(width as u32, height as u32, buffer)
            .ok_or("Failed to create image from buffer")?;

        let mut webp_bytes = Vec::new();

        let mut cursor = std::io::Cursor::new(&mut webp_bytes);
        img.write_to(&mut cursor, image::ImageFormat::WebP)
            .map_err(|e| format!("Failed to encode WebP: {}", e))?;

        Ok(webp_bytes)
    }
}

fn convert_webp_to_base64(webp_bytes: &[u8]) -> String {
    let base64_string = base64::engine::general_purpose::STANDARD.encode(webp_bytes);
    format!("data:image/webp;base64,{}", base64_string)
}

fn capture_screen_region(x: i32, y: i32, width: i32, height: i32) -> Result<CaptureResult, String> {
    let webp_bytes = capture_screen_region_to_bytes(x, y, width, height)?;

    let image_base64 = convert_webp_to_base64(&webp_bytes);

    Ok(CaptureResult {
        image_base64,
        width: width as u32,
        height: height as u32,
    })
}

#[tauri::command]
pub async fn capture_full_screen_image() -> Result<CaptureResult, String> {
    unsafe {
        let screen_width = GetSystemMetrics(SM_CXSCREEN);
        let screen_height = GetSystemMetrics(SM_CYSCREEN);
        capture_screen_region(0, 0, screen_width, screen_height)
    }
}

#[tauri::command]
pub async fn capture_overlay_content(
    app_handle: tauri::AppHandle,
    border: Option<bool>,
    nav_height: Option<i32>,
) -> Result<CaptureResult, String> {
    let overlay_window = app_handle
        .get_webview_window("overlay")
        .ok_or("Overlay window not found")?;

    let position = overlay_window
        .outer_position()
        .map_err(|e| format!("Failed to get window position: {}", e))?;

    let size = overlay_window
        .outer_size()
        .map_err(|e| format!("Failed to get window size: {}", e))?;

    let border = border.unwrap_or(true);
    let nav_height = nav_height.unwrap_or(25);

    let (position_y, size_height) = if border {
        (position.y + nav_height, (size.height as i32) - nav_height)
    } else {
        (position.y, size.height as i32)
    };

    let result = capture_screen_region(
        position.x + 1,
        position_y,
        size.width as i32 - 2,
        size_height - 1,
    );

    result
}

#[tauri::command]
pub async fn capture_screen_to_ocr(
    app_handle: tauri::AppHandle,
    border: Option<bool>,
    nav_height: Option<i32>,
    language: Option<String>,
) -> Result<serde_json::Value, String> {
    // Get overlay window info
    let overlay_window = app_handle
        .get_webview_window("overlay")
        .ok_or("Overlay window not found")?;

    let position = overlay_window
        .outer_position()
        .map_err(|e| format!("Failed to get window position: {}", e))?;

    let size = overlay_window
        .outer_size()
        .map_err(|e| format!("Failed to get window size: {}", e))?;

    let border = border.unwrap_or(true);
    let nav_height = nav_height.unwrap_or(25);

    let (position_y, size_height) = if border {
        (position.y + nav_height, (size.height as i32) - nav_height)
    } else {
        (position.y, size.height as i32)
    };

    // Capture directly as bytes for OCR
    let image_bytes = capture_screen_region_to_bytes(
        position.x + 1,
        position_y,
        size.width as i32 - 2,
        size_height - 1,
    )?;

    // Perform OCR directly with the image bytes
    let ocr_result = buffer_to_ocr_windows(&image_bytes, language)
        .await
        .map_err(|e| e.to_string())?;

    Ok(ocr_result)
}
