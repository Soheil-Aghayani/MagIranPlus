(function configureMagIranApi() {
  var localHosts = ["127.0.0.1", "localhost"];
  var isLocal = localHosts.indexOf(window.location.hostname) >= 0;

  // Localhost uses the same-origin Flask server. The public Pages build uses
  // an Iranian-network local API first, then the separately deployed service.
  var localApi = window.MAGIRAN_LOCAL_API_BASE_URL || "http://127.0.0.1:5000";
  var publicApi = window.MAGIRAN_PUBLIC_API_BASE_URL || "https://magiranplus-api.onrender.com";
  window.MAGIRAN_LOCAL_API_BASE_URL = localApi.replace(/\/+$/, "");
  window.MAGIRAN_API_BASE_URL = isLocal ? "" : publicApi;
})();
