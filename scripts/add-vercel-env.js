/**
 * Automated Vercel Environment Variable Setup
 * Adds CUSTOMER_HISTORY_TABLE_ID to all environments
 */

const { chromium } = require('playwright');

async function addVercelEnvVar() {
  console.log('🚀 Starting Vercel environment variable automation...\n');

  const browser = await chromium.launch({
    headless: false,  // Show browser for debugging
    slowMo: 1000      // Slow down by 1 second per action
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 1: Navigate to Vercel dashboard
    console.log('📍 Step 1: Navigating to Vercel dashboard...');
    await page.goto('https://vercel.com/dashboard');
    await page.waitForLoadState('networkidle');

    // Wait a moment to see if we're logged in
    await page.waitForTimeout(2000);

    // Check if we need to log in
    const loginButton = await page.locator('text=Log in').first().isVisible().catch(() => false);

    if (loginButton) {
      console.log('⚠️  Not logged in. Please log in to Vercel in the browser window.');
      console.log('   The script will wait for you to complete login...');

      // Wait for login to complete (wait for dashboard to load)
      await page.waitForURL('**/dashboard', { timeout: 120000 }); // 2 minute timeout
      console.log('✅ Login detected, continuing...');
    } else {
      console.log('✅ Already logged in');
    }

    // Step 2: Navigate to project
    console.log('\n📍 Step 2: Navigating to restaurant-ai-mcp project...');
    await page.goto('https://vercel.com/stefanogebaras-projects/restaurant-ai-mcp/settings/environment-variables');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Step 3: Check if variable already exists
    console.log('\n📍 Step 3: Checking if CUSTOMER_HISTORY_TABLE_ID already exists...');
    const existingVar = await page.locator('text=CUSTOMER_HISTORY_TABLE_ID').first().isVisible().catch(() => false);

    if (existingVar) {
      console.log('⚠️  CUSTOMER_HISTORY_TABLE_ID already exists!');
      console.log('   Skipping creation. If you need to update it, delete the existing one first.');
      await browser.close();
      return;
    }

    // Step 4: Click "Add New" button
    console.log('\n📍 Step 4: Clicking "Add New" button...');

    // Try different selectors for the Add button
    const addButtonSelectors = [
      'button:has-text("Add New")',
      'button:has-text("Add")',
      '[data-testid="add-env-button"]',
      'button.geist-button:has-text("Add")'
    ];

    let addButtonClicked = false;
    for (const selector of addButtonSelectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 2000 })) {
          await button.click();
          addButtonClicked = true;
          console.log(`✅ Clicked add button using selector: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!addButtonClicked) {
      console.error('❌ Could not find "Add New" button. Please add manually.');
      console.log('   Go to: https://vercel.com/stefanogebaras-projects/restaurant-ai-mcp/settings/environment-variables');
      console.log('   Click "Add New" and enter:');
      console.log('   Name: CUSTOMER_HISTORY_TABLE_ID');
      console.log('   Value: tblqK1ajV5sqICWn2');
      await page.screenshot({ path: 'vercel-env-page.png' });
      console.log('   Screenshot saved to: vercel-env-page.png');
      await browser.close();
      return;
    }

    await page.waitForTimeout(1000);

    // Step 5: Fill in the variable name
    console.log('\n📍 Step 5: Entering variable name...');

    const nameInputSelectors = [
      'input[name="key"]',
      'input[placeholder*="NAME"]',
      'input[placeholder*="Key"]',
      'input[type="text"]'
    ];

    let nameInputFilled = false;
    for (const selector of nameInputSelectors) {
      try {
        const input = page.locator(selector).first();
        if (await input.isVisible({ timeout: 2000 })) {
          await input.fill('CUSTOMER_HISTORY_TABLE_ID');
          nameInputFilled = true;
          console.log('✅ Entered variable name');
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!nameInputFilled) {
      console.error('❌ Could not find name input field');
      await page.screenshot({ path: 'vercel-add-dialog.png' });
      console.log('   Screenshot saved to: vercel-add-dialog.png');
    }

    await page.waitForTimeout(500);

    // Step 6: Fill in the value
    console.log('\n📍 Step 6: Entering variable value...');

    const valueInputSelectors = [
      'input[name="value"]',
      'textarea[name="value"]',
      'input[placeholder*="value"]',
      'textarea[placeholder*="value"]'
    ];

    let valueInputFilled = false;
    for (const selector of valueInputSelectors) {
      try {
        const input = page.locator(selector).first();
        if (await input.isVisible({ timeout: 2000 })) {
          await input.fill('tblqK1ajV5sqICWn2');
          valueInputFilled = true;
          console.log('✅ Entered variable value');
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!valueInputFilled) {
      console.error('❌ Could not find value input field');
      await page.screenshot({ path: 'vercel-add-dialog-2.png' });
      console.log('   Screenshot saved to: vercel-add-dialog-2.png');
    }

    await page.waitForTimeout(500);

    // Step 7: Select all environments (Production, Preview, Development)
    console.log('\n📍 Step 7: Selecting all environments...');

    const environments = ['Production', 'Preview', 'Development'];
    for (const env of environments) {
      try {
        const checkbox = page.locator(`label:has-text("${env}")`).locator('input[type="checkbox"]');
        if (await checkbox.isVisible({ timeout: 2000 })) {
          const isChecked = await checkbox.isChecked();
          if (!isChecked) {
            await checkbox.check();
            console.log(`✅ Checked ${env}`);
          } else {
            console.log(`   ${env} already checked`);
          }
        }
      } catch (e) {
        console.log(`⚠️  Could not check ${env} checkbox`);
      }
    }

    await page.waitForTimeout(500);

    // Step 8: Click Save button
    console.log('\n📍 Step 8: Clicking Save button...');

    const saveButtonSelectors = [
      'button:has-text("Save")',
      'button[type="submit"]',
      'button.geist-button:has-text("Save")'
    ];

    let saveButtonClicked = false;
    for (const selector of saveButtonSelectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 2000 })) {
          await button.click();
          saveButtonClicked = true;
          console.log('✅ Clicked Save button');
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!saveButtonClicked) {
      console.error('❌ Could not find Save button');
      await page.screenshot({ path: 'vercel-save-dialog.png' });
      console.log('   Screenshot saved to: vercel-save-dialog.png');
    }

    // Wait for save to complete
    await page.waitForTimeout(3000);

    // Step 9: Verify variable was added
    console.log('\n📍 Step 9: Verifying variable was added...');
    await page.reload();
    await page.waitForLoadState('networkidle');

    const varAdded = await page.locator('text=CUSTOMER_HISTORY_TABLE_ID').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (varAdded) {
      console.log('✅ Variable successfully added!');
    } else {
      console.log('⚠️  Could not verify variable was added. Please check manually.');
    }

    // Step 10: Take final screenshot
    await page.screenshot({ path: 'vercel-env-final.png', fullPage: true });
    console.log('📸 Final screenshot saved to: vercel-env-final.png');

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              ✅ ENVIRONMENT VARIABLE ADDED                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Variable: CUSTOMER_HISTORY_TABLE_ID');
    console.log('Value: tblqK1ajV5sqICWn2');
    console.log('Environments: Production, Preview, Development');
    console.log('');
    console.log('Next step: Trigger a redeploy for changes to take effect');
    console.log('');

  } catch (error) {
    console.error('\n❌ Error during automation:', error.message);
    await page.screenshot({ path: 'vercel-error.png' });
    console.log('   Screenshot saved to: vercel-error.png');
  } finally {
    console.log('\nClosing browser in 5 seconds...');
    await page.waitForTimeout(5000);
    await browser.close();
  }
}

// Run the automation
addVercelEnvVar().catch(console.error);
