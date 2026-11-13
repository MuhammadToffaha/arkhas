// 🟢 Goethe-Zertifikat A1 (Start Deutsch 1) — 5 practice mocks, own texts, real format.
// Compact rows → normalised in app.js:  Lesen q: [q, qEn, options, answer]  ·  Hören item: [say, sayEn, q, qEn, options, answer]
var RF = ["richtig", "falsch"];
var MOCKS = [];

MOCKS.push({ id: "a1-1", lv: "A1", name: "A1 · Modelltest 1", min: { hoeren: 20, lesen: 25, schreiben: 20, sprechen: 15 },
  hoeren: [
    { teil: "Teil 1 — Gespräche", info: "Choose a, b or c. Each text is played twice.", items: [
      ["Frau: Wie viel kostet das Brot? Mann: Zwei Euro fünfzig. Frau: Gut, ich nehme zwei.", "How much is the bread? — Two fifty. — OK, I'll take two.", "Wie viel kostet ein Brot?", "How much is one bread?", ["2,05 €", "2,50 €", "5,00 €"], 1],
      ["Mann: Wann beginnt der Deutschkurs? Frau: Am Montag um neun Uhr, im Raum zwölf.", "When does the German course start? — Monday at nine, room 12.", "Wann beginnt der Kurs?", "When does the course start?", ["Montag 9 Uhr", "Montag 12 Uhr", "Dienstag 9 Uhr"], 0],
      ["Frau: Entschuldigung, wo ist die Toilette? Mann: Im ersten Stock, links neben dem Café.", "Excuse me, where's the toilet? — First floor, left next to the café.", "Wo ist die Toilette?", "Where is the toilet?", ["Im Erdgeschoss", "Im ersten Stock", "Im zweiten Stock"], 1],
      ["Mann: Was möchtest du trinken? Frau: Keinen Kaffee, bitte. Ich nehme einen Tee.", "What would you like to drink? — No coffee, please. I'll have a tea.", "Was trinkt die Frau?", "What does the woman drink?", ["Kaffee", "Tee", "Wasser"], 1]] },
    { teil: "Teil 2 — Durchsagen", info: "Richtig oder falsch?", items: [
      ["Achtung am Gleis drei: Der Zug nach Köln hat zehn Minuten Verspätung.", "Attention platform 3: the train to Cologne is ten minutes late.", "Der Zug nach Köln ist pünktlich.", "The train to Cologne is on time.", RF, 1],
      ["Liebe Kunden, unser Supermarkt schließt heute schon um achtzehn Uhr.", "Dear customers, our supermarket closes at 6 pm today.", "Der Supermarkt schließt heute um 18 Uhr.", "The supermarket closes at 6 pm today.", RF, 0],
      ["Herr Yilmaz, bitte kommen Sie zur Information im Erdgeschoss.", "Mr Yilmaz, please come to the information desk on the ground floor.", "Herr Yilmaz soll in den ersten Stock kommen.", "Mr Yilmaz should come to the first floor.", RF, 1]] },
    { teil: "Teil 3 — Telefonansagen", info: "Choose a, b or c.", items: [
      ["Hallo Muhammad, hier ist Anna. Wir treffen uns morgen um sieben vor dem Kino. Bis morgen!", "Hi Muhammad, it's Anna. We're meeting tomorrow at seven in front of the cinema. See you!", "Wo treffen sie sich?", "Where are they meeting?", ["Vor dem Kino", "Im Café", "Am Bahnhof"], 0],
      ["Praxis Dr. Weber. Wir haben am Mittwoch geschlossen. Am Donnerstag sind wir ab acht Uhr da.", "Dr Weber's practice. We're closed on Wednesday. On Thursday we're here from 8.", "Wann ist die Praxis wieder offen?", "When is the practice open again?", ["Mittwoch", "Donnerstag", "Freitag"], 1],
      ["Hallo, hier ist Peter. Mein Auto ist kaputt. Kannst du mich um fünf Uhr abholen? Danke!", "Hi, it's Peter. My car is broken. Can you pick me up at five? Thanks!", "Was möchte Peter?", "What does Peter want?", ["Ein Auto kaufen", "Abgeholt werden", "Um fünf anrufen"], 1]] }],
  lesen: [
    { teil: "Teil 1 — Kurze Texte", info: "Richtig oder falsch?", text: "Liebe Sara,\nich bin jetzt in Hamburg. Die Stadt ist sehr schön, aber es regnet jeden Tag. Mein Hotel ist direkt am Hafen. Morgen besuche ich ein Museum und am Freitag fahre ich nach Hause.\nViele Grüße\nLisa",
      en: "Dear Sara, I'm in Hamburg now. The city is very beautiful, but it rains every day. My hotel is right by the harbour. Tomorrow I'm visiting a museum and on Friday I'm going home. Best wishes, Lisa",
      q: [["Lisa ist in Hamburg.", "Lisa is in Hamburg.", RF, 0], ["Das Wetter ist gut.", "The weather is good.", RF, 1], ["Lisa fährt am Freitag nach Hause.", "Lisa goes home on Friday.", RF, 0]] },
    { teil: "Teil 2 — Anzeigen", info: "Which ad fits? a or b?", text: "a) Fahrradladen Becker: Reparaturen Mo–Fr 9–18 Uhr\nb) Fahrräder online kaufen: www.rad24.de\nc) Sprachschule: Deutschkurse am Abend, 19–21 Uhr\nd) Sprachschule: Deutschkurse am Vormittag, 9–12 Uhr\ne) Restaurant Roma: Mittagessen 11–15 Uhr\nf) Restaurant Roma: Abendessen ab 18 Uhr",
      en: "a) Becker bike shop: repairs Mon–Fri 9–6 · b) buy bikes online · c) language school: evening courses 7–9 pm · d) language school: morning courses 9–12 · e) Restaurant Roma: lunch 11–3 · f) Restaurant Roma: dinner from 6 pm",
      q: [["Ihr Fahrrad ist kaputt.", "Your bike is broken.", ["a", "b"], 0], ["Sie arbeiten tagsüber und möchten Deutsch lernen.", "You work during the day and want to learn German.", ["c", "d"], 0], ["Sie möchten am Abend essen gehen.", "You want to eat out in the evening.", ["e", "f"], 1]] },
    { teil: "Teil 3 — Schilder", info: "Richtig oder falsch?", text: "1) Arztpraxis: Heute keine Sprechstunde! Bitte gehen Sie zu Dr. Krause, Bahnhofstraße 4.\n2) Schwimmbad: Kinder unter 6 Jahren: Eintritt frei.\n3) Bäckerei: Sonntag 8–11 Uhr geöffnet.",
      en: "1) Doctor's practice: no surgery hours today! Please go to Dr Krause, Bahnhofstraße 4. · 2) Swimming pool: children under 6 enter free. · 3) Bakery: open Sunday 8–11.",
      q: [["Sie können heute zu Dr. Krause gehen.", "You can go to Dr Krause today.", RF, 0], ["Ein Kind (4 Jahre) muss im Schwimmbad bezahlen.", "A 4-year-old has to pay at the pool.", RF, 1], ["Die Bäckerei ist am Sonntagnachmittag offen.", "The bakery is open on Sunday afternoon.", RF, 1]] }],
  schreiben: [
    { teil: "Teil 1 — Formular", task: "Ihr Freund Karim (35, aus Syrien, wohnt in Wuppertal, Kurfürstenstraße 12, Koch) möchte sich im Sportverein anmelden. Füllen Sie für ihn das Formular aus: Name, Alter, Herkunftsland, Adresse, Beruf.",
      taskEn: "Your friend Karim (35, from Syria, lives in Wuppertal, Kurfürstenstraße 12, cook) wants to join a sports club. Fill in the form for him: name, age, country, address, job.",
      points: ["Name: Karim", "Alter: 35", "Herkunftsland: Syrien", "Adresse: Kurfürstenstraße 12, Wuppertal", "Beruf: Koch"], min: 8,
      m: "Name: Karim\nAlter: 35\nHerkunftsland: Syrien\nAdresse: Kurfürstenstraße 12, Wuppertal\nBeruf: Koch", mEn: "Name: Karim · Age: 35 · Country: Syria · Address: Kurfürstenstraße 12, Wuppertal · Job: cook" },
    { teil: "Teil 2 — Kurze Mitteilung (ca. 30 Wörter)", task: "Sie können morgen nicht zum Deutschkurs kommen. Schreiben Sie Ihrer Lehrerin, Frau Schmidt:\n• Warum kommen Sie nicht?\n• Wann kommen Sie wieder?\n• Fragen Sie nach den Hausaufgaben.",
      taskEn: "You can't come to German class tomorrow. Write to your teacher, Ms Schmidt: why not? when are you back? ask about homework.",
      points: ["Grund (krank, Arbeit …)", "Wann Sie wiederkommen", "Frage nach Hausaufgaben", "Anrede + Gruß"], min: 25,
      m: "Liebe Frau Schmidt, leider kann ich morgen nicht zum Kurs kommen, weil ich krank bin. Am Donnerstag komme ich wieder. Welche Hausaufgaben haben wir? Viele Grüße, Muhammad",
      mEn: "Dear Ms Schmidt, unfortunately I can't come to class tomorrow because I'm sick. I'll be back on Thursday. What homework do we have? Best wishes, Muhammad" }],
  sprechen: [
    { teil: "Teil 1 — Sich vorstellen", info: "Introduce yourself with these words. Then spell your name and say your phone number.", topic: "Stellen Sie sich vor.", topicEn: "Introduce yourself.", prompts: ["Name?", "Alter?", "Land?", "Wohnort?", "Sprachen?", "Beruf?", "Hobby?"],
      m: "Ich heiße Muhammad Toffaha. Ich bin vierzig Jahre alt. Ich komme aus Ägypten und wohne in Schwelm. Ich spreche Arabisch, Englisch und ein bisschen Deutsch. Ich bin Ingenieur. Mein Hobby ist Fußball.",
      mEn: "My name is Muhammad Toffaha. I'm forty. I come from Egypt and live in Schwelm. I speak Arabic, English and a little German. I'm an engineer. My hobby is football." },
    { teil: "Teil 2 — Fragen (Thema: Essen und Trinken)", info: "Make a question from each card.", cards: [["Frühstück", "Was essen Sie zum Frühstück?", "What do you eat for breakfast?"], ["Obst", "Essen Sie gern Obst?", "Do you like eating fruit?"], ["Getränk", "Was trinken Sie gern?", "What do you like to drink?"], ["Restaurant", "Gehen Sie oft ins Restaurant?", "Do you often go to a restaurant?"]] },
    { teil: "Teil 3 — Bitten", info: "Make a request for each picture.", cards: [["☕ Kaffee", "Können Sie mir bitte einen Kaffee geben?", "Can you give me a coffee, please?"], ["🪟 Fenster", "Mach bitte das Fenster auf!", "Please open the window!"], ["✏️ Stift", "Hast du einen Stift für mich?", "Do you have a pen for me?"], ["📱 Telefon", "Darf ich bitte Ihr Telefon benutzen?", "May I use your phone, please?"]] }] });

