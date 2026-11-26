/**
 * File 2 — The Inspection. South Embankment, Wednesday 7 June 1967, 18.30 (amended from 10.55: the tide).
 *
 * What this file does for the story: the Marshal arrives, having been whitewashed for since File 1, and laughs;
 * Voronova is right in front of everybody and nobody will have it; the Wing speak for the first time (to each other:
 * Mother hears only squawking); Borovsky is seen with a mop; and the Order names OTLIV and a list that came from
 * Finance Section. Level brief: docs/story/missions/m2.md.
 */
import { say, type FileStory } from './types';

export const M2_STORY: FileStory = {
  id: 'm2',
  number: 2,
  title: 'The Inspection',
  district: 'South Embankment',
  blurb: 'The South Embankment. A parade, a lectern, a flock.',
  date: '1967-06-07',
  hour: '18.30',

  briefing: {
    file: 'SECTION G / FILE 2',
    dateline: 'DARTMOUTH · WEDNESDAY 7 JUNE 1967 · 18.30 HRS (AMENDED FROM 10.55. REASON: TIDE)',
    brief:
      'Operative SCRUMPY. The dispatch names a submarine, S-197. Her berthing orders are bound into the Inspection Order, which lies on the lectern of the reviewing stand, South Embankment, while Colonel Grushkov shows his garrison to a Marshal. The lectern is watched by his Adjutant, Lieutenant Voronova, who misses nothing. You are attached to the Bomber Wing. Break the parade, take the Order, bring it to the Dorothy May. The garrison has been standing since 10.55.',
    orders: [
      'Scout the reviewing stand and the Adjutant from the rooftops',
      'Find a way to get her away from the lectern. The Wing is one way',
      'Take the Inspection Order',
      'Deliver it to the lobster pot aboard the Dorothy May',
    ],
    dossier:
      'Operative SCRUMPY,\n\n' +
      'The dispatch you recovered names a submarine, S-197, due to berth in the Dart. Her berthing orders are bound into the Commandant’s Inspection Order, which will lie on the lectern of the reviewing stand on the South Embankment while Colonel Grushkov shows his garrison to Marshal of the Soviet Union N. F. Lebedev.\n\n' +
      'The parade was called for 10.55. The Marshal comes by launch, and the launch could not come alongside until the tide served. The Kommandatura has since discovered tide tables. The garrison has been standing on the Embankment for seven and a half hours.\n\n' +
      'The lectern is watched by the Adjutant, Lieutenant I. P. Voronova, who misses nothing; except, we hope, a sky full of gulls.\n\n' +
      'For this operation you are attached to the Bomber Wing: four veterans of ’44 on the roof of the Royal Castle Hotel. They will follow you. They have never followed anyone. As bomber lead you carry a larger payload and turn a little wider.\n\n' +
      'There is more than one way to empty a lectern. Watch before you commit. The Order goes to the Dorothy May.',
    signed: '— MOTHER, for the Committee',
  },

  objectives: [
    { id: 'scout', text: 'Scout the stand: hold {scout} on Lieutenant Voronova at the lectern' },
    { id: 'lectern', text: 'Get the Adjutant away from the lectern' },
    { id: 'signal', text: 'Land with the Bomber Wing on the Royal Castle Hotel roof and {signal}', optional: true },
    { id: 'strike', text: 'Lead the Wing along the column as it passes the stand, and {poop}', optional: true },
    { id: 'document', text: 'Take the Inspection Order from the lectern' },
    { id: 'deliver', text: 'Deliver the Order to the lobster pot aboard the Dorothy May' },
    { id: 'bun', text: 'Liberate a saffron bun from the Marshal’s table', optional: true },
  ],

  radio: [
    {
      id: 'm2.start',
      when: 'The player takes control on St Saviour’s roof.',
      lines: [
        say('mother', 'Bomber lead, Mother. Today you are the weather.'),
        say('mother', 'The stand is east of you, on the Embankment. They have been on parade since 10.55. The Marshal’s launch waited for the tide.'),
      ],
    },
    {
      id: 'm2.scout_hint',
      when: 'Ten seconds after the start, Voronova not yet tagged.',
      lines: [say('mother', 'Look before you commit. The mooring pile behind the stand has the view. Hold {scout} on the Adjutant.')],
    },
    {
      id: 'm2.marshal_seen',
      when: 'First clear line to the stand within 150 m.',
      lines: [say('mother', 'The old gentleman in the greatcoat is Marshal Lebedev. Dartmouth is his twelfth garrison this month. He would like his tea.', 'colour')],
    },
    {
      id: 'm2.tagged_voronova',
      when: 'Voronova tagged.',
      lines: [
        say('mother', 'Lieutenant Voronova. She will not leave that lectern unless something dreadful happens to the parade.'),
        say('mother', 'Or to the Marshal’s tea. She trusts nobody else with the samovar. I mention it.'),
      ],
    },
    {
      id: 'm2.tagged_grushkov',
      when: 'Grushkov tagged.',
      lines: [say('mother', 'Colonel Grushkov, Commandant. He has rehearsed this for a month. He has not rehearsed gulls.', 'colour')],
    },
    {
      id: 'm2.banner_seen',
      when: 'Perched on the stand canopy or the station roof, with the banner’s guy-rope in view.',
      lines: [say('mother', 'That banner is held up by one rope and a clove hitch. The Army ties a poor clove hitch. {interact} would see to it.')],
    },
    {
      id: 'm2.borovsky',
      when: 'First pass within 30 m of Borovsky, who is mopping the latrine hut at the south end of the Embankment.',
      lines: [say('mother', 'The man with the mop is Private Borovsky. Latrines, pending enquiry. That was us, Scrumpy. Fly on.', 'colour')],
    },
    {
      id: 'm2.clerk',
      when: 'First pass within 30 m of the clerk, standing in the crowd where his bench was.',
      lines: [say('mother', 'Mr Widger is in the crowd. They have built the stand on his bench. He has written to somebody about it.', 'colour')],
    },
    {
      id: 'm2.wing_intro',
      when: 'First arrival within 40 m of the hotel roof.',
      lines: [
        say('mother', 'The Wing is on the Royal Castle Hotel. Veterans of ’44. Land among them and {signal}.'),
        say('gristle', 'Lead, Gristle. Say the word and I’ll do the Marshal personally.', 'colour'),
        say('wimbush', 'I’ve been saving this since Tuesday, dear.', 'colour'),
        say('nelson', 'Bear left, lad. I can only see the left.', 'colour'),
        say('padre', 'For what they are about to receive.', 'colour'),
      ],
    },
    {
      id: 'm2.signalled',
      when: 'The Wing is signalled and airborne.',
      lines: [
        say('mother', 'They’re up. Mrs Wimbush is making a noise. I take it for agreement.'),
        say('mother', 'Come at the head of the column as it passes the stand. {poop}, and they drop when you drop.'),
      ],
    },
    {
      id: 'm2.formed',
      when: 'The Wing has closed up in its box behind the leader.',
      lines: [say('gristle', 'Formed up. Try to hit Russia this time, Padre.', 'colour'), say('padre', 'I aim, my son. Providence disposes.', 'colour')],
    },
    {
      id: 'm2.miss',
      when: 'A pass with no hits on the column.',
      lines: [
        say('mother', 'The Wing has bombed the Embankment. The Embankment was not the target. They are circling the hotel. {signal} again.'),
        say('gristle', 'Missed the entire army. Takes skill, that.', 'colour'),
      ],
    },
    {
      id: 'm2.held_elsewhere',
      when: 'Enough hits, but not in front of the stand.',
      lines: [say('mother', 'Good hits, wrong place. They only break in front of the stand, where the Colonel can see it happen.')],
    },
    {
      id: 'm2.held',
      when: 'A pass with too few hits; the formation holds.',
      lines: [say('mother', 'The formation held. The Wing is reloading. Again, as they pass the stand.'), say('padre', 'Back to the roof, chaps. Loaves and fishes.', 'colour')],
    },
    {
      id: 'm2.broken',
      when: 'The formation breaks in front of the stand.',
      lines: [
        say('mother', 'Formation broken. Voronova has left the lectern. The Order, Scrumpy. Now.', 'danger'),
        say('nelson', 'England expects.', 'colour'),
        say('wimbush', 'Lovely. Lovely.', 'colour'),
      ],
    },
    {
      id: 'm2.samovar',
      when: 'A hit in the samovar; Voronova goes to fetch fresh tea herself.',
      lines: [say('mother', 'In the samovar. She’s gone for fresh herself, as advertised. Ten seconds. The lectern.', 'danger')],
    },
    {
      id: 'm2.banner_down',
      when: 'The banner’s rope is pulled and it falls across the platform party.',
      lines: [say('mother', 'The banner’s come down on the platform party. Glory to somebody. The lectern is unattended.', 'danger')],
    },
    {
      id: 'm2.marshal_hit',
      when: 'First hit on the Marshal’s greatcoat.',
      lines: [say('mother', 'That was the Marshal’s greatcoat.'), say('mother', 'He is laughing. Only the Adjutant has noticed.', 'colour')],
    },
    {
      id: 'm2.got_order',
      when: 'The Order is in the beak.',
      lines: [say('mother', 'You have the Order. Boat Float, the Dorothy May. Over the rooftops, not along the road.')],
    },
    {
      id: 'm2.bun',
      when: 'A saffron bun is taken from the Marshal’s table.',
      lines: [say('mother', 'A saffron bun, from the Marshal’s own table. I didn’t see it and neither did you.', 'colour')],
    },
    {
      id: 'm2.delivered',
      when: 'The Order is delivered. The hand again; two mackerel and a page of the tide table.',
      lines: [
        say('mother', 'The Order is aboard. Two mackerel this time, and a page from the tide table.'),
        say('mother', 'He writes that the tide was wrong for parades and he could have told them. He could.', 'colour'),
        say('mother', 'Bring the Wing home, Bomber lead.'),
      ],
    },
    {
      id: 'm2.compromised',
      when: 'Compromised: Lockdown. Voronova takes the Order indoors.',
      lines: [
        say('mother', 'She’s taken the Order indoors under her arm. Break off, Bomber lead.', 'danger'),
        say('mother', 'Mrs Wimbush is following it to a window. I did not ask her to. One doesn’t.'),
      ],
    },
  ],

  barks: [
    {
      who: 'voronova',
      role: 'guard',
      calm: [
        'Paragraph four. The Colonel will skip it. He always skips four.',
        'Seven hours forty on parade. I have recorded it.',
        'The Order stays under my hand. That is where orders are safe.',
        'Kulik. Your collar. Osipov. Your everything.',
        'The tide table was in the harbour office all along. I said so in May.',
        'Twelve men, three files. One is asleep standing. I know which.',
      ],
      suspicious: [
        'That gull has been on that pile for four minutes.',
        'Gulls do not study lecterns.',
        'Stay where you are, bird. I am counting you.',
        'Colonel. Five gulls in formation. Gulls do not have formations.',
        'It is looking at the Order. Not at the buns. At the Order.',
        'Hm. The same one. I am almost sure.',
      ],
      alarmed: [
        'Guards! That gull! The grey one! …The LEFT grey one!',
        'The Order! Colonel, the ORDER!',
        'Seize it! It is not ‘only a bird’!',
        'Kulik! Osipov! The roofs!',
        'It planned this. It PLANNED this.',
        'Close the stand! Nothing leaves! No one!',
      ],
      afterwards: [
        '…Carry on. I shall be writing a memorandum.',
        'Nothing. For now. I have its description.',
        'Grey and white. Yellow eye. That is all of them. That is the difficulty.',
        'The Colonel says wind. There was no wind.',
        'I request nets. I request them in writing.',
        'As you were. Not you, Kulik.',
      ],
      extra: {
        formation: ['Colonel. Five gulls in formation. Gulls do not have formations.'],
        chaos: ['Back in line! BACK IN LINE!', 'Form up! FORM UP!'],
        samovar: ['Nobody touch the samovar. I will fetch it myself.'],
        banner: ['Who secured this rope? WHO?'],
        marshal: ['He laughed. The Marshal laughed. I shall record it; nobody else will.'],
        theft: ['The Order! The ORDER is gone!', 'Colonel. The Inspection Order.'],
        recover: ['Papers belong on the lectern.', 'Who dropped this? Nobody? Naturally.'],
      },
    },
    {
      who: 'kulik',
      role: 'guard',
      calm: [
        'Eyes front. Eyes front. Eyes… front.',
        'Seven hours. My feet have gone home without me.',
        'Buns. Up there. Twelve of them. I counted.',
        'Osipov. Psst. Is he here yet? …He is? Since when?',
        'I was promised the seaside. This is the seaside. I see.',
        'If I sleep with my eyes open, is it sleeping?',
      ],
      suspicious: [
        'Lieutenant? There is a bird. …There are many birds. Sorry.',
        'That one’s looking at me. Osipov, it’s looking at me.',
        'Shoo? Am I permitted to shoo?',
        'Is it on the list? Of things to guard against?',
        'It wants the buns. I understand it completely.',
        'Don’t. Please. I am on a charge already.',
      ],
      alarmed: ['Halt! Halt, bird! It isn’t halting!', 'Lieutenant! It’s doing something!', 'Shoo! SHOO!', 'I’ve got it! I haven’t got it!', 'Which gull? WHICH gull?', 'Osipov! Left! No, its left!'],
      afterwards: [
        'Was that my fault? It’s usually my fault.',
        'Gone. Good. I mean: bad. Gone, bad.',
        'Nobody saw me run. Osipov, nobody saw.',
        'My cap. Has anyone seen my cap?',
        'Seven hours, and THEN a gull.',
        'I shall not mention it in my letter.',
      ],
    },
    {
      who: 'osipov',
      role: 'guard',
      calm: [
        'Stand still and nothing is your fault. First rule.',
        'Eleven garrisons this month, the Marshal. We are the twelfth. Lucky.',
        'I have guarded worse. A cheese depot. That was a war.',
        'Kulik. Lock your knees and you fall over. Unlock them.',
        'Forty-one days. Then it is somebody else’s gull.',
        'Do not look at the buns. They can tell.',
      ],
      suspicious: [
        'Bird at two o’clock. Not my arc.',
        'I see it. I am choosing not to have seen it.',
        'Report a gull and you fill in the form. I know that form.',
        'It is only looking. Looking is not in regulations.',
        'Steady, Kulik. It can smell fear. Or buns.',
        'Hm. That one has a plan. I have known officers with less.',
      ],
      alarmed: [
        'Now it is my arc. Halt!',
        'Shoo! By order!',
        'Kulik, the left! The LEFT!',
        'Guard the buns! …The ORDER! Guard the Order!',
        'Not on my watch! Somebody’s watch! Not mine!',
        'After it! At a regulation pace!',
      ],
      afterwards: [
        'Nothing happened. Agreed? Agreed.',
        'Write: ‘wind’. Always write ‘wind’.',
        'Forty-one days. Still forty-one.',
        'The Lieutenant will want it in triplicate.',
        'I told you. Stand still. Nothing is your fault.',
        'A cheese depot, Kulik. This is nothing.',
      ],
    },
    {
      who: 'grushkov',
      role: 'npc',
      calm: ['Magnificent. The finest garrison in Devon.', 'Marshal, observe the kerbs. Whitewashed. Twice.', 'Shoulders BACK. The Marshal is looking at your shoulders.', 'A small speech. Eleven pages.'],
      suspicious: ['Voronova, do not fuss. They are birds.', 'Ignore it. It is not on the programme.', 'A gull, Lieutenant. At the seaside. Imagine.'],
      alarmed: [
        'WHO AUTHORISED THE GULLS?!',
        'This will be in my report. MY report!',
        'Stop them! No, do not shoot, it is a PARADE!',
        'Marshal, I assure you, this is not typical!',
        'Somebody fetch a NET!',
        'The ORDER! A GULL has the ORDER!',
      ],
      afterwards: ['Re-form! RE-FORM! As if nothing happened!', 'Steady! Eyes FRONT! It is only birds!', 'Wind. It was wind. Write that down.', 'Marshal, the buns are quite untouched. Mostly.'],
    },
    {
      who: 'marshal',
      role: 'npc',
      calm: ['Good. Yes. Very straight.', 'How long have they stood? …Sit them down, Colonel.', 'The tea is good. Who made it? Promote him.'],
      suspicious: ['There is a gull on your stand, Colonel.', 'It has an intelligent face. More than some.', 'Let it be. It has come to be inspected.'],
      alarmed: ['Ha.', 'My coat. …It is an old coat.', 'At Stalingrad we had crows. Crows are worse.'],
      afterwards: ['I was a private once. I also blamed birds.', 'Do not punish them, Colonel. Feed them.', 'I should like to see the river now.'],
    },
    {
      who: 'clerk',
      role: 'npc',
      calm: ['That is my bench. Under the Colonel. That is my bench.', 'I have written to the Borough about it. In triplicate.', 'No bench, no lunch. I have had a sandwich standing up.'],
      suspicious: ['There. That one. I know that one.', 'It took four chips on Saturday. Four.', 'Officer. Officer? Nobody ever listens.'],
      alarmed: ['It’s him! The chip one! Officer!', 'I told them! I put it in writing!', 'Mind my bench! That’s Borough property!'],
      afterwards: ['Nobody listens. I shall minute it.', 'Well. They’ve seen it for themselves now.', 'I want my bench back by Monday.'],
    },
    {
      who: 'borovsky',
      role: 'npc',
      calm: ['Latrines. South Embankment. Pending enquiry.', 'From here I can see the parade. And the latrines. Mostly the latrines.', 'Dear Mama. I have been given a mop.'],
      suspicious: ['No. Not you. Not today. I have a MOP.', 'I am not on duty. I do not see you. Go away.', 'You are going to do it to them. Aren’t you.'],
      alarmed: ['Ha! HA! Now they see! Now they ALL see!', 'It was not only me! Lieutenant! It was not only me!', 'The whole parade! And they gave ME latrines!'],
      afterwards: ['Somebody else’s report. Good.', 'I almost miss the table.', 'Dear Mama. Today was better. I cannot say why.'],
    },
    {
      who: 'garrison',
      role: 'npc',
      calm: ['Left. Left. Left, right, left.', 'Seven hours. I have named my blisters.', 'Do not faint. Fainting is noted.', 'I can smell buns.'],
      suspicious: ['Do not look up. Never look up.', 'Something is circling.', 'Is that five of them?'],
      alarmed: ['My cap!', 'It’s in my collar! It’s gone down my COLLAR!', 'Break ranks! No! Hold ranks! Which?', 'Not the greatcoat! Not the Marshal’s greatcoat!'],
      afterwards: ['As if nothing happened. He said so. Nothing happened.', 'I am not washing this until I am told how.', 'Seven hours. For that.'],
    },
  ],

  debrief: {
    standard:
      'The Inspection Order confirms it. S-197 berths at Sandquay on Sunday’s tide for forty-eight hours’ resupply, forward hatch open while stores go aboard. And on Saturday, at the lowest water of the month, the Kommandatura begins Operation OTLIV, the Ebb: a search of every boat on the Dart while none of them can float away. Annex A, the list of premises, is ‘as supplied by Finance Section’. Mother would like to know what Finance Section has been supplied with. The Colonel has ordered nets.',
    compromised:
      'The Order went indoors under the Adjutant’s arm. Mrs Wimbush followed it to a window, and we have her account, which is chiefly about a bun. S-197 berths at Sandquay on Sunday. On Saturday, at the lowest water of the month, the Kommandatura begins Operation OTLIV, the Ebb: a search of every boat on the Dart. There is a list of premises. We have not seen it. They have. The Colonel has ordered nets, and the Adjutant has been given everything she asked for.',
  },

  intercept: {
    id: 'm2.intercept',
    heading: 'KOMMANDATURA · OFFICE OF THE ADJUTANT · MOST SECRET · To: Col. A. I. Grushkov · Subject: The Gull Question',
    body: [
      '1. The Order was not taken by the wind, by a thief, or by ‘a bird with a grudge’. It was taken by a bird with a plan.',
      '2. I request (a) nets, (b) an owl, (c) that the men stop feeding them, (d) that every gull’s legs be examined for rings.',
      '3. I note the Colonel has approved (a), refused (b) as superstition and (d) as impractical, and is himself feeding them as I write.',
      '4. The Marshal laughed. I record it because nobody else will.',
      'Lt I. P. Voronova',
    ],
    footnote: 'By hand of L/Cpl Utkin. Received three days late (lunch).',
    alt: [
      {
        when: 'The Order was taken without a strike.',
        body: [
          '1. The Order left the lectern while I was absent for nine seconds on the Marshal’s business. Nine.',
          '2. Nothing else was disturbed. The buns were counted. A thief takes buns. This took paragraph four.',
          '3. I request (a) nets, (b) an owl, (c) that the men stop feeding them, (d) that every gull’s legs be examined for rings.',
          '4. The Colonel has approved (a). He is feeding them as I write.',
          'Lt I. P. Voronova',
        ],
      },
    ],
  },

  committee: [
    { when: 'The formation was broken.', text: 'The Marshal’s greatcoat has been forwarded to Moscow for analysis.' },
    { when: 'The formation was broken.', text: 'Colonel Grushkov has requested anti-gull measures. The Committee is not aware of any that work.' },
    { when: 'The formation was broken more than once.', text: 'The formation was broken more than once. The Committee notes that this exceeds requirements, and approves.' },
    { when: 'Twelve or more hits by the Wing.', text: 'Mrs Wimbush asks that her contribution be recorded. It is so recorded.' },
    { when: 'The Wing was signalled.', text: 'The Committee observes that four additional gulls were fed from Section funds, and asks whether three would have served.' },
    { when: 'The Order was taken without a strike.', text: 'No strike was called. The Committee welcomes the saving in buns.' },
    { when: 'Always, last.', text: 'The Committee notes that the garrison stood for seven and a half hours for want of a tide table, price sixpence. It draws no conclusion.' },
  ],

  personnel: [
    { id: 'm2.about_to_receive', kind: 'citation', title: 'For What They Are About to Receive', text: 'Broke the formation on the first pass.', when: 'Formation broken on the first strike.' },
    { id: 'm2.before_the_marshal', kind: 'citation', title: 'Before the Marshal', text: 'Engaged a Marshal of the Soviet Union. The Marshal was amused. This is not on file elsewhere.', when: 'A hit on the Marshal.' },
    { id: 'm2.contribution', kind: 'citation', title: 'Mrs Wimbush’s Contribution', text: 'Led a strike in which the Wing scored twelve hits. Mrs Wimbush has asked for the wording.', when: 'Twelve or more hits by the Wing.' },
    { id: 'm2.bun_fight', kind: 'citation', title: 'Bun Fight', text: 'Liberated a saffron bun during a general engagement.', when: 'A bun taken while the formation is broken.' },
    { id: 'm2.eyes_front', kind: 'citation', title: 'Eyes Front', text: 'Took the Order without disturbing the parade.', when: 'Order taken with no strike called.' },
    { id: 'm2.fresh_tea', kind: 'citation', title: 'Fresh Tea', text: 'Caused the Adjutant to leave her post on a point of catering.', when: 'Order taken during the samovar errand.' },
    { id: 'm2.glory_to', kind: 'citation', title: 'Glory To', text: 'Lowered a banner onto a platform party.', when: 'Order taken while the banner is down.' },
    { id: 'm2.reform', kind: 'citation', title: 'RE-FORM!', text: 'Broke the formation twice. Once was required.', when: 'Formation broken twice.' },
    { id: 'm2.embankment', kind: 'reprimand', title: 'The Embankment, Bombed', text: 'Led a strike on a public promenade. The promenade had done nothing.', when: 'A Wing pass with no hits.' },
    { id: 'm2.counted', kind: 'reprimand', title: 'Counted', text: 'The Adjutant has this operative’s description. It is every gull’s description. Even so.', when: 'Spotted by Voronova twice or more.' },
  ],

  borovskyFile: 'Appointed to the new Anti-Gull Section (strength: one man, one net) on grounds of experience.',
  pot: 'Two mackerel, and a page of the tide table: ‘Tide was wrong for parades. Could have told them. T.’',
  mothersNote: 'Leads well. The Wing follow him, which they have never done for anyone. I do not ask why.',
  garrisonNote: 'A bird with a plan. (Lt Voronova, dissenting from the Colonel’s ‘wind’.)',
};
