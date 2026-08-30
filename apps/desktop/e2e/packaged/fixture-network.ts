import { Socket } from 'node:net';
import { app, session, type Session } from 'electron';
import { allowsFixtureHost, allowsFixtureUrl, fixtureSocketHost } from './fixture-network-policy';

// oxlint-disable-next-line typescript/unbound-method -- Reflect.apply below preserves the connecting socket.
const connect = Socket.prototype.connect;
Socket.prototype.connect = function (this: Socket, ...args: unknown[]) {
  const host = fixtureSocketHost(args);
  if (!allowsFixtureHost(host)) {
    console.error('YOMITOMO_FIXTURE_NETWORK_BLOCKED', String(host));
    throw new Error('Only loopback sockets are allowed in the reading memory fixture');
  }
  return Reflect.apply(connect, this, args) as Socket;
};

function isolateSession(target: Session) {
  target.webRequest.onBeforeRequest((details, callback) => {
    const allowed = allowsFixtureUrl(details.url);
    if (!allowed) console.error('YOMITOMO_FIXTURE_NETWORK_BLOCKED', new URL(details.url).origin);
    callback({ cancel: !allowed });
  });
}

app.on('session-created', isolateSession);
void app.whenReady().then(() => isolateSession(session.defaultSession));
