const passwords = new Map<string, string>();

export class AsyncEntry {
  private readonly key: string;

  constructor(service: string, account: string) {
    this.key = JSON.stringify([service, account]);
  }

  async setPassword(password: string): Promise<void> {
    passwords.set(this.key, password);
  }

  async getPassword(): Promise<string | null> {
    return passwords.get(this.key) ?? null;
  }

  async deletePassword(): Promise<boolean> {
    return passwords.delete(this.key);
  }
}
