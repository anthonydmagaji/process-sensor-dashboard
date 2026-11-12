import { sound } from '../../audio/sound';
import { aiTeamNames } from '../../game/ai';
import { JACKPOT_STEP, TEAM_COUNT } from '../../game/machine';
import type { Difficulty, Settings, TeamSetup } from '../../game/types';
import type { AppApi } from '../app-api';
import { renderLogo } from '../components/header';
import { formatPoints, h, svg } from '../dom';
import { ICON_ROBOT, ICON_TROPHY } from '../icons';

const DIFFICULTY_NOTES: Record<Difficulty, string> = {
  easy: 'Computer teams go for the obvious answers and slip up fairly often.',
  medium: 'Computer teams give solid, middling answers with the odd mistake.',
  hard: 'Computer teams dig out obscure answers and rarely get one wrong.',
};

const MAX_NAME_LENGTH = 22;

function segmented<T extends string | number>(
  label: string,
  options: { value: T; text: string }[],
  current: T,
  onChange: (value: T) => void,
): HTMLElement {
  const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  const buttons = options.map((option) =>
    h(
      'button',
      {
        class: 'segmented__option',
        type: 'button',
        role: 'radio',
        'aria-checked': String(option.value === current),
        onclick: () => {
          buttons.forEach((button, index) =>
            button.setAttribute('aria-checked', String(options[index].value === option.value)),
          );
          sound.click();
          onChange(option.value);
        },
      },
      option.text,
    ),
  );
  group.append(...buttons);
  return group;
}

