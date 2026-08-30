const passwords = new Map<string, string>();

export class Entry {
  private readonly key: string;

  constructor(service: string, account: string) {
    this.key = JSON.stringify([service, account]);
  }

  setPassword(password: string): void {
    passwords.set(this.key, password);
  }

  getPassword(): string | null {
    return passwords.get(this.key) ?? null;
  }

  deletePassword(): boolean {
    return passwords.delete(this.key);
  }
}
