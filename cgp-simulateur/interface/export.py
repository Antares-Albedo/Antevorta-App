"""Exports Excel et PDF du tableau de projection, prêts pour un client.

Les deux fonctions retournent des octets (``bytes``) afin d'être servies
directement par Streamlit (``st.download_button``) ou écrites sur disque.
"""

from __future__ import annotations

import io
from datetime import date
from typing import Dict, List, Optional

from openpyxl import Workbook
from openpyxl.chart import LineChart, Reference
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from models.contrat import Contrat
from models.resultats import ResultatMonteCarlo, ResultatProjection

COULEUR_ENTETE = "1F3B5C"
COULEUR_BANDE = "EEF2F7"

COLONNES_SYNTHESE = [
    ("Année", "annee"),
    ("Date", "date_fin"),
    ("Valeur début", "valeur_debut"),
    ("Versements", "versements"),
    ("Rachats", "rachats"),
    ("Frais", "frais"),
    ("Prélèv. sociaux", "prelevements_sociaux"),
    ("Coupons", "coupons"),
    ("Valeur fin", "valeur_fin"),
    ("Perf. nette", "performance_nette"),
    ("Cumul versements", "cumul_versements"),
    ("Cumul rachats", "cumul_rachats"),
    ("Plus-value nette", "plus_value_nette"),
]


def formater_euros(valeur: float) -> str:
    """Formate un montant : espace pour les milliers, virgule décimale, symbole €."""
    texte = f"{valeur:,.0f}".replace(",", " ")
    return f"{texte} €"


def formater_pourcentage(valeur: float, decimales: int = 2) -> str:
    """Formate une fraction en pourcentage à la française."""
    return f"{valeur * 100:.{decimales}f}".replace(".", ",") + " %"


def formater_date(valeur: date) -> str:
    """JJ/MM/AAAA."""
    return valeur.strftime("%d/%m/%Y")


def _hypotheses(contrat: Contrat) -> List[List[str]]:
    """Lignes décrivant les hypothèses du contrat pour les restitutions."""
    lignes = [
        ["Contrat", contrat.nom],
        ["Date de souscription", formater_date(contrat.date_souscription)],
        ["Versement initial", formater_euros(contrat.montant_initial)],
        ["Durée", f"{contrat.duree_annees} ans"],
        ["Frais sur versement", formater_pourcentage(contrat.frais_versement)],
    ]
    for s in contrat.supports:
        p = s.parametres
        detail = ""
        if s.type.value == "fonds_euros":
            detail = f"taux {formater_pourcentage(p.taux_base)}, frais {formater_pourcentage(p.frais_gestion)}"
        elif s.type.value == "uc":
            detail = (
                f"rendement {formater_pourcentage(p.rendement_moyen)}, volatilité "
                f"{formater_pourcentage(p.volatilite, 0)}, frais {formater_pourcentage(p.frais_gestion)}"
            )
        else:
            detail = (
                f"{p.sous_jacent}, coupon {formater_pourcentage(p.niveau_coupon)}, protection "
                f"{formater_pourcentage(p.barriere_protection, 0)}, maturité {p.maturite} ans"
            )
        lignes.append([f"Support {s.libelle}", f"{formater_pourcentage(s.allocation, 0)} : {detail}"])
    for v in contrat.versements_programmes:
        lignes.append(["Versement programmé", f"{formater_euros(v.montant)} {v.periodicite.value}"])
    for r in contrat.rachats_programmes:
        montant = formater_euros(r.montant) if r.montant is not None else formater_pourcentage(r.pourcentage or 0)
        lignes.append(["Rachat programmé", f"{montant} {r.periodicite.value}"])
    return lignes


# ---------------------------------------------------------------------------
# Excel
# ---------------------------------------------------------------------------


