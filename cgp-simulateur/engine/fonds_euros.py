"""Rendement et capitalisation d'un fonds en euros.

Le taux annuel de l'année ``n`` (n = 1 pour la première année) est :

    taux_n = max(plancher, taux_base + sens × variation × (n - 1) + bruit_n)

où ``sens`` vaut +1 (hausse), -1 (baisse) ou 0 (stable) et ``bruit_n`` est un
tirage normal centré d'écart-type ``volatilite`` (nul si la volatilité est
nulle ou si aucun générateur n'est fourni).
"""

from __future__ import annotations

from typing import List, Optional

import numpy as np

from models.contrat import ParametresFondsEuros
from models.scenario import ScenarioMarche, Tendance

_SENS = {Tendance.HAUSSE: 1.0, Tendance.BAISSE: -1.0, Tendance.STABLE: 0.0}


def taux_annuel(
    taux_base: float,
    annee: int,
    tendance: Tendance = Tendance.STABLE,
    variation_annuelle: float = 0.0,
    volatilite: float = 0.0,
    taux_plancher: float = 0.0,
    rng: Optional[np.random.Generator] = None,
) -> float:
    """Taux de rendement brut du fonds en euros pour l'année ``annee`` (≥ 1).

    Args:
        taux_base: taux de la première année.
        annee: rang de l'année (1 = première année).
        tendance: sens de l'évolution pluriannuelle.
        variation_annuelle: variation absolue par an, en points (≥ 0).
        volatilite: écart-type du bruit annuel, en points.
        taux_plancher: taux minimal garanti.
        rng: générateur aléatoire ; sans générateur, aucun bruit n'est ajouté.

    Returns:
        Taux annuel en fraction.
    """
    if annee < 1:
        raise ValueError("L'année doit être ≥ 1.")
    taux = taux_base + _SENS[tendance] * abs(variation_annuelle) * (annee - 1)
    if volatilite > 0 and rng is not None:
        taux += float(rng.normal(0.0, volatilite))
    return max(taux, taux_plancher)


def generer_taux(
    parametres: ParametresFondsEuros,
    scenario: ScenarioMarche,
    duree_annees: int,
    rng: Optional[np.random.Generator] = None,
) -> List[float]:
    """Série des taux bruts annuels sur la durée, support puis scénario par priorité.

    Les champs à ``None`` dans ``parametres`` sont remplacés par la valeur du
    scénario de marché.
    """
    tendance = parametres.tendance if parametres.tendance is not None else scenario.tendance
    variation = (
        parametres.variation_annuelle
        if parametres.variation_annuelle is not None
        else scenario.variation_annuelle
    )
    volatilite = parametres.volatilite if parametres.volatilite is not None else scenario.volatilite
    plancher = (
        parametres.taux_plancher if parametres.taux_plancher is not None else scenario.taux_plancher
    )
    return [
        taux_annuel(parametres.taux_base, annee, tendance, variation, volatilite, plancher, rng)
        for annee in range(1, duree_annees + 1)
    ]


def taux_net(taux_brut: float, frais_gestion: float = 0.0, taux_prelevements_sociaux: float = 0.0) -> float:
    """Taux servi net de frais de gestion puis net de prélèvements sociaux.

    Convention : les frais de gestion sont déduits du taux brut, puis les
    prélèvements sociaux sont retenus sur le taux net de frais (au fil de
    l'eau). Un taux net de frais négatif n'est pas prélevé socialement.
    """
    net_frais = taux_brut - frais_gestion
    if net_frais <= 0:
        return net_frais
    return net_frais * (1.0 - taux_prelevements_sociaux)


def capitaliser(capital: float, taux: float, fraction_annee: float = 1.0) -> float:
    """Capitalise un capital au taux annuel composé sur une fraction d'année.

    Args:
        capital: capital de départ.
        taux: taux annuel en fraction.
        fraction_annee: durée en années (1/12 pour un mois).
    """
    return capital * (1.0 + taux) ** fraction_annee


def projeter_fonds_euros(
    capital_initial: float,
    taux_annuels: List[float],
) -> List[float]:
    """Valeur en fin de chaque année d'un capital unique placé sur le fonds.

    Args:
        capital_initial: capital investi à l'origine.
        taux_annuels: taux nets appliqués année par année.

    Returns:
        Liste des valeurs de fin d'année, de même longueur que ``taux_annuels``.
    """
    valeurs: List[float] = []
    capital = capital_initial
    for taux in taux_annuels:
        capital = capitaliser(capital, taux)
        valeurs.append(capital)
    return valeurs