MOCKS.push({ id: "a1-2", lv: "A1", name: "A1 · Modelltest 2", min: { hoeren: 20, lesen: 25, schreiben: 20, sprechen: 15 },
  hoeren: [
    { teil: "Teil 1 — Gespräche", info: "Choose a, b or c.", items: [
      ["Mann: Wie spät ist es? Frau: Es ist halb vier.", "What time is it? — It's half past three.", "Wie spät ist es?", "What time is it?", ["3:30", "4:30", "3:15"], 0],
      ["Frau: Wo wohnst du? Mann: In der Goethestraße, Nummer achtzehn.", "Where do you live? — Goethestraße number 18.", "Welche Hausnummer?", "Which house number?", ["8", "18", "80"], 1],
      ["Mann: Ich möchte ein Zimmer für zwei Nächte. Frau: Für eine Person? Mann: Nein, für zwei.", "I'd like a room for two nights. — For one person? — No, for two.", "Wie viele Personen?", "How many people?", ["Eine", "Zwei", "Drei"], 1],
      ["Frau: Fährst du mit dem Bus zur Arbeit? Mann: Nein, mit dem Fahrrad. Das ist schneller.", "Do you take the bus to work? — No, the bike. It's faster.", "Wie fährt der Mann zur Arbeit?", "How does the man get to work?", ["Mit dem Bus", "Mit dem Auto", "Mit dem Fahrrad"], 2]] },
    { teil: "Teil 2 — Durchsagen", info: "Richtig oder falsch?", items: [
      ["Der Bus Nummer zwölf fährt heute nicht. Bitte nehmen Sie die Linie vierzehn.", "Bus 12 isn't running today. Please take line 14.", "Heute fährt der Bus 12 nicht.", "Bus 12 isn't running today.", RF, 0],
      ["Heute im Angebot: Äpfel, ein Kilo nur ein Euro neunundneunzig.", "On offer today: apples, one kilo only €1.99.", "Ein Kilo Äpfel kostet 2,99 €.", "A kilo of apples costs €2.99.", RF, 1],
      ["Das Museum ist heute bis zwanzig Uhr geöffnet. Der Eintritt ist frei.", "The museum is open until 8 pm today. Entry is free.", "Man muss heute im Museum nichts bezahlen.", "You don't have to pay at the museum today.", RF, 0]] },
    { teil: "Teil 3 — Telefonansagen", info: "Choose a, b or c.", items: [
      ["Hallo, hier ist Mama. Kannst du bitte Milch und Eier kaufen? Brot haben wir noch.", "Hi, it's Mum. Can you buy milk and eggs please? We still have bread.", "Was soll man kaufen?", "What should be bought?", ["Brot und Milch", "Milch und Eier", "Eier und Brot"], 1],
      ["Guten Tag, hier ist das Autohaus Meier. Ihr Auto ist fertig. Sie können es heute ab vierzehn Uhr abholen.", "Hello, Meier car garage. Your car is ready. You can pick it up today from 2 pm.", "Ab wann kann man das Auto abholen?", "From when can the car be collected?", ["12 Uhr", "14 Uhr", "16 Uhr"], 1],
      ["Hi, hier ist Tom. Die Party ist nicht bei mir, sondern bei Julia. Ihre Adresse schicke ich dir per SMS.", "Hi, it's Tom. The party isn't at my place but at Julia's. I'll text you her address.", "Wo ist die Party?", "Where's the party?", ["Bei Tom", "Bei Julia", "Im Restaurant"], 1]] }],
  lesen: [
    { teil: "Teil 1 — Kurze Texte", info: "Richtig oder falsch?", text: "Hallo Ben,\nam Samstag habe ich Geburtstag. Ich mache eine kleine Party bei mir zu Hause. Wir fangen um 16 Uhr an. Kannst du Musik mitbringen? Essen und Getränke habe ich.\nBis Samstag!\nMaria",
      en: "Hi Ben, it's my birthday on Saturday. I'm having a small party at home. We start at 4 pm. Can you bring music? I have food and drinks. See you Saturday! Maria",
      q: [["Die Party ist am Samstag.", "The party is on Saturday.", RF, 0], ["Ben soll Getränke mitbringen.", "Ben should bring drinks.", RF, 1], ["Die Party ist in einem Restaurant.", "The party is in a restaurant.", RF, 1]] },
    { teil: "Teil 2 — Anzeigen", info: "Which ad fits? a or b?", text: "a) Wohnung, 2 Zimmer, Zentrum, 650 € warm\nb) Wohnung, 4 Zimmer, mit Garten, 1.100 € warm\nc) Hausarzt Dr. Lang: Mo–Fr 8–12 Uhr\nd) Zahnarzt Dr. Fink: Mo–Fr 14–19 Uhr\ne) Flohmarkt: Sonntag 10–16 Uhr\nf) Supermarkt Frisch: Mo–Sa 7–22 Uhr",
      en: "a) flat, 2 rooms, centre, €650 incl. bills · b) flat, 4 rooms, with garden, €1,100 · c) GP Dr Lang: Mon–Fri 8–12 · d) dentist Dr Fink: Mon–Fri 2–7 pm · e) flea market: Sunday 10–4 · f) supermarket: Mon–Sat 7 am–10 pm",
      q: [["Sie haben drei Kinder und suchen eine Wohnung.", "You have three kids and need a flat.", ["a", "b"], 1], ["Sie haben Zahnschmerzen und arbeiten bis 16 Uhr.", "You have toothache and work until 4 pm.", ["c", "d"], 1], ["Sie möchten am Sonntag einkaufen.", "You want to shop on Sunday.", ["e", "f"], 0]] },
    { teil: "Teil 3 — Schilder", info: "Richtig oder falsch?", text: "1) Bibliothek: Wegen Renovierung bis 15. Mai geschlossen.\n2) Parkplatz nur für Kunden. Max. 2 Stunden.\n3) Kino: Montag ist Kinotag — alle Karten 5 €.",
      en: "1) Library: closed until 15 May for renovation. · 2) Parking for customers only, max 2 hours. · 3) Cinema: Monday is cinema day — all tickets €5.",
      q: [["Die Bibliothek ist im April offen.", "The library is open in April.", RF, 1], ["Kunden dürfen 2 Stunden parken.", "Customers may park for 2 hours.", RF, 0], ["Am Montag ist das Kino billiger.", "The cinema is cheaper on Monday.", RF, 0]] }],
  schreiben: [
    { teil: "Teil 1 — Formular", task: "Frau Petra Klein (geboren am 3.4.1990) möchte mit ihrer Tochter Lea (6 Jahre) einen Schwimmkurs machen. Sie wohnt in Hagen, Marktplatz 5. Sie bezahlt bar. Füllen Sie das Formular aus.",
      taskEn: "Petra Klein (born 3 April 1990) wants a swimming course with her daughter Lea (6). She lives at Marktplatz 5, Hagen. She pays cash. Fill in the form.",
      points: ["Name: Petra Klein", "Geburtsdatum: 3.4.1990", "Kind: Lea, 6 Jahre", "Adresse: Marktplatz 5, Hagen", "Zahlung: bar"], min: 8,
      m: "Name: Petra Klein\nGeburtsdatum: 03.04.1990\nKind: Lea, 6 Jahre\nAdresse: Marktplatz 5, Hagen\nZahlung: bar", mEn: "Name: Petra Klein · Date of birth: 03.04.1990 · Child: Lea, 6 · Address: Marktplatz 5, Hagen · Payment: cash" },
    { teil: "Teil 2 — Kurze Mitteilung (ca. 30 Wörter)", task: "Ihr Freund Jan hat Sie zum Essen eingeladen. Schreiben Sie ihm:\n• Danken Sie für die Einladung.\n• Sie kommen gern.\n• Fragen Sie: Was soll ich mitbringen?",
      taskEn: "Your friend Jan invited you for dinner. Write: thank him, you'd love to come, ask what to bring.",
      points: ["Danke", "Sie kommen", "Frage: mitbringen?", "Anrede + Gruß"], min: 25,
      m: "Lieber Jan, vielen Dank für deine Einladung! Ich komme sehr gern. Soll ich etwas mitbringen? Vielleicht einen Salat oder einen Kuchen? Bis Samstag! Viele Grüße, Muhammad",
      mEn: "Dear Jan, thanks a lot for your invitation! I'd love to come. Should I bring something? Maybe a salad or a cake? See you Saturday! Best, Muhammad" }],
  sprechen: [
    { teil: "Teil 1 — Sich vorstellen", info: "Introduce yourself, spell your name, say your phone number.", topic: "Stellen Sie sich vor.", topicEn: "Introduce yourself.", prompts: ["Name?", "Alter?", "Land?", "Wohnort?", "Sprachen?", "Beruf?", "Hobby?"],
      m: "Mein Name ist Muhammad. Ich komme aus Kairo in Ägypten. Jetzt lebe ich in Schwelm. Ich arbeite bei Lenovo. Ich spreche Arabisch und Englisch. In meiner Freizeit spiele ich gern mit meinen Kindern.",
      mEn: "My name is Muhammad. I'm from Cairo in Egypt. Now I live in Schwelm. I work at Lenovo. I speak Arabic and English. In my free time I like playing with my kids." },
    { teil: "Teil 2 — Fragen (Thema: Wohnung)", info: "Make a question from each card.", cards: [["Zimmer", "Wie viele Zimmer hat Ihre Wohnung?", "How many rooms does your flat have?"], ["Miete", "Wie hoch ist die Miete?", "How high is the rent?"], ["Balkon", "Hat Ihre Wohnung einen Balkon?", "Does your flat have a balcony?"], ["Nachbarn", "Sind Ihre Nachbarn nett?", "Are your neighbours nice?"]] },
    { teil: "Teil 3 — Bitten", info: "Make a request for each picture.", cards: [["🧂 Salz", "Kannst du mir bitte das Salz geben?", "Can you pass me the salt, please?"], ["🚪 Tür", "Machen Sie bitte die Tür zu!", "Please close the door!"], ["🕐 Uhr", "Wie spät ist es, bitte?", "What time is it, please?"], ["🧾 Rechnung", "Die Rechnung, bitte!", "The bill, please!"]] }] });

