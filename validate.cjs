const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let errors = [];

  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('401') && !msg.text().includes('getRemainingUsage')) {
      console.log('CONSOLE ERROR:', msg.text());
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.message);
    errors.push(err.message);
  });

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const title = await page.title();
  console.log('Page title:', title);

  const body = await page.locator('body').textContent();
  console.log('Body has content:', body.length > 0);

  // Check no critical page errors
  console.log('\n--- ERRORS ---');
  if (errors.length === 0) {
    console.log('PASS: No errors detected');
  } else {
    errors.forEach(e => console.log('FAIL:', e));
  }

  await browser.close();
})();
