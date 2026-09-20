"""Dependency-free HTML parser for Magiran search result pages."""

from __future__ import annotations

import re
from html.parser import HTMLParser
from urllib.parse import parse_qs, urljoin, urlparse


WESTERN_DIGITS = "0123456789"
PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩"
_DIGIT_TRANSLATION = str.maketrans(
    PERSIAN_DIGITS + ARABIC_DIGITS,
    WESTERN_DIGITS + WESTERN_DIGITS,
)
_SPACE_RE = re.compile(r"\s+")
_YEAR_RE = re.compile(r"(?<!\d)(1[0-4]\d{2})(?!\d)")
_VENUE_RE = re.compile(
    r"^(?P<venue>.*?)(?:،\s*)?سال\s*(?P<volume>[^،(]+?)\s*"
    r"شماره\s*(?P<issue>[^،(]+?)(?:\s*\((?P<details>[^)]*)\))?\s*$"
)
_PAGES_RE = re.compile(r"(?P<start>[۰-۹٠-٩\d]+)\s*[-–—]\s*(?P<end>[۰-۹٠-٩\d]+)")


def normalize_text(value: object) -> str:
    return _SPACE_RE.sub(" ", str(value or "")).strip()


def western_digits(value: object) -> str:
    return str(value or "").translate(_DIGIT_TRANSLATION)


def absolute_url(href: str, source_url: str) -> str:
    return urljoin(source_url, href.strip())


def _classes(attrs: list[tuple[str, str | None]]) -> set[str]:
    value = dict(attrs).get("class") or ""
    return set(value.split())


def parse_venue(raw: str) -> dict[str, str]:
    """Split Magiran's venue line into reusable citation fields."""

    clean = normalize_text(raw).strip(" ،,")
    match = _VENUE_RE.match(clean)
    if not match:
        year_matches = _YEAR_RE.findall(western_digits(clean))
        return {
            "venue": clean,
            "volume": "",
            "issue": "",
            "season": "",
            "year": year_matches[-1] if year_matches else "",
        }

    details = normalize_text(match.group("details"))
    year_matches = _YEAR_RE.findall(western_digits(details or clean))
    season = re.sub(r"پیاپی\s*[^،]+،?", "", details).strip(" ،,")
    return {
        "venue": normalize_text(match.group("venue")).strip(" ،,"),
        "volume": western_digits(normalize_text(match.group("volume"))),
        "issue": western_digits(normalize_text(match.group("issue"))),
        "season": season,
        "year": year_matches[-1] if year_matches else "",
    }


def parse_pages(raw: str) -> tuple[str, str]:
    match = _PAGES_RE.search(western_digits(raw))
    if not match:
        return "", ""
    return match.group("start"), match.group("end")


