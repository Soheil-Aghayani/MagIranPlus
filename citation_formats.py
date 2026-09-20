"""Citation-style formatting for MagIranPlus exports."""

from __future__ import annotations

import re


STYLE_LABELS = {
    "apa7": "APA 7th",
    "vancouver": "Vancouver",
    "ieee": "IEEE",
    "harvard": "Harvard",
    "chicago": "Chicago",
    "mla": "MLA 9th",
    "bibtex": "BibTeX",
}

_AUTHOR_SEPARATOR = re.compile(r"\s*(?:[,،؛;]|\s+(?:و|and)\s+)\s*", re.IGNORECASE)


def normalize_style(value: object) -> str:
    candidate = str(value or "").strip().lower()
    aliases = {
        "apa": "apa7",
        "apa 7": "apa7",
        "apa 7th": "apa7",
        "mla 9": "mla",
        "mla 9th": "mla",
    }
    candidate = aliases.get(candidate, candidate)
    return candidate if candidate in STYLE_LABELS else "apa7"


def style_label(value: object) -> str:
    return STYLE_LABELS[normalize_style(value)]


def clean_text(value: object, fallback: str = "") -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip() or fallback


def profile_author(value: object) -> str:
    return clean_text(value, "نویسندگان نامشخص")


def _author_match_key(value: object) -> str:
    return (
        clean_text(value)
        .replace("ي", "ی")
        .replace("ى", "ی")
        .replace("ك", "ک")
        .replace("ـ", "")
        .casefold()
    )


def citation_author(
    article: dict[str, object],
    fallback_author: str,
    target_author: str = "",
    isolate_author: bool = False,
) -> str:
    authors = clean_text(article.get("authors"), profile_author(fallback_author))
    if not isolate_author:
        return authors

    target_key = _author_match_key(target_author)
    if len(target_key) < 3:
        return authors

    for candidate in _AUTHOR_SEPARATOR.split(authors):
        candidate = clean_text(candidate)
        candidate_key = _author_match_key(candidate)
        if candidate_key and (
            candidate_key == target_key
            or candidate_key in target_key
            or target_key in candidate_key
        ):
            return candidate
    return authors


def citation_year(article: dict[str, object]) -> str:
    return clean_text(article.get("year"), "n.d.")


def citation_title(article: dict[str, object]) -> str:
    return clean_text(article.get("title"), "بدون عنوان").rstrip(".")


def citation_venue(article: dict[str, object]) -> str:
    venue = clean_text(article.get("venue")).rstrip(".")
    volume = clean_text(article.get("volume"))
    issue = clean_text(article.get("issue"))
    pages = clean_text(article.get("pages"))
    details = venue
    if volume:
        details += f", سال {volume}"
    if issue:
        details += f"، شماره {issue}"
    if pages:
        details += f"، {pages}"
    return details.rstrip(".")


def citation_url(article: dict[str, object]) -> str:
    return clean_text(article.get("url"))


def format_citation(
    article: dict[str, object],
    index: int,
    style: object,
    fallback_author: str,
    include_url: bool = True,
    target_author: str = "",
    isolate_author: bool = False,
) -> str:
    selected_style = normalize_style(style)
    authors = citation_author(article, fallback_author, target_author, isolate_author)
    title = citation_title(article)
    venue = citation_venue(article)
    year = citation_year(article)
    url = citation_url(article) if include_url else ""
    url_part = f" {url}" if url else ""

    if selected_style == "apa7":
        venue_part = f" {venue}." if venue else ""
        return f"{authors} ({year}). {title}.{venue_part}{url_part}".strip()

    if selected_style == "vancouver":
        venue_part = f" {venue}." if venue else ""
        return f"{index}. {authors}. {title}.{venue_part} {year}.{url_part}".strip()

    if selected_style == "ieee":
        venue_part = f" {venue}," if venue else ""
        return f"[{index}] {authors}, “{title},”{venue_part} {year}.{url_part}".strip()

    if selected_style == "harvard":
        venue_part = f" {venue}." if venue else ""
        return f"{authors} ({year}) ‘{title}’.{venue_part}{url_part}"

    if selected_style == "chicago":
        venue_part = f" {venue}." if venue else ""
        return f"{authors}. “{title}.”{venue_part} ({year}).{url_part}"

    if selected_style == "mla":
        venue_part = f" {venue}," if venue else ""
        return f"{authors}. “{title}.”{venue_part} {year}.{url_part}"

    key_source = re.sub(r"[^A-Za-z0-9]+", "", authors) or "author"
    article_id = clean_text(article.get("id"), str(index))
    key = f"magiran_{key_source[:24]}_{article_id}"
    url_line = f"  url = {{{url}}},\n" if url else ""
    return (
        f"@article{{{key},\n"
        f"  author = {{{authors}}},\n"
        f"  title = {{{title}}},\n"
        f"  journal = {{{clean_text(article.get('venue'))}}},\n"
        f"  year = {{{year if year != 'n.d.' else ''}}},\n"
        f"  volume = {{{clean_text(article.get('volume'))}}},\n"
        f"  number = {{{clean_text(article.get('issue'))}}},\n"
        f"  pages = {{{clean_text(article.get('pages'))}}},\n"
        f"{url_line}"
        f"}}"
    )
