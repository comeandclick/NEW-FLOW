'use client'
// PDF des devis, factures et ordres de mission (15/10/2026) : logo et infos de l'entreprise (Paramètres > Entreprise),
// client, lignes, totaux HT / TVA / TTC, signature, conditions et mentions. Créé dans le navigateur avec jsPDF.
import type { jsPDF as JsPDF } from 'jspdf'
import { NOM_KIND, PRIORITES, entrepriseManque, statutDe, totaux, type Entreprise, type Fiche, type GDoc } from '@/lib/gestion'

// les polices standard du PDF ne connaissent pas les espaces fines de Intl : on les remplace
const net = (s: string) => s.replace(/[  ]/g, ' ')
const euro = (n: number) => net(new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0))
const jour = (d?: string | null) => (d ? net(new Date(d.length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('fr-FR')) : '')
const heure = (d?: string | null) => (d ? net(new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })) : '')

async function enDataUrl(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(url)).blob()
    const data = await new Promise<string>((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = ko; r.readAsDataURL(blob) })
    const dim = await new Promise<{ w: number; h: number }>((ok) => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok({ w: 1, h: 1 }); i.src = data })
    return { data, ...dim }
  } catch { return null }
}

export type ContextePdf = { entreprise: Entreprise; logoUrl?: string | null; client?: Fiche | null; nomMembre: (id?: string | null) => string; devisOrigine?: string | null }

