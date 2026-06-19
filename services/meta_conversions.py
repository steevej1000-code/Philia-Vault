import os
import hashlib
import requests
from datetime import datetime

META_PIXEL_ID = os.environ.get('META_PIXEL_ID')
META_ACCESS_TOKEN = os.environ.get('META_ACCESS_TOKEN')
META_API_VERSION = 'v19.0'

def hash_sha256(value):
    """Meta exige les données utilisateur hashées en SHA-256"""
    if not value:
        return None
    return hashlib.sha256(value.strip().lower().encode('utf-8')).hexdigest()

def send_purchase_event(email, amount, currency='usd', client_ip=None, user_agent=None, event_id=None):
    """
    Envoie l'event Purchase à Meta via Conversions API (server-side).
    Plus fiable que le pixel client-side — pas bloqué par les ad blockers.
    """
    if not META_PIXEL_ID or not META_ACCESS_TOKEN:
        print('[Meta CAPI] Variables manquantes — event non envoyé')
        return {'success': False, 'error': 'missing_credentials'}

    url = f'https://graph.facebook.com/{META_API_VERSION}/{META_PIXEL_ID}/events'

    payload = {
        'data': [{
            'event_name': 'Purchase',
            'event_time': int(datetime.utcnow().timestamp()),
            'event_id': event_id,  # Important pour dédupliquer avec le pixel client si encore actif
            'action_source': 'website',
            'user_data': {
                'em': [hash_sha256(email)],
                'client_ip_address': client_ip,
                'client_user_agent': user_agent,
            },
            'custom_data': {
                'value': amount,
                'currency': currency,
                'content_name': 'Philia Vault Founder Spot',
                'content_category': 'Finance App Subscription',
            },
        }],
        'access_token': META_ACCESS_TOKEN,
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        result = response.json()
        print(f'[Meta CAPI] Event envoyé avec succès: {result}')
        return {'success': True, 'response': result}
    except requests.exceptions.RequestException as e:
        print(f'[Meta CAPI] Erreur envoi event: {e}')
        return {'success': False, 'error': str(e)}