function toggle(label: string, note: string, checked: boolean, onChange: (checked: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', class: 'switch__input', checked });
  input.addEventListener('change', () => {
    onChange(input.checked);
    sound.click();
  });
  return h(
    'label',
    { class: 'switch' },
    input,
    h('span', { class: 'switch__track', 'aria-hidden': 'true' }, h('span', { class: 'switch__thumb' })),
    h('span', { class: 'switch__text' }, h('span', { class: 'switch__label' }, label), h('span', { class: 'switch__note' }, note)),
  );
}

export function renderSetup(app: AppApi): HTMLElement {
  const settings: Settings = { ...app.state.settings, sound: app.soundOn };
  const savedNames = app.storage.getTeamNames();
  const humanNames = Array.from({ length: TEAM_COUNT }, (_, index) => savedNames[index] ?? '');
  const computerNames = aiTeamNames(TEAM_COUNT, [], Math.random);
  const records = app.storage.getRecords();

  const teamList = h('div', { class: 'team-list' });
  const difficultyNote = h('p', { class: 'field__note' }, DIFFICULTY_NOTES[settings.difficulty]);
  const difficultyField = h('div', { class: 'field' });

  const drawTeams = () => {
    const rows = Array.from({ length: TEAM_COUNT }, (_, index) => {
      const human = index < settings.humanTeams;
      if (!human) {
        return h(
          'div',
          { class: 'team-row team-row--ai' },
          h('span', { class: 'team-row__number' }, index + 1),
          h('span', { class: 'team-row__name' }, computerNames[index]),
          h('span', { class: 'team-row__tag' }, svg(ICON_ROBOT), 'Computer'),
        );
      }
      const input = h('input', {
        class: 'input team-row__input',
        type: 'text',
        value: humanNames[index],
        maxlength: MAX_NAME_LENGTH,
        placeholder: `Team ${index + 1}`,
        'aria-label': `Name of team ${index + 1}`,
        autocomplete: 'off',
        autocapitalize: 'words',
        spellcheck: 'false',
        enterkeyhint: 'go',
      });
      input.addEventListener('input', () => {
        humanNames[index] = input.value;
      });
      return h(
        'div',
        { class: 'team-row' },
        h('span', { class: 'team-row__number' }, index + 1),
        input,
        h('span', { class: 'team-row__tag team-row__tag--human' }, 'Pair'),
      );
    });
    teamList.replaceChildren(...rows);
    difficultyField.hidden = settings.humanTeams === TEAM_COUNT;
  };

  const start = () => {
    const taken = new Set<string>();
    const unique = (wanted: string, fallback: string) => {
      let name = wanted.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH) || fallback;
      let suffix = 2;
      const base = name;
      while (taken.has(name.toLowerCase())) name = `${base} ${suffix++}`;
      taken.add(name.toLowerCase());
      return name;
    };
    const teams: TeamSetup[] = Array.from({ length: TEAM_COUNT }, (_, index) =>
      index < settings.humanTeams
        ? { name: unique(humanNames[index], `Team ${index + 1}`), isAI: false }
        : { name: unique(computerNames[index], `Computer ${index + 1}`), isAI: true },
    );
    app.storage.setTeamNames(humanNames.map((name) => name.trim()));
    app.startGame(settings, teams);
  };

  difficultyField.append(
    h('span', { class: 'field__label' }, 'Computer difficulty'),
    segmented<Difficulty>(
      'Computer difficulty',
      [
        { value: 'easy', text: 'Easy' },
        { value: 'medium', text: 'Medium' },
        { value: 'hard', text: 'Hard' },
      ],
      settings.difficulty,
      (value) => {
        settings.difficulty = value;
        difficultyNote.textContent = DIFFICULTY_NOTES[value];
      },
    ),
    difficultyNote,
  );

  const form = h(
    'form',
    {
      class: 'panel setup__form',
      onsubmit: (event) => {
        event.preventDefault();
        start();
      },
    },
    h('h2', { class: 'panel__title' }, 'Set up the show'),
    h(
      'div',
      { class: 'field' },
      h('span', { class: 'field__label' }, 'Human teams'),
      segmented<number>(
        'Number of human teams',
        [1, 2, 3, 4].map((value) => ({ value, text: String(value) })),
        settings.humanTeams,
        (value) => {
          settings.humanTeams = value;
          drawTeams();
        },
      ),
      h('p', { class: 'field__note' }, 'Each team is a pair. Computer teams fill the other podiums.'),
    ),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Teams'), teamList),
    difficultyField,
    h(
      'div',
      { class: 'field field--switches' },
      toggle('Sound', 'Countdown ticks, buzzers and fanfares', settings.sound, (checked) => {
        settings.sound = checked;
        app.setSound(checked);
      }),
      toggle('Answer clock', '20 seconds for every answer', settings.timer, (checked) => {
        settings.timer = checked;
      }),
    ),
    h('button', { class: 'btn btn--gold btn--large', type: 'submit' }, 'Start the show'),
  );

  const rules = h(
    'details',
    { class: 'panel rules' },
    h('summary', null, 'How to play'),
    h(
      'ol',
      null,
      h('li', null, 'We asked 100 people each question. Your score is the number of them who gave your answer, so ', h('strong', null, 'low is good'), '.'),
      h('li', null, 'A correct answer nobody gave scores 0: a ', h('strong', null, 'rock-bottom answer'), '. It earns your team a trophy.'),
      h('li', null, 'A wrong answer scores the maximum 100. You cannot repeat an answer already given in the round.'),
      h('li', null, 'Rounds 1 and 2: both players answer once. The team with the highest total is eliminated; a tie means a sudden-death tiebreak.'),
      h('li', null, 'Round 3 is a head to head: the lower score wins each question, first to two.'),
      h('li', null, `The final: pick one of three categories and give three answers. One rock-bottom answer wins the jackpot. If it is not won, it grows by ${JACKPOT_STEP} for the next game.`),
    ),
    h('p', { class: 'rules__note' }, 'Spelling is forgiving: small typos, accents, capital letters and a leading "the" never count against you.'),
  );

  const recordLine =
    records.gamesPlayed > 0
      ? h(
          'p',
          { class: 'setup__records' },
          `${records.gamesPlayed} ${records.gamesPlayed === 1 ? 'game' : 'games'} played · `,
          `${records.jackpotsWon} ${records.jackpotsWon === 1 ? 'jackpot' : 'jackpots'} won · `,
          svg(ICON_TROPHY),
          ` ${records.trophies}`,
        )
      : null;

  // On a wide screen the rules sit open beside the form.
  rules.open = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 861px)').matches;
  drawTeams();

  return h(
    'main',
    { class: 'screen setup' },
    h(
      'div',
      { class: 'setup__hero' },
      renderLogo('large'),
      h('p', { class: 'setup__tagline' }, 'The quiz where the lowest score wins'),
      h(
        'div',
        { class: 'jackpot-banner' },
        h('span', { class: 'jackpot-banner__label' }, "Tonight's jackpot"),
        h('span', { class: 'jackpot-banner__value' }, formatPoints(app.state.jackpot)),
        h('span', { class: 'jackpot-banner__unit' }, 'points'),
      ),
      recordLine,
    ),
    h('div', { class: 'setup__columns' }, form, rules),
  );
}
