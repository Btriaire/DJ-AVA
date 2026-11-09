# Real ambience recordings

The Acoustique module plays real recordings when these files exist, and falls back to its
synthesised sounds when one is missing. Drop the files here with these exact names, then run
`sh mac/install.sh` to bundle them into the app.

| File              | Used for                                  | Suggested source (CC0, BigSoundBank)                     |
|-------------------|-------------------------------------------|----------------------------------------------------------|
| `rain.ogg`        | Rain bed, looped with random offsets      | Summer Rain on Terrace (s1019), OGG 11.6 MB              |
| `wind.ogg`        | Wind bed                                  | Strong wind 4 (s0154), OGG 1.4 MB                        |
| `bowl-strike.ogg` | Bowl strikes, retuned to the chosen key   | Tibetan Bowl Struck #1 (s1110), OGG 662 KB               |
| `bowl-sing.ogg`   | Sustained pad, retuned to the chosen key  | Tibetan bowl singing (s1109), OGG 1.1 MB                 |

Any OGG, WAV or MP3 renamed to the `.ogg` name above works if the browser can decode it.
Levels are normalised automatically; the bowl pitch is detected from the file.
