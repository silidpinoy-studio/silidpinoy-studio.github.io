# SilidPinoy Studio

Free, browser-based tools for Filipino teachers. SilidPinoy Studio turns the
paperwork side of teaching — tables of specifications, tests, lesson plans,
slide decks, and activity sheets — into a few minutes of typing instead of an
afternoon of formatting.

Everything runs in the browser. There is no server, no account, and no install:
open the site, and the tools work.

## The tools

| Tool | What it does |
|---|---|
| **TOS Maker** | Builds a Table of Specifications, either as a SilidPinoy sheet or as the standard DepEd school template with Bloom's LOTS/HOTS levels. Exports to Word and hands the finished specification straight to the Test Maker. |
| **Test Maker** | Writes a test from your competencies or from a finished TOS — multiple choice, matching, fill-in-the-blanks, and more — with an answer key. Exports to Word (`.doc` and `.docx`), prints cleanly, and can re-import its own exports for editing. |
| **Lesson Plan** | Produces a weekly lesson plan / DLL. Accepts an existing `.doc` or `.docx` plan and auto-fills the form from it. Prints or saves as PDF. |
| **PPT Maker** | Turns a topic or a finished lesson plan into a presentation, including the deck size you want. |
| **Activity Sheet** | Builds an activity sheet for a lesson, ready to print. |

## How teachers use it

1. Open the site and paste your own Google Gemini API key in **Settings**.
   A free key from Google AI Studio is enough. The key is kept only in your own
   browser.
2. Pick a tool from the top menu.
3. Fill in the grade level, subject, and your competencies — or paste a source
   document and let the tool read it.
4. Generate, then review the result. You can edit anything before exporting.
5. Export to Word, print it, or save it to **My Documents** to reopen later.

The **My Documents** drawer keeps your generated work in the browser, and
**Backup** exports everything to a file you can move to another computer.

## Requirements

- A modern browser (Chrome, Edge, Firefox, or Safari).
- An internet connection — the interface uses CDNs for styling and fonts.
- A Google Gemini API key, free from [Google AI Studio](https://aistudio.google.com/apikey).

## Your data stays with you

- The API key is stored for the browser session only. It is written to the
  device **only** if you tick "Remember my API key on this device", and you can
  turn that off at any time.
- Generated documents live in your own browser storage, not on a server.
- Requests go from your browser straight to Google. Nothing is collected here,
  and no key belongs to this project.

## Notes

- This is a static site — plain HTML, CSS, and JavaScript with no build step and
  no dependencies to install.
- AI output is a first draft. Read it before handing it to students.
- Adding or fixing something? See `PUBLISH.md` for how the site is deployed.

## License

Free to use and adapt for classroom teaching.
