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
  initTracking();
});

/* ============================================
   PHILIA VAULT — GA4 / META / TIKTOK TRACKING
   ============================================ */
function trackEvent(eventName, params = {}) {
  if (typeof gtag !== 'undefined') {
    gtag('event', eventName, {
      ...params,
      page_language: (window.__philiaLang || detectLang()),
      timestamp: new Date().toISOString()
    });
  }
}

function trackMeta(event, params = {}) {
  if (typeof fbq !== 'undefined') {
    fbq('track', event, params);
  }
}

function trackTikTok(event, params = {}) {
  if (typeof ttq !== 'undefined') {
    ttq.track(event, params);
  }
}

function initTracking() {
  // 1. CTA Stripe clicks
  document.querySelectorAll('a[href*="stripe"], a[href*="buy.stripe"]').forEach((btn) => {
    btn.addEventListener('click', function () {
      trackEvent('cta_click_stripe', {
        event_category: 'conversion',
        event_label: 'founder_spot_purchase',
        value: 4.99,
        currency: 'USD',
        button_text: this.textContent.trim().substring(0, 50)
      });
      trackMeta('InitiateCheckout', {
        value: 4.99,
        currency: 'USD',
        content_name: 'Philia Vault Founder Spot',
        num_items: 1
      });
      trackTikTok('InitiateCheckout', {
        value: 4.99,
        currency: 'USD',
        content_id: 'philia_vault_founder',
        content_type: 'product'
      });
    });
  });

  // 2. Sticky cart reserve button
  const stickyBtn = document.querySelector('.sticky-btn, #sticky-cart a');
  if (stickyBtn) {
    stickyBtn.addEventListener('click', function () {
      trackEvent('sticky_cta_click', {
        event_category: 'conversion',
        event_label: 'sticky_reserve_button',
        value: 4.99,
        currency: 'USD'
      });
    });
  }

  // 3. Scroll depth tracking
  const scrollMilestones = { 25: false, 50: false, 75: false, 90: false };
  window.addEventListener('scroll', function () {
    const scrollPct = Math.round(
      (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
    );
    [25, 50, 75, 90].forEach((milestone) => {
      if (scrollPct >= milestone && !scrollMilestones[milestone]) {
        scrollMilestones[milestone] = true;
        trackEvent('scroll_depth', {
          event_category: 'engagement',
          event_label: `scrolled_${milestone}_percent`,
          scroll_percentage: milestone
        });
      }
    });
  }, { passive: true });

  // 4. Language switch
  document.querySelectorAll('.lang-switch button').forEach((btn) => {
    btn.addEventListener('click', function () {
      trackEvent('language_switch', {
        event_category: 'engagement',
        event_label: 'language_changed',
        selected_language: this.dataset.setLang || this.textContent.trim()
      });
    });
  });

  // 5. Time on page
  let timeOnPage = 0;
  const timeIntervals = [30, 60, 120, 180];
  const trackedTimes = new Set();
  setInterval(() => {
    timeOnPage += 10;
    timeIntervals.forEach((t) => {
      if (timeOnPage >= t && !trackedTimes.has(t)) {
        trackedTimes.add(t);
        trackEvent('time_on_page', {
          event_category: 'engagement',
          event_label: `${t}_seconds`,
          seconds: t
        });
      }
    });
  }, 10000);

  // 6. FAQ clicks
  document.querySelectorAll('.faq-question').forEach((item, index) => {
    item.addEventListener('click', function () {
      trackEvent('faq_click', {
        event_category: 'engagement',
        event_label: 'faq_opened',
        faq_index: index + 1
      });
    });
  });

  // 7. Passive income section viewed
  const passiveSection = document.querySelector('.passive-section, #passive, section[id*="passive"]');
  if (passiveSection) {
    const passiveObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          trackEvent('passive_section_viewed', {
            event_category: 'engagement',
            event_label: 'passive_income_section_visible'
          });
          passiveObserver.disconnect();
        }
      });
    }, { threshold: 0.5 });
    passiveObserver.observe(passiveSection);
  }

  // 8. Subscribe to unlock clicks
  document.querySelectorAll('a[href="#offer"], .subscribe-unlock-btn').forEach((btn) => {
    btn.addEventListener('click', function () {
      trackEvent('subscribe_unlock_click', {
        event_category: 'engagement',
        event_label: 'passive_income_cta'
      });
    });
  });

  // 9. Exit intent
  let exitTracked = false;
  document.addEventListener('mouseleave', function (e) {
    if (e.clientY < 0 && !exitTracked) {
      exitTracked = true;
      trackEvent('exit_intent', {
        event_category: 'engagement',
        event_label: 'user_about_to_leave',
        scroll_percentage: Math.round(
          (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
        )
      });
    }
  });

  console.log('[Philia Vault] GA4/Meta/TikTok tracking initialized ✓');
}

/* ---------- Beta Countdown ---------- */
function updateBetaCountdown() {
  const betaDate = new Date('2026-07-15'); // Ajuster à la vraie date prévue
  const today = new Date();
  const diffTime = betaDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  document.querySelectorAll('#days-counter').forEach(el => {
    el.textContent = diffDays > 0 ? diffDays : '0';
  });
}
updateBetaCountdown();
