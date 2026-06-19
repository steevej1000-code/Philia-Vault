import os
from flask import Blueprint, request, jsonify
from werkzeug.security import check_password_hash

from database import (
    get_admin_by_email, update_last_login, 
    get_admin_dashboard_stats, get_all_users_for_admin,
    get_standard_users_for_admin,
    block_user, block_founder, update_founder_spots_counter
)
import csv
from io import StringIO
from flask import Response
from middleware.admin_auth import generate_admin_token, require_admin_auth

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/auth/login', methods=['POST'])
def login():
    data = request.json or {}
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'missing_credentials'}), 400

    admin = get_admin_by_email(email)
    
    if not admin:
        return jsonify({'error': 'invalid_credentials'}), 401

    admin_id, admin_email, password_hash, role, full_name_db, avatar_db, is_active = admin

    if not is_active:
        return jsonify({'error': 'account_disabled'}), 403

    # Check password
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
            'avatar_url': avatar_db
        }
    })

@admin_bp.route('/stats/overview', methods=['GET'])
@require_admin_auth()
def get_overview_stats():
    stats = get_admin_dashboard_stats()
    return jsonify(stats)

@admin_bp.route('/users', methods=['GET'])
@require_admin_auth()
def get_users():
    users = get_all_users_for_admin()
    return jsonify({'users': users})

@admin_bp.route('/standard_users', methods=['GET'])
@require_admin_auth()
def get_standard_users():
    users = get_standard_users_for_admin()
    return jsonify({'users': users})

@admin_bp.route('/users/<int:user_id>/block', methods=['PUT'])
@require_admin_auth(min_role='editor')
def block_standard_user(user_id):
    success = block_user(user_id)
    return jsonify({'success': success})

@admin_bp.route('/founders/<int:founder_id>/block', methods=['PUT'])
@require_admin_auth(min_role='editor')
def block_founder_user(founder_id):
    success = block_founder(founder_id)
    return jsonify({'success': success})

@admin_bp.route('/stats/spots', methods=['PUT'])
@require_admin_auth(min_role='editor')
def update_spots():
    data = request.json
    total = data.get('total')
    taken = data.get('taken')
    if total is None or taken is None:
        return jsonify({'error': 'Missing total or taken parameters'}), 400
    
    success = update_founder_spots_counter(total, taken)
    return jsonify({'success': success})

@admin_bp.route('/export/<export_type>', methods=['GET'])
@require_admin_auth()
def export_csv(export_type):
    if export_type == 'founders':
        data = get_all_users_for_admin()
        fieldnames = ['id', 'email', 'customer_id', 'status', 'amount_paid', 'created_at']
    elif export_type == 'standard':
        data = get_standard_users_for_admin()
        fieldnames = ['id', 'email', 'code_parrainage', 'balance', 'has_founder_access', 'is_blocked', 'created_at']
    else:
        return jsonify({'error': 'Invalid export type'}), 400

    si = StringIO()
    cw = csv.DictWriter(si, fieldnames=fieldnames)
    cw.writeheader()
    for row in data:
        cw.writerow(row)
    
    output = si.getvalue()
    return Response(
        output,
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename={export_type}_export.csv"}
    )
