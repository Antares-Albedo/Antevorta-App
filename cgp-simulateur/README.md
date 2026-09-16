# Simulateur de projection de contrats d'épargne

Application Python de projection de contrats multi-supports (assurance-vie,
capitalisation) pour un usage professionnel de conseil en gestion de
patrimoine. Elle simule l'évolution de la valorisation sur plusieurs années en
intégrant les flux (versements initial, programmés, complémentaires, rachats
programmés) et trois familles de supports : fonds en euros, unités de compte,
produits structurés à capital protégé.

## Installation

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Utilisation

Interface Streamlit :

```bash
streamlit run interface/app.py
```

Utilisation directe du moteur :

```python
import json
from models import charger_contrat, ScenarioMarche
from engine.projection import projeter

exemples = json.load(open("data/exemples_contrats.json", encoding="utf-8"))["exemples"]
contrat = charger_contrat(exemples[0])
resultat = projeter(contrat, ScenarioMarche())
for ligne in resultat.lignes:
    print(ligne.annee, round(ligne.valeur_fin), round(ligne.performance_nette * 100, 2))
```

Tests :

```bash
pytest
```

## Arborescence

- `models/` : dataclasses (contrat, supports, flux programmés, scénario, résultats), sérialisation JSON.
- `engine/` : moteur de calcul, sans dépendance vers l'interface.
  - `flux.py` : chronologie des flux (versements, rachats, indexation).
  - `fonds_euros.py` : taux annuel (tendance, volatilité, plancher), capitalisation composée.
  - `unites_compte.py` : rendement moyen et volatilité, Monte Carlo.
  - `structures.py` : trajectoire du sous-jacent, observations (autocall, coupon, mémoire), barrière de protection.
  - `fiscalite.py` : fiscalité des rachats (PFU, abattement après 8 ans, prélèvements sociaux).
  - `projection.py` : orchestrateur, tableau annuel consolidé, Monte Carlo du contrat complet.
- `tests/` : un fichier de test par module du moteur, cas vérifiables à la main.
- `interface/` : `app.py` (Streamlit) et `export.py` (Excel, PDF).
- `data/exemples_contrats.json` : exemples génériques, aucune donnée client.

## Conventions de calcul

- Pas de temps mensuel ; les taux annuels sont convertis en facteur mensuel composé, ce qui redonne exactement `(1 + t)^n` pour un versement unique.
- Fonds en euros : taux brut moins frais de gestion, prélèvements sociaux retenus en fin d'année sur les intérêts crédités (option désactivable).
- Unités de compte : rendement moins frais de gestion ; en mode stochastique, rendement log-normal de moyenne égale au rendement attendu.
- Produits structurés : souscrits uniquement avec le versement initial (les versements ultérieurs alloués au structuré sont redirigés vers le support de réinvestissement) ; coupons et capital remboursé versés sur le support de réinvestissement (fonds en euros par défaut) ; valeur indicative entre deux observations égale au nominal, ramené à la valeur de remboursement théorique si le sous-jacent est sous la barrière de protection.
- Perte à maturité : deux conventions, « au-delà de la barrière » (perte égale à la baisse sous la barrière) ou « depuis le niveau initial » (convention de marché).
- Performance nette annuelle : méthode de Dietz modifiée (flux pondérés par leur durée de présence dans l'année).
- Fiscalité : régime PFU pour les primes versées depuis le 27/09/2017, abattement de 4 600 € ou 9 200 € après 8 ans, taux réduit de 7,5 % jusqu'à 150 000 € de primes nettes tous contrats. Paramètres modifiables dans `ParametresFiscaux`.

## Limites

- Les résultats sont indicatifs et dépendent des hypothèses saisies.
- Les rachats sont supposés partiels et jamais supérieurs à l'assiette disponible.
- L'option pour le barème progressif de l'impôt sur le revenu n'est pas modélisée.
