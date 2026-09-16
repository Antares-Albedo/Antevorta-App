"""Interface Streamlit du simulateur de projection de contrats d'épargne.

Lancement depuis la racine du projet ::

    streamlit run interface/app.py

L'interface ne contient aucune logique de calcul : elle construit un
``Contrat`` et un ``ScenarioMarche`` puis délègue à ``engine.projection``.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional

RACINE = Path(__file__).resolve().parents[1]
if str(RACINE) not in sys.path:
    sys.path.insert(0, str(RACINE))

import pandas as pd  # noqa: E402
import streamlit as st  # noqa: E402

from engine.projection import fiscalite_rachat_total, projeter, projeter_monte_carlo  # noqa: E402
from engine.structures import statistiques_monte_carlo  # noqa: E402
from interface.export import (  # noqa: E402
    dataframe_synthese,
    exporter_excel,
    exporter_pdf,
    formater_euros,
    formater_pourcentage,
)
from models import (  # noqa: E402
    Contrat,
    MethodeSimulation,
    ModePerteStructure,
    ParametresFiscaux,
    ParametresFondsEuros,
    ParametresStructure,
    ParametresUC,
    Periodicite,
    RachatProgramme,
    ScenarioMarche,
    Support,
    Tendance,
    TypeSupport,
    VersementComplementaire,
    VersementProgramme,
    charger_contrat,
    contrat_vers_dict,
)

FICHIER_EXEMPLES = RACINE / "data" / "exemples_contrats.json"
LIBELLES_TYPES = {
    TypeSupport.FONDS_EUROS: "Fonds en euros",
    TypeSupport.UC: "Unités de compte",
    TypeSupport.STRUCTURE: "Produit structuré",
}
LIBELLES_TENDANCE = {Tendance.STABLE: "Stable", Tendance.HAUSSE: "Hausse", Tendance.BAISSE: "Baisse"}
LIBELLES_PERIODICITE = {
    Periodicite.MENSUELLE: "Mensuelle",
    Periodicite.TRIMESTRIELLE: "Trimestrielle",
    Periodicite.ANNUELLE: "Annuelle",
}


# ---------------------------------------------------------------------------
# Chargement des exemples et état de session
# ---------------------------------------------------------------------------


@st.cache_data
def charger_exemples() -> List[Dict[str, Any]]:
    """Exemples génériques du dossier data/."""
    with open(FICHIER_EXEMPLES, encoding="utf-8") as f:
        return json.load(f)["exemples"]


def _defaut_support(type_support: TypeSupport, rang: int) -> Dict[str, Any]:
    """Description par défaut d'un support pour l'état de session."""
    if type_support == TypeSupport.FONDS_EUROS:
        return {
            "identifiant": f"FE{rang}",
            "libelle": "Fonds en euros",
            "type": type_support.value,
            "allocation": 0.5,
            "parametres": {"taux_base": 0.028, "tendance": None, "variation_annuelle": None, "volatilite": None, "taux_plancher": None, "frais_gestion": 0.006},
        }
    if type_support == TypeSupport.UC:
        return {
            "identifiant": f"UC{rang}",
            "libelle": "Unités de compte",
            "type": type_support.value,
            "allocation": 0.5,
            "parametres": {"rendement_moyen": 0.05, "volatilite": 0.15, "frais_gestion": 0.009},
        }
    return {
        "identifiant": f"ST{rang}",
        "libelle": "Produit structuré",
        "type": type_support.value,
        "allocation": 0.0,
        "parametres": {
            "sous_jacent": "Euro Stoxx 50",
            "barriere_protection": 0.6,
            "barriere_coupon": 0.7,
            "niveau_coupon": 0.06,
            "memoire": True,
            "autocall": True,
            "barriere_autocall": 1.0,
            "maturite": 8,
            "dates_observation": [],
            "tendance_sous_jacent": 0.02,
            "volatilite_sous_jacent": 0.2,
            "mode_perte": "depuis_barriere",
            "support_reinvestissement": None,
            "frais_gestion": 0.0,
        },
    }


def _k(nom: str) -> str:
    """Clé de widget versionnée : un rechargement de contrat recrée tous les widgets."""
    return f"{nom}_v{st.session_state.get('version', 0)}"


def initialiser_etat(donnees: Optional[Dict[str, Any]] = None) -> None:
    """Charge un contrat (exemple ou défaut) dans ``st.session_state``."""
    if donnees is None:
        donnees = {
            "nom": "Nouveau contrat",
            "montant_initial": 50_000,
            "duree_annees": 10,
            "date_souscription": date.today().isoformat(),
            "frais_versement": 0.02,
            "situation_couple": False,
            "primes_autres_contrats": 0.0,
            "supports": [_defaut_support(TypeSupport.FONDS_EUROS, 1), _defaut_support(TypeSupport.UC, 1)],
            "versements_programmes": [],
            "versements_complementaires": [],
            "rachats_programmes": [],
        }
    # Passage par le modèle pour compléter les champs absents avec leurs valeurs par défaut.
    complet = contrat_vers_dict(charger_contrat(donnees))
    st.session_state["contrat"] = json.loads(json.dumps(complet))
    st.session_state["version"] = st.session_state.get("version", 0) + 1
    st.session_state.pop("resultat", None)
    st.session_state.pop("monte_carlo", None)


# ---------------------------------------------------------------------------
# Formulaires
# ---------------------------------------------------------------------------


def formulaire_contrat(etat: Dict[str, Any]) -> None:
    st.subheader("Contrat")
    c1, c2, c3 = st.columns(3)
    etat["nom"] = c1.text_input("Libellé", etat["nom"])
    etat["montant_initial"] = c2.number_input("Versement initial (€)", min_value=0.0, value=float(etat["montant_initial"]), step=1_000.0)
    etat["duree_annees"] = int(c3.number_input("Durée (ans)", min_value=1, max_value=50, value=int(etat["duree_annees"])))
    c4, c5, c6 = st.columns(3)
    etat["date_souscription"] = c4.date_input("Date de souscription", date.fromisoformat(etat["date_souscription"])).isoformat()
    etat["frais_versement"] = c5.number_input("Frais sur versement (%)", min_value=0.0, max_value=10.0, value=float(etat["frais_versement"]) * 100, step=0.1) / 100
    etat["situation_couple"] = c6.checkbox("Imposition commune (couple)", value=bool(etat["situation_couple"]))
    etat["primes_autres_contrats"] = st.number_input(
        "Primes déjà versées sur d'autres contrats (€), pour le seuil de 150 000 €",
        min_value=0.0,
        value=float(etat.get("primes_autres_contrats", 0.0)),
        step=10_000.0,
    )


def formulaire_support(sup: Dict[str, Any], rang: int, identifiants: List[str]) -> bool:
    """Formulaire d'un support. Retourne vrai si l'utilisateur demande sa suppression."""
    type_support = TypeSupport(sup["type"])
    p = sup["parametres"]
    with st.expander(f"{LIBELLES_TYPES[type_support]} : {sup['libelle']}", expanded=True):
        c1, c2, c3, c4 = st.columns([2, 2, 1, 1])
        sup["identifiant"] = c1.text_input("Identifiant", sup["identifiant"], key=_k(f"id_{rang}"))
        sup["libelle"] = c2.text_input("Libellé", sup["libelle"], key=_k(f"lib_{rang}"))
        sup["allocation"] = c3.number_input("Allocation (%)", 0.0, 100.0, float(sup["allocation"]) * 100, 1.0, key=_k(f"alloc_{rang}")) / 100
        supprimer = c4.button("Supprimer", key=_k(f"suppr_{rang}"))

        if type_support == TypeSupport.FONDS_EUROS:
            a, b, c = st.columns(3)
            p["taux_base"] = a.number_input("Taux année 1 (%)", 0.0, 15.0, float(p["taux_base"]) * 100, 0.05, key=_k(f"fe_taux_{rang}")) / 100
            p["frais_gestion"] = b.number_input("Frais de gestion (%)", 0.0, 5.0, float(p["frais_gestion"]) * 100, 0.05, key=_k(f"fe_frais_{rang}")) / 100
            surcharge = c.checkbox("Règle de variation propre", value=p.get("tendance") is not None, key=_k(f"fe_sur_{rang}"))
            if surcharge:
                d, e, f, g = st.columns(4)
                tendance = d.selectbox(
                    "Tendance", list(LIBELLES_TENDANCE), format_func=lambda t: LIBELLES_TENDANCE[t],
                    index=list(LIBELLES_TENDANCE).index(Tendance(p["tendance"] or "stable")), key=_k(f"fe_tend_{rang}"),
                )
                p["tendance"] = tendance.value
                p["variation_annuelle"] = e.number_input("Variation par an (pt)", 0.0, 5.0, float(p.get("variation_annuelle") or 0.0) * 100, 0.05, key=_k(f"fe_var_{rang}")) / 100
                p["volatilite"] = f.number_input("Volatilité du taux (pt)", 0.0, 5.0, float(p.get("volatilite") or 0.0) * 100, 0.05, key=_k(f"fe_vol_{rang}")) / 100
                p["taux_plancher"] = g.number_input("Taux plancher (%)", 0.0, 10.0, float(p.get("taux_plancher") or 0.0) * 100, 0.05, key=_k(f"fe_pl_{rang}")) / 100
            else:
                for cle in ("tendance", "variation_annuelle", "volatilite", "taux_plancher"):
                    p[cle] = None
        elif type_support == TypeSupport.UC:
            a, b, c = st.columns(3)
            p["rendement_moyen"] = a.number_input("Rendement moyen (%)", -20.0, 30.0, float(p["rendement_moyen"]) * 100, 0.1, key=_k(f"uc_rdt_{rang}")) / 100
            p["volatilite"] = b.number_input("Volatilité (%)", 0.0, 60.0, float(p["volatilite"]) * 100, 0.5, key=_k(f"uc_vol_{rang}")) / 100
            p["frais_gestion"] = c.number_input("Frais de gestion (%)", 0.0, 5.0, float(p["frais_gestion"]) * 100, 0.05, key=_k(f"uc_frais_{rang}")) / 100
        else:
            a, b, c, d = st.columns(4)
            p["sous_jacent"] = a.text_input("Sous-jacent", p["sous_jacent"], key=_k(f"st_sj_{rang}"))
            p["maturite"] = int(b.number_input("Maturité (ans)", 1, 15, int(p["maturite"]), key=_k(f"st_mat_{rang}")))
            p["niveau_coupon"] = c.number_input("Coupon par période (%)", 0.0, 30.0, float(p["niveau_coupon"]) * 100, 0.1, key=_k(f"st_cpn_{rang}")) / 100
            p["frais_gestion"] = d.number_input("Frais de gestion (%)", 0.0, 5.0, float(p["frais_gestion"]) * 100, 0.05, key=_k(f"st_frais_{rang}")) / 100
            e, f, g, h = st.columns(4)
            p["barriere_protection"] = e.number_input("Barrière de protection (%)", 1.0, 100.0, float(p["barriere_protection"]) * 100, 1.0, key=_k(f"st_bp_{rang}")) / 100
            p["barriere_coupon"] = f.number_input("Barrière de coupon (%)", 1.0, 150.0, float(p["barriere_coupon"]) * 100, 1.0, key=_k(f"st_bc_{rang}")) / 100
            p["barriere_autocall"] = g.number_input("Barrière d'autocall (%)", 50.0, 150.0, float(p["barriere_autocall"]) * 100, 1.0, key=_k(f"st_ba_{rang}")) / 100
            p["memoire"] = h.checkbox("Effet mémoire", bool(p["memoire"]), key=_k(f"st_mem_{rang}"))
            p["autocall"] = h.checkbox("Autocall", bool(p["autocall"]), key=_k(f"st_ac_{rang}"))
            i, j, k, l = st.columns(4)
            p["tendance_sous_jacent"] = i.number_input("Tendance du sous-jacent (%/an)", -30.0, 30.0, float(p["tendance_sous_jacent"]) * 100, 0.5, key=_k(f"st_tend_{rang}")) / 100
            p["volatilite_sous_jacent"] = j.number_input("Volatilité du sous-jacent (%)", 0.0, 80.0, float(p["volatilite_sous_jacent"]) * 100, 1.0, key=_k(f"st_vol_{rang}")) / 100
            modes = list(ModePerteStructure)
            mode = k.selectbox(
                "Perte à maturité", modes,
                format_func=lambda m: "Au-delà de la barrière" if m == ModePerteStructure.DEPUIS_BARRIERE else "Depuis le niveau initial",
                index=modes.index(ModePerteStructure(p["mode_perte"])), key=_k(f"st_mode_{rang}"),
            )
            p["mode_perte"] = mode.value
            choix = ["(fonds en euros par défaut)"] + [x for x in identifiants if x != sup["identifiant"]]
            actuel = p.get("support_reinvestissement") or choix[0]
            reinv = l.selectbox("Réinvestissement des coupons", choix, index=choix.index(actuel) if actuel in choix else 0, key=_k(f"st_reinv_{rang}"))
            p["support_reinvestissement"] = None if reinv == choix[0] else reinv
            obs = st.text_input(
                "Dates d'observation (années, séparées par des virgules ; vide = chaque année)",
                ", ".join(str(a) for a in p.get("dates_observation") or []),
                key=_k(f"st_obs_{rang}"),
            )
            p["dates_observation"] = [int(x) for x in obs.replace(" ", "").split(",") if x.strip().isdigit()]
    return supprimer


def formulaire_supports(etat: Dict[str, Any]) -> None:
    st.subheader("Supports et allocation")
    c1, c2 = st.columns([3, 1])
    nouveau = c1.selectbox("Ajouter un support", list(LIBELLES_TYPES), format_func=lambda t: LIBELLES_TYPES[t], key=_k("type_nouveau"))
    if c2.button("Ajouter"):
        etat["supports"].append(_defaut_support(nouveau, len(etat["supports"]) + 1))
        st.rerun()
    identifiants = [s["identifiant"] for s in etat["supports"]]
    a_supprimer: Optional[int] = None
    for rang, sup in enumerate(etat["supports"]):
        if formulaire_support(sup, rang, identifiants):
            a_supprimer = rang
    if a_supprimer is not None:
        etat["supports"].pop(a_supprimer)
        st.rerun()
    total = sum(s["allocation"] for s in etat["supports"])
    if abs(total - 1.0) > 1e-6:
        st.warning(f"La somme des allocations vaut {formater_pourcentage(total, 0)} ; elle doit valoir 100 %.")


def _editeur(etat: Dict[str, Any], cle: str, colonnes: Dict[str, Any], titre: str) -> None:
    """Éditeur tabulaire générique pour versements et rachats."""
    st.markdown(f"**{titre}**")
    df = pd.DataFrame(etat.get(cle, []), columns=list(colonnes))
    for col in df.columns:
        if col.startswith("date"):
            df[col] = pd.to_datetime(df[col], errors="coerce")
    edite = st.data_editor(df, num_rows="dynamic", column_config=colonnes, key=_k(f"edit_{cle}"), width="stretch")
    lignes: List[Dict[str, Any]] = []
    for _, ligne in edite.iterrows():
        d: Dict[str, Any] = {}
        for col in colonnes:
            v = ligne[col]
            if col.startswith("date"):
                d[col] = None if pd.isna(v) else pd.Timestamp(v).date().isoformat()
            elif pd.isna(v) if not isinstance(v, str) else False:
                d[col] = None
            else:
                d[col] = v
        lignes.append(d)
    etat[cle] = lignes


def formulaire_flux(etat: Dict[str, Any]) -> None:
    st.subheader("Versements et rachats")
    periodicites = [p.value for p in Periodicite]
    supports = [s["identifiant"] for s in etat["supports"]]
    _editeur(
        etat,
        "versements_programmes",
        {
            "montant": st.column_config.NumberColumn("Montant (€)", min_value=0.0, format="%.0f", required=True),
            "periodicite": st.column_config.SelectboxColumn("Périodicité", options=periodicites, default="mensuelle", required=True),
            "date_debut": st.column_config.DateColumn("Début (vide = une période après la souscription)"),
            "date_fin": st.column_config.DateColumn("Fin (vide = terme)"),
            "indexation": st.column_config.NumberColumn("Indexation annuelle", min_value=0.0, max_value=0.2, format="%.3f", default=0.0),
        },
        "Versements programmés",
    )
    _editeur(
        etat,
        "versements_complementaires",
        {
            "montant": st.column_config.NumberColumn("Montant (€)", min_value=0.0, format="%.0f", required=True),
            "date": st.column_config.DateColumn("Date", required=True),
            "support_cible": st.column_config.SelectboxColumn("Support cible (vide = allocation)", options=supports),
        },
        "Versements complémentaires",
    )
    _editeur(
        etat,
        "rachats_programmes",
        {
            "montant": st.column_config.NumberColumn("Montant (€)", min_value=0.0, format="%.0f"),
            "pourcentage": st.column_config.NumberColumn("Ou % de l'assiette", min_value=0.0, max_value=1.0, format="%.3f"),
            "periodicite": st.column_config.SelectboxColumn("Périodicité", options=periodicites, default="annuelle", required=True),
            "date_debut": st.column_config.DateColumn("Début"),
            "date_fin": st.column_config.DateColumn("Fin (vide = terme)"),
            "support_prelevement": st.column_config.SelectboxColumn("Support débité (vide = prorata)", options=supports),
        },
        "Rachats programmés",
    )


def formulaire_scenario() -> tuple[ScenarioMarche, ParametresFiscaux, bool, int]:
    """Barre latérale : scénario de marché, fiscalité, options Monte Carlo."""
    st.sidebar.subheader("Scénario de marché")
    tendance = st.sidebar.selectbox("Tendance des taux du fonds en euros", list(LIBELLES_TENDANCE), format_func=lambda t: LIBELLES_TENDANCE[t])
    variation = st.sidebar.number_input("Variation annuelle (pt)", 0.0, 5.0, 0.0, 0.05) / 100
    volatilite = st.sidebar.number_input("Volatilité du taux (pt)", 0.0, 5.0, 0.0, 0.05) / 100
    plancher = st.sidebar.number_input("Taux plancher (%)", 0.0, 10.0, 0.0, 0.05) / 100
    methode = st.sidebar.radio("Méthode", list(MethodeSimulation), format_func=lambda m: "Déterministe" if m == MethodeSimulation.DETERMINISTE else "Stochastique (un tirage)")
    graine = st.sidebar.number_input("Graine aléatoire", 0, 10_000, 42)
    st.sidebar.subheader("Monte Carlo")
    activer_mc = st.sidebar.checkbox("Calculer la distribution Monte Carlo", value=False)
    nb_simulations = int(st.sidebar.number_input("Nombre de simulations", 10, 5_000, 500, 10))
    st.sidebar.subheader("Fiscalité")
    ps_fil_eau = st.sidebar.checkbox("Prélèvements sociaux au fil de l'eau sur le fonds en euros", value=True)
    taux_ps = st.sidebar.number_input("Taux des prélèvements sociaux (%)", 0.0, 30.0, 17.2, 0.1) / 100
    scenario = ScenarioMarche(
        tendance=tendance,
        variation_annuelle=variation,
        volatilite=volatilite,
        taux_plancher=plancher,
        methode=methode,
        nombre_simulations=nb_simulations,
        graine=int(graine),
    )
    fiscal = ParametresFiscaux(taux_prelevements_sociaux=taux_ps, prelevements_sociaux_fil_eau=ps_fil_eau)
    return scenario, fiscal, activer_mc, nb_simulations


# ---------------------------------------------------------------------------
# Résultats
# ---------------------------------------------------------------------------


def afficher_resultats(contrat: Contrat, scenario: ScenarioMarche, fiscal: ParametresFiscaux) -> None:
    resultat = st.session_state["resultat"]
    mc = st.session_state.get("monte_carlo")
    derniere = resultat.lignes[-1]

    st.subheader("Synthèse")
    m1, m2, m3, m4, m5 = st.columns(5)
    m1.metric("Versements cumulés", formater_euros(derniere.cumul_versements))
    m2.metric("Rachats cumulés", formater_euros(derniere.cumul_rachats))
    m3.metric("Valeur au terme", formater_euros(derniere.valeur_fin))
    m4.metric("Plus-value nette", formater_euros(derniere.plus_value_nette))
    capital_net = derniere.cumul_versements - derniere.cumul_rachats
    taux_moyen = (derniere.valeur_fin / capital_net) ** (1 / contrat.duree_annees) - 1 if capital_net > 0 else 0.0
    m5.metric("Rendement annualisé indicatif", formater_pourcentage(taux_moyen))

    df = dataframe_synthese(resultat)
    st.subheader("Évolution de la valorisation")
    idents = list(derniere.repartition.keys())
    libelles = [resultat.libelles_supports.get(i, i) for i in idents]
    courbe = df.set_index("Année")[libelles]
    st.area_chart(courbe, height=320)
    comparaison = pd.DataFrame(
        {
            "Valorisation": [l.valeur_fin for l in resultat.lignes],
            "Capital net investi": [l.cumul_versements - l.cumul_rachats for l in resultat.lignes],
        },
        index=[l.annee for l in resultat.lignes],
    )
    st.line_chart(comparaison, height=260)

    st.subheader("Tableau annuel")
    affichage = df.copy()
    affichage["Date"] = pd.to_datetime(affichage["Date"]).dt.strftime("%d/%m/%Y")
    colonnes_euros = [c for c in affichage.columns if c not in ("Année", "Date", "Performance nette")]
    st.dataframe(
        affichage,
        width="stretch",
        hide_index=True,
        column_config={
            **{c: st.column_config.NumberColumn(c, format="%.0f €") for c in colonnes_euros},
            "Performance nette": st.column_config.NumberColumn("Performance nette", format="percent"),
        },
    )
    if resultat.evenements:
        st.markdown("**Événements sur les produits structurés**")
        for e in resultat.evenements:
            st.markdown(f"- {e}")

    st.subheader("Fiscalité d'un rachat total au terme")
    f = fiscalite_rachat_total(resultat, contrat, fiscal)
    t1, t2, t3, t4 = st.columns(4)
    t1.metric("Produits imposables", formater_euros(f.part_produits))
    t2.metric("Impôt sur le revenu (PFU)", formater_euros(f.impot_revenu))
    t3.metric("Prélèvements sociaux", formater_euros(f.prelevements_sociaux))
    t4.metric("Net perçu", formater_euros(f.montant_net))
    st.caption(
        "Hypothèses : primes versées après le 27/09/2017, option pour le prélèvement forfaitaire, "
        f"abattement de {formater_euros(f.abattement_utilise)} appliqué. Les produits du fonds en euros déjà "
        "soumis aux prélèvements sociaux au fil de l'eau ne sont pas retaxés."
    )

    if mc is not None:
        st.subheader(f"Distribution Monte Carlo ({mc.nombre_simulations} simulations)")
        dmc = pd.DataFrame(mc.vers_lignes()).set_index("Année")
        st.line_chart(dmc[["P5", "P25", "Médiane", "P75", "P95"]], height=300)
        st.dataframe(dmc, width="stretch", column_config={c: st.column_config.NumberColumn(c, format="%.0f €") for c in dmc.columns})
        st.metric("Probabilité de valeur au terme (rachats inclus) inférieure aux versements", formater_pourcentage(mc.probabilite_perte, 1))

    for s in contrat.supports:
        if isinstance(s.parametres, ParametresStructure):
            with st.expander(f"Analyse Monte Carlo du produit structuré {s.libelle}"):
                stats = statistiques_monte_carlo(10_000.0, s.parametres, 2_000, graine=scenario.graine)
                a, b, c, d = st.columns(4)
                a.metric("Probabilité d'autocall", formater_pourcentage(stats["probabilite_autocall"], 1))
                b.metric("Probabilité de perte en capital", formater_pourcentage(stats["probabilite_perte"], 1))
                c.metric("Durée moyenne", f"{stats['duree_moyenne']:.1f} ans".replace(".", ","))
                d.metric("Rendement total moyen", formater_pourcentage(stats["rendement_total_moyen"], 1))

    st.subheader("Exports")
    conseiller = st.text_input("Mention en en-tête du PDF (cabinet)", "")
    e1, e2, e3 = st.columns(3)
    nom_fichier = "".join(ch if ch.isalnum() else "_" for ch in contrat.nom)[:40] or "projection"
    e1.download_button(
        "Télécharger Excel",
        data=exporter_excel(resultat, contrat, mc),
        file_name=f"{nom_fichier}.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    e2.download_button(
        "Télécharger PDF",
        data=exporter_pdf(resultat, contrat, mc, conseiller),
        file_name=f"{nom_fichier}.pdf",
        mime="application/pdf",
    )
    e3.download_button(
        "Télécharger le contrat (JSON)",
        data=json.dumps(contrat_vers_dict(contrat), ensure_ascii=False, indent=2),
        file_name=f"{nom_fichier}.json",
        mime="application/json",
    )


# ---------------------------------------------------------------------------
# Page
# ---------------------------------------------------------------------------


def main() -> None:
    st.set_page_config(page_title="Simulateur de projection", layout="wide")
    st.title("Simulateur de projection de contrats d'épargne")
    st.caption("Assurance-vie et capitalisation : fonds en euros, unités de compte, produits structurés.")

    if "contrat" not in st.session_state:
        initialiser_etat()

    st.sidebar.subheader("Contrat")
    exemples = charger_exemples()
    choix = st.sidebar.selectbox("Charger un exemple", ["(contrat courant)"] + [e["nom"] for e in exemples])
    if st.sidebar.button("Charger") and choix != "(contrat courant)":
        initialiser_etat(next(e for e in exemples if e["nom"] == choix))
        st.rerun()
    fichier = st.sidebar.file_uploader("Ou importer un contrat JSON", type=["json"])
    if fichier is not None and st.sidebar.button("Importer"):
        initialiser_etat(json.load(fichier))
        st.rerun()
    if st.sidebar.button("Réinitialiser"):
        initialiser_etat()
        st.rerun()

    scenario, fiscal, activer_mc, nb_simulations = formulaire_scenario()
    etat = st.session_state["contrat"]

    onglet_contrat, onglet_supports, onglet_flux = st.tabs(["Contrat", "Supports", "Versements et rachats"])
    with onglet_contrat:
        formulaire_contrat(etat)
    with onglet_supports:
        formulaire_supports(etat)
    with onglet_flux:
        formulaire_flux(etat)

    st.divider()
    if st.button("Lancer la simulation", type="primary"):
        try:
            contrat = charger_contrat(etat)
        except (ValueError, TypeError, KeyError) as erreur:
            st.error(f"Paramétrage invalide : {erreur}")
            return
        with st.spinner("Projection en cours"):
            st.session_state["resultat"] = projeter(contrat, scenario, fiscal)
            st.session_state["monte_carlo"] = (
                projeter_monte_carlo(contrat, scenario, fiscal, nb_simulations) if activer_mc else None
            )
            st.session_state["contrat_projete"] = contrat
            st.session_state["scenario_projete"] = scenario
            st.session_state["fiscal_projete"] = fiscal

    if "resultat" in st.session_state:
        afficher_resultats(
            st.session_state["contrat_projete"],
            st.session_state["scenario_projete"],
            st.session_state["fiscal_projete"],
        )


if __name__ == "__main__":
    main()
