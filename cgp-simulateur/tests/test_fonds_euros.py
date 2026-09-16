"""Tests de engine/fonds_euros.py."""

import numpy as np
import pytest

from engine.fonds_euros import capitaliser, generer_taux, projeter_fonds_euros, taux_annuel, taux_net
from models import ParametresFondsEuros, ScenarioMarche, Tendance


def test_taux_fixe_5_ans_valeur_finale():
    # 10 000 € à 3 % pendant 5 ans : 10 000 × 1,03^5 = 11 592,74 €
    valeurs = projeter_fonds_euros(10_000.0, [0.03] * 5)
    assert valeurs[-1] == pytest.approx(11_592.74, abs=0.01)
    assert valeurs[0] == pytest.approx(10_300.0)


def test_tendance_baisse_avec_plancher():
    # 3 % en baisse de 0,5 pt par an, plancher 2 % : 3, 2.5, 2, 2, 2
    taux = [taux_annuel(0.03, a, Tendance.BAISSE, 0.005, 0.0, 0.02) for a in range(1, 6)]
    assert taux == pytest.approx([0.03, 0.025, 0.02, 0.02, 0.02])


def test_tendance_hausse():
    taux = [taux_annuel(0.02, a, Tendance.HAUSSE, 0.0025) for a in range(1, 4)]
    assert taux == pytest.approx([0.02, 0.0225, 0.025])


def test_volatilite_reproductible_et_plancher_respecte():
    rng = np.random.default_rng(42)
    p = ParametresFondsEuros(taux_base=0.02, volatilite=0.01, taux_plancher=0.015)
    serie = generer_taux(p, ScenarioMarche(), 50, rng)
    assert min(serie) >= 0.015
    rng2 = np.random.default_rng(42)
    assert serie == generer_taux(p, ScenarioMarche(), 50, rng2)


def test_scenario_par_defaut_et_surcharge_support():
    scenario = ScenarioMarche(tendance=Tendance.BAISSE, variation_annuelle=0.01)
    # Le support ne surcharge rien : la tendance du scénario s'applique.
    assert generer_taux(ParametresFondsEuros(taux_base=0.03), scenario, 2) == pytest.approx([0.03, 0.02])
    # Le support impose une tendance stable.
    p = ParametresFondsEuros(taux_base=0.03, tendance=Tendance.STABLE)
    assert generer_taux(p, scenario, 2) == pytest.approx([0.03, 0.03])


def test_taux_net_frais_puis_prelevements_sociaux():
    # 3 % brut, 0,6 % de frais, 17,2 % de PS : (3 - 0,6) × 0,828 = 1,9872 %
    assert taux_net(0.03, 0.006, 0.172) == pytest.approx(0.019872)
    assert taux_net(0.03) == pytest.approx(0.03)


def test_capitalisation_mensuelle_equivaut_annuelle():
    capital = 1_000.0
    for _ in range(12):
        capital = capitaliser(capital, 0.03, 1 / 12)
    assert capital == pytest.approx(1_030.0)
