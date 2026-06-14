/* ============================================================
   PHILIA VAULT — LANDING PAGE LOGIC (V2)
   ============================================================ */

/* ---------- Language detection & switching ---------- */
function detectLang() {
  const saved = window.__philiaLang;
  if (saved) return saved;
  const nav = (navigator.language || 'en').toLowerCase();
  if (nav.startsWith('fr')) return 'fr';
  if (nav.startsWith('es')) return 'es';
  if (nav.startsWith('pt')) return 'pt';
  return 'en';
}

function applyLang(lang) {
  window.__philiaLang = lang;
  document.documentElement.setAttribute('lang', lang);

  document.querySelectorAll('[data-lang]').forEach((el) => {
    if (el.getAttribute('data-lang') !== lang) {
      el.style.display = 'none';
      return;
    }
    if (el.classList.contains('inline')) el.style.display = 'inline';
    else if (el.classList.contains('flex')) el.style.display = 'flex';
    else if (el.classList.contains('block')) el.style.display = 'block';
    else el.style.display = '';
  });

  document.querySelectorAll('.lang-switch button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.setLang === lang);
  });
}

function initLangSwitcher() {
  document.querySelectorAll('.lang-switch button').forEach((btn) => {
    btn.addEventListener('click', () => applyLang(btn.dataset.setLang));
  });
}

/* ---------- Scroll reveal ---------- */
function initFadeUp() {
  const items = document.querySelectorAll('.fade-up');
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  items.forEach((el) => observer.observe(el));
}

/* ---------- FAQ accordion ---------- */
function initFaq() {
  document.querySelectorAll('.faq-question').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      item.classList.toggle('open');
    });
  });
}

/* ---------- Founder spot counter ---------- */
async function updateSpotCounter() {
  try {
    const res = await fetch('/api/founder/count');
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    const remaining = Math.max(0, data.remaining);
    const total = data.total || 10;

    document.querySelectorAll('.spot-counter').forEach((el) => {
      el.textContent = remaining;
    });

    const fill = document.getElementById('spots-progress-fill');
    if (fill) {
      const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
      fill.style.width = pct + '%';
    }

    if (remaining <= 0) {
      const checkout = document.getElementById('checkout-block');
      const waitlist = document.getElementById('waitlist-block');
      if (checkout) checkout.style.display = 'none';
      if (waitlist) waitlist.style.display = 'block';
    }
  } catch (err) {
    // Silently fail — counter stays at default value.
  }
}

/* ---------- Waitlist form ---------- */
function initWaitlist() {
  const form = document.getElementById('waitlist-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('waitlist-email').value.trim();
    const statusEl = document.getElementById('waitlist-status-message');
    if (!email) return;

    try {
      const res = await fetch('/api/founder/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, lang: window.__philiaLang || detectLang() })
      });
      if (!res.ok) throw new Error('failed');
      statusEl.textContent = "You're on the list. We'll be in touch.";
      statusEl.className = 'success';
      form.reset();
    } catch (err) {
      statusEl.textContent = 'Something went wrong. Please try again.';
      statusEl.className = 'error';
    }
  });
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  applyLang(detectLang());
  initLangSwitcher();
  initFadeUp();
  initFaq();
  initWaitlist();
  updateSpotCounter();
});
