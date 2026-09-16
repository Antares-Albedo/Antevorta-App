"""Scénario de marché et paramètres fiscaux appliqués à une projection."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class Tendance(str, Enum):
    """Tendance pluriannuelle d'un taux ou d'un sous-jacent."""

    HAUSSE = "hausse"
    BAISSE = "baisse"
    STABLE = "stable"


class MethodeSimulation(str, Enum):
    """Mode de génération des trajectoires (rendements UC, sous-jacent des structurés)."""

    DETERMINISTE = "deterministe"
    STOCHASTIQUE = "stochastique"


@dataclass(frozen=True)
class ScenarioMarche:
    """Hypothèses de marché communes à l'ensemble des supports.

    Les valeurs de ce scénario servent de défaut : chaque support peut les
    surcharger via ses propres paramètres (voir ``ParametresFondsEuros``).

    Attributes:
        tendance: orientation pluriannuelle des taux du fonds en euros et du
            sous-jacent des produits structurés en mode déterministe.
        variation_annuelle: variation annuelle absolue du taux du fonds en
            euros (en points, ex. 0.002 = +0,20 pt par an) appliquée dans le
            sens de ``tendance``. Ignorée si la tendance est stable.
        volatilite: écart-type annuel du bruit ajouté au taux du fonds en
            euros (en points, ex. 0.003). 0 pour un taux déterministe.
        taux_plancher: taux minimal garanti (plancher réglementaire ou
            contractuel) du fonds en euros, en fraction (ex. 0.0 ou 0.01).
        methode: déterministe (valeur moyenne) ou stochastique (tirages).
        nombre_simulations: nombre de trajectoires en mode Monte Carlo
            (utilisé par ``engine.projection.projeter_monte_carlo``).
        graine: graine du générateur aléatoire pour la reproductibilité.
    """

    tendance: Tendance = Tendance.STABLE
    variation_annuelle: float = 0.0
    volatilite: float = 0.0
    taux_plancher: float = 0.0
    methode: MethodeSimulation = MethodeSimulation.DETERMINISTE
    nombre_simulations: int = 1000
    graine: Optional[int] = None


@dataclass(frozen=True)
class ParametresFiscaux:
    """Paramètres fiscaux applicables aux rachats (assurance-vie et capitalisation).

    Valeurs par défaut au 16/09/2026 : régime du prélèvement forfaitaire
    unique (PFU) pour les produits afférents aux primes versées depuis le
    27/09/2017. À contrôler à chaque loi de finances.

    Attributes:
        taux_prelevements_sociaux: prélèvements sociaux sur les produits.
        taux_ir_avant_8_ans: prélèvement forfaitaire d'IR avant 8 ans.
        taux_ir_apres_8_ans_reduit: taux réduit après 8 ans (primes ≤ seuil).
        taux_ir_apres_8_ans_plein: taux après 8 ans au-delà du seuil de primes.
        seuil_primes_taux_reduit: encours de primes nettes tous contrats
            au-delà duquel le taux plein s'applique.
        abattement_celibataire: abattement annuel après 8 ans, personne seule.
        abattement_couple: abattement annuel après 8 ans, couple soumis à
            imposition commune.
        prelevements_sociaux_fil_eau: si vrai, les prélèvements sociaux sont
            retenus chaque année sur les intérêts du fonds en euros.
    """

    taux_prelevements_sociaux: float = 0.172
    taux_ir_avant_8_ans: float = 0.128
    taux_ir_apres_8_ans_reduit: float = 0.075
    taux_ir_apres_8_ans_plein: float = 0.128
    seuil_primes_taux_reduit: float = 150_000.0
    abattement_celibataire: float = 4_600.0
    abattement_couple: float = 9_200.0
    prelevements_sociaux_fil_eau: bool = True
