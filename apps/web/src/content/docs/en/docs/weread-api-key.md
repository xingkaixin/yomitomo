---
title: Get a WeRead API Key
description: Generate an official WeRead Skill API key via web or mobile app, then link and test your credentials in Yomitomo.
---

WeRead note synchronization relies on the official WeRead Skill API. Simply generate a private API Key and paste it into Yomitomo under **Settings > Data sources > WeRead** to enable secure, incremental synchronization.

## Method 1: Web Browser

1. Open the official <a href="https://weread.qq.com/r/weread-skills" target="_blank" rel="noopener noreferrer">WeRead Skill Portal</a> in your browser.
2. Click **Quick Configuration** in the center of the page.
3. Sign in using your WeRead account (QR code scan).
4. In the **Get API Key** section, click to generate a new key, or copy your existing one.
5. Return to Yomitomo, navigate to **Settings > Data sources > WeRead**, paste the key, and click **Save**.

<picture>
  <img
    src="/assets/weread-api-key-web-quick-config.webp"
    alt="Initial WeRead Skill web page with the quick configuration entry"
    loading="eager"
    decoding="async"
  />
</picture>

<picture>
  <img
    src="/assets/weread-api-key-web-created.webp"
    alt="WeRead Skill web page after an API key has been created"
    loading="lazy"
    decoding="async"
  />
</picture>

## Method 2: Mobile App

1. Open the **WeRead** app on your phone and ensure you are logged in.
2. Tap the **Me** tab at the bottom right.
3. Tap the menu/settings icon in the top right corner.
4. Scroll down through Settings to find and select **WeRead Skill**.
5. Scroll to the **Get API Key** section.
6. Generate or copy your API Key.
7. Return to Yomitomo, paste the key into **Settings > Data sources > WeRead**, and click **Save**.

<picture>
  <img
    src="/assets/weread-api-key-app-me-tab.webp"
    alt="The Me tab in the WeRead mobile app"
    loading="lazy"
    decoding="async"
  />
</picture>

<picture>
  <img
    src="/assets/weread-api-key-app-skill-entry.webp"
    alt="WeRead Skill entry in the mobile app settings"
    loading="lazy"
    decoding="async"
  />
</picture>

<picture>
  <img
    src="/assets/weread-api-key-app-created.webp"
    alt="WeRead Skill page in the mobile app after an API key has been created"
    loading="lazy"
    decoding="async"
  />
</picture>

## Verify and Test Connection

After saving your key in **Settings > Data sources > WeRead**, click **Test connection**. Once verified, return to the Library and click **Sync WeRead** to bring your books, highlights, and thoughts into your local library. In the same settings section, you can also choose **Open the web version in Yomitomo** to jump to passages or read inside the app.

## Troubleshooting

| Issue | What to check |
| --- | --- |
| **WeRead Skill** is missing in the mobile app | Use the official web portal above first and check for mobile app updates. Availability depends on WeRead's official page. |
| Authorization fails after saving | Make sure the full key was copied with no leading or trailing spaces. If you reset the key on WeRead, save the new value in Yomitomo. |
| Connection succeeds but expected notes are missing | Verify which WeChat/WeRead account generated the key and check that the highlights and thoughts exist in WeRead. |
| Request times out or hits rate limits | Confirm the official WeRead Skill page loads in your browser, then retry later. Avoid triggering repeated syncs back to back. |

Your API key is an account credential—do not include it in public screenshots or bug reports. Yomitomo uses the official WeRead Skill API, but cannot guarantee indefinite third-party API availability or that WeRead will never apply account limits.

## What You Can Do Next

Follow the [WeRead Notes Sync Guide](/en/blog/scenarios/weread-migration/) to review synced books, export Markdown, and understand backup scope.

<a href="/en/#download" data-umami-event="download_section_click" data-umami-event-language="en" data-umami-event-placement="guide">Download Yomitomo to keep your WeRead highlights and thoughts locally</a>.
