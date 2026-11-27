# goylarpet

goylarpet is a free parody extension for Polymarket in desktop Chrome. Enter an amount to add to Portfolio, Cash or a chart period’s profit or loss in one tab. With a $900 adjustment, a real $100 balance displays as $1,000. If the site balance drops to $85, the display updates to $985.

## Release status

Version 0.4.6 is a release candidate. Chrome Web Store submission is pending. Browser tests exercise the action popup, localized portfolios and the first frames of a chart or page transition. Verification against the signed-in portfolio is pending. The [installation page](https://goylarpet.pages.dev/download/) shows the current store status and will link to the approved listing.

## Run locally

The extension and website use plain HTML, CSS and JavaScript. Both run directly from source.

1. For extension development, open `chrome://extensions` in a development profile, enable Developer mode and use **Load unpacked** to select `extension/`.
2. From the repository root, run `python3 -m http.server 4173 --bind 127.0.0.1 --directory site`. Visit `http://127.0.0.1:4173/` to preview the landing page. The installation and privacy pages are at `/download/` and `/privacy/`.

When upgrading an unpacked build from 0.2.3 or earlier, click **Reload** on the goylarpet card in `chrome://extensions`, then refresh any portfolio tab where goylarpet was active. This removes the previous build’s page script. Reopen the popup and click **Enable in this tab** to use your saved settings.

To run the browser tests, use Node.js 22+ and a Chrome for Testing build with the CDP Extensions domain.

```sh
npm ci
npx playwright-core install chromium
npm test
```

The tests launch a temporary Chrome profile, load the production manifest, open the actual action popup and fulfill portfolio navigations from a local fixture. DNS resolution is disabled in that profile. To use an existing Chrome for Testing binary, set `CHROME_FOR_TESTING` to its executable path.

To record a demo, run `npm run demo` after the browser setup above. It opens a separate Chrome for Testing window with the extension and a local portfolio. Open goylarpet from the extensions menu, enter 900 under Portfolio and click **Enable in this tab**. Close the popup. Click **Simulate −$15** to see $1,000 drop to $985. Reload the tab. It still shows $985. Click **Simulate +$25** to see $1,010, then **Disable** to reveal the underlying $110. Close the recording tab when you finish.

## Using the popup

Open Portfolio on Polymarket and click goylarpet. For Portfolio, Cash or any of the six Profit/Loss periods, enter the amount to add to the current site value. A negative entry subtracts from it. Leave a field empty to skip it, then click **Enable in this tab**.

The mode stays on in that tab when you reload, follow a Polymarket link or switch to another tab and back. Each Polymarket tab has its own on/off state and adjustments. Click **Disable** to restore the latest site values and turn the mode off for that tab.

If the site's Year to date total is −$24.18 and you enter 200, the chart headline shows $175.82. If the total falls to −$25.18, the headline shows $174.82. Enabling saves the adjustments for all fields you filled in, including periods you have yet to open.

The chart shows the selected period’s adjusted total as soon as its value is readable. Move the pointer off the plot to read the current total. While Polymarket loads a period or previews a historical point, the headline keeps its last confirmed adjusted amount. A dash appears while a configured display is waiting for its first usable total or the tab's settings. Disable restores the exact text the site last supplied.

When you enable a tab after upgrading to 0.4.0, the numbers already in your fields become the adjustments. For example, a saved Portfolio entry of 1,000 now adds $1,000 to the site balance. To display $1,000 when the site shows $100, enter 900.

All fields accept positive amounts, negative amounts or zero, with up to two decimal places. The popup accepts local separators and US dollar formatting and calculates in integer cents. Each copy of a balance uses the same adjustment whenever its own site value updates. The popup reports ambiguous values and unknown formats.

Large Profit/Loss totals use the full currency format whenever it fits beside the chart controls. In a narrow row the extension can omit grouping separators or use an exact localized abbreviation such as `$100M`. Values with cents retain their full precision.

## Extension structure

- [Language map](extension/locales.js) lists portfolio, cash, Profit/Loss and interval labels. It covers English, Russian, Spanish, French, German, Italian, Portuguese, Dutch, Polish, Ukrainian, Turkish, Japanese, Korean, simplified and traditional Chinese, Vietnamese, Indonesian, Malay, Hindi, Arabic, Thai, Hebrew, Romanian, Swedish and Persian. Localized controls and controls left in English share stable period identifiers.
- [DOM rules](extension/balances.js) associate localized labels with amounts in the header, portfolio summary and Profit/Loss chart. The Russian header’s «Наличные» and the summary’s «Доступно для торговли» both map to Cash in the English popup. The popup lists one signed Profit/Loss adjustment per chart period in a single column.
- [Tab controller](extension/tab.js) discovers replacement regions, observes text within supported regions and changes only `Text.data`. It disconnects the observer during its own writes and retains the exact latest site string for each copy. Disable restores those strings and stops observation.
- [Navigation worker](extension/navigation.js) and [document startup](extension/document-start.js) resume an enabled tab on page reloads and same-origin links. Chrome starts the reader at `document_start` under the existing tab grant. Single-page navigation is handled in the document.

## Permissions and local data

| Permission | Purpose |
| --- | --- |
| `activeTab` | Grants access to the user-invoked tab. The extension checks the exact HTTPS Polymarket origin and operates in the top-level document. |
| `scripting` | Runs the packaged balance reader and controller in Chrome’s isolated world. |
| `storage` | Saves the entered adjustments for Portfolio, Cash and individual chart periods in `chrome.storage.local`. |

Original strings live in document memory. The active profile and Chrome's tab and document identifiers live in `chrome.storage.session`. Disable, tab closure and loss of access end the session. On reloads and same-origin links, the outgoing page briefly places the configured field names and a browser-generated history entry ID in the tab’s Polymarket `sessionStorage`. The incoming page consumes that hint immediately so it can cover those fields while the worker checks the tab and supplies the adjustments. All amounts stay in extension storage.

Closing Chrome clears session storage. The extension has no host permissions, external services, analytics, order-entry code or wallet integration. Uninstalling it deletes its local settings. The public privacy description is in [site/privacy](site/privacy/index.html).

## Store package and site publication

```sh
python3 scripts/package.py
```

This builds a reproducible `dist/goylarpet-<version>.zip` with `manifest.json` at the root. The ZIP is for the store dashboard. Build output is ignored by Git and sits outside the Pages directory. [Listing copy and reviewer notes](store/listing.md) accompany the [store screenshot](store/screenshot-01.png).

Cloudflare Pages publishes the static files in `site/` to [goylarpet.pages.dev](https://goylarpet.pages.dev/) when changes reach `main` in `EverRestTech/goylarpet`. The project uses the repository root and has no build command. [Cloudflare GitHub integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)

Set the approved public store listing in [the release links](site/assets/release.js) to point every Install link straight to Chrome Web Store. The same file accepts an official X profile and an optional demo video path. Place a web-optimized H.264 MP4 under `site/assets/` and set `demoVideo` to its public path to show the player. Update the static status on the download page after submission or a review decision. Chrome Web Store handles installs and updates.

Only the author’s confirmed receiving addresses belong in [the pair list](site/assets/pairs.js). Each entry has an independent address and confirmation flag. The browser tests select and copy all ten pairs using deliberately non-payable test strings served in memory.

The locally hosted token illustrations come from [Cryptocurrency Icons](https://github.com/spothq/cryptocurrency-icons) (CC0).

After the owner grants Search Console access, add the actual HTTPS origin as a URL-prefix property, place Google’s issued HTML verification file at the root of `site/`, deploy, verify and submit `sitemap.xml`.
