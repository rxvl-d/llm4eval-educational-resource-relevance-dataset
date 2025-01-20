const path = require('path');
const { downloadFile, checkContentType, extractTextFromPdf, extractTextFromDoc } = require('./utils');
const fs = require('fs').promises;

async function processDocument(url, fileHash, docDir, textDir) {
  console.log('\n📄 Processing document...');
  const contentType = await checkContentType(url);
  const extension = contentType.includes('pdf') ? '.pdf' : 
                    contentType.includes('word') ? '.docx' : '.bin';
  
  const docPath = path.join(docDir, `${fileHash}${extension}`);
  const textPath = path.join(textDir, `${fileHash}.txt`);
  
  // Download the file
  const buffer = await downloadFile(url, docPath);
  
  // Extract text based on file type
  let text;
  if (contentType.includes('pdf')) {
    text = await extractTextFromPdf(buffer);
  } else if (contentType.includes('word')) {
    text = await extractTextFromDoc(buffer);
  } else {
    throw new Error(`Unsupported document type: ${contentType}`);
  }
  
  // Save extracted text
  await fs.writeFile(textPath, text);
  console.log(`✓ Saved extracted text to: ${textPath}`);
  
  return {
    document: path.basename(docPath),
    text: `${fileHash}.txt`
  };
}

module.exports = { processDocument };