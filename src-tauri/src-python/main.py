# src-tauri/src-python/main.py
_tauri_plugin_functions = [
    "greet_python",
    "buffer_to_text",
]  # make "greet_python" callable from UI
import sys
import os
import json

# this hack, made me cry
# https://github.com/PyO3/pyo3/discussions/3726#discussioncomment-8013293
current_dir = os.getcwd()
print("Current working directory:", current_dir)
venv_site_packages = os.path.join(
    current_dir, "src-python", ".venv", "Lib", "site-packages"
)
print(venv_site_packages)
if os.path.exists(venv_site_packages):
    sys.path.insert(0, venv_site_packages)
    print("✓ Added venv to path")
else:
    print("✗ Venv path not found")

try:
    import easyocr

    print("✓ easyocr available")
except ImportError:
    print("✗ easyocr not available")


def greet_python(rust_var):
    return str(rust_var) + " from python"


# buffer here is a number array, it's not real buffer
def buffer_to_text(buffer, languages=["en"]):
    try:
        import easyocr

        if isinstance(buffer, list):
            buffer_bytes = bytes([int(x) for x in buffer])
        else:
            buffer_bytes = buffer

        reader = easyocr.Reader(languages)

        results = reader.readtext(buffer_bytes)

        paragraphs = group_text_by_blocks(results)

        return json.dumps(
            {
                "paragraphs": paragraphs,
                "status": "success",
            }
        )

    except ImportError as e:
        return json.dumps(
            {  # Add json.dumps and fix syntax
                "paragraphs": [],  # Add quotes around key
                "error": f"EasyOCR not available: {str(e)}",
                "status": "error",
            }
        )
    except Exception as e:
        return json.dumps(
            {  # Add json.dumps and fix syntax
                "paragraphs": [],  # Add quotes around key
                "error": str(e),
                "status": "error",
            }
        )


def group_text_by_blocks(results):
    """
    Simple and fast text grouping based on vertical spacing
    Returns list of paragraph strings
    """
    if not results:
        return []

    # Step 1: Convert results to simple format and sort by position
    items = []
    for bbox, text, confidence in results:
        y_coords = [point[1] for point in bbox]
        x_coords = [point[0] for point in bbox]

        items.append(
            {
                "text": text.strip(),
                "y_top": min(y_coords),
                "y_bottom": max(y_coords),
                "x_left": min(x_coords),
                "height": max(y_coords) - min(y_coords),
            }
        )

    # Step 2: Sort by reading order (top to bottom, left to right)
    items.sort(key=lambda x: (x["y_top"], x["x_left"]))

    # Step 3: Calculate average text height for spacing threshold
    avg_height = sum(item["height"] for item in items) / len(items)
    gap_threshold = avg_height * 1.5  # Adjust this to control grouping sensitivity

    # Step 4: Group items into paragraphs based on vertical gaps
    paragraphs = []
    current_paragraph = [items[0]]

    for i in range(1, len(items)):
        current = items[i]
        previous = items[i - 1]

        # Calculate gap between current and previous item
        gap = current["y_top"] - previous["y_bottom"]

        # If gap is larger than threshold, start new paragraph
        if gap > gap_threshold:
            # Finalize current paragraph
            paragraph_text = " ".join(item["text"] for item in current_paragraph)
            paragraphs.append(paragraph_text)

            # Start new paragraph
            current_paragraph = [current]
        else:
            # Add to current paragraph
            current_paragraph.append(current)

    # Don't forget the last paragraph
    if current_paragraph:
        paragraph_text = " ".join(item["text"] for item in current_paragraph)
        paragraphs.append(paragraph_text)

    return paragraphs
