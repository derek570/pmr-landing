/* PMR Bike Couriers — quote form
   The site is static, so the form builds a WhatsApp message to the PMR number
   rather than posting to a server. The "Send it by email" link builds the same
   text as an email for visitors without WhatsApp. On a computer the form
   sends by email from the start. A ?service= link from the
   services page preselects the matching option. */
(function () {
  const form = document.getElementById("quote-form");
  if (!form) return;

  const wanted = new URLSearchParams(location.search).get("service");
  if (wanted) {
    const select = form.elements.service;
    const match = [...select.options].find((o) => o.text.toLowerCase().startsWith(wanted.toLowerCase()));
    if (match) select.value = match.value;
  }

  const WHATSAPP = "447495749650";
  const EMAIL = "pmrbikecouriers@gmail.com";

  // Returns the request text, or null after focusing the name field when it's empty.
  function request() {
    const f = form.elements;
    if (!f.name.value.trim()) {
      f.name.focus();
      return null;
    }
    // Leave out fields the visitor didn't fill in.
    const lines = [
      ["Name", f.name.value],
      ["Phone", f.phone.value],
      ["Service", f.service.value],
      ["Bike", f.bike.value],
      ["Date", f.date.value],
      ["Collect from", f.from.value],
      ["Deliver to", f.to.value],
    ].filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v}`);
    if (f.message.value.trim()) lines.push("", f.message.value);
    return { subject: `Quote request — ${f.service.value}`, text: lines.join("\n") };
  }

  // On a computer (see isComputer in main.js) the form sends by email instead.
  const byEmail = typeof isComputer === "function" && isComputer();
  if (byEmail) {
    form.querySelector('button[type="submit"]').textContent = "Send request";
    form.querySelector("p").textContent = "Fill this in and it opens your email app with everything ready to send.";
    form.querySelector(".form__note").innerHTML = 'Prefer to talk? Call <a href="tel:07495749650">07495 749 650</a>.';
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const r = request();
    if (!r) return;
    if (byEmail) {
      sendEmail(r);
      return;
    }
    const text = `${r.subject}\n\n${r.text}`;
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  });

  document.getElementById("quote-email")?.addEventListener("click", (e) => {
    e.preventDefault();
    const r = request();
    if (r) sendEmail(r);
  });

  function sendEmail(r) {
    location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(r.subject)}&body=${encodeURIComponent(r.text)}`;
  }
})();
