(function configureMagIranApi() {
  var localHosts = ["127.0.0.1", "localhost"];
  var isLocal = localHosts.indexOf(window.location.hostname) >= 0;

  // Localhost uses the same-origin Flask server. The public Pages build uses
  // the separately deployed MagIranPlus API service.
  var publicApi = window.MAGIRAN_PUBLIC_API_BASE_URL || "https://magiranplus-api.onrender.com";
  window.MAGIRAN_API_BASE_URL = isLocal ? "" : publicApi;
})();
