/**
 * YouTube Playables SDK type declarations.
 * https://developers.google.com/youtube/gaming/playables/reference/sdk
 */
declare namespace ytgame {
  namespace game {
    /** Call as soon as the loading screen first renders (first frame painted). */
    function firstFrameReady(): void;
    /** Call when the game is fully ready for user interaction (e.g. title screen shown). */
    function gameReady(): void;
    /** Save game data (cloud save). Max 10 KB JSON string. */
    function saveData(data: string): Promise<void>;
    /** Load saved game data. Returns null if none saved. */
    function loadData(): Promise<string | null>;
  }

  namespace engagement {
    /**
     * Submit the player's current score. Call whenever the score updates.
     * YouTube surfaces the best score per player.
     */
    function sendScore(params: { value: number }): void;
  }

  namespace system {
    /** Register a handler called when YouTube pauses the game (app background, etc). */
    function onPause(callback: () => void): void;
    /** Register a handler called when YouTube resumes the game. */
    function onResume(callback: () => void): void;
    /** Register a handler called when audio volume changes (0–1). */
    function onAudioVolumeChange(callback: (params: { volume: number }) => void): void;
  }
}
