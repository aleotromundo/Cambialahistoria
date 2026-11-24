#!/usr/bin/env python3
import json
import math
import random
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'audio' / 'generated'
MANIFEST = ROOT / 'public' / 'audio' / 'manifest.json'
RATE = 22050


def sound_ids():
    data = json.loads((ROOT / 'data' / 'audio.json').read_text())
    found = set()

    def walk(value):
        if isinstance(value, dict):
            if isinstance(value.get('sound'), str):
                found.add(value['sound'])
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(data)
    return sorted(found)


def envelope(index, total, attack, release):
    t = index / max(1, total - 1)
    return min(1.0, t / attack) * min(1.0, (1.0 - t) / release)


def tone(t, frequency, phase=0.0):
    return math.sin(2.0 * math.pi * frequency * t + phase)


def make_sample(name, seconds, seed):
    rng = random.Random(seed)
    total = int(RATE * seconds)
    low = 35.0 + rng.random() * 45.0
    high = 220.0 + rng.random() * 700.0
    impact = name.startswith(('ground_', 'rock_', 'slam_', 'death_', 'body_', 'thunder_', 'lava_erupt'))
    ambient = name.startswith('ambience_') or name.endswith('_loop') or name in {'ember_bed', 'storm_hum', 'storm_fade', 'cave_drip'}
    metallic = any(part in name for part in ('sword', 'bell', 'glass', 'clock', 'coin', 'tally', 'rank', 'ui_'))
    wet = any(part in name for part in ('water', 'bubble', 'lava', 'spit', 'ooze', 'silt'))
    magic = any(part in name for part in ('spell', 'hex', 'wisp', 'portal', 'shadow', 'electric', 'spark', 'brand', 'shimmer', 'storm'))
    creature = any(part in name for part in ('growl', 'snarl', 'howl', 'wolf', 'hound', 'spider', 'brood', 'ghost', 'shade', 'rat_', 'bat_', 'unfinished', 'monster', 'bones'))
    if ambient:
        attack, release = 0.04, 0.04
    elif impact:
        attack, release = 0.002, 0.38
    else:
        attack, release = 0.008, 0.24
    samples = []
    noise = 0.0
    for i in range(total):
        t = i / RATE
        env = envelope(i, total, attack, release)
        noise = noise * 0.96 + (rng.random() * 2.0 - 1.0) * 0.04
        value = 0.0
        if ambient:
            value += 0.25 * tone(t, low)
            value += 0.16 * tone(t, low * 1.51, 0.7)
            value += 0.16 * noise
            if 'wind' in name or 'air' in name or 'gust' in name:
                value += 0.16 * noise * (0.5 + 0.5 * tone(t, 0.19))
            if 'fire' in name or 'ember' in name or 'lava' in name:
                value += 0.14 * abs(noise) * (0.4 + 0.6 * tone(t, 0.73) ** 2)
        else:
            if impact:
                value += 0.72 * math.exp(-t * (8.0 + rng.random() * 8.0)) * tone(t, low)
                value += 0.28 * noise * math.exp(-t * 9.0)
            elif metallic:
                value += 0.52 * tone(t, high) * math.exp(-t * 8.0)
                value += 0.23 * tone(t, high * 1.91) * math.exp(-t * 12.0)
            elif wet:
                value += 0.35 * noise * math.exp(-t * 4.5)
                value += 0.28 * tone(t, high * (1.0 + 0.3 * math.sin(t * 7.0))) * math.exp(-t * 5.0)
            elif magic:
                value += 0.35 * tone(t, low * 2.0 + high * 0.4 * t) * math.exp(-t * 2.4)
                value += 0.23 * tone(t, high * 1.7) * math.exp(-t * 5.0)
                value += 0.15 * noise
            elif creature:
                value += 0.48 * tone(t, low * (1.0 - 0.25 * t)) * math.exp(-t * 2.5)
                value += 0.25 * noise * math.exp(-t * 3.0)
            else:
                value += 0.38 * tone(t, high) * math.exp(-t * 5.0)
                value += 0.22 * noise * math.exp(-t * 5.0)
            if 'whoosh' in name or 'swing' in name or 'flight' in name:
                value += 0.22 * noise * (0.2 + 0.8 * math.sin(math.pi * min(1.0, t / max(seconds, 0.01))))
        if ambient:
            gain = 0.42
        elif impact:
            gain = 0.9
        else:
            gain = 0.62
        if name.endswith('_high') or 'sharp' in name:
            gain *= 0.75
        if name.startswith('ui_'):
            gain *= 0.7
        sample = max(-1.0, min(1.0, value * env * gain))
        samples.append(int(sample * 32767))
    return samples


def write_wav(path, samples):
    with wave.open(str(path), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(b''.join(struct.pack('<h', sample) for sample in samples))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ids = sound_ids()
    manifest = {'sfx': {}, 'voice': {}}
    for index, name in enumerate(ids):
        ambient = name.startswith('ambience_') or name.endswith('_loop') or name in {'ember_bed', 'storm_hum', 'storm_fade', 'cave_drip'}
        seconds = 3.2 if ambient else 0.72
        filename = f'{name}.wav'
        write_wav(OUT / filename, make_sample(name, seconds, 1000 + index * 7919))
        manifest['sfx'][name] = [f'generated/{filename}']
    MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'generated {len(ids)} sounds in {OUT}')
    print(f'wrote {MANIFEST}')


if __name__ == '__main__':
    main()
