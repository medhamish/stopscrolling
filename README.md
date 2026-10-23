# Stop Scrolling

A minimalist browser extension designed to encourage intentional browsing by blocking distracting websites.

Stop Scrolling helps users regain control of their attention through a simple blocklist, quick-access presets, and a custom interruption page.

## Features

- **Website Blocking** — Block selected domains and their subdomains.
- **Quick Picks** — Add commonly distracting websites with a single click.
- **Custom Block Page** — Replace distracting pages with a gentle reminder to refocus.
- **Persistent Blocklist** — Save and manage blocked websites.
- **Minimal Interface** — A clean, lavender-themed design built for simplicity.

## Tech Stack

- HTML5
- CSS3
- JavaScript
- Chrome Extension Manifest V3

## Installation

1. Download or clone this repository.
2. Extract the project folder if downloaded as a ZIP.
3. Open Google Chrome or Brave.
4. Navigate to `chrome://extensions` or `brave://extensions`.
5. Enable **Developer mode**.
6. Select **Load unpacked**.
7. Choose the project directory containing `manifest.json`.

## Usage

1. Open the Stop Scrolling extension from the browser toolbar.
2. Enter a domain or select one of the quick picks.
3. Add the website to your blocklist.
4. Visit the domain in a new tab to verify blocking.
5. Remove a domain from the blocklist when access is needed again.

## Project Structure

```text
stop-scrolling/
├── manifest.json
├── background.js
├── shared.js
├── popup.html
├── popup.css
├── popup.js
├── blocked.html
├── blocked.css
├── blocked.js
└── icons/
```

## Roadmap

- Pomodoro focus timer
- Focus session statistics
- Temporary website access
- Productivity insights

## Author

**Medha Mishra**

Built to explore browser extension development and promote more intentional digital habits.
