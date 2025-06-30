import pytesseract
import pandas as pd
import re
from pdf2image import convert_from_path
import os

# 🔧 If Tesseract is not in PATH, specify the full path here
# pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

def extract_lines_with_values(text):
    results = []
    lines = text.splitlines()
    for line in lines:
        # Example 1: "1006 Residential Building, Pri. 16 15 18 18 18"
        match_micro = re.match(r"(\d{3,4})\s+(.+?)\s+(\d+\s+){5,}", line)
        if match_micro:
            number, name = match_micro.group(1), match_micro.group(2)
            values = re.findall(r"\d+", line)
            results.append(["Microgroup", number, name] + values[:5])
            continue

        # Example 2: "Solaris Energy Infras Inc SEI 3 5 2 4 4"
        match_stock = re.match(r"(.+?)\s+([A-Z]{1,5})\s+((?:\d+\s+){5,})", line)
        if match_stock:
            name = match_stock.group(1).strip()
            ticker = match_stock.group(2).strip()
            values = re.findall(r"\d+", match_stock.group(3))
            results.append(["Stock", name, ticker] + values[:5])
    return results

def ocr_extract_from_pdf(pdf_path, output_excel="extracted_output.xlsx"):
    print("🔁 Converting PDF pages to images...")
    pages = convert_from_path(pdf_path, dpi=300)
    all_rows = []

    for i, image in enumerate(pages):
        print(f"🔍 Processing page {i+1}")
        text = pytesseract.image_to_string(image)
        rows = extract_lines_with_values(text)
        print(f"Page {i+1}: found {len(rows)} rows")
        all_rows.extend(rows)

    if not all_rows:
        print("❌ No data found via OCR.")
        return

    df = pd.DataFrame(all_rows)
    df.columns = ["Type", "ID/Name", "Group/Stock", "Val1", "Val2", "Val3", "Val4", "Val5"]
    df.to_excel(output_excel, index=False)
    print(f"\n✅ OCR extraction complete. Saved to {output_excel}")

if __name__ == "__main__":
    ocr_extract_from_pdf("test.pdf")
