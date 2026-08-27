const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const screenshotDir = path.join(__dirname, 'verification');
    const screenshotInitial = path.join(screenshotDir, 'initial.png');
    const screenshotFinal = path.join(screenshotDir, 'final.png');

    try {
        console.log('Navigating to http://localhost:3000');
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
        await page.screenshot({ path: screenshotInitial });

        const urlInput = await page.waitForSelector('#videoUrl', { timeout: 10000 });
        await urlInput.type('https://www.youtube.com/watch?v=CgEOtoJieHM');
        console.log('URL entered.');

        // The format selector is a div, so we click on the desired format
        await page.click('div[data-format="mp3"]');
        console.log('Format selected.');

        await page.click('button');
        console.log('Download button clicked.');

        await page.waitForSelector('#status', { timeout: 10000 });
        console.log('Download link appeared.');

        await page.screenshot({ path: screenshotFinal });
        console.log('Test successful, screenshots saved.');
    } catch (error) {
        console.error('Test failed:', error);
        await page.screenshot({ path: path.join(screenshotDir, 'error.png') });
    } finally {
        await browser.close();
    }
})();
