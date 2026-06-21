import os
import json
import csv
from io import StringIO
from functools import wraps

from flask import Blueprint, request, jsonify, Response
from werkzeug.security import check_password_hash

from database import (
    get_admin_by_email, get_admin_by_google_id,
    create_or_link_google_admin,
    update_last_login,
    get_admin_dashboard_stats,
    get_all_users_for_admin, get_standard_users_for_admin,
    get_user_detail_for_admin,
    block_user, block_founder, update_founder_spots_counter,
    get_product_metrics, get_payment_history,
    get_config, set_config,
)
from middleware.admin_auth import generate_admin_token, require_admin_auth

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")

# Allowed admin email — hard-coded failsafe on top of DB check
ADMIN_ALLOWED_EMAIL = os.environ.get("ADMIN_EMAIL", "steevej1000@gmail.com")

admin_bp = Blueprint('admin', __name__)

# ─── Auth ─────────────────────────────────────────────────────────────────────

@admin_bp.route('/auth/login', methods=['POST'])
def login():
    """Email + password login."""
    data = request.json or {}
    email    = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'missing_credentials'}), 400

    admin = get_admin_by_email(email)
    if not admin:
        return jsonify({'error': 'invalid_credentials'}), 401

    admin_id, admin_email, password_hash, role, full_name_db, avatar_db, is_active = admin

    if not is_active:
        return jsonify({'error': 'account_disabled'}), 403

    if not password_hash or not check_password_hash(password_hash, password):
        return jsonify({'error': 'invalid_credentials'}), 401

    token = generate_admin_token(admin_id, admin_email, role)
    update_last_login(admin_id)

    return jsonify({
        'token': token,
        'admin': {
            'id': admin_id,
            'email': admin_email,
            'role': role,
            'full_name': full_name_db,
            'avatar_url': avatar_db,
        }
    })


@admin_bp.route('/auth/google', methods=['POST'])
def google_login():
    """Google OAuth login for admin — verifies ID token, returns JWT."""
    data = request.json or {}
    credential = data.get('credential')   # Google ID token (JWT from GSI)

    if not credential:
        return jsonify({'error': 'missing_credential'}), 400

    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        if not GOOGLE_CLIENT_ID:
            return jsonify({'error': 'google_auth_not_configured'}), 500

        idinfo = id_token.verify_oauth2_token(
            credential, google_requests.Request(), GOOGLE_CLIENT_ID
        )

        email      = idinfo.get('email', '').lower()
        google_id  = idinfo.get('sub')
        full_name  = idinfo.get('name')
        avatar_url = idinfo.get('picture')

        if not email or not google_id:
            return jsonify({'error': 'invalid_token_payload'}), 401

        admin_id, role, err = create_or_link_google_admin(email, google_id, full_name, avatar_url)

        if err == 'disabled':
            return jsonify({'error': 'account_disabled'}), 403
        if err == 'not_invited':
            return jsonify({'error': 'not_authorized', 'message': 'Cet email n\'est pas autorisé à accéder à l\'admin.'}), 403
        if not admin_id:
            return jsonify({'error': 'auth_failed'}), 401

        update_last_login(admin_id)
        token = generate_admin_token(admin_id, email, role)

        return jsonify({
            'token': token,
            'admin': {
                'id':        admin_id,
                'email':     email,
                'role':      role,
                'full_name': full_name,
                'avatar_url': avatar_url,
            }
        })

    except Exception as e:
        print(f"[Admin Google Auth] Error: {e}")
        return jsonify({'error': 'google_verification_failed', 'detail': str(e)}), 401


# ─── Stats overview ───────────────────────────────────────────────────────────

@admin_bp.route('/stats/overview', methods=['GET'])
@require_admin_auth()
def get_overview_stats():
    stats = get_admin_dashboard_stats()
    return jsonify(stats)


# ─── Users (standard) ─────────────────────────────────────────────────────────

@admin_bp.route('/users', methods=['GET'])
@require_admin_auth()
def get_users():
    """All standard users (from `users` table)."""
    search = request.args.get('q', '').strip().lower()
    users  = get_standard_users_for_admin()
    if search:
        users = [u for u in users if search in u['email'].lower()]
    return jsonify({'users': users, 'total': len(users)})


@admin_bp.route('/standard_users', methods=['GET'])
@require_admin_auth()
def get_standard_users():
    """Alias for /users — called by the admin dashboard All Users tab."""
    search = request.args.get('q', '').strip().lower()
    users  = get_standard_users_for_admin()
    if search:
        users = [u for u in users if search in u['email'].lower()]
    return jsonify({'users': users, 'total': len(users)})


@admin_bp.route('/users/<path:user_email>/detail', methods=['GET'])
@require_admin_auth()
def get_user_detail(user_email):
    """Full user detail: profile + assets + liabilities + IIF."""
    detail = get_user_detail_for_admin(user_email)
    if not detail:
        return jsonify({'error': 'user_not_found'}), 404
    return jsonify(detail)


@admin_bp.route('/users/<int:user_id>/block', methods=['PUT'])
@require_admin_auth(min_role='editor')
def block_standard_user(user_id):
    success = block_user(user_id)
    return jsonify({'success': success})


