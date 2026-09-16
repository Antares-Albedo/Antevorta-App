"""Tests de engine/projection.py (orchestrateur)."""

from datetime import date

import pytest

from engine.projection import LIQUIDITES, fiscalite_rachat_total, projeter, projeter_monte_carlo
from models import (
    Contrat,
    MethodeSimulation,
    ParametresFiscaux,
    ParametresFondsEuros,
    ParametresStructure,
    ParametresUC,
    Periodicite,
    RachatProgramme,
    ScenarioMarche,
    Support,
    Tendance,
    TypeSupport,
    VersementComplementaire,
    VersementProgramme,
)


def test_versement_unique_fonds_euros_5_ans(contrat_fonds_euros, sans_ps):
    res = projeter(contrat_fonds_euros, fiscal=sans_ps)
    assert len(res.lignes) == 5
    assert res.valeur_finale == pytest.approx(10_000.0 * 1.03**5, abs=0.01)
    assert res.lignes[0].versements == 10_000.0
    assert res.lignes[0].performance_nette == pytest.approx(0.03, abs=1e-9)
    assert res.lignes[-1].plus_value_nette == pytest.approx(1_592.74, abs=0.01)
    assert res.lignes[-1].date_fin == date(2031, 1, 1)


def test_prelevements_sociaux_au_fil_de_l_eau(contrat_fonds_euros):
    # Taux net = 3 % × (1 - 0,172) = 2,484 %
    res = projeter(contrat_fonds_euros, fiscal=ParametresFiscaux())
    assert res.valeur_finale == pytest.approx(10_000.0 * 1.02484**5, abs=0.01)
    # PS de l'année 1 : intérêts bruts 300 € × 17,2 % = 51,60 €
    assert res.lignes[0].prelevements_sociaux == pytest.approx(51.60, abs=0.01)


def test_frais_sur_versement_et_de_gestion(sans_ps):
    contrat = Contrat(
        nom="Frais",
        montant_initial=10_000.0,
        duree_annees=1,
        date_souscription=date(2026, 1, 1),
        frais_versement=0.02,
        supports=[Support("FE", TypeSupport.FONDS_EUROS, 1.0, ParametresFondsEuros(taux_base=0.03, frais_gestion=0.006))],
    )
    res = projeter(contrat, fiscal=sans_ps)
    # 9 800 € investis au taux net 2,4 %
    assert res.valeur_finale == pytest.approx(9_800.0 * 1.024, abs=0.01)
    assert res.lignes[0].frais == pytest.approx(200.0 + 9_800.0 * 0.006, rel=0.01)


def test_versements_programmes_annuels_capitalises(sans_ps):
    # 0 € initial, 1 000 € chaque 01/01 à partir de 2026 pendant 3 ans à 3 % :
    # 1 000 × (1,03^3 + 1,03^2 + 1,03) = 3 183,63 €
    contrat = Contrat(
        nom="VP",
        montant_initial=0.0,
        duree_annees=3,
        date_souscription=date(2026, 1, 1),
        supports=[Support("FE", TypeSupport.FONDS_EUROS, 1.0, ParametresFondsEuros(taux_base=0.03))],
        versements_programmes=[VersementProgramme(1_000.0, Periodicite.ANNUELLE, date_debut=date(2026, 1, 1))],
    )
    res = projeter(contrat, fiscal=sans_ps)
    assert res.valeur_finale == pytest.approx(3_183.63, abs=0.01)
    assert res.total_versements == 3_000.0


