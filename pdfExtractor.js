export async function extractTextFromPDF(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      const arrayBuffer = e.target.result;
      const uint8Array = new Uint8Array(arrayBuffer);
      
      let text = '';
      for (let i = 0; i < uint8Array.length; i++) {
        const char = uint8Array[i];
        if ((char >= 32 && char <= 126) || char === 10 || char === 13) {
          text += String.fromCharCode(char);
        }
      }
      
      resolve(text);
    };
    
    reader.readAsArrayBuffer(file);
  });
}

export function extractW2Data(text) {
  console.log('Text length:', text.length);
  
  const w2Data = {
    wages: 0,
    federalWithheld: 0,
    socialSecurity: 0,
    medicare: 0
  };

  // Extract all numbers, filtering out common PDF artifacts
  const numbers = [];
  const regex = /(\d+)\.?(\d{0,2})\b/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const num = parseFloat(match[1] + (match[2] ? '.' + match[2] : ''));
    
    // Filter out common PDF binary values and unrealistic numbers
    if (!isNaN(num) && 
        num !== 65535 && 
        num !== 255 && 
        num !== 1545 && 
        num !== 8008176 &&
        num > 500 && 
        num < 1000000) {
      numbers.push(num);
    }
  }
  
  // Remove duplicates and sort
  const uniqueNumbers = [...new Set(numbers)].sort((a, b) => b - a);
  
  console.log('Filtered unique numbers:', uniqueNumbers.slice(0, 20));
  
  // Find wages (Box 1) - typically the largest number between 10k and 500k
  const wagesCandidates = uniqueNumbers.filter(n => n > 50000 && n < 500000);
  if (wagesCandidates.length > 0) {
    w2Data.wages = wagesCandidates[0];
  }
  
  // Find federal withholding (Box 2) - typically 8-35% of wages
  if (w2Data.wages > 0) {
    for (let num of uniqueNumbers) {
      const ratio = num / w2Data.wages;
      if (num < w2Data.wages && ratio >= 0.08 && ratio <= 0.35 && num > 1000) {
        w2Data.federalWithheld = num;
        break;
      }
    }
    
    // Social Security (Box 4) - around 6.2% of wages
    for (let num of uniqueNumbers) {
      const ratio = num / w2Data.wages;
      if (num < w2Data.wages && ratio >= 0.05 && ratio <= 0.10 && num > 2000) {
        w2Data.socialSecurity = num;
        break;
      }
    }
    
    // Medicare (Box 6) - around 1.45% of wages
    for (let num of uniqueNumbers) {
      const ratio = num / w2Data.wages;
      if (num < w2Data.wages && ratio >= 0.01 && ratio <= 0.04 && num > 500) {
        w2Data.medicare = num;
        break;
      }
    }
  }

  console.log('Extracted W-2:', w2Data);
  return w2Data;
}

export function extract1099INTData(text) {
  const data = { interest: 0 };
  
  const numbers = [];
  const regex = /(\d+)\.?(\d{0,2})\b/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const num = parseFloat(match[1] + (match[2] ? '.' + match[2] : ''));
    if (!isNaN(num) && num > 10 && num < 50000 && num !== 1099) {
      numbers.push(num);
    }
  }
  
  const unique = [...new Set(numbers)].sort((a, b) => a - b);
  if (unique.length > 0) {
    data.interest = unique[0];
  }
  
  console.log('Extracted 1099-INT:', data);
  return data;
}

export function extract1099NECData(text) {
  const data = { nonemployeeComp: 0 };
  
  const numbers = [];
  const regex = /(\d+)\.?(\d{0,2})\b/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const num = parseFloat(match[1] + (match[2] ? '.' + match[2] : ''));
    if (!isNaN(num) && num > 500 && num < 200000 && num !== 1099) {
      numbers.push(num);
    }
  }
  
  const unique = [...new Set(numbers)].sort((a, b) => b - a);
  if (unique.length > 0) {
    data.nonemployeeComp = unique[0];
  }
  
  console.log('Extracted 1099-NEC:', data);
  return data;
}

export async function extractTaxData(files) {
  const extractedData = {
    w2: null,
    form1099INT: null,
    form1099NEC: null
  };

  for (const file of files) {
    try {
      console.log('=== Processing:', file.name, '===');
      const text = await extractTextFromPDF(file);
      const fileName = file.name.toLowerCase();

      if (fileName.includes('w') && (fileName.includes('2') || fileName.includes('-2'))) {
        extractedData.w2 = extractW2Data(text);
      } else if (fileName.includes('1099') && fileName.includes('int')) {
        extractedData.form1099INT = extract1099INTData(text);
      } else if (fileName.includes('1099') && fileName.includes('nec')) {
        extractedData.form1099NEC = extract1099NECData(text);
      } else {
        extractedData.w2 = extractW2Data(text);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }

  return extractedData;
}