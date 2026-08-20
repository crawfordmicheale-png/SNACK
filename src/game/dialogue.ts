/**
 * Written content: signposts, villager lines, and the quest log those lines
 * advance. Dialogue is a list of pages; the UI types them out one at a time.
 */
import type { NpcId } from './entities/props';

export interface QuestStep {
  id: string;
  title: string;
  detail: string;
}

export const QUEST_STEPS: QuestStep[] = [
  { id: 'start', title: 'Ask the elder', detail: 'He waits in the village square.' },
  { id: 'toGate', title: 'Reach the Hollow Gate', detail: 'Follow the north road.' },
  { id: 'enterRoot', title: 'Descend into the Hollow Root', detail: 'The stair sits behind the shrine.' },
  { id: 'findBow', title: 'Arm yourself', detail: 'Find the key, then the sealed vault.' },
  { id: 'boss', title: 'Cut the root', detail: 'The Root Key opens the sealed door.' },
  { id: 'afterRoot', title: 'Return to Elderbrook', detail: 'The village should hear that Thornmaw is dead.' },
  { id: 'southMarsh', title: 'Seek the drowned bell', detail: 'South of the village, past the mill, into the marsh.' },
  { id: 'enterBell', title: 'Descend the Sunken Steps', detail: 'The stair is in the sand at the marsh’s east end.' },
  { id: 'drownBoss', title: 'Silence Tideheart', detail: 'The Bell Key opens the nave. Wait for the ring.' },
  { id: 'afterBell', title: 'Speak with the elder', detail: 'Root and bell are quiet — but something still smoulders.' },
  { id: 'seekAsh', title: 'Find the Ashen Spire', detail: 'Northwest, past the ruined approach. Look for stairs in the rubble.' },
  { id: 'enterAsh', title: 'Climb the Ashen Spire', detail: 'Boots help. The Ash Key opens the crown.' },
  { id: 'ashBoss', title: 'End the third hunger', detail: 'Cindermouth waits at the summit. Strike when the mouth opens.' },
  { id: 'episodeOne', title: 'Episode One complete', detail: 'The three hungers sleep. The Hollow is not finished with you.' },
];

export interface SideQuest {
  id: string;
  title: string;
  detail: string;
  /** Flag set when the favour is finished. */
  doneFlag: string;
  /** Flag set when the NPC has asked for it. */
  askedFlag: string;
}

export const SIDE_QUESTS: SideQuest[] = [
  {
    id: 'seeds',
    title: 'Thorn Harvest',
    detail: 'Bring 5 Thorn Seeds to Herbalist Sae.',
    askedFlag: 'seedsAsked',
    doneFlag: 'seedsDone',
  },
  {
    id: 'bones',
    title: "Bren's Order",
    detail: 'Bring 8 Bone Shards to Smith Bren.',
    askedFlag: 'bonesAsked',
    doneFlag: 'bonesDone',
  },
  {
    id: 'cal',
    title: 'The Missing Boy',
    detail: "Tilly's brother went south. Find him in the Reed Marsh.",
    askedFlag: 'calAsked',
    doneFlag: 'calDone',
  },
  {
    id: 'shells',
    title: 'Shell Stack',
    detail: 'Bring 6 Crab Shells to Fisher Noll.',
    askedFlag: 'shellsAsked',
    doneFlag: 'shellsDone',
  },
  {
    id: 'cinders',
    title: 'Orchard Smoke',
    detail: 'Bring 5 Cinder Scales to Orchard Kee.',
    askedFlag: 'cindersAsked',
    doneFlag: 'cindersDone',
  },
];

export class QuestLog {
  private flags = new Set<string>();
  step = 0;

  has(flag: string): boolean {
    return this.flags.has(flag);
  }

  set(flag: string): boolean {
    if (this.flags.has(flag)) return false;
    this.flags.add(flag);
    return true;
  }

  /** Advances to a named step if it is ahead of the current one. */
  advanceTo(stepId: string): boolean {
    const index = QUEST_STEPS.findIndex((s) => s.id === stepId);
    if (index < 0 || index <= this.step) return false;
    this.step = index;
    return true;
  }

  current(): QuestStep {
    return QUEST_STEPS[Math.min(this.step, QUEST_STEPS.length - 1)];
  }

  serialize(): { flags: string[]; step: number } {
    return { flags: [...this.flags], step: this.step };
  }

  restore(data: { flags?: string[]; step?: number }): void {
    this.flags = new Set(data.flags ?? []);
    this.step = data.step ?? 0;
  }
}

// ---------------------------------------------------------------------------

