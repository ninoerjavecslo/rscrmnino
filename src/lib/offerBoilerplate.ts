// src/lib/offerBoilerplate.ts
// Reusable text blocks from Renderspace offer analysis (2025–2026)

export interface BoilerplateBlock {
  key: string
  label: string
  content: string
}

export const BOILERPLATE_SL: BoilerplateBlock[] = [
  {
    key: 'payment_terms',
    label: 'Plačilni pogoji',
    content: `Plačilo se izvede v treh obrokih: 30% ob podpisu pogodbe, 40% ob predaji prototipa v pregled in 30% ob lansiranju. Vsi zneski so brez DDV.`,
  },
  {
    key: 'copyright',
    label: 'Avtorske pravice',
    content: `Naročnik pridobi vse avtorske pravice na naročenih materialih po plačilu celotnega zneska ponudbe.\n\nVse opravljene storitve te ponudbe predstavljajo avtorsko delo izvajalca. Izvajalec na naročnika prenese vse materialne avtorske pravice na avtorskih delih, vključno s pravico do reproduciranja, priobčitve javnosti, predelave in distribucije. Prenos materialnih avtorskih pravic z izvajalca na naročnika se izvrši z izvedbo plačila celotnega zneska.\n\nIdeje in koncepti, ki so bili predstavljeni naročniku, vendar jih naročnik ni sprejel, ostajajo lastnina izvajalca.`,
  },
  {
    key: 'scope_notes',
    label: 'Obseg del in časovnica',
    content: `Ponudba velja za v stroškovniku definirani obseg del. Morebitne spremembe obsega se dogovorijo pisno in zaračunajo ločeno.\n\nIzvedba del po tej ponudbi se prične s pisno potrjenim odgovorom na ponudbo. Za izvedbo del se uporabi časovnica opredeljena v tej ponudbi.`,
  },
  {
    key: 'general_notes',
    label: 'Splošne opombe',
    content: `V cenah ni vključen DDV (22%). Ponudba velja 30 dni od datuma izdaje. Vsebine niso vključene v ponudbo.\n\nNaročnik se zavezuje, da bo predčasno zagotovil potrebne materiale, reference in vse s projektom povezane dokumente. Izvajalec in naročnik se zavezujeta varovati poslovne skrivnosti, skladno z veljavno zakonodajo.`,
  },
  {
    key: 'validity',
    label: 'Veljavnost ponudbe',
    content: `Ta ponudba velja 30 dni od datuma izdaje.`,
  },
  {
    key: 'closing',
    label: 'Zaključek',
    content: `Veseli se pričetka sodelovanja! Prepričani smo, da skupaj lahko zgradimo rešitev, ki bo ne le vizualno impresivna, temveč tudi strateško in tehnično superiorna.`,
  },
  {
    key: 'next_steps',
    label: 'Naslednji koraki',
    content: `Pregled in odobritev ponudbe\nPodpis pogodbe o izvedbi storitev\nPlačilo predračuna (30% ob podpisu)\nKick-off sestanek in začetek faze 01`,
  },
  {
    key: 'warranty',
    label: 'Garancija',
    content: `Po uspešnem lansiranju zagotavljamo 90-dnevno garancijsko dobo, v kateri odpravimo vse napake, ki so posledica naše izvedbe — brez dodatnih stroškov.`,
  },
  {
    key: 'project_setup',
    label: 'Vzpostavitev projekta in analiza',
    content: `Uvodni sestanek z naročnikom, kjer:\n— definiramo zahteve in želje naročnika\n— spoznamo trenutno stanje in problematiko\n— prepoznamo morebitne projektne omejitve\n— določimo gabarite za časovnico\n— pojasnimo način izvedbe projekta\n— določimo projektno ekipo in pristojnosti\n— določimo naslednje korake\n— popišemo seznam podatkov, ki jih priskrbi naročnik za naslednje korake\n\nIzvedba po delavnici:\n— priprava projektnega plana\n— priprava okvirne časovnice projekta, ocena tveganja in identifikacije mejnikov projekta\n— dodelitev ekipe, opredelitev principov dela in določitev orodij`,
  },
  {
    key: 'hosting_standard',
    label: 'Gostovanje spletnega mesta',
    content: `Gostovanje spletnega mesta (mesečno)\n\n4 GB prostora na disku; redno varnostno kopiranje – dnevno, tedensko in mesečno; podatkovni center skladen s standardom ISO27001; redundantno električno napajanje in hlajenje; DDOS zaščita; zagotovljena razpoložljivost tehnične infrastrukture: 99,8% na tromesečni ravni; odzivni čas: 8 ur; dosegljivost 8/5; rok za odpravo napake: 12 ur (ciljni čas).`,
  },
  {
    key: 'maintenance_basic',
    label: 'Tehnično vzdrževanje — Osnovni paket',
    content: `Tehnično vzdrževanje — osnovni paket\n\nVključuje:\n— mesečni pregled spletne strani\n— mesečne posodobitve in vzdrževanje\n— varnostno kopiranje spletne strani\n— do 5 podpornih zahtevkov na mesec\n— do 1h reševanja težav nepovzročenih na strani izvajalca\n— podpora preko e-pošte in portala za podporo\n— dosegljivost od ponedeljka do petka od 9.00 do 17.00\n— odzivni čas: v 24 urah\n\nCena: €150/mesec`,
  },
  {
    key: 'maintenance_pro',
    label: 'Tehnično vzdrževanje — Profesionalni paket',
    content: `Tehnično vzdrževanje — profesionalni paket\n\nVključuje:\n— mesečni pregled spletne strani\n— mesečne posodobitve in vzdrževanje\n— varnostno kopiranje spletne strani\n— do 5 podpornih zahtevkov na mesec\n— do 3h reševanja težav nepovzročenih na strani izvajalca\n— podpora preko e-pošte in portala za podporo\n— proaktivno vzdrževanje ter mesečni pregledi delovanja in optimizacije\n— dosegljivost od ponedeljka do petka od 9.00 do 17.00\n— odzivni čas: v 24 urah\n\nCena: €450/mesec`,
  },
]