export async function creerPdf(d: GDoc, ctx: ContextePdf): Promise<JsPDF> {
  const manque = entrepriseManque(ctx.entreprise)
  if (manque.length) throw new Error(`Infos de l’entreprise à compléter : ${manque.join(', ')}`)
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 15, e = ctx.entreprise
  const gris = [110, 110, 110] as const, noir = [17, 17, 17] as const
  let y = M

  // ── en-tête : logo + entreprise à gauche, titre du document à droite
  const logo = ctx.logoUrl ? await enDataUrl(ctx.logoUrl) : null
  if (logo) { const h = 18, w = Math.min(45, (logo.w / logo.h) * h); pdf.addImage(logo.data, logo.data.includes('image/png') ? 'PNG' : 'JPEG', M, y, w, h); y += h + 3 }
  pdf.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...noir).text(net(e.nom ?? ''), M, y + 4)
  pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...gris)
  const lignesEnt = [e.forme, e.adresse, `${e.cp ?? ''} ${e.ville ?? ''}`.trim(), e.tel && `Tél. ${e.tel}`, e.email, e.site, e.siret && `SIRET ${e.siret}`, e.tva_intra && `TVA ${e.tva_intra}`].filter(Boolean) as string[]
  lignesEnt.forEach((l, i) => pdf.text(net(l), M, y + 9 + i * 3.8))
  const basEnt = y + 9 + lignesEnt.length * 3.8

  const titre = d.kind === 'intervention' ? 'ORDRE DE MISSION' : NOM_KIND[d.kind].toUpperCase()
  pdf.setFont('helvetica', 'bold').setFontSize(20).setTextColor(...noir).text(titre, W - M, M + 6, { align: 'right' })
  pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...gris)
  const infos = [`N° ${d.number}`, `Date : ${jour(d.issued_at)}`,
    d.kind === 'devis' && d.due_at ? `Valable jusqu’au ${jour(d.due_at)}` : '',
    d.kind === 'facture' && d.due_at ? `Échéance : ${jour(d.due_at)}` : '',
    d.kind === 'intervention' && d.start_at ? `Prévue le ${heure(d.start_at)}` : '',
    d.kind === 'intervention' && d.intervention_type ? `Type : ${d.intervention_type}` : '',
    d.kind === 'intervention' ? `Priorité : ${PRIORITES.find((p) => p.v === d.priority)?.l ?? d.priority}` : '',
    ctx.devisOrigine ? `Réf. devis : ${ctx.devisOrigine}` : '', d.ref_externe ? `Réf. : ${d.ref_externe}` : ''].filter(Boolean)
  infos.forEach((l, i) => pdf.text(net(l), W - M, M + 13 + i * 4.2, { align: 'right' }))

  // ── bloc client
  y = Math.max(basEnt, M + 13 + infos.length * 4.2) + 6
  const c = ctx.client
  pdf.setDrawColor(225, 225, 225).setFillColor(248, 248, 248).roundedRect(W / 2, y, W / 2 - M, 30, 2, 2, 'FD')
  pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...gris).text(d.kind === 'intervention' ? 'CLIENT / LIEU D’INTERVENTION' : 'CLIENT', W / 2 + 4, y + 5)
  pdf.setFontSize(10.5).setTextColor(...noir).text(net(c?.company || c?.name || '—'), W / 2 + 4, y + 11)
  pdf.setFont('helvetica', 'normal').setFontSize(8.8).setTextColor(60, 60, 60)
  const lc = [c?.company && c?.name ? c.name : '', d.address || c?.address || '', [c?.zip, c?.city].filter(Boolean).join(' '), c?.phone ?? '', c?.email ?? '', c?.siret ? `SIRET ${c.siret}` : ''].filter(Boolean)
  lc.slice(0, 4).forEach((l, i) => pdf.text(net(l), W / 2 + 4, y + 16 + i * 3.8))
  y += 36

  if (d.title) { pdf.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...noir).text(net(d.title), M, y); y += 6 }
  if (d.travaux) {
    pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...gris).text(d.kind === 'intervention' ? 'TRAVAUX À RÉALISER' : 'DESCRIPTION DES TRAVAUX', M, y); y += 4
    pdf.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...noir)
    const t = pdf.splitTextToSize(net(d.travaux), W - 2 * M); pdf.text(t, M, y); y += t.length * 4.3 + 3
  }
  if (d.kind === 'intervention' && d.assigned_to?.length) {
    pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(60, 60, 60).text(net(`Intervenant(s) : ${d.assigned_to.map(ctx.nomMembre).join(', ')}`), M, y); y += 6
  }

  // ── lignes
  if (d.lines.length) {
    const k = 1 - (Number(d.discount) || 0) / 100
    autoTable(pdf, {
      startY: y, margin: { left: M, right: M },
      head: [['Réf.', 'Désignation', 'Qté', 'Unité', 'PU HT', 'TVA', 'Total HT']],
      body: d.lines.map((l) => [net(l.ref ?? ''), net(l.label), String(l.qty), net(l.unit ?? ''), euro(l.price_ht), `${l.tva} %`, euro(l.qty * l.price_ht * k)]),
      styles: { font: 'helvetica', fontSize: 8.8, cellPadding: 2.2, textColor: [30, 30, 30] },
      headStyles: { fillColor: [24, 24, 27], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 20 }, 2: { halign: 'right', cellWidth: 12 }, 3: { cellWidth: 14 }, 4: { halign: 'right', cellWidth: 24 }, 5: { halign: 'right', cellWidth: 14 }, 6: { halign: 'right', cellWidth: 26 } },
      alternateRowStyles: { fillColor: [250, 250, 250] },
    })
    y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5

    // ── totaux
    const t = totaux(d.lines, d.discount)
    const rows: [string, string, boolean?][] = []
    if (Number(d.discount)) rows.push([`Remise ${d.discount} %`, 'incluse'])
    rows.push(['Total HT', euro(t.ht)])
    for (const [taux, v] of Object.entries(t.parTaux)) if (Number(taux)) rows.push([`TVA ${taux} %`, euro(v.tva)])
    rows.push(['Total TTC', euro(t.ttc), true])
    if (y + rows.length * 6 > 270) { pdf.addPage(); y = M }
    rows.forEach(([l, v, fort], i) => {
      const yy = y + i * 6
      if (fort) { pdf.setFillColor(24, 24, 27).rect(W - M - 70, yy - 4.3, 70, 6.6, 'F'); pdf.setTextColor(255, 255, 255).setFont('helvetica', 'bold') } else pdf.setTextColor(...noir).setFont('helvetica', 'normal')
      pdf.setFontSize(9.5).text(l, W - M - 67, yy).text(v, W - M - 3, yy, { align: 'right' })
    })
    y += rows.length * 6 + 4
  }

  // ── signature / bon pour accord
  if (y > 225) { pdf.addPage(); y = M }
  pdf.setTextColor(...noir)
  if (d.kind === 'devis' || d.kind === 'intervention') {
    const bx = W - M - 80
    pdf.setDrawColor(200, 200, 200).roundedRect(bx, y, 80, 36, 2, 2)
    pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...gris).text(d.kind === 'devis' ? 'BON POUR ACCORD, DATE ET SIGNATURE' : 'SIGNATURE DU CLIENT', bx + 3, y + 5)
    if (d.signature) { try { pdf.addImage(d.signature, 'PNG', bx + 5, y + 7, 55, 20) } catch { /* image illisible */ } }
    pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(60, 60, 60)
    if (d.signer_name) pdf.text(net(`${d.signer_name}${d.signed_at ? ` · ${heure(d.signed_at)}` : ''}`), bx + 3, y + 33)
    if (d.kind === 'devis' && (d.status === 'accepte' || d.status === 'refuse')) {
      pdf.setFont('helvetica', 'bold').setTextColor(d.status === 'accepte' ? 22 : 190, d.status === 'accepte' ? 140 : 30, d.status === 'accepte' ? 70 : 40).text(statutDe('devis', d.status).l.toUpperCase(), M, y + 6)
    }
    if (d.kind === 'intervention' && d.closed_at) pdf.setFont('helvetica', 'bold').setTextColor(22, 140, 70).text(net(`Intervention clôturée le ${heure(d.closed_at)}`), M, y + 6)
    y += 42
  }

  // ── pied : conditions, banque, mentions (sur chaque page)
  const pied = [e.conditions && d.kind !== 'intervention' ? e.conditions : '', d.kind === 'facture' && e.iban ? `Règlement par virement : IBAN ${e.iban}${e.bic ? ` · BIC ${e.bic}` : ''}` : '', e.mentions ?? '',
    [e.nom, e.forme, e.capital && `capital ${e.capital}`, e.rcs, e.siret && `SIRET ${e.siret}`].filter(Boolean).join(' · ')].filter(Boolean).map(net)
  const n = pdf.getNumberOfPages()
  for (let p = 1; p <= n; p++) {
    pdf.setPage(p)
    pdf.setFont('helvetica', 'normal').setFontSize(7.2).setTextColor(...gris)
    const texte = pdf.splitTextToSize(pied.join('\n'), W - 2 * M) as string[]
    const top = 297 - 8 - texte.length * 3
    pdf.setDrawColor(230, 230, 230).line(M, top - 3, W - M, top - 3)
    pdf.text(texte, M, top)
    pdf.text(`${p} / ${n}`, W - M, 292, { align: 'right' })
  }
  return pdf
}

export const nomFichier = (d: GDoc) => `${d.kind === 'intervention' ? 'Ordre-de-mission' : NOM_KIND[d.kind].replace(/\s/g, '-')}-${d.number}.pdf`

export async function telechargerPdf(d: GDoc, ctx: ContextePdf) { (await creerPdf(d, ctx)).save(nomFichier(d)) }
export async function imprimerPdf(d: GDoc, ctx: ContextePdf) {
  const pdf = await creerPdf(d, ctx)
  pdf.autoPrint()
  const url = URL.createObjectURL(pdf.output('blob'))
  const w = window.open(url, '_blank')
  if (!w) pdf.save(nomFichier(d))
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
export async function pdfBase64(d: GDoc, ctx: ContextePdf) { return (await creerPdf(d, ctx)).output('datauristring').split(',')[1] }
