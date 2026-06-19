import os
import jwt
from functools import wraps
from flask import request, jsonify
from datetime import datetime, timedelta

ADMIN_JWT_SECRET = os.environ.get('ADMIN_JWT_SECRET', 'fallback_admin_secret_key_philia_vault_2026')

def generate_admin_token(admin_id, email, role):
    payload = {
        'admin_id': admin_id,
        'email': email,
        'role': role,
        'exp': datetime.utcnow() + timedelta(hours=12),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, ADMIN_JWT_SECRET, algorithm='HS256')

def require_admin_auth(min_role='viewer'):
    """
    Decorator for admin routes.
    min_role can be 'viewer', 'editor', 'owner'.
    Roles hierarchy: owner > editor > viewer
    """
    roles_hierarchy = {'viewer': 1, 'editor': 2, 'owner': 3}

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            auth_header = request.headers.get('Authorization')
            if not auth_header or not auth_header.startswith('Bearer '):
                return jsonify({'error': 'missing_or_invalid_token'}), 401

            token = auth_header.split(' ')[1]
            try:
                decoded = jwt.decode(token, ADMIN_JWT_SECRET, algorithms=['HS256'])
                request.admin = decoded
            except jwt.ExpiredSignatureError:
                return jsonify({'error': 'token_expired'}), 401
            except jwt.InvalidTokenError:
                return jsonify({'error': 'invalid_token'}), 401

            admin_role = decoded.get('role', 'viewer')
            
            # Check role hierarchy
            if roles_hierarchy.get(admin_role, 0) < roles_hierarchy.get(min_role, 1):
                return jsonify({'error': 'insufficient_permissions'}), 403

            return f(*args, **kwargs)
        return decorated_function
    return decorator
