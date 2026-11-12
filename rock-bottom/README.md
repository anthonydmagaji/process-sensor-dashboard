# Rock Bottom

A browser quiz game where **the lowest score wins**. Every question was "put to 100 people"; your score is how many of them gave your answer. Find a correct answer nobody gave and you hit rock bottom: zero points, a trophy, and in the final, the jackpot.

The format is inspired by lowest-score-wins TV survey quizzes. The name, look, sounds, host lines and all 55 questions are original, and the survey scores are invented.

## Run it

Requires Node 20.19 or newer (Node 22 recommended).

```bash
cd rock-bottom
npm install
npm run dev
```

Open the address Vite prints (normally http://localhost:5173). To play on a phone on the same network, use the "Network" address it prints.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the game with live reload |
| `npm test` | Run the unit tests (matcher, state machine, question bank) |
| `npm run build` | Type-check and build a static site into `dist/` |
| `npm run preview` | Serve the built site |

There is no backend and no network calls: `dist/` can be hosted on any static file server.

## How a game goes

1. **Setup.** 1 to 4 human teams (pairs), with computer teams filling the remaining podiums. Choose the computer difficulty, sound, and whether to use the 20-second answer clock.
2. **Rounds 1 and 2.** Each player answers once, so two passes per team. The highest combined score is eliminated. Teams level on the worst score play a sudden-death tiebreak on a new question, repeated until someone is out.
3. **Round 3, head to head.** One answer per team per question; the lower score takes the question. First to two questions wins, and a drawn question is replayed.
4. **The final.** The winners choose one of three categories and give three answers (60 seconds in total if the clock is on). Any zero-point answer wins the jackpot.

The jackpot starts at 1,000 points and grows by 250 each game it is not won. It is kept in the browser's `localStorage`, along with your settings, team names and the questions you played recently (so new games start with fresh ones).

Wrong answers score 100. An answer already given in the round is rejected and you try again. Every zero-point answer earns the team a trophy, shown on the scoreboard.

**Controls:** type and press Enter. Enter also continues after each reveal, and Enter, Space or a tap skips the countdown animation. Typing with nothing focused goes to the answer box.

## Adding questions

All questions live in [`data/questions.json`](data/questions.json), a plain array. Add an object, save, and the dev server reloads. Run `npm test` afterwards: the test suite checks every question and tells you exactly what is wrong (a duplicated alias, a score outside 0 to 100, a decoy that is actually a right answer, and so on).

### An open list

```json
{
  "id": "geo-countries-m",
  "category": "Geography",
  "format": "open",
  "prompt": "Name any country beginning with the letter M",
  "detail": "Optional extra line shown under the prompt.",
  "decoys": ["Macau", "Mumbai", "Manitoba"],
  "answers": [
    { "text": "Mexico", "score": 79 },
    { "text": "Myanmar", "score": 8, "aliases": ["Burma"] },
    { "text": "Marshall Islands", "score": 1 }
  ]
}
```

### A board (one answer per clue)

```json
{
  "id": "chem-symbols",
  "category": "Chemistry",
  "format": "clues",
  "prompt": "Here are some chemical symbols. Name the element each one stands for",
  "decoys": ["Bronze", "Steel", "Brass"],
  "clues": [
    { "clue": "Na", "answer": "Sodium", "score": 54 },
    { "clue": "W", "answer": "Tungsten", "score": 16, "aliases": ["Wolfram"] }
  ]
}
```

### Fields

| Field | Meaning |
| --- | --- |
| `id` | Unique identifier. |
| `category` | Shown on screen; also used to pick three different categories for the final. |
| `format` | `open` (free list), `blank` (fill the blank), `clues` (one clue each) or `board` (several hints each). |
| `prompt`, `detail` | The question and an optional explanatory line. |
| `answers` | For `open`: every valid answer as `{ text, score, aliases? }`. |
| `clues` | For the other formats: `{ clue, answer, score, aliases? }`. A `blank` clue must contain `____`. A `board` entry uses `"hints": ["...", "..."]` instead of `clue`. |
| `score` | Whole number from 0 to 100: how many of 100 people gave that answer (or solved that clue). |
| `aliases` | Other accepted ways of writing an answer, e.g. `"UK"` for `"United Kingdom"`. |
| `decoys` | At least three plausible **wrong** answers. Computer teams use them when they slip up, and they are never forgiven as a typo of a right answer (so "Iceland" cannot pass for "Ireland"). |
| `acceptSurname` | Optional. For people: also accept the surname alone when only one answer has it. |
| `exactSpelling` | Optional. For spelling questions: no typos are forgiven. |

Guidelines: give each question 15 to 40 answers (the tests require at least 12, enough for a full round, and boards work best with 16 so each pass gets a fresh set of 8). An `open` question with **three or more zero-point answers** is automatically eligible for the final; the game needs such questions in at least three categories.

## Answer checking

`src/matcher/` decides whether a typed answer counts:

- Case, accents, punctuation and the word "the" are ignored; `&` equals "and", `St` equals "Saint".
- Typos are forgiven in proportion to length: none up to 4 letters, one up to 8, two up to 14, three beyond that. A swap of neighbouring letters counts as one typo.
- The first letter must be right, and numbers must match exactly, so "Henry VII" is never read as "Henry VIII" (roman numerals, digits and words like "the Eighth" are treated alike).
- An exact match always beats a fuzzy one. If a typo is equally close to two answers, the higher-scoring one is taken, so a doubtful typo cannot earn the better score.

## Project layout

```
data/questions.json     the question bank
src/matcher/            normalising and fuzzy matching (pure functions)
src/game/
  machine.ts            the game as a state machine: transition(state, event) -> state
  questions.ts          loads and validates the bank
  ai.ts                 computer opponents (easy / medium / hard)
  commentary.ts         host lines, dealt without repeats
  storage.ts            jackpot, settings and records in localStorage
src/audio/sound.ts      every sound, synthesised with the Web Audio API
src/ui/
  app.ts                controller: state -> screens, timers, computer turns
  components/           score column, reveal stage, confetti, scoreboard, clock
  screens/              setup, round intro, play, summary, final, game over
src/styles/             studio look and responsive layout
tests/                  Vitest suites
```

The state machine is pure: it never touches the DOM, timers, audio or storage, which is why whole games can be simulated in the tests.

```
setup -> roundIntro -> awaitAnswer <-> reveal -> roundSummary
roundSummary -> roundIntro        (tiebreak, next round, next head-to-head question)
roundSummary -> finalIntro -> finalChoose -> finalAnswer -> finalReveal -> gameOver
```

## What I would improve next

- **More questions.** 55 is enough for about ten games before repeats become noticeable. The bank is the easiest thing to grow.
- **Real survey data.** The scores are invented. Scores from an actual poll would make the low answers more surprising.
- **Check the facts periodically.** Some lists are pinned to a date in the prompt (for example "1968 to 2025") so they stay correct; they will need new entries to stay current.
- **Pick the clue you are answering.** On a board, an answer is matched against every clue on show. Tapping a clue first would allow "close but wrong clue" feedback.
- **Named players and pass-the-phone prompts** for groups sharing one device, and online play for teams in different places.
- **A practice mode** that shows the full answer list with scores after each question.
- **Adjustable clock** and a pause button; the clock is fixed at 20 seconds (60 for the final).
- **Automated browser tests in the repo.** I played full games through a scripted browser while building this, but only the unit tests are checked in.
