
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Navigate to the local server
    await page.goto('http://localhost:3000');

    // Take a screenshot to verify rendering
    await page.screenshot({ path: 'verification/initial.png' });

    // Wait for the URL input field to be visible
    await page.waitForSelector('#videoUrl', { timeout: 10000 });

    // Type a video URL into the input field
    await page.type('#videoUrl', 'https://www.youtube.com/watch?v=CgEOtoJieHM');

    // Wait for the download to start
    const [ download ] = await Promise.all([
      page.waitForEvent('download'),
      // Click the download button to trigger the download
      page.click('button')
    ]);

    // Wait for the download to complete
    const path = await download.path();

    console.log(`Download complete. File saved to: ${path}`);

    // Take a final screenshot
    await page.screenshot({ path: 'verification/final.png' });

  } catch (error) {
    console.error('Verification failed:', error);
    await page.screenshot({ path: 'verification/error.png' });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