def test_rachat_annuel_fixe_sur_support(sans_ps):
    # 10 000 € à 3 %, rachat de 1 000 € le 01/01/2027 : (10 300 - 1 000) × 1,03 = 9 579 €
    contrat = Contrat(
        nom="Rachat",
        montant_initial=10_000.0,
        duree_annees=2,
        date_souscription=date(2026, 1, 1),
        supports=[Support("FE", TypeSupport.FONDS_EUROS, 1.0, ParametresFondsEuros(taux_base=0.03))],
        rachats_programmes=[
            RachatProgramme(montant=1_000.0, periodicite=Periodicite.ANNUELLE, date_debut=date(2027, 1, 1), support_prelevement="FE")
        ],
    )
    res = projeter(contrat, fiscal=sans_ps)
    assert res.valeur_finale == pytest.approx(9_579.0, abs=0.01)
    assert res.lignes[1].rachats == 1_000.0
    assert res.lignes[1].performance_nette == pytest.approx(0.03, abs=1e-9)


def test_rachat_en_pourcentage(sans_ps):
    contrat = Contrat(
        nom="Rachat %",
        montant_initial=10_000.0,
        duree_annees=2,
        date_souscription=date(2026, 1, 1),
        supports=[Support("FE", TypeSupport.FONDS_EUROS, 1.0, ParametresFondsEuros(taux_base=0.03))],
        rachats_programmes=[RachatProgramme(pourcentage=0.10, periodicite=Periodicite.ANNUELLE, date_debut=date(2027, 1, 1))],
    )
    res = projeter(contrat, fiscal=sans_ps)
    assert res.lignes[1].rachats == pytest.approx(1_030.0)
    assert res.valeur_finale == pytest.approx(10_300.0 * 0.9 * 1.03, abs=0.01)


def test_allocation_multi_supports_deterministe(sans_ps):
    contrat = Contrat(
        nom="Mixte",
        montant_initial=10_000.0,
        duree_annees=1,
        date_souscription=date(2026, 1, 1),
        supports=[
            Support("FE", TypeSupport.FONDS_EUROS, 0.6, ParametresFondsEuros(taux_base=0.03)),
            Support("UC", TypeSupport.UC, 0.4, ParametresUC(rendement_moyen=0.05, volatilite=0.2)),
        ],
    )
    res = projeter(contrat, fiscal=sans_ps)
    ligne = res.lignes[0]
    assert ligne.repartition["FE"] == pytest.approx(6_000.0 * 1.03)
    assert ligne.repartition["UC"] == pytest.approx(4_000.0 * 1.05)
    assert ligne.valeur_fin == pytest.approx(6_180.0 + 4_200.0)


def test_structure_autocall_reinvesti_sur_fonds_euros(sans_ps):
    # 10 000 € : 50 % FE à 0 %, 50 % structuré. Sous-jacent +5 %/an : autocall année 1
    # (barrière 100 %), coupon 5 % : le FE reçoit 5 000 + 250 = 5 250 € en fin d'année 1.
    contrat = Contrat(
        nom="Structuré",
        montant_initial=10_000.0,
        duree_annees=3,
        date_souscription=date(2026, 1, 1),
        supports=[
            Support("FE", TypeSupport.FONDS_EUROS, 0.5, ParametresFondsEuros(taux_base=0.0)),
            Support("ST", TypeSupport.STRUCTURE, 0.5, ParametresStructure(niveau_coupon=0.05, maturite=5, tendance_sous_jacent=0.05)),
        ],
    )
    res = projeter(contrat, fiscal=sans_ps)
    l1 = res.lignes[0]
    assert l1.coupons == pytest.approx(250.0)
    assert l1.repartition["ST"] == 0.0
    assert l1.repartition["FE"] == pytest.approx(10_250.0)
    assert l1.valeur_fin == pytest.approx(10_250.0)
    assert any("remboursement anticipé" in e for e in res.evenements)
    assert res.valeur_finale == pytest.approx(10_250.0)


