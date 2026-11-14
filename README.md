# Double Player

A 2-to-4-player 3D wireframe arena brawler that runs in the browser. **(Touchscreen compatible)**: play on a computer or an iPad.

Everyone who opens the site appears as a glowing wireframe body in a big neon room split into four quadrants. Two corners hold games:

- **4xPVP** (southwest corner, neon-green pads, big 4xPVP sign): the weapons free-for-all described below.
- **Say Cheese** (northeast corner, yellow pads, big smiley face): a face-making game played with your camera. See below.

**Lobby vs. game:** the pressure pads and corner signs only show in the lobby (and during the 3-second countdown, so people can still hop on). Once a game starts they disappear, and the glowing outline of the room turns red for 4xPVP or yellow for Say Cheese.

The 4xPVP corner has **four pressure pads**. When 2 or more players stand on them, a **3, 2, 1** countdown starts, and anyone who hops on a free pad before it ends joins in. Then weapons rain down from the ceiling and it's a free-for-all. Knocked-out players lie down and watch, and the **last one standing wins**.

## The arena

- **Maze walls** stay sunk in the floor until someone grabs the rare **Wall Breaker**. Then they rise for **30 seconds**, and every 7 seconds a new set comes up, making a fresh maze. Raised walls are **cover**: shots, swings and poop all stop at the wall. You can also land on top of a wall, and you'll drop back to the floor when it sinks. A glowing slot in the floor shows where each wall lives, and it flashes red while a wall is rising.
- **Jump pads** (four green ones) slowly roam around the arena on an inner and an outer track. Step on one and it flings you about 29m into the air, out over the arena. You get only a little steering on the way down.
- **Jumping** is high: about 4.4m, enough to see over the action, but not over a raised wall.

## Say Cheese

2 to 4 players stand on the yellow pads. When the countdown ends:

1. Each player's browser asks to use their camera, and the players line up four across facing the back wall (the south wall, opposite the admin panel).
2. A giant yellow smiley appears on the back wall and calls out an emotion, making that face itself: happy, scared, funny, crazy, excited, sorry, sleepy, and 26 more (33 total).
3. A 10 to 1 countdown runs while every player's camera rates their face live from 0 to 100. Everyone sees everyone's ratings.
4. Then **FLASH**: the best face wins the round, and that player's snapshot from their best moment goes up on the back wall.
5. About 3 seconds later the next round starts. The first player to **3 wins** takes the game. If two players are tied for the lead, rounds continue until one player leads alone.

Face reading uses Google's MediaPipe face tracker, which runs inside each player's own browser. Live video never leaves the device: only the round winner's snapshot is sent to the other players. The server downloads the face model once (from Google) and serves it to players. Players without a camera can still join and watch, but they can't score.

To try Say Cheese without a camera (for testing), open the site with `?fakeface=1` on the end of the address. It uses simulated face scores.

The emotions and what the camera looks for are in `shared/emotions.js`.

## Weapon wall

The north wall (around the admin panel) shows every weapon in the game in its own frame, with its name and damage. Specials have gold frames.

## Admin panel

A glowing **ADMIN** panel hangs on the north wall. Walk up to it and press **E**, **left click**, or on a touchscreen tap **GRAB** (it glows when you're close enough) to open the number pad. The keypad has big buttons that work with touch, mouse, or your keyboard's number keys. The right code (**812**) unlocks it. The server checks the code, and you have to be standing at the panel to enter it:

- **Admin Mode** (on/off switch): while it's on, aim at any weapon on the weapon wall and click it (or tap it on a touchscreen) to take that weapon. Instant specials like the Bomb or Lava Bucket go off right away.

To change the code without editing the code, set the `ADMIN_CODE` environment variable on Render.

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

Rare drops that glow from across the room: a tall colored light beam, sparkles, and a gold name tag. Their drop chance grows as the match goes on, and at most 3 are on the floor at once.

| Special | Power | Uses |
|---|---|---|
| Berzerk Helmet | You wear it. Attack to launch at your enemy from up to 45m away, then punch like crazy for 20 damage | 3 |
| Poop Bazooka | Machine-guns dozens of poop emojis for 25 damage | 3 |
| Dragon Sword | A blade coming out of a dragon's jaws. 50 damage | 3 |
| fake0h Fire Spear | A guided missile. Throw it from anywhere: it hunts your opponent down and always kills | 1 |
| Birthday Cake | Eat it to restore all your health | 1 |
| Wall Breaker (rarest) | Works the moment you grab it: raises the maze walls for 30 seconds | instant |
| Bomb | Works the moment you grab it: 100 bombs rain from the ceiling, blink for 3 seconds, then explode for 50 damage each. Red rings show each blast zone. They hit **everyone**, including whoever grabbed it | instant |
| Lava Bucket | About half the floor tiles glow orange for 2 seconds, then turn to lava for 20 seconds: 10 damage per second to anyone standing in it (including you). Jump or stand on a wall to stay safe | instant |
| Robot Swarm | 10 robots climb out of the floor and hunt the other players for 20 seconds: 10 damage per hit | instant |
| Invisibility Cloak | You disappear from everyone else's screen for 20 seconds | instant |

Silly weapons drop often and deadly ones are rare. To change damage, range, cooldown, or how often a weapon drops, edit `shared/weapons.js`.

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Mouse | Look / aim |
| Shift | Sprint |
| Space | Jump |
| Hold right mouse | Run forward |
| Left click | Pick up a weapon when you're next to one, otherwise attack |
| E | Pick up weapon / use the admin panel |
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
