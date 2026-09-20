<div align="center">

<img src="docs/readme-hero.svg" alt="MagIranPlus visual hero" width="100%">

# MagIranPlus

### Extract, curate, and export Magiran publications.

[![Live site](https://img.shields.io/badge/Live_site-MagIran%2B-1E3A5F?style=for-the-badge)](https://soheil-aghayani.github.io/MagIranPlus/)
[![Architecture](https://img.shields.io/badge/Architecture-Static_UI_%7C_Flask_API-0F172A?style=for-the-badge)](#architecture)
[![Deployment](https://img.shields.io/badge/Hosting-GitHub_Pages_%7C_Render_%7C_Cloudflare-2563EB?style=for-the-badge&logo=cloudflare&logoColor=white)](#deployment)
[![License](https://img.shields.io/badge/License-MIT-0F172A?style=for-the-badge)](LICENSE)

<br>

<p align="center">
  A focused Persian academic utility for turning public Magiran search results into a searchable publication list and a ready-to-use bibliography.
</p>

</div>

---

## Overview

MagIranPlus is a free, open-source research utility for working with public [Magiran](https://www.magiran.com) search results. Paste a Magiran search URL, review the extracted records, select the articles you need, and export a bibliography in the citation style required by your workflow.

The interface is Persian and right-to-left, while the implementation and documentation are kept in English for easier collaboration. The project is intentionally separate from [CivilicaPulse](https://github.com/Soheil-Aghayani/CivilicaPulse) so each source can evolve with its own parser and metadata rules.

## Live links

- **Website:** [soheil-aghayani.github.io/MagIranPlus](https://soheil-aghayani.github.io/MagIranPlus/)
- **API health:** [magiranplus-api.onrender.com/api/health](https://magiranplus-api.onrender.com/api/health)
- **Related project:** [CivilicaPulse](https://soheil-aghayani.github.io/CivilicaPulse/)
- **Related project:** [ScholarPulse](https://soheil-aghayani.github.io/ScholarPulse/)
- **Author:** [Soheil Aghayani](https://github.com/Soheil-Aghayani)

## Features

- Extract article records from a public Magiran `searchinpapers` URL.
- Discover the full result count even when Magiran shows only a sliding window of page links.
- Fetch all result pages with bounded concurrency and remove duplicate records.
- Report failed pages explicitly instead of presenting an incomplete result as complete.
- Preserve titles, all available authors, journal details, year, volume, issue, pages, language, abstracts, and article links when available.
- Keep the interface empty on first load; no sample author, article, or fabricated result is included.
- Filter by publication type, author, and free-text search.
- Select all filtered results or select individual articles.
- Preserve every co-author by default, with an optional target-author isolation control.
- Format references as APA 7th, Vancouver, IEEE, Harvard, Chicago, MLA 9th, or BibTeX.
- Export Word `.docx`, BibTeX, JSON, and CSV files, or copy and print citations.
- Generate RTL Word documents with B Nazanin 14 for Persian text and Times New Roman 13 for Latin text.
- Preserve English digits in Word output and keep URLs in their original Latin form.
- Accept pasted or dropped Magiran HTML when direct fetching is unavailable.
- Validate source URLs against `magiran.com` and `www.magiran.com` before server-side fetching.

## Architecture

| Layer | Responsibility | Technology |
| :--- | :--- | :--- |
| Static frontend | URL input, filters, author controls, pagination, views, and exports | Semantic HTML, vanilla JavaScript, and CSS |
| Parser and API | Magiran page parsing, pagination, validation, and response handling | Python and Flask |
| Citation engine | Citation-style normalization and BibTeX formatting | `citation_formats.py` |
| Word generator | RTL paragraphs, script-aware fonts, digit handling, and `.docx` output | `python-docx` |
| Public hosting | Static application and optional browser-safe API routing | GitHub Pages, Render, and Cloudflare |

### Request flow

1. The frontend sends a public Magiran search URL to the Flask API.
2. The API validates the domain and extracts the first result page.
3. The API calculates the real page count from the total result count and page size, then fetches the remaining pages with bounded concurrency.
4. Records are merged by article identifier and returned with page status information.
5. The frontend provides search, filters, pagination, author controls, and citation exports from the same dataset.

## Word export rules

| Property | Behavior |
| :--- | :--- |
| Direction | Right-to-left paragraphs with right alignment |
| Persian text | `B Nazanin`, 14 pt |
| English and Latin text | `Times New Roman`, 13 pt |
| Numerals | Persian digits in Persian text; English digits remain in citation styles and URLs |
| Output | Native `.docx` generated with `python-docx` |
| Links | Magiran links can be included or omitted |
| Authors | All parsed co-authors are retained unless author isolation is enabled |

## API

| Method | Route | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health check |
| `POST` | `/api/parse-search` | Fetch and parse a Magiran search URL |
| `POST` | `/api/parse-html` | Parse pasted or uploaded Magiran HTML |
| `POST` | `/api/export-word` | Generate a Persian RTL `.docx` bibliography |
| `POST` | `/api/export-docx` | Compatibility alias for Word export |

The search endpoint returns the normalized query, total count, fetched page count, per-page status, completeness state, and article records. The Word endpoint receives the selected records from the shared frontend dataset.

## Repository structure

```text
MagIranPlus/
├── web/                    # Static Persian RTL frontend and GitHub Pages target
│   ├── assets/             # Logo, fonts, icons, and local vendor assets
│   ├── app.js              # UI state, filters, pagination, and exports
│   ├── config.js           # Local and public API selection
│   ├── index.html          # Accessible RTL application shell
│   └── styles.css          # Theme, responsive layout, and components
├── cloudflare/             # Optional Cloudflare Worker API bridge
├── docs/                   # Deployment notes and project documentation
├── tests/                  # Parser, API, citation, and Word regression tests
├── citation_formats.py     # Citation-style formatters
├── magiran_parser.py       # Magiran result-page and pagination parser
├── server.py               # Flask API and Word document generator
├── render.yaml             # Render service definition
├── requirements.txt        # Python dependencies
└── start.bat               # Windows local-development launcher
```

## Local development

### Windows launcher

Double-click [`start.bat`](start.bat) to create or reuse the virtual environment, install dependencies, and start the local server.

### PowerShell

```powershell
# From the repository root
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python server.py
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000).

### Tests

```powershell
python -m unittest discover -s tests -v
```

## Deployment

- **Frontend:** GitHub Pages serves the static files from [`web/`](web/).
- **API:** The Flask service is defined in [`render.yaml`](render.yaml).
- **Optional bridge:** The Cloudflare Worker in [`cloudflare/`](cloudflare/) can route browser requests to the API.
- **Local fallback:** `start.bat` remains the simplest development path and does not replace the public API.

For reliable public extraction, the API origin must be able to reach Magiran from the Iranian network. See [`docs/public-api-deployment.md`](docs/public-api-deployment.md) for the no-install deployment contract and the administrator-controlled egress route.

## Notes and limitations

MagIranPlus reads publicly accessible search-result pages. It does not bypass authentication, solve anti-bot challenges, or fabricate missing metadata. Some Magiran records may not expose a full-text URL; those records are retained with an empty article-link field.

The public no-install mode requires an administrator-controlled API origin. End-user V2Ray links are intentionally not accepted or uploaded. If direct fetching is unavailable, use the HTML import tab or run the extractor locally.

## License

MagIranPlus is released under the MIT License. See [`LICENSE`](LICENSE) for the full text.

## Credits

Designed and developed by [Soheil Aghayani](https://github.com/Soheil-Aghayani), an environmental engineering researcher building focused tools for Persian academic and technical workflows.

<div align="center">
  <sub>Built for practical Persian academic research workflows.</sub>
</div>
