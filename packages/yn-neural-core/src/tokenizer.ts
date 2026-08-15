export type TokenizerConfig = { vocab: readonly string[]; unkToken?: string; bosToken?: string; eosToken?: string };

export class BasicTokenizer {
  private readonly tokenToId = new Map<string, number>();
  private readonly unkId: number;
  readonly bosId?: number;
  readonly eosId?: number;

  constructor(private readonly config: TokenizerConfig) {
    config.vocab.forEach((token, id) => this.tokenToId.set(token, id));
    const unk = config.unkToken ?? "<unk>";
    const id = this.tokenToId.get(unk);
    if (id === undefined) throw new Error(`Tokenizer vocabulary must contain ${unk}`);
    this.unkId = id;
    if (config.bosToken) this.bosId = this.tokenToId.get(config.bosToken);
    if (config.eosToken) this.eosId = this.tokenToId.get(config.eosToken);
  }

  encode(text: string, addSpecialTokens = true): number[] {
    const pieces = text.trim().length ? text.trim().split(/\s+/) : [];
    const ids = pieces.map(piece => this.tokenToId.get(piece) ?? this.unkId);
    if (addSpecialTokens && this.bosId !== undefined) ids.unshift(this.bosId);
    if (addSpecialTokens && this.eosId !== undefined) ids.push(this.eosId);
    return ids;
  }

  decode(ids: readonly number[]): string {
    return ids.map(id => this.config.vocab[id] ?? this.config.unkToken ?? "<unk>").filter(token => token !== this.config.bosToken && token !== this.config.eosToken).join(" ");
  }

  vocabSize(): number { return this.config.vocab.length; }
}
