/**
 * File 1 — A Chip Off the Old Block. Bayard's Cove, Saturday 3 June 1967, 13.20.
 *
 * What this file does for the story: it puts a name to the sentry, the courier, the baker and the clerk; it has the
 * garrison whitewashing for a Marshal who does not arrive until File 2; and it ends with a hand, a mackerel and no
 * message. Level brief: docs/story/missions/m1.md.
 */
import { say, type FileStory } from './types';

export const M1_STORY: FileStory = {
  id: 'm1',
  number: 1,
  title: 'A Chip Off the Old Block',
  district: 'Bayard’s Cove',
  blurb: 'Bayard’s Cove. One sentry, one dispatch, one lunch.',
  date: '1967-06-03',
  hour: '13.20',

  briefing: {
    file: 'SECTION G / FILE 1',
    dateline: 'DARTMOUTH, DEVON · SATURDAY 3 JUNE 1967 · 13.20 HRS',
    brief:
      'Operative SCRUMPY. Each day a Kommandatura courier leaves his dispatch on the table outside the Custom House, Bayard’s Cove, and goes to lunch. It is watched by one sentry, Private Borovsky: punctual, homesick, devoted to his tea. Take the dispatch to the lobster pot aboard the crabber DOROTHY MAY, Boat Float. A friend collects. You will take lunch first. To them you are just a gull. Behave like one, right up until you don’t.',
    orders: [
      'Take off, fly, and land on the station roof by the Boat Float',
      'Lunch: chips or a pasty. Eat it, or stash it at the nest',
      'Take the dispatch from the Custom House table before the courier is back',
      'Deliver it to the lobster pot aboard the Dorothy May',
    ],
    dossier:
      'Operative SCRUMPY (herring gull, adult, no band on record),\n\n' +
      'Each day at one o’clock Lance-Corporal Utkin, courier to the Kommandatura, leaves his dispatch on a table outside the old Custom House on Bayard’s Cove and takes his lunch at the bakery door. He takes it slowly. The table is watched by one sentry, Private G. Borovsky, who is punctual, homesick and devoted to his tea.\n\n' +
      'You will first demonstrate flight, perching and the acquisition of lunch, in that order. You will then take the dispatch and place it in the lobster pot aboard the crabber DOROTHY MAY, moored in the Boat Float, where a friend will collect it. You will not meet the friend. Nobody has.\n\n' +
      'There are two ways to do this. Wait above the sentry until his back is turned, or give him a reason to leave. The Committee has no preference, provided the result is the same.\n\n' +
      'The garrison is whitewashing its kerbs. Find out for whom.\n\n' +
      'Remember: to them you are just a gull. Behave like one, right up until you don’t.',
    signed: '— MOTHER, for the Committee',
  },

  objectives: [
    { id: 'takeoff', text: 'Take off from the nest: {flap}' },
    { id: 'perch', text: 'Land on the station roof: hold {land} as you come near it' },
    { id: 'scout', text: 'Scout the sentry on Bayard’s Cove: hold {scout} on him', optional: true },
    { id: 'lunch', text: 'Lunch: {interact} a chip or the pasty, then {eat} it or stash it at the nest' },
    { id: 'dispatch', text: 'Take the dispatch from the table outside the Custom House' },
    { id: 'deliver', text: 'Deliver the dispatch to the lobster pot aboard the Dorothy May' },
    { id: 'mackerel', text: 'See what the friend has left in the pot', optional: true },
  ],

  radio: [
    {
      id: 'm1.start',
      when: 'The player takes control on the nest.',
      lines: [say('mother', 'Afternoon, Scrumpy. Mother here. You’re on the nest. {flap} to take off, when you’ve finished with the view.')],
    },
    {
      id: 'm1.takeoff',
      when: 'First time airborne.',
      lines: [
        say('mother', '{forward} for speed. Look where you want to go. {dive} to dive, {back} to brake.'),
        say('mother', 'Now the station roof, by the Boat Float. Hold {land} near it and the wings will do the rest.'),
      ],
    },
    {
      id: 'm1.perch_hint',
      when: 'Forty seconds airborne and not yet on the station roof.',
      lines: [say('mother', 'The station is the low building on the Embankment, north of you. Follow the marker. Brake with {back}, or hold {land}.')],
    },
    {
      id: 'm1.wing_watch',
      when: 'First pass within 40 m of the Royal Castle Hotel roof. The Wing is seen before it is needed.',
      lines: [say('gristle', 'That’s him. Her new boy. Doesn’t say much.', 'colour'), say('wimbush', 'He has nice manners with a chip, dear. I watched.', 'colour')],
    },
    {
      id: 'm1.perched',
      when: 'Landed on the station roof.',
      lines: [
        say('mother', 'Good. Bayard’s Cove is south along the river, past the ferry slip. One sentry, one table, one dispatch.'),
        say('mother', 'Standing Order 4: no operative works on an empty stomach. The clerk on the Embankment bench has chips.'),
        say('mother', 'The bakery in the cove has a pasty on the sill. Tastier. Miss Luscombe has a voice like a ship’s siren. Riskier.'),
      ],
    },
    {
      id: 'm1.food_is_ammunition',
      when: 'First food eaten.',
      lines: [say('mother', 'Noted. What goes in comes out, Scrumpy. Lunch is also ammunition. {poop} when the moment arrives.')],
    },
    {
      id: 'm1.lunch_done',
      when: 'Lunch secured, dispatch not yet delivered.',
      lines: [say('mother', 'Morale restored. Now, the dispatch.')],
    },
    {
      id: 'm1.courier',
      when: 'First arrival within 120 m of the cove. The courier is at the bakery door.',
      lines: [say('mother', 'The courier is Lance-Corporal Utkin. He lunches at the bakery door for as long as Miss Luscombe will stand it.', 'colour')],
    },
    {
      id: 'm1.scout_now',
      when: 'Within 120 m of Borovsky with a clear line to him, not yet tagged.',
      lines: [say('mother', 'There’s your sentry. Hold {scout} and keep him in the middle of your view.')],
    },
    {
      id: 'm1.tagged',
      when: 'Borovsky tagged.',
      lines: [
        say('mother', 'Private Borovsky, G. Post, tea, river, fort, and round again. Note when his back is turned.'),
        say('mother', 'Note also the tea. He writes to his mother about that tea.', 'colour'),
      ],
    },
    {
      id: 'm1.whitewash',
      when: 'Twenty seconds after the tag, or first pass over the field kitchen, where the cook is painting the kerb.',
      lines: [say('mother', 'They’re whitewashing the kerbs. A Marshal is coming on Wednesday. Nobody whitewashes for a colonel.', 'colour')],
    },
    {
      id: 'm1.gutter',
      when: 'Perched on the Custom House gutter.',
      lines: [say('mother', 'A calm sentry never looks this high. A suspicious one does. Wait for his back.')],
    },
    {
      id: 'm1.lamp',
      when: 'Perched on the quay lamp.',
      lines: [say('mother', 'From here you can see his mug on the barrel. He is very attached to that mug.')],
    },
    {
      id: 'm1.tea',
      when: 'Borovsky leaves for the field kitchen after a hit on his tea.',
      lines: [say('mother', 'Into the tea. He’s off up the lane for another. The table is unwatched. Go.', 'danger')],
    },
    {
      id: 'm1.tunic',
      when: 'Borovsky leaves for the pump after a hit on his tunic.',
      lines: [say('mother', 'Direct hit. He’s gone to the pump to scrub. The table is yours.', 'danger')],
    },
    {
      id: 'm1.sugar',
      when: 'The sugar is taken from the field kitchen, and Borovsky goes to complain that his tea is undrinkable.',
      lines: [say('mother', 'You’ve taken the sugar. He will not drink it without, and has gone to say so. Tradecraft, of a sort.', 'danger')],
    },
    {
      id: 'm1.baker',
      when: 'The pasty is taken in Miss Luscombe’s sight; she shouts, and Borovsky and the courier both go to help.',
      lines: [say('mother', 'That is Miss Luscombe. Borovsky has gone to help. Everybody has gone to help. Nobody is watching the table.', 'danger')],
    },
    {
      id: 'm1.dilemma',
      when: 'Carrying the dispatch within 6 m of food, lunch not yet done.',
      lines: [say('mother', 'One beak, Scrumpy. Set the dispatch down where he won’t find it, or come back for lunch.')],
    },
    {
      id: 'm1.courier_pudding',
      when: 'Sixty seconds before the courier returns to the table.',
      lines: [say('mother', 'Utkin is on his pudding. You have about a minute before that dispatch leaves by bicycle.', 'danger')],
    },
    {
      id: 'm1.courier_back',
      when: 'The courier reaches the table and puts the dispatch in his satchel, on the handlebars.',
      lines: [say('mother', 'He’s back. The dispatch is in the satchel and the satchel is on the handlebars. He is still talking. Handlebars, Scrumpy.', 'danger')],
    },
    {
      id: 'm1.got_dispatch',
      when: 'The dispatch is in the beak.',
      lines: [say('mother', 'You have it. Boat Float, the Dorothy May, the pot on her afterdeck. Stay high. Stay ordinary.')],
    },
    {
      id: 'm1.delivered_no_lunch',
      when: 'Dispatch delivered before lunch.',
      lines: [say('mother', 'Dispatch received. Now lunch. Regulations, I’m afraid.')],
    },
    {
      id: 'm1.mackerel',
      when: 'On delivery: a hand comes from the wheelhouse, takes the dispatch and leaves a mackerel on the pot.',
      lines: [say('mother', 'That hand belongs to a friend. The mackerel is yours.'), say('mother', 'He doesn’t write. He leaves fish.', 'colour')],
    },
    {
      id: 'm1.complete',
      when: 'Dispatch delivered and lunch done.',
      lines: [say('mother', 'Dispatch received and lunch accounted for. Come home, Scrumpy. That was satisfactory.')],
    },
    {
      id: 'm1.compromised',
      when: 'Compromised: the courier has ridden off with the dispatch, or the alert reached Lockdown.',
      lines: [say('mother', 'The dispatch has left on a bicycle. Come home. We shall learn what it said the slow way.', 'danger')],
    },
  ],

  barks: [
    {
      who: 'borovsky',
      role: 'guard',
      calm: [
        'All quiet. As ordered.',
        'Ahh. Tea.',
        'Boats. Water. More boats.',
        'Beautiful. Like Odessa, but wetter.',
        'Wednesday, a Marshal. Today, I paint the kerb. Such is service.',
        'On the wireless: ‘Silence Is Golden’. In this town? With these birds?',
        'Dear Mama. The tea here is weak, but there is much of it.',
        'Nineteen months. Then home. I have a calendar.',
      ],
      suspicious: [
        'Hm? You again.',
        'That gull is looking at my tea.',
        'Shoo. Go and be a bird somewhere else.',
        'Why this roof? There are other roofs.',
        'I am watching you. Also the table. Mostly the table.',
        'In Odessa the gulls at least pretend.',
      ],
      alarmed: [
        'Stoy! Halt, bird!',
        'The dispatch! Put it DOWN!',
        'Thief! Feathered thief!',
        'Come back! That is signed for!',
        'Cook! COOK! A gull has the papers!',
        'I will be on latrines for this! LATRINES!',
      ],
      afterwards: [
        'Just a gull. Write nothing down.',
        'Back to post. Nothing to report. Nothing.',
        'Gulls. This whole town is gulls.',
        'The tea is cold now. Of course it is.',
        'Dear Mama. Today was not good.',
        'It looked at me first. I will remember that one.',
      ],
      extra: {
        // The rule of three, with a fourth: each hit on him gets its own line, and the third makes him look up.
        hit1: ['My tunic! My BEST tunic!'],
        hit2: ['Again? AGAIN? Is there one gull in Devon?'],
        hit3: ['I am writing to my mother. I am telling her everything.'],
        hit4: ['I see you. I see ALL of you.'],
        scrub: ['Scrub. Scrub. Disgraceful bird.', '…It is still there. It is STILL THERE.'],
        tea: ['My TEA! It went in my TEA!'],
        kitchen: ['Comrade Cook! More tea. A gull has… never mind.', 'Better.'],
        sugar: ['No sugar? No SUGAR? This is not tea. This is water with a past.'],
        baker: ['Miss Luscombe? I am coming! Guard the… I am coming!'],
        theft: ['The dispatch! It is GONE!', 'Utkin will weep. I will weep.'],
        recover: ['Papers do not walk.', 'Back on the table. We say nothing.'],
      },
    },
    {
      who: 'clerk',
      role: 'npc',
      calm: ['A shilling a bag. A shilling.', 'Twelve minutes for lunch. I take eleven.', 'Chips, a bench, the river. I ask for nothing else.'],
      suspicious: ['Not today. Not today, bird.', 'I see you. I saw you yesterday.', 'These are accounted for.'],
      alarmed: ['Hey! Bird! Those are STATE chips!', 'Shoo! Shoo, you hooligan!', 'My lunch! My only joy!', 'Every day. Every single day.'],
      afterwards: ['I shall minute this.', 'That is four. I am keeping a tally.', 'Somebody ought to be told. In writing.'],
    },
    {
      who: 'pirogov',
      role: 'npc',
      calm: ['Kasha for forty. Sugar for six.', 'For the Marshal, they say: soup. Which soup? Nobody says.', 'The secret of tea is to have some.', 'First the kerb, then the kettle. Whitewash in neither.'],
      suspicious: ['Away from the pot, bird.', 'I count the sugar. I count it twice.', 'You are looking at the lumps. Do not look at the lumps.'],
      alarmed: ['The sugar! He has the SUGAR!', 'Borovsky! Your gull is in my kitchen!', 'Out! OUT!'],
      afterwards: ['No sugar until Thursday. Tell the men gently.', 'A gull, in a field kitchen. I have cooked at the front and never…', 'Tea without sugar. So. We are at war after all.'],
    },
    {
      who: 'baker',
      role: 'npc',
      calm: ['Pasties at one. Not before. Not for anyone.', 'He’s a nice enough boy, for an invader.', 'You can lean there, Corporal. You can’t lean there and talk.'],
      suspicious: ['I see you, my lad. That’s not for you.', 'Don’t you dare.', 'Corporal, mind my sill a minute.'],
      alarmed: ['THIEF! Stop, THIEF!', 'My pasty! That’s one and thruppence, that is!', 'Corporal! Do something military!'],
      afterwards: ['Gone. And he just stood there.', 'I blame the Russians. No offence, Corporal.', 'That’s coming off somebody’s ration.'],
    },
    {
      who: 'utkin',
      role: 'npc',
      calm: [
        'Good day. I should like one pasty, if you please, madam.',
        'The weather is clement, is it not? Page forty.',
        'In my village also we have a bakery. It has no bread, but it is there.',
        'My dispatch is on the table. It is watched. I may be at ease.',
      ],
      suspicious: ['One moment, Miss Luscombe. I am having a feeling.', 'That bird is on my table. Is it permitted?', 'Borovsky? You are watching, yes? …Borovsky?'],
      alarmed: ['The satchel! Who has touched the satchel?', 'Borovsky! Where is my dispatch?', 'I signed for it! In INK!'],
      afterwards: ['We will say it was delivered. We will say it very quietly.', 'Perhaps there is a carbon. There is always a carbon.', 'I am not hungry now. …I am a little hungry.'],
    },
  ],

  debrief: {
    standard:
      'The dispatch is a resupply manifest. Paraffin, potatoes, whitewash, 400 yards of netting, and one line in a different hand: Sandquay, berth reserved, S-197. A submarine, Scrumpy. In the Dart. A Marshal inspects the garrison on Wednesday, and her berthing orders will be on the Commandant’s lectern. The friend at the pot sent a mackerel and no message, which is his way. Mother has sent for the Wing.',
    compromised:
      'The dispatch left Bayard’s Cove on a bicycle. Mother has had its contents the slow way: the Committee’s man at the Guildhall read the carbon. Paraffin, potatoes, netting, and a berth at Sandquay for S-197. A submarine, Scrumpy. In the Dart. The Kommandatura now takes its lunch indoors. A Marshal inspects the garrison on Wednesday, and her berthing orders will be on the lectern. Mother has sent for the Wing.',
  },

  intercept: {
    id: 'm1.intercept',
    heading: 'KOMMANDATURA DARTMOUTH · INCIDENT REPORT · Pte G. BOROVSKY · 3.6.67',
    body: [
      '13.31 Tea.',
      '13.34 Tea compromised by gull.',
      '13.35 Proceeded to field kitchen for replacement tea, per Standing Order on Morale.',
      '13.41 Returned to post. Table present. Dispatch absent. Gulls present (several).',
      '13.42 Questioned gulls. No answer.',
      'RECOMMENDATION: Fewer gulls.',
    ],
    footnote: 'Minute by Lt Voronova: ‘Several’ is not a number. See me.',
    alt: [
      {
        when: 'The dispatch was taken unseen, with no distraction.',
        body: ['13.20 to 13.50 Nothing to report.', '13.51 Table present. Dispatch absent.', '13.52 Nothing unusual, apart from the gulls.', 'RECOMMENDATION: None. Perhaps fewer gulls.'],
      },
      {
        when: 'The gull was seen with the dispatch.',
        body: [
          '13.34 Gull on table. Large. Insolent.',
          '13.34 Gull left table. Dispatch left with gull.',
          '13.35 Pursued gull on foot. Gull pursued a different course.',
          '13.40 Threw cap. Cap is in the river.',
          'RECOMMENDATION: Fewer gulls. A new cap.',
        ],
      },
    ],
  },

  committee: [
    { when: 'Always.', text: 'The Committee notes the recovery of one (1) dispatch and the expenditure of one (1) lunch.' },
    { when: 'Any hit on Borovsky.', text: 'Private Borovsky’s tunic has been submitted to the laundry under protest. The Committee did not authorise the tunic.' },
    { when: 'The theft was not discovered at the scene.', text: 'The sentry’s report lists ‘nothing unusual, apart from the gulls’. The Committee finds this satisfactory.' },
    { when: 'The theft was discovered at the scene.', text: 'The sentry’s report describes ‘a large, insolent gull’. The Committee considers this accurate.' },
    { when: 'The dispatch was set down in the field.', text: 'The dispatch was set down in the field. This is noted without comment.' },
    { when: 'Two or more chips taken.', text: 'Chips: more than one. The Committee has asked the Quartermaster to explain the plural.' },
    { when: 'Always, last.', text: 'The wireless ring remains on loan at £11 4s. The Committee raises this at every meeting and will do so at the next.' },
  ],

  personnel: [
    { id: 'm1.tea_leaf', kind: 'citation', title: 'Tea Leaf', text: 'Compromised the tea of a sentry on duty.', when: 'A hit on Borovsky’s mug.' },
    { id: 'm1.laundry_day', kind: 'citation', title: 'Laundry Day', text: 'Caused a private soldier to wash.', when: 'Borovsky sent to the pump.' },
    { id: 'm1.nothing_unusual', kind: 'citation', title: 'Nothing Unusual, Apart From the Gulls', text: 'Delivered without the loss being noticed at the scene.', when: 'Delivered with the theft undiscovered.' },
    { id: 'm1.ghost', kind: 'citation', title: 'Ghost of Bayard’s Cove', text: 'Was at no time anything but a gull.', when: 'No guard ever raised a question mark.' },
    { id: 'm1.standing_order_4', kind: 'citation', title: 'Standing Order 4', text: 'Lunched before operating, as laid down.', when: 'Lunch done before the dispatch was touched.' },
    { id: 'm1.lunch_on_the_wing', kind: 'citation', title: 'Lunch on the Wing', text: 'Took and ate lunch without landing. Not laid down, but not forbidden.', when: 'Food snatched and eaten without touching down.' },
    { id: 'm1.bakers_dozen', kind: 'citation', title: 'The Baker’s Dozen', text: 'Took the pasty in full view of Miss Luscombe and lived.', when: 'Pasty taken in the baker’s sight and eaten or stashed.' },
    { id: 'm1.before_pudding', kind: 'citation', title: 'Before Pudding', text: 'Completed the theft while the courier was still on his first course.', when: 'Dispatch taken before the one-minute warning.' },
    { id: 'm1.long_drop', kind: 'citation', title: 'Long Drop', text: 'A hit from twenty-five yards up. Mother does not ask how.', when: 'A hit from 25 m or more.' },
    { id: 'm1.fish_received', kind: 'citation', title: 'Fish, Received', text: 'Accepted one mackerel from a friend. No message. None expected.', when: 'The mackerel taken from the pot.' },
    { id: 'm1.seen', kind: 'reprimand', title: 'Seen', text: 'Seen, three times. An operative is at all times a gull. Not that gull.', when: 'Spotted three times or more.' },
    { id: 'm1.paper', kind: 'reprimand', title: 'Paper', text: 'Attempted to eat the dispatch. Standing Order 2 exists because of this operative.', when: 'Tried to eat the dispatch.' },
    { id: 'm1.hobby', kind: 'reprimand', title: 'Hobby', text: 'Three hits on one private. Once is tradecraft.', when: 'Three or more hits on Borovsky.' },
  ],

  borovskyFile: 'Reassigned to latrine duty, South Embankment, pending enquiry into ‘the gull matter’.',
  pot: 'One mackerel, whole. No note.',
  mothersNote: '‘Adequate’ struck out. ‘Satisfactory.’',
  garrisonNote: 'A large, insolent gull.',
};
