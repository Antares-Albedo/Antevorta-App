"""Fiscalité des rachats sur un contrat d'assurance-vie ou de capitalisation.

Hypothèses simplificatrices :
- toutes les primes sont réputées versées après le 27/09/2017 (régime PFU) ;
- le contribuable opte pour le prélèvement forfaitaire (pas d'option pour le
  barème progressif) ;
- l'abattement après 8 ans n'a pas déjà été consommé dans l'année ;
- la quote-part de produits d'un rachat partiel est calculée selon la formule
  légale : produits = rachat × (1 - primes nettes / valeur du contrat).
"""

from __future__ import annotations

from dataclasses import dataclass

from models.scenario import ParametresFiscaux


@dataclass(frozen=True)
class FiscaliteRachat:
    """Décomposition fiscale d'un rachat.

    Attributes:
        montant_brut: montant racheté.
        part_produits: produits (intérêts et plus-values) inclus dans le rachat.
        part_capital: capital remboursé (non imposable).
        abattement_utilise: abattement effectivement appliqué.
        impot_revenu: prélèvement forfaitaire d'impôt sur le revenu.
        prelevements_sociaux: prélèvements sociaux dus au rachat.
        montant_net: montant perçu net d'impôt et de prélèvements sociaux.
    """

    montant_brut: float
    part_produits: float
    part_capital: float
    abattement_utilise: float
    impot_revenu: float
    prelevements_sociaux: float
    montant_net: float

    @property
    def total_prelevements(self) -> float:
        return self.impot_revenu + self.prelevements_sociaux


def part_produits_rachat(montant_rachat: float, valeur_contrat: float, primes_nettes: float) -> float:
    """Quote-part de produits contenue dans un rachat partiel.

    Args:
        montant_rachat: montant brut racheté.
        valeur_contrat: valeur de rachat totale au jour du rachat.
        primes_nettes: primes versées non encore remboursées par des rachats
            antérieurs (capital restant investi).

    Returns:
        Produits imposables, bornés entre 0 et le montant racheté.
    """
    if valeur_contrat <= 0 or montant_rachat <= 0:
        return 0.0
    if primes_nettes >= valeur_contrat:
        return 0.0
    produits = montant_rachat * (1.0 - primes_nettes / valeur_contrat)
    return min(max(produits, 0.0), montant_rachat)


def calculer_fiscalite_rachat(
    montant_rachat: float,
    valeur_contrat: float,
    primes_nettes: float,
    anciennete_annees: float,
    parametres: ParametresFiscaux = ParametresFiscaux(),
    couple: bool = False,
    primes_autres_contrats: float = 0.0,
    produits_deja_soumis_ps: float = 0.0,
) -> FiscaliteRachat:
    """Calcule l'impôt et les prélèvements sociaux d'un rachat.

    Args:
        montant_rachat: montant brut racheté.
        valeur_contrat: valeur du contrat au jour du rachat.
        primes_nettes: primes versées diminuées du capital déjà racheté.
        anciennete_annees: ancienneté fiscale du contrat au jour du rachat.
        parametres: taux et seuils en vigueur.
        couple: imposition commune (abattement 9 200 €) ou non (4 600 €).
        primes_autres_contrats: encours de primes sur les autres contrats du
            souscripteur, pour apprécier le seuil de 150 000 €.
        produits_deja_soumis_ps: fraction des produits rachetés ayant déjà
            supporté les prélèvements sociaux au fil de l'eau (fonds en euros),
            en euros, pour éviter une double retenue.

    Returns:
        ``FiscaliteRachat`` avec le net perçu.
    """
    produits = part_produits_rachat(montant_rachat, valeur_contrat, primes_nettes)
    capital = montant_rachat - produits

    if anciennete_annees >= 8:
        abattement_max = parametres.abattement_couple if couple else parametres.abattement_celibataire
        abattement = min(produits, abattement_max)
        base_ir = produits - abattement
        total_primes = primes_nettes + primes_autres_contrats
        if total_primes <= parametres.seuil_primes_taux_reduit:
            impot = base_ir * parametres.taux_ir_apres_8_ans_reduit
        else:
            # Fraction des produits afférente aux primes sous le seuil : taux réduit ;
            # le surplus : taux plein.
            quote_reduite = parametres.seuil_primes_taux_reduit / total_primes
            impot = base_ir * (
                quote_reduite * parametres.taux_ir_apres_8_ans_reduit
                + (1.0 - quote_reduite) * parametres.taux_ir_apres_8_ans_plein
            )
    else:
        abattement = 0.0
        impot = produits * parametres.taux_ir_avant_8_ans

    base_ps = max(produits - max(produits_deja_soumis_ps, 0.0), 0.0)
    ps = base_ps * parametres.taux_prelevements_sociaux
    net = montant_rachat - impot - ps
    return FiscaliteRachat(
        montant_brut=montant_rachat,
        part_produits=produits,
        part_capital=capital,
        abattement_utilise=abattement,
        impot_revenu=impot,
        prelevements_sociaux=ps,
        montant_net=net,
    )


def prelevements_sociaux_fil_eau(interets: float, parametres: ParametresFiscaux = ParametresFiscaux()) -> float:
    """Prélèvements sociaux retenus chaque année sur les intérêts du fonds en euros."""
    if interets <= 0 or not parametres.prelevements_sociaux_fil_eau:
        return 0.0
    return interets * parametres.taux_prelevements_sociaux
