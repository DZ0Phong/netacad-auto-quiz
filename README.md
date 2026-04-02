# NetAcad Auto Quiz Assistant

NetAcad Auto Quiz Assistant is a Chrome extension for Cisco NetAcad pages. It detects quiz questions, extracts answer choices, sends them through Puter AI, and shows suggested answers directly on the page.

## Features

- Scrapes multiple-choice questions from dynamic NetAcad pages and shadow DOM content
- Supports single-answer and multi-answer questions
- Sends a whole page of questions in one batch request when possible
- Lets you refresh the AI result for an individual question
- Watches page changes and can auto-process after navigation
- Uses Puter sign-in instead of asking users to paste an API key

## Current Stack

- JavaScript
- Chrome Extension Manifest V3
- Puter.js for auth and AI access
- MutationObserver plus shadow DOM traversal for NetAcad content detection

## Setup

1. Download or clone this repository.
2. Open `chrome://extensions/`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select this project folder.

## How To Use

1. Open the extension popup.
2. Click `Sign In With Puter`.
3. Finish the Puter login flow in the tab that opens.
4. Open a supported NetAcad quiz page.
5. Click `Process Questions on This Page`, or press `Alt+Shift+Q`.

## How It Works

- The content script scans NetAcad page structure and shadow roots for MCQ blocks.
- Extracted questions are grouped and sent to the extension background worker.
- The background worker uses Puter AI to request answers.
- The UI layer injects the returned suggestions under each detected question.

## Project Structure

- `manifest.json`: extension config and permissions
- `popup.html` / `popup.js`: popup UI and actions
- `auth.html` / `auth.js`: Puter sign-in flow
- `background.js`: shared Puter session handling and AI requests
- `content.js`: page observer and messaging bridge
- `scraper.js`: question collection flow
- `ui.js`: answer rendering and on-page controls
- `api.js`: content-to-background AI request wrapper
- `vendor/puter.js`: local Puter.js bundle

## Session Storage

The extension stores the Puter auth session in Chrome extension storage so popup, background, and page logic can share the same signed-in state.

## Maintainer

- Maintained by `DZ0Phong`

## Notes

- This project includes a local bundled copy of Puter.js.
- Third-party ownership and copyright for vendored libraries are preserved.

## Third-Party

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
