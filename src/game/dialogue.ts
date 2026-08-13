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
  { id: 'done', title: 'Return to Elderbrook', detail: 'Go home and tell them it is over.' },
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
  default: ['The writing has weathered away.'],
};

// ---------------------------------------------------------------------------

export interface DialogueContext {
  hasBoss: boolean;
  hasBow: boolean;
  hasBossKey: boolean;
  enteredDungeon: boolean;
  level: number;
  motes: number;
  heartPieces: number;
}

/** Returns the pages an NPC says, given where the player is in the story. */
export function npcDialogue(id: NpcId, ctx: DialogueContext, quest: QuestLog): string[] {
  switch (id) {
    case 'elder':
    case 'elderIndoors':
      if (ctx.hasBoss) {
        return [
          'You went down into the root, and you came back up.',
          'Three generations we kept that seal, and it took one afternoon to finish the job properly.',
          'Rest. The Hollow is quiet, and it will stay quiet a while.',
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
      if (ctx.hasBow) {
        return ['That bow is Hollow work. Older than my grandfather and better made than anything I sell.', 'Keep it oiled.'];
      }
      return [
        'Everything I make bends before it breaks. That is the whole trick.',
        'If you find something down in the root, bring it here. I will tell you what it is worth.',
      ];

    case 'child':
      if (ctx.hasBoss) return ['You killed it! Did it scream? Everyone says it screamed.'];
      return [
        'My brother says there are pieces of heart hidden all over the Hollow.',
        'He says four of them make a whole one. He says a lot of things.',
      ];

    case 'herbalist':
      return [
        'Red for blood, blue for magic, green for both and a little breathing room.',
        'And if you find a fairy, bottle it. It will bring you back once, whether you ask or not.',
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
  bossDoorLocked: 'A heavy seal. It wants the Root Key.',
  bossDoorOpen: 'The Root Key turns. The seal opens.',
  usedKey: 'You used a Small Key.',
  roomSealed: 'The door slams shut behind you.',
  roomCleared: 'The way opens.',
  secret: 'You found a secret!',
  needBombs: 'This wall rings hollow.',
} as const;
