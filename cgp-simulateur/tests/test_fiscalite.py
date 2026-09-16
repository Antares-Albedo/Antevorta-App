"""Tests de engine/fiscalite.py."""

import pytest

from engine.fiscalite import calculer_fiscalite_rachat, part_produits_rachat, prelevements_sociaux_fil_eau
from models import ParametresFiscaux


def test_part_produits_rachat_partiel():
    # Contrat à 120 000 € pour 100 000 € de primes : un rachat de 12 000 € contient 2 000 € de produits.
    assert part_produits_rachat(12_000.0, 120_000.0, 100_000.0) == pytest.approx(2_000.0)


def test_part_produits_sans_plus_value():
    assert part_produits_rachat(5_000.0, 90_000.0, 100_000.0) == 0.0


def test_rachat_avant_8_ans_pfu():
    # 2 000 € de produits : IR 12,8 % = 256 €, PS 17,2 % = 344 €, net 12 000 - 600 = 11 400 €.
    f = calculer_fiscalite_rachat(12_000.0, 120_000.0, 100_000.0, anciennete_annees=5)
    assert f.part_produits == pytest.approx(2_000.0)
    assert f.impot_revenu == pytest.approx(256.0)
    assert f.prelevements_sociaux == pytest.approx(344.0)
    assert f.montant_net == pytest.approx(11_400.0)


def test_rachat_apres_8_ans_abattement_celibataire():
    # 6 000 € de produits, abattement 4 600 € : IR 7,5 % × 1 400 = 105 €, PS 17,2 % × 6 000 = 1 032 €.
    f = calculer_fiscalite_rachat(36_000.0, 120_000.0, 100_000.0, anciennete_annees=9)
    assert f.part_produits == pytest.approx(6_000.0)
    assert f.abattement_utilise == pytest.approx(4_600.0)
    assert f.impot_revenu == pytest.approx(105.0)
    assert f.prelevements_sociaux == pytest.approx(1_032.0)
    assert f.montant_net == pytest.approx(36_000.0 - 105.0 - 1_032.0)


def test_rachat_apres_8_ans_couple_et_seuil_150k():
    # Primes 300 000 € : moitié au taux réduit, moitié au taux plein.
    f = calculer_fiscalite_rachat(
        60_000.0, 360_000.0, 300_000.0, anciennete_annees=10, couple=True
    )
    produits = 10_000.0
    base = produits - 9_200.0
    attendu = base * (0.5 * 0.075 + 0.5 * 0.128)
    assert f.part_produits == pytest.approx(produits)
    assert f.impot_revenu == pytest.approx(attendu)


def test_produits_deja_soumis_aux_ps_ne_sont_pas_retaxes():
    f = calculer_fiscalite_rachat(
        12_000.0, 120_000.0, 100_000.0, anciennete_annees=3, produits_deja_soumis_ps=1_500.0
    )
    assert f.prelevements_sociaux == pytest.approx(500.0 * 0.172)


def test_prelevements_sociaux_fil_eau():
    assert prelevements_sociaux_fil_eau(1_000.0) == pytest.approx(172.0)
    assert prelevements_sociaux_fil_eau(1_000.0, ParametresFiscaux(prelevements_sociaux_fil_eau=False)) == 0.0
    assert prelevements_sociaux_fil_eau(-50.0) == 0.0
