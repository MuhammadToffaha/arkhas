// 🇬🇧 English translations shown small under German text (model answers + exam).
var MY_EN = [
  "My name is Muhammad and I come from Egypt. I've lived in Schwelm for a year. I'm a Solutions Architect by profession and work at Lenovo. I'm married and have three children. My native language is Arabic, but I also speak English and a little German.",
  "On Saturday I go to REWE. I buy a coffee, a packet of rice and a kilo of tomatoes. The apples are on offer. I can't find any halal cheese. I pay by card.",
  "This week I have to go to Frankfurt. I have to prepare a presentation. In the evening I want to play with my children. Unfortunately I can't do sport every day. But I'd like to practise German every day.",
  "I get up at six. I have breakfast and drink tea. I mostly work from home, but I often drive to customers. At five I pick up the children. In the evening I call my mother. After that I watch a bit of TV.",
  "I walk to the stop. Then I take the bus to the station. I change in Wuppertal. The trip to Düsseldorf takes about an hour. The train is often late.",
  "On Saturday I slept late. Then I played football with the kids. In the afternoon we shopped at Aldi. On Sunday I cooked koshari. In the evening we watched a film.",
  "Last month I went to Hamburg. I went by ICE, but the train was late. I stayed three nights in a hotel. I visited a customer. On Friday I came home.",
  "My family is big. I have a wife and three children. My eldest son is nine and likes playing football. My daughter reads a lot. My parents live in Egypt and I miss them very much. At the weekend we eat together.",
  "As a child I lived in Egypt. I was a curious child. At school I was good at maths. I had to do homework every day. I was allowed to play football at the weekend. My dream was to become an engineer.",
  "Our flat is on the second floor. It has three rooms. There's a big sofa in the living room. My desk is next to the window. The flat is bright and cosy. Unfortunately the rent is quite high.",
  "Last winter I caught a cold. I had a fever and a cough, and my head hurt. I went to the doctor and got a sick note. I rested for three days. Now I feel good and do more sport.",
  "I like Schwelm because it's quiet. My favourite food is koshari, I like it best. I also like football a lot. For her birthday I gave my daughter a book. She liked it very much.",
  "I work as a Solutions Architect at Lenovo. I like my job because it's very interesting. I often visit customers all over Germany. Sometimes I'm tired because I have to travel a lot. But I learn something new every day.",
  "I think that life in Germany has many advantages. The schools are good and it's safe. One disadvantage is the weather, because it often rains. I believe my children have a good future here. But I don't know whether we'll always stay here.",
  "When I came to Germany it was winter. For the first time I saw so much snow. I was excited but also a bit sad because I missed my parents. When my family joined me we were very happy. I like remembering that time.",
  "In Egypt it's much warmer than in Germany. Food in Egypt tastes better to me. But in Germany life is quieter and the trains are faster. I most like being in Egypt in summer with my family.",
  "Today I'm wearing the blue trousers and the white shirt. For important meetings I wear the dark suit. At home I prefer comfortable clothes. In winter I need the warm coat because it's often cold in Schwelm.",
  "My best friend is called Karim. He's a tall man with a short beard. He's an honest and helpful person. He always has a good idea. I like him because he's very funny and often helps me.",
  "Waiter: Good evening! What would you like? — I'd like the menu. Do you have something without pork? — Yes, the chicken with rice. — Good, I'll take that. And I'd like a water. … Could you bring me the bill, please? — Sure. Together or separately? — Together, please.",
  "Learn a little German every day! Always be on time, that's very important here. Don't forget the shops are closed on Sunday. Separate your rubbish! And buy a Deutschlandticket, then you travel cheaply by train.",
  "Last week the heating was broken. It was very cold, so I called the landlord. The technician could only come after three days. That was really annoying. Nevertheless he was very friendly and repaired everything quickly.",
  "Dear Sir or Madam, I'd like to make an appointment. I've had back pain for a week. I work in the mornings, but I have time in the afternoons from 3 pm. Does Thursday suit you? Kind regards, Muhammad Toffaha",
  "My goal is to do the A2 certificate next month. After that I want to learn B1. I'm very interested in AI and new technology. In summer we're going to Egypt. I'm already looking forward to seeing my parents. I think of them every day.",
  "In my free time I like programming apps for my family. Unfortunately I often have no time to do sport. At the weekend we go for walks. I enjoy playing football with my children. Karim, would you like to go on a trip with us on Saturday?",
  "Can you tell me where I get the form? I'd like to know whether I need an appointment. Do you know how high the fee is? Could you please explain which documents I have to bring?",
  "In five years I'll speak fluent German. I may be working as a Senior Architect at NVIDIA. My children will speak German and English well. We'll probably buy a house. I hope my parents visit us often.",
  "In the morning I read the news on my phone. At work I write many emails. In the evening I send photos to my family in Egypt. I think the internet is very practical. One disadvantage is that the kids are on their phones too much.",
  "Selling a children's bike! The bike is three years old and in good condition. Price: 40 euros. Interested? Call me or ring at Toffaha's on the second floor. Best regards",
  "Dear Lena, thanks a lot for the invitation! Unfortunately I can't come on Saturday because I have to go to Hamburg. How about coffee on Sunday? Best wishes, Muhammad",
  "I'm learning German because I live and work in Germany with my family. In the last 30 days I studied every day. At first the grammar was hard, but I didn't give up. I wrote many texts about my life. Now I'm ready for the exam. After that I'll learn B1 because I want to speak fluently. I'll do it!"
];

