interface ImportMeta {
  glob(
    pattern: string | string[]
  ): Record<string, () => Promise<unknown>>;
}
