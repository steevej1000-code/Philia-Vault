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

RESET_EMAIL_TEMPLATES = {
    'en': {
        'subject': "Your Philia Vault password reset code",
        'body': """Hi,

Your password reset code is: {code}

This code expires in 30 minutes. If you didn't request this, you can ignore this email.

— The Philia Vault Team"""
    },
    'fr': {
        'subject': "Ton code de réinitialisation Philia Vault",
        'body': """Salut,

Ton code de réinitialisation de mot de passe est : {code}

Ce code expire dans 30 minutes. Si tu n'es pas à l'origine de cette demande, tu peux ignorer cet email.

— L'équipe Philia Vault"""
    },
}

def send_password_reset_email(to_email, code, language='en'):
    template = RESET_EMAIL_TEMPLATES.get(language, RESET_EMAIL_TEMPLATES['en'])

    msg = MIMEMultipart()
    msg['From'] = SMTP_USER
    msg['To'] = to_email
    msg['Subject'] = template['subject']
    msg.attach(MIMEText(template['body'].format(code=code), 'plain'))

    if not SMTP_USER or not SMTP_PASSWORD:
        print(f'[Email] SMTP not configured, simulating password reset email to {to_email}: code={code}')
        return False

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        print(f'[Email] Password reset code envoyé à {to_email}')
        return True
    except Exception as e:
        print(f'[Email] Erreur envoi reset password: {e}')
        return False

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


def send_welcome_email(user_email: str, first_name: str) -> bool:
    """
    Envoie l'email de bienvenue après inscription et paiement confirmé.
    """
    try:
        from_email = os.environ.get('FROM_EMAIL', 'contact@philiaentreprisellc.com')

        if not SMTP_USER or not SMTP_PASSWORD:
            print(f'[Email] SMTP non configuré — simulation email bienvenue à {user_email}')
            return False

        msg = MIMEMultipart('alternative')
        msg['Subject'] = f"Bienvenue dans Philia Vault, {first_name} 🔐"
        msg['From'] = f"Philia Vault <{from_email}>"
        msg['To'] = user_email

        # Version texte
        text_content = f"""
Bonjour {first_name},

Ton coffre-fort financier est maintenant actif.

Tu viens de prendre une décision que la majorité des gens n'osent
jamais prendre : regarder leur réalité financière en face.

C'est ici que commence le changement.

PAR OÙ COMMENCER :

1. Saisis ton revenu mensuel net
   → Ton score IIF s'active immédiatement

2. Ajoute tes 3 plus gros passifs
   → Vois où va ton argent chaque mois

3. Réponds à ton premier dilemme financier
   → Lance ta série de discipline 🔥

Accéder à Philia Vault : https://app.philiavault.com

"Les riches accumulent des actifs.
Les pauvres accumulent des passifs."
— Robert Kiyosaki

Philia Vault — The Ruthless Financial Mirror
        """

        # Version HTML
        html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {{ background-color: #000000; color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; }}
  .container {{ max-width: 600px; margin: 0 auto; padding: 40px 20px; }}
  .logo {{ font-size: 28px; font-weight: bold; color: #39FF14; text-align: center; margin-bottom: 8px; letter-spacing: 4px; }}
  .tagline {{ color: #888888; text-align: center; font-size: 12px; margin-bottom: 40px; }}
  .hero {{ background: #1A1A1A; border: 1px solid #39FF14; border-radius: 12px; padding: 30px; margin-bottom: 30px; }}
  .hero h1 {{ color: #FFFFFF; font-size: 22px; margin: 0 0 16px 0; }}
  .hero p {{ color: #AAAAAA; line-height: 1.6; margin: 0; }}
  .steps {{ background: #1A1A1A; border-radius: 12px; padding: 24px 30px; margin-bottom: 30px; }}
  .steps h2 {{ color: #39FF14; font-size: 14px; letter-spacing: 2px; margin: 0 0 20px 0; }}
  .step {{ display: flex; align-items: flex-start; margin-bottom: 16px; }}
  .step-number {{ background: #39FF14; color: #000000; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; margin-right: 12px; flex-shrink: 0; }}
  .step-text {{ color: #FFFFFF; font-size: 14px; line-height: 1.5; }}
  .step-text span {{ color: #888888; display: block; font-size: 12px; margin-top: 2px; }}
  .cta {{ text-align: center; margin-bottom: 30px; }}
  .cta a {{ background: #39FF14; color: #000000; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; }}
  .quote {{ background: #0A0A0A; border-left: 3px solid #39FF14; padding: 16px 20px; margin-bottom: 30px; border-radius: 0 8px 8px 0; }}
  .quote p {{ color: #AAAAAA; font-style: italic; margin: 0 0 8px 0; line-height: 1.6; }}
  .quote span {{ color: #39FF14; font-size: 12px; }}
  .footer {{ text-align: center; color: #555555; font-size: 11px; line-height: 1.6; }}
  .footer a {{ color: #39FF14; text-decoration: none; }}
</style>
</head>
<body>
<div class="container">
  <div class="logo">PHILIA VAULT</div>
  <div class="tagline">THE RUTHLESS FINANCIAL MIRROR</div>
  <div class="hero">
    <h1>Bienvenue, {first_name}. 🔐</h1>
    <p>Ton coffre-fort financier est maintenant actif.<br><br>Tu viens de prendre une décision que la majorité des gens n'osent jamais prendre : regarder leur réalité financière en face.<br><br>C'est ici que commence le changement.</p>
  </div>
  <div class="steps">
    <h2>🚀 PAR OÙ COMMENCER</h2>
    <div class="step"><div class="step-number">1</div><div class="step-text">Saisis ton revenu mensuel net<span>→ Ton score IIF s'active immédiatement</span></div></div>
    <div class="step"><div class="step-number">2</div><div class="step-text">Ajoute tes 3 plus gros passifs<span>→ Vois où va ton argent chaque mois</span></div></div>
    <div class="step"><div class="step-number">3</div><div class="step-text">Réponds à ton premier dilemme financier<span>→ Lance ta série de discipline 🔥</span></div></div>
  </div>
  <div class="cta"><a href="https://app.philiavault.com">Ouvrir mon Coffre-Fort →</a></div>
  <div class="quote"><p>"Les riches accumulent des actifs.<br>Les pauvres accumulent des passifs."</p><span>— Robert Kiyosaki</span></div>
  <div class="footer">Philia Vault — Philia entreprise LLC<br><a href="mailto:contact@philiaentreprisellc.com">contact@philiaentreprisellc.com</a><br><br>Tu reçois cet email car tu viens de t'inscrire sur app.philiavault.com<br><a href="#">Se désabonner</a></div>
</div>
</body>
</html>"""

        msg.attach(MIMEText(text_content, 'plain'))
        msg.attach(MIMEText(html_content, 'html'))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(from_email, user_email, msg.as_string())

        print(f"[Email] Email de bienvenue envoyé à {user_email}")
        return True

    except Exception as e:
        print(f"[Email] Erreur envoi email bienvenue: {e}")
        return False
