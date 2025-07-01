import re
import csv
import pytesseract
from pdf2image import convert_from_path

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

def extract_clean_data(pdf_path):
    extracted = []

    pages = convert_from_path(pdf_path, dpi=300, poppler_path=r"C:\poppler\poppler-24.08.0\Library\bin")

    for i, img in enumerate(pages):
        print(f"🔍 OCR page {i+1}")
        text = pytesseract.image_to_string(img)
        lines = text.split('\n')

        for line in lines:
            line = line.strip()

            # Skip obvious headers or garbage
            if not line or any(bad in line.lower() for bad in [
                "mace", "tick", "symbol", "cycle", "week", "index", "cap mil", "percentage", "day", "#"
            ]):
                continue

            # Remove + or - signs
            line = re.sub(r'[+\-]', '', line)

            # Try match: Microgroup (starts with number + name + 5+ digits)
            match1 = re.match(r'^(\d{3,4})\s+([A-Za-z0-9\s,&\./\-()]+?)\s+((\d+\s+){5,})', line)
            if match1:
                name = f"{match1.group(1)} {match1.group(2).strip()}"
                values = re.findall(r'\d+', match1.group(3))
                extracted.append([name] + values[:5])
                continue

            # Try match: Stock format (company + ticker + 5+ numbers)
            match2 = re.match(r'^(.+?)\s+([A-Z]{2,5})\s+((\d+\s+){5,})', line)
            if match2:
                company = match2.group(1).strip()
                ticker = match2.group(2).strip()
                values = re.findall(r'\d+', match2.group(3))
                extracted.append([f"{company} {ticker}"] + values[:5])
                continue

    return extracted

def save_to_csv(rows, filename):
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(["Name", "Val1", "Val2", "Val3", "Val4", "Val5"])
        writer.writerows(rows)
    print(f"✅ Saved to {filename}")

if __name__ == "__main__":
    data = extract_clean_data("test.pdf")
    if data:
        save_to_csv(data, "cleaned_output.csv")
    else:
        print("⚠️ No data extracted.")
