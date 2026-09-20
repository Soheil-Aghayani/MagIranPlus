(function configureMagIranApi() {
  var localHosts = ["127.0.0.1", "localhost"];
  var isLocal = localHosts.indexOf(window.location.hostname) >= 0;

  // Localhost uses the same-origin Flask server. The public Pages build uses
  // the configured public API first so visitors do not need a local install;
  // the local API remains an optional fallback for private/local use.
  var localApi = window.MAGIRAN_LOCAL_API_BASE_URL || "http://127.0.0.1:5000";
  var publicApi = window.MAGIRAN_PUBLIC_API_BASE_URL || "https://magiranplus-api.onrender.com";
  var preferLocal = window.MAGIRAN_PREFER_LOCAL_API === true;
  window.MAGIRAN_LOCAL_API_BASE_URL = localApi.replace(/\/+$/, "");
  window.MAGIRAN_API_BASE_URL = isLocal ? "" : publicApi;
  window.MAGIRAN_PREFER_LOCAL_API = preferLocal;
})();
