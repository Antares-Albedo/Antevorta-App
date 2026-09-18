/**
 * export.js : export Excel (SheetJS) et synthèse client PDF (jsPDF).
 *
 * Les bibliothèques sont reçues en paramètre (globaux XLSX et jspdf chargés
 * via CDN par index.html) : ce module ne touche pas au DOM et retourne des
 * objets prêts à être téléchargés par l'interface.
 */

import { formaterEuros, formaterPourcentage, formaterDate } from './format.js';

/**
 * Classeur Excel complet.
 * @param {object} resultat résultat de projeter()
 * @param {object} config configuration
 * @param {object} XLSX global SheetJS
 * @returns {ArrayBuffer} contenu .xlsx
 */
export function construireClasseur(resultat, config, XLSX) {
  const wb = XLSX.utils.book_new();
  const supports = resultat.supports;

  const lignes = resultat.lignes.map((l) => {
    const base = {
      'Année': l.annee,
      'Valeur début (€)': arrondi(l.valeurDebut),
      'Versements bruts (€)': arrondi(l.versementsBruts),
      'Rachats bruts (€)': arrondi(l.rachatsBruts),
      'Rachats nets (€)': arrondi(l.rachatsNets),
      'Frais sur versement (€)': arrondi(l.frais.versement),
      'Frais d\'arbitrage (€)': arrondi(l.frais.arbitrage),
      'Frais de gestion euros (€)': arrondi(l.frais.gestionFondsEuros),
      'Frais de gestion UC (€)': arrondi(l.frais.gestionUC + l.frais.gestionStructure),
      'Prélèvements sociaux fil de l\'eau (€)': arrondi(l.prelevementsSociaux),
      'Impôt sur rachats (€)': arrondi(l.impots),
      'PS sur rachats (€)': arrondi(l.prelevementsSociauxRachats),
      'Coupons structurés (€)': arrondi(l.coupons),
      'Part UC moyenne (%)': arrondi(l.partUC * 100, 2),
      'Taux fonds euros (%)': arrondi(l.tauxFondsEuros * 100, 2),
      'Tranche barème': l.trancheBareme,
      'Encours avance (€)': l.avance ? arrondi(l.avance.totalDu) : 0,
      'Valeur fin (€)': arrondi(l.valeurFin),
      'Performance brute (%)': arrondi(l.performanceBrute * 100, 2),
      'Performance nette (%)': arrondi(l.performanceNette * 100, 2),
      'Cumul versements (€)': arrondi(l.cumulVersements),
      'Cumul rachats (€)': arrondi(l.cumulRachats),
      'Plus-value nette (€)': arrondi(l.plusValueNette),
    };
    for (const s of supports) base[`${s.libelle} (€)`] = arrondi(l.repartition[s.id]);
    return base;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), 'Projection');

  if (resultat.rachats.length) {
    const rachats = resultat.rachats.map((r) => ({
      'Année': r.annee,
      'Rachat brut (€)': arrondi(r.montantRachat),
      'Quote-part de gains (€)': arrondi(r.quotePartGains),
      'Abattement consommé (€)': arrondi(r.abattementUtilise),
      'Impôt forfaitaire (€)': arrondi(r.impotForfaitaire.total),
      'Impôt au barème (€)': arrondi(r.impotBareme),
      'Option retenue': r.optionRetenue === 'bareme' ? 'Barème progressif' : 'Prélèvement forfaitaire',
      'Acompte assureur (€)': arrondi(r.acompte),
      'Impôt définitif (€)': arrondi(r.impotDefinitif),
      'Régularisation (€)': arrondi(r.regularisation),
      'Prélèvements sociaux (€)': arrondi(r.prelevementsSociaux),
      'Net perçu (€)': arrondi(r.montantNet),
      'Taux effectif sur gains (%)': arrondi(r.tauxEffectif * 100, 2),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rachats), 'Rachats');
  }

  if (resultat.avance.lignes.length) {
    const avance = resultat.avance.lignes.map((a) => ({
      'Année': a.annee,
      'Capital dû début (€)': arrondi(a.capitalDebut),
      'Intérêts (€)': arrondi(a.interets),
      'Intérêts payés (€)': arrondi(a.interetsPayes),
      'Remboursement capital (€)': arrondi(a.remboursementCapital),
      'Total dû fin (€)': arrondi(a.totalDu),
      'Valeur de rachat (€)': arrondi(a.valeurRachat),
      'Ratio dette / valeur (%)': arrondi(a.ratio * 100, 1),
      'Différentiel net (€)': arrondi(a.differentiel || 0),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(avance), 'Avance');
  }

  if (resultat.arbitrages.length) {
    const arb = resultat.arbitrages.map((m) => ({
      'Année': m.annee, 'Motif': m.motif, 'Source': m.source, 'Destination': m.destination,
      'Montant (€)': arrondi(m.montant), 'Frais (€)': arrondi(m.frais),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(arb), 'Arbitrages');
  }

  const hyp = hypotheses(config, resultat).map(([k, v]) => ({ 'Paramètre': k, 'Valeur': v }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hyp), 'Hypothèses');

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

function arrondi(v, decimales = 0) {
  const f = 10 ** decimales;
  return Math.round((Number(v) || 0) * f) / f;
}

/**
 * Liste des hypothèses lisibles par le client.
 * @param {object} config
 * @param {object} resultat
 * @returns {Array<[string, string]>}
 */
export function hypotheses(config, resultat) {
  const c = config.contrat;
  const f = config.frais;
  const lignes = [
    ['Contrat', c.nom],
    ['Versement initial', formaterEuros(c.montantInitial)],
    ['Durée de projection', `${c.dureeProjection} ans`],
    ['Antériorité fiscale', `${c.anterioriteFiscale || 0} ans`],
  ];
  if (c.dateSouscription) lignes.push(['Date de souscription', formaterDate(c.dateSouscription)]);
  for (const s of c.supports) {
    let detail = '';
    if (s.type === 'fondsEuros') detail = 'taux selon barème à paliers';
    else if (s.type === 'uc') detail = `rendement ${formaterPourcentage(s.parametres.rendementMoyen)}, volatilité ${formaterPourcentage(s.parametres.volatilite, 0)}`;
    else detail = `${s.parametres.sousJacent}, coupon ${formaterPourcentage(s.parametres.niveauCoupon)}, protection ${formaterPourcentage(s.parametres.barriereProtection, 0)}, maturité ${s.parametres.maturite} ans`;
    lignes.push([`Support ${s.libelle}`, `${formaterPourcentage(s.allocation, 0)} : ${detail}`]);
  }
  for (const v of c.versementsProgrammes) lignes.push(['Versement programmé', `${formaterEuros(v.montant)} ${v.periodicite}, années ${v.anneeDebut} à ${v.anneeFin || c.dureeProjection}`]);
  for (const v of c.versementsComplementaires) lignes.push(['Versement complémentaire', `${formaterEuros(v.montant)} en année ${v.annee}`]);
  for (const r of c.rachatsProgrammes) lignes.push(['Rachat programmé', `${r.montant !== null && r.montant !== undefined ? formaterEuros(r.montant) : formaterPourcentage(r.pourcentage)} ${r.periodicite}, années ${r.anneeDebut} à ${r.anneeFin || c.dureeProjection}`]);
  lignes.push(['Frais sur versements', `initial ${formaterPourcentage(f.versementInitial)}, programmés ${formaterPourcentage(f.versementsProgrammes)}, complémentaires ${formaterPourcentage(f.versementsComplementaires)}`]);
  lignes.push(['Frais de gestion', `fonds euros ${formaterPourcentage(f.gestionFondsEuros)}, UC ${formaterPourcentage(f.gestionUC)}`]);
  lignes.push(['Frais d\'arbitrage', formaterPourcentage(f.arbitrage)]);
  lignes.push(['Scénario fonds euros', `${config.scenario.tendance}${config.scenario.variationAnnuelle ? ` ${formaterPourcentage(config.scenario.variationAnnuelle)} par an` : ''}, plancher ${formaterPourcentage(config.scenario.tauxPlancher)}`]);
  if (config.avance.actif) lignes.push(['Avance', `${formaterEuros(config.avance.montant)} en année ${config.avance.anneeMiseEnPlace}, ${config.avance.duree} ans à ${formaterPourcentage(config.avance.tauxInteret)}`]);
  lignes.push(['Fiscalité', `${config.fiscal.situation === 'couple' ? 'couple' : 'personne seule'}, option ${config.fiscal.option === 'bareme' ? 'barème progressif' : 'prélèvement forfaitaire'}`]);
  if (resultat) lignes.push(['Valeur au terme', formaterEuros(resultat.synthese.valeurTerme)]);
  return lignes;
}

/**
 * Synthèse client PDF de deux pages.
 * @param {object} resultat
 * @param {object} config
 * @param {string|null} imageGraphique dataURL PNG du graphique (ou null)
 * @param {object} jsPDFClass constructeur jsPDF (window.jspdf.jsPDF)
 * @param {object} [options] { conseiller, mentions }
 * @returns {object} document jsPDF
 */
export function construirePDF(resultat, config, imageGraphique, jsPDFClass, options = {}) {
  const doc = new jsPDFClass({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const bleu = [30, 78, 121];
  const gris = [90, 100, 112];
  const largeur = 210;
  const marge = 15;
  let y = 20;

  const texte = (t, x, yy, opts = {}) => {
    doc.setFont('helvetica', opts.gras ? 'bold' : 'normal');
    doc.setFontSize(opts.taille || 10);
    doc.setTextColor(...(opts.couleur || [30, 36, 48]));
    doc.text(t, x, yy, { align: opts.align || 'left', maxWidth: opts.maxWidth });
  };

  // Page 1 : titre, chiffres clés, hypothèses, graphique
  doc.setFillColor(...bleu);
  doc.rect(0, 0, largeur, 14, 'F');
  texte(options.conseiller || 'Simulation de projection', marge, 9, { taille: 10, couleur: [255, 255, 255], gras: true });
  texte(`Édité le ${formaterDate(new Date())}`, largeur - marge, 9, { taille: 9, couleur: [255, 255, 255], align: 'right' });
  y = 26;
  texte(`Projection du contrat ${config.contrat.nom}`, marge, y, { taille: 16, gras: true, couleur: bleu });
  y += 10;

  const s = resultat.synthese;
  const cles = [
    ['Versements cumulés', formaterEuros(s.cumulVersements + s.valeurOuverture)],
    ['Rachats cumulés', formaterEuros(s.cumulRachats)],
    ['Valeur au terme', formaterEuros(s.valeurTerme)],
    ['Plus-value nette', formaterEuros(s.plusValueNette)],
  ];
  const lc = (largeur - 2 * marge) / cles.length;
  cles.forEach(([k, v], i) => {
    const x = marge + i * lc;
    doc.setFillColor(238, 242, 247);
    doc.roundedRect(x + 1, y, lc - 2, 18, 2, 2, 'F');
    texte(k, x + lc / 2, y + 6, { taille: 8, couleur: gris, align: 'center' });
    texte(v, x + lc / 2, y + 13.5, { taille: 12, gras: true, align: 'center' });
  });
  y += 26;

  texte('Hypothèses retenues', marge, y, { taille: 12, gras: true, couleur: bleu });
  y += 6;
  for (const [k, v] of hypotheses(config, null)) {
    texte(k, marge, y, { taille: 8.5, gras: true });
    texte(String(v), marge + 48, y, { taille: 8.5, maxWidth: largeur - marge * 2 - 48 });
    const lignes = doc.splitTextToSize(String(v), largeur - marge * 2 - 48).length;
    y += 4.5 * Math.max(lignes, 1);
    if (y > 200) break;
  }
  y += 4;
  if (imageGraphique) {
    texte('Évolution de la valorisation', marge, y, { taille: 12, gras: true, couleur: bleu });
    y += 4;
    const hauteur = Math.min(80, 285 - y - 10);
    doc.addImage(imageGraphique, 'PNG', marge, y, largeur - 2 * marge, hauteur);
  }

  // Page 2 : tableau annuel simplifié et mentions
  doc.addPage();
  doc.setFillColor(...bleu);
  doc.rect(0, 0, largeur, 14, 'F');
  texte(`Tableau annuel simplifié : ${config.contrat.nom}`, marge, 9, { taille: 10, couleur: [255, 255, 255], gras: true });
  y = 24;
  const colonnes = ['Année', 'Versements', 'Rachats', 'Frais', 'Taux fonds €', 'Part UC', 'Valeur fin', 'Perf. nette'];
  const lcol = [14, 26, 24, 22, 22, 18, 30, 22];
  let x = marge;
  doc.setFillColor(...bleu);
  doc.rect(marge, y - 5, lcol.reduce((a, b) => a + b, 0), 7, 'F');
  colonnes.forEach((c, i) => {
    texte(c, x + lcol[i] - 1, y, { taille: 8, gras: true, couleur: [255, 255, 255], align: 'right' });
    x += lcol[i];
  });
  y += 6;
  resultat.lignes.forEach((l, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(238, 242, 247);
      doc.rect(marge, y - 4, lcol.reduce((a, b) => a + b, 0), 5.5, 'F');
    }
    const valeurs = [
      String(l.annee), formaterEuros(l.versementsBruts), formaterEuros(l.rachatsBruts), formaterEuros(l.frais.total),
      formaterPourcentage(l.tauxFondsEuros), formaterPourcentage(l.partUC, 0), formaterEuros(l.valeurFin), formaterPourcentage(l.performanceNette),
    ];
    x = marge;
    valeurs.forEach((v, i) => {
      texte(v, x + lcol[i] - 1, y, { taille: 8, align: 'right' });
      x += lcol[i];
    });
    y += 5.5;
    if (y > 250 && idx < resultat.lignes.length - 1) {
      doc.addPage();
      y = 20;
    }
  });

  y += 6;
  if (resultat.signalements.length) {
    texte('Points d\'attention', marge, y, { taille: 11, gras: true, couleur: bleu });
    y += 5;
    for (const sg of resultat.signalements.slice(0, 8)) {
      const t = `${sg.annee ? `Année ${sg.annee} : ` : ''}${sg.message}`;
      texte(t, marge, y, { taille: 8, maxWidth: largeur - 2 * marge });
      y += 4.5 * doc.splitTextToSize(t, largeur - 2 * marge).length;
    }
    y += 4;
  }
  const mentions = options.mentions || 'Document de simulation à caractère indicatif et non contractuel, établi sur la base des hypothèses retenues avec le conseiller. Les performances passées ne préjugent pas des performances à venir. Les supports en unités de compte et les produits structurés présentent un risque de perte en capital. Le taux du fonds en euros dépend du barème de l\'assureur, révisable chaque année. Fiscalité selon la réglementation en vigueur à la date d\'édition, susceptible d\'évolution. L\'option pour le barème progressif s\'applique à l\'ensemble des revenus du patrimoine du foyer.';
  doc.setDrawColor(200, 208, 218);
  doc.line(marge, Math.max(y, 262), largeur - marge, Math.max(y, 262));
  texte(mentions, marge, Math.max(y, 262) + 5, { taille: 7, couleur: gris, maxWidth: largeur - 2 * marge });
  return doc;
}
