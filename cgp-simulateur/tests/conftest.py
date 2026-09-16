"""Fixtures communes : contrats génériques sans données réelles."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from models import (  # noqa: E402
    Contrat,
    ParametresFiscaux,
    ParametresFondsEuros,
    ParametresStructure,
    ParametresUC,
    Support,
    TypeSupport,
)


@pytest.fixture
def sans_ps() -> ParametresFiscaux:
    """Paramètres fiscaux sans prélèvements sociaux au fil de l'eau."""
    return ParametresFiscaux(prelevements_sociaux_fil_eau=False)


@pytest.fixture
def contrat_fonds_euros() -> Contrat:
    """10 000 € sur un fonds en euros à 3 % pendant 5 ans."""
    return Contrat(
        nom="Test fonds euros",
        montant_initial=10_000.0,
        duree_annees=5,
        date_souscription=date(2026, 1, 1),
        supports=[
            Support("FE", TypeSupport.FONDS_EUROS, 1.0, ParametresFondsEuros(taux_base=0.03))
        ],
    )


@pytest.fixture
def contrat_mixte() -> Contrat:
    """Contrat 50 % fonds euros, 30 % UC, 20 % structuré."""
    return Contrat(
        nom="Test mixte",
        montant_initial=100_000.0,
        duree_annees=10,
        date_souscription=date(2026, 1, 1),
        supports=[
            Support("FE", TypeSupport.FONDS_EUROS, 0.5, ParametresFondsEuros(taux_base=0.03)),
            Support("UC", TypeSupport.UC, 0.3, ParametresUC(rendement_moyen=0.05, volatilite=0.15)),
            Support(
                "ST",
                TypeSupport.STRUCTURE,
                0.2,
                ParametresStructure(
                    barriere_protection=0.6,
                    barriere_coupon=0.7,
                    niveau_coupon=0.05,
                    autocall=True,
                    barriere_autocall=1.0,
                    maturite=8,
                    tendance_sous_jacent=-0.01,
                ),
            ),
        ],
    )