export const SIGNS: Record<string, string[]> = {
  whisperwood: ['WHISPERWOOD', 'Cut the brush. The wood keeps what it swallows, but it does not keep it well.'],
  cliffside: ['CLIFFSIDE TRAIL', 'Loose rock above. Loose rock below.', 'Some of it is looser than it looks.'],
  barrows: ['THE OLD BARROWS', 'Do not strike a warden from the front. That is what the front is for.'],
  northroad: ['NORTH ROAD', 'Elderbrook, south. The Hollow Gate, north.', 'Travellers are asked to go south.'],
  gate: ['THE HOLLOW GATE', 'Beyond this shrine the root begins.', 'It was sealed once. It is not sealed now.'],
  lookout: ['WINDWARD LOOKOUT', 'On a clear day you can see the whole Hollow.', 'It has not been a clear day in some time.'],
  cave: ['Cold air comes out of this hole.', 'Something in there smells of gunpowder.'],
  dungeonEntry: ['THE HOLLOW ROOT', 'Sealed by the village, three generations back.', 'The seal is on the floor above. It did not hold.'],
  cracked: ['This wall rings hollow.', 'A good blast would settle the question.'],
  hub: ['Four ways out.', 'One is locked, one is barred, one is worse.'],
  bramble: ['BRAMBLE THICKET', 'The wisps here are only solid when they mean to be.', 'Wait for the glow, then cut.'],
  pasture: ['SOUTH PASTURE', 'The mill still turns. The marsh beyond it does not.', 'Cal went that way. He has not come back.'],
  marsh: ['REED MARSH', 'Stay on the shallows.', 'The crabs turn their shells toward you. Hit them after they snap.'],
  sunken: ['SUNKEN STEPS', 'The bell under the marsh rang the night the root woke.', 'It has not stopped.'],
  bellEntry: ['THE DROWNED BELL', 'Fed by the Hollow Root. Older than the village.', 'Light a lantern before you go east.'],
  bellHub: ['The nave is north, behind a seal.', 'The choir is east, through the dark.', 'Something in the west wall sounds thin.'],
  ashGate: ['ASHEN SPIRE', 'Third hunger. Stairs in the rubble.', 'The air tastes like a forge that never cooled.'],
  ashEntry: ['THE ASHEN SPIRE', 'Root fed the bell. Bell fed the ash.', 'Boots wait east. The crown waits north.'],
  ashHub: ['North is sealed.', 'East needs a key.', 'West remembers a blast.'],
  ridge: ['CLOUDSCAR RIDGE', 'Ash drifts from the ruined approach.', 'The watcher stays until the smoke clears.'],
  fishery: ['FISHERY COVE', 'Nets, stories, and shells worth trading.'],
  orchard: ['ORCHARD RISE', 'Fruit for sale. Smoke for a favour.'],
  salt: ['SALT FLATS', 'White and bitter. Crabs like it that way.'],
  deepwood: ['DEEPWOOD', 'Roots remember more than the village wants them to.'],
  southroad: ['SOUTHERN ROAD', 'Episode One ends when you choose — or when the ash does.'],
  fogfen: ['FOG FEN', 'Shapes in the mist. Most of them are crabs.'],
  tideshelf: ['TIDE SHELF', 'The sea keeps score. So does the bell.'],
  wrecker: ["WRECKER'S BEACH", 'Something washed ashore. It still smoulders.'],
  default: ['The writing has weathered away.'],
};

// ---------------------------------------------------------------------------

export interface DialogueContext {
  hasBoss: boolean;
  hasTideheart: boolean;
  hasCindermouth: boolean;
  hasBow: boolean;
  hasBossKey: boolean;
  enteredDungeon: boolean;
  enteredDrowned: boolean;
  enteredAshen: boolean;
  level: number;
  motes: number;
  heartPieces: number;
  thornSeeds: number;
  boneShards: number;
  crabShells: number;
  cinderScales: number;
}

