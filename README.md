# Double Player

A 2-player 3D wireframe arena brawler that runs in the browser. **(Touchscreen compatible)**: play on a computer or an iPad.

Everyone who opens the site appears as a glowing wireframe body in a big neon room. The room has two pressure pads. When two players stand on them at the same time, a **3, 2, 1** countdown starts. Then weapons rain down from the ceiling, and the two players fight until one of them hits 0 health.

## The arena

- **Maze walls** rise out of the floor and sink back down. Every 7 seconds a new set comes up, making a fresh maze. Raised walls are **cover**: shots, swings and poop all stop at the wall. You can also land on top of a wall, and you'll drop back to the floor when it sinks. A glowing slot in the floor shows where each wall lives, and it flashes red while a wall is rising.
- **Jump pads** sit in two corners. Step on one and it flings you about 29m into the air, out over the arena. You get only a little steering on the way down.
- **Jumping** is high: about 4.4m, enough to see over the action, but not over a raised wall.

## Rules

- Each player starts with **100 health**.
- Weapons fall from hatches in the ceiling. **More fall as the match goes on**: the gap between drops gets shorter and each drop brings more weapons.
- Every weapon can be used **3 times**, then it breaks and disappears.
- Damage depends on the weapon. A pool noodle does 2 and a chainsaw does 45.
- Anyone else who joins can walk around and watch while a match is on.
- **Win streaks make you muscular.** Each win in a row adds a muscle level, up to **5**: bigger arms, chest, shoulders and legs. At level 5 you start to **glow**. Losing a match (or leaving) resets you to level 0.

## Weapons (27)

| Weapon | Damage | Type |
|---|---|---|
| Water Pistol | 1 | spray |
| Pool Noodle | 2 | melee |
| Foam Bat | 3 | melee |
| Rubber Chicken | 4 | melee |
| Baguette | 5 | melee |
| Dead Fish | 6 | melee |
| Tennis Racket | 7 | melee |
| Umbrella | 8 | melee |
| Frying Pan | 12 | melee |
| Throwing Knives | 12 | ranged |
| Hockey Stick | 13 | melee |
| Boomerang | 14 | ranged |
| Baseball Bat | 15 | melee |
| Crowbar | 16 | melee |
| Pistol | 18 | ranged |
| Trident | 25 | melee (long reach) |
| Katana | 28 | melee |
| Crossbow | 30 | ranged |
| Flamethrower | 30 | spray |
| Battle Axe | 32 | melee |
| Flaming Sword | 35 | melee |
| Shotgun | 35 | ranged (short range, wide spread) |
| Warhammer | 38 | melee |
| Plasma Blade | 40 | melee |
| Chainsaw | 45 | melee |
| Sniper Rifle | 55 | ranged |
| Rocket Launcher | 60 | ranged + splash |

### ★ Special weapons

Rare drops that glow from across the room: a tall colored light beam, sparkles, and a gold name tag. Their drop chance grows as the match goes on, and at most 2 are on the floor at once.

| Special | Power | Uses |
|---|---|---|
| Berzerk Helmet | You wear it. Attack to launch at your enemy from up to 45m away, then punch like crazy for 20 damage | 3 |
| Poop Bazooka | Machine-guns dozens of poop emojis for 25 damage | 3 |
| Dragon Sword | A blade coming out of a dragon's jaws. 50 damage | 3 |
| fake0h Fire Spear | A guided missile. Throw it from anywhere: it hunts your opponent down and always kills | 1 |
| Birthday Cake | Eat it to restore all your health | 1 |

Silly weapons drop often and deadly ones are rare. To change damage, range, cooldown, or how often a weapon drops, edit `shared/weapons.js`.

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Mouse | Look / aim |
| Shift | Sprint |
| Space | Jump |
| E | Pick up weapon |
| Left click | Attack |
| Q | Drop weapon |
| Esc | Release mouse |

### iPad / touch screens

On-screen controls show up automatically on touch devices.

| Control | Action |
|---|---|
| Left stick | Move (push all the way to run) |
| Swipe on the right side | Look / aim |
| ATTACK | Attack (hold to keep attacking) |
| GRAB | Pick up a weapon (glows when one is in reach) |
| JUMP / DROP | Jump / drop your weapon |

Tip: in Safari, tap Share → **Add to Home Screen** to play full screen.

## Run it locally

You need Node.js 18 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000 in two browser windows, or have a friend on your network open `http://<your-ip>:3000`.

## Put it online

The game needs a Node server for WebSockets, so a static host like GitHub Pages won't work. Any Node host will:

- **Render**: New → Web Service → connect this repo. Build command `npm install`, start command `npm start`.
- **Railway / Fly.io**: deploy the repo as-is. The server listens on `$PORT`.

## How it's built

- `server.js`: serves the page and runs the game over WebSockets. It decides pad presses, the countdown, weapon drops, pickups, hits, and health, so players can't cheat their own health.
- `shared/weapons.js`: weapon stats and arena layout, shared by server and client.
- `public/js/main.js`: Three.js scene, controls, networking, effects, HUD.
- `public/js/body.js`: the wireframe body with capsule-shaped limbs and walk/attack animation.
- `public/js/weaponMeshes.js`: a low-poly model for every weapon.
