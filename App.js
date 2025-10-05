import React, { useState } from 'react';
import { Upload, FileText, Calculator, Download, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import jsPDF from 'jspdf';
import './App.css';

function App() {
  const [step, setStep] = useState(1);
  const [files, setFiles] = useState([]);
  const [personalInfo, setPersonalInfo] = useState({
    name: '',
    ssn: '',
    filingStatus: 'single',
    dependents: 0
  });
  const [extractedData, setExtractedData] = useState(null);
  const [taxCalculation, setTaxCalculation] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [errors, setErrors] = useState([]);

  const filingStatuses = {
    single: { label: 'Single', deduction: 14600 },
    married: { label: 'Married Filing Jointly', deduction: 29200 },
    hoh: { label: 'Head of Household', deduction: 21900 }
  };

  const taxBrackets2024 = {
    single: [
      { max: 11600, rate: 0.10 },
      { max: 47150, rate: 0.12 },
      { max: 100525, rate: 0.22 },
      { max: 191950, rate: 0.24 },
      { max: 243725, rate: 0.32 },
      { max: 609350, rate: 0.35 },
      { max: Infinity, rate: 0.37 }
    ],
    married: [
      { max: 23200, rate: 0.10 },
      { max: 94300, rate: 0.12 },
      { max: 201050, rate: 0.22 },
      { max: 383900, rate: 0.24 },
      { max: 487450, rate: 0.32 },
      { max: 731200, rate: 0.35 },
      { max: Infinity, rate: 0.37 }
    ],
    hoh: [
      { max: 16550, rate: 0.10 },
      { max: 63100, rate: 0.12 },
      { max: 100500, rate: 0.22 },
      { max: 191950, rate: 0.24 },
      { max: 243700, rate: 0.32 },
      { max: 609350, rate: 0.35 },
      { max: Infinity, rate: 0.37 }
    ]
  };

  const handleFileUpload = (e) => {
    const uploadedFiles = Array.from(e.target.files);
    setFiles(prev => [...prev, ...uploadedFiles]);
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const extractDataFromFiles = async () => {
    setProcessing(true);
    setErrors([]);
    
    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });
      
      console.log('Sending files to Python backend...');
      
      const response = await fetch('http://localhost:5000/api/extract', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Backend extraction failed');
      }
      
      const data = await response.json();
      console.log('Received from backend:', data);
      
      if (!data.w2 && !data.form1099INT && !data.form1099NEC) {
        setErrors(['Could not extract data from PDFs.']);
        setProcessing(false);
        return;
      }
      
      setExtractedData(data);
      setProcessing(false);
      setStep(3);
    } catch (error) {
      console.error('Extraction error:', error);
      setErrors(['Error: ' + error.message]);
      setProcessing(false);
    }
  };

  const calculateTax = () => {
    if (!extractedData) return;

    const w2Wages = extractedData.w2?.wages || 0;
    const interestIncome = extractedData.form1099INT?.interest || 0;
    const necComp = extractedData.form1099NEC?.nonemployeeComp || 0;
    
    const totalIncome = w2Wages + interestIncome + necComp;
    
    const standardDeduction = filingStatuses[personalInfo.filingStatus].deduction;
    const taxableIncome = Math.max(0, totalIncome - standardDeduction);
    
    const brackets = taxBrackets2024[personalInfo.filingStatus];
    let tax = 0;
    let previousMax = 0;
    
    for (const bracket of brackets) {
      if (taxableIncome > previousMax) {
        const taxableInBracket = Math.min(taxableIncome, bracket.max) - previousMax;
        tax += taxableInBracket * bracket.rate;
        previousMax = bracket.max;
      } else {
        break;
      }
    }

    const totalWithheld = extractedData.w2?.federalWithheld || 0;
    const refundOrOwed = totalWithheld - tax;

    const calculation = {
      totalIncome,
      standardDeduction,
      taxableIncome,
      totalTax: Math.round(tax * 100) / 100,
      totalWithheld,
      refundOrOwed: Math.round(refundOrOwed * 100) / 100,
      isRefund: refundOrOwed > 0
    };

    setTaxCalculation(calculation);
    setStep(4);
  };

  const generateForm1040 = () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text('Form 1040', 105, 20, { align: 'center' });
    doc.setFontSize(14);
    doc.text('U.S. Individual Income Tax Return - 2024', 105, 30, { align: 'center' });
    
    // Personal Information
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Personal Information', 20, 45);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(11);
    doc.text(`Name: ${personalInfo.name}`, 20, 55);
    doc.text(`SSN: ${personalInfo.ssn}`, 20, 63);
    doc.text(`Filing Status: ${filingStatuses[personalInfo.filingStatus].label}`, 20, 71);
    doc.text(`Dependents: ${personalInfo.dependents}`, 20, 79);
    
    // Income Section
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Income', 20, 95);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(11);
    doc.text(`1. Wages, salaries, tips (W-2 Box 1):`, 25, 105);
    doc.text(`$${(extractedData.w2?.wages || 0).toLocaleString()}`, 150, 105);
    
    if (extractedData.form1099INT?.interest > 0) {
      doc.text(`2a. Tax-exempt interest (1099-INT):`, 25, 113);
      doc.text(`$${extractedData.form1099INT.interest.toLocaleString()}`, 150, 113);
    }
    
    if (extractedData.form1099NEC?.nonemployeeComp > 0) {
      doc.text(`8. Other income (1099-NEC):`, 25, 121);
      doc.text(`$${extractedData.form1099NEC.nonemployeeComp.toLocaleString()}`, 150, 121);
    }
    
    doc.setFont(undefined, 'bold');
    doc.text(`Total Income:`, 25, 135);
    doc.text(`$${taxCalculation.totalIncome.toLocaleString()}`, 150, 135);
    
    // Adjusted Gross Income
    doc.text(`Adjusted Gross Income (AGI):`, 25, 145);
    doc.text(`$${taxCalculation.totalIncome.toLocaleString()}`, 150, 145);
    
    // Deductions
    doc.setFontSize(12);
    doc.text('Deductions', 20, 160);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(11);
    doc.text(`Standard Deduction:`, 25, 170);
    doc.text(`$${taxCalculation.standardDeduction.toLocaleString()}`, 150, 170);
    
    doc.setFont(undefined, 'bold');
    doc.text(`Taxable Income:`, 25, 180);
    doc.text(`$${taxCalculation.taxableIncome.toLocaleString()}`, 150, 180);
    
    // Tax and Credits
    doc.setFontSize(12);
    doc.text('Tax and Credits', 20, 195);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(11);
    doc.text(`Tax (from tax tables):`, 25, 205);
    doc.text(`$${taxCalculation.totalTax.toLocaleString(undefined, {minimumFractionDigits: 2})}`, 150, 205);
    
    // Payments
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Payments', 20, 220);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(11);
    doc.text(`Federal income tax withheld (W-2 Box 2):`, 25, 230);
    doc.text(`$${taxCalculation.totalWithheld.toLocaleString()}`, 150, 230);
    
    // Refund or Amount Owed
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    if (taxCalculation.isRefund) {
      doc.setTextColor(0, 128, 0);
      doc.text('REFUND', 20, 250);
      doc.text(`$${Math.abs(taxCalculation.refundOrOwed).toLocaleString(undefined, {minimumFractionDigits: 2})}`, 150, 250);
    } else {
      doc.setTextColor(200, 50, 0);
      doc.text('AMOUNT YOU OWE', 20, 250);
      doc.text(`$${Math.abs(taxCalculation.refundOrOwed).toLocaleString(undefined, {minimumFractionDigits: 2})}`, 150, 250);
    }
    
    // Footer
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text('Generated by AI Tax Return Agent - For demonstration purposes only', 105, 280, { align: 'center' });
    
    // Save PDF
    doc.save('Form-1040.pdf');
  };

  return (
    <div className="app-container">
      <div className="content-wrapper">
        <div className="card">
          <div className="header">
            <h1>AI Tax Return Agent</h1>
            <p>Automated tax preparation made simple</p>
          </div>

          <div className="main-content">
            <div className="progress-steps">
              {[1, 2, 3, 4].map((s) => (
                <div key={s} className="step-item">
                  <div className={`step-circle ${step >= s ? 'active' : ''}`}>
                    {s}
                  </div>
                  {s < 4 && <div className={`step-line ${step > s ? 'active' : ''}`} />}
                </div>
              ))}
            </div>

            {errors.length > 0 && (
              <div className="alert-error">
                <AlertCircle size={20} />
                <div>
                  <p className="alert-title">Error</p>
                  {errors.map((error, i) => (
                    <p key={i} className="alert-text">{error}</p>
                  ))}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="step-content">
                <h2>Personal Information</h2>
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    value={personalInfo.name}
                    onChange={(e) => setPersonalInfo({...personalInfo, name: e.target.value})}
                    placeholder="John Doe"
                  />
                </div>
                <div className="form-group">
                  <label>SSN</label>
                  <input
                    type="text"
                    value={personalInfo.ssn}
                    onChange={(e) => setPersonalInfo({...personalInfo, ssn: e.target.value})}
                    placeholder="XXX-XX-XXXX"
                    maxLength="11"
                  />
                </div>
                <div className="form-group">
                  <label>Filing Status</label>
                  <select
                    value={personalInfo.filingStatus}
                    onChange={(e) => setPersonalInfo({...personalInfo, filingStatus: e.target.value})}
                  >
                    {Object.entries(filingStatuses).map(([key, val]) => (
                      <option key={key} value={key}>{val.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Number of Dependents</label>
                  <input
                    type="number"
                    value={personalInfo.dependents}
                    onChange={(e) => setPersonalInfo({...personalInfo, dependents: parseInt(e.target.value) || 0})}
                    min="0"
                  />
                </div>
                <button
                  onClick={() => setStep(2)}
                  disabled={!personalInfo.name || !personalInfo.ssn}
                  className="btn-primary"
                >
                  Continue to Upload Documents
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="step-content">
                <h2>Upload Tax Documents</h2>
                <div className="upload-area">
                  <Upload size={48} />
                  <label className="upload-label">
                    <span className="upload-text-primary">Click to upload</span>
                    <span className="upload-text-secondary"> or drag and drop</span>
                    <input
                      type="file"
                      multiple
                      accept=".pdf"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <p className="upload-hint">W-2, 1099-INT, 1099-NEC (PDF)</p>
                </div>

                {files.length > 0 && (
                  <div className="file-list">
                    <h3>Uploaded Files:</h3>
                    {files.map((file, index) => (
                      <div key={index} className="file-item">
                        <div className="file-info">
                          <FileText size={20} />
                          <span>{file.name}</span>
                        </div>
                        <button onClick={() => removeFile(index)} className="btn-remove">
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={extractDataFromFiles}
                  disabled={files.length === 0 || processing}
                  className="btn-primary"
                >
                  {processing ? (
                    <>
                      <Loader className="spin" size={20} />
                      Processing Documents...
                    </>
                  ) : (
                    <>
                      <Calculator size={20} />
                      Extract & Calculate
                    </>
                  )}
                </button>
              </div>
            )}

            {step === 3 && extractedData && (
              <div className="step-content">
                <h2>Extracted Data Review</h2>
                <div className="alert-success">
                  <CheckCircle size={20} />
                  <div>
                    <p className="alert-title">Data successfully extracted!</p>
                    <p className="alert-text">Please review the information below.</p>
                  </div>
                </div>

                <div className="data-cards">
                  {extractedData.w2 && (
                    <div className="data-card">
                      <h3>W-2 Information</h3>
                      <div className="data-grid">
                        <div>
                          <span className="data-label">Wages:</span>
                          <span className="data-value">${extractedData.w2.wages.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="data-label">Federal Withheld:</span>
                          <span className="data-value">${extractedData.w2.federalWithheld.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {extractedData.form1099INT && (
                    <div className="data-card">
                      <h3>1099-INT Information</h3>
                      <div>
                        <span className="data-label">Interest Income:</span>
                        <span className="data-value">${extractedData.form1099INT.interest.toLocaleString()}</span>
                      </div>
                    </div>
                  )}

                  {extractedData.form1099NEC && (
                    <div className="data-card">
                      <h3>1099-NEC Information</h3>
                      <div>
                        <span className="data-label">Nonemployee Compensation:</span>
                        <span className="data-value">${extractedData.form1099NEC.nonemployeeComp.toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>

                <button onClick={calculateTax} className="btn-primary">
                  Calculate Tax Return
                </button>
              </div>
            )}

            {step === 4 && taxCalculation && (
              <div className="step-content">
                <h2>Tax Calculation Results</h2>
                
                <div className={`result-card ${taxCalculation.isRefund ? 'refund' : 'owed'}`}>
                  <p className="result-label">
                    {taxCalculation.isRefund ? 'Estimated Refund' : 'Estimated Amount Owed'}
                  </p>
                  <p className="result-amount">
                    ${Math.abs(taxCalculation.refundOrOwed).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </p>
                </div>

                <div className="breakdown-card">
                  <h3>Detailed Breakdown</h3>
                  <div className="breakdown-item">
                    <span>Total Income</span>
                    <span>${taxCalculation.totalIncome.toLocaleString()}</span>
                  </div>
                  <div className="breakdown-item">
                    <span>Standard Deduction</span>
                    <span>-${taxCalculation.standardDeduction.toLocaleString()}</span>
                  </div>
                  <div className="breakdown-item divider">
                    <span>Taxable Income</span>
                    <span>${taxCalculation.taxableIncome.toLocaleString()}</span>
                  </div>
                  <div className="breakdown-item">
                    <span>Total Tax</span>
                    <span>${taxCalculation.totalTax.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                  <div className="breakdown-item">
                    <span>Federal Withholding</span>
                    <span>-${taxCalculation.totalWithheld.toLocaleString()}</span>
                  </div>
                </div>

                <button onClick={generateForm1040} className="btn-success">
                  <Download size={20} />
                  Download Form 1040 PDF
                </button>

                <button
                  onClick={() => {
                    setStep(1);
                    setFiles([]);
                    setExtractedData(null);
                    setTaxCalculation(null);
                  }}
                  className="btn-secondary"
                >
                  Start New Return
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="disclaimer">
          <AlertCircle size={20} />
          <div>
            <p className="disclaimer-title">Prototype Disclaimer</p>
            <p className="disclaimer-text">
              This is a demonstration prototype using PDF extraction via Python backend (PyMuPDF). In production, this system would integrate with commercial OCR services, IRS e-filing APIs, and secure document storage. All calculations use 2024 tax brackets and standard deductions. Always consult a tax professional for actual tax filing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;