class MagiranSearchParser(HTMLParser):
    """Extract article records and pagination from a Magiran search page."""

    def __init__(self, source_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self.source_url = source_url
        self.depth = 0
        self.article_depth: int | None = None
        self.current: dict[str, object] | None = None
        self.in_fa_depth: int | None = None
        self.in_en_depth: int | None = None
        self.footer_depth: int | None = None
        self.capture: dict[str, object] | None = None
        self.articles: list[dict[str, str]] = []
        self.pagination: dict[int, str] = {}
        self.page_title = ""
        self.result_text = ""
        self.current_page = self._query_page(source_url)
        self._capture_title = False

    @staticmethod
    def _query_page(source_url: str) -> int:
        try:
            value = parse_qs(urlparse(source_url).query).get("page", ["1"])[0]
            return max(int(western_digits(value)), 1)
        except (TypeError, ValueError):
            return 1

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        classes = _classes(attrs)
        attr_map = dict(attrs)

        if tag == "li" and {"paper-list", "fa-number"}.issubset(classes):
            self._finish_article()
            self.current = {"id": "", "title": "", "authors": "", "authors_en": ""}
            self.article_depth = self.depth

        if self.current is not None:
            if tag == "div" and "fa-paper" in classes:
                self.in_fa_depth = self.depth
            elif tag == "div" and "en-paper" in classes:
                self.in_en_depth = self.depth
            elif tag == "div" and "p-footer" in classes:
                self.footer_depth = self.depth

            in_fa_or_en = self.in_fa_depth is not None or self.in_en_depth is not None
            if in_fa_or_en and tag == "div" and "p-info" in classes:
                article_id = attr_map.get("id") or ""
                match = re.search(r"(?:fa|en)_(\d+)", article_id)
                if match and not self.current.get("id"):
                    self.current["id"] = match.group(1)

            in_fa = self.in_fa_depth is not None
            in_en = self.in_en_depth is not None
            if tag == "a" and "mi-fulltext" in classes and (in_fa or in_en):
                field = "title_en" if in_en and not in_fa else "title"
                self._begin_capture(field, tag, attr_map.get("href") or "")
            elif tag == "span" and "p-author" in classes and (in_fa or in_en):
                field = "authors_en" if in_en and not in_fa else "authors"
                self._begin_capture(field, tag)
            elif tag == "span" and "p-info-part" in classes and "mt-2" in classes and in_fa:
                self._begin_capture("venue_raw", tag)
            elif (
                tag == "span"
                and "p-info-part" in classes
                and "mt-2" not in classes
                and in_fa
                and self.current.get("pages_raw") is None
                and self.footer_depth is None
                and self.current.get("venue_raw") is not None
            ):
                self._begin_capture("pages_raw", tag)
            elif tag == "div" and "paper-abs" in classes and "en-number" not in classes and in_fa:
                self._begin_capture("abstract", tag)

        if tag == "title":
            self._begin_capture("page_title", tag)
        elif tag == "a" and "page-link" in classes:
            self._begin_capture("pagination_text", tag, attr_map.get("href") or "")
        elif tag == "body":
            self._capture_title = True

        self.depth += 1

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_data(self, data: str) -> None:
        if self.capture is not None:
            self.capture["parts"].append(data)
        elif self.current is not None and self.footer_depth is not None:
            self.current.setdefault("footer_parts", []).append(data)
        else:
            self.result_text += " " + data

    def handle_endtag(self, tag: str) -> None:
        self.depth = max(self.depth - 1, 0)

        if self.capture is not None and tag == self.capture["tag"] and self.depth == self.capture["depth"]:
            self._finish_capture()

        if self.current is not None:
            if tag == "div" and self.depth == self.in_fa_depth:
                self.in_fa_depth = None
            if tag == "div" and self.depth == self.in_en_depth:
                self.in_en_depth = None
            if tag == "div" and self.depth == self.footer_depth:
                self.footer_depth = None
            if tag == "li" and self.article_depth is not None and self.depth == self.article_depth:
                self._finish_article()
                self.article_depth = None

        if tag == "title":
            self._capture_title = False

    def _begin_capture(self, field: str, tag: str, value: str = "") -> None:
        if self.capture is not None:
            return
        self.capture = {"field": field, "tag": tag, "depth": self.depth, "parts": [], "value": value}

    def _finish_capture(self) -> None:
        if self.capture is None:
            return
        capture = self.capture
        self.capture = None
        field = str(capture["field"])
        value = normalize_text(" ".join(capture["parts"]))
        if field in {"title", "title_en"}:
            self.current[field] = value
            self.current[f"{field}_href"] = str(capture["value"])
        elif field == "page_title":
            self.page_title = value
        elif field == "pagination_text":
            page_text = western_digits(value)
            if page_text.isdigit():
                self.pagination[int(page_text)] = absolute_url(str(capture["value"]), self.source_url)
        elif self.current is not None:
            self.current[field] = value

    def _finish_article(self) -> None:
        if not self.current:
            return
        article = self.current
        self.current = None
        article_id = normalize_text(article.get("id"))
        title = normalize_text(article.get("title"))
        if not article_id or not title:
            return

        venue_fields = parse_venue(str(article.get("venue_raw") or ""))
        pages_start, pages_end = parse_pages(str(article.get("pages_raw") or ""))
        footer = normalize_text(" ".join(article.get("footer_parts") or []))
        language_match = re.search(r"زبان\s*:\s*([^\s]+)", footer)
        authors = normalize_text(article.get("authors"))
        authors = authors.replace(" *", "").replace("*", "")
        authors_en = normalize_text(article.get("authors_en"))
        authors_en = authors_en.replace(" *", "").replace("*", "")
        raw_href = str(article.get("title_href") or "")

        result = {
            "id": article_id,
            "title": title,
            "title_en": normalize_text(article.get("title_en")),
            "authors": authors,
            "authors_en": authors_en,
            "venue": venue_fields["venue"],
            "volume": venue_fields["volume"],
            "issue": venue_fields["issue"],
            "season": venue_fields["season"],
            "issue_text": normalize_text(article.get("venue_raw")),
            "year": venue_fields["year"],
            "pages_start": pages_start,
            "pages_end": pages_end,
            "pages": normalize_text(article.get("pages_raw")),
            "language": language_match.group(1) if language_match else "",
            "abstract": normalize_text(article.get("abstract"))[:12000],
            "type": "مقاله ژورنالی",
            "url": absolute_url(raw_href, self.source_url),
        }
        if "همایش" in result["venue"] or "کنفرانس" in result["venue"]:
            result["type"] = "مقاله کنفرانسی"
        self.articles.append(result)

    def result(self) -> dict[str, object]:
        self._finish_article()
        result_match = re.search(r"از\s*([۰-۹٠-٩\d]+)\s*عنوان", western_digits(self.result_text))
        total_count = int(result_match.group(1)) if result_match else len(self.articles)
        if self.current_page not in self.pagination:
            self.pagination[self.current_page] = self.source_url
        return {
            "source_url": self.source_url,
            "query": parse_qs(urlparse(self.source_url).query).get("ew", [""])[0],
            "page": self.current_page,
            "total_count": total_count,
            "page_count": max(self.pagination.keys(), default=self.current_page),
            "pagination": [
                {"page": page, "url": url}
                for page, url in sorted(self.pagination.items())
            ],
            "articles": self.articles,
        }


def parse_search_html(html: str, source_url: str) -> dict[str, object]:
    parser = MagiranSearchParser(source_url)
    parser.feed(html)
    parser.close()
    return parser.result()


def merge_articles(pages: list[dict[str, object]]) -> list[dict[str, str]]:
    """Merge page results while preserving Magiran's order."""

    merged: list[dict[str, str]] = []
    seen: set[str] = set()
    for page in pages:
        for article in page.get("articles") or []:
            item = {str(key): str(value or "") for key, value in article.items()}
            key = item.get("id") or item.get("url") or item.get("title")
            if not key or key in seen:
                continue
            seen.add(key)
            merged.append(item)
    return merged
