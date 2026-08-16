# Hermes Avatar Pet

Animated avatar / desktop companion plugin for **Hermes Desktop**.

The goal is to give Hermes a small visual character that reacts to the agent state instead of remaining a static UI element.

> Status: experimental community prototype. The visual controls work; automatic Hermes lifecycle/STT/TTS integration is still being improved.

## Current features

- IDLE animation (8 frames)
- BLINK animation (6 frames)
- TALK animation (6 frames)
- 12 expression cells
- 10 action poses
- PET interaction (8 frames)
- separate FX atlas
- pane + status-bar popup
- Canvas-based fixed-cell rendering to avoid visible atlas scrolling
- manual controls for testing expressions/actions

## Action poses

1. Wave
2. Point
3. OK
4. Thumbs up
5. Cute / playful
6. Hug
7. Sleep
8. Processing
9. Focus
10. Agent mode

## Atlas layout

Character atlas: `1152 × 624`, `12 × 6` cells, `96 × 104` px per cell.

| Row | State | Frames |
|---|---|---:|
| 0 | IDLE | 8 |
| 1 | BLINK | 6 |
| 2 | TALK | 6 |
| 3 | EXPRESSIONS | 12 |
| 4 | ACTIONS | 10 |
| 5 | PET | 8 |

FX atlas: `1248 × 104`, 13 cells, `96 × 104` px each.

## Install

Hermes Desktop disk plugins live under `$HERMES_HOME/desktop-plugins/`.

Create the plugin folder **`hermes-avatar-v5`** and copy these files into it:

```text
hermes-avatar-v5/
├── plugin.js
├── NIVO_CHARACTER_ATLAS_v2.png
└── NIVO_FX_ATLAS_v2.png
```

Typical paths:

```text
Windows: %USERPROFILE%\.hermes\desktop-plugins\hermes-avatar-v5\
Linux/macOS: ~/.hermes/desktop-plugins/hermes-avatar-v5/
```

Then reload Desktop plugins from Hermes Desktop.

## Goal / roadmap

The next goal is stable automatic reactions to Hermes lifecycle state:

- STT/listening → attentive pose
- transcription → processing/thinking
- model generation → thinking
- TTS/read-aloud → TALK
- tool execution → processing/scan
- subagent/delegation → focus/agent mode
- success → OK / thumbs-up / smile
- error → sad / glitch
- long idle → sleep

The main missing piece is a stable public Desktop Plugin SDK signal for voice playback / voice-conversation state and other high-level semantic lifecycle states.

## Help wanted

Feedback and contributions are welcome, especially around:

- reliable Hermes STT/TTS hooks
- tool/subagent/model lifecycle triggers
- smoother sprite/state transitions
- optional audio-reactive mouth animation
- packaging, versioning and installation
- testing across Hermes Desktop platforms

Upstream feature request / discussion:

- https://github.com/NousResearch/hermes-agent/issues/87574
[hermes-avatar-NIVO-V5_1-ASSET-FIX.zip](https://github.com/user-attachments/files/31114765/hermes-avatar-NIVO-V5_1-ASSET-FIX.zip)

<img width="1152" height="624" alt="Image" src="https://github.com/user-attachments/assets/7e787997-1f9a-449b-bb47-6caefb0398c7" />

<img width="1152" height="624" alt="Image" src="https://github.com/user-attachments/assets/78550540-8b0a-461b-a220-d30c419cf3e0" />

https://github.com/user-attachments/assets/8fff9112-67e9-42a4-843c-341a044fc843

## Files

- `plugin.js` — Hermes Desktop plugin
- `NIVO_CHARACTER_ATLAS_v2.png` — transparent character sprite atlas
- `NIVO_FX_ATLAS_v2.png` — transparent FX sprite atlas

## License

MIT — see [LICENSE](LICENSE).
