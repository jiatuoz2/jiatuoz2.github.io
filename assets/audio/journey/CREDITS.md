# Journey sound effects: sources and licenses

All sounds are recordings from Kenney's audio packs (Kenney Vleugels, https://kenney.nl),
released under **Creative Commons Zero (CC0 1.0)**,
https://creativecommons.org/publicdomain/zero/1.0/ (stated on each pack page and in each
pack's `License.txt`). Credit is not required; it is given here anyway.

Each file was decoded from the pack's `.ogg`, mixed to mono, filtered lightly (high-pass to
remove rumble; the whoosh is also low-passed so it reads as air), trimmed to the sound
itself with short fades, resampled, peak-normalized and saved as 16-bit PCM `.wav`, which
every browser's Web Audio decoder accepts (Safari does not reliably decode Ogg).

| File                | Used for (`JourneySound.play`) | Pack                                                    | Source file                         |
| ------------------- | ------------------------------ | ------------------------------------------------------- | ----------------------------------- |
| `tab-1.wav`         | `tab`                          | [UI Audio](https://kenney.nl/assets/ui-audio)           | `Audio/click1.ogg`                  |
| `tab-2.wav`         | `tab`                          | [UI Audio](https://kenney.nl/assets/ui-audio)           | `Audio/click3.ogg`                  |
| `click.wav`         | `click`                        | [UI Audio](https://kenney.nl/assets/ui-audio)           | `Audio/click4.ogg`                  |
| `zoom.wav`          | `zoom`                         | [UI Audio](https://kenney.nl/assets/ui-audio)           | `Audio/switch13.ogg`                |
| `toggle.wav`        | `toggle`                       | [UI Audio](https://kenney.nl/assets/ui-audio)           | `Audio/switch20.ogg`                |
| `pin-1.wav`         | `pin`                          | [Impact Sounds](https://kenney.nl/assets/impact-sounds) | `Audio/impactGeneric_light_001.ogg` |
| `pin-2.wav`         | `pin`                          | [Impact Sounds](https://kenney.nl/assets/impact-sounds) | `Audio/impactGeneric_light_003.ogg` |
| `whoosh.wav`        | `whoosh`                       | [Casino Audio](https://kenney.nl/assets/casino-audio)   | `Audio/cards-pack-take-out-1.ogg`   |
| `paper-open.wav`    | `paper-open`                   | [Casino Audio](https://kenney.nl/assets/casino-audio)   | `Audio/card-slide-7.ogg`            |
| `paper-close-1.wav` | `paper-close`                  | [Casino Audio](https://kenney.nl/assets/casino-audio)   | `Audio/card-place-1.ogg`            |
| `paper-close-2.wav` | `paper-close`                  | [Casino Audio](https://kenney.nl/assets/casino-audio)   | `Audio/card-place-4.ogg`            |
| `fan.wav`           | `fan`                          | [Casino Audio](https://kenney.nl/assets/casino-audio)   | `Audio/card-fan-1.ogg`              |
| `gather.wav`        | `gather`                       | [Casino Audio](https://kenney.nl/assets/casino-audio)   | `Audio/card-shove-4.ogg`            |

Pack versions: UI Audio ("UI SFX Set"), Impact Sounds 1.0, Casino Audio 1.1, downloaded from
kenney.nl in November 2026.