def test_structure_perte_a_maturite(sans_ps):
    # Sous-jacent -10 %/an, maturité 3 : niveaux 0,9 / 0,81 / 0,729 ; barrière protection 80 %,
    # barrière coupon 85 %, sans autocall ni mémoire. Coupon année 1 seulement (0,9 ≥ 0,85).
    # Maturité : perte = 0,80 - 0,729 = 7,1 % du nominal.
    contrat = Contrat(
        nom="Perte",
        montant_initial=10_000.0,
        duree_annees=4,
        date_souscription=date(2026, 1, 1),
        supports=[
            Support("FE", TypeSupport.FONDS_EUROS, 0.0, ParametresFondsEuros(taux_base=0.0)),
            Support(
                "ST",
                TypeSupport.STRUCTURE,
                1.0,
                ParametresStructure(
                    barriere_protection=0.8,
                    barriere_coupon=0.85,
                    niveau_coupon=0.04,
                    memoire=False,
                    autocall=False,
                    maturite=3,
                    tendance_sous_jacent=-0.10,
                ),
            ),
        ],
    )
    res = projeter(contrat, fiscal=sans_ps)
    assert res.lignes[0].coupons == pytest.approx(400.0)
    assert res.lignes[1].coupons == 0.0
    # Année 2 : valeur indicative = nominal car 0,81 ≥ 0,80.
    assert res.lignes[1].repartition["ST"] == pytest.approx(10_000.0)
    assert res.lignes[2].repartition["ST"] == 0.0
    assert res.lignes[2].repartition["FE"] == pytest.approx(400.0 + 10_000.0 * (1 - 0.071))
    assert res.valeur_finale == pytest.approx(9_690.0)


def test_versement_programme_vers_structure_redirige(sans_ps):
    contrat = Contrat(
        nom="Redirection",
        montant_initial=0.0,
        duree_annees=1,
        date_souscription=date(2026, 1, 1),
        supports=[
            Support("UC", TypeSupport.UC, 0.5, ParametresUC(rendement_moyen=0.0, volatilite=0.0)),
            Support("ST", TypeSupport.STRUCTURE, 0.5, ParametresStructure(maturite=5, tendance_sous_jacent=-0.5)),
        ],
        versements_complementaires=[VersementComplementaire(1_000.0, date(2026, 6, 1))],
    )
    res = projeter(contrat, fiscal=sans_ps)
    assert res.lignes[0].repartition["ST"] == 0.0
    assert res.lignes[0].repartition["UC"] == pytest.approx(1_000.0)
    assert LIQUIDITES not in res.lignes[0].repartition


def test_monte_carlo_contrat_complet(contrat_mixte, sans_ps):
    scenario = ScenarioMarche(methode=MethodeSimulation.STOCHASTIQUE, graine=3, volatilite=0.002)
    mc = projeter_monte_carlo(contrat_mixte, scenario, sans_ps, nombre_simulations=50)
    assert mc.nombre_simulations == 50
    assert len(mc.distributions) == 10
    d = mc.distributions[-1]
    assert d.p5 <= d.p25 <= d.mediane <= d.p75 <= d.p95
    assert 0.0 <= mc.probabilite_perte <= 1.0
    mc2 = projeter_monte_carlo(contrat_mixte, scenario, sans_ps, nombre_simulations=50)
    assert mc2.distributions[-1].mediane == mc.distributions[-1].mediane


def test_scenario_baisse_fonds_euros(contrat_fonds_euros, sans_ps):
    scenario = ScenarioMarche(tendance=Tendance.BAISSE, variation_annuelle=0.01, taux_plancher=0.01)
    res = projeter(contrat_fonds_euros, scenario, sans_ps)
    # Taux : 3, 2, 1, 1, 1 %
    attendu = 10_000.0 * 1.03 * 1.02 * 1.01**3
    assert res.valeur_finale == pytest.approx(attendu, abs=0.01)


def test_fiscalite_rachat_total(contrat_fonds_euros, sans_ps):
    res = projeter(contrat_fonds_euros, fiscal=sans_ps)
    f = fiscalite_rachat_total(res, contrat_fonds_euros, sans_ps)
    produits = res.valeur_finale - 10_000.0
    assert f.part_produits == pytest.approx(produits)
    assert f.impot_revenu == pytest.approx(produits * 0.128)
    assert f.prelevements_sociaux == pytest.approx(produits * 0.172)
