import os
import stripe
from flask import Blueprint, request, jsonify
import database
from services.meta_conversions import send_purchase_event
from services.email_service import send_confirmation_email

stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')
WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET')

stripe_webhook_bp = Blueprint('stripe_webhook', __name__)

@stripe_webhook_bp.route('/api/webhooks/stripe', methods=['POST'])
def handle_stripe_webhook():
    payload = request.get_data()
    sig_header = request.headers.get('Stripe-Signature')

    # ============================================
    # 1. VÉRIFIER LA SIGNATURE (sécurité critique)
    # ============================================
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, WEBHOOK_SECRET
        )
    except ValueError:
        print('[Stripe Webhook] Payload invalide')
        return jsonify({'error': 'invalid_payload'}), 400
    except stripe.error.SignatureVerificationError:
        print('[Stripe Webhook] Signature invalide — requête potentiellement frauduleuse')
        return jsonify({'error': 'invalid_signature'}), 400
    except Exception as e:
        print(f'[Stripe Webhook] Erreur inattendue: {e}')
        return jsonify({'error': 'webhook_error'}), 400

    # ============================================
    # 2. TRAITER L'ÉVÉNEMENT checkout.session.completed
    # ============================================
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        return process_successful_payment(session)

    # ============================================
    # 3. GÉRER LES ÉCHECS DE PAIEMENT
    # ============================================
    elif event['type'] == 'invoice.payment_failed':
        invoice = event['data']['object']
        customer_email = invoice.get('customer_email')
        print(f'[Stripe Webhook] Échec paiement pour {customer_email}')
        return jsonify({'received': True}), 200

    # Autres événements — accusé réception sans action
    print(f'[Stripe Webhook] Event non géré: {event["type"]}')
    return jsonify({'received': True}), 200

def process_successful_payment(session):
    customer_email = session.get('customer_details', {}).get('email')
    customer_id = session.get('customer')
    subscription_id = session.get('subscription')
    amount_total = session.get('amount_total', 499) / 100  # Stripe = centimes
    currency = session.get('currency', 'usd')
    
    # We can retrieve language if passed in metadata, otherwise default to en
    metadata = session.get('metadata', {})
    language = metadata.get('language', 'en')

    if not customer_email:
        print('[Stripe Webhook] Email manquant — impossible de traiter')
        return jsonify({'error': 'missing_email'}), 400

    # Écrire en base (Idempotent et gère le compteur)
    db_result = database.process_stripe_payment(
        customer_email=customer_email,
        customer_id=customer_id,
        subscription_id=subscription_id,
        amount_total=amount_total,
        currency=currency,
        language=language
    )

    if not db_result.get('success'):
        print(f"[Stripe Webhook] Erreur base de données: {db_result.get('error')}")
        return jsonify({'error': 'database_error'}), 500

    if db_result.get('already_processed'):
        print(f'[Stripe Webhook] Membre déjà enregistré: {customer_email}')
        return jsonify({'received': True, 'already_processed': True}), 200

    new_member_number = db_result.get('member_number')
    spots_remaining = db_result.get('spots_remaining')

    print(f'[Stripe Webhook] ✅ Membre #{new_member_number} enregistré: {customer_email}')
    # ============================================
    # COMMISSION AFFILIÉ — 30% si parrain_id présent
    # ============================================
    try:
        referred_user = database.get_user_profile(customer_email)
        if referred_user and referred_user.get("parrain_id"):
            parrain_id = referred_user["parrain_id"]
            referred_id = referred_user.get("id")
            commission_amount = round(amount_total * 0.30, 2)
            payment_id = session.get("payment_intent") or session.get("id")
            if referred_id and payment_id:
                database.insert_affiliate_commission(
                    affiliate_user_id=parrain_id,
                    referred_user_id=referred_id,
                    payment_id=payment_id,
                    commission_amount=commission_amount,
                )
                print(f"[Affiliate] Commission {commission_amount} USD créée pour parrain_id={parrain_id}")
    except Exception as e:
        print(f"[Affiliate] Erreur création commission: {e}")



    # ============================================
    # ENVOYER EVENT META (Conversions API — server-side)
    # ============================================
    meta_result = send_purchase_event(
        email=customer_email,
        amount=amount_total,
        currency=currency,
        client_ip=request.remote_addr,
        user_agent=request.headers.get('User-Agent'),
        event_id=f'purchase_{customer_id}', 
    )

    if meta_result['success']:
        database.update_founder_meta_event_status(customer_id, True)

    # ============================================
    # ENVOYER EMAIL DE CONFIRMATION
    # ============================================
    send_confirmation_email(
        to_email=customer_email,
        member_number=new_member_number,
        language=language,
    )

    return jsonify({
        'received': True,
        'member_number': new_member_number,
        'spots_remaining': spots_remaining,
    }), 200