/** Returns the pages an NPC says, given where the player is in the story. */
export function npcDialogue(id: NpcId, ctx: DialogueContext, quest: QuestLog): string[] {
  switch (id) {
    case 'elder':
    case 'elderIndoors':
      if (ctx.hasCindermouth) {
        return [
          'Root. Bell. Ash. You cut all three.',
          'Episode One ends here — but the Hollow does not. Something west of the ridge still breathes.',
          'Rest if you need it. Explore if you do not. I will be here either way.',
        ];
      }
      if (ctx.hasTideheart) {
        quest.advanceTo('seekAsh');
        return [
          'Both of them. The root and the bell.',
          'I thought the Hollow had two hungers. It had three, and the third has been eating the smoke of the first two.',
          'Northwest — the Ruined Approach. Stairs in the rubble lead into the Ashen Spire.',
          'If you climb it, do not expect a neat ending. Expect a quieter starting place for whatever comes next.',
        ];
      }
      if (ctx.hasBoss) {
        quest.advanceTo('southMarsh');
        return [
          'You cut it. I felt the ground go quiet from here.',
          'Quiet, but not still. The marsh rang in the night — a drowned bell, older than the root.',
          'Thornmaw was only the feeder. What it fed sits under the Sunken Steps, east of the reeds.',
          'Go south past the mill. And tell Tilly, if you see her brother, that the village still wants him home.',
        ];
      }
      if (ctx.enteredDungeon) {
        return [
          'You have been down there. I can tell — you have the smell of it.',
          'The thing at the bottom is called Thornmaw. It is not a beast. It is a root that learned to want.',
          'Do not swing at it while its maw is shut. Wait for the eye.',
        ];
      }
      if (!quest.has('elderBriefed')) {
        quest.set('elderBriefed');
        quest.advanceTo('toGate');
        return [
          'You are awake. Good.',
          'Something has come up under the Hollow. The barrows are walking, and the brush has teeth.',
          'North road, past the barrows, to the Hollow Gate. There is a stair behind the shrine.',
          'Take a shield before you go. There is one in the Whisperwood, if the brush has not eaten it.',
        ];
      }
      return [
        'North road, past the barrows. The gate is behind the shrine.',
        'And practise, would you? Strength is a habit, not a gift.',
      ];

    case 'smith':
    case 'smithIndoors':
      if (quest.has('bonesDone')) {
        return ['That signet will outlast both of us.', 'If you find more shards, keep them. I have enough.'];
      }
      if (ctx.boneShards >= 8 && quest.has('bonesAsked')) {
        quest.set('bonesReady');
        return [
          'Eight shards. That is a proper order.',
          'Give them here — I will set a ring that remembers how they broke.',
        ];
      }
      if (!quest.has('bonesAsked')) {
        quest.set('bonesAsked');
        return [
          'Everything I make bends before it breaks. That is the whole trick.',
          'The barrows drop bone that still remembers being a person. Bring me eight shards and I will make you something that does not forget.',
        ];
      }
      if (ctx.hasBow) {
        return [
          'That bow is Hollow work. Older than my grandfather and better made than anything I sell.',
          `Bone shards: you have ${ctx.boneShards}. I need eight.`,
        ];
      }
      return [
        'If you find something down in the root, bring it here. I will tell you what it is worth.',
        `Bone shards: you have ${ctx.boneShards}. I need eight.`,
      ];

    case 'child':
      if (quest.has('calDone')) {
        return ['He is back! He said the marsh tried to eat his boots. I told him that is what marshes are for.'];
      }
      if (ctx.hasCindermouth) {
        return ['You finished Episode One? Does that mean there is an Episode Two? Can I be in it?'];
      }
      if (ctx.hasTideheart) {
        return ['You killed the bell too? Did it splash? I wanted it to splash.'];
      }
      if (ctx.hasBoss) {
        return ['You killed it! Did it scream? Everyone says it screamed.'];
      }
      if (!quest.has('calAsked')) {
        quest.set('calAsked');
        return [
          'My brother Cal went south looking for pieces of heart. He said four of them make a whole one.',
          'He said a lot of things. He has been gone two days. The miller saw him go into the reeds.',
        ];
      }
      return [
        'Cal went into the Reed Marsh, past the mill.',
        'If you find him, tell him I am not sharing the last bun.',
      ];

    case 'herbalist':
      if (quest.has('seedsDone')) {
        return [
          'Red for blood, blue for magic, green for both and a little breathing room.',
          'And if you find a fairy, bottle it. It will bring you back once, whether you ask or not.',
        ];
      }
      if (ctx.thornSeeds >= 5 && quest.has('seedsAsked')) {
        quest.set('seedsReady');
        return [
          'Five seeds, still twitching. Perfect.',
          'Hand them over. I keep a green ether for people who do as they are asked.',
        ];
      }
      if (!quest.has('seedsAsked')) {
        quest.set('seedsAsked');
        return [
          'The thornlings drop seeds that still want to be plants. I can use that.',
          'Bring me five and I will mix you something that puts the blood back and the magic besides.',
        ];
      }
      return [
        `Thorn seeds: you have ${ctx.thornSeeds}. I need five.`,
        'Red for blood, blue for magic. The green one is both, and a little breathing room.',
      ];

    case 'miller':
    case 'millerIndoors':
      if (ctx.hasCindermouth) {
        return ['The wheel turns. The marsh is quiet. Even the ash smells thinner from here.'];
      }
      if (ctx.hasTideheart) {
        return [
          'The wheel is quieter. I had not noticed how loud the marsh was until it stopped.',
          'If you are still looking for trouble, the ridge northwest has been coughing smoke.',
        ];
      }
      if (ctx.hasBoss) {
        return [
          'The mill still turns. The marsh does not.',
          'East of the reeds there are steps in the sand. They were not there last autumn.',
        ];
      }
      return [
        'Grain comes in. Flour goes out. That is the whole of a good life.',
        'The reeds have crabs in them now. They sidestep until they decide to ruin your day.',
        'If you are heading east, buy arrows. The marsh does not sell them.',
      ];

    case 'cal':
      if (quest.has('calFound')) {
        return [
          'I am going home. Slowly. The crabs have opinions about that.',
          'Tell Tilly the bun is mine. I earned it.',
        ];
      }
      quest.set('calFound');
      return [
        'You are from the village. Good. I am Cal. I am also stuck.',
        'I came for a piece of heart. I found crabs instead. They are worse.',
        'Tell Tilly I am alive. I will walk back when my legs remember how.',
      ];

    case 'fisher':
      if (quest.has('shellsDone')) {
        return ['Keep the shells if you find more. I am stocked. The cove is quieter when you are around.'];
      }
      if (ctx.crabShells >= 6 && quest.has('shellsAsked')) {
        quest.set('shellsReady');
        return ['Six shells. Good. Hand them over — I will trade you something that does not smell of tide.'];
      }
      if (!quest.has('shellsAsked')) {
        quest.set('shellsAsked');
        return [
          'Noll. I pull nets. The crabs pull harder lately.',
          'Bring me six shells and I will spare you a potion that does not taste like fish.',
        ];
      }
      return [`Crab shells: you have ${ctx.crabShells}. I need six.`, 'East flats are thick with them. Watch the snap.'];

    case 'orchard':
      if (quest.has('cindersDone')) {
        return ['The trees like the quiet. So do I. Come back when Episode Two finds a name.'];
      }
      if (ctx.cinderScales >= 5 && quest.has('cindersAsked')) {
        quest.set('cindersReady');
        return ['Five scales, still warm. That is enough for a charm that remembers fire without becoming it.'];
      }
      if (!quest.has('cindersAsked')) {
        quest.set('cindersAsked');
        return [
          'Kee. I keep fruit and favours.',
          'Ash creatures drop cinder scales. Bring five and I will set a ward for the climb.',
        ];
      }
      return [`Cinder scales: you have ${ctx.cinderScales}. I need five.`, 'The ridge and the spire both shed them.'];

    case 'watcher':
      if (ctx.hasCindermouth) {
        return ['The smoke thinned. I can leave the ridge now. I might not.'];
      }
      if (ctx.hasTideheart) {
        return [
          'You silenced the bell. Good. The ash did not notice.',
          'Stairs in the Ruined Approach. Boots first if you can find them — the spire likes to shove.',
        ];
      }
      return [
        'I watch the approach. Something under those ruins still breathes heat.',
        'If you go down, go ready. Embers hop. Ashbats spit.',
      ];

    case 'bellWatcher':
      if (ctx.hasCindermouth) {
        return ['Three hungers quiet. The shelf still listens. So should you.'];
      }
      if (ctx.hasTideheart) {
        return ['The ring stopped. The ash did not. Northwest, if you still have legs.'];
      }
      return [
        'I listen for the drowned bell. It has opinions about weather and heroes.',
        'Sunken Steps are north of here when the tide allows.',
      ];

    case 'mirror':
      return [
        `You have reached level ${ctx.level}.`,
        ctx.motes > 0
          ? `${ctx.motes} mote${ctx.motes === 1 ? '' : 's'} unspent. Press U and put ${ctx.motes === 1 ? 'it' : 'them'} to work.`
          : 'No motes to spend. Go and earn some.',
        ctx.heartPieces > 0
          ? `${ctx.heartPieces} of 4 heart pieces collected.`
          : 'No heart pieces yet. They are out there.',
      ];
  }
}

/** Short one-liners shown as toasts, keyed by situation. */
export const TOASTS = {
  lockedDoor: 'The door is locked. You need a small key.',
  bossDoorLocked: 'A heavy seal. It wants the proper key.',
  bossDoorOpen: 'The key turns. The seal opens.',
  usedKey: 'You used a Small Key.',
  roomSealed: 'The door slams shut behind you.',
  roomCleared: 'The way opens.',
  secret: 'You found a secret!',
  needBombs: 'This wall rings hollow.',
} as const;