MOCKS.push({ id: "a1-3", lv: "A1", name: "A1 · Modelltest 3", min: { hoeren: 20, lesen: 25, schreiben: 20, sprechen: 15 },
  hoeren: [
    { teil: "Teil 1 — Gespräche", info: "Choose a, b or c.", items: [
      ["Frau: Hast du Geschwister? Mann: Ja, einen Bruder und zwei Schwestern.", "Do you have siblings? — Yes, a brother and two sisters.", "Wie viele Geschwister hat der Mann?", "How many siblings does the man have?", ["Zwei", "Drei", "Vier"], 1],
      ["Mann: Ist der Arzt heute da? Frau: Nein, heute nicht. Er kommt morgen wieder.", "Is the doctor in today? — No. He's back tomorrow.", "Wann ist der Arzt da?", "When is the doctor in?", ["Heute", "Morgen", "Übermorgen"], 1],
      ["Frau: Was machst du am Wochenende? Mann: Ich besuche meine Eltern in Bremen.", "What are you doing at the weekend? — Visiting my parents in Bremen.", "Was macht der Mann?", "What is the man doing?", ["Er arbeitet.", "Er besucht seine Eltern.", "Er fährt nach Berlin."], 1],
      ["Mann: Die Hose kostet neunundzwanzig Euro. Frau: Das ist zu teuer. Haben Sie etwas Billigeres?", "The trousers are €29. — Too expensive. Anything cheaper?", "Wie viel kostet die Hose?", "How much are the trousers?", ["19 €", "29 €", "92 €"], 1]] },
    { teil: "Teil 2 — Durchsagen", info: "Richtig oder falsch?", items: [
      ["Der Flug nach Istanbul startet heute nicht um zehn, sondern um elf Uhr.", "The flight to Istanbul leaves today not at ten but at eleven.", "Der Flug startet um 11 Uhr.", "The flight leaves at 11.", RF, 0],
      ["Liebe Gäste, das Restaurant im dritten Stock ist heute geschlossen.", "Dear guests, the restaurant on the third floor is closed today.", "Man kann heute im Restaurant essen.", "You can eat in the restaurant today.", RF, 1],
      ["Die Kasse drei ist jetzt geöffnet.", "Checkout 3 is now open.", "Kasse 3 ist offen.", "Checkout 3 is open.", RF, 0]] },
    { teil: "Teil 3 — Telefonansagen", info: "Choose a, b or c.", items: [
      ["Hallo Muhammad, hier ist Klaus. Ich bin krank und kann heute nicht zum Fußball kommen. Tut mir leid!", "Hi Muhammad, it's Klaus. I'm sick and can't come to football today. Sorry!", "Warum kommt Klaus nicht?", "Why isn't Klaus coming?", ["Er arbeitet.", "Er ist krank.", "Er hat keine Zeit."], 1],
      ["Hier ist die Stadtbibliothek. Ihr Buch ist da. Sie können es bis Freitag abholen.", "This is the town library. Your book has arrived. You can collect it until Friday.", "Bis wann kann man das Buch abholen?", "Until when can the book be collected?", ["Mittwoch", "Freitag", "Samstag"], 1],
      ["Hallo, hier ist Eva. Ich komme heute später, um acht. Esst schon ohne mich!", "Hi, it's Eva. I'm coming later today, at eight. Start eating without me!", "Wann kommt Eva?", "When is Eva coming?", ["Um 6", "Um 7", "Um 8"], 2]] }],
  lesen: [
    { teil: "Teil 1 — Kurze Texte", info: "Richtig oder falsch?", text: "Liebe Kolleginnen und Kollegen,\nunsere Firma macht am 12. Juli einen Ausflug an den Rhein. Wir fahren um 8 Uhr mit dem Bus vom Büro ab. Mittagessen gibt es auf dem Schiff. Bitte schreiben Sie mir bis Montag, ob Sie mitkommen.\nIhre Frau Neumann",
      en: "Dear colleagues, our company is taking a trip to the Rhine on 12 July. We leave the office by bus at 8 am. Lunch is on the ship. Please tell me by Monday if you're coming. Ms Neumann",
      q: [["Die Firma fährt mit dem Zug.", "The company goes by train.", RF, 1], ["Man isst auf dem Schiff.", "You eat on the ship.", RF, 0], ["Man soll bis Montag antworten.", "You should reply by Monday.", RF, 0]] },
    { teil: "Teil 2 — Anzeigen", info: "Which ad fits? a or b?", text: "a) Deutsch-Online-Kurs: lernen, wann Sie wollen\nb) Deutschkurs in der VHS: Di + Do 18 Uhr\nc) Gebrauchtes Handy, 80 €\nd) Neues Handy, Ratenzahlung möglich\ne) Taxi Schnell: 24 Stunden, Tel. 22 33 44\nf) Busfahrplan: www.vrr.de",
      en: "a) online German course, learn whenever you want · b) German course at the adult education centre, Tue + Thu 6 pm · c) used phone, €80 · d) new phone, instalments possible · e) taxi 24 hours · f) bus timetable online",
      q: [["Sie haben wenig Zeit und möchten zu Hause Deutsch lernen.", "You have little time and want to learn German at home.", ["a", "b"], 0], ["Sie haben nicht viel Geld und brauchen ein Handy.", "You don't have much money and need a phone.", ["c", "d"], 0], ["Es ist 3 Uhr nachts und Sie müssen zum Flughafen.", "It's 3 am and you have to get to the airport.", ["e", "f"], 0]] },
    { teil: "Teil 3 — Schilder", info: "Richtig oder falsch?", text: "1) Bitte nicht rauchen!\n2) Apotheke: Notdienst heute — Marien-Apotheke, Hauptstraße 20.\n3) Zoo: Hunde verboten.",
      en: "1) No smoking please! · 2) Pharmacy: today's emergency service — Marien pharmacy, Hauptstraße 20. · 3) Zoo: dogs forbidden.",
      q: [["Hier darf man rauchen.", "You may smoke here.", RF, 1], ["Heute ist die Marien-Apotheke für Notfälle offen.", "Marien pharmacy is open for emergencies today.", RF, 0], ["Sie können mit Ihrem Hund in den Zoo gehen.", "You can go to the zoo with your dog.", RF, 1]] }],
  schreiben: [
    { teil: "Teil 1 — Formular", task: "Herr Ali Hassan (Telefon 0176 555 210, E-Mail ali.hassan@mail.de) möchte am 20. Mai im Hotel Sonne ein Doppelzimmer für drei Nächte buchen. Füllen Sie das Formular aus.",
      taskEn: "Mr Ali Hassan (phone 0176 555 210, email ali.hassan@mail.de) wants to book a double room at Hotel Sonne on 20 May for three nights. Fill in the form.",
      points: ["Name: Ali Hassan", "Telefon: 0176 555 210", "Zimmer: Doppelzimmer", "Anreise: 20. Mai", "Nächte: 3"], min: 8,
      m: "Name: Ali Hassan\nTelefon: 0176 555 210\nE-Mail: ali.hassan@mail.de\nZimmer: Doppelzimmer\nAnreise: 20. Mai\nNächte: 3", mEn: "Name · phone · email · room: double · arrival: 20 May · nights: 3" },
    { teil: "Teil 2 — Kurze Mitteilung (ca. 30 Wörter)", task: "Sie sind neu im Haus. Schreiben Sie eine Nachricht an Ihre Nachbarn:\n• Stellen Sie sich vor.\n• Am Samstag machen Sie eine kleine Party.\n• Laden Sie die Nachbarn ein.",
      taskEn: "You're new in the building. Write to your neighbours: introduce yourself, you're having a small party on Saturday, invite them.",
      points: ["Wer Sie sind", "Party am Samstag", "Einladung", "Anrede + Gruß"], min: 25,
      m: "Liebe Nachbarn, ich heiße Muhammad und wohne jetzt im zweiten Stock. Am Samstag mache ich eine kleine Party. Es wird vielleicht ein bisschen laut. Sie sind herzlich eingeladen! Viele Grüße, Muhammad",
      mEn: "Dear neighbours, my name is Muhammad and I now live on the second floor. On Saturday I'm having a small party. It might get a bit loud. You're warmly invited! Best, Muhammad" }],
  sprechen: [
    { teil: "Teil 1 — Sich vorstellen", info: "Introduce yourself, spell your name, say your phone number.", topic: "Stellen Sie sich vor.", topicEn: "Introduce yourself.", prompts: ["Name?", "Alter?", "Land?", "Wohnort?", "Sprachen?", "Beruf?", "Hobby?"],
      m: "Guten Tag! Ich bin Muhammad. Ich bin vierzig Jahre alt und komme aus Ägypten. Ich wohne mit meiner Familie in Schwelm. Ich bin Ingenieur. Ich spreche Arabisch und Englisch und lerne Deutsch. Ich lese gern.",
      mEn: "Hello! I'm Muhammad. I'm forty and come from Egypt. I live with my family in Schwelm. I'm an engineer. I speak Arabic and English and I'm learning German. I like reading." },
    { teil: "Teil 2 — Fragen (Thema: Freizeit)", info: "Make a question from each card.", cards: [["Sport", "Machen Sie gern Sport?", "Do you like doing sport?"], ["Kino", "Gehen Sie oft ins Kino?", "Do you often go to the cinema?"], ["Wochenende", "Was machen Sie am Wochenende?", "What do you do at the weekend?"], ["Musik", "Welche Musik hören Sie gern?", "What music do you like?"]] },
    { teil: "Teil 3 — Bitten", info: "Make a request for each picture.", cards: [["💧 Wasser", "Ein Glas Wasser, bitte.", "A glass of water, please."], ["🗺️ Weg", "Können Sie mir den Weg zeigen?", "Can you show me the way?"], ["🔊 Lauter", "Können Sie bitte lauter sprechen?", "Can you speak louder, please?"], ["🪑 Platz", "Ist hier noch frei?", "Is this seat free?"]] }] });

