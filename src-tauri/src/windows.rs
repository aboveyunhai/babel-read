use anyhow::Result;

#[cfg(target_os = "windows")]
pub async fn buffer_to_ocr_windows(
    buffer: &[u8],
    language: Option<String>,
) -> Result<serde_json::Value> {
    use windows::{
        Globalization::Language,
        Graphics::Imaging::BitmapDecoder,
        Media::Ocr::OcrEngine as WindowsOcrEngine,
        Storage::Streams::{DataWriter, InMemoryRandomAccessStream},
    };
    let stream = InMemoryRandomAccessStream::new()?;
    let writer = DataWriter::CreateDataWriter(&stream)?;
    writer.WriteBytes(&buffer)?;
    writer.StoreAsync()?.get()?;
    writer.FlushAsync()?.get()?;
    stream.Seek(0)?;
    let decoder = BitmapDecoder::CreateAsync(&stream)?.get()?;
    let bitmap = decoder.GetSoftwareBitmapAsync()?.get()?;
    let engine = if let Some(lang_code) = language {
        let lang_hstring = lang_code.clone();
        match Language::CreateLanguage(&lang_code.into()) {
            Ok(language_obj) => {
                match WindowsOcrEngine::TryCreateFromLanguage(&language_obj) {
                    Ok(engine) => engine,
                    Err(_) => {
                        // Now we can still use lang_code since we didn't move it
                        println!("Warning: Could not create OCR engine for language '{}', falling back to user profile languages", lang_hstring);
                        WindowsOcrEngine::TryCreateFromUserProfileLanguages()?
                    }
                }
            }
            Err(_) => {
                println!(
                    "Warning: Invalid language code '{}', falling back to user profile languages",
                    lang_hstring
                );
                WindowsOcrEngine::TryCreateFromUserProfileLanguages()?
            }
        }
    } else {
        // Use user profile languages when no language specified
        WindowsOcrEngine::TryCreateFromUserProfileLanguages()?
    };

    let result = engine.RecognizeAsync(&bitmap)?.get()?;

    let text = result.Text()?.to_string();

    let lines = result.Lines()?;
    let text_lines: Vec<String> = (0..lines.Size()?)
        .filter_map(|i| {
            lines
                .GetAt(i)
                .and_then(|line| line.Text())
                .map(|text| text.to_string())
                .ok()
        })
        .collect();

    let json_output = serde_json::json!({
        "text": text,
        "textLines": text_lines,
        "confidence": 1
    });

    Ok(json_output)
}
