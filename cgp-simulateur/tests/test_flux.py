"""Tests de engine/flux.py."""

from datetime import date

from engine.flux import (
    TypeFlux,
    ajouter_mois,
    echeances,
    generer_flux,
    mois_ecoules,
    total_versements,
)
from models import (
    Contrat,
    ParametresFondsEuros,
    Periodicite,
    RachatProgramme,
    Support,
    TypeSupport,
    VersementComplementaire,
    VersementProgramme,
)


def _contrat(**kwargs) -> Contrat:
    base = dict(
        nom="Flux",
        montant_initial=10_000.0,
        duree_annees=2,
        date_souscription=date(2026, 1, 31),
        supports=[Support("FE", TypeSupport.FONDS_EUROS, 1.0, ParametresFondsEuros())],
    )
    base.update(kwargs)
    return Contrat(**base)


def test_ajouter_mois_borne_fin_de_mois():
    assert ajouter_mois(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert ajouter_mois(date(2026, 1, 31), 13) == date(2027, 2, 28)
    assert ajouter_mois(date(2026, 11, 15), 2) == date(2027, 1, 15)


def test_mois_ecoules():
    assert mois_ecoules(date(2026, 1, 1), date(2026, 1, 1)) == 0
    assert mois_ecoules(date(2026, 1, 1), date(2026, 12, 31)) == 11
    assert mois_ecoules(date(2026, 1, 1), date(2027, 1, 1)) == 12


def test_echeances_exclut_la_date_de_fin():
    dates = echeances(date(2026, 2, 1), Periodicite.MENSUELLE, date(2027, 1, 1))
    assert len(dates) == 11
    assert dates[0] == date(2026, 2, 1)
    assert dates[-1] == date(2026, 12, 1)


def test_versement_initial_seul():
    flux = generer_flux(_contrat())
    assert len(flux) == 1
    assert flux[0].type == TypeFlux.VERSEMENT_INITIAL
    assert flux[0].montant == 10_000.0
    assert flux[0].date == date(2026, 1, 31)


def test_versements_mensuels_sur_deux_ans():
    contrat = _contrat(versements_programmes=[VersementProgramme(100.0, Periodicite.MENSUELLE)])
    flux = generer_flux(contrat)
    programmes = [f for f in flux if f.type == TypeFlux.VERSEMENT_PROGRAMME]
    # Premier versement un mois après souscription, dernier le mois précédant le terme : 23 versements.
    assert len(programmes) == 23
    assert total_versements(flux) == 10_000.0 + 23 * 100.0


def test_indexation_annuelle_du_versement_programme():
    contrat = _contrat(
        duree_annees=3,
        versements_programmes=[
            VersementProgramme(1_000.0, Periodicite.ANNUELLE, date_debut=date(2026, 1, 31), indexation=0.10)
        ],
    )
    programmes = [f for f in generer_flux(contrat) if f.type == TypeFlux.VERSEMENT_PROGRAMME]
    assert [round(f.montant, 2) for f in programmes] == [1_000.0, 1_100.0, 1_210.0]


def test_rachat_trimestriel_et_ordre_chronologique():
    contrat = _contrat(
        rachats_programmes=[RachatProgramme(montant=500.0, periodicite=Periodicite.TRIMESTRIELLE)],
        versements_complementaires=[VersementComplementaire(2_000.0, date(2026, 7, 31))],
    )
    flux = generer_flux(contrat)
    dates = [f.date for f in flux]
    assert dates == sorted(dates)
    rachats = [f for f in flux if f.type == TypeFlux.RACHAT_PROGRAMME]
    assert len(rachats) == 7  # avril 2026 ... octobre 2027
    assert rachats[0].date == date(2026, 4, 30)
    # Versement et rachat le même jour : le versement est traité en premier.
    memes_jour = [f for f in flux if f.date == date(2026, 7, 31)]
    assert [f.type for f in memes_jour] == [TypeFlux.VERSEMENT_COMPLEMENTAIRE, TypeFlux.RACHAT_PROGRAMME]


def test_rachat_en_pourcentage_sans_montant():
    contrat = _contrat(rachats_programmes=[RachatProgramme(pourcentage=0.04, periodicite=Periodicite.ANNUELLE)])
    rachats = [f for f in generer_flux(contrat) if f.type == TypeFlux.RACHAT_PROGRAMME]
    assert len(rachats) == 1
    assert rachats[0].montant is None
    assert rachats[0].pourcentage == 0.04


def test_versement_complementaire_hors_periode_ignore():
    contrat = _contrat(versements_complementaires=[VersementComplementaire(1.0, date(2030, 1, 1))])
    assert len(generer_flux(contrat)) == 1