def exporter_excel(
    resultat: ResultatProjection,
    contrat: Contrat,
    monte_carlo: Optional[ResultatMonteCarlo] = None,
) -> bytes:
    """Classeur Excel : synthèse annuelle, répartition par support, hypothèses.

    Args:
        resultat: projection déterministe.
        contrat: contrat projeté (pour la feuille d'hypothèses).
        monte_carlo: distribution optionnelle ajoutée dans une feuille dédiée.

    Returns:
        Contenu du fichier .xlsx.
    """
    wb = Workbook()
    entete_font = Font(bold=True, color="FFFFFF")
    entete_fill = PatternFill("solid", fgColor=COULEUR_ENTETE)
    bande_fill = PatternFill("solid", fgColor=COULEUR_BANDE)
    bordure = Border(bottom=Side(style="thin", color="C8D0DA"))

    def _entete(ws, colonnes: List[str]) -> None:
        for i, nom in enumerate(colonnes, start=1):
            c = ws.cell(row=1, column=i, value=nom)
            c.font = entete_font
            c.fill = entete_fill
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.row_dimensions[1].height = 30
        ws.freeze_panes = "A2"

    def _largeurs(ws, largeur: int = 16) -> None:
        for i in range(1, ws.max_column + 1):
            ws.column_dimensions[get_column_letter(i)].width = largeur

    # Feuille 1 : synthèse annuelle
    ws = wb.active
    ws.title = "Projection annuelle"
    _entete(ws, [c[0] for c in COLONNES_SYNTHESE])
    for r, ligne in enumerate(resultat.lignes, start=2):
        for c, (_, attr) in enumerate(COLONNES_SYNTHESE, start=1):
            valeur = getattr(ligne, attr)
            cell = ws.cell(row=r, column=c, value=valeur)
            if attr == "date_fin":
                cell.number_format = "DD/MM/YYYY"
            elif attr == "performance_nette":
                cell.number_format = "0.00 %"
            elif attr != "annee":
                cell.number_format = "#,##0 €"
            if r % 2 == 0:
                cell.fill = bande_fill
            cell.border = bordure
    _largeurs(ws)

    # Feuille 2 : répartition par support
    ws2 = wb.create_sheet("Répartition")
    idents = list(resultat.lignes[-1].repartition.keys()) if resultat.lignes else []
    libelles = [resultat.libelles_supports.get(i, i) for i in idents]
    _entete(ws2, ["Année", "Date"] + libelles + ["Total"])
    for r, ligne in enumerate(resultat.lignes, start=2):
        ws2.cell(row=r, column=1, value=ligne.annee)
        ws2.cell(row=r, column=2, value=ligne.date_fin).number_format = "DD/MM/YYYY"
        for c, ident in enumerate(idents, start=3):
            ws2.cell(row=r, column=c, value=ligne.repartition.get(ident, 0.0)).number_format = "#,##0 €"
        ws2.cell(row=r, column=3 + len(idents), value=ligne.valeur_fin).number_format = "#,##0 €"
    _largeurs(ws2, 20)
    if resultat.lignes:
        graphe = LineChart()
        graphe.title = "Évolution de la valorisation"
        graphe.y_axis.title = "€"
        graphe.x_axis.title = "Année"
        donnees = Reference(ws2, min_col=3, max_col=3 + len(idents), min_row=1, max_row=len(resultat.lignes) + 1)
        categories = Reference(ws2, min_col=1, min_row=2, max_row=len(resultat.lignes) + 1)
        graphe.add_data(donnees, titles_from_data=True)
        graphe.set_categories(categories)
        graphe.height, graphe.width = 9, 22
        ws2.add_chart(graphe, f"A{len(resultat.lignes) + 4}")

    # Feuille 3 : hypothèses et événements
    ws3 = wb.create_sheet("Hypothèses")
    _entete(ws3, ["Paramètre", "Valeur"])
    r = 2
    for cle, val in _hypotheses(contrat):
        ws3.cell(row=r, column=1, value=cle).font = Font(bold=True)
        ws3.cell(row=r, column=2, value=val)
        r += 1
    if resultat.evenements:
        r += 1
        ws3.cell(row=r, column=1, value="Événements").font = Font(bold=True)
        for e in resultat.evenements:
            r += 1
            ws3.cell(row=r, column=2, value=e)
    ws3.column_dimensions["A"].width = 30
    ws3.column_dimensions["B"].width = 90

    # Feuille 4 : Monte Carlo
    if monte_carlo is not None:
        ws4 = wb.create_sheet("Monte Carlo")
        _entete(ws4, ["Année", "P5", "P25", "Médiane", "P75", "P95", "Moyenne"])
        for r, d in enumerate(monte_carlo.distributions, start=2):
            for c, v in enumerate([d.annee, d.p5, d.p25, d.mediane, d.p75, d.p95, d.moyenne], start=1):
                cell = ws4.cell(row=r, column=c, value=v)
                if c > 1:
                    cell.number_format = "#,##0 €"
        r = len(monte_carlo.distributions) + 3
        ws4.cell(row=r, column=1, value="Simulations").font = Font(bold=True)
        ws4.cell(row=r, column=2, value=monte_carlo.nombre_simulations)
        ws4.cell(row=r + 1, column=1, value="Probabilité de perte").font = Font(bold=True)
        ws4.cell(row=r + 1, column=2, value=monte_carlo.probabilite_perte).number_format = "0.0 %"
        _largeurs(ws4)

    tampon = io.BytesIO()
    wb.save(tampon)
    return tampon.getvalue()


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------