MOCKS.push({ id: "a1-4", lv: "A1", name: "A1 · Modelltest 4", min: { hoeren: 20, lesen: 25, schreiben: 20, sprechen: 15 },
  hoeren: [
    { teil: "Teil 1 — Gespräche", info: "Choose a, b or c.", items: [
      ["Mann: Welche Farbe hat dein neues Auto? Frau: Es ist rot. Mein altes Auto war blau.", "What colour is your new car? — It's red. My old car was blue.", "Welche Farbe hat das neue Auto?", "What colour is the new car?", ["Blau", "Rot", "Schwarz"], 1],
      ["Frau: Wann hast du Geburtstag? Mann: Am vierzehnten März.", "When's your birthday? — On 14 March.", "Wann hat der Mann Geburtstag?", "When is his birthday?", ["4. März", "14. März", "14. Mai"], 1],
      ["Mann: Wo ist mein Schlüssel? Frau: Er liegt auf dem Tisch in der Küche.", "Where's my key? — On the table in the kitchen.", "Wo ist der Schlüssel?", "Where is the key?", ["Im Bad", "In der Küche", "Im Auto"], 1],
      ["Frau: Möchtest du Fisch oder Hähnchen? Mann: Hähnchen, bitte. Ich esse keinen Fisch.", "Fish or chicken? — Chicken please. I don't eat fish.", "Was isst der Mann?", "What does the man eat?", ["Fisch", "Hähnchen", "Salat"], 1]] },
    { teil: "Teil 2 — Durchsagen", info: "Richtig oder falsch?", items: [
      ["Wegen Bauarbeiten hält die U-Bahn heute nicht am Rathaus.", "Because of construction, the underground doesn't stop at the town hall today.", "Die U-Bahn hält heute am Rathaus.", "The underground stops at the town hall today.", RF, 1],
      ["Im zweiten Stock finden Sie heute alle Schuhe zwanzig Prozent billiger.", "On the second floor today all shoes are 20% cheaper.", "Die Schuhe sind im zweiten Stock.", "The shoes are on the second floor.", RF, 0],
      ["Morgen wird es sonnig und warm, bis zu fünfundzwanzig Grad.", "Tomorrow will be sunny and warm, up to 25 degrees.", "Morgen regnet es.", "It'll rain tomorrow.", RF, 1]] },
    { teil: "Teil 3 — Telefonansagen", info: "Choose a, b or c.", items: [
      ["Guten Tag, hier ist die Schule. Ihr Sohn hat Fieber. Bitte holen Sie ihn ab.", "Hello, this is the school. Your son has a fever. Please pick him up.", "Was soll man tun?", "What should you do?", ["Den Arzt anrufen", "Den Sohn abholen", "Medizin kaufen"], 1],
      ["Hallo, hier ist Sami. Ich stehe am Bahnhof, Ausgang Nord. Wo bist du?", "Hi, it's Sami. I'm at the station, north exit. Where are you?", "Wo ist Sami?", "Where is Sami?", ["Am Bahnhof", "Im Café", "Zu Hause"], 0],
      ["Firma Müller, guten Tag. Der Techniker kommt nicht heute, sondern morgen um zehn.", "Müller company, hello. The technician isn't coming today but tomorrow at ten.", "Wann kommt der Techniker?", "When is the technician coming?", ["Heute um 10", "Morgen um 10", "Morgen um 12"], 1]] }],
  lesen: [
    { teil: "Teil 1 — Kurze Texte", info: "Richtig oder falsch?", text: "Hallo Mama,\nich bin gut in Berlin angekommen. Die Wohnung von Tante Rosa ist groß und hell. Morgen gehe ich zum ersten Mal in die Sprachschule. Ich rufe dich am Sonntag an.\nKüsse\nYasmin",
      en: "Hi Mum, I arrived well in Berlin. Aunt Rosa's flat is big and bright. Tomorrow I'm going to the language school for the first time. I'll call you on Sunday. Kisses, Yasmin",
      q: [["Yasmin wohnt bei ihrer Tante.", "Yasmin is staying with her aunt.", RF, 0], ["Die Wohnung ist klein.", "The flat is small.", RF, 1], ["Yasmin ruft am Sonntag an.", "Yasmin will call on Sunday.", RF, 0]] },
    { teil: "Teil 2 — Anzeigen", info: "Which ad fits? a or b?", text: "a) Babysitter gesucht: Mo–Fr 15–18 Uhr\nb) Babysitter gesucht: Samstagabend\nc) Gebrauchte Kindersachen: Flohmarkt in der Schule, Sa 9–13 Uhr\nd) Neue Kindermode: Kaufhaus König\ne) Fahrradkurs für Erwachsene\nf) Schwimmkurs für Kinder ab 5",
      en: "a) babysitter wanted Mon–Fri 3–6 pm · b) babysitter wanted Saturday evening · c) used kids' things: school flea market Sat 9–1 · d) new kids' fashion: department store · e) cycling course for adults · f) swimming course for kids from 5",
      q: [["Sie studieren und haben nur am Wochenende Zeit. Sie suchen Arbeit.", "You're a student, only free at weekends, and want work.", ["a", "b"], 1], ["Sie möchten billige Kleidung für Ihr Kind.", "You want cheap clothes for your child.", ["c", "d"], 0], ["Ihre Tochter (7) soll schwimmen lernen.", "Your daughter (7) should learn to swim.", ["e", "f"], 1]] },
    { teil: "Teil 3 — Schilder", info: "Richtig oder falsch?", text: "1) Post: Pakete bitte am Schalter 3 abgeben.\n2) Hier Fahrkarten kaufen — nur Kartenzahlung.\n3) Spielplatz: nur für Kinder bis 12 Jahre.",
      en: "1) Post office: please hand in parcels at counter 3. · 2) Buy tickets here — card payment only. · 3) Playground: only for children up to 12.",
      q: [["Pakete gibt man am Schalter 3 ab.", "Parcels are handed in at counter 3.", RF, 0], ["Am Automaten kann man bar bezahlen.", "You can pay cash at the machine.", RF, 1], ["Ein Kind mit 10 Jahren darf auf den Spielplatz.", "A 10-year-old may use the playground.", RF, 0]] }],
  schreiben: [
    { teil: "Teil 1 — Formular", task: "Ihre Kollegin Maria Rossi (aus Italien, Muttersprache Italienisch, spricht Englisch, Telefon 0151 23 45 67) möchte einen Deutschkurs am Abend. Füllen Sie das Anmeldeformular aus.",
      taskEn: "Your colleague Maria Rossi (from Italy, native language Italian, speaks English, phone 0151 23 45 67) wants an evening German course. Fill in the registration form.",
      points: ["Name: Maria Rossi", "Land: Italien", "Muttersprache: Italienisch", "Andere Sprachen: Englisch", "Kurszeit: Abend"], min: 8,
      m: "Name: Maria Rossi\nLand: Italien\nMuttersprache: Italienisch\nAndere Sprachen: Englisch\nTelefon: 0151 23 45 67\nKurszeit: Abend", mEn: "Name · country: Italy · native: Italian · other: English · phone · time: evening" },
    { teil: "Teil 2 — Kurze Mitteilung (ca. 30 Wörter)", task: "Sie möchten mit Ihrer Freundin Lisa am Wochenende in die Stadt gehen. Schreiben Sie ihr:\n• Wann haben Sie Zeit?\n• Was möchten Sie machen?\n• Wo treffen Sie sich?",
      taskEn: "You want to go into town with your friend Lisa at the weekend. Write: when you're free, what you want to do, where to meet.",
      points: ["Wann", "Was", "Wo treffen", "Anrede + Gruß"], min: 25,
      m: "Hallo Lisa, hast du am Samstag Zeit? Ich möchte gern in die Stadt gehen und ein bisschen einkaufen. Danach können wir Kaffee trinken. Treffen wir uns um 14 Uhr am Bahnhof? Liebe Grüße, Muhammad",
      mEn: "Hi Lisa, are you free on Saturday? I'd like to go into town and do some shopping. Afterwards we can have coffee. Shall we meet at 2 pm at the station? Love, Muhammad" }],
  sprechen: [
    { teil: "Teil 1 — Sich vorstellen", info: "Introduce yourself, spell your name, say your phone number.", topic: "Stellen Sie sich vor.", topicEn: "Introduce yourself.", prompts: ["Name?", "Alter?", "Land?", "Wohnort?", "Sprachen?", "Beruf?", "Hobby?"],
      m: "Hallo, ich heiße Muhammad Toffaha. Ich komme aus Ägypten. Ich wohne in Schwelm, das ist in der Nähe von Wuppertal. Ich bin verheiratet und habe drei Kinder. Ich arbeite als Solutions Architect. Ich koche gern.",
      mEn: "Hi, I'm Muhammad Toffaha. I come from Egypt. I live in Schwelm, near Wuppertal. I'm married with three children. I work as a Solutions Architect. I like cooking." },
    { teil: "Teil 2 — Fragen (Thema: Einkaufen)", info: "Make a question from each card.", cards: [["Supermarkt", "Wo kaufen Sie ein?", "Where do you shop?"], ["Preis", "Was kostet ein Kilo Äpfel?", "What does a kilo of apples cost?"], ["Kleidung", "Kaufen Sie Kleidung online?", "Do you buy clothes online?"], ["Sonntag", "Kann man am Sonntag einkaufen?", "Can you shop on Sunday?"]] },
    { teil: "Teil 3 — Bitten", info: "Make a request for each picture.", cards: [["📄 Formular", "Können Sie mir bitte beim Formular helfen?", "Can you help me with the form, please?"], ["💡 Licht", "Mach bitte das Licht an!", "Please turn on the light!"], ["🚕 Taxi", "Können Sie mir bitte ein Taxi rufen?", "Can you call me a taxi, please?"], ["📖 Buch", "Kannst du mir das Buch leihen?", "Can you lend me the book?"]] }] });

