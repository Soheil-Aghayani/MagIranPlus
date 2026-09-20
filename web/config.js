(function configureMagIranApi() {
  var localHosts = ["127.0.0.1", "localhost"];
  var isLocal = localHosts.indexOf(window.location.hostname) >= 0;

  // A separate public API can be supplied here when MagIranPlus is deployed.
  // Keeping the default empty makes the local Flask server the source of truth.
  var publicApi = window.MAGIRAN_PUBLIC_API_BASE_URL || "";
  window.MAGIRAN_API_BASE_URL = isLocal ? "" : publicApi;
})();