def _graphique_pdf(resultat: ResultatProjection, largeur: float, hauteur: float) -> Drawing:
    """Courbe de la valorisation totale et des versements cumulés nets de rachats."""
    dessin = Drawing(largeur, hauteur)
    plot = LinePlot()
    plot.x, plot.y = 60, 30
    plot.width, plot.height = largeur - 80, hauteur - 50
    annees = [float(l.annee) for l in resultat.lignes]
    plot.data = [
        list(zip(annees, [l.valeur_fin for l in resultat.lignes])),
        list(zip(annees, [l.cumul_versements - l.cumul_rachats for l in resultat.lignes])),
    ]
    plot.lines[0].strokeColor = colors.HexColor("#" + COULEUR_ENTETE)
    plot.lines[0].strokeWidth = 2
    plot.lines[1].strokeColor = colors.HexColor("#8A9BB0")
    plot.lines[1].strokeWidth = 1.5
    plot.xValueAxis.valueMin = annees[0] if annees else 0
    plot.xValueAxis.valueMax = annees[-1] if annees else 1
    plot.xValueAxis.valueStep = max(1, int(len(annees) / 10) or 1)
    plot.yValueAxis.valueMin = 0
    plot.yValueAxis.labelTextFormat = lambda v: f"{v / 1000:,.0f} k€".replace(",", " ")
    plot.yValueAxis.labels.fontName = "Helvetica"
    plot.xValueAxis.labels.fontName = "Helvetica"
    dessin.add(plot)
    dessin.add(
        String(60, hauteur - 12, "Valorisation (bleu) et capital net investi (gris), en k€", fontSize=8, fontName="Helvetica")
    )
    return dessin


