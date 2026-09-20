/**
 * MagIranPlus — Persian Magiran search extractor and citation workspace.
 * The page starts empty and only renders records returned from Magiran.
 */

(function () {
  "use strict";

  var state = {
    profile: null,
    sourceUrl: "",
    articles: [],
    selected: new Set(),
    filter: "all",
    authorFilter: "all",
    targetAuthor: "",
    boldTargetAuthor: true,
    isolateTargetAuthor: false,
    query: "",
    citationStyle: "apa7",
    view: "cards",
    page: 1,
    pageSize: 12,
    totalCount: 0,
    pageCount: 0,
    discoveredPageCount: 0,
    limited: false,
    pageStatus: [],
    complete: true,
    lastSearchUrl: ""
  };

  var apiBaseUrl = String(window.MAGIRAN_API_BASE_URL || "").replace(/\/+$/, "");
  var localApiBaseUrl = String(window.MAGIRAN_LOCAL_API_BASE_URL || "http://127.0.0.1:5000").replace(/\/+$/, "");
  var preferLocalApi = window.MAGIRAN_PREFER_LOCAL_API === true;
  var isLocalHost = ["127.0.0.1", "localhost"].indexOf(window.location.hostname) >= 0;
  var activeApiBaseUrl = apiBaseUrl;
  var backendRequestTimeout = 180000;

  function apiCandidates() {
    if (isLocalHost) return [activeApiBaseUrl];
    var candidates = preferLocalApi ? [] : [activeApiBaseUrl];
    if (preferLocalApi && localApiBaseUrl) candidates.push(localApiBaseUrl);
    if (!preferLocalApi && localApiBaseUrl) candidates.push(localApiBaseUrl);
    if (preferLocalApi && activeApiBaseUrl && candidates.indexOf(activeApiBaseUrl) < 0) candidates.push(activeApiBaseUrl);
    if (activeApiBaseUrl && candidates.indexOf(activeApiBaseUrl) < 0) candidates.push(activeApiBaseUrl);
    return candidates;
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var requestOptions = Object.assign({}, options || {});
    var timer = null;
    if (controller) requestOptions.signal = controller.signal;
    var request = fetch(url, requestOptions);
    if (!controller) return request;
    timer = window.setTimeout(function () { controller.abort(); }, timeoutMs);
    return request.finally(function () { window.clearTimeout(timer); });
  }

  function toPersianDigits(value) {
    var digits = "۰۱۲۳۴۵۶۷۸۹";
    return String(value).replace(/[0-9٠-٩]/g, function (digit) {
      var arabic = "٠١٢٣٤٥٦٧٨٩";
      var index = "0123456789".indexOf(digit);
      if (index >= 0) return digits[index];
      index = arabic.indexOf(digit);
      return index >= 0 ? digits[index] : digit;
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function cleanAuthor(value) {
    return String(value || "")
      .replace(/^(?:(?:آقای|خانم|دکتر|پروفسور|استاد|مهندس)\s+)+/gi, "")
      .replace(/\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function splitAuthors(value) {
    return String(value || "")
      .split(/\s*(?:[,،؛;]|\s+(?:و|and)\s+)\s*/i)
      .map(cleanAuthor)
      .filter(Boolean);
  }

  function normalizeAuthorForMatch(value) {
    return cleanAuthor(value)
      .replace(/ي/g, "ی")
      .replace(/ى/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/ـ/g, "")
      .replace(/\u200c/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function getCitationAuthors(article, targetAuthor, isolate) {
    var fullAuthors = String(article.authors || "نویسندگان نامشخص").trim();
    var targetKey = normalizeAuthorForMatch(targetAuthor);
    if (!isolate || targetKey.length < 3) return fullAuthors;
    var match = splitAuthors(fullAuthors).find(function (candidate) {
      var candidateKey = normalizeAuthorForMatch(candidate);
      return candidateKey && (
        candidateKey === targetKey ||
        candidateKey.indexOf(targetKey) >= 0 ||
        targetKey.indexOf(candidateKey) >= 0
      );
    });
    return match || fullAuthors;
  }

  function citationVenue(article) {
    var venue = String(article.venue || "").trim();
    var parts = [];
    if (venue) parts.push(venue);
    if (article.volume) parts.push("سال " + article.volume);
    if (article.issue) parts.push("شماره " + article.issue);
    if (article.pages) parts.push(article.pages);
    return parts.join("، ").replace(/[.،]+$/, "");
  }

  function formatCitation(article, index, style, targetAuthor, isolate) {
    var authors = getCitationAuthors(article, targetAuthor, isolate);
    var title = String(article.title || "بدون عنوان").replace(/\.+$/, "");
    var venue = citationVenue(article);
    var year = String(article.year || "n.d.");
    var url = document.getElementById("include-links") && document.getElementById("include-links").checked
      ? String(article.url || "")
      : "";
    var urlPart = url ? " " + url : "";
    var selected = String(style || "apa7").toLowerCase();

    if (selected === "vancouver") {
      return index + ". " + authors + ". " + title + "." + (venue ? " " + venue + "." : "") + " " + year + "." + urlPart;
    }
    if (selected === "ieee") {
      return "[" + index + "] " + authors + ', “' + title + ',”' + (venue ? " " + venue + "," : "") + " " + year + "." + urlPart;
    }
    if (selected === "harvard") {
      return authors + " (" + year + ") ‘" + title + "’." + (venue ? " " + venue + "." : "") + urlPart;
    }
    if (selected === "chicago") {
      return authors + '. “' + title + '.”' + (venue ? " " + venue + "." : "") + " (" + year + ")." + urlPart;
    }
    if (selected === "mla") {
      return authors + '. “' + title + '.”' + (venue ? " " + venue + "," : "") + " " + year + "." + urlPart;
    }
    if (selected === "bibtex") {
      var key = "magiran_" + (article.id || index);
      return "@article{" + key + ",\n" +
        "  author = {" + authors + "},\n" +
        "  title = {" + title + "},\n" +
        "  journal = {" + String(article.venue || "") + "},\n" +
        "  year = {" + String(article.year || "") + "},\n" +
        "  volume = {" + String(article.volume || "") + "},\n" +
        "  number = {" + String(article.issue || "") + "},\n" +
        "  pages = {" + String(article.pages || "") + "},\n" +
        (url ? "  url = {" + url + "},\n" : "") +
        "}";
    }
    return authors + " (" + year + "). " + title + "." + (venue ? " " + venue + "." : "") + urlPart;
  }

  function highlightCitation(text) {
    var safe = escapeHtml(text);
    if (!state.boldTargetAuthor || !state.targetAuthor.trim()) return safe;
    var target = escapeHtml(cleanAuthor(state.targetAuthor));
    if (!target) return safe;
    return safe.replace(new RegExp("(" + target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi"), '<strong class="author-highlight">$1</strong>');
  }

  function showToast(message) {
    var toast = document.getElementById("toast");
    var messageEl = document.getElementById("toast-message");
    if (!toast) return;
    if (messageEl) messageEl.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(function () { toast.classList.remove("show"); }, 3200);
  }

  function setLoadingState(isLoading) {
    var button = document.getElementById("extract-button");
    if (!button) return;
    button.disabled = isLoading;
    button.setAttribute("aria-busy", isLoading ? "true" : "false");
    button.innerHTML = isLoading
      ? '<svg class="icon loading-icon" aria-hidden="true"><use href="#icon-loader"></use></svg>'
      : '<svg class="icon" aria-hidden="true"><use href="#icon-search"></use></svg>';
  }

  function setWordExportState(isLoading, label) {
    var button = document.getElementById("btn-export-word");
    if (!button) return;
    button.disabled = isLoading;
    button.setAttribute("aria-busy", isLoading ? "true" : "false");
    button.innerHTML = isLoading
      ? '<svg class="icon loading-icon" aria-hidden="true"><use href="#icon-loader"></use></svg><span class="compact-label">' + escapeHtml(label) + '</span>'
      : '<svg class="icon" aria-hidden="true"><use href="#icon-download"></use></svg><span class="compact-label">دریافت Word</span>';
  }

  function userFacingError(error, fallback) {
    if (error && error.name === "AbortError") return "پاسخ مگ‌ایران دیر رسید؛ دوباره تلاش کنید یا HTML صفحه را وارد کنید.";
    if (error && error.name === "TypeError") {
      return isLocalHost
        ? "اتصال به مگ‌ایران برقرار نشد؛ دوباره تلاش کنید یا حالت HTML را امتحان کنید."
        : "سرویس عمومی استخراج در دسترس نیست؛ دوباره تلاش کنید یا حالت HTML را امتحان کنید.";
    }
    return error && error.message ? error.message : fallback;
  }

  async function requestApi(path, options, timeoutMs) {
    var firstError = null;
    var candidates = apiCandidates();
    for (var index = 0; index < candidates.length; index += 1) {
      var base = candidates[index];
      try {
        var response = await fetchWithTimeout(base + path, options, timeoutMs);
        if (response.ok) {
          activeApiBaseUrl = base;
          return response;
        }
        var payload = await response.clone().json().catch(function () { return {}; });
        var apiError = new Error(payload.error || "درخواست سرویس مگ‌ایران انجام نشد.");
        apiError.status = response.status;
        if (!firstError) firstError = apiError;
      } catch (error) {
        if (!firstError) firstError = error;
      }
    }
    throw firstError || new Error("سرویس مگ‌ایران در دسترس نیست.");
  }

  async function requestSearch(sourceUrl) {
    var response = await requestApi("/api/parse-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: sourceUrl, fetch_all: true })
    }, backendRequestTimeout);
    var payload = await response.json().catch(function () { return {}; });
    return payload;
  }

  function setResultsVisible(visible) {
    ["author-card", "control-deck", "references-view", "table-view", "analytics-view", "pagination", "extraction-status"]
      .forEach(function (id) {
        var element = document.getElementById(id);
        if (element) element.hidden = !visible;
      });
  }

  function renderExtractionStatus() {
    var element = document.getElementById("extraction-status");
    if (!element) return;
    var failed = state.pageStatus.filter(function (item) { return item.status === "error"; });
    element.className = "extraction-status " + (state.complete ? "is-complete" : "is-partial");
    element.hidden = false;
    if (!state.complete) {
      var message;
      if (failed.length) {
        message = 'استخراج ناقص است؛ صفحه‌های ' + failed.map(function (item) {
          return toPersianDigits(item.page);
        }).join("، ") + ' دریافت نشدند. برای تلاش دوباره روی استخراج کلیک کنید.';
      } else if (state.limited) {
        message = 'استخراج تا سقف ' + toPersianDigits(state.pageCount) +
          ' صفحه انجام شد؛ سقف محافظتی برنامه اجازهٔ دریافت همهٔ صفحات را نداد.';
      } else {
        message = 'فقط HTML همین صفحه پردازش شد؛ برای دریافت همهٔ صفحات، لینک جست‌وجو را در بخش جست‌وجو اجرا کنید.';
      }
      element.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-refresh"></use></svg>' +
        '<span>' + message + '</span>';
    } else {
      element.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-check"></use></svg>' +
        '<span>' + toPersianDigits(state.articles.length) + " نتیجه از " + toPersianDigits(state.pageCount || 1) + " صفحه آماده است.</span>";
    }
  }

  function loadDataset(payload) {
    if (!payload || !Array.isArray(payload.articles) || payload.articles.length === 0) return false;
    var seen = new Set();
    state.articles = payload.articles.filter(function (article) {
      var key = String(article.id || article.url || article.title || "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    state.profile = payload.profile || { name: payload.query || "نتیجهٔ جست‌وجو", affil: "جست‌وجوی مگ‌ایران" };
    state.sourceUrl = String(payload.source_url || (state.profile && state.profile.url) || "");
    state.lastSearchUrl = state.sourceUrl;
    state.totalCount = Number(payload.total_count || state.articles.length);
    state.pageCount = Number(payload.page_count || 1);
    state.discoveredPageCount = Number(payload.discovered_page_count || state.pageCount);
    state.limited = payload.limited === true;
    state.pageStatus = Array.isArray(payload.page_status) ? payload.page_status : [];
    state.complete = payload.complete !== false;
    state.selected = new Set(state.articles.map(function (article) { return String(article.id); }));
    state.filter = "all";
    state.authorFilter = "all";
    state.query = "";
    state.page = 1;
    state.targetAuthor = "";
    var targetInput = document.getElementById("target-author-input");
    if (targetInput) targetInput.value = "";
    setResultsVisible(true);
    renderAuthorCard();
    updateAuthorFilterOptions();
    renderActiveView();
    renderExtractionStatus();
    syncIsolateTargetButton();
    return true;
  }

  function renderAuthorCard() {
    var profile = state.profile || {};
    var name = String(profile.name || "نتیجهٔ جست‌وجوی مگ‌ایران");
    var nameEl = document.getElementById("author-name");
    var affilEl = document.getElementById("author-affil");
    var linkEl = document.getElementById("author-link");
    var identity = document.getElementById("author-identicon");
    if (nameEl) nameEl.textContent = name;
    if (affilEl) affilEl.textContent = profile.affil || "جست‌وجوی مگ‌ایران";
    if (linkEl) {
      linkEl.href = state.sourceUrl || "https://www.magiran.com/";
      linkEl.title = "بازکردن لینک جست‌وجو در مگ‌ایران";
    }
    if (identity) {
      identity.setAttribute("data-jdenticon-value", state.sourceUrl || name);
      if (window.jdenticon && typeof window.jdenticon.update === "function") {
        window.jdenticon.update(identity, state.sourceUrl || name);
      }
    }

    var conference = state.articles.filter(function (a) { return a.type === "مقاله کنفرانسی"; }).length;
    var journal = state.articles.filter(function (a) { return a.type !== "مقاله کنفرانسی"; }).length;
    var years = state.articles.map(function (a) { return Number(a.year); }).filter(function (year) { return year > 0; });
    var minYear = years.length ? Math.min.apply(Math, years) : null;
    var maxYear = years.length ? Math.max.apply(Math, years) : null;
    setText("metric-total", toPersianDigits(state.totalCount));
    setText("metric-conf", toPersianDigits(conference));
    setText("metric-journal", toPersianDigits(journal));
    setText("metric-research", toPersianDigits(Math.max(state.pageStatus.filter(function (p) { return p.status === "ok"; }).length, 1)));
    setText("metric-span", minYear && maxYear ? toPersianDigits(minYear) + "–" + toPersianDigits(maxYear) : "—");
  }

  function setText(id, value) {
    var element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function updateAuthorFilterOptions() {
    var select = document.getElementById("author-filter-select");
    if (!select) return;
    var names = new Set();
    state.articles.forEach(function (article) {
      splitAuthors(article.authors).forEach(function (name) { names.add(name); });
    });
    var options = ['<option value="all">همهٔ نویسندگان</option>'];
    Array.from(names).sort(function (a, b) { return a.localeCompare(b, "fa"); }).forEach(function (name) {
      options.push('<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>');
    });
    select.innerHTML = options.join("");
    select.value = state.authorFilter;
  }

  function articleMatchesAuthor(article, name) {
    if (name === "all") return true;
    return splitAuthors(article.authors).some(function (candidate) {
      return normalizeAuthorForMatch(candidate) === normalizeAuthorForMatch(name);
    });
  }

  function getFilteredArticles() {
    var query = state.query.trim().toLowerCase();
    return state.articles.filter(function (article) {
      var typeMatches = state.filter === "all" || article.type === state.filter;
      var authorMatches = articleMatchesAuthor(article, state.authorFilter);
      var haystack = [article.title, article.authors, article.venue, article.year, article.issue, article.pages]
        .join(" ").toLowerCase();
      return typeMatches && authorMatches && (!query || haystack.indexOf(query) >= 0);
    });
  }

  function getVisibleArticles() {
    var filtered = getFilteredArticles();
    var start = (state.page - 1) * state.pageSize;
    return filtered.slice(start, start + state.pageSize);
  }

  function updateCounts() {
    var all = state.articles;
    setText("count-all", toPersianDigits(all.length));
    setText("count-conf", toPersianDigits(all.filter(function (a) { return a.type === "مقاله کنفرانسی"; }).length));
    setText("count-journal", toPersianDigits(all.filter(function (a) { return a.type !== "مقاله کنفرانسی"; }).length));
    setText("count-research", "۰");
    setText("selected-badge", toPersianDigits(state.selected.size));
  }

  function updatePagination(filteredCount) {
    var pagination = document.getElementById("pagination");
    var totalPages = Math.max(Math.ceil(filteredCount / state.pageSize), 1);
    state.page = Math.min(state.page, totalPages);
    if (!pagination) return;
    pagination.hidden = filteredCount === 0;
    setText("pagination-info", "صفحهٔ " + toPersianDigits(state.page) + " از " + toPersianDigits(totalPages) + " · " + toPersianDigits(filteredCount) + " مقاله");
    var previous = document.getElementById("prev-page");
    var next = document.getElementById("next-page");
    if (previous) previous.disabled = state.page <= 1;
    if (next) next.disabled = state.page >= totalPages;
  }

  function renderActiveView() {
    if (!state.articles.length) return;
    updateCounts();
    var filtered = getFilteredArticles();
    updatePagination(filtered.length);
    var references = document.getElementById("references-view");
    var table = document.getElementById("table-view");
    var analytics = document.getElementById("analytics-view");
    if (references) {
      references.hidden = state.view !== "cards";
      references.style.display = state.view === "cards" ? "flex" : "none";
    }
    if (table) {
      table.hidden = state.view !== "table";
      table.style.display = state.view === "table" ? "block" : "none";
    }
    if (analytics) {
      analytics.hidden = state.view !== "analytics";
      analytics.style.display = state.view === "analytics" ? "flex" : "none";
    }
    if (state.view === "cards") renderCards(filtered);
    if (state.view === "table") renderTable(filtered);
    if (state.view === "analytics") renderAnalytics();
  }

  function articleIndex(article) {
    var index = state.articles.indexOf(article);
    return index >= 0 ? index + 1 : 1;
  }

  function renderCards(filtered) {
    var container = document.getElementById("references-view");
    if (!container) return;
    var start = (state.page - 1) * state.pageSize;
    var visible = filtered.slice(start, start + state.pageSize);
    if (!visible.length) {
      container.innerHTML = '<div class="empty-state"><svg class="icon" aria-hidden="true"><use href="#icon-search"></use></svg><span>نتیجه‌ای با این فیلتر پیدا نشد.</span></div>';
      return;
    }
    container.innerHTML = visible.map(function (article, offset) {
      var id = String(article.id);
      var selected = state.selected.has(id);
      var citation = formatCitation(article, start + offset + 1, state.citationStyle, state.targetAuthor, state.isolateTargetAuthor);
      var authors = getCitationAuthors(article, state.targetAuthor, state.isolateTargetAuthor);
      var meta = [article.venue, article.year, article.pages].filter(Boolean).join(" · ");
      return '<article class="article-card' + (selected ? ' is-selected' : '') + '" data-id="' + escapeHtml(id) + '">' +
        '<input class="article-check" type="checkbox" data-id="' + escapeHtml(id) + '" ' + (selected ? 'checked' : '') + ' aria-label="انتخاب مقالهٔ ' + escapeHtml(id) + '">' +
        '<div class="article-content">' +
        '<span class="article-index">' + toPersianDigits(start + offset + 1) + '</span>' +
        '<h3 class="article-title">' + escapeHtml(article.title) + '</h3>' +
        '<div class="article-authors-row"><svg class="icon" aria-hidden="true"><use href="#icon-user"></use></svg><span class="article-authors-text">' + escapeHtml(authors) + '</span></div>' +
        '<div class="article-meta"><span class="meta-tag">' + escapeHtml(article.type || "مقاله") + '</span><span>' + escapeHtml(meta || "اطلاعات نشریه ثبت نشده") + '</span></div>' +
        '<div class="article-citation" dir="rtl">' + highlightCitation(citation) + '</div>' +
        '<div class="article-actions"><a class="btn-secondary" href="' + escapeHtml(article.url || "#") + '" target="_blank" rel="noopener noreferrer" title="مشاهده مقاله در مگ‌ایران"><svg class="icon" aria-hidden="true"><use href="#icon-external"></use></svg><span>مشاهده</span></a><button class="btn-secondary btn-copy-one" type="button" data-citation="' + escapeHtml(citation) + '" title="کپی استناد"><svg class="icon" aria-hidden="true"><use href="#icon-copy"></use></svg><span>کپی</span></button></div>' +
        '</div></article>';
    }).join("");
  }

  function renderTable(filtered) {
    var body = document.getElementById("table-body");
    if (!body) return;
    var start = (state.page - 1) * state.pageSize;
    var visible = filtered.slice(start, start + state.pageSize);
    var tableAll = document.getElementById("table-select-all");
    if (tableAll) {
      tableAll.checked = visible.length > 0 && visible.every(function (article) { return state.selected.has(String(article.id)); });
      tableAll.indeterminate = visible.some(function (article) { return state.selected.has(String(article.id)); }) && !tableAll.checked;
    }
    body.innerHTML = visible.map(function (article, offset) {
      var id = String(article.id);
      var selected = state.selected.has(id);
      return '<tr class="' + (selected ? 'is-selected' : '') + '">' +
        '<td class="col-idx">' + toPersianDigits(start + offset + 1) + '</td>' +
        '<td class="col-select"><input class="table-row-check" type="checkbox" data-id="' + escapeHtml(id) + '" ' + (selected ? 'checked' : '') + ' aria-label="انتخاب مقاله"></td>' +
        '<td><strong>' + escapeHtml(article.title) + '</strong><br><span class="table-muted">' + escapeHtml(article.abstract || "") + '</span></td>' +
        '<td>' + escapeHtml(article.authors || "") + '</td>' +
        '<td>' + escapeHtml(article.type || "مقاله") + '</td>' +
        '<td>' + escapeHtml(article.year || "") + '</td>' +
        '<td>' + escapeHtml(citationVenue(article)) + '</td>' +
        '<td><a href="' + escapeHtml(article.url || "#") + '" target="_blank" rel="noopener noreferrer" title="مشاهده در مگ‌ایران"><svg class="icon" aria-hidden="true"><use href="#icon-external"></use></svg></a></td>' +
        '</tr>';
    }).join("");
  }

  function renderAnalytics() {
    var years = {};
    var venues = {};
    var authors = {};
    state.articles.forEach(function (article) {
      if (article.year) years[article.year] = (years[article.year] || 0) + 1;
      if (article.venue) venues[article.venue] = (venues[article.venue] || 0) + 1;
      splitAuthors(article.authors).forEach(function (author) { authors[author] = (authors[author] || 0) + 1; });
    });
    renderBarChart("chart-years", years, 8);
    renderBarChart("chart-venues", venues, 8);
    renderBarChart("chart-authors", authors, 8, true);
    renderBarChart("chart-types", {
      "مقاله ژورنالی": state.articles.filter(function (a) { return a.type !== "مقاله کنفرانسی"; }).length,
      "مقاله کنفرانسی": state.articles.filter(function (a) { return a.type === "مقاله کنفرانسی"; }).length
    }, 4);
  }

  function renderBarChart(id, values, limit, clickable) {
    var container = document.getElementById(id);
    if (!container) return;
    var rows = Object.keys(values).sort(function (a, b) { return values[b] - values[a]; }).slice(0, limit);
    var max = rows.length ? Math.max.apply(Math, rows.map(function (key) { return values[key]; })) : 1;
    container.innerHTML = rows.length ? rows.map(function (key) {
      var clickAttrs = clickable ? ' data-filter-author="' + escapeHtml(key) + '" tabindex="0" role="button"' : '';
      return '<div class="bar-chart-row"' + clickAttrs + '><span class="bar-label">' + escapeHtml(key) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + ((values[key] / max) * 100) + '%"></span></span><span class="bar-value">' + toPersianDigits(values[key]) + '</span></div>';
    }).join("") : '<span class="table-muted">اطلاعات کافی برای نمایش نیست.</span>';
  }

  function syncIsolateTargetButton() {
    var button = document.getElementById("isolate-target-author");
    if (!button) return;
    var active = state.isolateTargetAuthor && normalizeAuthorForMatch(state.targetAuthor).length >= 3;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function selectedArticles() {
    return state.articles.filter(function (article) { return state.selected.has(String(article.id)); });
  }

  function downloadBlob(blob, filename) {
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);
  }

  async function generateWordDocument() {
    var articles = selectedArticles();
    if (!articles.length) return showToast("حداقل یک مقاله را انتخاب کنید.");
    var button = document.getElementById("btn-export-word");
    setWordExportState(true, "ساخت Word…");
    try {
      var includeLinks = document.getElementById("include-links");
      var response = await requestApi("/api/export-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: state.profile,
          articles: articles,
          style: state.citationStyle,
          include_links: !includeLinks || includeLinks.checked,
          target_author: state.targetAuthor,
          isolate_author: state.isolateTargetAuthor
        })
      }, backendRequestTimeout);
      var blob = await response.blob();
      var disposition = response.headers.get("Content-Disposition") || "";
      var filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      var filename = "magiran-references-" + state.citationStyle + ".docx";
      if (filenameMatch) filename = decodeURIComponent(filenameMatch[1] || filenameMatch[2]);
      downloadBlob(blob, filename);
      showToast("فایل Word آماده شد.");
    } catch (error) {
      showToast(userFacingError(error, "ساخت فایل Word انجام نشد."));
    } finally {
      setWordExportState(false);
    }
  }

  function exportBibTeX() {
    var articles = selectedArticles();
    if (!articles.length) return showToast("حداقل یک مقاله را انتخاب کنید.");
    var text = articles.map(function (article, index) {
      return formatCitation(article, index + 1, "bibtex", state.targetAuthor, state.isolateTargetAuthor);
    }).join("\n\n");
    downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), "magiranplus.bib");
    showToast("فایل BibTeX ذخیره شد.");
  }

  function exportCsv() {
    var articles = selectedArticles();
    if (!articles.length) return showToast("حداقل یک مقاله را انتخاب کنید.");
    var rows = [["ردیف", "عنوان مقاله", "نویسندگان", "نوع انتشار", "سال", "نشریه", "دوره", "شماره", "صفحات", "لینک مگ‌ایران"]];
    articles.forEach(function (article, index) {
      rows.push([index + 1, article.title, article.authors, article.type, article.year, article.venue, article.volume, article.issue, article.pages, article.url]);
    });
    var csv = "\uFEFF" + rows.map(function (row) {
      return row.map(function (value) { return '"' + String(value || "").replace(/"/g, '""') + '"'; }).join(",");
    }).join("\r\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "magiranplus.csv");
    showToast("فایل CSV ذخیره شد.");
  }

  function exportJson() {
    var articles = selectedArticles();
    if (!articles.length) return showToast("حداقل یک مقاله را انتخاب کنید.");
    var payload = {
      source: "MagIranPlus",
      sourceUrl: state.sourceUrl,
      query: state.profile && state.profile.name,
      citationStyle: state.citationStyle,
      targetAuthor: state.targetAuthor,
      isolateTargetAuthor: state.isolateTargetAuthor,
      extractedAt: new Date().toISOString(),
      articles: articles
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }), "magiranplus.json");
    showToast("فایل JSON ذخیره شد.");
  }

  function copyAll() {
    var articles = selectedArticles();
    if (!articles.length) return showToast("حداقل یک مقاله را انتخاب کنید.");
    var text = articles.map(function (article, index) {
      return formatCitation(article, index + 1, state.citationStyle, state.targetAuthor, state.isolateTargetAuthor);
    }).join("\n\n");
    if (!navigator.clipboard) return showToast("کپی در این مرورگر در دسترس نیست.");
    navigator.clipboard.writeText(text).then(function () { showToast("ارجاعات کپی شد."); }).catch(function () { showToast("کپی متن انجام نشد."); });
  }

  function initTheme() {
    var saved = localStorage.getItem("magiranplus_theme") || "light";
    document.documentElement.setAttribute("data-theme", saved);
    updateThemeIcon(saved);
    var button = document.getElementById("btn-theme");
    if (button) button.addEventListener("click", function () {
      var current = document.documentElement.getAttribute("data-theme") || "light";
      var next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("magiranplus_theme", next);
      updateThemeIcon(next);
    });
  }

  function updateThemeIcon(theme) {
    var button = document.getElementById("btn-theme");
    if (button) button.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-' + (theme === "dark" ? "sun" : "moon") + '"></use></svg>';
  }

  function initTabs() {
    var tabs = [
      { btn: "tab-btn-url", panel: "tab-content-url" },
      { btn: "tab-btn-html", panel: "tab-content-html" },
      { btn: "tab-btn-bookmarklet", panel: "tab-content-bookmarklet" }
    ];
    tabs.forEach(function (tab) {
      var button = document.getElementById(tab.btn);
      if (!button) return;
      button.addEventListener("click", function () {
        tabs.forEach(function (item) {
          var itemButton = document.getElementById(item.btn);
          var panel = document.getElementById(item.panel);
          if (itemButton) {
            itemButton.classList.toggle("active", item.btn === tab.btn);
            itemButton.setAttribute("aria-selected", item.btn === tab.btn ? "true" : "false");
          }
          if (panel) panel.classList.toggle("active", item.panel === tab.panel);
        });
      });
    });
  }

  function initViewSwitcher() {
    [{ id: "view-btn-cards", name: "cards" }, { id: "view-btn-table", name: "table" }, { id: "view-btn-analytics", name: "analytics" }]
      .forEach(function (view) {
        var button = document.getElementById(view.id);
        if (!button) return;
        button.addEventListener("click", function () {
          ["view-btn-cards", "view-btn-table", "view-btn-analytics"].forEach(function (id) {
            var item = document.getElementById(id);
            if (item) item.classList.toggle("active", id === view.id);
          });
          state.view = view.name;
          renderActiveView();
        });
      });
  }

  function initControls() {
    document.querySelectorAll("#type-pills .pill-btn").forEach(function (button) {
      button.addEventListener("click", function () {
        document.querySelectorAll("#type-pills .pill-btn").forEach(function (item) { item.classList.remove("active"); });
        button.classList.add("active");
        state.filter = button.getAttribute("data-filter") || "all";
        state.page = 1;
        renderActiveView();
      });
    });
    document.querySelectorAll("#style-pills .pill-btn").forEach(function (button) {
      button.addEventListener("click", function () {
        document.querySelectorAll("#style-pills .pill-btn").forEach(function (item) { item.classList.remove("active"); });
        button.classList.add("active");
        state.citationStyle = button.getAttribute("data-style") || "apa7";
        renderActiveView();
      });
    });
    var articleFilter = document.getElementById("article-filter");
    if (articleFilter) articleFilter.addEventListener("input", function () { state.query = articleFilter.value; state.page = 1; renderActiveView(); });
    var authorFilter = document.getElementById("author-filter-select");
    if (authorFilter) authorFilter.addEventListener("change", function () { state.authorFilter = authorFilter.value; state.page = 1; renderActiveView(); });
    var targetInput = document.getElementById("target-author-input");
    if (targetInput) targetInput.addEventListener("input", function () { state.targetAuthor = targetInput.value; syncIsolateTargetButton(); renderActiveView(); });
    var isolateButton = document.getElementById("isolate-target-author");
    if (isolateButton) isolateButton.addEventListener("click", function () { state.isolateTargetAuthor = !state.isolateTargetAuthor; syncIsolateTargetButton(); renderActiveView(); });
    var boldCheck = document.getElementById("bold-target-author");
    if (boldCheck) boldCheck.addEventListener("change", function () { state.boldTargetAuthor = boldCheck.checked; renderActiveView(); });
  }

  function initActions() {
    var word = document.getElementById("btn-export-word");
    var bib = document.getElementById("btn-export-bib");
    var csv = document.getElementById("btn-export-csv");
    var json = document.getElementById("btn-export-json");
    var copy = document.getElementById("btn-copy-all");
    var print = document.getElementById("btn-print");
    if (word) word.addEventListener("click", generateWordDocument);
    if (bib) bib.addEventListener("click", exportBibTeX);
    if (csv) csv.addEventListener("click", exportCsv);
    if (json) json.addEventListener("click", exportJson);
    if (copy) copy.addEventListener("click", copyAll);
    if (print) print.addEventListener("click", function () { window.print(); });
    var selectAll = document.getElementById("select-all-articles");
    if (selectAll) selectAll.addEventListener("click", function () {
      var filtered = getFilteredArticles();
      var allSelected = filtered.length > 0 && filtered.every(function (article) { return state.selected.has(String(article.id)); });
      filtered.forEach(function (article) {
        if (allSelected) state.selected.delete(String(article.id));
        else state.selected.add(String(article.id));
      });
      renderActiveView();
      showToast(allSelected ? "انتخاب فهرست لغو شد." : "همهٔ نتایج فیلترشده انتخاب شد.");
    });

    document.addEventListener("click", function (event) {
      var copyButton = event.target.closest(".btn-copy-one");
      if (copyButton) {
        navigator.clipboard.writeText(copyButton.getAttribute("data-citation") || "").then(function () { showToast("استناد کپی شد."); });
        return;
      }
      var authorRow = event.target.closest("[data-filter-author]");
      if (authorRow) {
        state.authorFilter = authorRow.getAttribute("data-filter-author");
        var select = document.getElementById("author-filter-select");
        if (select) select.value = state.authorFilter;
        state.view = "cards";
        var cardsButton = document.getElementById("view-btn-cards");
        if (cardsButton) cardsButton.click();
        return;
      }
      var checkbox = event.target.closest(".article-check, .table-row-check");
      if (checkbox) {
        var id = String(checkbox.getAttribute("data-id"));
        if (checkbox.checked) state.selected.add(id); else state.selected.delete(id);
        renderActiveView();
        return;
      }
      var tableAll = event.target.closest("#table-select-all");
      if (tableAll) {
        getVisibleArticles().forEach(function (article) {
          if (tableAll.checked) state.selected.add(String(article.id));
          else state.selected.delete(String(article.id));
        });
        renderActiveView();
      }
    });

    var previous = document.getElementById("prev-page");
    var next = document.getElementById("next-page");
    if (previous) previous.addEventListener("click", function () { if (state.page > 1) { state.page--; renderActiveView(); } });
    if (next) next.addEventListener("click", function () {
      var totalPages = Math.max(Math.ceil(getFilteredArticles().length / state.pageSize), 1);
      if (state.page < totalPages) { state.page++; renderActiveView(); }
    });
  }

  function initHtmlImport() {
    var parseButton = document.getElementById("parse-html-btn");
    var clearButton = document.getElementById("clear-html-btn");
    var textarea = document.getElementById("raw-html");
    var dropzone = document.getElementById("html-dropzone");
    if (parseButton) parseButton.addEventListener("click", async function () {
      var html = textarea.value.trim();
      if (!html) return showToast("ابتدا HTML را وارد کنید.");
      parseButton.disabled = true;
      try {
        var response = await requestApi("/api/parse-html", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html: html, source_url: document.getElementById("profile-url").value.trim() })
        });
        var payload = await response.json();
        if (!loadDataset(payload)) throw new Error("مقاله‌ای در HTML پیدا نشد.");
        showToast(toPersianDigits(payload.count || payload.articles.length) + " مقاله آماده شد.");
      } catch (error) {
        showToast(userFacingError(error, "پردازش HTML انجام نشد."));
      } finally {
        parseButton.disabled = false;
      }
    });
    if (clearButton) clearButton.addEventListener("click", function () { textarea.value = ""; });
    if (dropzone) {
      dropzone.addEventListener("dragover", function (event) { event.preventDefault(); dropzone.classList.add("dragover"); });
      dropzone.addEventListener("dragleave", function () { dropzone.classList.remove("dragover"); });
      dropzone.addEventListener("drop", function (event) {
        event.preventDefault();
        dropzone.classList.remove("dragover");
        var file = event.dataTransfer.files && event.dataTransfer.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (loadEvent) { textarea.value = loadEvent.target.result; parseButton.click(); };
        reader.readAsText(file);
      });
    }
  }

  function handleBookmarkletHtml(html, sourceUrl) {
    var textarea = document.getElementById("raw-html");
    if (!textarea || !html) return;
    textarea.value = html;
    var input = document.getElementById("profile-url");
    if (input && sourceUrl) input.value = sourceUrl;
    var htmlTab = document.getElementById("tab-btn-html");
    if (htmlTab) htmlTab.click();
    var parseButton = document.getElementById("parse-html-btn");
    if (parseButton) parseButton.click();
  }

  function initBookmarklet() {
    var link = document.getElementById("bookmarklet-link");
    if (!link) return;
    var targetUrl = new URL(window.location.href);
    targetUrl.search = "";
    targetUrl.hash = "";
    var targetPage = targetUrl.toString();
    var targetOrigin = targetUrl.origin;
    var script = "(function(){" +
      "var target=" + JSON.stringify(targetPage + "?bookmarklet=1") + ";" +
      "var origin=" + JSON.stringify(targetOrigin) + ";" +
      "var html=document.documentElement.outerHTML;" +
      "var sourceUrl=location.href;" +
      "var targetWindow=window.open(target,'_blank');" +
      "if(!targetWindow){alert('ابتدا اجازهٔ بازشدن پنجرهٔ جدید را فعال کنید.');return;}" +
      "var attempts=0;var timer=setInterval(function(){" +
      "try{targetWindow.postMessage({type:'magiranplus-html',html:html,sourceUrl:sourceUrl},origin);}" +
      "catch(error){}" +
      "attempts++;if(attempts>30)clearInterval(timer);" +
      "},500);" +
      "})();";
    link.href = "javascript:" + script;
  }

  function checkBookmarkletImport() {
    window.addEventListener("message", function (event) {
      if (!event.data || event.data.type !== "magiranplus-html") return;
      if (event.origin !== "https://magiran.com" && event.origin !== "https://www.magiran.com") return;
      handleBookmarkletHtml(String(event.data.html || ""), String(event.data.sourceUrl || ""));
    });
    try {
      var stored = localStorage.getItem("magiran_import_html");
      if (!stored) return;
      localStorage.removeItem("magiran_import_html");
      handleBookmarkletHtml(stored, "");
    } catch (_error) {
      // Private browsing may disable localStorage; postMessage remains available.
    }
  }

  function normalizeInputUrl(value) {
    var url = String(value || "").trim();
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    return url;
  }

  function initForm() {
    var form = document.getElementById("profile-form");
    var input = document.getElementById("profile-url");
    var clearButton = document.getElementById("clear-profile-url");
    if (!form || !input) return;
    function syncClear() { if (clearButton) clearButton.hidden = !input.value; }
    input.addEventListener("input", syncClear);
    syncClear();
    if (clearButton) clearButton.addEventListener("click", function () { input.value = ""; syncClear(); input.focus(); });
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var url = normalizeInputUrl(input.value);
      if (!url) return showToast("لطفاً لینک جست‌وجوی مگ‌ایران را وارد کنید.");
      setLoadingState(true);
      try {
        var payload = await requestSearch(url);
        if (!loadDataset(payload)) throw new Error("در این جست‌وجو مقاله‌ای پیدا نشد.");
        showToast(toPersianDigits(payload.count || payload.articles.length) + " مقاله آماده شد.");
        if (!payload.complete) showToast("برخی صفحه‌ها دریافت نشدند؛ وضعیت بالا را بررسی کنید.");
      } catch (error) {
        showToast(userFacingError(error, "اتصال به مگ‌ایران برقرار نشد؛ حالت HTML را امتحان کنید."));
      } finally {
        setLoadingState(false);
      }
    });

    var params = new URLSearchParams(window.location.search);
    var sharedUrl = params.get("search-url") || params.get("profile-url");
    if (sharedUrl && sharedUrl.trim()) {
      input.value = sharedUrl.trim();
      syncClear();
      window.setTimeout(function () { if (typeof form.requestSubmit === "function") form.requestSubmit(); }, 0);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    initTabs();
    initViewSwitcher();
    initControls();
    initActions();
    initHtmlImport();
    initForm();
    initBookmarklet();
    checkBookmarkletImport();
  });
})();
