"""Valorisation d'un produit structuré à capital protégé (autocall / Phoenix).

Déroulement :

1. Trajectoire du sous-jacent, exprimée en fraction du niveau initial
   (1.0 = niveau de départ). Déterministe : ``(1 + tendance) ** t``.
   Stochastique : mouvement brownien géométrique annuel.
2. À chaque date d'observation (années de ``dates_observation``) :
   - si autocall actif et niveau ≥ barrière d'autocall : coupon de la
     période (+ coupons mémorisés) puis remboursement du nominal, fin ;
   - sinon si niveau ≥ barrière de coupon : coupon (+ mémoire) ;
   - sinon : coupon perdu, ou mémorisé si effet mémoire.
3. À maturité (si pas d'autocall avant) : nominal si niveau ≥ barrière de
   protection, sinon nominal diminué de la perte selon ``mode_perte``.

Entre deux observations, la valeur indicative du produit est le nominal,
ramené à sa valeur de remboursement théorique si le sous-jacent est sous la
barrière de protection (valeur intrinsèque, hors valeur temps).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np

from models.contrat import ModePerteStructure, ParametresStructure
from models.scenario import MethodeSimulation


def simuler_trajectoire(
    parametres: ParametresStructure,
    methode: MethodeSimulation = MethodeSimulation.DETERMINISTE,
    rng: Optional[np.random.Generator] = None,
    tendance_annuelle: Optional[float] = None,
) -> List[float]:
    """Niveaux du sous-jacent en fin de chaque année, jusqu'à la maturité.

    Args:
        parametres: paramètres du produit (tendance, volatilité, maturité).
        methode: déterministe ou stochastique.
        rng: générateur aléatoire (requis en mode stochastique ; sinon un
            générateur non reproductible est créé).
        tendance_annuelle: dérive annuelle surchargeant celle des paramètres.

    Returns:
        Liste de longueur ``maturite`` ; l'indice 0 correspond à la fin de
        l'année 1. Les niveaux sont relatifs au niveau initial (1.0).
    """
    mu = parametres.tendance_sous_jacent if tendance_annuelle is None else tendance_annuelle
    n = parametres.maturite
    if methode == MethodeSimulation.DETERMINISTE or parametres.volatilite_sous_jacent <= 0:
        return [(1.0 + mu) ** t for t in range(1, n + 1)]
    generateur = rng if rng is not None else np.random.default_rng()
    sigma = parametres.volatilite_sous_jacent
    log_mu = np.log1p(mu)
    increments = log_mu - 0.5 * sigma**2 + sigma * generateur.standard_normal(n)
    return np.exp(np.cumsum(increments)).tolist()


def remboursement_maturite(nominal: float, niveau: float, parametres: ParametresStructure) -> float:
    """Montant remboursé à maturité selon le niveau final du sous-jacent.

    Args:
        nominal: capital investi.
        niveau: niveau final relatif au niveau initial.
        parametres: barrière de protection et convention de perte.
    """
    if niveau >= parametres.barriere_protection:
        return nominal
    if parametres.mode_perte == ModePerteStructure.DEPUIS_STRIKE:
        return nominal * max(niveau, 0.0)
    perte = parametres.barriere_protection - niveau
    return nominal * max(1.0 - perte, 0.0)


@dataclass
class EvenementObservation:
    """Résultat d'une date d'observation."""

    annee: int
    niveau: float
    coupon_verse: float
    coupons_memorises: float
    rappel_anticipe: bool
    capital_rembourse: float


@dataclass
class ResultatStructure:
    """Trajectoire de valeur d'un produit structuré.

    Attributes:
        nominal: capital investi à l'origine.
        valeurs: valeur indicative en fin de chaque année (0 après remboursement).
        coupons: coupon perçu chaque année (indice 0 = année 1).
        remboursements: capital remboursé chaque année (autocall ou maturité).
        annee_sortie: année du remboursement (``None`` si non remboursé sur
            l'horizon).
        observations: détail de chaque date d'observation.
        perte_en_capital: perte constatée à maturité, en euros (≥ 0).
    """

    nominal: float
    valeurs: List[float]
    coupons: List[float]
    remboursements: List[float]
    annee_sortie: Optional[int]
    observations: List[EvenementObservation] = field(default_factory=list)
    perte_en_capital: float = 0.0

    @property
    def total_coupons(self) -> float:
        return sum(self.coupons)

    @property
    def total_rembourse(self) -> float:
        return sum(self.remboursements)

    @property
    def rendement_total(self) -> float:
        """(coupons + capital remboursé - nominal) / nominal."""
        if self.nominal <= 0:
            return 0.0
        return (self.total_coupons + self.total_rembourse - self.nominal) / self.nominal


def valoriser_structure(
    nominal: float,
    parametres: ParametresStructure,
    trajectoire: List[float],
    horizon_annees: Optional[int] = None,
) -> ResultatStructure:
    """Applique le mécanisme du produit à une trajectoire donnée.

    Args:
        nominal: capital investi.
        parametres: caractéristiques du produit.
        trajectoire: niveaux du sous-jacent en fin d'année (indice 0 = année 1),
            de longueur ≥ ``parametres.maturite``.
        horizon_annees: longueur des listes de sortie ; par défaut la maturité.

    Returns:
        ``ResultatStructure`` détaillant valeurs, coupons et remboursements.
    """
    if len(trajectoire) < parametres.maturite:
        raise ValueError("La trajectoire doit couvrir la maturité du produit.")
    horizon = horizon_annees if horizon_annees is not None else parametres.maturite
    valeurs = [0.0] * horizon
    coupons = [0.0] * horizon
    remboursements = [0.0] * horizon
    observations: List[EvenementObservation] = []
    coupon_periode = nominal * parametres.niveau_coupon
    memoire = 0.0
    annee_sortie: Optional[int] = None
    perte = 0.0
    obs = set(parametres.dates_observation)

    for annee in range(1, horizon + 1):
        if annee_sortie is not None:
            break
        if annee > parametres.maturite:
            break
        niveau = trajectoire[annee - 1]
        coupon_verse = 0.0
        rembourse = 0.0
        rappel = False

        if annee in obs:
            if parametres.autocall and niveau >= parametres.barriere_autocall:
                coupon_verse = coupon_periode + memoire
                memoire = 0.0
                rembourse = nominal
                rappel = True
            elif niveau >= parametres.barriere_coupon:
                coupon_verse = coupon_periode + memoire
                memoire = 0.0
            elif parametres.memoire:
                memoire += coupon_periode

            if not rappel and annee == parametres.maturite:
                rembourse = remboursement_maturite(nominal, niveau, parametres)
                perte = max(nominal - rembourse, 0.0)

            observations.append(
                EvenementObservation(
                    annee=annee,
                    niveau=niveau,
                    coupon_verse=coupon_verse,
                    coupons_memorises=memoire,
                    rappel_anticipe=rappel,
                    capital_rembourse=rembourse,
                )
            )

        coupons[annee - 1] = coupon_verse
        remboursements[annee - 1] = rembourse
        if rembourse > 0 or (annee == parametres.maturite):
            annee_sortie = annee
            valeurs[annee - 1] = 0.0
        else:
            valeurs[annee - 1] = remboursement_maturite(nominal, niveau, parametres)

    return ResultatStructure(
        nominal=nominal,
        valeurs=valeurs,
        coupons=coupons,
        remboursements=remboursements,
        annee_sortie=annee_sortie,
        observations=observations,
        perte_en_capital=perte,
    )


def statistiques_monte_carlo(
    nominal: float,
    parametres: ParametresStructure,
    nombre_simulations: int = 1000,
    graine: Optional[int] = None,
) -> Dict[str, float]:
    """Statistiques du produit sur N trajectoires stochastiques.

    Returns:
        Dictionnaire : probabilité d'autocall, probabilité de perte en
        capital, durée moyenne de détention, rendement total moyen, perte
        moyenne conditionnelle.
    """
    rng = np.random.default_rng(graine)
    rappels = 0
    pertes: List[float] = []
    durees: List[int] = []
    rendements: List[float] = []
    for _ in range(nombre_simulations):
        traj = simuler_trajectoire(parametres, MethodeSimulation.STOCHASTIQUE, rng)
        res = valoriser_structure(nominal, parametres, traj)
        if any(o.rappel_anticipe for o in res.observations):
            rappels += 1
        if res.perte_en_capital > 0:
            pertes.append(res.perte_en_capital / nominal)
        durees.append(res.annee_sortie or parametres.maturite)
        rendements.append(res.rendement_total)
    return {
        "probabilite_autocall": rappels / nombre_simulations,
        "probabilite_perte": len(pertes) / nombre_simulations,
        "perte_moyenne_si_perte": float(np.mean(pertes)) if pertes else 0.0,
        "duree_moyenne": float(np.mean(durees)),
        "rendement_total_moyen": float(np.mean(rendements)),
    }