def exporter_pdf(
    resultat: ResultatProjection,
    contrat: Contrat,
    monte_carlo: Optional[ResultatMonteCarlo] = None,
    conseiller: str = "",
) -> bytes:
    """Rapport PDF paysage : hypothèses, graphique, tableau annuel, avertissement.

    Args:
        resultat: projection déterministe.
        contrat: contrat projeté.
        monte_carlo: distribution optionnelle (tableau des percentiles).
        conseiller: mention affichée en en-tête (raison sociale du cabinet).

    Returns:
        Contenu du fichier .pdf.
    """
    tampon = io.BytesIO()
    doc = SimpleDocTemplate(
        tampon,
        pagesize=landscape(A4),
        leftMargin=1.2 * cm,
        rightMargin=1.2 * cm,
        topMargin=1.2 * cm,
        bottomMargin=1.2 * cm,
        title=f"Projection {contrat.nom}",
    )
    styles = getSampleStyleSheet()
    titre = ParagraphStyle("titre", parent=styles["Title"], fontSize=16, spaceAfter=6, textColor=colors.HexColor("#" + COULEUR_ENTETE))
    sous_titre = ParagraphStyle("sous", parent=styles["Heading3"], fontSize=11, spaceBefore=8, spaceAfter=4)
    normal = ParagraphStyle("normal", parent=styles["Normal"], fontSize=8.5, leading=11)
    petit = ParagraphStyle("petit", parent=styles["Normal"], fontSize=7, leading=9, textColor=colors.grey)
    centre = ParagraphStyle("centre", parent=normal, alignment=TA_CENTER)

    elements: List = []
    entete = f"Projection du contrat : {contrat.nom}"
    if conseiller:
        entete = f"{conseiller} - {entete}"
    elements.append(Paragraph(entete, titre))
    elements.append(Paragraph(f"Édité le {formater_date(date.today())}", centre))
    elements.append(Spacer(1, 6))

    # Chiffres clés
    derniere = resultat.lignes[-1]
    cles = [
        ["Versements cumulés", "Rachats cumulés", "Valeur au terme", "Plus-value nette"],
        [
            formater_euros(derniere.cumul_versements),
            formater_euros(derniere.cumul_rachats),
            formater_euros(derniere.valeur_fin),
            formater_euros(derniere.plus_value_nette),
        ],
    ]
    t_cles = Table(cles, colWidths=[6 * cm] * 4)
    t_cles.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#" + COULEUR_ENTETE)),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("FONTSIZE", (0, 1), (-1, 1), 12),
                ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#C8D0DA")),
            ]
        )
    )
    elements.append(t_cles)

    # Hypothèses
    elements.append(Paragraph("Hypothèses", sous_titre))
    hyp = [[Paragraph(f"<b>{k}</b>", normal), Paragraph(v, normal)] for k, v in _hypotheses(contrat)]
    t_hyp = Table(hyp, colWidths=[6 * cm, 20 * cm])
    t_hyp.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    elements.append(t_hyp)

    # Graphique
    elements.append(Paragraph("Évolution de la valorisation", sous_titre))
    elements.append(_graphique_pdf(resultat, 26 * cm, 7 * cm))

    # Tableau annuel
    elements.append(Paragraph("Tableau annuel", sous_titre))
    en_tete = ["Année", "Date", "Valeur début", "Versements", "Rachats", "Frais", "PS", "Coupons", "Valeur fin", "Perf.", "Plus-value"]
    corps = [en_tete]
    for l in resultat.lignes:
        corps.append(
            [
                str(l.annee),
                formater_date(l.date_fin),
                formater_euros(l.valeur_debut),
                formater_euros(l.versements),
                formater_euros(l.rachats),
                formater_euros(l.frais),
                formater_euros(l.prelevements_sociaux),
                formater_euros(l.coupons),
                formater_euros(l.valeur_fin),
                formater_pourcentage(l.performance_nette),
                formater_euros(l.plus_value_nette),
            ]
        )
    style_tab = TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#" + COULEUR_ENTETE)),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 7.5),
            ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
            ("ALIGN", (0, 0), (-1, 0), "CENTER"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#" + COULEUR_BANDE)]),
            ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#C8D0DA")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
        ]
    )
    t = Table(corps, repeatRows=1)
    t.setStyle(style_tab)
    elements.append(t)

    # Répartition par support
    idents = list(derniere.repartition.keys())
    if len(idents) > 1:
        elements.append(Paragraph("Répartition par support en fin d'année", sous_titre))
        rep = [["Année"] + [resultat.libelles_supports.get(i, i) for i in idents] + ["Total"]]
        for l in resultat.lignes:
            rep.append([str(l.annee)] + [formater_euros(l.repartition.get(i, 0.0)) for i in idents] + [formater_euros(l.valeur_fin)])
        t_rep = Table(rep, repeatRows=1)
        t_rep.setStyle(style_tab)
        elements.append(t_rep)

    if resultat.evenements:
        elements.append(Paragraph("Événements sur les produits structurés", sous_titre))
        for e in resultat.evenements:
            elements.append(Paragraph(f"- {e}", normal))

    if monte_carlo is not None:
        elements.append(Paragraph(f"Distribution Monte Carlo ({monte_carlo.nombre_simulations} simulations)", sous_titre))
        mc = [["Année", "P5", "P25", "Médiane", "P75", "P95", "Moyenne"]]
        for d in monte_carlo.distributions:
            mc.append([str(d.annee)] + [formater_euros(v) for v in (d.p5, d.p25, d.mediane, d.p75, d.p95, d.moyenne)])
        t_mc = Table(mc, repeatRows=1)
        t_mc.setStyle(style_tab)
        elements.append(t_mc)
        elements.append(
            Paragraph(
                f"Probabilité que la valeur au terme augmentée des rachats soit inférieure aux versements : "
                f"{formater_pourcentage(monte_carlo.probabilite_perte, 1)}.",
                normal,
            )
        )

    elements.append(Spacer(1, 8))
    elements.append(
        Paragraph(
            "Document de simulation à caractère indicatif et non contractuel. Les performances passées ne "
            "préjugent pas des performances futures. Les hypothèses de rendement ne constituent pas une "
            "garantie. Les supports en unités de compte et les produits structurés présentent un risque de "
            "perte en capital. Fiscalité selon la réglementation en vigueur à la date d'édition, susceptible "
            "d'évolution.",
            petit,
        )
    )
    doc.build(elements)
    return tampon.getvalue()


def dataframe_synthese(resultat: ResultatProjection):
    """Tableau pandas de la synthèse annuelle avec une colonne par support (pour l'interface)."""
    import pandas as pd

    df = pd.DataFrame(resultat.vers_lignes())
    renommage: Dict[str, str] = {k: v for k, v in resultat.libelles_supports.items() if k in df.columns}
    return df.rename(columns=renommage)