MOCKS.push({ id: "a1-5", lv: "A1", name: "A1 · Modelltest 5", min: { hoeren: 20, lesen: 25, schreiben: 20, sprechen: 15 },
  hoeren: [
    { teil: "Teil 1 — Gespräche", info: "Choose a, b or c.", items: [
      ["Frau: Wie lange dauert die Fahrt nach München? Mann: Ungefähr vier Stunden mit dem ICE.", "How long is the trip to Munich? — About four hours by ICE.", "Wie lange dauert die Fahrt?", "How long is the trip?", ["2 Stunden", "4 Stunden", "6 Stunden"], 1],
      ["Mann: Was sind Sie von Beruf? Frau: Ich bin Krankenschwester im Marienhospital.", "What's your job? — I'm a nurse at Marien hospital.", "Was ist die Frau von Beruf?", "What's the woman's job?", ["Ärztin", "Lehrerin", "Krankenschwester"], 2],
      ["Frau: Hast du heute Abend Zeit? Mann: Heute leider nicht, aber morgen gern.", "Are you free tonight? — Not today, sorry, but tomorrow gladly.", "Wann hat der Mann Zeit?", "When is the man free?", ["Heute", "Morgen", "Am Wochenende"], 1],
      ["Mann: Wie ist deine Telefonnummer? Frau: Null eins sieben sechs, drei drei vier, fünf null.", "What's your number? — 0176 334 50.", "Wie ist die Nummer?", "What's the number?", ["0176 334 50", "0167 334 50", "0176 433 50"], 0]] },
    { teil: "Teil 2 — Durchsagen", info: "Richtig oder falsch?", items: [
      ["Sehr geehrte Fahrgäste, der Zug endet heute in Dortmund. Bitte alle aussteigen.", "Dear passengers, the train terminates in Dortmund today. Everyone please get off.", "Der Zug fährt heute weiter als Dortmund.", "The train goes beyond Dortmund today.", RF, 1],
      ["Achtung: Der Parkplatz schließt um zweiundzwanzig Uhr.", "Attention: the car park closes at 10 pm.", "Der Parkplatz ist bis 22 Uhr offen.", "The car park is open until 10 pm.", RF, 0],
      ["Liebe Eltern, das Schulfest beginnt am Freitag um fünfzehn Uhr im Schulhof.", "Dear parents, the school party starts Friday at 3 pm in the schoolyard.", "Das Schulfest ist am Freitagabend.", "The school party is on Friday evening.", RF, 1]] },
    { teil: "Teil 3 — Telefonansagen", info: "Choose a, b or c.", items: [
      ["Hallo, hier ist Opa. Wir kommen am Samstag mit dem Zug. Kannst du uns um elf am Bahnhof abholen?", "Hi, it's Grandpa. We're coming on Saturday by train. Can you pick us up at eleven at the station?", "Wann soll man Opa abholen?", "When should Grandpa be picked up?", ["Um 10", "Um 11", "Um 12"], 1],
      ["Hier ist Zahnarztpraxis Dr. Fink. Bitte bringen Sie morgen Ihre Versichertenkarte mit.", "This is Dr Fink's dental practice. Please bring your insurance card tomorrow.", "Was soll man mitbringen?", "What should you bring?", ["Den Pass", "Die Versichertenkarte", "Geld"], 1],
      ["Hallo, hier ist Nina. Ich kann nicht zum Kino kommen, mein Kind ist krank. Gehen wir nächste Woche?", "Hi, it's Nina. I can't come to the cinema, my child is sick. Shall we go next week?", "Warum kommt Nina nicht?", "Why isn't Nina coming?", ["Sie ist krank.", "Ihr Kind ist krank.", "Sie arbeitet."], 1]] }],
  lesen: [
    { teil: "Teil 1 — Kurze Texte", info: "Richtig oder falsch?", text: "Sehr geehrter Herr Toffaha,\nIhr neuer Ausweis ist fertig. Sie können ihn im Bürgeramt abholen: Montag bis Freitag von 8 bis 12 Uhr. Bitte bringen Sie Ihren alten Ausweis mit.\nMit freundlichen Grüßen\nStadt Schwelm",
      en: "Dear Mr Toffaha, your new ID card is ready. You can collect it at the citizens' office Mon–Fri 8–12. Please bring your old ID. Kind regards, Town of Schwelm",
      q: [["Der Ausweis ist fertig.", "The ID is ready.", RF, 0], ["Man kann ihn am Samstag abholen.", "You can collect it on Saturday.", RF, 1], ["Herr Toffaha soll den alten Ausweis mitbringen.", "Mr Toffaha should bring the old ID.", RF, 0]] },
    { teil: "Teil 2 — Anzeigen", info: "Which ad fits? a or b?", text: "a) Reisebüro Sonne: Urlaub am Meer, ab 499 €\nb) Reisebüro Berg: Skiurlaub in den Alpen\nc) Computerkurs für Anfänger, Mo 10 Uhr\nd) Computer-Reparatur: schnell und günstig\ne) Arabisches Restaurant: Halal-Küche\nf) Bayerisches Restaurant: Schweinebraten",
      en: "a) travel agent: sea holidays from €499 · b) travel agent: ski holiday in the Alps · c) computer course for beginners · d) computer repair: fast and cheap · e) Arabic restaurant: halal food · f) Bavarian restaurant: roast pork",
      q: [["Sie möchten im Sommer an den Strand.", "You want to go to the beach in summer.", ["a", "b"], 0], ["Ihr Laptop funktioniert nicht.", "Your laptop doesn't work.", ["c", "d"], 1], ["Sie essen nur halal.", "You only eat halal.", ["e", "f"], 0]] },
    { teil: "Teil 3 — Schilder", info: "Richtig oder falsch?", text: "1) Achtung! Frisch gestrichen.\n2) Sprachschule: Anmeldung im Büro, Zimmer 4, Mo–Do 9–13 Uhr.\n3) Fundbüro im Rathaus, Erdgeschoss.",
      en: "1) Caution! Wet paint. · 2) Language school: registration in the office, room 4, Mon–Thu 9–1. · 3) Lost property office in the town hall, ground floor.",
      q: [["Man soll die Wand nicht anfassen.", "You shouldn't touch the wall.", RF, 0], ["Man kann sich am Freitag anmelden.", "You can register on Friday.", RF, 1], ["Das Fundbüro ist im Rathaus.", "Lost property is in the town hall.", RF, 0]] }],
  schreiben: [
    { teil: "Teil 1 — Formular", task: "Herr Omar Saleh (Jordanien, Taxifahrer, verheiratet, 2 Kinder, wohnt in Gevelsberg, Mittelstraße 7) meldet sich bei der Bibliothek an. Füllen Sie das Formular aus.",
      taskEn: "Mr Omar Saleh (Jordan, taxi driver, married, 2 children, lives at Mittelstraße 7, Gevelsberg) registers at the library. Fill in the form.",
      points: ["Name: Omar Saleh", "Land: Jordanien", "Beruf: Taxifahrer", "Familienstand: verheiratet", "Adresse: Mittelstraße 7, Gevelsberg"], min: 8,
      m: "Name: Omar Saleh\nHerkunftsland: Jordanien\nBeruf: Taxifahrer\nFamilienstand: verheiratet, 2 Kinder\nAdresse: Mittelstraße 7, Gevelsberg", mEn: "Name · country: Jordan · job: taxi driver · married, 2 kids · address" },
    { teil: "Teil 2 — Kurze Mitteilung (ca. 30 Wörter)", task: "Sie sind krank und können morgen nicht arbeiten. Schreiben Sie Ihrem Chef, Herrn Wolf:\n• Was haben Sie?\n• Sie gehen zum Arzt.\n• Wann kommen Sie wieder?",
      taskEn: "You're sick and can't work tomorrow. Write to your boss, Mr Wolf: what's wrong, you're going to the doctor, when you'll be back.",
      points: ["Krankheit", "Arzt", "Wann wieder da", "Anrede + Gruß"], min: 25,
      m: "Sehr geehrter Herr Wolf, ich habe Fieber und Kopfschmerzen. Morgen kann ich leider nicht arbeiten. Ich gehe heute zum Arzt. Ich komme wahrscheinlich am Montag wieder. Mit freundlichen Grüßen, Muhammad Toffaha",
      mEn: "Dear Mr Wolf, I have a fever and a headache. Unfortunately I can't work tomorrow. I'm going to the doctor today. I'll probably be back on Monday. Kind regards, Muhammad Toffaha" }],
  sprechen: [
    { teil: "Teil 1 — Sich vorstellen", info: "Introduce yourself, spell your name, say your phone number.", topic: "Stellen Sie sich vor.", topicEn: "Introduce yourself.", prompts: ["Name?", "Alter?", "Land?", "Wohnort?", "Sprachen?", "Beruf?", "Hobby?"],
      m: "Ich bin Muhammad. Ich bin aus Ägypten und lebe seit einem Jahr in Deutschland. Ich wohne in Schwelm. Ich bin Ingenieur bei einer Computerfirma. Meine Sprachen sind Arabisch, Englisch und Deutsch. Mein Hobby ist Programmieren.",
      mEn: "I'm Muhammad. I'm from Egypt and have lived in Germany for a year. I live in Schwelm. I'm an engineer at a computer company. My languages are Arabic, English and German. My hobby is programming." },
    { teil: "Teil 2 — Fragen (Thema: Reisen)", info: "Make a question from each card.", cards: [["Urlaub", "Wohin fahren Sie im Urlaub?", "Where do you go on holiday?"], ["Zug", "Fahren Sie gern Zug?", "Do you like travelling by train?"], ["Hotel", "Wie war das Hotel?", "How was the hotel?"], ["Koffer", "Wie viele Koffer haben Sie?", "How many suitcases do you have?"]] },
    { teil: "Teil 3 — Bitten", info: "Make a request for each picture.", cards: [["🎫 Fahrkarte", "Eine Fahrkarte nach Köln, bitte.", "A ticket to Cologne, please."], ["📸 Foto", "Können Sie bitte ein Foto von uns machen?", "Can you take a photo of us, please?"], ["🐢 Langsam", "Sprechen Sie bitte langsamer!", "Please speak more slowly!"], ["🛍️ Tüte", "Kann ich bitte eine Tüte haben?", "Can I have a bag, please?"]] }] });
