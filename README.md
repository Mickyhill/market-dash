# Market Dash

A three.js game for start.ng. You play as your own start.ng character in a busy market and grab as many coins as you can in 60 seconds. Gems are worth 3.

- Signed-in players appear with their own character, name and account, including accessories such as glasses.
- Guests get the guest look and a sign-in link.
- Scores and the leaderboard are saved through start.ng.

## Controls

- Computer: W A S D or the arrow keys.
- Phone: drag a finger to steer.

## Run locally

It is a static site with no build step.

```
python -m http.server 8000
```

Open http://localhost:8000. Locally, start.ng does not answer, so the game uses the default character. To try a style, add `?style=` on localhost, for example:

```
http://localhost:8000/?style={"accessory":"glasses","hat":"crown"}
```

## Files

- `index.html`, `style.css`: page and look
- `js/game.js`: game
- `js/character.js`: builds the character from a start.ng style
- `js/startng.js`: start.ng connection (player, score, leaderboard)
- `lib/`: three.js 0.186.1 (MIT, see `THREE-LICENSE.txt`)
- `startng.json`: leaderboard settings
- `cover.png`: game cover
