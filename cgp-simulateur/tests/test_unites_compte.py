"""Tests de engine/unites_compte.py."""

import numpy as np
import pytest

from engine.unites_compte import (
    generer_rendements,
    projeter_uc,
    rendement_annuel,
    rendement_net,
    simuler_monte_carlo,
)
from models import ParametresUC


def test_rendement_deterministe_5_pourcent_sur_10_ans():
    # 10 000 € à 5 % pendant 10 ans : 16 288,95 €
    valeurs = projeter_uc(10_000.0, [0.05] * 10)
    assert valeurs[-1] == pytest.approx(16_288.95, abs=0.01)


def test_sans_generateur_le_rendement_est_la_moyenne():
    assert rendement_annuel(0.05, 0.20, None) == 0.05
    assert generer_rendements(ParametresUC(0.04, 0.10), 3) == [0.04, 0.04, 0.04]


def test_rendement_net_de_frais():
    assert rendement_net(0.05, 0.01) == pytest.approx(0.04)


def test_monte_carlo_sans_volatilite_egale_deterministe():
    dist = simuler_monte_carlo(10_000.0, ParametresUC(0.05, 0.0), 10, nombre_simulations=5, graine=1)
    assert dist.mediane[-1] == pytest.approx(16_288.95, abs=0.01)
    assert dist.p5[-1] == pytest.approx(dist.p95[-1])


def test_monte_carlo_reproductible_et_moyenne_coherente():
    p = ParametresUC(rendement_moyen=0.05, volatilite=0.15)
    d1 = simuler_monte_carlo(10_000.0, p, 5, nombre_simulations=20_000, graine=7)
    d2 = simuler_monte_carlo(10_000.0, p, 5, nombre_simulations=20_000, graine=7)
    assert d1.mediane == d2.mediane
    # Espérance théorique de la valeur finale : 10 000 × 1,05^5 = 12 762,82 €
    assert d1.moyenne[-1] == pytest.approx(12_762.82, rel=0.02)
    assert d1.p5[-1] < d1.mediane[-1] < d1.p95[-1]
    assert d1.trajectoires.shape == (20_000, 5)
    assert 0.0 < d1.probabilite_perte_finale < 0.5


def test_generateur_seed_donne_serie_identique():
    p = ParametresUC(0.05, 0.2)
    a = generer_rendements(p, 5, np.random.default_rng(3))
    b = generer_rendements(p, 5, np.random.default_rng(3))
    assert a == b
    assert len(set(a)) == 5
