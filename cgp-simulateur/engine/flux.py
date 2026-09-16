"""Génération de la chronologie des flux d'un contrat.

Un flux est un mouvement d'argent daté : versement initial, versement
programmé, versement complémentaire ou rachat. Les rachats en pourcentage
portent un ``pourcentage`` et un ``montant`` à ``None`` ; le montant réel est
déterminé par l'orchestrateur au moment où la valeur du contrat est connue.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import List, Optional

from models.contrat import Contrat, Periodicite


class TypeFlux(str, Enum):
    """Nature d'un flux."""

    VERSEMENT_INITIAL = "versement_initial"
    VERSEMENT_PROGRAMME = "versement_programme"
    VERSEMENT_COMPLEMENTAIRE = "versement_complementaire"
    RACHAT_PROGRAMME = "rachat_programme"

    @property
    def entrant(self) -> bool:
        """Vrai pour un versement, faux pour un rachat."""
        return self != TypeFlux.RACHAT_PROGRAMME


@dataclass(frozen=True)
class Flux:
    """Mouvement daté sur le contrat.

    Attributes:
        date: date d'exécution.
        type: nature du flux.
        montant: montant brut en euros (``None`` pour un rachat en pourcentage).
        pourcentage: fraction de l'assiette rachetée (rachat en pourcentage).
        support: identifiant du support ciblé ou débité, ``None`` pour une
            répartition selon l'allocation (versement) ou au prorata (rachat).
    """

    date: date
    type: TypeFlux
    montant: Optional[float] = None
    pourcentage: Optional[float] = None
    support: Optional[str] = None

    @property
    def signe(self) -> int:
        """+1 pour un versement, -1 pour un rachat."""
        return 1 if self.type.entrant else -1


_ORDRE_TYPES = {
    TypeFlux.VERSEMENT_INITIAL: 0,
    TypeFlux.VERSEMENT_COMPLEMENTAIRE: 1,
    TypeFlux.VERSEMENT_PROGRAMME: 2,
    TypeFlux.RACHAT_PROGRAMME: 3,
}


def ajouter_mois(origine: date, nb_mois: int) -> date:
    """Ajoute ``nb_mois`` mois à une date en bornant le jour à la fin du mois cible."""
    total = origine.month - 1 + nb_mois
    annee = origine.year + total // 12
    mois = total % 12 + 1
    jour = min(origine.day, calendar.monthrange(annee, mois)[1])
    return date(annee, mois, jour)


def mois_ecoules(origine: date, cible: date) -> int:
    """Nombre de mois entiers écoulés entre deux dates (``cible`` ≥ ``origine``)."""
    delta = (cible.year - origine.year) * 12 + (cible.month - origine.month)
    if cible.day < origine.day and delta > 0:
        delta -= 1
    return max(delta, 0)


def echeances(
    origine: date,
    periodicite: Periodicite,
    date_fin: date,
    inclure_fin: bool = False,
    premier_rang: int = 0,
) -> List[date]:
    """Dates d'échéance périodiques calées sur ``origine`` jusqu'à ``date_fin``.

    Chaque échéance vaut ``origine + rang × période`` (jour borné à la fin du
    mois cible), ce qui évite la dérive du jour d'un mois court vers les
    mois suivants.

    Args:
        origine: date de référence (première échéance si ``premier_rang`` = 0).
        periodicite: espacement entre échéances.
        date_fin: borne haute.
        inclure_fin: si faux, une échéance tombant exactement à ``date_fin``
            est exclue (le contrat est clos ce jour-là).
        premier_rang: rang de la première échéance (1 pour démarrer une
            période après ``origine``).
    """
    resultat: List[date] = []
    rang = premier_rang
    while True:
        echeance = ajouter_mois(origine, rang * periodicite.mois)
        if echeance > date_fin or (echeance == date_fin and not inclure_fin):
            break
        resultat.append(echeance)
        rang += 1
    return resultat


def _origine(date_debut: Optional[date], souscription: date) -> tuple[date, int]:
    """Origine et premier rang des échéances : la date de début si fournie,
    sinon la souscription avec un décalage d'une période."""
    if date_debut is not None:
        return date_debut, 0
    return souscription, 1


def generer_flux(contrat: Contrat) -> List[Flux]:
    """Construit la liste chronologique de tous les flux du contrat.

    Règles :
    - le versement initial est daté de la souscription ;
    - un versement programmé sans ``date_debut`` démarre un mois après la
      souscription (mensuel) ou une période après (trimestriel, annuel) ;
    - un rachat programmé sans ``date_debut`` démarre une période après la
      souscription ;
    - l'indexation d'un versement programmé s'applique à chaque anniversaire
      de sa date de début ;
    - les flux tombant à la date de fin du contrat sont exclus.

    Args:
        contrat: contrat à analyser.

    Returns:
        Flux triés par date puis par type (versements avant rachats).
    """
    fin = contrat.date_fin
    flux: List[Flux] = []

    if contrat.montant_initial > 0:
        flux.append(
            Flux(
                date=contrat.date_souscription,
                type=TypeFlux.VERSEMENT_INITIAL,
                montant=float(contrat.montant_initial),
            )
        )

    for vp in contrat.versements_programmes:
        origine, rang = _origine(vp.date_debut, contrat.date_souscription)
        borne = min(vp.date_fin, fin) if vp.date_fin else fin
        dates = echeances(origine, vp.periodicite, borne, inclure_fin=vp.date_fin is not None, premier_rang=rang)
        for echeance in dates:
            annees = mois_ecoules(dates[0], echeance) // 12
            montant = vp.montant * (1.0 + vp.indexation) ** annees
            flux.append(Flux(date=echeance, type=TypeFlux.VERSEMENT_PROGRAMME, montant=montant))

    for vc in contrat.versements_complementaires:
        if contrat.date_souscription <= vc.date < fin:
            flux.append(
                Flux(
                    date=vc.date,
                    type=TypeFlux.VERSEMENT_COMPLEMENTAIRE,
                    montant=float(vc.montant),
                    support=vc.support_cible,
                )
            )

    for rp in contrat.rachats_programmes:
        origine, rang = _origine(rp.date_debut, contrat.date_souscription)
        borne = min(rp.date_fin, fin) if rp.date_fin else fin
        for echeance in echeances(origine, rp.periodicite, borne, inclure_fin=rp.date_fin is not None, premier_rang=rang):
            flux.append(
                Flux(
                    date=echeance,
                    type=TypeFlux.RACHAT_PROGRAMME,
                    montant=rp.montant,
                    pourcentage=rp.pourcentage,
                    support=rp.support_prelevement,
                )
            )

    flux.sort(key=lambda f: (f.date, _ORDRE_TYPES[f.type]))
    return flux


def total_versements(flux: List[Flux]) -> float:
    """Somme des versements bruts (montants connus uniquement)."""
    return sum(f.montant or 0.0 for f in flux if f.type.entrant)


def total_rachats_fixes(flux: List[Flux]) -> float:
    """Somme des rachats à montant fixe (les rachats en pourcentage sont ignorés)."""
    return sum(f.montant or 0.0 for f in flux if not f.type.entrant and f.montant is not None)