var EXAM_EN = {
  lesen: [
    { text: "Schwelm is getting a new playground. In Schwelm's town park the town is building a large playground. Construction starts in March and takes about four months. There will be a climbing wall, a water play area and many benches for parents. The playground costs €250,000. Half is paid by the state of NRW. Mayor Klein says: 'Many young families are moving to Schwelm. They need space to play.' During construction the path by the lake is closed. Walkers should use the entrance on Bahnhofstraße.",
      q: ["When will the playground probably be finished?", "Who pays part of the playground?", "Why is the town building the playground?", "What will the new playground have?", "What should walkers do?"] },
    { text: "Basement: groceries · drinks · bakery | Ground floor: cosmetics · jewellery · watches · information | 1st floor: women's fashion · shoes | 2nd floor: men's fashion · kids' fashion · toys | 3rd floor: electronics · phones · computers · repair service | 4th floor: household · furniture · restaurant · toilets",
      q: ["Your phone is broken.", "You're looking for a present for your son (8): a game.", "You want to buy bread rolls.", "You want to have lunch.", "You have a question and don't know where something is."] },
    { text: "Hi Muhammad, thanks so much for helping with the move on Saturday! We couldn't have done it without you. The new flat is great, only the kitchen isn't ready because the cooker only arrives next week. So until then we're not cooking but ordering pizza :) On the 20th we're having a small party. Can you come with your family? We start at 4 pm so the kids can join too. Please don't bring anything — we have enough food. Let me know by Wednesday. Best, Jonas",
      q: ["What did Muhammad do on Saturday?", "Why isn't Jonas cooking at the moment?", "Why does the party start at 4 pm?", "What should Muhammad bring?", "By when should Muhammad reply?"] },
    { text: "A) Evening German course, Mon + Wed 6–8 pm, for working people, A2 → B1 · B) Football club looking for kids aged 6–10, training Saturdays 10 am, first 4 weeks free · C) Maths tutoring for school years 3–6, at your home, €15/hour · D) Used kids' bikes from €30, Becker bike shop · E) Yoga for beginners, Tuesday 9 am, women only · F) Arabic–German language café, every Friday 7 pm, town library, free entry",
      q: ["Karim works during the day and wants to improve his German.", "Anna is looking for a sport for her 8-year-old son.", "Mr Weber wants to go swimming at the weekend.", "Lea (10) has problems in maths.", "Samir wants to meet people and speak German for free."] }
  ],
  hoeren: [
    ["Dear passengers, the regional express to Hagen is unfortunately cancelled today. Please take the S-Bahn on platform 4. It leaves in ten minutes. — What should passengers do?",
      "Hi Muhammad, it's Lena. The party isn't on Friday but on Saturday. Can you bring a salad? We have enough drinks. Bye! — When is the party?",
      "Hello, this is Dr Berger's practice. Your appointment tomorrow at nine unfortunately has to be cancelled. Please call us to arrange a new one. — What should the patient do?",
      "And now the weather for NRW: rain in the morning, friendly with lots of sun in the afternoon. Up to 18 degrees. — What's the weather like in the afternoon?",
      "Dear customers, today's special offer: all children's shoes are 20% cheaper. You'll find them on the first floor. — What's cheaper today?"],
    ["On Monday Sara was at the dentist.", "On Tuesday she visited her grandmother and they baked a cake.", "On Wednesday she went to the cinema with colleagues; the film was boring.", "On Thursday she went swimming, as every week.", "On Friday she tidied the whole flat because guests came on Saturday."],
    ["Excuse me, how do I get to the town hall? — Straight on to the traffic light, then right. It's next to the post office.",
      "What does the shirt cost? — Normally €49, today only €39. — OK, I'll take it.",
      "When's the next bus to Wuppertal? — At ten past three. The 3 o'clock one has gone.",
      "Coming to the restaurant tonight? — I can't today, I have to help my daughter with homework. Tomorrow gladly!",
      "I'd like to exchange this dress, it's too small. — Do you have the receipt? — Yes, here."],
    ["Mr Aydin came to Germany three years ago with his wife and two children, to Bochum.",
      "At first he couldn't speak a word of German and took a course at the adult education centre.",
      "Now he works as a bus driver and enjoys it because he talks to people every day.",
      "The hardest thing for him is the weather — he misses the sun. But people are very friendly.",
      "Next year he wants to take the B1 exam."]
  ]
};