export const BOILERPLATE_EN: BoilerplateBlock[] = [
  {
    key: 'payment_terms',
    label: 'Payment Terms',
    content: `Payment is made in three instalments: 30% upon signing the contract, 40% upon delivery of the prototype for review, and 30% upon launch. All amounts are exclusive of VAT.`,
  },
  {
    key: 'copyright',
    label: 'Copyright',
    content: `The client acquires all intellectual property rights to the commissioned materials upon full payment of the offer amount.\n\nAll services performed under this offer constitute the author's work of the agency. The agency transfers all material copyrights to the client, including reproduction, public communication, adaptation and distribution rights. Transfer of rights takes effect upon full payment.`,
  },
  {
    key: 'scope_notes',
    label: 'Scope & Timeline',
    content: `This offer applies to the scope of work defined in the cost breakdown. Any changes to scope must be agreed in writing and will be invoiced separately.\n\nWork begins upon written confirmation of the offer. The timeline defined in this offer will be used for project execution.`,
  },
  {
    key: 'general_notes',
    label: 'General Notes',
    content: `Prices do not include VAT. This offer is valid for 30 days from the date of issue. Content is not included in the offer.\n\nThe client agrees to provide all necessary materials, references and project-related documents in advance. Both parties agree to maintain confidentiality in accordance with applicable law.`,
  },
  {
    key: 'validity',
    label: 'Offer Validity',
    content: `This offer is valid for 30 days from the date of issue.`,
  },
  {
    key: 'closing',
    label: 'Closing',
    content: `We look forward to working together! We are confident that we can build a solution that is not only visually impressive but also strategically and technically superior.`,
  },
  {
    key: 'next_steps',
    label: 'Next Steps',
    content: `Review and approval of the offer\nSigning the service agreement\nDeposit payment (30% upon signing)\nKick-off meeting and start of Phase 01`,
  },
  {
    key: 'warranty',
    label: 'Warranty',
    content: `After successful launch, we provide a 90-day warranty period during which we fix all defects resulting from our implementation — at no additional cost.`,
  },
  {
    key: 'hosting_standard',
    label: 'Web Hosting',
    content: `Web hosting (monthly)\n\n4 GB disk space; regular backups – daily, weekly and monthly; ISO27001-compliant data centre; redundant power and cooling; DDoS protection; guaranteed infrastructure availability: 99.8% per quarter; response time: 8 hours; availability: 8/5; resolution time: 12 hours (target).`,
  },
  {
    key: 'maintenance_basic',
    label: 'Maintenance — Basic',
    content: `Technical maintenance — basic plan\n\nIncludes:\n— monthly website review\n— monthly updates and maintenance\n— website backup\n— up to 5 support tickets per month\n— up to 1h troubleshooting for issues not caused by the agency\n— support via email and support portal\n— availability Monday–Friday 9:00–17:00\n— response time: within 24 hours\n\nPrice: €150/month`,
  },
  {
    key: 'maintenance_pro',
    label: 'Maintenance — Pro',
    content: `Technical maintenance — professional plan\n\nIncludes:\n— monthly website review\n— monthly updates and maintenance\n— website backup\n— up to 5 support tickets per month\n— up to 3h troubleshooting for issues not caused by the agency\n— support via email and support portal\n— proactive maintenance and monthly performance reviews\n— availability Monday–Friday 9:00–17:00\n— response time: within 24 hours\n\nPrice: €450/month`,
  },
]

export function getBoilerplate(language: 'sl' | 'en'): BoilerplateBlock[] {
  return language === 'en' ? BOILERPLATE_EN : BOILERPLATE_SL
}