# ─── Founders ─────────────────────────────────────────────────────────────────

@admin_bp.route('/founders', methods=['GET'])
@require_admin_auth()
def get_founders():
    """Founder members (from `founder_members` table)."""
    search = request.args.get('q', '').strip().lower()
    users  = get_all_users_for_admin()
    if search:
        users = [u for u in users if search in u['email'].lower()]
    return jsonify({'users': users, 'total': len(users)})


@admin_bp.route('/founders/<int:founder_id>/block', methods=['PUT'])
@require_admin_auth(min_role='editor')
def block_founder_user(founder_id):
    success = block_founder(founder_id)
    return jsonify({'success': success})


# ─── Founder spots ────────────────────────────────────────────────────────────

@admin_bp.route('/stats/spots', methods=['PUT'])
@require_admin_auth(min_role='editor')
def update_spots():
    data  = request.json or {}
    total = data.get('total')
    taken = data.get('taken')
    if total is None or taken is None:
        return jsonify({'error': 'Missing total or taken'}), 400
    success = update_founder_spots_counter(total, taken)
    return jsonify({'success': success})


# ─── Payments (Stripe) ────────────────────────────────────────────────────────

@admin_bp.route('/payments', methods=['GET'])
@require_admin_auth()
def get_payments():
    """Payment history from founder_members + optional Stripe API enrichment."""
    payments = get_payment_history()

    # Compute quick revenue stats
    active_payments = [p for p in payments if p['status'] == 'active']
    total_revenue   = sum(p['amount_paid'] or 0 for p in payments)
    mrr             = sum(p['amount_paid'] or 0 for p in active_payments)

    # Try to enrich with Stripe live data
    stripe_available = False
    try:
        import stripe
        if stripe.api_key:
            stripe_available = True
    except Exception:
        pass

    return jsonify({
        'payments':        payments,
        'total_count':     len(payments),
        'active_count':    len(active_payments),
        'total_revenue':   round(total_revenue, 2),
        'mrr':             round(mrr, 2),
        'stripe_available': stripe_available,
    })


# ─── Metrics ─────────────────────────────────────────────────────────────────

@admin_bp.route('/metrics', methods=['GET'])
@require_admin_auth()
def get_metrics():
    metrics = get_product_metrics()
    return jsonify(metrics)


# ─── Content (config) ─────────────────────────────────────────────────────────

@admin_bp.route('/content', methods=['GET'])
@require_admin_auth()
def get_content():
    """Return all editable content/config keys."""
    cfg = get_config()
    # Parse FAQ JSON
    try:
        cfg['faq'] = json.loads(cfg.get('faq', '[]'))
    except Exception:
        cfg['faq'] = []
    return jsonify(cfg)


@admin_bp.route('/content', methods=['PUT'])
@require_admin_auth(min_role='editor')
def update_content():
    """
    Update one or more config keys.
    For Stripe price IDs: validate against Stripe API before saving.
    """
    data = request.json or {}
    errors = {}

    # Validate Stripe price IDs if provided
    stripe_key_map = {
        'stripe_price_monthly': 'stripe_price_monthly',
        'stripe_price_yearly':  'stripe_price_yearly',
    }
    for field, cfg_key in stripe_key_map.items():
        if field in data and data[field]:
            price_id = data[field].strip()
            try:
                import stripe as stripe_lib
                if stripe_lib.api_key:
                    price_obj = stripe_lib.Price.retrieve(price_id)
                    if not price_obj or price_obj.get('active') is False:
                        errors[field] = f"Price ID '{price_id}' is inactive in Stripe."
            except Exception as e:
                errors[field] = f"Invalid Stripe Price ID: {str(e)}"

    if errors:
        return jsonify({'success': False, 'errors': errors}), 400

    # Save all allowed keys
    allowed_keys = {
        'price_monthly_display', 'price_yearly_display', 'price_monthly_equiv',
        'price_founder_display',
        'stripe_price_monthly', 'stripe_price_yearly',
        'faq', 'hero_title', 'hero_subtitle',
    }

    saved = []
    for key, value in data.items():
        if key in allowed_keys:
            if key == 'faq' and isinstance(value, list):
                value = json.dumps(value, ensure_ascii=False)
            set_config(key, value)
            saved.append(key)

    return jsonify({'success': True, 'saved': saved})


# ─── Export CSV ──────────────────────────────────────────────────────────────

@admin_bp.route('/export/<export_type>', methods=['GET'])
@require_admin_auth()
def export_csv(export_type):
    if export_type == 'founders':
        data       = get_all_users_for_admin()
        fieldnames = ['id', 'email', 'customer_id', 'status', 'amount_paid', 'created_at']
    elif export_type == 'standard':
        data       = get_standard_users_for_admin()
        fieldnames = ['id', 'email', 'code_parrainage', 'has_founder_access', 'is_blocked', 'created_at']
    else:
        return jsonify({'error': 'Invalid export type'}), 400

    si = StringIO()
    cw = csv.DictWriter(si, fieldnames=fieldnames, extrasaction='ignore')
    cw.writeheader()
    for row in data:
        cw.writerow(row)

    return Response(
        si.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename={export_type}_export.csv"}
    )
