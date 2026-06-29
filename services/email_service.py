import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.hostinger.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', 465))
SMTP_USER = os.environ.get('SMTP_USER')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD') or os.environ.get('SMTP_PASS')

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

def _get_smtp_connection():
    """Crée une connexion SMTP avec le serveur en choisissant SSL (port 465) ou TLS/Plain."""
    if SMTP_PORT == 465:
        return smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT)
    else:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
        try:
            server.starttls()
        except Exception:
            pass
        return server

def send_password_reset_email(to_email, code, language='en'):
    template = RESET_EMAIL_TEMPLATES.get(language, RESET_EMAIL_TEMPLATES['en'])

    msg = MIMEMultipart()
    msg['From'] = f"Philia Vault <{SMTP_USER}>"
    msg['To'] = to_email
    msg['Subject'] = template['subject']
    msg.attach(MIMEText(template['body'].format(code=code), 'plain'))

    if not SMTP_USER or not SMTP_PASSWORD:
        print(f'[Email] SMTP not configured, simulating password reset email to {to_email}: code={code}')
        return False

    try:
        with _get_smtp_connection() as server:
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, to_email, msg.as_string())
        print(f'[Email] Password reset code envoyé à {to_email}')
        return True
    except Exception as e:
        print(f'[Email] Erreur envoi reset password: {e}')
        return False

def send_confirmation_email(to_email, member_number, language='en'):
    template = EMAIL_TEMPLATES.get(language, EMAIL_TEMPLATES['en'])

    msg = MIMEMultipart()
    msg['From'] = f"Philia Vault <{SMTP_USER}>"
    msg['To'] = to_email
    msg['Subject'] = template['subject'].format(number=member_number)

    body = template['body'].format(number=member_number)
    msg.attach(MIMEText(body, 'plain'))

    if not SMTP_USER or not SMTP_PASSWORD:
        print(f'[Email] SMTP not configured, simulating confirmation email to {to_email}')
        return False

    try:
        with _get_smtp_connection() as server:
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, to_email, msg.as_string())
        print(f'[Email] Confirmation envoyée à {to_email}')
        return True
    except Exception as e:
        print(f'[Email] Erreur envoi: {e}')
        return False

