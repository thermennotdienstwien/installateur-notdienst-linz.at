(() => {
  const loadOnce = (() => {
    const cache = new Map();
    return (src) => {
      if (cache.has(src)) return cache.get(src);
      const p = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.defer = true;
        s.onload = () => resolve(true);
        s.onerror = () => reject(new Error("Script load failed"));
        document.head.appendChild(s);
      });
      cache.set(src, p);
      return p;
    };
  })();

  const qs = (sel, root = document) => root.querySelector(sel);

  function getFeedback(form) {
    return (
      qs('[data-form-feedback]', form) ||
      (form.parentElement ? qs('[data-form-feedback]', form.parentElement) : null)
    );
  }

  function show(feedback, type, title, text) {
    if (!feedback) return;
    const box = feedback.firstElementChild || feedback;
    const t = qs("[data-form-feedback-title]", feedback);
    const p = qs("[data-form-feedback-text]", feedback);

    feedback.classList.remove("hidden");

    box.classList.remove(
      "bg-white/60",
      "bg-red-100",
      "bg-green-100",
      "border-red-300",
      "border-green-300",
      "border-white/30"
    );

    if (type === "success") box.classList.add("bg-green-100", "border-green-300");
    else if (type === "error") box.classList.add("bg-red-100", "border-red-300");
    else box.classList.add("bg-white/60", "border-white/30");

    if (t) t.textContent = title || "";
    if (p) p.textContent = text || "";
  }

  async function ensureRecaptcha(siteKey) {
    if (!siteKey) throw new Error("Missing reCAPTCHA site key");
    await loadOnce("https://www.google.com/recaptcha/api.js?render=" + encodeURIComponent(siteKey));
    if (!window.grecaptcha) throw new Error("grecaptcha not available");
  }

  async function getToken(siteKey) {
    await ensureRecaptcha(siteKey);
    return await new Promise((resolve, reject) => {
      window.grecaptcha.ready(() => {
        window.grecaptcha.execute(siteKey, { action: "kontakt" }).then(resolve).catch(reject);
      });
    });
  }

  function init(form) {
    if (!form) return;

    const btn = qs('button[type="button"]', form);
    const privacy = qs("#privacy", form);
    const feedback = getFeedback(form);
    const siteKey = form.dataset.recaptcha || "";

    const setBtnState = () => {
      if (btn && privacy) btn.disabled = !privacy.checked;
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    if (privacy) {
      privacy.addEventListener("change", async () => {
        setBtnState();
        if (privacy.checked && siteKey) {
          try {
            await ensureRecaptcha(siteKey);
          } catch (_) {}
        }
      });
    }

    setBtnState();

    if (!btn) return;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!form.reportValidity()) return;

      if (privacy && !privacy.checked) {
        show(
          feedback,
          "error",
          "Datenschutz bestätigen",
          "Bitte stimmen Sie der Datenschutzerklärung zu, um fortzufahren."
        );
        return;
      }

      btn.disabled = true;
      show(feedback, "info", "Wird gesendet…", "Bitte einen Moment warten.");

      try {
        const token = await getToken(siteKey);

        const fd = new FormData(form);

        const address = String(fd.get("address") || "").trim();
        const plz = String(fd.get("plz") || "").trim();
        const ort = String(fd.get("ort") || "").trim();
        const msg = String(fd.get("msg") || "").trim();
        const service = String(fd.get("service") || "").trim();

        if (!fd.get("adresse") && address) fd.set("adresse", address);

        let nachricht = String(fd.get("nachricht") || "").trim();
        if (!nachricht && msg) nachricht = msg;

        const extra = [
          address ? `Adresse: ${address}` : "",
          plz ? `PLZ: ${plz}` : "",
          service ? `Service: ${service}` : "",
          ort ? `Ort: ${ort}` : ""
        ].filter(Boolean).join(" | ");

        if (extra) nachricht = nachricht ? `${nachricht}\n\n${extra}` : extra;

        fd.set("nachricht", nachricht);
        fd.set("tos", "1");
        fd.set("g-recaptcha-response", token);

        const res = await fetch(form.action, { method: "POST", body: fd });
        const text = (await res.text().catch(() => "")) || "";

        if (res.ok) {
          show(
            feedback,
            "success",
            "Vielen Dank!",
            text.trim() || "Vielen Dank für Ihre Anfrage! Wir melden uns in Kürze."
          );
          form.reset();
          setBtnState();
        } else {
          show(
            feedback,
            "error",
            "Es ist ein Fehler aufgetreten.",
            text.trim() || `Anfrage konnte nicht gesendet werden (HTTP ${res.status}).`
          );
          setBtnState();
        }
      } catch (_) {
        show(
          feedback,
          "error",
          "Es ist ein Fehler aufgetreten.",
          "Die Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut oder deaktivieren Sie ggf. Script-Blocker."
        );
        setBtnState();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('form[data-recaptcha][action*="contact.visiopartners.at"]').forEach(init);
  });
})();