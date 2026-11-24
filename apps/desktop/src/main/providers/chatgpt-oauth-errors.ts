export class ChatGptAuthRequiredError extends Error {
  constructor() {
    super('ChatGPT sign-in is required');
    this.name = 'ChatGptAuthRequiredError';
  }
}

export class ChatGptReauthRequiredError extends Error {
  constructor(message = 'ChatGPT session expired; sign in again') {
    super(message);
    this.name = 'ChatGptReauthRequiredError';
  }
}
