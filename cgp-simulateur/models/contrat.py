"""Dataclasses décrivant un contrat d'épargne multi-supports et ses flux.

Conventions :
- les montants sont en euros ;
- les taux, allocations et barrières sont en fractions (0.03 = 3 %, 0.60 = 60 %) ;
- les dates sont des ``datetime.date`` ; l'origine des temps est
  ``Contrat.date_souscription`` ;
- les durées et maturités sont en années entières.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from typing import Any, Dict, List, Optional, Union

from models.scenario import Tendance


class TypeSupport(str, Enum):
    """Nature d'un support d'investissement."""

    FONDS_EUROS = "fonds_euros"
    UC = "uc"
    STRUCTURE = "structure"


class Periodicite(str, Enum):
    """Périodicité d'un versement ou d'un rachat programmé."""

    MENSUELLE = "mensuelle"
    TRIMESTRIELLE = "trimestrielle"
    ANNUELLE = "annuelle"

    @property
    def mois(self) -> int:
        """Nombre de mois entre deux occurrences."""
        return {"mensuelle": 1, "trimestrielle": 3, "annuelle": 12}[self.value]


class ModePerteStructure(str, Enum):
    """Calcul de la perte en capital à maturité si la barrière est franchie.

    - ``DEPUIS_BARRIERE`` : perte égale à la baisse du sous-jacent au-delà de la
      barrière (capital × (1 - (barrière - niveau))).
    - ``DEPUIS_STRIKE`` : perte égale à la baisse totale du sous-jacent depuis
      le niveau initial (capital × niveau), convention de marché la plus
      courante.
    """

    DEPUIS_BARRIERE = "depuis_barriere"
    DEPUIS_STRIKE = "depuis_strike"


@dataclass
class ParametresFondsEuros:
    """Paramètres propres à un fonds en euros.

    Les champs optionnels à ``None`` reprennent la valeur du
    ``ScenarioMarche`` de la projection.

    Attributes:
        taux_base: taux de rendement brut de frais de gestion de l'année 1.
        tendance: évolution pluriannuelle du taux (surcharge du scénario).
        variation_annuelle: variation absolue du taux par an, en points.
        volatilite: écart-type annuel du taux, en points.
        taux_plancher: taux minimal garanti, en fraction.
        frais_gestion: frais de gestion annuels prélevés sur l'encours.
    """

    taux_base: float = 0.025
    tendance: Optional[Tendance] = None
    variation_annuelle: Optional[float] = None
    volatilite: Optional[float] = None
    taux_plancher: Optional[float] = None
    frais_gestion: float = 0.0


@dataclass
class ParametresUC:
    """Paramètres propres à un support en unités de compte.

    Attributes:
        rendement_moyen: rendement annuel moyen attendu (brut de frais).
        volatilite: écart-type annuel des rendements.
        frais_gestion: frais de gestion annuels prélevés sur l'encours.
    """

    rendement_moyen: float = 0.05
    volatilite: float = 0.15
    frais_gestion: float = 0.0


@dataclass
class ParametresStructure:
    """Paramètres d'un produit structuré à capital protégé (type autocall / Phoenix).

    Attributes:
        sous_jacent: libellé de l'indice ou du panier de référence.
        barriere_protection: niveau (fraction du niveau initial) en dessous
            duquel le capital n'est plus protégé à maturité.
        barriere_coupon: niveau à partir duquel le coupon est versé à une
            date d'observation.
        niveau_coupon: coupon par période d'observation, en fraction du nominal.
        memoire: si vrai, les coupons non versés sont mémorisés et payés à la
            première observation favorable suivante.
        autocall: si vrai, le produit est remboursé par anticipation lorsque
            le sous-jacent est au moins égal à ``barriere_autocall``.
        barriere_autocall: niveau déclenchant le remboursement anticipé.
        maturite: durée maximale du produit, en années.
        dates_observation: années (1, 2, 3...) auxquelles les conditions sont
            observées. Par défaut chaque année jusqu'à la maturité.
        tendance_sous_jacent: dérive annuelle du sous-jacent en mode
            déterministe (ex. 0.02 = +2 % par an) et drift en mode stochastique.
        volatilite_sous_jacent: volatilité annuelle du sous-jacent (mode
            stochastique).
        mode_perte: convention de calcul de la perte à maturité.
        support_reinvestissement: identifiant du support recevant les coupons
            et le capital remboursé. ``None`` : premier fonds en euros du
            contrat, sinon liquidités non rémunérées.
        frais_gestion: frais de gestion annuels prélevés sur le nominal.
    """

    sous_jacent: str = "Indice actions"
    barriere_protection: float = 0.60
    barriere_coupon: float = 0.70
    niveau_coupon: float = 0.05
    memoire: bool = True
    autocall: bool = True
    barriere_autocall: float = 1.00
    maturite: int = 8
    dates_observation: List[int] = field(default_factory=list)
    tendance_sous_jacent: float = 0.0
    volatilite_sous_jacent: float = 0.20
    mode_perte: ModePerteStructure = ModePerteStructure.DEPUIS_BARRIERE
    support_reinvestissement: Optional[str] = None
    frais_gestion: float = 0.0

    def __post_init__(self) -> None:
        if self.maturite < 1:
            raise ValueError("La maturité doit être d'au moins 1 an.")
        if not self.dates_observation:
            self.dates_observation = list(range(1, self.maturite + 1))
        self.dates_observation = sorted(set(int(a) for a in self.dates_observation))
        if self.dates_observation[-1] != self.maturite:
            raise ValueError("La dernière date d'observation doit être la maturité.")
        if not 0 < self.barriere_protection <= 1:
            raise ValueError("La barrière de protection doit être dans ]0 ; 1].")


ParametresSupport = Union[ParametresFondsEuros, ParametresUC, ParametresStructure]


@dataclass
class Support:
    """Support d'investissement au sein du contrat.

    Attributes:
        identifiant: identifiant unique dans le contrat (ex. "FE", "UC_MONDE").
        type: nature du support.
        allocation: part des versements affectée à ce support, en fraction.
        parametres: paramètres propres au type du support.
        libelle: nom affiché dans les restitutions.
    """

    identifiant: str
    type: TypeSupport
    allocation: float
    parametres: ParametresSupport
    libelle: str = ""

    def __post_init__(self) -> None:
        if not self.libelle:
            self.libelle = self.identifiant
        if not 0 <= self.allocation <= 1:
            raise ValueError(f"Allocation invalide pour {self.identifiant} : {self.allocation}")
        attendu = {
            TypeSupport.FONDS_EUROS: ParametresFondsEuros,
            TypeSupport.UC: ParametresUC,
            TypeSupport.STRUCTURE: ParametresStructure,
        }[self.type]
        if not isinstance(self.parametres, attendu):
            raise TypeError(
                f"Le support {self.identifiant} de type {self.type.value} attend "
                f"des paramètres {attendu.__name__}."
            )


@dataclass
class VersementProgramme:
    """Versement périodique.

    Attributes:
        montant: montant de chaque versement, en euros.
        periodicite: fréquence des versements.
        date_debut: date du premier versement.
        date_fin: date du dernier versement possible (``None`` : jusqu'au terme).
        indexation: revalorisation annuelle du montant, en fraction (ex. 0.02).
            Appliquée à chaque date anniversaire de ``date_debut``.
    """

    montant: float
    periodicite: Periodicite = Periodicite.MENSUELLE
    date_debut: Optional[date] = None
    date_fin: Optional[date] = None
    indexation: float = 0.0


@dataclass
class VersementComplementaire:
    """Versement libre ponctuel.

    Attributes:
        montant: montant en euros.
        date: date du versement.
        support_cible: identifiant du support crédité ; ``None`` : répartition
            selon l'allocation du contrat.
    """

    montant: float
    date: date
    support_cible: Optional[str] = None


@dataclass
class RachatProgramme:
    """Rachat partiel périodique.

    Attributes:
        montant: montant fixe de chaque rachat, en euros (exclusif de ``pourcentage``).
        pourcentage: fraction de la valeur de l'assiette rachetée à chaque
            échéance (exclusif de ``montant``).
        periodicite: fréquence des rachats.
        date_debut: date du premier rachat.
        date_fin: date du dernier rachat (``None`` : jusqu'au terme).
        support_prelevement: identifiant du support débité ; ``None`` :
            prélèvement au prorata de la valeur de chaque support.
    """

    montant: Optional[float] = None
    pourcentage: Optional[float] = None
    periodicite: Periodicite = Periodicite.MENSUELLE
    date_debut: Optional[date] = None
    date_fin: Optional[date] = None
    support_prelevement: Optional[str] = None

    def __post_init__(self) -> None:
        if (self.montant is None) == (self.pourcentage is None):
            raise ValueError("Renseigner soit un montant, soit un pourcentage.")
        if self.pourcentage is not None and not 0 < self.pourcentage <= 1:
            raise ValueError("Le pourcentage de rachat doit être dans ]0 ; 1].")


@dataclass
class Contrat:
    """Contrat d'épargne multi-supports (assurance-vie ou capitalisation).

    Attributes:
        nom: libellé du contrat (générique, jamais de donnée client réelle).
        montant_initial: versement initial brut de frais, en euros.
        duree_annees: horizon de projection, en années.
        supports: liste des supports ; la somme des allocations vaut 1.
        date_souscription: origine des temps de la projection.
        versements_programmes: versements périodiques.
        versements_complementaires: versements libres.
        rachats_programmes: rachats périodiques.
        frais_versement: frais d'entrée prélevés sur chaque versement.
        situation_couple: imposition commune (abattement doublé après 8 ans).
        primes_autres_contrats: primes nettes déjà versées sur d'autres
            contrats, pour le seuil de 150 000 € du taux réduit après 8 ans.
    """

    nom: str
    montant_initial: float
    duree_annees: int
    supports: List[Support]
    date_souscription: date = field(default_factory=date.today)
    versements_programmes: List[VersementProgramme] = field(default_factory=list)
    versements_complementaires: List[VersementComplementaire] = field(default_factory=list)
    rachats_programmes: List[RachatProgramme] = field(default_factory=list)
    frais_versement: float = 0.0
    situation_couple: bool = False
    primes_autres_contrats: float = 0.0

    def __post_init__(self) -> None:
        if self.duree_annees < 1:
            raise ValueError("La durée doit être d'au moins 1 an.")
        if self.montant_initial < 0:
            raise ValueError("Le montant initial ne peut pas être négatif.")
        if not self.supports:
            raise ValueError("Le contrat doit comporter au moins un support.")
        ids = [s.identifiant for s in self.supports]
        if len(ids) != len(set(ids)):
            raise ValueError("Les identifiants de supports doivent être uniques.")
        total = sum(s.allocation for s in self.supports)
        if abs(total - 1.0) > 1e-6:
            raise ValueError(f"La somme des allocations doit valoir 100 % (actuel : {total:.4f}).")
        for rachat in self.rachats_programmes:
            if rachat.support_prelevement and rachat.support_prelevement not in ids:
                raise ValueError(f"Support de prélèvement inconnu : {rachat.support_prelevement}")
        for vc in self.versements_complementaires:
            if vc.support_cible and vc.support_cible not in ids:
                raise ValueError(f"Support cible inconnu : {vc.support_cible}")

    def support(self, identifiant: str) -> Support:
        """Retourne le support portant cet identifiant."""
        for s in self.supports:
            if s.identifiant == identifiant:
                return s
        raise KeyError(identifiant)

    @property
    def date_fin(self) -> date:
        """Date de fin de la projection (anniversaire de la souscription)."""
        return date(
            self.date_souscription.year + self.duree_annees,
            self.date_souscription.month,
            min(self.date_souscription.day, 28),
        )


# --------------------------------------------------------------------------
# Sérialisation JSON (utilisée par data/exemples_contrats.json et l'interface)
# --------------------------------------------------------------------------


def _date_depuis(valeur: Any) -> Optional[date]:
    if valeur is None or valeur == "":
        return None
    if isinstance(valeur, date):
        return valeur
    return date.fromisoformat(str(valeur))


def _parametres_depuis(type_support: TypeSupport, brut: Dict[str, Any]) -> ParametresSupport:
    brut = dict(brut or {})
    if type_support == TypeSupport.FONDS_EUROS:
        if brut.get("tendance") is not None:
            brut["tendance"] = Tendance(brut["tendance"])
        return ParametresFondsEuros(**brut)
    if type_support == TypeSupport.UC:
        return ParametresUC(**brut)
    if brut.get("mode_perte") is not None:
        brut["mode_perte"] = ModePerteStructure(brut["mode_perte"])
    return ParametresStructure(**brut)


def charger_contrat(donnees: Dict[str, Any]) -> Contrat:
    """Construit un ``Contrat`` depuis un dictionnaire (format JSON du dossier data/)."""
    supports = [
        Support(
            identifiant=s["identifiant"],
            type=TypeSupport(s["type"]),
            allocation=float(s["allocation"]),
            parametres=_parametres_depuis(TypeSupport(s["type"]), s.get("parametres", {})),
            libelle=s.get("libelle", ""),
        )
        for s in donnees["supports"]
    ]
    vps = [
        VersementProgramme(
            montant=float(v["montant"]),
            periodicite=Periodicite(v.get("periodicite", "mensuelle")),
            date_debut=_date_depuis(v.get("date_debut")),
            date_fin=_date_depuis(v.get("date_fin")),
            indexation=float(v.get("indexation", 0.0)),
        )
        for v in donnees.get("versements_programmes", [])
    ]
    vcs = [
        VersementComplementaire(
            montant=float(v["montant"]),
            date=_date_depuis(v["date"]),  # type: ignore[arg-type]
            support_cible=v.get("support_cible"),
        )
        for v in donnees.get("versements_complementaires", [])
    ]
    rps = [
        RachatProgramme(
            montant=r.get("montant"),
            pourcentage=r.get("pourcentage"),
            periodicite=Periodicite(r.get("periodicite", "mensuelle")),
            date_debut=_date_depuis(r.get("date_debut")),
            date_fin=_date_depuis(r.get("date_fin")),
            support_prelevement=r.get("support_prelevement"),
        )
        for r in donnees.get("rachats_programmes", [])
    ]
    return Contrat(
        nom=donnees.get("nom", "Contrat"),
        montant_initial=float(donnees["montant_initial"]),
        duree_annees=int(donnees["duree_annees"]),
        supports=supports,
        date_souscription=_date_depuis(donnees.get("date_souscription")) or date.today(),
        versements_programmes=vps,
        versements_complementaires=vcs,
        rachats_programmes=rps,
        frais_versement=float(donnees.get("frais_versement", 0.0)),
        situation_couple=bool(donnees.get("situation_couple", False)),
        primes_autres_contrats=float(donnees.get("primes_autres_contrats", 0.0)),
    )


def contrat_vers_dict(contrat: Contrat) -> Dict[str, Any]:
    """Sérialise un ``Contrat`` en dictionnaire compatible JSON."""

    def _val(v: Any) -> Any:
        if isinstance(v, Enum):
            return v.value
        if isinstance(v, date):
            return v.isoformat()
        return v

    def _dc(obj: Any) -> Dict[str, Any]:
        return {k: _val(v) for k, v in obj.__dict__.items()}

    return {
        "nom": contrat.nom,
        "montant_initial": contrat.montant_initial,
        "duree_annees": contrat.duree_annees,
        "date_souscription": contrat.date_souscription.isoformat(),
        "frais_versement": contrat.frais_versement,
        "situation_couple": contrat.situation_couple,
        "primes_autres_contrats": contrat.primes_autres_contrats,
        "supports": [
            {
                "identifiant": s.identifiant,
                "libelle": s.libelle,
                "type": s.type.value,
                "allocation": s.allocation,
                "parametres": _dc(s.parametres),
            }
            for s in contrat.supports
        ],
        "versements_programmes": [_dc(v) for v in contrat.versements_programmes],
        "versements_complementaires": [_dc(v) for v in contrat.versements_complementaires],
        "rachats_programmes": [_dc(r) for r in contrat.rachats_programmes],
    }
