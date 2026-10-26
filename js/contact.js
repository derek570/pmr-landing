/* PMR Bike Couriers — quote form
   The site is static, so the form builds an email in the visitor's own mail app
   rather than posting to a server. A ?service= link from the services page
   preselects the matching option. */
(function () {
  const form = document.getElementById("quote-form");
  if (!form) return;

  const wanted = new URLSearchParams(location.search).get("service");
  if (wanted) {
    const select = form.elements.service;
    const match = [...select.options].find((o) => o.text.toLowerCase().startsWith(wanted.toLowerCase()));
    if (match) select.value = match.value;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = form.elements;
    if (!f.name.value.trim()) {
      f.name.focus();
      return;
    }
    const lines = [
      `Name: ${f.name.value}`,
      `Phone: ${f.phone.value}`,
      `Service: ${f.service.value}`,
      `Bike: ${f.bike.value}`,
      `Date: ${f.date.value}`,
      `Collect from: ${f.from.value}`,
      `Deliver to: ${f.to.value}`,
      "",
      f.message.value,
    ];
    const subject = `Quote request — ${f.service.value}`;
    location.href =
      "mailto:pmrbikecouriers@gmail.com?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(lines.join("\n"));
  });
})();
