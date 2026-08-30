import { app } from 'electron';
import { prepareFixtureProfile } from './fixture-profile';

try {
  const profile = prepareFixtureProfile(process.env.YOMITOMO_USER_DATA_DIR);
  app.setPath('appData', profile.appData);
  app.setPath('userData', profile.userData);
  app.setPath('sessionData', profile.userData);
  console.info('YOMITOMO_READING_MEMORY_FIXTURE_PROFILE', JSON.stringify(profile));
} catch (error) {
  console.error('Fixture application refused startup', error);
  app.exit(1);
  throw error;
}
