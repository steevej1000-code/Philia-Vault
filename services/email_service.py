import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', 587))
SMTP_USER = os.environ.get('SMTP_USER')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD')

EMAIL_TEMPLATES = {
    'en': {
        'subject': "You're Founding Member #{number} — Philia Vault 🔒",
        'body': """Hi,

You're in. Founding Member #{number} of 10.

What happens next:
→ Private beta invitation — July 2026
→ Full app access — August 2026
→ $4.99/month locked for life
→ Something waiting inside the app. You'll see.

You believed before anyone else. That means something.

— Steeve, Founder of Philia Vault

---
Cancel anytime before launch.
Philia Vault · AI-powered educational financial analysis"""
    },
    'fr': {
        'subject': "Tu es Membre Fondateur #{number} — Philia Vault 🔒",
        'body': """Salut,

Tu es dedans. Membre Fondateur #{number} sur 10.

Ce qui suit :
→ Invitation beta privée — Juillet 2026
→ Accès complet à l'app — Août 2026
→ 4,99$/mois garanti à vie
→ Quelque chose t'attend dans l'app. Tu verras.

Tu as cru avant tout le monde. Ça compte.

— Steeve, Fondateur de Philia Vault

---
Annulation possible à tout moment avant le lancement.
Philia Vault · Analyse financière éducative propulsée par IA"""
    },
}

def send_confirmation_email(to_email, member_number, language='en'):
    template = EMAIL_TEMPLATES.get(language, EMAIL_TEMPLATES['en'])

    msg = MIMEMultipart()
    msg['From'] = SMTP_USER
    msg['To'] = to_email
    msg['Subject'] = template['subject'].format(number=member_number)

    body = template['body'].format(number=member_number)
    msg.attach(MIMEText(body, 'plain'))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        print(f'[Email] Confirmation envoyée à {to_email}')
        return True
    except Exception as e:
        print(f'[Email] Erreur envoi: {e}')
        return False
