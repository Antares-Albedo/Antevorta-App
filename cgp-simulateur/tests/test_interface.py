"""Tests de fumée de interface/ : exports et exécution de l'application Streamlit."""

import json
from pathlib import Path

import pytest

from engine.projection import projeter
from interface.export import dataframe_synthese, exporter_excel, exporter_pdf, formater_euros, formater_pourcentage
from models import charger_contrat

RACINE = Path(__file__).resolve().parents[1]


def _exemples():
    with open(RACINE / "data" / "exemples_contrats.json", encoding="utf-8") as f:
        return json.load(f)["exemples"]


def test_formatage_francais():
    assert formater_euros(1234567.4) == "1 234 567 €"
    assert formater_pourcentage(0.0325) == "3,25 %"


def test_exports_produisent_des_fichiers_valides():
    contrat = charger_contrat(_exemples()[1])
    resultat = projeter(contrat)
    xlsx = exporter_excel(resultat, contrat)
    pdf = exporter_pdf(resultat, contrat, conseiller="Cabinet exemple")
    assert xlsx[:2] == b"PK"
    assert pdf[:4] == b"%PDF"
    df = dataframe_synthese(resultat)
    assert len(df) == contrat.duree_annees
    assert "Fonds en euros" in df.columns


def test_application_streamlit_charge_et_simule():
    AppTest = pytest.importorskip("streamlit.testing.v1").AppTest
    at = AppTest.from_file(str(RACINE / "interface" / "app.py"), default_timeout=120)
    at.run()
    assert not at.exception
    [b for b in at.button if b.label == "Lancer la simulation"][0].click().run()
    assert not at.exception
    assert not at.error
    assert any(m.label == "Valeur au terme" for m in at.metric)
