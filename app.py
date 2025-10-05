from flask import Flask, request, jsonify
from flask_cors import CORS
import fitz  # PyMuPDF
import re

app = Flask(__name__)
CORS(app)

def extract_w2_data(pdf_bytes):
    """Extract W-2 data using hardcoded indices for standard IRS W-2 format"""
    w2_data = {
        'wages': 0,
        'federalWithheld': 0,
        'socialSecurity': 0,
        'medicare': 0
    }
    
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page = doc[0]
        full_text = page.get_text()
        doc.close()
        
        # Extract all numbers in order
        all_numbers = []
        for match in re.finditer(r'(\d+\.?\d{0,2})', full_text):
            num_str = match.group(1).replace(',', '')
            try:
                num = float(num_str)
                all_numbers.append(num)
            except ValueError:
                continue
        
        print(f"\nW-2 Processing:")
        print(f"Total numbers found: {len(all_numbers)}")
        print(f"\nFull number array:")
        for i in range(0, len(all_numbers), 10):
            chunk = all_numbers[i:i+10]
            print(f"  [{i}-{i+9}]: {chunk}")
        
        # Find the LAST occurrence of wages/federal pattern (most recent/complete W-2)
        found = False
        for i in range(len(all_numbers) - 2, max(0, len(all_numbers) - 25), -1):
            num = all_numbers[i]
            if 40000 <= num <= 500000:
                next_num = all_numbers[i + 1]
                ratio = next_num / num if num > 0 else 0
                
                if 0.08 <= ratio <= 0.35 and 1000 < next_num < 100000:
                    w2_data['wages'] = num
                    w2_data['federalWithheld'] = next_num
                    
                    print(f"\n✓ Found W-2 pattern at index {i} (searching from end):")
                    print(f"  Wages [{i}]: {num}")
                    print(f"  Federal [{i+1}]: {next_num} (ratio: {ratio:.2%})")
                    
                    # Look for SS tax in next few positions
                    for j in range(i + 2, min(i + 6, len(all_numbers))):
                        potential_ss = all_numbers[j]
                        ss_ratio = potential_ss / num
                        if 0.04 <= ss_ratio <= 0.10 and 1000 < potential_ss < 50000:
                            w2_data['socialSecurity'] = potential_ss
                            print(f"  SS Tax [{j}]: {potential_ss}")
                            break
                    
                    # Look for Medicare before wages
                    for k in range(max(0, i - 20), i):
                        potential_mc = all_numbers[k]
                        mc_ratio = potential_mc / num
                        if 0.01 <= mc_ratio <= 0.04 and 100 < potential_mc < 20000:
                            w2_data['medicare'] = potential_mc
                            print(f"  Medicare [{k}]: {potential_mc}")
                            break
                    
                    found = True
                    break
        
        if not found:
            print("\n✗ No valid W-2 pattern found")
            
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
    
    return w2_data

def extract_1099_int_data(pdf_bytes):
    data = {'interest': 0}
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        full_text = doc[0].get_text()
        doc.close()
        
        numbers = [float(m.group(1).replace(',', '')) 
                   for m in re.finditer(r'(\d+\.?\d{0,2})', full_text)]
        numbers = [n for n in numbers if 10 < n < 50000]
        
        if numbers:
            data['interest'] = min(numbers)
        
        print(f"1099-INT: {data}")
    except Exception as e:
        print(f"Error: {str(e)}")
    
    return data

def extract_1099_nec_data(pdf_bytes):
    data = {'nonemployeeComp': 0}
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        full_text = doc[0].get_text()
        doc.close()
        
        numbers = [float(m.group(1).replace(',', '')) 
                   for m in re.finditer(r'(\d+\.?\d{0,2})', full_text)]
        numbers = [n for n in numbers if 500 < n < 200000]
        
        if numbers:
            data['nonemployeeComp'] = max(numbers)
        
        print(f"1099-NEC: {data}")
    except Exception as e:
        print(f"Error: {str(e)}")
    
    return data

@app.route('/api/extract', methods=['POST'])
def extract_pdf_data():
    if 'files' not in request.files:
        return jsonify({'error': 'No files uploaded'}), 400
    
    files = request.files.getlist('files')
    
    extracted_data = {
        'w2': None,
        'form1099INT': None,
        'form1099NEC': None
    }
    
    for file in files:
        if file.filename == '':
            continue
        
        filename = file.filename.lower()
        print(f"\n{'='*50}")
        print(f"Processing: {file.filename}")
        print(f"{'='*50}")
        
        pdf_bytes = file.read()
        
        if 'w-2' in filename or 'w2' in filename:
            extracted_data['w2'] = extract_w2_data(pdf_bytes)
        elif '1099-int' in filename or '1099int' in filename:
            extracted_data['form1099INT'] = extract_1099_int_data(pdf_bytes)
        elif '1099-nec' in filename or '1099nec' in filename:
            extracted_data['form1099NEC'] = extract_1099_nec_data(pdf_bytes)
        else:
            extracted_data['w2'] = extract_w2_data(pdf_bytes)
    
    print(f"\nFinal Response: {extracted_data}\n")
    return jsonify(extracted_data)

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    print("\n" + "="*60)
    print("Flask Tax Return Backend - Hardcoded W-2 Extraction")
    print("="*60)
    print("Server: http://localhost:5000")
    print("="*60 + "\n")
    app.run(debug=True, port=5000)