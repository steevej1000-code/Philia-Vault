import database

def calculate_daily_budget(user_id):
    """
    Fonction utilitaire pour calculer le budget quotidien restant
    basé sur le revenu disponible et les dépenses réelles de l'utilisateur.
    """
    return database.calculate_daily_budget(user_id)
