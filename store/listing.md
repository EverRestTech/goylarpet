# goylarpet

## Chrome Web Store listing draft

**Name**  
goylarpet

**Summary**  
A free Polymarket parody. Add an amount to Portfolio, Cash or any Profit/Loss period in one Chrome tab.

**Description**

In the timeline where I held.

PARODY · NO REAL MONEY

goylarpet gives your Polymarket portfolio a fictional balance in one desktop Chrome tab. Open your portfolio, click the extension and enter the amount to add to Portfolio, Cash or any of the six Profit/Loss periods. A negative entry subtracts from that field.

If your portfolio is worth $100 and you enter 900, you see $1,000. When the site’s balance drops to $85, you see $985 in that tab.

If your real Year to date result is −$24.18, entering 200 shows $175.82. A further $1 loss brings it to $174.82. Select Disable to restore Polymarket’s latest displayed figures. Reloading the tab also ends the mode. All features are free.

goylarpet is an independent parody. It has no affiliation with Polymarket. It cannot execute trades, change an account balance or transfer money.

**Category and language**  
Just for Fun. The listing and extension interface are in English. The extension reads translated portfolio labels, amounts and time ranges on supported pages. [Store category guidance](https://developer.chrome.com/docs/webstore/best-practices)

**Website and privacy fields**  
Use the verified production homepage and its `/privacy/` page after the Pages project is live.

## Privacy disclosure and single purpose

The extension’s sole purpose is to display fictional USD balances and portfolio profit or loss on supported Polymarket pages at the user’s request. It adds each field’s signed adjustment to the current visible site amount and writes the result to existing text nodes.

- **activeTab** grants temporary access when the user invokes the extension. The popup checks the Polymarket HTTPS origin before running the bundled code.
- **scripting** runs that code in the current top-level document. It discovers balance displays, observes site updates and restores the latest source text on Disable.
- **storage** retains the adjustments for Portfolio, Cash and each P&L period locally. Session storage keeps a tab’s active configuration between documents until the mode ends.

On same-tab navigation, the outgoing document passes the selected field names and a browser-generated history entry ID through the tab's Polymarket session storage. The next document consumes this hint to cover those fields as they appear. Amounts and offsets stay in Chrome extension storage.

The extension handles visible financial balance text locally. It transmits no user data and contains no remote executable code, analytics or advertising. Credentials, wallet keys, payment details and order controls are outside its scope.

## Reviewer instructions

1. In desktop Chrome, open an authorized Polymarket session with visible balances on the portfolio page and invoke goylarpet. The popup initially shows **Off**.
2. Enter 900 for Portfolio and −5 for Cash. Enter a negative value for the selected Profit/Loss period and a positive value for another. Select **Enable in this tab**. Portfolio should increase by $900 and Cash should decrease by $5 from their respective site values.
3. Close the popup and switch between the two periods. Check that each headline equals the site's original total plus the entry for that period. Move the pointer off the plot to read the current total, then explore historical points. The headline should hold its last confirmed total until the period’s actual total changes.
4. Follow another Polymarket link in this tab. Supported header balances keep their offsets. A second tab starts with the mode off. Select **Disable** in the first tab to restore its latest site values.
5. Reapply the values and reload the page. The mode is off. The popup remembers the last amounts locally and lets you apply them again.
6. Run `npm test` from the source checkout to exercise gains, losses, locale changes and DOM replacements on synthetic pages. The website simulator also illustrates the $100 → $85 example.

The 1280 × 800 listing image combines a capture of the actual enabled popup with a labelled synthetic balance display. The disclosure is visible at the top of the image. A 440 × 280 promotional tile carries the same disclosure. The 128 × 128 store icon is included in the ZIP. [Chrome Web Store image guidance](https://developer.chrome.com/docs/webstore/images)

## Launch copy for X

In the timeline where I held.

A free Polymarket parody for Chrome. Add $900 to a $100 portfolio and watch your fictional $1,000 follow the market.

PARODY · NO REAL MONEY

Use the published installation page with [the share image](../site/assets/share.png) once the store listing is live.
