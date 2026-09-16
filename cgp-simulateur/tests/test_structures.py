"""Tests de engine/structures.py."""

import numpy as np
import pytest

from engine.structures import (
    remboursement_maturite,
    simuler_trajectoire,
    statistiques_monte_carlo,
    valoriser_structure,
)
from models import MethodeSimulation, ModePerteStructure, ParametresStructure


def _params(**kwargs) -> ParametresStructure:
    base = dict(
        barriere_protection=0.6,
        barriere_coupon=0.7,
        niveau_coupon=0.05,
        memoire=True,
        autocall=True,
        barriere_autocall=1.0,
        maturite=5,
    )
    base.update(kwargs)
    return ParametresStructure(**base)


def test_trajectoire_deterministe():
    p = _params(tendance_sous_jacent=0.10, maturite=3)
    assert simuler_trajectoire(p) == pytest.approx([1.1, 1.21, 1.331])


def test_trajectoire_stochastique_reproductible():
    p = _params(volatilite_sous_jacent=0.2)
    a = simuler_trajectoire(p, MethodeSimulation.STOCHASTIQUE, np.random.default_rng(5))
    b = simuler_trajectoire(p, MethodeSimulation.STOCHASTIQUE, np.random.default_rng(5))
    assert a == b
    assert len(a) == 5


def test_autocall_annee_2():
    # Année 1 : 95 % (coupon), année 2 : 105 % (autocall). Nominal 10 000 €.
    res = valoriser_structure(10_000.0, _params(), [0.95, 1.05, 1.0, 1.0, 1.0])
    assert res.coupons == pytest.approx([500.0, 500.0, 0.0, 0.0, 0.0])
    assert res.remboursements == pytest.approx([0.0, 10_000.0, 0.0, 0.0, 0.0])
    assert res.annee_sortie == 2
    assert res.valeurs == pytest.approx([10_000.0, 0.0, 0.0, 0.0, 0.0])
    assert res.rendement_total == pytest.approx(0.10)


def test_effet_memoire_rattrape_les_coupons():
    # 65 % (sous barrière coupon, mémorisé), 65 % (mémorisé), 80 % : 3 coupons versés d'un coup.
    traj = [0.65, 0.65, 0.80, 0.80, 0.80]
    res = valoriser_structure(10_000.0, _params(autocall=False), traj)
    assert res.coupons[:3] == pytest.approx([0.0, 0.0, 1_500.0])
    assert res.coupons[3:] == pytest.approx([500.0, 500.0])
    assert res.remboursements[-1] == 10_000.0
    assert res.total_coupons == pytest.approx(2_500.0)


def test_sans_memoire_les_coupons_sont_perdus():
    traj = [0.65, 0.65, 0.80, 0.80, 0.80]
    res = valoriser_structure(10_000.0, _params(autocall=False, memoire=False), traj)
    assert res.total_coupons == pytest.approx(1_500.0)


def test_maturite_sous_barriere_perte_depuis_barriere():
    # Niveau final 50 %, barrière 60 % : perte = 10 % du nominal.
    p = _params(autocall=False, mode_perte=ModePerteStructure.DEPUIS_BARRIERE)
    assert remboursement_maturite(10_000.0, 0.50, p) == pytest.approx(9_000.0)
    res = valoriser_structure(10_000.0, p, [0.5] * 5)
    assert res.remboursements[-1] == pytest.approx(9_000.0)
    assert res.perte_en_capital == pytest.approx(1_000.0)
    assert res.total_coupons == 0.0


def test_maturite_sous_barriere_perte_depuis_strike():
    p = _params(autocall=False, mode_perte=ModePerteStructure.DEPUIS_STRIKE)
    assert remboursement_maturite(10_000.0, 0.50, p) == pytest.approx(5_000.0)


def test_maturite_au_dessus_barriere_capital_rembourse():
    p = _params(autocall=False)
    assert remboursement_maturite(10_000.0, 0.60, p) == 10_000.0
    assert remboursement_maturite(10_000.0, 0.95, p) == 10_000.0


def test_dates_observation_partielles():
    # Observation seulement aux années 2 et 4 (maturité 4) : l'année 1 à 120 % n'autocalle pas.
    p = _params(maturite=4, dates_observation=[2, 4])
    res = valoriser_structure(10_000.0, p, [1.2, 0.9, 1.3, 1.0])
    assert res.annee_sortie == 4
    assert res.coupons == pytest.approx([0.0, 500.0, 0.0, 500.0])


def test_maturite_doit_etre_une_date_observation():
    with pytest.raises(ValueError):
        ParametresStructure(maturite=5, dates_observation=[1, 2])


def test_statistiques_monte_carlo_bornes():
    stats = statistiques_monte_carlo(10_000.0, _params(volatilite_sous_jacent=0.25), 300, graine=11)
    assert 0.0 <= stats["probabilite_autocall"] <= 1.0
    assert 0.0 <= stats["probabilite_perte"] <= 1.0
    assert 1.0 <= stats["duree_moyenne"] <= 5.0
