const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

async function loadExistingData() {
  const files = {
    index: path.join('./out', 'index.json'),
    failed: path.join('./out', 'failed_urls.json')
  };
  
  let existingUrlMap = {};
  let existingFailures = [];
  
  try {
    if (await fileExists(files.index)) {
      console.log('Loading existing index data...');
      const content = await fs.readFile(files.index, 'utf-8');
      existingUrlMap = JSON.parse(content);
      console.log(`Found ${Object.keys(existingUrlMap).length} existing processed URLs`);
    }
  } catch (error) {
    console.error('Error loading index.json:', error.message);
  }
  
  try {
    if (await fileExists(files.failed)) {
      console.log('Loading existing failed URLs data...');
      const content = await fs.readFile(files.failed, 'utf-8');
      existingFailures = JSON.parse(content);
      console.log(`Found ${existingFailures.length} existing failed URLs`);
    }
  } catch (error) {
    console.error('Error loading failed_urls.json:', error.message);
  }
  
  return { existingUrlMap, existingFailures };
}

async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

function hashUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

async function ensureDirectoryExists(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`✓ Ensured directory exists: ${dirPath}`);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

async function checkContentType(url) {
  try {
    console.log(`Checking content type for: ${url}`);
    const response = await fetch(url, { method: 'HEAD' });
    const contentType = response.headers.get('content-type')?.toLowerCase() || '';
    console.log(`Content type: ${contentType}`);
    return contentType;
  } catch (error) {
    console.error(`❌ Error checking content type for ${url}: ${error.message}`);
    return '';
  }
}

async function downloadFile(url, filePath) {
  console.log(`Downloading file: ${url}`);
  console.log(`Saving to: ${filePath}`);
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.writeFile(filePath, buffer);
  console.log(`✓ File downloaded successfully (${buffer.length} bytes)`);
  return buffer;
}

async function extractTextFromPdf(buffer) {
  console.log('Extracting text from PDF...');
  const data = await pdf(buffer);
  console.log(`✓ Extracted ${data.text.length} characters of text from PDF`);
  return data.text;
}

async function extractTextFromDoc(buffer) {
  console.log('Extracting text from Word document...');
  const result = await mammoth.extractRawText({ buffer });
  console.log(`✓ Extracted ${result.value.length} characters of text from Word document`);
  return result.value;
}

async function checkFilesExist(files) {
  const existsArray = await Promise.all(
    Object.values(files).map(filePath => fileExists(filePath))
  );
  return existsArray.every(exists => exists);
}

async function updateIndexFiles(urlMap, failedUrls) {
  try {
    await Promise.all([
      fs.writeFile(
        path.join('./out', 'index.json'), 
        JSON.stringify(urlMap, null, 2)
      ),
      fs.writeFile(
        path.join('./out', 'failed_urls.json'),
        JSON.stringify(failedUrls, null, 2)
      )
    ]);
    console.log('✓ Index files updated');
  } catch (error) {
    console.error('Error updating index files:', error.message);
  }
}

module.exports = {
  loadExistingData,
  fileExists,
  hashUrl,
  ensureDirectoryExists,
  checkContentType,
  downloadFile,
  extractTextFromPdf,
  extractTextFromDoc,
  checkFilesExist,
  updateIndexFiles
};