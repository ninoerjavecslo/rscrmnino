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
    content: `Fakturiranje se izvede po uspešno opravljenem projektu. Plačilo se izvede v 30 dneh od datuma izstavitve računa s strani izvajalca.\nV primeru zamika planirane časovne izvedbe s strani naročnika, si izvajalec pridrži pravico do izstavitve fakture v dogovorjenem planu.`,
  },
  {
    key: 'copyright',
    label: 'Avtorske pravice',
    content: `Naročnik ima pravico, da naročeno delo uporablja izključno za namene, za katere je bilo izdelano. Ideje in koncepti, ki so bili predstavljeni naročniku, vendar jih naročnik ni sprejel, ostajajo lastnina izvajalca.\n\nVse opravljene storitve te ponudbe predstavljajo avtorsko delo izvajalca. Izvajalec na naročnika prenese naslednje materialne avtorske pravice na avtorskih delih:\na) uporabo dela v telesni obliki, zlasti pravico do reproduciranja;\nb) uporabo dela v netelesni obliki (priobčitev javnosti), ki obsega pravico javnega izvajanja, pravico javnega prenašanja, pravico javnega prikazovanja, pravico radiodifuznega oddajanja, pravico radiodifuzne retransmisije, pravico sekundarnega radiodifuznega oddajanja, pravico dajanja na voljo javnosti;\nc) uporabo dela v spremenjeni obliki, ki obsega pravico predelave in pravico avdiovizualne priredbe;\nd) uporabo primerkov avtorskega dela, ki obsega pravico distribuiranja in pravico dajanja v najem.\n\nPrenos materialnih je izključen in časovno ter teritorialno neomejen tj. velja tako za področje Republike Slovenije kot za tujino tj. ves svet. Prenos materialnih avtorskih pravic z izvajalca na naročnika, se izvrši z izvedbo plačila, ki se podrobneje uredijo v pogodbi.`,
  },
  {
    key: 'scope_notes',
    label: 'Obseg del in časovnica',
    content: `Ponudba velja za v stroškovniku definiran obseg del ter izdelkov. Za dodatna dela, ki niso opredeljena v stroškovniku, se izdela ločena ponudba.\n\nIzvedba del po tej ponudbi se prične s pisno potrjenim odgovorom na ponudbo. Za izvedbo del se uporabi časovnica opredeljena v tej ponudbi. V kolikor predlagana časovnica potrebuje dodatno uskladitev z naročnikom, se le ta opravi in potrdi pred pričetkom projekta.`,
  },
  {
    key: 'general_notes',
    label: 'Splošne opombe',
    content: `Naročnik se zavezuje, da bo predčasno zagotovil potrebne materiale, reference in vse s projektom povezane dokumente.\nIzvajalec in naročnik se zavezujeta varovati poslovne skrivnosti, skladno z veljavno zakonodajo. Ta ponudba predstavlja poslovno skrivnost.\n\nV cenah ni vključen DDV.\n\nPonudba velja 30 dni.`,
  },
  {
    key: 'project_setup',
    label: 'Vzpostavitev projekta in analiza',
    content: `Uvodni sestanek z naročnikom, kjer:\n— definiramo zahteve in želje naročnika\n— spoznamo trenutno stanje in problematiko\n— prepoznamo morebitne projektne omejitve\n— določimo gabarite za časovnico\n— pojasnimo način izvedbe projekta\n— določimo projektno ekipo in pristojnosti\n— določimo naslednje korake\n— popišemo seznam podatkov, ki jih priskrbi naročnik za naslednje korake\n\nIzvedba po delavnici:\n— priprava projektnega plana\n— priprava okvirne časovnice projekta, ocena tveganja in identifikacije mejnikov projekta\n— dodelitev ekipe, opredelitev principov dela in določitev orodij, ki jih bomo uporabljali pri izvedbi projekta`,
  },
  {
    key: 'hosting_standard',
    label: 'Gostovanje spletnega mesta',
    content: `Gostovanje spletnega mesta (mesečno)\n\n4 GB prostora na disku; redno varnostno kopiranje – dnevno, tedensko in mesečno; podatkovni center skladen s standardom ISO27001; redundantno električno napajanje in hlajenje; profesionalni protivlomni sistem; 24 urna fizična zaščita; beleženje vhodov in izhodov; profesionalna pristopna kontrola; CISCO komunikacijska oprema za visoko razpoložljivost; več redundantnih optičnih povezav z večimi domačimi in tujimi operaterji; DDOS zaščita Arbor networks; zagotovljena razpoložljivost tehnične infrastrukture (omrežje, spletni strežnik, baze podatkov): 99,8% na tromesečni ravni; odzivni čas: 8 ur; dosegljivost 8/5; rok za odpravo napake: 12 ur (ciljni čas).`,
  },
  {
    key: 'maintenance_basic',
    label: 'Tehnično vzdrževanje — Osnovni paket',
    content: `Tehnično vzdrževanje — osnovni paket\nNamen osnovnega tehničnega vzdrževanja je zagotavljati nivo razpoložljivosti in delovanja spletnih mest.\n\nVključuje:\n— mesečni pregled spletne strani\n— mesečne posodobitve in vzdrževanje\n— varnostno kopiranje spletne strani\n— do 5 podpornih zahtevkov na mesec\n— do 1h reševanja težav nepovzročenih na strani izvajalca\n— podpora preko e-pošte in portala za podporo\n— dosegljivost od ponedeljka do petka od 9.00 do 17.00\n— odzivni čas: v 24 urah\n\nCena: €150/mesec`,
  },
  {
    key: 'maintenance_pro',
    label: 'Tehnično vzdrževanje — Profesionalni paket',
    content: `Tehnično vzdrževanje — profesionalni paket\nNamen tehničnega vzdrževanja je zagotavljati nivo razpoložljivosti in delovanja spletnih mest.\n\nVključuje:\n— mesečni pregled spletne strani\n— mesečne posodobitve in vzdrževanje\n— varnostno kopiranje spletne strani\n— do 5 podpornih zahtevkov na mesec\n— do 3h reševanja težav nepovzročenih na strani izvajalca\n— podpora preko e-pošte in portala za podporo\n— vključuje proaktivno vzdrževanje ter mesečne preglede delovanja in optimizacije\n— dosegljivost od ponedeljka do petka od 9.00 do 17.00\n— odzivni čas: v 24 urah\n\nCena: €450/mesec`,
  },
]

export const BOILERPLATE_EN: BoilerplateBlock[] = [
  {
    key: 'payment_terms',
    label: 'Payment Terms',
    content: `Invoicing is performed upon successful completion of the project. Payment is due within 30 days of the invoice date.\nIn case of a delay caused by the client, the agency reserves the right to invoice according to the agreed schedule.`,
  },
  {
    key: 'general_notes',
    label: 'General Notes',
    content: `The client undertakes to provide all necessary materials, references and project-related documents in a timely manner.\nBoth parties undertake to protect business confidentiality in accordance with applicable law. This offer constitutes a business secret.\n\nPrices do not include VAT.\n\nThis offer is valid for 30 days.`,
  },
]

export function getBoilerplate(language: 'sl' | 'en'): BoilerplateBlock[] {
  return language === 'en' ? BOILERPLATE_EN : BOILERPLATE_SL
}
