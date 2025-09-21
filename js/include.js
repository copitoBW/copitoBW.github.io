document.addEventListener("DOMContentLoaded", () => {
  loadHTML("header-placeholder", "html/header.html");
  loadHTML("footer-placeholder", "html/footer.html");
});

function loadHTML(id, url) {
  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`Failed to load ${url}`);
      return response.text();
    })
    .then(data => {
      document.getElementById(id).innerHTML = data;
    })
    .catch(error => {
      console.error(error);
    });
}