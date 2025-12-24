export class CatimgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatimgError";
  }
}
