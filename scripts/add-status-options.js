/**
 * Standalone Playwright script to add Status field options in Airtable
 * Runs in isolated mode to avoid conflicts with other Playwright instances
 */

const { chromium } = require('playwright');

async function addStatusOptions() {
  console.log('Starting Playwright in isolated mode...');

  // Launch browser in isolated mode
  const browser = await chromium.launch({
    headless: false, // Show browser so we can see what's happening
    channel: 'chrome' // Use regular Chrome
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Navigating to Service Records table...');
    await page.goto('https://airtable.com/appm7zo5vOf3c3rqm/tblEEHaoicXQA7NcL/viw07dqEdRbe3mtp3');

    // Wait for page to load
    await page.waitForTimeout(5000);

    console.log('Looking for Status column header...');

    // Try to find and click Status column header
    // Method 1: Click on the Status column header text
    try {
      await page.locator('text=Status').first().click();
      console.log('Clicked Status column header');
      await page.waitForTimeout(2000);

      // Look for "Customize field type" button or similar
      const customizeButton = page.locator('button:has-text("Customize field type")');
      if (await customizeButton.isVisible({ timeout: 2000 })) {
        await customizeButton.click();
        console.log('Clicked Customize field type');
        await page.waitForTimeout(2000);
      }

      // Look for options area or "Add option" button
      const addOptionButton = page.locator('button:has-text("Add option")').or(page.locator('text=Add option'));
      if (await addOptionButton.isVisible({ timeout: 2000 })) {
        // Add "Active" option
        console.log('Adding "Active" option...');
        await addOptionButton.click();
        await page.waitForTimeout(500);

        // Type "Active" in the input field
        const optionInput = page.locator('input[placeholder*="option"], input[placeholder*="Option"]').first();
        await optionInput.fill('Active');
        await page.keyboard.press('Enter');
        console.log('Added "Active" option');
        await page.waitForTimeout(1000);

        // Add "Completed" option
        console.log('Adding "Completed" option...');
        await addOptionButton.click();
        await page.waitForTimeout(500);
        await optionInput.fill('Completed');
        await page.keyboard.press('Enter');
        console.log('Added "Completed" option');
        await page.waitForTimeout(1000);

        // Save/close
        const saveButton = page.locator('button:has-text("Save")').or(page.locator('button:has-text("Done")'));
        if (await saveButton.isVisible({ timeout: 2000 })) {
          await saveButton.click();
          console.log('Clicked Save button');
        }

        console.log('✅ Successfully added Status field options!');
      } else {
        console.log('Could not find "Add option" button');
        console.log('You may need to manually add options through the Airtable UI');
      }

    } catch (error) {
      console.error('Error interacting with Status field:', error.message);
      console.log('\n📋 Manual steps to complete:');
      console.log('1. In the browser window that opened, click on the "Status" column header');
      console.log('2. Click "Customize field type" button');
      console.log('3. Click "Add option" and type "Active", press Enter');
      console.log('4. Click "Add option" again and type "Completed", press Enter');
      console.log('5. Click "Save" or close the dialog');
    }

    // Keep browser open for 30 seconds so user can verify or complete manually
    console.log('\nBrowser will stay open for 30 seconds...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
    console.log('Browser closed');
  }
}

// Run the script
addStatusOptions().catch(console.error);
