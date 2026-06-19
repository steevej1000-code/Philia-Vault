import sys
import os
from werkzeug.security import generate_password_hash

# Add parent directory to path so we can import database
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import create_admin_user

def main():
    if len(sys.argv) < 4:
        print("Usage: python3 scripts/create_admin.py <email> <password> <role> [full_name]")
        print("Roles: viewer, editor, owner")
        sys.exit(1)

    email = sys.argv[1]
    password = sys.argv[2]
    role = sys.argv[3]
    full_name = sys.argv[4] if len(sys.argv) > 4 else None

    if role not in ['viewer', 'editor', 'owner']:
        print("❌ Rôle invalide. Utilisez: viewer, editor, ou owner.")
        sys.exit(1)

    password_hash = generate_password_hash(password, method='pbkdf2:sha256')

    admin_id = create_admin_user(email, password_hash, role, full_name)
    
    if admin_id:
        print(f"✅ Administrateur créé avec succès ! (ID: {admin_id})")
        print(f"Email: {email}")
        print(f"Rôle: {role}")
    else:
        print("❌ Erreur: Impossible de créer l'administrateur (l'email existe peut-être déjà).")

if __name__ == "__main__":
    main()