def send_welcome_email(user_email: str, first_name: str) -> bool:
    """
    Envoie l'email de bienvenue HTML après inscription réussie via Hostinger SMTP.
    """
    try:
        from_email = SMTP_USER or 'contact@philiaentreprisellc.com'

        if not SMTP_USER or not SMTP_PASSWORD:
            print(f'[Email] SMTP non configuré — simulation email bienvenue à {user_email}', flush=True)
            return False

        msg = MIMEMultipart('alternative')
        msg['Subject'] = f"Bienvenue dans Philia Vault, {first_name} 🔥"
        msg['From'] = f"Philia Vault <{from_email}>"
        msg['To'] = user_email

        # Version texte brute
        text_content = f"""
Bonjour {first_name} 👋

Ton miroir financier impitoyable est prêt.
Philia Vault ne te dit pas quoi faire — il te montre exactement où tu en es.

TON PREMIER OBJECTIF :
Atteindre un IIF de 100%
Index d'Indépendance Financière = Cashflow actifs ÷ Revenu net × 100

Commence par renseigner ton salaire et tes premières dépenses.
Le tableau de bord s'illumine immédiatement.

Ouvrir mon Vault : https://app.philiavault.com

Philia Entreprise LLC
contact@philiaentreprisellc.com
        """

        # Version HTML riche demandée par l'utilisateur
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background-color:#000000;font-family:'Helvetica Neue',Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#000000;padding:40px 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" 
                       style="background-color:#1A1A1A;border-radius:12px;overflow:hidden;max-width:600px;">
                  
                  <!-- HEADER -->
                  <tr>
                    <td align="center" style="padding:40px 40px 20px;">
                      <div style="font-size:36px;font-weight:900;background:linear-gradient(135deg,#39FF14,#FF4444);
                                  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
                                  background-clip:text;letter-spacing:2px;">PV</div>
                      <div style="color:#888888;font-size:12px;letter-spacing:4px;margin-top:4px;">PHILIA VAULT</div>
                    </td>
                  </tr>

                  <!-- TITRE -->
                  <tr>
                    <td align="center" style="padding:20px 40px;">
                      <h1 style="color:#FFFFFF;font-size:28px;font-weight:800;margin:0;line-height:1.3;">
                        Bienvenue, {first_name} 👋
                      </h1>
                      <p style="color:#39FF14;font-size:14px;margin:12px 0 0;font-weight:600;letter-spacing:1px;">
                        YOUR FINANCIAL TRAJECTORY, LIVE
                      </p>
                    </td>
                  </tr>

                  <!-- CORPS -->
                  <tr>
                    <td style="padding:20px 40px;">
                      <p style="color:#CCCCCC;font-size:15px;line-height:1.7;margin:0 0 20px;">
                        Ton miroir financier impitoyable est prêt.<br>
                        Philia Vault ne te dit pas quoi faire — il te montre 
                        <strong style="color:#FFFFFF;">exactement où tu en es</strong>.
                      </p>
                      
                      <!-- BOX IIF -->
                      <div style="background:#0A0A0A;border:1px solid #2A2A2A;border-left:3px solid #39FF14;
                                  border-radius:8px;padding:20px;margin:20px 0;">
                        <p style="color:#888888;font-size:11px;letter-spacing:2px;margin:0 0 8px;">TON PREMIER OBJECTIF</p>
                        <p style="color:#FFFFFF;font-size:16px;font-weight:700;margin:0;">
                          Atteindre un IIF de 100%
                        </p>
                        <p style="color:#888888;font-size:13px;margin:8px 0 0;">
                          Index d'Indépendance Financière = Cashflow actifs ÷ Revenu net × 100
                        </p>
                      </div>

                      <p style="color:#CCCCCC;font-size:15px;line-height:1.7;margin:0 0 20px;">
                        Commence par renseigner ton salaire et tes premières dépenses.<br>
                        Le tableau de bord s'illumine immédiatement.
                      </p>
                    </td>
                  </tr>

                  <!-- CTA -->
                  <tr>
                    <td align="center" style="padding:10px 40px 30px;">
                      <a href="https://app.philiavault.com" 
                         style="display:inline-block;background-color:#39FF14;color:#000000;
                                font-weight:800;font-size:16px;text-decoration:none;
                                padding:16px 48px;border-radius:8px;letter-spacing:1px;">
                        OUVRIR MON VAULT →
                      </a>
                    </td>
                  </tr>

                  <!-- SÉPARATEUR -->
                  <tr>
                    <td style="padding:0 40px;">
                      <div style="border-top:1px solid #2A2A2A;"></div>
                    </td>
                  </tr>

                  <!-- FOOTER -->
                  <tr>
                    <td align="center" style="padding:24px 40px;">
                      <p style="color:#555555;font-size:12px;margin:0;line-height:1.6;">
                        Philia Entreprise LLC<br>
                        Tu reçois cet email car tu viens de créer un compte Philia Vault.<br>
                        <a href="https://app.philiavault.com/unsubscribe" 
                           style="color:#555555;">Se désabonner</a>
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
        """

        msg.attach(MIMEText(text_content, 'plain', 'utf-8'))
        msg.attach(MIMEText(html_content, 'html', 'utf-8'))

        with _get_smtp_connection() as server:
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(from_email, user_email, msg.as_string())

        print(f"[EMAIL] Welcome email sent to {user_email}", flush=True)
        return True

    except Exception as e:
        print(f"[EMAIL ERROR] Failed to send to {user_email}: {e}", flush=True)
        return False
