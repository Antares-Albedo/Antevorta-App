"""Orchestrateur : projection annuelle consolidée d'un contrat multi-supports.

Pas de temps mensuel. Pour chaque mois :

1. exécution des flux datés du mois (versements nets de frais d'entrée
   répartis selon l'allocation, rachats prélevés sur le support désigné ou au
   prorata) ;
2. capitalisation de chaque support au facteur mensuel dérivé de son taux
   annuel net de frais de gestion ;
3. en fin d'année : observation des produits structurés, coupons et capital
   remboursé versés sur le support de réinvestissement.

Conventions :
- les versements programmés et complémentaires dont l'allocation vise un
  produit structuré sont redirigés vers son support de réinvestissement
  (un structuré ne se souscrit qu'à l'origine) ;
- un rachat sur un structuré avant remboursement réduit son nominal au
  prorata de la valeur indicative ;
- les prélèvements sociaux au fil de l'eau sont retenus en fin d'année sur
  les intérêts crédités du fonds en euros (option ``ParametresFiscaux``) ;
- la performance nette annuelle est un taux pondéré par les flux (méthode de
  Dietz modifiée) : résultat de l'année (valeur fin + rachats - valeur début
  - versements) rapporté au capital de début d'année augmenté des flux
  pondérés par leur durée de présence dans l'année.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np

from engine import fiscalite, flux as flux_engine, fonds_euros, structures, unites_compte
from engine.flux import Flux, TypeFlux
from models.contrat import (
    Contrat,
    ParametresFondsEuros,
    ParametresStructure,
    ParametresUC,
    Support,
    TypeSupport,
)
from models.resultats import (
    DistributionAnnuelle,
    LigneAnnuelle,
    ResultatMonteCarlo,
    ResultatProjection,
)
from models.scenario import MethodeSimulation, ParametresFiscaux, ScenarioMarche

LIQUIDITES = "LIQUIDITES"


@dataclass
class _EtatStructure:
    """État courant d'un produit structuré au cours de la projection."""

    nominal: float
    trajectoire: List[float]
    memoire: float = 0.0
    rembourse: bool = False
    observations_faites: List[int] = field(default_factory=list)


@dataclass
class _Compteurs:
    versements: float = 0.0
    rachats: float = 0.0
    frais: float = 0.0
    ps: float = 0.0
    coupons: float = 0.0


def _pct(valeur: float) -> str:
    """Pourcentage formaté à la française (virgule décimale)."""
    return f"{valeur * 100:.1f}".replace(".", ",") + " %"


def _euros(valeur: float) -> str:
    """Montant formaté à la française (espace des milliers)."""
    return f"{valeur:,.0f}".replace(",", " ") + " €"


def _rng(scenario: ScenarioMarche, graine: Optional[int]) -> Optional[np.random.Generator]:
    if scenario.methode == MethodeSimulation.DETERMINISTE:
        return None
    return np.random.default_rng(graine if graine is not None else scenario.graine)


def _support_reinvestissement(contrat: Contrat, support: Support) -> str:
    """Support recevant coupons et remboursements d'un structuré."""
    params = support.parametres
    assert isinstance(params, ParametresStructure)
    if params.support_reinvestissement and params.support_reinvestissement != support.identifiant:
        return params.support_reinvestissement
    for s in contrat.supports:
        if s.type == TypeSupport.FONDS_EUROS:
            return s.identifiant
    for s in contrat.supports:
        if s.type == TypeSupport.UC:
            return s.identifiant
    return LIQUIDITES


def _taux_annuels(
    contrat: Contrat,
    scenario: ScenarioMarche,
    rng: Optional[np.random.Generator],
) -> Dict[str, List[float]]:
    """Taux annuels nets de frais de gestion par support (indexés par année).

    Fonds en euros : taux brut du scénario diminué des frais de gestion ; les
    prélèvements sociaux sont retenus séparément en fin d'année sur les
    intérêts crédités. UC : rendement diminué des frais. Structurés : 0 (leur
    valeur est gérée par le mécanisme d'observation).
    """
    taux: Dict[str, List[float]] = {}
    n = contrat.duree_annees
    for s in contrat.supports:
        p = s.parametres
        if isinstance(p, ParametresFondsEuros):
            bruts = fonds_euros.generer_taux(p, scenario, n, rng)
            taux[s.identifiant] = [fonds_euros.taux_net(t, p.frais_gestion) for t in bruts]
        elif isinstance(p, ParametresUC):
            bruts = unites_compte.generer_rendements(p, n, rng)
            taux[s.identifiant] = [unites_compte.rendement_net(r, p.frais_gestion) for r in bruts]
        else:
            taux[s.identifiant] = [0.0] * n
    taux[LIQUIDITES] = [0.0] * n
    return taux


