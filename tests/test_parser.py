import unittest

from magiran_parser import merge_articles, parse_search_html


SOURCE_URL = (
    "https://www.magiran.com/searchinpapers?adv=false&ew=%D9%86%D8%A7%D8%B5%D8%B1"
    "%20%D9%85%D9%87%D8%B1%D8%AF%D8%A7%D8%AF%DB%8C&cols=4&s=2"
)

SAMPLE_HTML = """
<!doctype html>
<html lang="fa" dir="rtl">
<head><title>Magiran | جستجوی مطالب مجلات</title></head>
<body>
  <div>ردیف ۱-۲ از ۳ عنوان مطلب</div>
  <div class="pagination-container">
    <a class="page-link" href="/searchinpapers?{query}">۱</a>
    <a class="page-link" href="/searchinpapers?page=2&amp;{query}">۲</a>
  </div>
  <li class="list-group-item paper-list fa-number">
    <div class="paper-box-content">
      <div class="p-info fa-paper flex-fill" id="fa_101">
        <div class="p-title"><span class="title"><a class="text-primary mi-fulltext" href="/paper/101/article-one">مقالهٔ اول ۱۴۰۲</a></span></div>
        <span class="p-author p-info-part">رضا خاکپور *، ناصر مهردادی</span>
        <span class="p-info-part mt-2">نشریهٔ نمونه، سال چهارم شماره ۲ (پیاپی ۸، بهار ۱۴۰۲)،</span>
        <span class="p-info-part">صص ۱۰ -۲۰</span>
        <div class="paper-abs collapse">چکیدهٔ مقالهٔ اول</div>
        <div class="p-footer f-sm"><span>زبان: فارسی</span></div>
      </div>
    </div>
  </li>
  <li class="list-group-item paper-list fa-number">
    <div class="paper-box-content">
      <div class="paper-box-content">
        <div class="p-info fa-paper flex-fill" id="fa_102">
          <div class="p-title"><span class="title"><a class="text-primary mi-fulltext" href="/paper/102/article-two">مقالهٔ دوم</a></span></div>
          <span class="p-author p-info-part">امیر پازوکی</span>
          <span class="p-info-part mt-2">مجلهٔ دوم، سال سوم شماره ۱ (پاییز ۱۴۰۱)،</span>
          <span class="p-info-part">صص ۱ -۹</span>
          <div class="p-footer f-sm"><span>زبان: فارسی</span></div>
        </div>
      </div>
    </div>
  </li>
</body>
</html>
""".format(query="adv=false&amp;ew=x&amp;cols=4&amp;s=2")


class MagiranParserTests(unittest.TestCase):
    def test_extracts_article_metadata_and_pagination(self):
        result = parse_search_html(SAMPLE_HTML, SOURCE_URL)

        self.assertEqual(result["total_count"], 3)
        self.assertEqual(result["page_count"], 2)
        self.assertEqual(len(result["articles"]), 2)
        article = result["articles"][0]
        self.assertEqual(article["id"], "101")
        self.assertEqual(article["title"], "مقالهٔ اول ۱۴۰۲")
        self.assertEqual(article["authors"], "رضا خاکپور، ناصر مهردادی")
        self.assertEqual(article["venue"], "نشریهٔ نمونه")
        self.assertEqual(article["volume"], "چهارم")
        self.assertEqual(article["issue"], "2")
        self.assertEqual(article["year"], "1402")
        self.assertEqual(article["pages"], "صص ۱۰ -۲۰")
        self.assertEqual(article["language"], "فارسی")
        self.assertIn("چکیدهٔ مقالهٔ اول", article["abstract"])
        self.assertEqual(article["url"], "https://www.magiran.com/paper/101/article-one")

    def test_infers_hidden_pages_from_total_count_and_page_size(self):
        pagination = "".join(
            f'<a class="page-link" href="/searchinpapers?page={page}">{page}</a>'
            for page in range(1, 6)
        )
        articles = "".join(
            f'''<li class="paper-list fa-number">
                <div class="p-info fa-paper flex-fill" id="fa_{page}">
                    <a class="mi-fulltext" href="/paper/{page}">مقالهٔ {page}</a>
                    <span class="p-author">نویسندهٔ آزمون</span>
                    <span class="p-info-part mt-2">نشریهٔ آزمون، سال اول شمارهٔ ۱</span>
                    <span class="p-info-part">صص ۱ - ۱۰</span>
                </div>
            </li>'''
            for page in range(1, 11)
        )
        html = f'''<html><body>
            <div>ردیف ۱-۱۰ از ۱۰۶ عنوان مطلب</div>
            <div class="pagination-container">{pagination}</div>
            {articles}
        </body></html>'''

        result = parse_search_html(html, SOURCE_URL)

        self.assertEqual(result["total_count"], 106)
        self.assertEqual(len(result["articles"]), 10)
        self.assertEqual(result["page_count"], 11)

    def test_keeps_records_without_full_text_links(self):
        html = """<html><body>
            <div>ردیف ۱-۱ از ۱ عنوان مطلب</div>
            <li class="paper-list fa-number">
                <div class="p-info fa-paper flex-fill" id="fa_900">
                    <div class="p-title"><span class="title">عنوان بدون پیوند</span></div>
                    <span class="p-author">نویسندهٔ آزمون</span>
                    <span class="p-info-part mt-2">نشریهٔ آزمون، سال اول شمارهٔ ۱</span>
                    <span class="p-info-part">ص ۱</span>
                </div>
            </li>
        </body></html>"""

        result = parse_search_html(html, SOURCE_URL)

        self.assertEqual(len(result["articles"]), 1)
        self.assertEqual(result["articles"][0]["title"], "عنوان بدون پیوند")
        self.assertEqual(result["articles"][0]["url"], "")

    def test_merge_articles_deduplicates_by_identifier_and_preserves_order(self):
        pages = [
            {"articles": [{"id": "1", "title": "اول"}, {"id": "2", "title": "دوم"}]},
            {"articles": [{"id": "2", "title": "دوم تکراری"}, {"id": "3", "title": "سوم"}]},
        ]
        merged = merge_articles(pages)
        self.assertEqual([article["id"] for article in merged], ["1", "2", "3"])
        self.assertEqual(merged[1]["title"], "دوم")


if __name__ == "__main__":
    unittest.main()
