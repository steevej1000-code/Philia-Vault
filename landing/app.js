/* ============================================================
   PHILIA VAULT — LANDING PAGE LOGIC (V2)
   ============================================================ */

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5001'
  : 'https://philia-vault-api.onrender.com';

let STRIPE_PUBLISHABLE_KEY = '';

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
    const res = await fetch(`${API_BASE}/api/founder/count`);
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
      const res = await fetch(`${API_BASE}/api/founder/waitlist`, {
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

/* ---------- Stripe checkout ---------- */
let stripe = null;
let cardElement = null;

async function initStripe() {
  const container = document.getElementById('card-container');
  const button = document.getElementById('card-button');
  if (!container || !button) return;

  // Fetch Stripe config dynamically from backend
  try {
    const configRes = await fetch(`${API_BASE}/api/founder/stripe-config`);
    if (configRes.ok) {
      const configData = await configRes.json();
      STRIPE_PUBLISHABLE_KEY = configData.publishableKey;
    }
  } catch (err) {
    console.error("Failed to fetch Stripe config:", err);
  }

  if (!STRIPE_PUBLISHABLE_KEY) {
    button.disabled = true;
    return;
  }

  if (!window.Stripe) {
    button.disabled = true;
    return;
  }

  try {
    stripe = window.Stripe(STRIPE_PUBLISHABLE_KEY);
    const elements = stripe.elements();
    
    // Style matches the dark theme and neon details of Philia Vault
    const style = {
      base: {
        color: '#FFFFFF',
        fontFamily: '"Space Mono", monospace',
        fontSmoothing: 'antialiased',
        fontSize: '14px',
        '::placeholder': {
          color: '#A0A0A0',
        },
        backgroundColor: '#0D0D14',
      },
      invalid: {
        color: '#FF4444',
        iconColor: '#FF4444',
      },
    };

    cardElement = elements.create('card', { style });
    cardElement.mount('#card-container');
  } catch (err) {
    button.disabled = true;
  }

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('payment-status-message');
    const nameEl = document.getElementById('founder-name');
    const emailEl = document.getElementById('founder-email');
    const email = emailEl ? emailEl.value.trim() : '';

    if (!email) {
      statusEl.textContent = 'Please enter your email address.';
      statusEl.className = 'error';
      return;
    }
    if (!stripe || !cardElement) {
      statusEl.textContent = 'Payment form is unavailable right now.';
      statusEl.className = 'error';
      return;
    }

    button.disabled = true;
    statusEl.textContent = 'Processing...';
    statusEl.className = '';

    try {
      const { token, error } = await stripe.createToken(cardElement, {
        name: nameEl ? nameEl.value.trim() : undefined,
      });

      if (error) {
        throw new Error(error.message);
      }

      const res = await fetch(`${API_BASE}/api/founder/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: token.id,
          email,
          name: nameEl ? nameEl.value.trim() : '',
          lang: window.__philiaLang || detectLang(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Purchase failed');
      }

      statusEl.textContent = '';
      const memberNumEl = document.getElementById('member-number');
      if (memberNumEl) memberNumEl.textContent = '#' + (data.member_number || data.payment_id.slice(-6).toUpperCase());

      document.getElementById('checkout-block').style.display = 'none';
      const waitlist = document.getElementById('waitlist-block');
      if (waitlist) waitlist.style.display = 'none';
      document.getElementById('success-screen').style.display = 'block';

      updateSpotCounter();
    } catch (err) {
      statusEl.textContent = err.message || 'Something went wrong. Please try again.';
      statusEl.className = 'error';
      button.disabled = false;
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
  initStripe();
});

/* ---------- Visual mockup tab switcher ---------- */
function switchTab(index) {
  const tabs = document.querySelectorAll('.visual-tab-btn');
  const panels = document.querySelectorAll('.visual-panel');

  tabs.forEach((tab, i) => {
    tab.classList.toggle('active', i === index);
  });

  panels.forEach((panel, i) => {
    panel.classList.toggle('active', i === index);
  });
}
