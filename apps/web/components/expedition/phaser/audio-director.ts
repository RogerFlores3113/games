/**
 * Plays Expedition's music, ambience and effects. The director only
 * observes: scene changes pick the loops, view changes become cues through
 * `cuesFor`, and every sound level comes from the audio prefs. It never
 * touches game state, and every failure path (no audio device, blocked
 * autoplay, a file that 404s) degrades to silence.
 */
import Phaser from "phaser";
import type { ExpeditionSceneStore } from "../../../lib/expedition/expedition-scene-store";
import { audioPrefsStore, effectiveVolume, type AudioPrefsStore } from "../../../lib/expedition/audio/audio-prefs";
import { cuesFor } from "../../../lib/expedition/audio/cues";
import { playCue, setCueSink } from "../../../lib/expedition/audio/cue-bus";
import { LOOP_IDS, loopsForScene, SOUND_BANK, SOUND_IDS, type LoopId, type SfxId } from "../../../lib/expedition/audio/sound-bank";

const LOADER_SCENE_KEY = "audio-loader";

type Sound = Phaser.Sound.BaseSound;

export interface AudioDirector {
  destroy(): void;
}

export function createAudioDirector(
  game: Phaser.Game,
  store: ExpeditionSceneStore,
  prefs: AudioPrefsStore = audioPrefsStore,
): AudioDirector {
  const manager = game.sound;
  const loops = new Map<LoopId, Sound>();
  let loaded = false;
  let destroyed = false;
  let waitingForUnlock = false;
  let wanted: readonly LoopId[] = loopsForScene(store.getState().sceneKey);

  const hasAudio = (id: string): boolean => game.cache.audio.exists(id);
  const isLocked = (): boolean => (manager as { locked?: boolean }).locked !== false;

  function loopVolume(id: LoopId): number {
    const spec = SOUND_BANK[id];
    return effectiveVolume(prefs.getState(), spec.channel, spec.volume);
  }

  function syncLoops(): void {
    if (!loaded || destroyed) return;
    if (isLocked()) {
      if (!waitingForUnlock) {
        waitingForUnlock = true;
        manager.once(Phaser.Sound.Events.UNLOCKED, () => {
          waitingForUnlock = false;
          syncLoops();
        });
      }
      return;
    }
    for (const id of LOOP_IDS) {
      const running = loops.get(id);
      if (!wanted.includes(id)) {
        if (running) {
          running.stop();
          running.destroy();
          loops.delete(id);
        }
        continue;
      }
      if (running) {
        (running as Sound & { setVolume(v: number): unknown }).setVolume(loopVolume(id));
      } else if (hasAudio(id)) {
        const sound = manager.add(id, { loop: true, volume: loopVolume(id) });
        sound.play();
        loops.set(id, sound);
      }
    }
  }

  function playOneShot(id: SfxId): void {
    if (!loaded || destroyed || isLocked() || !hasAudio(id)) return;
    const spec = SOUND_BANK[id];
    const volume = effectiveVolume(prefs.getState(), spec.channel, spec.volume);
    if (volume > 0) manager.play(id, { volume });
  }

  class AudioLoaderScene extends Phaser.Scene {
    constructor() {
      super({ key: LOADER_SCENE_KEY });
    }
    preload(): void {
      this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {});
      for (const id of SOUND_IDS) this.load.audio(id, [...SOUND_BANK[id].files]);
    }
    create(): void {
      loaded = true;
      syncLoops();
    }
  }

  try {
    game.scene.add(LOADER_SCENE_KEY, AudioLoaderScene, true);
  } catch {
    // no audio, no problem
  }
  setCueSink(playOneShot);

  const unsubscribeStore = store.subscribe((next, prev) => {
    if (next.sceneKey !== prev.sceneKey) {
      wanted = loopsForScene(next.sceneKey);
      syncLoops();
    }
    if (next.server?.game !== prev.server?.game) {
      for (const cue of cuesFor(prev.server?.game ?? null, next.server?.game ?? null)) playCue(cue);
    }
  });
  const unsubscribePrefs = prefs.subscribe(syncLoops);

  return {
    destroy() {
      destroyed = true;
      unsubscribeStore();
      unsubscribePrefs();
      setCueSink(null);
      loops.clear();
    },
  };
}