def _repartir_versement(
    contrat: Contrat,
    montant_net: float,
    cible: Optional[str],
    etats_structures: Dict[str, _EtatStructure],
    initial: bool,
) -> Dict[str, float]:
    """Ventile un versement net par support selon la cible ou l'allocation."""
    parts: Dict[str, float] = {}
    if cible:
        parts[cible] = montant_net
    else:
        for s in contrat.supports:
            if s.allocation > 0:
                parts[s.identifiant] = parts.get(s.identifiant, 0.0) + montant_net * s.allocation
    if initial:
        return parts
    # Hors versement initial, un structuré ne reçoit pas de nouveaux capitaux.
    redirige: Dict[str, float] = {}
    for ident, montant in parts.items():
        if ident in etats_structures:
            dest = _support_reinvestissement(contrat, contrat.support(ident))
            redirige[dest] = redirige.get(dest, 0.0) + montant
        else:
            redirige[ident] = redirige.get(ident, 0.0) + montant
    return redirige


def _montant_rachat(f: Flux, valeurs: Dict[str, float]) -> float:
    """Montant brut d'un rachat, borné par l'assiette disponible."""
    if f.support:
        assiette = valeurs.get(f.support, 0.0)
    else:
        assiette = sum(valeurs.values())
    if f.pourcentage is not None:
        return assiette * f.pourcentage
    return min(f.montant or 0.0, assiette)


def _appliquer_rachat(
    montant: float,
    support: Optional[str],
    valeurs: Dict[str, float],
    etats_structures: Dict[str, _EtatStructure],
) -> None:
    """Débite un rachat sur un support ou au prorata de la valeur de chacun."""
    if montant <= 0:
        return
    if support:
        cibles = {support: 1.0}
    else:
        total = sum(v for v in valeurs.values() if v > 0)
        if total <= 0:
            return
        cibles = {k: v / total for k, v in valeurs.items() if v > 0}
    for ident, part in cibles.items():
        retrait = min(montant * part, valeurs.get(ident, 0.0))
        avant = valeurs.get(ident, 0.0)
        valeurs[ident] = avant - retrait
        if ident in etats_structures and avant > 0:
            etats_structures[ident].nominal *= valeurs[ident] / avant


