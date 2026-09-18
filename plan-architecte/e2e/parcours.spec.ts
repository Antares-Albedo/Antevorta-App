import { expect, test, type Page } from '@playwright/test'

async function ouvrirApplication(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('accueil')).toBeVisible()
}

async function fermerGuideSiPresent(page: Page) {
  const guide = page.getByTestId('guide')
  if (await guide.isVisible({ timeout: 1500 }).catch(() => false)) {
    await page.getByTestId('guide-suivant').click()
    await page.getByTestId('guide-suivant').click()
    await page.getByTestId('guide-suivant').click()
    await page.getByTestId('guide-terminer').click()
  }
  await expect(guide).toBeHidden()
}

test.describe('Plan Architecte 2D/3D', () => {
  test("charge l'exemple T3 et affiche des surfaces exactes", async ({ page }) => {
    await ouvrirApplication(page)
    await page.getByTestId('accueil-exemple').click()
    await fermerGuideSiPresent(page)
    await expect(page.getByTestId('titre-projet')).toHaveText('Exemple T3')
    // 4,40 + 23,25 + 9,99 + 8,69 + 11,52 + 10,24 + 5,04 + 1,50 = 74,63
    await expect(page.getByTestId('total-general')).toHaveText('74,63 m²')
    await expect(page.getByTestId('total-habitable')).toHaveText('74,63 m²')
    await expect(page.getByTestId('surface-valeur-ex-sejour')).toHaveText('23,25')
    // Le plan porte les libellés et le cartouche
    const svg = page.getByTestId('plan-svg')
    await expect(svg).toBeVisible()
    await expect(svg.locator('[data-room-label="ex-sejour"]')).toContainText('23,25 m²')
    await expect(svg.locator('[data-layer="cartouche"]')).toContainText('Plan indicatif non contractuel')
    // Sélection depuis le panneau des surfaces : mise en surbrillance en 2D
    await page.getByTestId('surface-ex-cuisine').click()
    await expect(svg.locator('[data-room-id="ex-cuisine"]')).toHaveAttribute('stroke', '#2563eb')
    // Glisser-déposer d'une pièce sur le plan : passage en mode manuel et déplacement effectif
    const wc = svg.locator('[data-room-id="ex-wc"]')
    const box = await wc.boundingBox()
    if (!box) throw new Error('WC introuvable sur le plan')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 - 40, { steps: 8 })
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 80, { steps: 8 })
    await page.mouse.up()
    await page.getByTestId('bouton-parametres').click()
    await expect(page.getByTestId('champ-agencement')).toHaveValue('manuel')
    const boxApres = await wc.boundingBox()
    expect(boxApres && Math.abs(boxApres.x - box.x) > 20).toBeTruthy()
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('champ-agencement')).toHaveValue('auto')
    // Exports du plan
    await page.getByTestId('bouton-exporter').click()
    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Plan en PDF (A4/A3)' }).click()])
    expect(pdf.suggestedFilename()).toBe('Exemple-T3-plan.pdf')
    await page.getByTestId('bouton-exporter').click()
    const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Plan en PNG' }).click()])
    expect(png.suggestedFilename()).toBe('Exemple-T3-plan.png')
    // Vue 3D
    await page.getByTestId('onglet-3d').click()
    await expect(page.locator('[data-testid="vue-3d"] canvas')).toBeVisible({ timeout: 20000 })
    await page.getByRole('button', { name: 'Maquette ouverte' }).click()
    await page.getByRole('button', { name: 'Rotation auto' }).click()
    await page.getByRole('button', { name: 'Dessus' }).click()
    await expect(page.locator('[data-testid="vue-3d"] canvas')).toBeVisible()
    await page.getByTestId('bouton-exporter').click()
    const [capture] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Capture PNG de la vue 3D' }).click()])
    expect(capture.suggestedFilename()).toBe('Exemple-T3-3d.png')
    // Vue partagée
    await page.getByTestId('onglet-partage').click()
    await expect(page.getByTestId('plan-svg')).toBeVisible()
    await expect(page.locator('[data-testid="vue-3d"] canvas')).toBeVisible({ timeout: 20000 })
  })

  test('saisie de 5 pièces dont une en L et un pan coupé, avec ouvertures', async ({ page }) => {
    await ouvrirApplication(page)
    await page.getByTestId('accueil-nouveau').click()
    await fermerGuideSiPresent(page)
    await page.getByTestId('champ-nom-projet').fill('Maison test')
    await expect(page.getByTestId('titre-projet')).toHaveText('Maison test')

    const ajouter = async (type: string) => {
      await page.getByTestId('type-ajout').selectOption(type)
      await page.getByTestId('ajouter-piece').click()
    }

    // 1. Séjour en L (modèle prédéfini)
    await ajouter('sejour')
    await expect(page.getByTestId('formulaire-piece')).toBeVisible()
    await page.getByRole('radio', { name: 'Polygone' }).click()
    await page.getByRole('button', { name: 'Pièce en L' }).click()
    await expect(page.getByTestId('ecart-fermeture')).toContainText('0,0 cm')
    // 5x4 moins 2x2 = 16 m²
    await expect(page.getByTestId('total-general')).toHaveText('16,00 m²')
    await page.getByTestId('ajouter-baie').click()
    await page.getByTestId('ajouter-porte').click()
    await expect(page.getByTestId('ouverture-1')).toBeVisible()

    // 2. Cuisine avec pan coupé
    await ajouter('cuisine')
    await page.getByRole('radio', { name: 'Polygone' }).click()
    await page.getByRole('button', { name: 'Pan coupé à 45°' }).click()
    await page.getByTestId('ajouter-fenetre').click()
    // 16 + 11,5 (à l'arrondi du pan coupé près)
    await expect(page.getByTestId('total-general')).toHaveText(/27,(49|50) m²/)

    // 3. Chambre rectangulaire avec dimensions personnalisées
    await ajouter('chambre')
    await page.getByTestId('champ-longueur').fill('4')
    await page.getByTestId('champ-largeur').fill('3,25')
    await expect(page.getByTestId('total-general')).toHaveText(/40,(49|50) m²/)
    await page.getByTestId('ajouter-fenetre').click()
    await page.getByTestId('ajouter-porte').click()

    // 4. Salle de bain, 5. WC
    await ajouter('salle_de_bain')
    await page.getByTestId('ajouter-porte').click()
    await ajouter('wc')
    await page.getByTestId('ajouter-porte').click()
    // 40,5 + 5 + 1,35 = 46,85
    await expect(page.getByTestId('total-general')).toHaveText(/46,8[45] m²/)
    await expect(page.getByTestId('panneau-surfaces').locator('tbody tr')).toHaveCount(5)

    // Contrôle de cohérence : ouverture plus large que le côté
    const largeurOuverture = page.getByTestId('ouverture-0-largeur')
    await largeurOuverture.fill('3')
    await expect(page.getByTestId('ouverture-0').getByRole('alert')).toContainText('plus large que le côté')
    await largeurOuverture.fill('0,7')
    await expect(page.getByTestId('ouverture-0').getByRole('alert')).toHaveCount(0)

    // Le plan et la 3D suivent : 5 sols, libellés présents
    const svg = page.getByTestId('plan-svg')
    await expect(svg.locator('[data-layer="sols"] path')).toHaveCount(5)
    await expect(svg.locator('[data-layer="ouvertures"] g[data-opening-id]')).toHaveCount(7)

    // Annuler / rétablir au clavier
    await page.getByTestId('piece-4').click() // replie le WC
    await page.getByTestId('piece-4').click() // le sélectionne à nouveau
    await page.keyboard.press('Escape')
    await page.getByTestId('piece-4').click()
    await page.getByTestId('supprimer-piece').click()
    await expect(page.getByTestId('panneau-surfaces').locator('tbody tr')).toHaveCount(4)
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('panneau-surfaces').locator('tbody tr')).toHaveCount(5)
    await page.keyboard.press('Control+y')
    await expect(page.getByTestId('panneau-surfaces').locator('tbody tr')).toHaveCount(4)
    await page.getByTestId('annuler').click()
    await expect(page.getByTestId('panneau-surfaces').locator('tbody tr')).toHaveCount(5)

    // Sauvegarde automatique : rechargement sans perte
    await page.reload()
    await fermerGuideSiPresent(page)
    await expect(page.getByTestId('titre-projet')).toHaveText('Maison test')
    await expect(page.getByTestId('panneau-surfaces').locator('tbody tr')).toHaveCount(5)

    // Export JSON
    await page.getByTestId('bouton-exporter').click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Projet en JSON' }).click()])
    expect(download.suggestedFilename()).toBe('Maison-test.json')

    // Export SVG
    await page.getByTestId('bouton-exporter').click()
    const [svgDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Plan en SVG' }).click()])
    expect(svgDownload.suggestedFilename()).toBe('Maison-test-plan.svg')
  })

  test('fermeture automatique du polygone et blocage au-delà de 5 cm', async ({ page }) => {
    await ouvrirApplication(page)
    await page.getByTestId('accueil-nouveau').click()
    await fermerGuideSiPresent(page)
    await page.getByTestId('type-ajout').selectOption('bureau')
    await page.getByTestId('ajouter-piece').click()
    await page.getByRole('radio', { name: 'Polygone' }).click()
    // Rectangle 3 x 2,5 : le dernier côté est erroné (1,5 m au lieu de 2,5 m)
    await page.getByTestId('cote-0-longueur').fill('3')
    await page.getByTestId('cote-1-longueur').fill('2,5')
    await page.getByTestId('cote-2-longueur').fill('3')
    await page.getByTestId('cote-3-longueur').fill('1,5')
    await expect(page.getByTestId('erreur-forme')).toContainText("n'est pas fermé")
    await expect(page.getByTestId('bouton-ajuster')).toHaveCount(0)
    await expect(page.getByTestId('total-general')).toHaveText('0,00 m²')
    // Écart de 3 cm : ajustement automatique proposé
    await page.getByTestId('cote-3-longueur').fill('2,47')
    await expect(page.getByTestId('ecart-fermeture')).toContainText('3,0 cm')
    await page.getByTestId('bouton-ajuster').click()
    await expect(page.getByTestId('ecart-fermeture')).toContainText('0,0 cm')
    await expect(page.getByTestId('total-general')).toHaveText('7,50 m²')
    // Angle incohérent
    await page.getByTestId('cote-1-angle').fill('80')
    await expect(page.getByTestId('erreur-forme')).toContainText('Angles incohérents')
  })

  test('gestion des projets : renommer, dupliquer, supprimer', async ({ page }) => {
    await ouvrirApplication(page)
    await page.getByTestId('accueil-exemple').click()
    await fermerGuideSiPresent(page)
    await page.getByTestId('bouton-projets').click()
    const dialogue = page.getByTestId('dialogue-projets')
    await expect(dialogue).toBeVisible()
    await dialogue.getByRole('button', { name: 'Dupliquer' }).first().click()
    await expect(dialogue.locator('li')).toHaveCount(2)
    await dialogue.getByRole('button', { name: 'Renommer' }).first().click()
    await dialogue.getByLabel('Nouveau nom').fill('Projet renommé')
    await dialogue.getByRole('button', { name: 'OK' }).click()
    await expect(dialogue).toContainText('Projet renommé')
    // Supprime la copie (première de la liste, la plus récente) et conserve le projet ouvert
    await dialogue.getByRole('button', { name: 'Supprimer' }).first().click()
    await dialogue.getByRole('button', { name: 'Confirmer' }).click()
    await expect(dialogue.locator('li')).toHaveCount(1)
    await expect(dialogue).not.toContainText('Projet renommé')
    await page.keyboard.press('Escape')
    await expect(dialogue).toBeHidden()
    await page.getByTestId('bouton-aide').click()
    await expect(page.getByTestId('aide')).toContainText('Raccourcis clavier')
  })

  test('tablette : panneau des surfaces repliable', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1100 })
    await ouvrirApplication(page)
    await page.getByTestId('accueil-exemple').click()
    await fermerGuideSiPresent(page)
    const barre = page.getByTestId('surfaces-tablette')
    await expect(barre).toContainText('74,63 m²')
    await barre.getByRole('button').first().click()
    await expect(barre.getByTestId('panneau-surfaces')).toBeVisible()
  })
})
