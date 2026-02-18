(() => {
  const input = document.getElementById("slug");
  const searchBtn = document.querySelector(".btn-container button");

  function go() {
    const value = (input.value || "").trim().replace(/^\/+/, "");
    if (!value) return input.focus();
    window.location.href = "/" + encodeURIComponent(value);
  }

  // Click button
  if (searchBtn) {
    searchBtn.addEventListener("click", go);
  }

  // Press Enter
  if (input) {
    input.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        go();
      }
    });
  }
})();