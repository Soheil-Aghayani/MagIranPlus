<p align="center">
  <img src="web/assets/magiranplus-logo.webp" alt="MagIranPlus logo" width="112">
</p>

<h1 align="center">MagIranPlus</h1>

<p align="center">
  Persian Magiran search extraction, citation formatting, and Word export.
</p>

<p align="center">
  <a href="https://github.com/Soheil-Aghayani/MagIranPlus">Repository</a>
  ·
  <a href="https://soheil-aghayani.github.io/MagIranPlus/">GitHub Pages</a>
</p>

## Overview

MagIranPlus is a local-first Persian research utility for collecting article records from public Magiran search result pages. It keeps the interface empty until a real Magiran search URL is provided, loads all result pages with bounded concurrency, removes duplicates, and presents the records in a paginated workspace.

The interface is Persian and RTL. The codebase is intentionally separate from CivilicaPlus so each source can evolve without sharing source-specific assumptions.

## Features

- Extract Magiran search results from a `searchinpapers` URL.
- Fetch all result pages and report failed pages explicitly.
- Preserve article titles, Persian and English author metadata, journal details, year, volume, issue, pages, language, abstracts, and source links.
- Filter by article type, author, and free-text search.
- Select all filtered results or individual articles.
- Keep all co-authors by default and optionally isolate a target author.
- Format APA 7th, Vancouver, IEEE, Harvard, Chicago, MLA 9th, and BibTeX.
- Export Word `.docx`, BibTeX, JSON, and CSV files, or copy and print citations.
- Generate Word files with B Nazanin 14 for Persian text and Times New Roman 13 for Latin text and English digits.
- Accept pasted or dropped Magiran HTML when direct fetching is unavailable.
- Validate source URLs against Magiran's approved hosts before fetching.

## Local setup

Requirements: Python 3.12 or newer.

```powershell
py -m venv .venv
\.venv\Scripts\python.exe -m pip install -r requirements.txt
\.venv\Scripts\python.exe server.py
```

Open <http://127.0.0.1:5000/> and paste a public Magiran search URL, for example:

<https://www.magiran.com/searchinpapers?adv=false&ew=ناصر%20مهردادی&cols=4&s=2>

The included `start.bat` performs the same setup and starts the local server on Windows.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Check service health |
| `POST` | `/api/parse-search` | Fetch and parse a Magiran search URL |
| `POST` | `/api/parse-html` | Parse pasted or uploaded Magiran HTML |
| `POST` | `/api/export-word` | Generate a Persian RTL Word document |
| `POST` | `/api/export-docx` | Compatibility alias for Word export |

The local frontend uses the same-origin Flask server on localhost. When the public GitHub Pages build is opened from Iran, it first tries a local API at `http://127.0.0.1:5000` so Magiran requests leave through the user's Iranian connection; the user can start it with `start.bat`. If the local service is not running, the frontend falls back to the separately deployed Render API at `https://magiranplus-api.onrender.com`. The free Render instance can take a little longer to answer after inactivity, and Magiran may restrict non-Iranian server traffic. The Cloudflare Worker configuration is kept as an optional bridge for a future deployment.

## Word export rules

- Persian text uses B Nazanin at 14 pt.
- Latin text and English digits use Times New Roman at 13 pt.
- Paragraphs are RTL and right-aligned.
- Magiran links can be included or omitted from the generated document.
- The default citation output retains every parsed co-author.

## Project structure

```text
MagIranPlus/
├── magiran_parser.py       # Magiran result-page and pagination parser
├── citation_formats.py     # Citation-style and BibTeX formatting
├── server.py               # Flask API and Word export
├── web/
│   ├── index.html          # Persian RTL application shell
│   ├── app.js              # State, filters, pagination, and exports
│   ├── styles.css          # Responsive light/dark interface
│   └── assets/             # Logo, fonts, icons, and local vendor assets
└── tests/                  # Parser, API, citation, and Word tests
```

## Notes

MagIranPlus reads publicly accessible result pages. It does not bypass authentication, solve challenges, or fabricate missing metadata. If Magiran blocks a server request, use the HTML import tab or run the extractor locally.

## License

MagIranPlus is released under the MIT License. See [`LICENSE`](LICENSE).
