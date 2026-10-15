import { describe, expect, it } from 'vitest'
import { devinerColonnes, preparer, dateIso, nombre, statutImport } from '@/lib/gestion-import'
import { prochainNumero, totaux } from '@/lib/gestion'
import { parseCsv } from '@/lib/csv'

const ctx = { wsId: 'ws', userId: 'u', fiches: [{ id: 'c1', name: 'Jean Dupont', company: null, ref_externe: 'C001' }], articles: [], numeros: { devis: [], facture: [], intervention: ['OI-7'], achat: [] }, membres: [{ user_id: 'm1', nom: 'Karim Benali' }] }

describe('gestion', () => {
  it('calcule HT, TVA par taux et TTC avec remise', () => {
    const t = totaux([{ label: 'a', qty: 2, price_ht: 100, tva: 20 }, { label: 'b', qty: 1, price_ht: 50, tva: 10 }], 10)
    expect(t).toMatchObject({ ht: 225, tva: 40.5, ttc: 265.5 })
    expect(t.parTaux['10'].tva).toBeCloseTo(4.5)
  })
  it('numérote à la suite', () => {
    expect(prochainNumero('devis', ['DE-2026-0009', 'DE-2025-0040'], 2026)).toBe('DE-2026-0010')
  })
  it('lit les nombres et dates français', () => {
    expect(nombre('1 068,50 €')).toBe(1068.5)
    expect(dateIso('12/10/2026 14:30')).toBe('2026-10-12')
    expect(statutImport('devis', 'Accepté')).toBe('accepte')
    expect(statutImport('intervention', 'Clôturée')).toBe('terminee')
  })
  it('reconnaît un export clients Sphinx et ignore les doublons', () => {
    const data = parseCsv('Code client;Raison sociale;Nom;Prénom;Adresse 1;CP;Ville;Portable;E-mail\nC001;;Dupont;Jean;1 rue;75011;Paris;06;j@x.fr\nC002;Boulangerie Petit;Petit;Marc;2 rue;69001;Lyon;07;m@x.fr')
    const col = devinerColonnes('clients', data[0])
    expect(col).toMatchObject({ ref_externe: 0, company: 1, name: 2, prenom: 3, zip: 5, city: 6, phone: 7, email: 8 })
    const r = preparer('clients', data, col, ctx)
    expect(r.ignores).toBe(1)
    expect(r.rows[0]).toMatchObject({ name: 'Marc Petit', company: 'Boulangerie Petit', kind: 'pro', ref_externe: 'C002' })
  })
  it('importe des interventions, relie client et technicien, crée les clients manquants', () => {
    const data = parseCsv('N° OI;Code client;Client;Date intervention;Technicien;Type intervention;Etat;Montant HT\nOI-7;C001;Jean Dupont;01/10/2026;Karim;Dépannage;Terminé;100\nOI-8;C099;Mme Leroy;03/10/2026 08:30;Karim;Installation;Planifiée;250,00')
    const col = devinerColonnes('intervention', data[0])
    const r = preparer('intervention', data, col, ctx)
    expect(r.ignores).toBe(1)
    expect(r.rows[0]).toMatchObject({ number: 'OI-8', contact_id: '@C099', intervention_type: 'Installation', status: 'planifiee', assigned_to: ['m1'], total_ht: 250 })
    expect(r.clientsACreer).toEqual([{ cle: 'C099', name: 'Mme Leroy', ref_externe: 'C099' }])
  })
})
