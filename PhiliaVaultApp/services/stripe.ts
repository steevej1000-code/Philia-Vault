/**
 * Stripe Checkout Service (Web only)
 *
 * Flow:
 * 1. App calls stripeCheckout(plan) with user email
 * 2. Backend creates a Stripe Checkout Session and returns the URL
 * 3. App redirects the browser to Stripe's hosted checkout page
 * 4. After payment, Stripe redirects to success/cancel URL
 * 5. Backend webhook receives stripe event → sets premium_status = 1
 *
 * Backend endpoint needed (Flask):
 *   POST /api/stripe/create-checkout-session
 *   Headers: X-User-Email: <email>
 *   Body: { plan: 'monthly' | 'yearly' }
 *   Response: { url: string }  ← Stripe Checkout URL
 *
 * Also needed in Flask:
 *   POST /api/stripe/webhook  ← Stripe sends checkout.session.completed here
 *
 * Environment variables needed (.env.local):
 *   EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
 *   (Backend needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET)
 */

import { API_BASE } from '../constants/api';
import { storage } from './storage';

/** Seul plan disponible : mensuel $9.99 avec 3 jours d'essai gratuit. */
const TRIAL_DAYS = 3;

export const STRIPE_PRICE_ID_MONTHLY =
  process.env.EXPO_PUBLIC_STRIPE_PRICE_MONTHLY ?? 'price_monthly_placeholder';

/**
 * Create a Stripe Checkout session and redirect the browser to it.
 * Includes a 3-day free trial via subscription_data.trial_period_days.
 */
export async function stripeCheckout(): Promise<void> {
  const userEmail = await storage.getItem('user_email');

  const response = await fetch(`${API_BASE}/api/stripe/create-checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userEmail ? { 'X-User-Email': userEmail } : {}),
    },
    body: JSON.stringify({
      plan:             'monthly',
      price_id:         STRIPE_PRICE_ID_MONTHLY,
      trial_period_days: TRIAL_DAYS,
      success_url: `${window.location.origin}/stripe-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${window.location.origin}/paywall`,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error ?? `Erreur serveur ${response.status}`);
  }

  const { url } = await response.json();
  if (!url) throw new Error('URL de paiement non reçue du serveur.');

  // Redirect to Stripe Hosted Checkout
  window.location.href = url;
}

/**
 * Called from the /stripe-success page after Stripe redirects back.
 * Verifies the session with the backend and activates premium.
 */
export async function verifyStripeSession(sessionId: string): Promise<boolean> {
  const userEmail = await storage.getItem('user_email');

  const response = await fetch(`${API_BASE}/api/stripe/verify-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userEmail ? { 'X-User-Email': userEmail } : {}),
    },
    body: JSON.stringify({ session_id: sessionId }),
  });

  if (!response.ok) return false;
  const data = await response.json();
  return data.success === true;
}

/**
 * Flask snippet to add to server.py:
 *
 * import stripe
 * stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')
 *
 * @app.route('/api/stripe/create-checkout-session', methods=['POST'])
 * def create_stripe_session():
 *     user_email = request.headers.get('X-User-Email')
 *     data = request.json
 *     plan = data.get('plan', 'monthly')
 *     price_id = data.get('price_id')
 *
 *     session = stripe.checkout.Session.create(
 *         payment_method_types=['card'],
 *         mode='subscription',
 *         customer_email=user_email,
 *         line_items=[{'price': price_id, 'quantity': 1}],
 *         success_url=data.get('success_url'),
 *         cancel_url=data.get('cancel_url'),
 *         metadata={'user_email': user_email, 'plan': plan},
 *     )
 *     return jsonify({'url': session.url})
 *
 * @app.route('/api/stripe/webhook', methods=['POST'])
 * def stripe_webhook():
 *     payload = request.data
 *     sig_header = request.headers.get('Stripe-Signature')
 *     event = stripe.Webhook.construct_event(
 *         payload, sig_header, os.environ.get('STRIPE_WEBHOOK_SECRET')
 *     )
 *     if event['type'] == 'checkout.session.completed':
 *         session = event['data']['object']
 *         user_email = session['metadata'].get('user_email')
 *         # Set premium_status = 1 in your DB
 *         db.execute("UPDATE users SET premium_status=1 WHERE email=?", [user_email])
 *         db.commit()
 *     return jsonify({'received': True})
 *
 * @app.route('/api/stripe/verify-session', methods=['POST'])
 * def verify_stripe_session():
 *     user_email = request.headers.get('X-User-Email')
 *     session_id = request.json.get('session_id')
 *     session = stripe.checkout.Session.retrieve(session_id)
 *     if session.payment_status == 'paid':
 *         db.execute("UPDATE users SET premium_status=1 WHERE email=?", [user_email])
 *         db.commit()
 *         return jsonify({'success': True})
 *     return jsonify({'success': False})
 */
