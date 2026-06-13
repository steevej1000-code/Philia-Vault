/* ============================================================
   PHILIA VAULT — PRE-LAUNCH LANDING PAGE LOGIC (FLASK STATIC)
   ============================================================ */

const API_BASE = ''; // Same origin relative calls since it is hosted on the same Flask server

// ─── LANGUAGE DETECTION & TRANSLATION ───────────────────────
let currentLang = 'en';

function detectLanguage() {
    const userLang = navigator.language || navigator.userLanguage;
    let detected = 'en';
    if (userLang.startsWith('fr')) detected = 'fr';
    else if (userLang.startsWith('es')) detected = 'es';
    else if (userLang.startsWith('pt')) detected = 'pt';
    
    setLanguage(detected);
}

function setLanguage(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;
    
    // Toggle active state on language buttons
    const buttons = ['en', 'fr', 'es', 'pt'];
    buttons.forEach(b => {
        const btn = document.getElementById(`btn-${b}`);
        if (btn) {
            if (b === lang) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });
}

// ─── FOUNDER SPOT DYNAMICS ──────────────────────────────────
let spotsRemaining = 10;

async function updateSpotsCounter() {
    try {
        const response = await fetch(`${API_BASE}/api/founder/count`);
        const data = await response.json();
        if (data.success) {
            spotsRemaining = data.count;
            renderSpots();
        }
    } catch (e) {
        console.error("Could not fetch founder spot count:", e);
        renderSpots();
    }
}

function renderSpots() {
    const spotNums = document.querySelectorAll('.spots-num');
    spotNums.forEach(el => {
        el.textContent = spotsRemaining;
    });

    const progressFill = document.getElementById('spots-progress-fill');
    if (progressFill) {
        const percentage = (spotsRemaining / 10) * 100;
        progressFill.style.width = `${percentage}%`;
    }

    const checkoutBlock = document.getElementById('checkout-block');
    const waitlistBlock = document.getElementById('waitlist-block');
    
    if (spotsRemaining <= 0) {
        if (checkoutBlock) checkoutBlock.classList.add('d-none');
        if (waitlistBlock) waitlistBlock.classList.remove('d-none');
    } else {
        if (checkoutBlock) checkoutBlock.classList.remove('d-none');
        if (waitlistBlock) waitlistBlock.classList.add('d-none');
        initSquareForm();
    }
}

// ─── SQUARE PAYMENTS INTEGRATION ────────────────────────────
let squareCardInstance = null;
let isSquareInitialized = false;

async function initSquareForm() {
    if (isSquareInitialized) return;
    isSquareInitialized = true;

    let applicationId = 'sandbox-sq0idb-mKlh6wJ3bL1j0gR9_M-nPA'; 
    let locationId = 'sandbox-location-id';

    if (typeof Square === 'undefined') {
        console.error("Square SDK script failed to load. Checkout disabled.");
        return;
    }

    try {
        const payments = Square.payments(applicationId, locationId);
        squareCardInstance = await payments.card();
        await squareCardInstance.attach('#card-container');
    } catch (e) {
        console.error("Failed to attach Square Card element:", e);
    }
}

// ─── FORM SUBMISSIONS ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    detectLanguage();
    updateSpotsCounter();

    const paymentForm = document.getElementById('payment-form');
    if (paymentForm) {
        paymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = document.getElementById('card-button');
            const statusMessage = document.getElementById('payment-status-message');
            
            if (submitBtn) submitBtn.disabled = true;
            statusMessage.style.display = 'none';

            if (!squareCardInstance) {
                showStatus(statusMessage, "Square Card Payment SDK is not initialized. Please try refreshing.", false);
                if (submitBtn) submitBtn.disabled = false;
                return;
            }

            try {
                const result = await squareCardInstance.tokenize();
                if (result.status === 'OK') {
                    const email = document.getElementById('founder-email').value;
                    const name = document.getElementById('founder-name').value;
                    
                    const apiResponse = await fetch(`${API_BASE}/api/founder/purchase`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: email,
                            name: name,
                            source_id: result.token,
                            lang: currentLang
                        })
                    });
                    
                    const responseData = await apiResponse.json();
                    if (responseData.success) {
                        showStatus(statusMessage, 
                            currentLang === 'fr' 
                                ? `Félicitations ${name} ! Votre place de membre fondateur est réservée 🔒`
                                : `Congratulations ${name}! Your founder spot is secured 🔒`, 
                            true
                        );
                        spotsRemaining = responseData.remaining_spots ?? (spotsRemaining - 1);
                        renderSpots();
                        paymentForm.reset();
                    } else {
                        showStatus(statusMessage, responseData.error || "Payment processing failed.", false);
                    }
                } else {
                    let tokenError = result.errors[0]?.message || "Card tokenization failed.";
                    showStatus(statusMessage, tokenError, false);
                }
            } catch (err) {
                showStatus(statusMessage, "An error occurred while processing transaction: " + err.message, false);
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    const waitlistForm = document.getElementById('waitlist-form');
    if (waitlistForm) {
        waitlistForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('waitlist-email').value;
            const statusMessage = document.getElementById('waitlist-status-message');
            statusMessage.style.display = 'none';

            try {
                const apiResponse = await fetch(`${API_BASE}/api/founder/waitlist`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: email,
                        lang: currentLang
                    })
                });
                
                const responseData = await apiResponse.json();
                if (responseData.success) {
                    showStatus(statusMessage, 
                        currentLang === 'fr'
                            ? "Vous avez rejoint la liste d'attente avec succès ! Nous vous tiendrons au courant."
                            : "You have joined the waitlist successfully! We'll keep you updated.", 
                        true
                    );
                    waitlistForm.reset();
                } else {
                    showStatus(statusMessage, responseData.error || "Could not add to waitlist.", false);
                }
            } catch (err) {
                showStatus(statusMessage, "An error occurred: " + err.message, false);
            }
        });
    }
});

function showStatus(element, text, isSuccess) {
    element.textContent = text;
    element.className = isSuccess ? 'status-success' : 'status-error';
    element.style.display = 'block';
}