def projeter(
    contrat: Contrat,
    scenario: ScenarioMarche = ScenarioMarche(),
    fiscal: ParametresFiscaux = ParametresFiscaux(),
    graine: Optional[int] = None,
) -> ResultatProjection:
    """Projette le contrat année par année.

    Args:
        contrat: contrat complet (supports, flux).
        scenario: hypothèses de marché et mode de simulation.
        fiscal: paramètres fiscaux (prélèvements sociaux au fil de l'eau).
        graine: graine du générateur, prioritaire sur celle du scénario.

    Returns:
        ``ResultatProjection`` avec une ``LigneAnnuelle`` par année.
    """
    rng = _rng(scenario, graine)
    taux_nets = _taux_annuels(contrat, scenario, rng)
    taux_ps = fiscal.taux_prelevements_sociaux if fiscal.prelevements_sociaux_fil_eau else 0.0
    liste_flux = flux_engine.generer_flux(contrat)
    flux_par_mois: Dict[int, List[Flux]] = {}
    for f in liste_flux:
        m = flux_engine.mois_ecoules(contrat.date_souscription, f.date)
        flux_par_mois.setdefault(m, []).append(f)

    valeurs: Dict[str, float] = {s.identifiant: 0.0 for s in contrat.supports}
    valeurs[LIQUIDITES] = 0.0
    etats_structures: Dict[str, _EtatStructure] = {}
    for s in contrat.supports:
        if isinstance(s.parametres, ParametresStructure):
            traj = structures.simuler_trajectoire(
                s.parametres,
                scenario.methode,
                rng,
                None,
            )
            etats_structures[s.identifiant] = _EtatStructure(nominal=0.0, trajectoire=traj)

    lignes: List[LigneAnnuelle] = []
    evenements: List[str] = []
    cumul_versements = 0.0
    cumul_rachats = 0.0
    nb_mois = 12 * contrat.duree_annees

    for annee in range(1, contrat.duree_annees + 1):
        cpt = _Compteurs()
        valeur_debut = sum(valeurs.values())
        interets_fe: Dict[str, float] = {}
        flux_ponderes = 0.0
        for mois in range((annee - 1) * 12, annee * 12):
            poids = (12 - (mois - (annee - 1) * 12)) / 12.0
            # 1. Flux du mois
            for f in flux_par_mois.get(mois, []):
                if f.type.entrant:
                    brut = f.montant or 0.0
                    frais = brut * contrat.frais_versement
                    net = brut - frais
                    cpt.versements += brut
                    cpt.frais += frais
                    cumul_versements += brut
                    flux_ponderes += brut * poids
                    parts = _repartir_versement(
                        contrat, net, f.support, etats_structures, initial=f.type == TypeFlux.VERSEMENT_INITIAL
                    )
                    for ident, montant in parts.items():
                        valeurs[ident] = valeurs.get(ident, 0.0) + montant
                        if ident in etats_structures:
                            etats_structures[ident].nominal += montant
                else:
                    if f.support in etats_structures and etats_structures[f.support].rembourse:
                        continue
                    montant = _montant_rachat(f, valeurs)
                    _appliquer_rachat(montant, f.support, valeurs, etats_structures)
                    cpt.rachats += montant
                    cumul_rachats += montant
                    flux_ponderes -= montant * poids
            # 2. Capitalisation mensuelle
            for s in contrat.supports:
                if s.identifiant in etats_structures:
                    continue
                taux = taux_nets[s.identifiant][annee - 1]
                avant = valeurs[s.identifiant]
                apres = fonds_euros.capitaliser(avant, taux, 1.0 / 12.0)
                valeurs[s.identifiant] = apres
                if isinstance(s.parametres, ParametresFondsEuros):
                    interets_fe[s.identifiant] = interets_fe.get(s.identifiant, 0.0) + (apres - avant)
                if avant > 0 and isinstance(s.parametres, (ParametresFondsEuros, ParametresUC)):
                    cpt.frais += avant * s.parametres.frais_gestion / 12.0
            # Structurés : frais de gestion mensuels sur le nominal (prélevés sur liquidités/réinvestissement)
            for ident, etat in etats_structures.items():
                p = contrat.support(ident).parametres
                assert isinstance(p, ParametresStructure)
                if not etat.rembourse and etat.nominal > 0 and p.frais_gestion > 0:
                    frais = etat.nominal * p.frais_gestion / 12.0
                    dest = _support_reinvestissement(contrat, contrat.support(ident))
                    valeurs[dest] = valeurs.get(dest, 0.0) - frais
                    cpt.frais += frais

        # 3. Prélèvements sociaux au fil de l'eau sur les intérêts crédités du fonds en euros
        for ident, interets in interets_fe.items():
            ps = fiscalite.prelevements_sociaux_fil_eau(interets, fiscal) if taux_ps > 0 else 0.0
            if ps > 0:
                valeurs[ident] -= ps
                cpt.ps += ps

        # 4. Observation annuelle des structurés
        for ident, etat in etats_structures.items():
            support = contrat.support(ident)
            p = support.parametres
            assert isinstance(p, ParametresStructure)
            if etat.rembourse or etat.nominal <= 0:
                valeurs[ident] = 0.0
                continue
            if annee > p.maturite:
                continue
            niveau = etat.trajectoire[annee - 1]
            coupon_periode = etat.nominal * p.niveau_coupon
            coupon = 0.0
            rembourse = 0.0
            if annee in p.dates_observation:
                if p.autocall and niveau >= p.barriere_autocall:
                    coupon = coupon_periode + etat.memoire
                    etat.memoire = 0.0
                    rembourse = etat.nominal
                    evenements.append(
                        f"Année {annee} : remboursement anticipé de {support.libelle} "
                        f"(sous-jacent à {_pct(niveau)})."
                    )
                elif niveau >= p.barriere_coupon:
                    coupon = coupon_periode + etat.memoire
                    etat.memoire = 0.0
                elif p.memoire:
                    etat.memoire += coupon_periode
                if rembourse == 0.0 and annee == p.maturite:
                    rembourse = structures.remboursement_maturite(etat.nominal, niveau, p)
                    if rembourse < etat.nominal:
                        evenements.append(
                            f"Année {annee} : maturité de {support.libelle} avec perte en capital "
                            f"de {_euros(etat.nominal - rembourse)} (sous-jacent à {_pct(niveau)})."
                        )
                    else:
                        evenements.append(f"Année {annee} : maturité de {support.libelle}, capital remboursé.")
            dest = _support_reinvestissement(contrat, support)
            if coupon > 0:
                valeurs[dest] = valeurs.get(dest, 0.0) + coupon
                cpt.coupons += coupon
            if rembourse > 0 or annee == p.maturite:
                valeurs[dest] = valeurs.get(dest, 0.0) + rembourse
                valeurs[ident] = 0.0
                etat.rembourse = True
            else:
                valeurs[ident] = structures.remboursement_maturite(etat.nominal, niveau, p)

        valeur_fin = sum(valeurs.values())
        base = valeur_debut + flux_ponderes
        perf = (valeur_fin + cpt.rachats - valeur_debut - cpt.versements) / base if base > 1e-9 else 0.0
        repartition = {s.identifiant: valeurs[s.identifiant] for s in contrat.supports}
        if abs(valeurs.get(LIQUIDITES, 0.0)) > 1e-9:
            repartition[LIQUIDITES] = valeurs[LIQUIDITES]
        lignes.append(
            LigneAnnuelle(
                annee=annee,
                date_fin=flux_engine.ajouter_mois(contrat.date_souscription, 12 * annee),
                valeur_debut=valeur_debut,
                versements=cpt.versements,
                rachats=cpt.rachats,
                frais=cpt.frais,
                prelevements_sociaux=cpt.ps,
                coupons=cpt.coupons,
                valeur_fin=valeur_fin,
                repartition=repartition,
                performance_nette=perf,
                cumul_versements=cumul_versements,
                cumul_rachats=cumul_rachats,
                plus_value_nette=valeur_fin + cumul_rachats - cumul_versements,
            )
        )

    libelles = {s.identifiant: s.libelle for s in contrat.supports}
    libelles[LIQUIDITES] = "Liquidités"
    return ResultatProjection(
        nom_contrat=contrat.nom,
        lignes=lignes,
        libelles_supports=libelles,
        evenements=evenements,
    )


