const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

const { 
  loadExistingData, 
  ensureDirectoryExists, 
  checkContentType,
  hashUrl,
  checkFilesExist,
  updateIndexFiles 
} = require('./utils');
const { processDocument } = require('./documentProcessor');

const failedUrls = [];

function recordFailure(url, error, urlMap) {
  failedUrls.push({
    url,
    error: error.message,
    timestamp: new Date().toISOString()
  });
  updateIndexFiles(urlMap, failedUrls).catch(console.error);
}

async function takeScreenshots() {
  console.log('Starting document processing script...\n');
  
  // Load existing data
  const { existingUrlMap, existingFailures } = await loadExistingData();
  const urlMap = { ...existingUrlMap };
  failedUrls.push(...existingFailures);

  // Read URLs from JSON file
  console.log('Reading URLs from urls.json...');
  const urls = JSON.parse(await fs.readFile('./urls.json', 'utf-8'));
  console.log(`Found ${urls.length} URLs to process\n`);

  // Filter out already successfully processed URLs
  const urlsToProcess = urls.filter(url => !urlMap[url]);
  console.log(`${urlsToProcess.length} URLs need processing\n`);
  
  // Set up paths for extensions and output directories
  const pathToIDontCareAboutCookies = path.join(__dirname, 'extensions', 'ISDCAC');
  const screenshotsDir = './out/screenshots';
  const htmlDir = './out/html';
  const textDir = './out/text';
  const docDir = './out/doc';
  
  // Ensure output directories exist
  console.log('Creating output directories...');
  await Promise.all([
    ensureDirectoryExists(screenshotsDir),
    ensureDirectoryExists(htmlDir),
    ensureDirectoryExists(textDir),
    ensureDirectoryExists(docDir)
  ]);
  console.log('✓ All directories ready\n');
  
  // Launch browser
  console.log('Launching browser...');
  const userDataDir = path.join(__dirname, 'out/data-dir');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${pathToIDontCareAboutCookies}`,
      `--load-extension=${pathToIDontCareAboutCookies}`
    ]
  });
  console.log('✓ Browser launched successfully\n');

  // Add graceful shutdown handler
  let isShuttingDown = false;
  async function handleShutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('\n\nGraceful shutdown initiated...');
    await updateIndexFiles(urlMap, failedUrls);
    await context.close();
    console.log('Browser closed. Script can be safely restarted.');
    process.exit(0);
  }

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);

  let processed = 0;

  try {
    for (const url of urlsToProcess) {
      if (isShuttingDown) break;
      
      processed++;
      console.log(`\n[${processed}/${urlsToProcess.length}] Processing: ${url}`);
      const fileHash = hashUrl(url);
      
      try {
        const contentType = await checkContentType(url);
        
        if (contentType.includes('pdf') || contentType.includes('word')) {
          console.log(`📄 Document detected (${contentType})`);
          urlMap[url] = await processDocument(url, fileHash, docDir, textDir);
          console.log('✓ Document processing complete');
          await updateIndexFiles(urlMap, failedUrls);
          continue;
        }
        
        if (!contentType.includes('html')) {
          console.log(`⚠️ Skipping non-HTML content: ${contentType}`);
          recordFailure(url, new Error(`Unsupported content type: ${contentType}`), urlMap);
          continue;
        }

        console.log('🌐 Processing as webpage...');
        const files = {
          screenshot: path.join(screenshotsDir, `${fileHash}.png`),
          html: path.join(htmlDir, `${fileHash}.html`),
          text: path.join(textDir, `${fileHash}.txt`)
        };

        if (await checkFilesExist(files)) {
          console.log('⏭️ Files already exist, skipping...');
          urlMap[url] = {
            screenshot: `${fileHash}.png`,
            html: `${fileHash}.html`,
            text: `${fileHash}.txt`
          };
          await updateIndexFiles(urlMap, failedUrls);
          continue;
        }

        const page = await context.newPage();
        await Promise.race([
          (async () => {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });
            await page.screenshot({ path: files.screenshot, fullPage: true });
            const html = await page.content();
            await fs.writeFile(files.html, html);
            
            const text = await page.evaluate(() => {
              const scripts = document.querySelectorAll('script, style');
              scripts.forEach(script => script.remove());
              return document.body.innerText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line)
                .join('\n');
            });
            await fs.writeFile(files.text, text);

            urlMap[url] = {
              screenshot: `${fileHash}.png`,
              html: `${fileHash}.html`,
              text: `${fileHash}.txt`
            };
            
            await updateIndexFiles(urlMap, failedUrls);
          })(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        await page.close();
        console.log('✓ Page processing complete');
      } catch (error) {
        if (error.message === 'Timeout') {
          console.error(`❌ Timeout occurred while processing ${url}`);
          recordFailure(url, new Error('Processing timeout'), urlMap);
        } else {
          console.error(`❌ Error processing ${url}: ${error.message}`);
          recordFailure(url, error, urlMap);
        }
      }    
    }
  } finally {
    const totalSuccessful = Object.keys(urlMap).length;
    console.log(`\n✨ Processing complete:`);
    console.log(`- Total URLs: ${urlsToProcess.length}`);
    console.log(`- Newly processed: ${processed}`);
    console.log(`- Total successful: ${totalSuccessful}`);
    console.log(`- Total failed: ${failedUrls.length}`);
    
    await context.close();
  }
}

takeScreenshots().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});