"""Structures de restitution d'une projection."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Dict, List


@dataclass
class LigneAnnuelle:
    """Synthèse d'une année de projection.

    Attributes:
        annee: rang de l'année (1 = première année du contrat).
        date_fin: date de clôture de l'année.
        valeur_debut: valorisation en début d'année.
        versements: versements bruts de l'année (initial inclus en année 1).
        rachats: rachats bruts de l'année.
        frais: frais prélevés dans l'année (entrée et gestion).
        prelevements_sociaux: prélèvements sociaux retenus au fil de l'eau.
        coupons: coupons perçus sur les produits structurés dans l'année.
        valeur_fin: valorisation en fin d'année.
        repartition: valorisation de chaque support en fin d'année.
        performance_nette: performance de l'année nette de frais, rapportée
            au capital de début d'année augmenté des versements.
        cumul_versements: versements cumulés depuis l'origine.
        cumul_rachats: rachats cumulés depuis l'origine.
        plus_value_nette: valeur fin + cumul rachats - cumul versements.
    """

    annee: int
    date_fin: date
    valeur_debut: float
    versements: float
    rachats: float
    frais: float
    prelevements_sociaux: float
    coupons: float
    valeur_fin: float
    repartition: Dict[str, float]
    performance_nette: float
    cumul_versements: float
    cumul_rachats: float
    plus_value_nette: float

    def vers_dict(self) -> Dict[str, Any]:
        """Aplatis la ligne (une colonne par support) pour les exports."""
        base: Dict[str, Any] = {
            "Année": self.annee,
            "Date": self.date_fin,
            "Valeur début": self.valeur_debut,
            "Versements": self.versements,
            "Rachats": self.rachats,
            "Frais": self.frais,
            "Prélèvements sociaux": self.prelevements_sociaux,
            "Coupons": self.coupons,
            "Valeur fin": self.valeur_fin,
            "Performance nette": self.performance_nette,
            "Cumul versements": self.cumul_versements,
            "Cumul rachats": self.cumul_rachats,
            "Plus-value nette": self.plus_value_nette,
        }
        for identifiant, valeur in self.repartition.items():
            base[identifiant] = valeur
        return base


@dataclass
class ResultatProjection:
    """Résultat complet d'une projection déterministe ou d'une trajectoire."""

    nom_contrat: str
    lignes: List[LigneAnnuelle]
    libelles_supports: Dict[str, str] = field(default_factory=dict)
    evenements: List[str] = field(default_factory=list)

    @property
    def valeur_finale(self) -> float:
        """Valorisation au terme de la projection."""
        return self.lignes[-1].valeur_fin if self.lignes else 0.0

    @property
    def total_versements(self) -> float:
        return self.lignes[-1].cumul_versements if self.lignes else 0.0

    @property
    def total_rachats(self) -> float:
        return self.lignes[-1].cumul_rachats if self.lignes else 0.0

    def vers_lignes(self) -> List[Dict[str, Any]]:
        """Liste de dictionnaires, une entrée par année (pour pandas ou export)."""
        return [ligne.vers_dict() for ligne in self.lignes]


@dataclass
class DistributionAnnuelle:
    """Distribution de la valorisation en fin d'année sur N simulations."""

    annee: int
    moyenne: float
    p5: float
    p25: float
    mediane: float
    p75: float
    p95: float


@dataclass
class ResultatMonteCarlo:
    """Synthèse d'une projection Monte Carlo du contrat complet."""

    nom_contrat: str
    nombre_simulations: int
    distributions: List[DistributionAnnuelle]
    probabilite_perte: float
    valeurs_finales: List[float] = field(default_factory=list)

    def vers_lignes(self) -> List[Dict[str, Any]]:
        return [
            {
                "Année": d.annee,
                "Moyenne": d.moyenne,
                "P5": d.p5,
                "P25": d.p25,
                "Médiane": d.mediane,
                "P75": d.p75,
                "P95": d.p95,
            }
            for d in self.distributions
        ]