def projeter_monte_carlo(
    contrat: Contrat,
    scenario: ScenarioMarche,
    fiscal: ParametresFiscaux = ParametresFiscaux(),
    nombre_simulations: Optional[int] = None,
) -> ResultatMonteCarlo:
    """Répète la projection en mode stochastique et agrège les valeurs annuelles.

    Args:
        contrat: contrat à projeter.
        scenario: scénario ; la méthode est forcée en stochastique.
        fiscal: paramètres fiscaux.
        nombre_simulations: nombre de trajectoires (défaut : celui du scénario).

    Returns:
        ``ResultatMonteCarlo`` avec les percentiles de valorisation par année
        et la probabilité que la valeur finale plus les rachats soit inférieure
        aux versements cumulés.
    """
    n = nombre_simulations or scenario.nombre_simulations
    if n < 1:
        raise ValueError("Le nombre de simulations doit être ≥ 1.")
    sto = ScenarioMarche(
        tendance=scenario.tendance,
        variation_annuelle=scenario.variation_annuelle,
        volatilite=scenario.volatilite,
        taux_plancher=scenario.taux_plancher,
        methode=MethodeSimulation.STOCHASTIQUE,
        nombre_simulations=n,
        graine=scenario.graine,
    )
    graines = np.random.default_rng(scenario.graine).integers(0, 2**31 - 1, size=n)
    matrice = np.zeros((n, contrat.duree_annees))
    pertes = 0
    for i, g in enumerate(graines):
        res = projeter(contrat, sto, fiscal, graine=int(g))
        matrice[i] = [l.valeur_fin for l in res.lignes]
        derniere = res.lignes[-1]
        if derniere.plus_value_nette < 0:
            pertes += 1
    pct = np.percentile(matrice, [5, 25, 50, 75, 95], axis=0)
    distributions = [
        DistributionAnnuelle(
            annee=a + 1,
            moyenne=float(matrice[:, a].mean()),
            p5=float(pct[0, a]),
            p25=float(pct[1, a]),
            mediane=float(pct[2, a]),
            p75=float(pct[3, a]),
            p95=float(pct[4, a]),
        )
        for a in range(contrat.duree_annees)
    ]
    return ResultatMonteCarlo(
        nom_contrat=contrat.nom,
        nombre_simulations=n,
        distributions=distributions,
        probabilite_perte=pertes / n,
        valeurs_finales=matrice[:, -1].tolist(),
    )


def fiscalite_rachat_total(
    resultat: ResultatProjection,
    contrat: Contrat,
    fiscal: ParametresFiscaux = ParametresFiscaux(),
) -> fiscalite.FiscaliteRachat:
    """Fiscalité d'un rachat total au terme de la projection.

    Les produits déjà soumis aux prélèvements sociaux au fil de l'eau sont
    déduits de l'assiette des prélèvements sociaux au rachat.
    """
    valeur = resultat.valeur_finale
    primes_nettes = max(resultat.total_versements - resultat.total_rachats, 0.0)
    ps_deja = sum(l.prelevements_sociaux for l in resultat.lignes)
    produits_deja = ps_deja / fiscal.taux_prelevements_sociaux if fiscal.taux_prelevements_sociaux else 0.0
    return fiscalite.calculer_fiscalite_rachat(
        montant_rachat=valeur,
        valeur_contrat=valeur,
        primes_nettes=primes_nettes,
        anciennete_annees=contrat.duree_annees,
        parametres=fiscal,
        couple=contrat.situation_couple,
        primes_autres_contrats=contrat.primes_autres_contrats,
        produits_deja_soumis_ps=produits_deja,
    )
