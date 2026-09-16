"""Rendement des unités de compte, en valeur moyenne ou par Monte Carlo.

Modèle : rendement annuel log-normal de moyenne ``rendement_moyen`` et
d'écart-type ``volatilite`` :

    r = exp((mu - sigma² / 2) + sigma × Z) - 1,  Z ~ N(0, 1)

où ``mu = ln(1 + rendement_moyen)``. En mode déterministe, le rendement vaut
``rendement_moyen`` chaque année.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

import numpy as np

from models.contrat import ParametresUC


def rendement_annuel(
    rendement_moyen: float,
    volatilite: float = 0.0,
    rng: Optional[np.random.Generator] = None,
) -> float:
    """Rendement d'une année ; déterministe si ``rng`` est absent ou volatilité nulle."""
    if rng is None or volatilite <= 0:
        return rendement_moyen
    mu = np.log1p(rendement_moyen)
    return float(np.exp(mu - 0.5 * volatilite**2 + volatilite * rng.standard_normal()) - 1.0)


def generer_rendements(
    parametres: ParametresUC,
    duree_annees: int,
    rng: Optional[np.random.Generator] = None,
) -> List[float]:
    """Série des rendements bruts annuels sur la durée."""
    return [
        rendement_annuel(parametres.rendement_moyen, parametres.volatilite, rng)
        for _ in range(duree_annees)
    ]


def rendement_net(rendement_brut: float, frais_gestion: float = 0.0) -> float:
    """Rendement net de frais de gestion (frais déduits de la performance)."""
    return rendement_brut - frais_gestion


def projeter_uc(capital_initial: float, rendements: List[float]) -> List[float]:
    """Valeur en fin de chaque année d'un capital unique (capitalisation composée)."""
    valeurs: List[float] = []
    capital = capital_initial
    for r in rendements:
        capital *= 1.0 + r
        valeurs.append(capital)
    return valeurs


@dataclass
class DistributionUC:
    """Distribution des valeurs de fin d'année sur N simulations.

    Chaque liste est indexée par année (indice 0 = fin de l'année 1).
    """

    nombre_simulations: int
    capital_initial: float
    moyenne: List[float]
    p5: List[float]
    p25: List[float]
    mediane: List[float]
    p75: List[float]
    p95: List[float]
    trajectoires: np.ndarray

    @property
    def probabilite_perte_finale(self) -> float:
        """Part des simulations dont la valeur finale est inférieure au capital initial."""
        return float(np.mean(self.trajectoires[:, -1] < self.capital_initial))


def simuler_monte_carlo(
    capital_initial: float,
    parametres: ParametresUC,
    duree_annees: int,
    nombre_simulations: int = 1000,
    graine: Optional[int] = None,
    frais_gestion: Optional[float] = None,
) -> DistributionUC:
    """Simule ``nombre_simulations`` trajectoires d'un capital unique en UC.

    Args:
        capital_initial: capital investi à l'origine.
        parametres: rendement moyen et volatilité.
        duree_annees: horizon en années.
        nombre_simulations: nombre de trajectoires (≥ 1).
        graine: graine du générateur pour la reproductibilité.
        frais_gestion: frais annuels ; par défaut ceux des paramètres.

    Returns:
        Distribution (moyenne et percentiles) des valeurs de fin d'année.
    """
    if nombre_simulations < 1:
        raise ValueError("Le nombre de simulations doit être ≥ 1.")
    frais = parametres.frais_gestion if frais_gestion is None else frais_gestion
    rng = np.random.default_rng(graine)
    mu = np.log1p(parametres.rendement_moyen)
    sigma = parametres.volatilite
    if sigma > 0:
        z = rng.standard_normal((nombre_simulations, duree_annees))
        rendements = np.exp(mu - 0.5 * sigma**2 + sigma * z) - 1.0
    else:
        rendements = np.full((nombre_simulations, duree_annees), parametres.rendement_moyen)
    facteurs = 1.0 + rendements - frais
    trajectoires = capital_initial * np.cumprod(facteurs, axis=1)
    pct = np.percentile(trajectoires, [5, 25, 50, 75, 95], axis=0)
    return DistributionUC(
        nombre_simulations=nombre_simulations,
        capital_initial=capital_initial,
        moyenne=trajectoires.mean(axis=0).tolist(),
        p5=pct[0].tolist(),
        p25=pct[1].tolist(),
        mediane=pct[2].tolist(),
        p75=pct[3].tolist(),
        p95=pct[4].tolist(),
        trajectoires=trajectoires,
    )
