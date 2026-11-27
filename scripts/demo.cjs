const { browser, offlinePortfolio } = require('../tests/browser.cjs');

async function openDemo() {
  const context = await browser({ headless: false });
  try {
    await offlinePortfolio(context);
    const page = context.pages()[0];
    await page.goto('https://polymarket.com/portfolio');
    console.log('Local recording window is ready. Open goylarpet from the Chrome extensions menu.');
    // Closing the recording tab also releases the temporary Chrome profile.
    page.once('close', () => context.close().catch(() => {}));
  } catch (error) {
    await context.close();
    throw error;
  }
}

openDemo().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
