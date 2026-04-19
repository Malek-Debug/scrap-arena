/**
 * WalletManager — Ethereum wallet integration for the OP Guild challenge.
 * Connects MetaMask (or any EIP-1193 wallet), signs a score attestation,
 * and emits events the UI can listen to.
 *
 * Kept intentionally lightweight — no on-chain tx required for jam:
 * we sign a score message with the wallet (gasless, off-chain proof).
 */

import { BrowserProvider, type Eip1193Provider } from "ethers";

export type WalletState =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "connected"; address: string; shortAddress: string }
  | { status: "error"; message: string };

type WalletListener = (state: WalletState) => void;

export class WalletManager {
  private static _instance: WalletManager | null = null;
  static get instance(): WalletManager {
    if (!WalletManager._instance) WalletManager._instance = new WalletManager();
    return WalletManager._instance;
  }

  private _state: WalletState = { status: "disconnected" };
  private _listeners: WalletListener[] = [];
  private _provider: BrowserProvider | null = null;

  get state(): WalletState { return this._state; }
  get isConnected(): boolean { return this._state.status === "connected"; }
  get address(): string | null {
    return this._state.status === "connected" ? this._state.address : null;
  }

  /** Returns true if MetaMask (or an EIP-1193 wallet) is available in this browser. */
  static isAvailable(): boolean {
    return typeof window !== "undefined" && "ethereum" in window;
  }

  on(listener: WalletListener): void {
    this._listeners.push(listener);
  }
  off(listener: WalletListener): void {
    this._listeners = this._listeners.filter(l => l !== listener);
  }
  private _emit(state: WalletState): void {
    this._state = state;
    this._listeners.forEach(l => l(state));
  }

  /** Request wallet connection. Resolves when connected or rejects on error. */
  async connect(): Promise<string> {
    if (!WalletManager.isAvailable()) {
      const msg = "No Ethereum wallet detected. Install MetaMask to connect.";
      this._emit({ status: "error", message: msg });
      throw new Error(msg);
    }

    this._emit({ status: "connecting" });

    try {
      const ethProvider = (window as unknown as { ethereum: Eip1193Provider }).ethereum;
      this._provider = new BrowserProvider(ethProvider);
      await this._provider.send("eth_requestAccounts", []);
      const signer = await this._provider.getSigner();
      const address = await signer.getAddress();
      const shortAddress = `${address.slice(0, 6)}…${address.slice(-4)}`;
      this._emit({ status: "connected", address, shortAddress });
      return address;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Wallet connection failed";
      this._emit({ status: "error", message });
      throw err;
    }
  }

  /**
   * Sign a score attestation with the connected wallet.
   * Returns the signature string (off-chain proof — gasless).
   * Format: "SCRAP ARENA | score: <N> | wave: <W> | address: <addr>"
   */
  async signScore(score: number, wave: number): Promise<string> {
    if (!this._provider) throw new Error("Wallet not connected");

    const signer = await this._provider.getSigner();
    const address = await signer.getAddress();
    const message = `SCRAP ARENA | score: ${score} | wave: ${wave} | player: ${address}`;
    const signature = await signer.signMessage(message);

    const entry = { score, wave, address, signature, timestamp: Date.now() };
    const all: typeof entry[] = JSON.parse(localStorage.getItem("scrapArenaWeb3Scores") ?? "[]");
    all.unshift(entry);
    localStorage.setItem("scrapArenaWeb3Scores", JSON.stringify(all.slice(0, 10)));

    return signature;
  }

  /** Get all locally stored signed score attestations. */
  getSignedScores(): { score: number; wave: number; address: string; signature: string; timestamp: number }[] {
    return JSON.parse(localStorage.getItem("scrapArenaWeb3Scores") ?? "[]");
  }
}
